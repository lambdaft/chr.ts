# Redis in CHR.ts — Research Report

**Scope:** `CHR.ts/` (`chr-ts@0.1.0`, TypeScript-first CHR engine). No Redis dependency today.
**Question:** where / whether / how to use Redis with `CHREngine` / `ConstraintStore` / `PropagationHistory`.
**Verdict:** Do **not** put Redis in the fixpoint hot-loop. Use Redis at the edges: persistence, coordination, host-function integration. Keep `ConstraintStore` in-memory for matching.

---

## 1. Current architecture (why this matters)

| Component | File | Today |
|---|---|---|
| `ConstraintStore` | `src/core/store.ts` | `Map<number,ConstraintRecord> byId` + `Map<string,Set<number>> byFunctor` (`name/arity`), sync `add/remove/lookup`, `lookupCache` cleared on mutation, sorted-by-ID iteration for determinism |
| `ConstraintRecord` | `src/core/constraint.ts` | `{id, name, arity, args: unknown[], metadata?, toString()}` via `createConstraint`, `createFunctor(name,arity)` = `name/arity` |
| `PropagationHistory` | `src/core/history.ts` | `Map<ruleName, Set<hash>>`, `hashIds = sortedIds.join(':')`, order-independent, never evicted, `clear()` on `engine.clear()` |
| `CHREngine` | `src/core/engine.ts` | `assert()/assertMany()` → `runToFixpointSafe()` → `fireNextRule()` (priority-sorted) → `findMatchRecursive()` + `evaluateGuards()` + `applyRule()`. **NOT thread-safe**, single async context. States `empty→ready→running→error`. `store`/`history` are `readonly` public fields. |
| Host interop | `src/core/host.ts`, `engine.ts:HostModule` | `registerFunction/registerAction/registerHostModule`, `import host Name` in `.chr`, `defineHostModule()`. Guards must be pure; actions for side-effects. `hostFunctionTimeout` supported. |
| Browser | `src/browser-engine.ts` | Same engine minus `load()` (`node:fs`). Any Redis adapter must not break browser build. |
| Serialization | `store.snapshot()/toJSON()`, `history.snapshot()`, `EngineSnapshot` | Already JSON-friendly: `StoreSnapshotEntry {id,name,arity,args}[]`. `args: unknown[]` is the hard part. |

Key constraint: `store.lookup()` is **synchronous** and called deep inside `findMatchRecursive` (Cartesian product over heads). Redis is async + network RTT. Making the store async forces `lookup/lookupByArg/find/forEach` + engine matching to go async — a breaking refactor.

---

## 2. What Redis could give CHR.ts

1. **Durability:** survive restart; `snapshot()` → Redis JSON, restore on boot.
2. **Scale-out / sharing:** multiple Node processes / playground servers share one logical store.
3. **Coordination:** distributed lock + `Streams`/`PubSub` so two engines don't fire the same propagation twice.
4. **Large stores:** spill cold functors to Redis when `byId` grows beyond RAM.
5. **Host-function cache:** memoize expensive guards (`lookup`, `temporal.ts` ops) in Redis with TTL.
6. **Observability:** `onRuleFired` trace → Redis Stream for audit; playground `/api/*` already server-based.

What Redis does **not** fix: rule-match complexity (still Cartesian search), guard purity, single-engine determinism.

---

## 3. Integration patterns (ranked)

### P0 — Host-module Redis (no core change, RECOMMENDED start)

Expose Redis only via `functions`/`actions`. Engine stays untouched, browser build unaffected.

```chr
functions redis_get/1, redis_cached_compute/1;
actions redis_publish/1, redis_set/2;
evt @ sensor(X) ==> redis_cached_compute(X) | alert(X);
```

```ts
import { defineHostModule } from 'chr-ts';
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);
const redisHost = defineHostModule({
  functions: {
    redis_get: async (_ctx, key) => await redis.get(String(key)),
    redis_cached_compute: async (_ctx, x) => {
      const k = `chr:cache:${JSON.stringify(x)}`;
      const hit = await redis.get(k);
      if (hit) return JSON.parse(hit);
      const v = expensive(x);
      await redis.set(k, JSON.stringify(v), 'EX', 300);
      return v;
    }
  },
  actions: {
    redis_publish: async ({args}) => { await redis.publish('chr:events', JSON.stringify(args[0])); },
    redis_set: async ({args}) => { await redis.set(String(args[0]), JSON.stringify(args[1])); }
  }
});
engine.registerHostModule('redis', redisHost);
```

Pros: 1-day work, opt-in, honors guard/action split, works with `strictHostDeclarations`.
Cons: no shared store semantics; each engine still has private fixpoint.

### P1 — Snapshot persistence (write-through / write-behind)

Persist `engine.snapshot()` on `onRuleFired` (debounced) or after `assertMany`; restore via `store.add()` replay.

```ts
await redis.set('chr:snap:v1', JSON.stringify(engine.snapshot()));
// restore:
const snap = JSON.parse(await redis.get('chr:snap:v1'));
for (const c of snap.constraints) await engine.assert(c.name, c.args);
```

Schema suggestion: `chr:{ns}:store` (JSON array), `chr:{ns}:history` (hash rule→hashes), `chr:{ns}:meta` (nextId, rules hash). Use pipeline + `EX` versioning.
Pros: crash recovery, playground multi-instance.
Cons: replay re-fires rules unless history also restored; ID stability needs care (`nextId` resets to 1 on empty — must preserve max ID).

