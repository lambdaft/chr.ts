# CHR.ts

`CHR.ts` is a fresh TypeScript-first CHR project intended as a robust successor to the original CHR.js prototype.

The design keeps the spirit of CHR intact:

- declarative rule heads,
- explicit propagation, simplification, and simpagation rules,
- a first-class constraint store,
- propagation history,
- deterministic host-language integration.

It does **not** carry forward the most fragile parts of the original CHR.js implementation, especially runtime `eval`, ambient scope injection, and split JIT/AOT semantics.

## Project Status

This project is currently in bootstrap form:

- a fresh specification is documented in [docs/CHR_TS_SPEC.md](docs/CHR_TS_SPEC.md),
- a typed AST and runtime core are in place,
- a safe parser for a practical CHR subset is implemented,
- the engine executes propagation, simplification, and simpagation rules,
- host-language guards and actions are explicit through registered functions and actions,
- optional constraint declarations and rule-fire tracing are supported,
- built-in host functions for common predicates (comparisons, math, strings, type checks),
- convenience loader for one-shot engine setup,
- multi-head join and repeated-variable matching supported,
- **logical variable unification** via the `unify` keyword for transitive rules and shared variables across heads.

## Logical Variable Unification

CHR.ts supports **opt-in unification** for rules. When a rule is marked with the `unify` keyword, head variables are unified across constraints instead of checked for strict equality. This enables classic CHR patterns such as transitive closure, union-find, and path finding.

Example:

```chr
unify path(X, Y) \ path(Y, Z) ==> path(X, Z);
```

With unification, asserting `path(a, b)` and `path(b, c)` derives `path(a, c)` because the variable `Y` is shared and unified across both heads. Under strict (default) matching, this rule only derives a new path when the middle argument of the second constraint happens to match the already-bound `Y` exactly.

### Unification vs Strict Matching

| Pattern | Strict (default) | `unify` |
|---|---|---|
| `path(X, Y) \ path(Y, Z)` with `path(a, b), path(b, c)` | ✅ derives `path(a, c)` (Y=`b` matches) | ✅ derives `path(a, c)` |
| Same rule with `path(a, b), path(c, d)` | ❌ no match (`Y=b` !== `c`) | ❌ no match (Y cannot unify `b` with `c`) |
| Variables in asserted constraints | ❌ unsupported | ✅ supported |
| Cross-head variable sharing | ❌ fails on conflict | ✅ propagates substitution |

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

See [examples/interop/approval.chr](examples/interop/approval.chr) and [examples/interop/approval.ts](examples/interop/approval.ts) for a complete example.

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
| `isNumber`, `isString`, `isBoolean`, `isNull` | 1 | Type checks |
| `stringLength` | 1 | String length |
| `stringConcat` | 2 | String concatenation |

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
```

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
    errors.ts
    history.ts
    host.ts
    loader.ts
    parser.ts
    store.ts
  index.ts
docs/
  CHR_TS_SPEC.md
examples/
  interop/
```