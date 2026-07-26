# CHR.ts -- Complete Feature Summary

*Generated from full source code analysis (July 2026)*

---

## 1. Project Overview

**Location:** `CHR.ts/`
**Package:** `chr-ts` v0.1.0 (private, not published)
**Type:** ECMAScript Module (`"type": "module"`)
**Language:** TypeScript, compiled to ES2022/NodeNext
**Entry point:** `dist/index.js` (types: `dist/index.d.ts`)
**Dependencies:** None (only `devDependencies`: `typescript ^5.9.2`, `@types/node ^26.1.1`)
**Build system:** `tsc -p tsconfig.json`
**Test framework:** Node.js built-in `node:test` + `node:assert/strict`

### Configuration (`tsconfig.json`)
- `target`: ES2022
- `module`: NodeNext, `moduleResolution`: NodeNext
- `strict`: true, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`
- `skipLibCheck`, `esModuleInterop`, `forceConsistentCasingInFileNames`

---

## 2. Source Tree Layout

```
src/
  index.ts              -- Re-exports everything from core/*
  core/
    ast.ts              -- Typed AST node definitions
    parser.ts           -- .chr source parser
    engine.ts           -- Main CHREngine class (runtime)
    store.ts            -- ConstraintStore
    constraint.ts       -- ConstraintRecord model
    history.ts          -- PropagationHistory
    builtins.ts         -- Built-in host functions module
    errors.ts           -- CHRParseError, CHRExecutionError
    host.ts             -- defineHostModule() helper
    loader.ts           -- createEngine() convenience loader
    unification.ts      -- Term unification (for `unify` rules)
    substitution.ts     -- Substitution map for unification
test/
  engine.test.mjs       -- Core engine tests (453 lines)
  parser.test.mjs       -- Parser tests
  store.test.mjs        -- ConstraintStore tests
  builtins.test.mjs     -- Builtin function tests
  constraint.test.mjs   -- Constraint model tests
  history.test.mjs      -- PropagationHistory tests
  multihead.test.mjs    -- Multi-head rule tests
  import.test.mjs       -- Host module import tests
  loader.test.mjs       -- createEngine tests
  domain-interop.test.mjs -- 5-domain fixture tests
  advanced-features.test.mjs -- Edge cases & advanced features
  unification.test.mjs  -- Unification feature tests
  realm-of-rules/
    rules.chr           -- 250-line game rule set
    game.test.mjs       -- Full game engine tests (560 lines)
    count-rules.mjs     -- Rule counting utility
    debug.mjs           -- Rule debug utility
  fixtures/
    finance.chr         -- 5-rule finance pipeline
    healthcare.chr      -- 5-rule healthcare pipeline
    logistics.chr       -- 5-rule logistics pipeline
    education.chr       -- 5-rule education pipeline
    cybersecurity.chr   -- 5-rule cybersecurity pipeline
docs/
  CHR_TS_SPEC.md        -- Full specification (13 sections)
  TUTORIAL.md           -- Tutorial (14 sections, 620 lines)
  FEATURES.md           -- This file
  COMPARISON.md         -- Comparison with other CHR systems
examples/
  interop/
    approval.chr        -- Example .chr rule file
    approval.ts         -- Example TypeScript host
```

---

## 3. AST Definitions (`src/core/ast.ts`)

### Exported Types & Interfaces

| Export | Kind | Description |
|--------|------|-------------|
| `RuleKind` | type alias | `'propagation' \| 'simplification' \| 'simpagation'` |
| `SourceLocation` | interface | `{ line: number, column: number, offset: number }` |
| `SourceSpan` | interface | `{ start: SourceLocation, end: SourceLocation }` |
| `VariableExpression` | interface | `{ type: 'variable', name: string }` |
| `LiteralExpression` | interface | `{ type: 'literal', value: string \| number \| boolean \| null }` |
| `UnaryExpression` | interface | `{ type: 'unary', operator: '!' \| '-', operand: Expression }` |
| `BinaryExpression` | interface | `{ type: 'binary', operator: ..., left: Expression, right: Expression }` |
| `CallExpression` | interface | `{ type: 'call', callee: string, args: Expression[] }` |
| `ArrayExpression` | interface | `{ type: 'array', elements: Expression[] }` |
| `Expression` | type alias | Union of all expression types above |
| `ConstraintPattern` | interface | `{ name: string, args: Expression[] }` |
| `GuardExpression` | type alias | `Expression` |
| `BodyConstraint` | interface | `{ type: 'constraint', constraint: ConstraintPattern }` |
| `BodyAction` | interface | `{ type: 'action', name: string, args: Expression[] }` |
| `BodyConstraintUpdate` | interface | `{ type: 'update', old: ConstraintPattern, constraint: ConstraintPattern }` |
| `BodyLetBinding` | interface | `{ type: 'let', name: string, expr: Expression }` |
| `BodyItem` | type alias | Union of all body item types |
| `RuleNode` | interface | `{ name?: string, kind, kept, removed, guard, body, span?, priority?, unify? }` |
| `ConstraintDeclaration` | interface | `{ name: string, arity: number, span? }` |
| `HostFunctionDeclaration` | interface | `{ name: string, arity: number, span? }` |
| `HostActionDeclaration` | interface | `{ name: string, arity: number, span? }` |
| `HostImportDeclaration` | interface | `{ name: string, span? }` |
| `ProgramNode` | interface | `{ declarations, functionDeclarations, actionDeclarations, hostImports, rules }` |
| `RuleFireTrace` | interface | `{ ruleName, kind, priority?, matchedConstraintIds, bindings, guardResults?, firedAt?, durationMs? }` |

### Binary Operators Supported
- Logical: `||`, `&&`
- Equality: `===`, `!==`
- Comparison: `<`, `<=`, `>`, `>=`
- Arithmetic: `+`, `-`, `*`, `/`
- Membership: `in`

### Unary Operators Supported
- `!` (logical NOT)
- `-` (numeric negation)

---

## 4. Parser (`src/core/parser.ts`)

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `parseProgram` | `(source: string) => ProgramNode` | Parses full .chr source into typed AST |
| `parseRule` | `(source: string, fullSource?, baseOffset?) => RuleNode` | Parses a single rule |
| `parseExpression` | `(source: string) => Expression` | Parses a single expression |

### Syntax Features Supported

#### Top-Level Statements (terminated by `;`)
- **Constraint declarations:** `constraint name/arity;` or `constraints name1/arity1, name2/arity2;`
- **Function declarations:** `function name/arity;` or `functions name1/arity1, ...;`
- **Action declarations:** `action name/arity;` or `actions name1/arity1, ...;`
- **Host module imports:** `import host moduleName;`
- **Rules:** `[name @] heads ==>|<=>|\\ <=> guards | body`

#### Rule Forms
| Form | Syntax | Kind | Semantics |
|------|--------|------|-----------|
| Propagation | `Heads ==> Guard \| Body` | `propagation` | Add body, keep all heads |
| Simplification | `Heads <=> Guard \| Body` | `simplification` | Remove all heads, add body |
| Simpagation | `Keep \\ Remove <=> Guard \| Body` | `simpagation` | Keep `Keep`, remove `Remove`, add body |
| Unification variant | `unify heads ...` | (same 3 kinds) | Uses structural unification for matching |

#### Rule Syntax Details
- **Rule naming:** `name @ ...` (optional, before rule operator)
- **Guard:** `Guard1, Guard2, ... |` (comma-separated, before `|`)
- **Body items** (comma-separated):
  - `ConstraintName(args...)` -- emit constraint
  - `!actionName(args...)` -- call host action (prefixed with `!`)
  - `OldConstraint <= NewConstraint` -- constraint update (find & replace)
  - `let Var = Expression` -- local variable binding
- **Heads:** Multi-head supported with commas; simpagation uses `\\` between kept and removed
- **Literal heads:** `constraintName(literalValue)` supported in head patterns
- **Anonymous variable:** `_` matches any value without binding

#### Expression Syntax (precedence, top to bottom)
1. `||` (logical OR)
2. `&&` (logical AND)
3. `===`, `!==` (equality)
4. `<`, `<=`, `>`, `>=`, `in` (comparison/membership)
5. `+`, `-` (addition/subtraction)
6. `*`, `/` (multiplication/division)
7. Unary `!`, `-`
8. Primary: literals, identifiers, variables (uppercase/underscore-prefixed), function calls `fn(args...)`, parenthesized expressions, array literals `[elements...]`

#### Literal Types
- Numbers: `42`, `3.14`
- Strings: `"hello"`, `'world'` (both quote styles, with backslash escaping)
- Booleans: `true`, `false`
- Null: `null`
- Arrays: `[1, 2, 3]`

#### Identifier Rules
- Constraint names: lowercase-starting identifiers
- Variables: uppercase-starting identifiers or `_` (anonymous)
- Host function/action names: alphanumeric identifiers
- Host module names: lowercase-starting identifiers

---

## 5. CHREngine (`src/core/engine.ts`)

### Exported Types & Interfaces

| Export | Kind | Description |
|--------|------|-------------|
| `EngineSnapshot` | interface | `{ rules, constraints, history }` |
| `HostFunctionContext` | interface | `{ engine, store, history, rule, matched, bindings }` |
| `HostActionContext` | interface | extends `HostFunctionContext` with `args: unknown[]` |
| `HostFunction` | type | `(ctx: HostFunctionContext, ...args) => unknown \| Promise<unknown>` |
| `GuardFunction` | type | `(ctx: HostFunctionContext, ...args) => boolean \| Promise<boolean>` |
| `HostAction` | type | `(ctx: HostActionContext) => void \| Promise<void>` |
| `HostModule` | interface | `{ functions?: Record<string, HostFunction>, actions?: Record<string, HostAction> }` |
| `CHREngineOptions` | interface | `{ maxRuleFirings?, onRuleFired?, strictHostDeclarations?, hostFunctionTimeout? }` |
| `AssertOptions` | interface | `{ maxRuleFirings? }` |
| `TypedEngine<Constraints>` | interface | Typed constraint API with `assert`/`assertMany` |
| `EngineState` | type | `'empty' \| 'ready' \| 'running' \| 'error'` |

### Class: `CHREngine`

#### Public Properties
| Property | Type | Description |
|----------|------|-------------|
| `store` | `ConstraintStore` | Public constraint store (read/write access) |
| `history` | `PropagationHistory` | Public propagation history |

#### Constructor
```typescript
constructor(options?: CHREngineOptions)
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRuleFirings` | `number` | `10000` | Max rule firings before abort (prevents runaway) |
| `onRuleFired` | `(trace: RuleFireTrace) => void` | undefined | Callback after each rule fires |
| `strictHostDeclarations` | `boolean` | `false` | Require source-level host declarations |
| `hostFunctionTimeout` | `number` | undefined | Timeout (ms) for async host functions |

#### Public Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getState` | `() => EngineState` | Current engine state |
| `getWarnings` | `() => readonly string[]` | Accumulated warnings |
| `addRule` | `(rule: RuleNode) => void` | Add a single programmatic rule |
| `addProgram` | `(program: ProgramNode) => void` | Add declarations + rules from AST |
| `addRules` | `(source: string) => void` | Parse and add rules from CHR source |
| `validate` | `(source: string) => { ok, parseError?, executionErrors[] }` | Dry-run validation without adding |
| `registerFunction` | `(name, handler: HostFunction) => void` | Register a single host function |
| `registerFunctions` | `(handlers: Record<string, HostFunction>) => void` | Register multiple host functions |
| `registerAction` | `(name, handler: HostAction) => void` | Register a single host action |
| `registerActions` | `(handlers: Record<string, HostAction>) => void` | Register multiple host actions |
| `registerHost` | `(module: HostModule) => void` | Register a module (functions + actions) |
| `registerBuiltins` | `() => void` | Register all built-in functions |
| `registerHostModule` | `(name, module: HostModule) => void` | Register named module for `import host` |
| `registerHostModules` | `(modules: Record<string, HostModule>) => void` | Register multiple named modules |
| `declareConstraint` | `(name, arity) => void` | Declare constraint arity |
| `declareConstraints` | `(entries: Record<string, number>) => void` | Declare multiple constraint arities |
| `assert` | `(name, args?, options?) => Promise<ConstraintRecord>` | Assert a constraint into the store |
| `assertMany` | `(entries[], options?) => Promise<{ added: number }>` | Assert multiple constraints atomically |
| `clear` | `() => void` | Reset store and history (keeps rules) |
| `snapshot` | `() => EngineSnapshot` | Current engine state snapshot |
| `getRules` | `() => RuleNode[]` | All loaded rules |
| `getRulesByHead` | `(name) => RuleNode[]` | Rules referencing a constraint name |
| `printStore` | `() => string` | Formatted store display |
| `printHistory` | `() => string` | Formatted propagation history |
| `printRules` | `() => string` | Formatted rule listing |
| `ensureRulesLoaded` | `() => void` | Throws if no rules loaded |
| `load` | `(filePath: string) => void` | Load rules from file (Node.js only) |
| `expect` | `(name, args) => { exists, missing, count }` | Query helper for store testing |
| `withConstraints` | `() => TypedEngine<Constraints>` | Type-safe constraint API wrapper |

#### Engine Lifecycle
- `empty` (initial) -> `addRules()`/`addRule()`/`addProgram()` -> `ready`
- `ready` -> `assert()`/`assertMany()` -> `running` -> fixpoint -> `ready`
- `ready` -> `clear()` -> `ready`
- `running` -> error -> `error` (must create new engine)

---

## 6. ConstraintStore (`src/core/store.ts`)

### Exported Types

| Export | Kind | Description |
|--------|------|-------------|
| `StoreSnapshotEntry` | interface | `{ id, name, arity, args }` |
| `ConstraintStoreHooks` | interface | `{ onAdd?, onRemove? }` |
| `ConstraintStoreOptions` | interface | `{ strict?: boolean \| 'warn' }` |

### Class: `ConstraintStore`

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(hooks?, options?)` | Create store |
| `add` | `(name, args, metadata?) => ConstraintRecord` | Add constraint, returns record with id |
| `get` | `(id) => ConstraintRecord \| undefined` | Get by id |
| `has` | `(id) => boolean` | Check existence |
| `remove` | `(id) => boolean` | Remove by id |
| `lookupByName` | `(name) => ConstraintRecord[]` | All constraints with name, sorted by id |
| `lookup` | `(name, arity) => ConstraintRecord[]` | By functor (name/arity), sorted |
| `clear` | `() => void` | Remove all, reset ids |
| `invalidate` | `() => void` | Clear + set invalid flag |
| `size` | `() => number` | Count of constraints |
| `functors` | `() => string[]` | All functors as "name/arity" |
| `entries` | `() => Array<{ id, record }>` | All entries with ids |
| `find` | `(predicate) => ConstraintRecord[]` | Filter by predicate |
| `forEach` | `(callback) => void` | Iterate all |
| `map` | `<T>(callback) => T[]` | Transform all |
| `args` | `(id) => unknown[]` | Get defensive copy of args |
| `allAlive` | `(ids) => boolean` | Bulk existence check |
| `snapshot` | `() => StoreSnapshotEntry[]` | Ordered snapshot |
| `toJSON` | `() => StoreSnapshotEntry[]` | Alias for snapshot |
| `toString` | `() => string` | Formatted table |
| `invalid` | `(getter) => boolean` | Invalid flag |

**Store invariants** (checked in strict mode): nextId = max(id) + 1, byFunctor index matches byId.

---

## 7. Constraint Model (`src/core/constraint.ts`)

### Exported Interface

| Export | Kind | Description |
|--------|------|-------------|
| `ConstraintRecord` | interface | `{ id, name, arity, args, metadata?, toString() }` |

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createFunctor` | `(name, arity) => string` | Returns `"name/arity"` |
| `createConstraint` | `(id, name, args, metadata?) => ConstraintRecord` | Creates record with defensive args copy |

---

## 8. PropagationHistory (`src/core/history.ts`)

### Class: `PropagationHistory`

| Method | Signature | Description |
|--------|-----------|-------------|
| `add` | `(ruleName: string, ids: number[]) => void` | Record that a rule fired on specific constraint IDs |
| `has` | `(ruleName: string, ids: number[]) => boolean` | Check if already fired on those IDs |
| `notIn` | `(ruleName: string, ids: number[]) => boolean` | Inverse of `has` |
| `clear` | `() => void` | Reset all history |
| `snapshot` | `() => Record<string, string[]>` | All entries (IDs sorted, string-hashed) |

History uses order-independent hashing: IDs are sorted before joining with `:`.

---

## 9. Built-in Host Functions (`src/core/builtins.ts`)

### Exported Constants & Functions

**`BuiltinFunctions: Record<string, HostFunction>`** -- 22 built-in functions:

| Function | Arity | Description |
|----------|-------|-------------|
| `eq` | 2 | `a === b` strict equality |
| `neq` | 2 | `a !== b` strict inequality |
| `lt` | 2 | Numeric less-than |
| `lte` | 2 | Numeric less-than-or-equal |
| `gt` | 2 | Numeric greater-than |
| `gte` | 2 | Numeric greater-than-or-equal |
| `add` | 2 | Numeric addition |
| `sub` | 2 | Numeric subtraction |
| `mul` | 2 | Numeric multiplication |
| `div` | 2 | Numeric division (throws on zero) |
| `mod` | 2 | Modulo (throws on zero divisor) |
| `min` | 2 | Numeric minimum |
| `max` | 2 | Numeric maximum |
| `abs` | 1 | Absolute value |
| `not` | 1 | Boolean negation |
| `isNumber` | 1 | Type check: number |
| `isString` | 1 | Type check: string |
| `isBoolean` | 1 | Type check: boolean |
| `isNull` | 1 | Type check: null |
| `stringLength` | 1 | String length |
| `stringConcat` | 2 | String concatenation (coerces non-strings) |
| `allDifferent` | N (variadic) | All values distinct; accepts array form |
| `in` | 2 | Array membership check |
| `lookup` | 1 | Query store by name, returns array of args arrays |
| `lookupOne` | 2 | Query store by name, returns specific arg from first match |

**`BuiltinsModule: HostModule`** -- wraps `BuiltinFunctions` (no actions).

---

## 10. Host Module System (`src/core/host.ts`)

### Exported Function

| Function | Signature | Description |
|----------|-----------|-------------|
| `defineHostModule` | `(definition: HostModuleDefinition) => HostModule` | Type-safe identity function |

### Interface
- `HostModuleDefinition`: `{ functions?, actions? }`

---

## 11. Convenience Loader (`src/core/loader.ts`)

### Exported Interface & Function

| Export | Kind | Description |
|--------|------|-------------|
| `LoadCHROptions` | interface | `{ source, host?, builtins?, maxRuleFirings? }` |
| `createEngine` | `(options: LoadCHROptions) => CHREngine` | One-shot engine setup |

---

## 12. Error Types (`src/core/errors.ts`)

### Exported Classes

| Class | Extends | Properties | Description |
|-------|---------|------------|-------------|
| `CHRParseError` | `Error` | `name = 'CHRParseError'`, `span: SourceSpan?`, `cause: Error?` | Parse-time errors with source location |
| `CHRExecutionError` | `Error` | `name = 'CHRExecutionError'`, `span: SourceSpan?`, `cause: Error?` | Runtime errors with source location |

### Exported Function
- `formatSourceSpan(source, span): string` -- Formats caret `^` pointer for error display

### Error Messages (from engine)
| Error Pattern | Triggered When |
|---------------|----------------|
| `Unknown host function: <name>. Did you mean <suggestion>?` | Unregistered function called |
| `Unknown host action: <name>` | Unregistered action called |
| `Host function <name>/<arity> is not declared in source` | strictHostDeclarations + undeclared |
| `Host function <name>/<arity> violates declared arity <N>` | Arity mismatch |
| `Constraint <name>/<arity> violates declared arity <N>` | Arity violation in assert/emit |
| `Declared function <name>/<arity> is not registered` | Declared but not registered before assert |
| `Declared action <name>/<arity> is not registered` | Declared but not registered before assert |
| `Unknown host module '<name>' in import` | Missing named module for `import host` |
| `Maximum rule firings exceeded (<N>)` | Runaway rule loop |
| `No rules have been loaded into the engine` | assert() on empty engine |
| `Engine is in an error state` | Operation on errored engine |
| `Engine is currently running` | addRules() during execution |
| `Unbound variable <X> in rule <name>` | Variable used before bound |
| `Host function <name> timed out after <N>ms` | hostFunctionTimeout exceeded |
| `Unknown host function: <name>` | Typo in function name |
| `Numeric operation requires number operands` | Non-number in arithmetic |
| `Right operand of "in" must be an array` | Non-array in `in` operator |
| `Division by zero` | Builtin div/mod by zero |

---

## 13. Unification (`src/core/unification.ts`, `substitution.ts`)

### Exported Functions (unification.ts)

| Function | Signature | Description |
|----------|-----------|-------------|
| `unifyTerm` | `(pattern: Expression, value, subst: Substitution) => Substitution \| null` | Try to unify expression with value |
| `resolveVariable` | `(name, subst) => unknown` | Resolve variable through substitution chain |
| `materializeSubstitution` | `(subst, fallback) => Record<string, unknown>` | Convert substitution to flat bindings |

### Exported Class (substitution.ts)

**`Substitution`**
- `get(name)`, `set(name, value)`, `has(name)`
- `clone()`, `isEmpty()`, `entries()`, `toString()`

### Unification Rules
- Activated by `unify` prefix in CHR source or `unify: true` on programmatic `RuleNode`
- Uses `Substitution` map to track variable-to-term mappings
- `_` (anonymous) is never bound
- When unification fails, returns `null` (match fails)
- When unification succeeds, substitutes values and respects propagation history
- Coexists with strict (default) matching -- rules without `unify` use `===` equality

---

## 14. Complete CHR Syntax Reference

```
-- Top-level statements (each ends with ;):

  constraint name/arity, name/arity;          -- declare constraints
  constraints name/arity, name/arity;         -- (plural form)
  function name/arity, name/arity;            -- declare host functions
  functions name/arity, name/arity;           -- (plural form)
  action name/arity, name/arity;              -- declare host actions
  actions name/arity, name/arity;             -- (plural form)
  import host moduleName;                     -- import named host module

-- Rule forms:

  [name @] Head, Head ==> Guard | Body;                    -- propagation
  [name @] Head, Head <=> Guard | Body;                    -- simplification
  [name @] Keep \ Remove <=> Guard | Body;                 -- simpagation
  [unify] [name @] Head, Head ==> Guard | Body;            -- propagation with unification
  [unify] [name @] Keep \ Remove <=> Guard | Body;         -- simpagation with unification

-- Body items (comma-separated):

  constraintName(args...)          -- emit constraint
  !actionName(args...)             -- call host action
  OldConstraint <= NewConstraint   -- update (find & replace)
  let Var = Expression             -- local variable binding

-- Expressions (infix operators, precedence order):

  ||                                          -- logical OR
  &&                                          -- logical AND
  ===  !==                                    -- strict equality/inequality
  <  <=  >  >=  in                            -- comparison, array membership
  +  -                                        -- addition, subtraction
  *  /                                        -- multiplication, division
  !  -                                        -- unary NOT, unary minus

-- Literals:

  42  3.14                                     -- numbers
  "hello"  'world'                            -- strings
  true  false                                 -- booleans
  null                                         -- null
  [1, 2, 3]                                   -- arrays

-- Variables:

  X  MyVar  _                                  -- uppercase-starting = variables
  _                                             -- anonymous (wildcard, no binding)
```

---

## 15. All Exports from Package (`src/index.ts`)

The package re-exports everything from all core modules:
```
src/core/ast.js        -- 11 interfaces, 3 type aliases
src/core/builtins.js   -- BuiltinFunctions, BuiltinsModule
src/core/constraint.js -- ConstraintRecord, createFunctor, createConstraint
src/core/engine.js     -- EngineSnapshot, HostFunctionContext, HostActionContext,
                          HostFunction, GuardFunction, HostAction, HostModule,
                          CHREngineOptions, AssertOptions, TypedEngine, EngineState, CHREngine
src/core/errors.js     -- CHRParseError, CHRExecutionError, formatSourceSpan
src/core/history.js    -- PropagationHistory
src/core/host.js       -- HostModuleDefinition, defineHostModule
src/core/loader.js     -- LoadCHROptions, createEngine
src/core/parser.js     -- parseProgram, parseRule, parseExpression
src/core/store.js      -- StoreSnapshotEntry, ConstraintStoreHooks, ConstraintStoreOptions, ConstraintStore
```

---

## 16. Test Coverage Summary

All tests use Node.js built-in test runner (`node:test` + `node:assert/strict`).

| File | Tests | Features Covered |
|------|-------|-----------------|
| `engine.test.mjs` | ~35 | All rule kinds, host funcs/actions, arity enforcement, declarations, tracing, snapshots, clear, errors, binary/logical operators, getRulesByHead, print APIs, per-assertion maxFirings, store.find |
| `parser.test.mjs` | ~10 | Program parsing, expression parsing (precedence), all rule kinds, body actions, declarations, source spans, string literals, error reporting |
| `store.test.mjs` | ~20 | functors, entries, forEach, map, args, allAlive, toJSON, invalidate, clear, invariants |
| `builtins.test.mjs` | ~15 | eq, neq, arithmetic, type checks, string operations, allDifferent (variadic + array), BuiltinsModule direct use |
| `constraint.test.mjs` | ~6 | createFunctor, createConstraint (id/name/arity, defensive copy, metadata) |
| `history.test.mjs` | ~6 | add, has (order-independent), deduplication, snapshot, clear |
| `multihead.test.mjs` | ~14 | 2-way/3-way join, shared variables, literal heads, simpagation, guards, repeated assertions |
| `import.test.mjs` | ~8 | import host builtins, multiple modules, unknown module, strict mode, module actions, double import |
| `loader.test.mjs` | ~5 | createEngine with source, host, builtins, maxFirings |
| `advanced-features.test.mjs` | ~20 | Anonymous `_`, unary `!`, `in` operator, engine lifecycle (state machine), validate, rule priority, trace timing/firedAt/durationMs, error chaining/cause, host timeout, strict store, warnings (shadowed/dead/unused) |
| `unification.test.mjs` | ~18 | Basic variable sharing, multi-step chaining, literal heads, failure cases, propagation history, guards with unified bindings, anonymous `_` with unification, strict vs unify coexistence, programmatic RuleNode, engine diagnostics, body actions |
| `domain-interop.test.mjs` | 5 | Full 5-rule pipelines: finance, healthcare, logistics, education, cybersecurity |
| `realm-of-rules/game.test.mjs` | ~12 | 250-rule game engine: resource production, building construction, army training/combat, happiness/population, research/technology, diplomacy, full game scenario, store diagnostics, history tracking |
| `playground.test.mjs` | ~30 | Web IDE: Express server, JSON API contract, compile/assert/clear/examples endpoints, parse error propagation, host module registration, trace collection, static asset serving, CORS-safe JSON |

---

## 17. Key Architectural Decisions

1. **No `eval` or `with`** -- All host interop is through explicit registered functions/actions
2. **Typed AST** -- TypeScript IR is the boundary between parser and runtime
3. **Source spans preserved** -- All errors include line/column/offset
4. **Deterministic execution** -- Rules sorted by priority (descending), then stable order
5. **Propagation history** -- Prevents infinite re-firing of propagation rules on same constraint IDs
6. **Refined operational semantics** -- Design target for rule scheduling
7. **Guard safety** -- Guard function throws become guard failures (rule doesn't fire, engine continues)
8. **Strict mode** -- Optional `strictHostDeclarations` catches typos at `addRules()` time
9. **Host function timeout** -- Optional timeout for async host functions prevents hanging
10. **Unification** -- Optional per-rule unification using structural term matching (vs default strict `===`)
11. **Store invariants** -- Optional strict consistency checking on store operations