### P2 — Full `RedisConstraintStore` adapter (high cost, generally NOT recommended for hot loop)

Implement same surface (`add/remove/lookup/lookupByArg/snapshot/...`) backed by:

* `chr:{ns}:c:{id}` Hash → `{name, arity, argsJSON, metaJSON}`
* `chr:{ns}:f:{functor}` Set → IDs
* `chr:{ns}:nextId` String counter (`INCR`)
* local `lookupCache` retained + Redis pipelining

Problem: every `findMatchRecursive` candidate scan becomes 1+ RTT (0.5–2 ms). 10k firings → 10–40 s vs <100 ms in-memory. Fix requires Lua-side matching (reimplement `matchPattern` + guard eval in Lua — defeats TS host functions) or batched prefetch per functor.

Only viable if: store >> RAM, or strict multi-writer sharing required. Even then prefer P3.

### P3 — Hot in-memory + Redis coordination (best distributed design)

Keep `ConstraintStore` local; use Redis for locks + events:

* `SET chr:{ns}:lock ASSERT -- NX PX 5000` around `assertMany` / fixpoint.
* `XADD chr:{ns}:commits * rule ... ids ...` on `onRuleFired`; peers `XREAD` and apply remote adds/removes as local `assert` (with history dedup).
* `PropagationHistory.has/add` mirrored via `SISADD/SISMEMBER chr:{ns}:hist:{rule} hash` (`SETNX` semantics prevent double-fire across workers).

Preserves determinism per-engine, adds eventual consistency across engines.

### P4 — Cache `lookupByArg` / `lookup` results

`store.lookupByArg(name,arity,idx,val)` is already the fast path (e.g. sequence-ID indexing per README telemetry). Cache functor result sets in Redis with short TTL + invalidation on `onAdd/onRemove` hooks. Useful only for read-heavy guards using `lookup/lookupOne` builtins.

---

## 4. Serialization & correctness notes

* `args: unknown[]` — need tagged JSON (numbers/strings/bools/null/arrays/plain objects safe; `Date/BigInt/Uint8Array/class instances/functions` need custom codec). Reject or stringify functions; `temporal.ts` types need explicit `toJSON/fromJSON`.
* IDs: Redis `INCR` diverges from `nextId` reset-on-empty invariant (`strict` mode asserts `nextId===maxId+1`). Persist/restore `nextId` explicitly.
* Determinism: `lookup()` returns ID-sorted arrays; Redis `SMEMBERS` is unordered — must sort after fetch.
* History growth: never evicted today; moving to Redis without TTL risks unbounded memory — add per-rule `EXPIRE` / trim.
* Browser: `ioredis`/`node-redis` must stay optional peer dep behind `registerHostModule`, never imported by `browser-entry.ts`.

---

## 5. Performance expectation

| Design | Fixpoint cost | Notes |
|---|---|---|
| In-memory (today) | ~µs per lookup | Baseline, deterministic |
| P0/P1/P3 (edge use) | +0–2 RTT per `assert`, not per match | Negligible if batched |
| P2 naive (Redis per lookup) | +1 RTT per candidate → 100–1000× slower | Kills `maxRuleFirings:10000` workloads |
| P2 with Lua/prefetch | ~1 RTT per functor per firing | Complex, still slower, breaks host guards |

Rule of thumb: **Redis RTT dominates CHR matching.** Keep matching local.

---

## 6. Recommended roadmap

* **Phase 0 (now, ~1 day):** `examples/redis/redis-host.ts` + `.chr` demo using P0. Add `ioredis` as optional dev/peer dep only in example, not `chr-ts` core. Document `REDIS_URL`, TTL, guard-purity rules.
* **Phase 1:** snapshot save/restore helpers (`saveSnapshot(redis,ns) / loadSnapshot(redis,ns)`) + test with `node:test`. Handle `nextId` + history restore.
* **Phase 2 (if needed):** `RedisCoordination` helper (Redlock + Streams + `onRuleFired` publisher). No `ConstraintStore` API break.
* **Phase 3 (only on demand):** async store interface (`AsyncConstraintStore`) + opt-in `RedisConstraintStore`. Requires `findMatch` async refactor + perf proof.

Do not add `redis` to `CHR.ts/package.json:dependencies` (currently only `temporal.ts` + zero runtime deps claim in README). Keep it optional.

---

## 7. Minimal prototype checklist

```bash
# per CHR.ts README + Redis
npm install && npm run build
npm i -D ioredis
redis-server --daemonize yes  # or docker run -p 6379:6379 redis:7
npm test && npm run typecheck
```

Success criteria: P0 demo asserts 1k constraints, fixpoint time within 10% of baseline; snapshot round-trip preserves `expect(name,args).exists()`; no `browser-engine` import of Redis.

---

## 8. Risks / when NOT to use Redis

* Single-process, <100k constraints, no sharing need → in-memory wins on every axis.
* Guards calling Redis per candidate → latency explosion + non-determinism (value changes mid-fixpoint). Cache + keep guards pure.
* Engine `error` state + distributed partial failure → need idempotent replays; `CHREngine` is not transactional.
* License/ops overhead if only need durability → plain file `snapshot.json` via existing `load()` is simpler.

Bottom line: treat Redis as **persistence + pub/sub fabric around CHR.ts**, not as a replacement for `ConstraintStore`'s `byId/byFunctor` indexes.
