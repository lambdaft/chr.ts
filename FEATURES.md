# Features for CHR Programmers in CHR.ts

A comprehensive catalogue of all features available to Constraint Handling Rules
programmers using the CHR.ts TypeScript library.

---

## Table of Contents

1. [Rule Forms](#1-rule-forms)
2. [Rule Syntax and Grammar](#2-rule-syntax-and-grammar)
3. [Body Items](#3-body-items)
4. [Expressions and Operators](#4-expressions-and-operators)
5. [Built-in Host Functions](#5-built-in-host-functions)
6. [Constraint Query Functions (lookup)](#6-constraint-query-functions-lookup)
7. [Host Module System](#7-host-module-system)
8. [Typed Engine API](#8-typed-engine-api)
9. [Test DSL (expect)](#9-test-dsl-expect)
10. [File Loader](#10-file-loader)
11. [Programmatic Rule Construction](#11-programmatic-rule-construction)
12. [Constraint Store](#12-constraint-store)
13. [Store Strict Mode](#13-store-strict-mode)
14. [Propagation History](#14-propagation-history)
15. [Engine Lifecycle](#15-engine-lifecycle)
16. [Engine Configuration Options](#16-engine-configuration-options)
17. [Validation (Dry-Run)](#17-validation-dry-run)
18. [Error Types and Diagnostics](#18-error-types-and-diagnostics)
19. [Rule Diagnostics](#19-rule-diagnostics)
20. [Constraint Arity Enforcement](#20-constraint-arity-enforcement)
21. [Host Declaration Checking](#21-host-declaration-checking)
22. [Anonymous Variables and Warnings](#22-anonymous-variables-and-warnings)
23. [Rule Priority](#23-rule-priority)
24. [Unification Matching](#24-unification-matching)
25. [In-Place Constraint Update](#25-in-place-constraint-update)
26. [Let Bindings in Rule Bodies](#26-let-bindings-in-rule-bodies)
27. [Constraint Query in Guards (lookup/2)](#27-constraint-query-in-guards-lookup2)
28. [Host Function Timeout](#28-host-function-timeout)
29. [One-Shot Engine Setup (createEngine)](#29-one-shot-engine-setup-createengine)
30. [Engine Snapshots](#30-engine-snapshots)
31. [Node.js Built-in Test Runner Integration](#31-nodejs-built-in-test-runner-integration)
32. [Error Cause Chaining](#32-error-cause-chaining)

---

## 1. Rule Forms

CHR.ts supports the three standard CHR rule forms:

### Propagation (`==>`)

```chr
name @ Head1, Head2 ==> Guard | Body1, Body2;
```

All matching heads are **kept** in the store. Body items are added.

### Simplification (`<=>`)

```chr
name @ Head1, Head2 <=> Guard | Body1, Body2;
```

All matching heads are **removed** from the store. Body items are added.

### Simpagation (`\` `<=>`)

```chr
name @ Keep1 \ Remove1, Remove2 <=> Guard | Body1, Body2;
```

Heads before the `\` are **kept**. Heads after the `\` are **removed**.
Body items are added.

### Unification Variant

Any rule form can be prefixed with `unify` to use structural term matching
instead of the default strict `===` equality:

```chr
unify name @ head1, head2 ==> guard | body.
```

---

## 2. Rule Syntax and Grammar

### Top-Level Statements

Each statement is terminated by `;`.

```chr
-- Constraint declarations
constraint name/arity, name/arity;
constraints name/arity, name/arity;       -- plural form

-- Host function declarations
function name/arity, name/arity;
functions name/arity, name/arity;         -- plural form

-- Host action declarations
action name/arity, name/arity;
actions name/arity, name/arity;           -- plural form

-- Host module imports
import host moduleName;

-- Rules
[name @] heads RuleOperator guard | body;
```

### Multi-Head Rules

Multiple head constraints are separated by commas. The engine attempts all
pairwise matchings across the store.

```chr
join @ a(X), b(Y) ==> c(X, Y);
```

### Simpagation Head Separator (`\`)

In propagation rules, `\` can also be used to separate multiple heads for
readability (all heads are kept):

```chr
join @ a(_, X) \ a(_, Y) ==> X === Y | matched(X);
```

In simpagation rules, `\` separates kept heads (left) from removed heads
(right).

---

## 3. Body Items

### Constraint Emission

Adds a constraint to the store:

```chr
myConstraint(arg1, arg2)
```

### Host Action Call

Calls a registered TypeScript action function. Prefix with `!`:

```chr
!myAction(arg1, arg2)
```

### In-Place Constraint Update

Finds existing constraints matching the old pattern and replaces them with
new values. The `<=` token distinguishes this from the rule-level `<=>`:

```chr
gold(G) <= gold(newG)
```

This is sugar for a host action that does `store.remove(old)` +
`store.add(new)`. It finds constraints by name and full argument match,
removes them, then adds the new constraint.

### Let Bindings

Binds the result of a (potentially expensive) expression to a local variable
for reuse in subsequent body items. The variable is scoped to the rule body.

```chr
let cost = constructionCost(B)
```

This avoids recomputing expensive host functions multiple times within a
single rule body.

---

## 4. Expressions and Operators

Full expression support with standard precedence (tightest binding last):

| Precedence | Operators   | Associativity | Description           |
|------------|-------------|---------------|-----------------------|
| 1          | `\|\|`      | left          | Logical OR            |
| 2          | `&&`        | left          | Logical AND           |
| 3          | `===`, `!==`| left          | Strict equality       |
| 4          | `<`, `<=`, `>`, `>=`, `in` | left | Comparison, membership |
| 5          | `+`, `-`    | left          | Addition, subtraction |
| 6          | `*`, `/`    | left          | Multiplication, division |
| 7          | unary `!`, unary `-` | right | Negation          |

### Literals

```chr
42              -- number
3.14            -- floating point
"hello"         -- double-quoted string
'world'         -- single-quoted string
true false      -- booleans
null            -- null value
[1, 2, 3]       -- array literal
```

### Identifiers

- **Constraint names:** lowercase-starting identifiers (e.g., `gold`, `turn`)
- **Variables:** uppercase-starting identifiers (e.g., `X`, `Amount`)
- **Anonymous variable:** `_` (matches any value, never bound)
- **Host function/action names:** alphanumeric identifiers

### Function Calls in Expressions

```chr
myFunction(arg1, arg2)
```

Expressions can be nested:

```chr
add(X, mul(Lvl, 5))
```

### The `in` Operator

Binary operator form:

```chr
X in [1, 2, 3]
```

Function-call form (requires `registerBuiltins()`):

```chr
in(X, [1, 2, 3])
```

---

## 5. Built-in Host Functions

22 built-in functions registered via `engine.registerBuiltins()`:

| Function     | Arity | Description                              |
|--------------|-------|------------------------------------------|
| `eq`         | 2     | `a === b` strict equality                |
| `neq`        | 2     | `a !== b` strict inequality              |
| `lt`         | 2     | Numeric less-than                        |
| `lte`        | 2     | Numeric less-than-or-equal               |
| `gt`         | 2     | Numeric greater-than                     |
| `gte`        | 2     | Numeric greater-than-or-equal            |
| `add`        | 2     | Numeric addition                         |
| `sub`        | 2     | Numeric subtraction                      |
| `mul`        | 2     | Numeric multiplication                   |
| `div`        | 2     | Numeric division (throws on zero)        |
| `mod`        | 2     | Modulo (throws on zero divisor)          |
| `min`        | 2     | Numeric minimum                          |
| `max`        | 2     | Numeric maximum                          |
| `abs`        | 1     | Absolute value                           |
| `not`        | 1     | Boolean negation                         |
| `isNumber`   | 1     | Type check: number                       |
| `isString`   | 1     | Type check: string                       |
| `isBoolean`  | 1     | Type check: boolean                      |
| `isNull`     | 1     | Type check: null                         |
| `stringLength`| 1    | String length                            |
| `stringConcat`| 2    | String concatenation (coerces non-strings)|
| `allDifferent`| N    | Variadic; all values distinct. Also accepts single array argument: `allDifferent([1,2,3])` |
| `in`         | 2     | Array membership check: `in(value, array)` |
| `lookup`     | 1     | Query store by name (see §6)             |
| `lookupOne`  | 2     | Query store by name + arg index (see §6) |

Numeric functions coerce operands to numbers and throw on non-numeric input.
String functions coerce non-string arguments in concatenation.

---

## 6. Constraint Query Functions (lookup)

Two builtin functions allow reading constraint data from the store at runtime
without consuming the constraint:

### lookup(name)

Returns an array of argument-tuples for all constraints with the given name:

```chr
research_in_progress @ research(F, P) ==> lookup('technology') | ...
```

```typescript
// Returns: [['agriculture'], ['mining'], ...]
```

### lookupOne(name, index)

Returns the argument at the specified index of the first matching constraint.
Throws if no constraint with that name exists.

```chr
check_tech @ command('check', _, _) ==> lt(lookupOne('technology', 0), ...) | ...;
```

These enable non-destructive reads — the constraint remains in the store
after the query.

---

## 7. Host Module System

### Defining Host Modules

```typescript
import { defineHostModule } from 'chr-ts'

const myModule = defineHostModule({
  functions: {
    myFunc: (_ctx, a, b) => a + b
  },
  actions: {
    myAction: (ctx) => {
      ctx.store.add('result', [ctx.args[0]])
    }
  }
})
```

### Registering Modules

```typescript
engine.registerHostModule('myModule', myModule)
engine.registerBuiltins()
```

### Importing from Source

```chr
import host builtins;
import host myModule;
```

This makes all functions and actions from the module available for use in
guards and body actions.

### Host Function/Action Context

Every host function receives a context object:

```typescript
interface HostFunctionContext {
  engine: CHREngine           // The engine instance
  store: ConstraintStore      // The constraint store
  history: PropagationHistory // Propagation history
  rule: RuleNode              // The currently firing rule
  matched: ConstraintRecord[] // Matched constraints
  bindings: Record<string, unknown> // Variable bindings
}
```

Host actions additionally receive `args: unknown[]`.

---

## 8. Typed Engine API

The `withConstraints<T>()` method returns a type-safe wrapper:

```typescript
const engine = new CHREngine()
const typed = engine.withConstraints<{
  gold: [number]
  population: [number]
  has_building: [string, number]
}>()

// Type-safe: only accepts gold(number), population(number), has_building(string, number)
await typed.assert('gold', [100])
await typed.assert('has_building', ['village', 1])
```

The generic parameter is a record mapping constraint names to tuples of
argument types. Incorrect argument types or arities are caught at compile time
(in TypeScript projects).

---

## 9. Test DSL (expect)

The `expect()` method provides a fluent assertion API for tests:

```typescript
// Check that a constraint exists
engine.expect('fib', [5, 5]).exists()

// Check that a constraint is missing
engine.expect('fib', [5, 6]).missing()

// Check exact count
engine.expect('fib', [5, 5]).count(1)
```

This is designed for use with Node's built-in `node:test` framework:

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

---

## 10. File Loader

Rules can be loaded from external `.chr` files at runtime:

```typescript
engine.load('./rules.chr')
```

This wraps `fs.readFileSync` (Node.js only). In non-Node environments the
method throws. The loaded source is parsed and rules are added via
`addRules()`.

---

## 11. Programmatic Rule Construction

Rules can be constructed programmatically without parsing source:

```typescript
engine.addRule({
  kind: 'propagation',
  kept: [{ name: 'a', args: [] }],
  removed: [],
  guard: [],
  body: [{ type: 'constraint', constraint: { name: 'b', args: [] } }],
  priority: 10
})
```

Available fields:

| Field      | Type              | Required | Description              |
|------------|-------------------|----------|--------------------------|
| `name`     | `string`          | no       | Rule name for diagnostics|
| `kind`     | `RuleKind`        | yes      | `'propagation'` \| `'simplification'` \| `'simpagation'` |
| `kept`     | `ConstraintPattern[]` | yes  | Head patterns to keep    |
| `removed`  | `ConstraintPattern[]` | yes  | Head patterns to remove  |
| `guard`    | `Expression[]`    | yes      | Guard expressions        |
| `body`     | `BodyItem[]`      | yes      | Body actions/constraints |
| `priority` | `number`          | no       | Firing priority (higher = first) |
| `unify`    | `boolean`         | no       | Use unification matching |

---

## 12. Constraint Store

### Public Store Access

The engine exposes the store directly:

```typescript
engine.store.add('gold', [100])
engine.store.remove(record.id)
const records = engine.store.lookup('gold', 1)
```

### Store API

| Method       | Signature                                  | Description                            |
|-------------|--------------------------------------------|----------------------------------------|
| `add`       | `(name, args, metadata?) => ConstraintRecord` | Add constraint, returns record with id |
| `get`       | `(id) => ConstraintRecord \| undefined`    | Get by id                              |
| `has`       | `(id) => boolean`                          | Check existence by id                  |
| `remove`    | `(id) => boolean`                          | Remove by id                           |
| `lookupByName` | `(name) => ConstraintRecord[]`          | All constraints with name, sorted by id|
| `lookup`    | `(name, arity) => ConstraintRecord[]`      | By functor (name + arity), sorted      |
| `clear`     | `() => void`                               | Remove all, reset sequence             |
| `invalidate`| `() => void`                               | Clear + set invalid flag               |
| `size`      | `() => number`                             | Count of constraints                   |
| `functors`  | `() => string[]`                           | All functors as `"name/arity"`         |
| `entries`   | `() => Array<{ id, record }>`              | All entries with ids                   |
| `find`      | `(predicate) => ConstraintRecord[]`        | Filter by predicate function           |
| `forEach`   | `(callback) => void`                       | Iterate all constraints                |
| `map`       | `<T>(callback) => T[]`                     | Transform all constraints              |
| `args`      | `(id) => unknown[]`                        | Defensive copy of args for an id       |
| `allAlive`  | `(ids) => boolean`                         | Bulk existence check                   |
| `snapshot`  | `() => StoreSnapshotEntry[]`               | Ordered snapshot of all constraints    |
| `toJSON`    | `() => StoreSnapshotEntry[]`               | Alias for snapshot (serialization)     |
| `toString`  | `() => string`                             | Formatted table display                |
| `invalid`   | `() => boolean`                            | Invalid flag getter                    |

### Store Hooks

```typescript
const store = new ConstraintStore({
  onAdd: (record) => console.log('added', record),
  onRemove: (record) => console.log('removed', record)
})
```

---

## 13. Store Strict Mode

The constraint store can enforce invariants for debugging:

```typescript
// Strict mode: throws on invariant violation
const store = new ConstraintStore({}, { strict: true })

// Warn mode: logs violations instead of throwing
const store = new ConstraintStore({}, { strict: 'warn' })

// Disabled: no invariant checking (default)
const store = new ConstraintStore({}, { strict: false })
```

Invariants checked:
- `nextId = max(id) + 1` — ID sequence is never corrupted
- `byFunctor` index is consistent with `byId` index — internal indices
  are never out of sync

---

## 14. Propagation History

The engine tracks which rules have fired on which constraint IDs to prevent
infinite loops in propagation rules.

```typescript
history.add('ruleName', [1, 2, 3])
history.has('ruleName', [1, 2, 3])     // true
history.notIn('ruleName', [1, 2, 3])    // false
history.clear()
const snapshot = history.snapshot()
```

The history uses **order-independent hashing**: `[1, 2]` and `[2, 1]` produce
the same hash, so the order of matched constraints doesn't matter.

---

## 15. Engine Lifecycle

```
  empty ──addRules()/addRule()/addProgram()──▶ ready
   ▲                                            │
   │                                   assert()/assertMany()
   │                                            ▼
   │                                         running
   │                                            │
   │                                    fixpoint reached
   │                                            │
   │                                            ▼
   └──────clear()─────────────────────────── ready
                                                │
                                          error occurs
                                                │
                                                ▼
                                              error
```

States:
- `empty` — initial, no rules loaded
- `ready` — rules loaded, ready to accept assertions
- `running` — currently processing a fixpoint computation
- `error` — unrecoverable error; must create a new engine

```typescript
const state = engine.getState()  // 'empty' | 'ready' | 'running' | 'error'
```

---

## 16. Engine Configuration Options

```typescript
const engine = new CHREngine({
  maxRuleFirings: 5000,           // Max firings before abort (default: 10000)
  hostFunctionTimeout: 1000,      // Async host function timeout in ms (default: no timeout)
  strictHostDeclarations: true,   // Require source-level declarations for all host calls (default: false)
  onRuleFired: (trace) => {      // Callback after each rule fires
    console.log(trace.ruleName, trace.matchedConstraintIds, trace.firedAt)
  }
})
```

### onRuleFired Trace

```typescript
interface RuleFireTrace {
  ruleName: string
  kind: 'propagation' | 'simplification' | 'simpagation'
  priority?: number
  matchedConstraintIds: number[]
  bindings: Record<string, unknown>
  guardResults?: unknown[]
  firedAt?: number       // timestamp (ms) when rule started firing
  durationMs?: number     // execution duration of the rule
}
```

Per-assertion overrides are also supported:

```typescript
await engine.assert('a', [1], { maxRuleFirings: 100 })
await engine.assertMany([{ name: 'a', args: [1] }], { maxRuleFirings: 100 })
```

---

## 17. Validation (Dry-Run)

Before adding rules, you can dry-run validation to catch errors:

```typescript
const result = engine.validate(source)

if (!result.ok) {
  if (result.parseError) {
    console.error('Parse error:', result.parseError.message)
    console.error(formatSourceSpan(source, result.parseError.span))
  }
  for (const err of result.executionErrors) {
    console.error('Execution error:', err.message)
  }
}
```

The validation process also processes `import host` and declaration
statements from the source, so host functions are properly registered before
rule validation. This avoids false positives when validating rules that
reference imported host functions.

---

## 18. Error Types and Diagnostics

### Error Classes

```typescript
class CHRParseError extends Error {
  name: 'CHRParseError'
  span?: SourceSpan    // Source location with line/column/offset
  cause?: Error
}

class CHRExecutionError extends Error {
  name: 'CHRExecutionError'
  span?: SourceSpan
  cause?: Error
}
```

### Error Messages at a Glance

| Error Pattern | Trigger |
|--------------|---------|
| `Unknown host function: <name>. Did you mean <suggestion>?` | Call to unregistered function |
| `Host function <name>/<arity> is not declared in source` | `strictHostDeclarations` enabled, missing declaration |
| `Host function <name>/<arity> violates declared arity <N>` | Arity mismatch in function call |
| `Constraint <name>/<arity> violates declared arity <N>` | Arity mismatch in constraint |
| `Declared function <name>/<arity> is not registered` | Declared in source but no handler registered |
| `Unknown host module '<name>' in import` | `import host` with unregistered module |
| `Maximum rule firings exceeded (<N>)` | Runaway rule loop |
| `Unbound variable <X> in rule <name>` | Variable used before bound |
| `Host function <name> timed out after <N>ms` | Async function exceeded timeout |
| `Host function <name> threw in rule <name>: <message>` | Error in host function during body evaluation |
| `Host action <name> threw in rule <name>: <message>` | Error in host action during body evaluation |
| `Rule body is empty in: ...` | Rule with no body |
| `Could not split rule operator ...` | Malformed rule operator |
| `Parse error near top-level statement at line N, column M: ...` | General parse error with location |

### Source Span Formatting

```typescript
import { formatSourceSpan } from 'chr-ts'

console.log(formatSourceSpan(source, error.span))
// Output:
//   myRule @ a(X) ==> broken() | ok;
//                    ^^^^^^^
```

### Error Cause Chaining

Errors thrown by host functions/actions are chained as `cause`:

```typescript
try {
  await engine.assert('a', [1])
} catch (error) {
  console.error(error.message)     // "Host function myFunc threw in rule foo: kaboom"
  console.error(error.cause.message) // "kaboom" (original error)
}
```

---

## 19. Rule Diagnostics

### Warnings

The engine accumulates warnings during rule loading:

```typescript
const warnings = engine.getWarnings()
// [
//   "Dead binding 'X' in rule 'myRule': bound in head but never used in guards or body.",
//   "Shadowed variable 'X' appears in multiple head constraints in rule 'myRule'. This is likely a typo.",
//   "Unused function declaration: functions unusedFunc/...",
//   "Unused action declaration: actions unusedAction/..."
// ]
```

Warning types:
- **Dead binding:** Variable bound in head but never used in guards or body
- **Shadowed variable:** Same variable name in multiple heads (usually a typo)
- **Unused declaration:** `functions` or `actions` declared but never referenced by any rule
- **Anonymous variable `_`:** Never generates warnings (by design)

### Pretty-Printing

```typescript
engine.printStore()    // Formatted table of all constraints
// ID  Constraint
// --  ----------
// 1   gold(100)
// 2   population(20)

engine.printHistory()  // Formatted list of rule firing history
engine.printRules()    // Formatted list of loaded rules
engine.getRules()      // Raw RuleNode array
engine.getRulesByHead('gold')  // Rules matching gold constraint
```

---

## 20. Constraint Arity Enforcement

Constraint arities are enforced at multiple levels:

### Declared Arity

```chr
constraint gold/1, population/1;
```

Declaring arity catches mismatches at rule-add time:

- Rule heads that use the wrong arity produce an error
- Body emissions that use the wrong arity produce an error
- `assert()` calls that use the wrong arity produce an error

### Implicit Arity

If no declaration is given, constraints can have any arity (dynamic).

---

## 21. Host Declaration Checking

### Source-Level Function/Action Declarations

```chr
functions goldProd/1, researchCost/1;
actions consumeGold/1, unlockTech/1;
```

These declarations serve two purposes:

1. **Documentation** — Makes the interface contract explicit
2. **Arity validation** — Catches mismatches between declared and used arities

### Strict Mode

When `strictHostDeclarations: true`, ALL host function/action calls in rules
must have a corresponding `functions`/`actions` declaration in the source.
This catches typos in function names.

```typescript
const engine = new CHREngine({ strictHostDeclarations: true })
```

With strict mode, a missing function `golddProd` (typo for `goldProd`) would
be caught at `addRules()` time rather than manifesting as a cryptic runtime
error.

### Auto-Registration

Functions and actions registered via `registerFunction()` /
`registerAction()` are automatically noted in the declarations map, so they
pass strict-mode checking even without explicit source declarations.

---

## 22. Anonymous Variables and Warnings

### Anonymous Variable `_`

The underscore `_` matches any value without binding:

```chr
ignore @ a(_, X) ==> b(X);
```

Key properties:
- Does not produce variable bindings
- Can appear multiple times in the same rule (each `_` is independent)
- Never generates "dead binding" warnings

### Warning Suppression

Warnings about dead bindings and shadowed variables are generated by the
`checkMatchingAndShadowing` pass, which runs during both `validate()` and
`addProgram()`. Anonymous variables (`_`) are excluded from all warning
checks.

---

## 23. Rule Priority

Rules can be assigned numeric priorities to control firing order. Higher
priority rules fire first:

```typescript
engine.addRule({
  kind: 'propagation',
  kept: [{ name: 'a', args: [] }],
  body: [{ type: 'constraint', constraint: { name: 'high', args: [] } }],
  priority: 10
})

engine.addRule({
  kind: 'propagation',
  kept: [{ name: 'a', args: [] }],
  body: [{ type: 'constraint', constraint: { name: 'low', args: [] } }],
  priority: 1
})

await engine.assert('a', [])
// 'high' fires before 'low'
```

Priority is not supported in `.chr` source syntax — only programmatic
`RuleNode` objects support it. Within the same priority level, rules fire
in stable insertion order.

---

## 24. Unification Matching

By default, rules match using strict `===` equality. Rules can opt into
structural unification by setting `unify: true` (programmatic) or prefixing
with `unify` (source syntax):

```chr
unify link @ edge(X, Y), edge(Y, Z) ==> path(X, Z);
```

Unification recursively destructures terms and builds a substitution map,
enabling pattern matching against nested structures. The `_` anonymous
variable is never bound even during unification.

```typescript
engine.addRule({
  kind: 'propagation',
  kept: [{ name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] }],
  removed: [],
  guard: [],
  body: [{ type: 'constraint', constraint: { name: 'matched', args: [{ type: 'variable', name: 'X' }] } }],
  unify: true
})
```

Both strict and unification rules can coexist in the same engine.

---

## 25. In-Place Constraint Update

The `<=` body item syntax updates an existing constraint in-place:

```chr
production @ tick, gold(G) <=> gold(add(G, goldProd(Lvl)));
```

This is syntactic sugar that performs a `store.remove()` + `store.add()`
atomically in the body. It's equivalent to:

```chr
production @ tick, gold(G) <=> !consumeGold(-goldProd(Lvl));
```

But more concise and declarative. The update finds constraints matching the
old pattern by name and argument equality, removes them, and adds the new
constraint.

---

## 26. Let Bindings in Rule Bodies

The `let` body item caches the result of an expression in a local variable:

```chr
build_cost @ command('build', B, _), gold(G) ==>
    let cost = constructionCost(B)
    | gt(G, cost), !consumeGold(cost), building_progress(B, 0);
```

Without `let`, `constructionCost(B)` would be evaluated twice (once in the
guard and once in the body). With `let`, it's evaluated once in the body and
the result is reused.

Key properties:
- The variable is scoped to the rule body
- The `let` expression is evaluated after guards pass (so the guard can
  still reference the function)
- Multiple `let` bindings can be chained

---

## 27. Constraint Query in Guards (lookup/2)

Two builtin functions allow reading constraint data during guard evaluation:

```chr
has_tech @ command('research', F, _) ==>
    not(lookup('technology').includes(F))
    | research(F, 0);
```

```chr
check_stored @ command('check', _, _) ==>
    eq(lookupOne('gold', 0), 100)
    | balanced;
```

- `lookup(name)`: Returns an array of argument-tuples (arrays) for all
  constraints with the given name
- `lookupOne(name, index)`: Returns the argument at the given index from
  the first matching constraint. Throws if no constraint with that name
  exists.

These enable non-destructive reads — the queried constraints remain in the
store after the guard evaluates.

---

## 28. Host Function Timeout

Asynchronous host functions can be given a timeout to prevent hanging:

```typescript
const engine = new CHREngine({
  hostFunctionTimeout: 100   // ms
})

engine.registerFunction('fetchData', async () => {
  await new Promise(resolve => setTimeout(resolve, 10000))
  return 'data'
})

engine.addRules('slow @ a(X) ==> fetchData() | ok;')
await engine.assert('a', [1])
// 'ok' is NOT added — the host function timed out
```

When a timeout is exceeded, the rule is skipped (as if the guard failed).
Fast functions are unaffected by the timeout.

---

## 29. One-Shot Engine Setup (createEngine)

The `createEngine()` convenience function sets up an engine in one call:

```typescript
import { createEngine } from 'chr-ts'

const engine = createEngine({
  source: 'myRules.chr',       // .chr source string
  host: {                      // Host module definition
    functions: { myFunc: (ctx, a) => a * 2 },
    actions: { myAction: (ctx) => { /* ... */ } }
  },
  builtins: true,              // Register built-in functions
  maxRuleFirings: 5000         // Optional override
})
```

The result is a fully configured `CHREngine` instance with rules loaded,
host functions registered, and builtins enabled.

---

## 30. Engine Snapshots

The complete engine state can be captured and inspected:

```typescript
const snapshot = engine.snapshot()
// {
//   rules: [{ name: 'myRule', kind: 'propagation' }, ...],
//   constraints: [{ id: 1, name: 'gold', arity: 1, args: [100] }, ...],
//   history: { myRule: ['1:2'], ... }
// }
```

The snapshot includes all loaded rules, all current constraint store entries
(with IDs, names, arities, and args), and the full propagation history.

---

## 31. Node.js Built-in Test Runner Integration

The `expect()` method and error classes are designed for use with Node's
`node:test` framework (no external test dependencies):

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from 'chr-ts'

test('my rule works', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('myRule @ a(X) ==> b(X);')
  await engine.assert('a', [42])
  assert.equal(engine.store.lookup('b', 1).length, 1)
  assert.ok(engine.expect('b', [42]).exists())
})
```

The `formatSourceSpan` utility provides detailed error displays:

```typescript
test('parse error shows span', () => {
  assert.throws(() => {
    engine.addRules('a ==>')
  }, /Rule body is empty/)
})
```

---

## 32. Error Cause Chaining

All runtime errors from host functions and actions preserve the original
error as `.cause`:

```typescript
engine.registerAction('fail', () => {
  throw new Error('original error')
})
engine.addRules('crash @ a() ==> true | !fail();')

try {
  await engine.assert('a', [])
} catch (error) {
  console.error(error.message)     // "Host action fail threw in rule crash: original error"
  console.error(error.cause.message) // "original error"
  console.error(error.cause instanceof Error) // true
}
```

This follows the ECMAScript `Error.cause` convention, enabling proper error
diagnosis in production.
