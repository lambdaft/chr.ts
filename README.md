# CHR.ts

`CHR.ts` is a TypeScript-first CHR (Constraint Handling Rules) engine designed as a robust successor to the original CHR.js prototype.

The design keeps the spirit of CHR intact:

- declarative rule heads,
- explicit propagation, simplification, and simpagation rules,
- a first-class constraint store,
- propagation history,
- deterministic host-language integration.

It does **not** carry forward the most fragile parts of the original CHR.js implementation, especially runtime `eval`, ambient scope injection, and split JIT/AOT semantics.

## Features at a Glance

- Three standard rule forms: propagation (`==>`), simplification (`<=>`), simpagation (`\ <=>`)
- Opt-in logical variable unification via the `unify` keyword
- Explicit, typed TypeScript host interop (`defineHostModule`, `registerHost`, `import host`)
- 22 built-in host functions (comparisons, arithmetic, strings, type checks, `allDifferent`, `in`, `lookup`, `lookupOne`)
- Constraint query functions (`lookup`, `lookupOne`) in guards
- In-place constraint update (`<=`) and let bindings in rule bodies
- Multi-head join, repeated-variable matching, anonymous `_` wildcard
- Propagation history with order-independent hashing (loop prevention)
- Rule priority (higher fires first), rule-fire tracing with timing
- Engine state machine (`empty → ready → running → error`)
- Optional host function timeout for async safety
- Module extraction (engine/eval.ts, utils.ts) for maintainability
- Typed constraint API via `withConstraints<T>()`
- Test DSL (`expect(name, args).exists() / .missing() / .count(n)`)
- Validation (dry-run), source-span error diagnostics, error cause chaining
- Engine snapshots, convenience loader (`createEngine`), file loader (`load`)
- No runtime dependencies; uses Node.js built-in `node:test` runner
- **Built-in web playground IDE** (`npm run website`) with live compilation, constraint store inspection, rule-fire trace log, and host module editing
- **NeoWave Performance & Telemetry Extensions (Added July 2026)**:
  - `store.lookupByArg(name, arity, argIndex, value)`: Fast $O(1)$ candidate constraint lookups by argument value (e.g. sequence Id indexing)
  - `engine.addRuleFiredListener(callback)`: Dynamic rule execution telemetry and audit tracing hook


## Quick Start

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Logical Variable Unification

CHR.ts supports **opt-in unification** for rules. When a rule is marked with the `unify` keyword, head variables are unified across constraints instead of checked for strict equality. This enables classic CHR patterns such as transitive closure, union-find, and path finding.

Example:

```chr
unify path(X, Y) \ path(Y, Z) ==> path(X, Z);
```

With unification, asserting `path(a, b)` and `path(b, c)` derives `path(a, c)` because the variable `Y` is shared and unified across both heads. Under strict (default) matching, this rule only derives a new path when the middle argument of the second constraint happens to match the already-bound `Y` exactly.

### When to Use `unify`

- **Transitive closure**: `edge(X, Y) \ edge(Y, Z) ==> path(X, Z)`
- **Union-find / equivalence**: `eq(X, Y) \ eq(Y, Z) ==> eq(X, Z)`
- **Type inference**: `typeof(X, T) \ typeof(Y, T), eq(X, Y) ==> merge(X, Y)`

Strict matching remains the default and is preferred when:
- Arguments are ground values (strings, numbers)
- Deterministic positional matching is sufficient
- Performance is critical and variables are simple

### Implementation Notes

- Unification is **opt-in per rule** — existing rules are unaffected.
- The engine uses a `Substitution` map to track variable→value bindings across heads.
- Anonymous `_` variables are still ignored and never participate in the substitution.
- Programmatic rule creation supports `unify: true` on `RuleNode`.

```ts
engine.addRule({
  name: 'transitive',
  kind: 'propagation',
  unify: true,
  kept: [
    { name: 'link', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
    { name: 'link', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
  ],
  removed: [],
  guard: [],
  body: [
    { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
  ]
})
```

## TypeScript Interop

TypeScript functions can be called from guards and bodies using explicit source declarations plus engine registration.

Example:

```chr
functions positive/1, inc/1;
actions record/1;

approve @ input(X) ==> positive(X) | !record(X), approved(inc(X));
```

```ts
const engine = new CHREngine()
engine.registerHost({
  functions: {
    positive: (_ctx, value) => Number(value) > 0,
    inc: (_ctx, value) => Number(value) + 1
  },
  actions: {
    record: ({ args }) => console.log(args[0])
  }
})
engine.addRules(source)
```

For a more typed authoring style, use `defineHostModule(...)`:

```ts
import { defineHostModule } from 'chr-ts'

const host = defineHostModule({
  functions: {
    positive: (_ctx, value) => Number(value) > 0,
    inc: (_ctx, value) => Number(value) + 1
  },
  actions: {
    record: ({ args }) => console.log(args[0])
  }
})

engine.registerHost(host)
```

Guidelines:

- Use `functions ...;` for guard calls and expression calls.
- Use `actions ...;` for body-side effects with `!actionName(...)`.
- Keep guards pure.
- Use actions for logging, metrics, and integration side effects.

See [examples/banking/banking.chr](examples/banking/banking.chr) and [examples/banking/banking.ts](examples/banking/banking.ts) for a complete example.

## Built-in Host Functions

Common predicates and utilities are available as built-in host functions via `registerBuiltins()`:

```ts
const engine = new CHREngine()
engine.registerBuiltins()
engine.addRules('match @ a(X) ==> gt(X, 0) | b(X);')
```

Available builtins:

| Function | Arity | Description |
|----------|-------|-------------|
| `eq` | 2 | Strict equality (`===`) |
| `neq` | 2 | Strict inequality (`!==`) |
| `lt`, `lte`, `gt`, `gte` | 2 | Numeric comparisons |
| `add`, `sub`, `mul`, `div` | 2 | Arithmetic (`div` throws on zero) |
| `mod` | 2 | Modulo (throws on zero divisor) |
| `min`, `max` | 2 | Numeric min/max |
| `abs` | 1 | Absolute value |
| `not` | 1 | Boolean negation |
| `isNumber`, `isString`, `isBoolean`, `isNull` | 1 | Type checks |
| `stringLength` | 1 | String length |
| `stringConcat` | 2 | String concatenation |
| `allDifferent` | N | Variadic; all values distinct. Also accepts single array argument |
| `in` | 2 | Array membership check |
| `lookup` | 1 | Query store by name |
| `lookupOne` | 2 | Query store by name + arg index |

Use `BuiltinsModule` directly for manual registration:

```ts
import { BuiltinsModule } from 'chr-ts'
engine.registerHost(BuiltinsModule)
```

## Source-level Host Module Imports

Host modules can be imported directly from `.chr` source code using `import host <name>;`:

```chr
import host builtins;

constraint a/1, b/1;
match @ a(X) ==> gt(X, 0) | b(X);
```

```ts
const engine = new CHREngine()
engine.registerHostModule('builtins', BuiltinsModule)
engine.addRules(source)
```

Multiple modules can be imported and mixed with individual declarations:

```chr
import host builtins;
import host mymath;

functions custom/1;
actions log/1;
```

Modules are registered on the engine by name:

```ts
engine.registerHostModule('builtins', BuiltinsModule)
engine.registerHostModule('mymath', mathModule)
```

When `strictHostDeclarations` is enabled, imported modules satisfy the declaration requirement automatically — no explicit `functions name/arity;` needed for module-provided functions.

## Constraint Query Functions

Two builtin functions allow reading constraint data from the store at runtime without consuming the constraint:

```chr
research_in_progress @ research(F, P) ==> lookup('technology') | ...
```

```typescript
// Returns: [['agriculture'], ['mining'], ...]
```

```chr
check_tech @ command('check', _, _) ==> lt(lookupOne('technology', 0), ...) | ...;
```

These enable non-destructive reads — the constraint remains in the store after the query.

## Typed Engine API

The `withConstraints<T>()` method returns a type-safe wrapper:

```typescript
const engine = new CHREngine()
const typed = engine.withConstraints<{
  gold: [number]
  population: [number]
  has_building: [string, number]
}>()

await typed.assert('gold', [100])
await typed.assert('has_building', ['village', 1])
```

Incorrect argument types or arities are caught at compile time.

## Test DSL

The `expect()` method provides a fluent assertion API for tests:

```typescript
engine.expect('fib', [5, 5]).exists()
engine.expect('fib', [5, 6]).missing()
engine.expect('fib', [5, 5]).count(1)
```

Designed for use with Node's built-in `node:test` framework:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'

test('fibonacci', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('fib @ fib(N, A), fib(N, B) ==> ...')
  await engine.assert('fib', [5, 5])
  assert.ok(engine.expect('fib', [5, 5]).exists())
})
```

## Convenience Loader

The `createEngine()` helper sets up an engine with source, host module, and builtins in one call:

```ts
import { createEngine } from 'chr-ts'

const engine = createEngine({
  source: 'go @ a(X) ==> b(X);',
  host: myHostModule,
  builtins: true,
  maxRuleFirings: 1000
})

