# Tutorial: Calling TypeScript Functions from CHR Rules

## Table of Contents

1. [How Host Interop Works](#1-how-host-interop-works)
2. [Quick Start: Your First Rule](#2-quick-start-your-first-rule)
3. [Functions in Guards](#3-functions-in-guards)
4. [Functions in Body Expressions](#4-functions-in-body-expressions)
5. [Actions for Side Effects](#5-actions-for-side-effects)
6. [Structured Modules with defineHostModule](#6-structured-modules-with-definehostmodule)
7. [Using Built-in Functions](#7-using-built-in-functions)
8. [Source-Level Module Imports](#8-source-level-module-imports)
9. [Convenience Loader](#9-convenience-loader)
10. [Strict Declaration Mode](#10-strict-declaration-mode)
11. [Guard Safety: Throws Become Failures](#11-guard-safety-throws-become-failures)
12. [Error Messages and Suggestions](#12-error-messages-and-suggestions)
13. [Full Example: Invoice Approval Pipeline](#13-full-example-invoice-approval-pipeline)
14. [Reference: HostFunctionContext](#14-reference-hostfunctioncontext)

---

## 1. How Host Interop Works

CHR.ts connects TypeScript and CHR through three concepts:

| Concept | CHR Syntax | TypeScript Side |
|---------|-----------|-----------------|
| **Host function** | Called in guards/body expressions as `fn(args...)` | `(_ctx, ...args) => value` |
| **Host action** | Called in body as `!action(args...)` | `(ctx) => void` |
| **Host module** | `import host name;` in source | `{ functions: {...}, actions: {...} }` |

The rule:
1. You **declare** which functions/actions exist (in source or via JS)
2. You **register** the TypeScript implementations
3. The engine **invokes** them at rule-fire time with safe, typed arguments

---

## 2. Quick Start: Your First Rule

```typescript
import { CHREngine } from 'chr-ts'

const engine = new CHREngine()

// Register a host function
engine.registerFunction('isPositive', (_ctx, x) => typeof x === 'number' && x > 0)

// Register a host action
engine.registerAction('log', ({ args }) => console.log(args[0]))

// Load CHR rules referencing those names
engine.addRules(`
  constraint input/1, approved/1;

  functions isPositive/1;
  actions log/1;

  approve @ input(X) ==> isPositive(X) | !log(X), approved(X);
`)

await engine.assert('input', [42])
// Console: 42
// Store now has approved(42)
```

---

## 3. Functions in Guards

Guards determine whether a rule fires. Any function declared as a `HostFunction` can be used:

```typescript
engine.registerFunction('inRange', (_ctx, value, min, max) =>
  typeof value === 'number' && value >= min && value <= max)

engine.addRules(`
  functions inRange/3;

  constraint temp/1, ok/1;

  validate @ temp(X) ==> inRange(X, 18, 35) | ok(X);
`)
```

**Important:** Guard functions should be **pure** (no side effects). If a guard function throws, the engine treats it as a failed guard — the rule simply doesn't fire.

### Multiple Guards

Separate multiple guard calls with commas — they act as a conjunction (AND):

```typescript
engine.addRules(`
  functions isString/1, gt/2;

  check @ input(X) ==> isString(X), gt(stringLength(X), 0) | ok(X);
`)
```

### Functions Returning Promises

Host functions can be async:

```typescript
engine.registerFunction('verifyAsync', async (_ctx, id) => {
  const result = await someApi.check(id)
  return result.valid
})
```

---

## 4. Functions in Body Expressions

Functions can compute values for emitted constraint arguments:

```typescript
engine.registerFunction('addTax', (_ctx, amount) =>
  typeof amount === 'number' ? amount * 0.08 + amount : amount)

engine.addRules(`
  functions addTax/1;

  constraint purchase/1, invoice/1;

  generate @ purchase(X) ==> invoice(addTax(X));
`)
```

### Chaining Functions

Functions compose naturally in expressions:

```typescript
engine.registerFunction('discount', (_ctx, amount) =>
  typeof amount === 'number' ? amount * 0.9 : amount)

engine.registerFunction('round', (_ctx, amount) =>
  typeof amount === 'number' ? Math.round(amount * 100) / 100 : amount)

engine.addRules(`
  functions discount/1, round/1;

  constraint order/1, final/1;

  process @ order(X) ==> final(round(discount(X)));
`)
```

### Functions with Multiple Arguments

```typescript
engine.registerFunction('clamp', (_ctx, value, lo, hi) =>
  Math.max(lo, Math.min(hi, value)))

engine.addRules(`
  functions clamp/3;

  constraint reading/1, normalized/1;

  normalize @ reading(X) ==> normalized(clamp(X, 0, 100));
`)
```

---

## 5. Actions for Side Effects

Actions are invoked with `!actionName(args...)` in the rule body. They receive the full `HostActionContext` including the matched constraints, bindings, store, and history.

### Basic Logging

```typescript
engine.registerAction('log', ({ args }) => {
  console.log('[CHR]', ...args)
})

engine.addRules(`
  actions log/1;

  constraint event/1;

  trace @ event(X) ==> !log("received:", X);
`)
```

### Store Manipulation

Actions can remove constraints from the store:

```typescript
engine.registerAction('cleanup', ({ store, matched, rule }) => {
  const keptCount = rule.kept.length
  // Remove all matched constraints except the kept ones
  for (let i = keptCount; i < matched.length; i++) {
    store.remove(matched[i].id)
  }
})
```

### Composing with Body Constraints

Actions and constraint emissions can be mixed:

```typescript
engine.registerAction('audit', ({ args }) => {
  auditLog.push({ action: args[0], value: args[1], time: Date.now() })
})

engine.addRules(`
  actions audit/2;

  constraint request/1, processed/1;

  handle @ request(X) ==> !audit("processing", X), processed(X);
`)
```

---

## 6. Structured Modules with defineHostModule

For larger projects, group related functions and actions into modules:

```typescript
import { CHREngine, defineHostModule } from 'chr-ts'

const mathModule = defineHostModule({
  functions: {
    clamp: (_ctx, x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    round: (_ctx, x) => Math.round(x),
    avg: (_ctx, a, b) => (a + b) / 2
  }
})

const auditModule = defineHostModule({
  functions: {
    isValidUser: (_ctx, userId) => validUserIds.has(userId)
  },
  actions: {
    audit: ({ args }) => console.log('[AUDIT]', ...args),
    notify: ({ args }) => sendNotification(args[0])
  }
})

const engine = new CHREngine()
engine.registerHost(mathModule)
engine.registerHost(auditModule)
```

`defineHostModule` is a type-safe identity function — it returns its input unchanged but validates the types match `HostModule`.

---

## 7. Using Built-in Functions

The engine ships with 20 built-in functions covering comparisons, arithmetic, type checks, and string operations:

```typescript
engine.registerBuiltins()
```

Now you can use them directly in any rule source:

```chr
functions eq/2, gt/2, add/2, isString/1, stringLength/1;

constraint a/1, b/1;

match    @ a(X) ==> eq(X, 1) | b(X);
positive @ a(X) ==> gt(X, 0) | ok(X);
calc     @ a(X) ==> b(add(X, 1));
check    @ a(X) ==> isString(X), gt(stringLength(X), 3) | ok(X);
```

### Built-in Reference

| Function | Arity | Description |
|----------|-------|-------------|
| `eq` | 2 | `a === b` |
| `neq` | 2 | `a !== b` |
| `lt`, `lte`, `gt`, `gte` | 2 | Numeric comparisons |
| `add`, `sub`, `mul`, `div` | 2 | Arithmetic (`div` throws on zero) |
| `mod` | 2 | Modulo (throws on zero divisor) |
| `min`, `max` | 2 | Numeric min/max |
| `abs` | 1 | Absolute value |
| `isNumber`, `isString`, `isBoolean`, `isNull` | 1 | Type checks |
| `stringLength` | 1 | String length |
| `stringConcat` | 2 | String concatenation |
| `allDifferent` | N | Check all values are distinct |

Use `BuiltinsModule` for manual registration without `registerBuiltins()`:

```typescript
import { BuiltinsModule } from 'chr-ts'
engine.registerHost(BuiltinsModule)
```

---

## 8. Source-Level Module Imports

Instead of registering each function individually, register named modules and import them from source:

```typescript
import { CHREngine, BuiltinsModule } from 'chr-ts'

const engine = new CHREngine()

// Register a module with a name
engine.registerHostModule('builtins', BuiltinsModule)

const math = defineHostModule({
  functions: {
    double: (_ctx, x) => x * 2,
    triple: (_ctx, x) => x * 3
  }
})
engine.registerHostModule('math', math)

// Import from source
engine.addRules(`
  import host builtins;
  import host math;

  constraint n/1, doubled/1, tripled/1;

  dbl @ n(X) ==> gt(X, 0) | doubled(double(X));
  tri @ n(X) ==> tripled(triple(X));
`)
```

Benefits of named modules:
- Functions are auto-declared — no need for explicit `functions name/arity;` lines
- Modules can be shared across projects
- `strictHostDeclarations` is automatically satisfied for imported modules

---

## 9. Convenience Loader

The `createEngine()` helper sets up everything in one call:

```typescript
import { createEngine, BuiltinsModule } from 'chr-ts'

const myModule = {
  functions: {
    isPositive: (_ctx, x) => typeof x === 'number' && x > 0
  }
}

const engine = createEngine({
  source: `
    import host builtins;
    constraint a/1, b/1;
    match @ a(X) ==> gt(X, 0), isPositive(X) | b(X);
  `,
  host: myModule,
  builtins: true,
  maxRuleFirings: 5000
})

await engine.assert('a', [42])
```

---

## 10. Strict Declaration Mode

When `strictHostDeclarations` is enabled, every host function and action call in your CHR source must be declared — either via explicit `functions name/arity;` / `actions name/arity;` declarations or via `import host`:

```typescript
const engine = new CHREngine({ strictHostDeclarations: true })
engine.registerFunction('myFunc', (_ctx, x) => x * 2)

// This will throw at addRules time:
engine.addRules(`constraint a/1, b/1; rule @ a(X) ==> b(myFunc(X));`)
// Error: Host function myFunc/1 is not declared in source.
//         Use "functions myFunc/1;" in the rule source.

// Fix by declaring:
engine.addRules(`
  functions myFunc/1;
  constraint a/1, b/1;
  rule @ a(X) ==> b(myFunc(X));
`)
```

Or use `import host` which auto-declares all module functions:

```typescript
const engine = new CHREngine({ strictHostDeclarations: true })
engine.registerHostModule('myModule', {
  functions: { myFunc: (_ctx, x) => x * 2 }
})
engine.addRules(`
  import host myModule;
  constraint a/1, b/1;
  rule @ a(X) ==> b(myFunc(X));
`)  // OK — myFunc is auto-declared by the import
```

**Why use strict mode?** It catches typos in function names at `addRules` time instead of at runtime:

```typescript
// Typo: "myFuncc" instead of "myFunc"
engine.addRules(`
  functions myFunc/1;
  constraint a/1, b/1;
  rule @ a(X) ==> b(myFuncc(X));
`)
// Without strict mode: runtime error "Unknown host function: myFuncc"
// With strict mode: error at addRules time "Host function myFuncc/1 is not declared"
```

---

## 11. Guard Safety: Throws Become Failures

If a guard function throws an error, the engine treats it as a **guard failure** — the rule simply doesn't fire. This prevents a misbehaving function from crashing the engine:

```typescript
engine.registerFunction('isSafe', (_ctx, x) => {
  if (x === null) throw new Error('Cannot check null')
  return x > 0
})

engine.addRules(`
  functions isSafe/1;
  constraint input/1, ok/1;

  guard @ input(X) ==> isSafe(X) | ok(X);
`)

await engine.assert('input', [null])
// isSafe throws → guard fails → rule doesn't fire
// Engine continues running, no error propagated
// Store still has input(null), no ok constraint
```

Body function calls, however, **do** propagate errors:

```typescript
engine.registerFunction('half', (_ctx, x) => {
  if (typeof x !== 'number') throw new Error('Expected number')
  return x / 2
})

engine.addRules(`
  functions half/1;
  constraint input/1, result/1;

  compute @ input(X) ==> result(half(X));
`)

await engine.assert('input', ['oops'])
// Error: Expected number — propagated because half() is called in body, not guard
```

---

## 12. Error Messages and Suggestions

When you misspell a function name, the engine suggests the closest match:

```typescript
engine.registerBuiltins()
engine.addRules(`
  constraint a/1, b/1;
  match @ a(X) ==> gtString(X, 0) | b(X);
`)

await engine.assert('a', [1])
// Error: Unknown host function: gtString. Did you mean gte?
```

### Common Errors

| Error | Likely Cause |
|-------|-------------|
| `Unknown host function: foo` | Typo in function name, or forgot to register |
| `Host function foo/2 is not declared` | `strictHostDeclarations` is on and no declaration exists |
| `Host function foo/2 violates declared arity 1` | You declared `functions foo/1` but call it with 2 args |
| `Unknown host module 'mymod'` | Named module not registered via `registerHostModule()` |
| `Unknown host action: foo` | Typo in action name, or forgot to register |
| `Unbound variable X` | Variable used in body/guard without being bound in head |

---

## 13. Full Example: Invoice Approval Pipeline

```typescript
import { CHREngine, defineHostModule, createEngine, BuiltinsModule } from 'chr-ts'

// --- 1. Define host modules ---

const financeModule = defineHostModule({
  functions: {
    exceedsLimit: (_ctx, amount, limit) =>
      typeof amount === 'number' && typeof limit === 'number' && amount > limit,
    applyTax: (_ctx, amount) =>
      typeof amount === 'number' ? amount * 1.08 : amount,
    formatCurrency: (_ctx, amount) =>
      `$${(typeof amount === 'number' ? amount : 0).toFixed(2)}`
  },
  actions: {
    sendAlert: ({ args }) => {
      console.log('🚨 ALERT:', args[0])
    },
    logApproval: ({ args }) => {
      console.log(`✅ Approved: ${args[0]} for ${args[1]}`)
    }
  }
})

const validationModule = defineHostModule({
  functions: {
    isValidVendor: (_ctx, vendorId) =>
      ['V001', 'V002', 'V003'].includes(vendorId),
    isReasonableAmount: (_ctx, amount) =>
      typeof amount === 'number' && amount > 0 && amount < 100000,
    previousLatePayments: (_ctx, vendorId) => {
      const lateMap: Record<string, number> = { V001: 0, V002: 2, V003: 1 }
      return lateMap[vendorId as string] ?? 0
    }
  }
})

// --- 2. Set up engine ---

const engine = createEngine({
  source: `
    import host finance;
    import host validation;

    constraint invoice/3, approved/3, flagged/2;

    // Auto-approve small amounts from valid vendors
    auto_approve @
      invoice(Id, Vendor, Amount)
      ==>
      isValidVendor(Vendor),
      isReasonableAmount(Amount),
      lt(Amount, 1000)
      |
      !logApproval(Id, formatCurrency(Amount)),
      approved(Id, Vendor, applyTax(Amount));

    // Flag large invoices for manual review
    flag_large @
      invoice(Id, Vendor, Amount)
      ==>
      exceedsLimit(Amount, 10000)
      |
      !sendAlert("Large invoice requires review: " + Id),
      flagged(Id, Amount);

    // Flag vendors with history of late payments
    flag_risky @
      invoice(Id, Vendor, Amount)
      ==>
      gt(previousLatePayments(Vendor), 0),
      exceedsLimit(Amount, 5000)
      |
      !sendAlert("Risky vendor: " + Vendor + " for " + formatCurrency(Amount)),
      flagged(Id, Amount);
  `,
  builtins: true,
  maxRuleFirings: 10000
})

engine.registerHostModule('finance', financeModule)
engine.registerHostModule('validation', validationModule)

// --- 3. Run the pipeline ---

await engine.assert('invoice', ['INV-001', 'V001', 500])
await engine.assert('invoice', ['INV-002', 'V002', 15000])
await engine.assert('invoice', ['INV-003', 'V003', 7500])

console.log('\nFinal store:')
console.log(engine.store.snapshot())
```

---

## 14. Reference: HostFunctionContext

Every host function receives a context object as its first argument:

```typescript
interface HostFunctionContext {
  engine: CHREngine      // The engine instance
  store: ConstraintStore  // The constraint store
  history: PropagationHistory // Propagation history
  rule: RuleNode          // The currently firing rule
  matched: ConstraintRecord[] // Matched constraint records
  bindings: Record<string, unknown> // Variable bindings
}
```

Actions receive `HostActionContext` which extends this with `args`:

```typescript
interface HostActionContext extends HostFunctionContext {
  args: unknown[]  // Evaluated arguments from the rule body
}
```

### GuardFunction Type

Guards can be typed more strictly:

```typescript
import type { GuardFunction } from 'chr-ts'

const isPositive: GuardFunction = (_ctx, x) =>
  typeof x === 'number' && x > 0
```