await engine.assert('a', [1])
```

## Commands

```bash
npm install
npm run build
npm test
npm run typecheck
npm run website
```

## Playground IDE

Run `npm run website` to start the built-in web IDE at `http://localhost:4173`. The playground provides:

- Live CHR rule compilation with automatic error reporting
- Constraint store inspector with add/remove
- Host module editor for custom functions and actions
- Rule-fire trace log showing matched constraints, variable bindings, and timing
- Built-in examples (propagation, simpagation, host modules)
- Dark-themed CodeMirror editor

The playground runs the actual CHR.ts engine on the server via a JSON API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/compile` | POST | Compile CHR source + optional host module |
| `/api/assert` | POST | Assert a constraint and run fixpoint |
| `/api/clear` | POST | Reset engine |
| `/api/examples` | GET | List bundled example programs |

Source: `website/playground/`


## Project Status

This project is currently in bootstrap form with:

- a fresh specification documented in [docs/CHR_TS_SPEC.md](docs/CHR_TS_SPEC.md),
- a typed AST and runtime core,
- a safe parser for a practical CHR subset,
- engine execution of propagation, simplification, and simpagation rules,
- explicit host-language guards and actions,
- optional constraint declarations and rule-fire tracing,
- 22 built-in host functions,
- convenience loader for one-shot engine setup,
- multi-head join and repeated-variable matching,
- **structural unification** via the `unify` keyword,
- shared utilities module (`utils.ts`) with `numeric`, `compare`, `evaluateBinary`,
- extracted expression evaluation module (`engine/eval.ts`),
- type-safe `exports` field and `prepare` script for publishing.

## Initial Design Goals

1. Match CHR semantics closely enough to validate rules against established CHR systems.
2. Keep JavaScript/TypeScript interop explicit and typed.
3. Unify JIT and AOT around one intermediate representation.
4. Make debugging and error reporting first-class.
5. Avoid dynamic execution techniques that weaken safety or determinism.

## Source Layout

```text
src/
  core/
    ast.ts
    builtins.ts
    constraint.ts
    engine.ts
    engine/
      eval.ts
    errors.ts
    history.ts
    host.ts
    loader.ts
    parser.ts
    store.ts
    substitution.ts
    unification.ts
    utils.ts
  index.ts
docs/
  CHR_TS_SPEC.md
  FEATURES.md
  TUTORIAL.md
  COMPARISON.md
examples/
  banking/
    banking.chr
    banking.ts
    package.json
    tsconfig.json
    fixup.cjs
  calendar/
    calendar.chr
    calendar.ts
    package.json
    tsconfig.json
    fixup.cjs
  ecommerce/
    ecommerce.chr
    ecommerce.ts
    package.json
    tsconfig.json
    fixup.cjs
  education/
    education.chr
    education.ts
    package.json
    tsconfig.json
    fixup.cjs
  finance/
    finance.chr
    finance.ts
    package.json
    tsconfig.json
    fixup.cjs
  gaming/
    gaming.chr
    gaming.ts
    package.json
    tsconfig.json
    fixup.cjs
  healthcare/
    healthcare.chr
    healthcare.ts
    package.json
    tsconfig.json
    fixup.cjs
  hr/
    hr.chr
    hr.ts
    package.json
    tsconfig.json
    fixup.cjs
  inventory/
    inventory.chr
    inventory.ts
    package.json
    tsconfig.json
    fixup.cjs
  iot/
    iot.chr
    iot.ts
    package.json
    tsconfig.json
    fixup.cjs
  library/
    library.chr
    library.ts
    package.json
    tsconfig.json
    fixup.cjs
  logistics/
    logistics.chr
    logistics.ts
    package.json
    tsconfig.json
    fixup.cjs
  music/
    music.chr
    music.ts
    package.json
    tsconfig.json
    fixup.cjs
  restaurant/
    restaurant.chr
    restaurant.ts
    package.json
    tsconfig.json
    fixup.cjs
  smarthome/
    smarthome.chr
    smarthome.ts
    package.json
    tsconfig.json
    fixup.cjs
  social/
    social.chr
    social.ts
    package.json
    tsconfig.json
    fixup.cjs
  sports/
    sports.chr
    sports.ts
    package.json
    tsconfig.json
    fixup.cjs
  supplychain/
    supplychain.chr
    supplychain.ts
    package.json
    tsconfig.json
    fixup.cjs
  travel/
    travel.chr
    travel.ts
    package.json
    tsconfig.json
    fixup.cjs
  weather/
    weather.chr
    weather.ts
    package.json
    tsconfig.json
    fixup.cjs
test/
  *.test.mjs
  fixtures/
  realm-of-rules/
```
