# CHR.ts Tutorial: Finance, Security & Automation

*A practical guide to building rule-based systems with Constraint Handling Rules in TypeScript*

**Version:** 0.1.0 | **Audience:** Developers | **Difficulty:** Beginner to Advanced

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Installation & Setup](#2-installation--setup)
3. [CHR in 5 Minutes](#3-chr-in-5-minutes)
4. [Three Rule Types](#4-three-rule-types)
5. [Host Functions: Calling TypeScript from Rules](#5-host-functions-calling-typescript-from-rules)
6. [Host Actions: Side Effects](#6-host-actions-side-effects)
7. [Guards: Controlling When Rules Fire](#7-guards-controlling-when-rules-fire)
8. [Built-in Functions](#8-built-in-functions)
9. [Module System & Imports](#9-module-system--imports)
10. [Expressions in Depth](#10-expressions-in-depth)
11. [Multi-Head Rules & Joins](#11-multi-head-rules--joins)
12. [Unification Rules](#12-unification-rules)
13. [Constraint Declarations & Arity Safety](#13-constraint-declarations--arity-safety)
14. [Error Handling](#14-error-handling)
15. [Debugging & Diagnostics](#15-debugging--diagnostics)
16. [Runaway Protection](#16-runaway-protection)
17. [Store Operations](#17-store-operations)
18. [Finance Case Study: Invoice Processing Pipeline](#18-finance-case-study-invoice-processing-pipeline)
19. [Security Case Study: Intrusion Response System](#19-security-case-study-intrusion-response-system)
20. [Automation Case Study: Industrial IoT Monitor](#20-automation-case-study-industrial-iot-monitor)

---

## 1. Introduction

### What is CHR.ts?

CHR.ts is a TypeScript implementation of **Constraint Handling Rules (CHR)**, a high-level declarative rule-based language. You write `if-then` rules over a growing set of facts (constraints), and the engine automatically fires rules as new facts arrive.

### Why CHR for Finance, Security & Automation?

These domains share a common pattern:

- **Event-driven** -- Things happen (invoices arrive, alerts fire, sensor readings come in)
- **Stateful** -- You accumulate facts over time
- **Rule-heavy** -- Business logic is best expressed as rules
- **Auditable** -- You need to know why decisions were made

CHR.ts gives you:

- **Forward chaining** -- Rules fire automatically as facts arrive
- **Declarative rules** -- Express *what*, not *how*
- **TypeScript interop** -- Call existing TS code from rules
- **Diagnostics** -- Trace every rule firing with timing

### What You'll Build

| Case Study | Domain | Rules | Concepts Demonstrated |
|-----------|--------|-------|----------------------|
| Invoice Processing | Finance | 6 | Propagation, guards, host functions, actions, modules |
| Intrusion Response | Security | 7 | Simpagation, priority, multi-head joins, escalation |
| IoT Monitor | Automation | 8 | Unification, history, timeouts, store queries |

---

## 2. Installation & Setup

### Prerequisites

- Node.js 18+ (ESM support)
- TypeScript 5.9+

### Install

```bash
npm install chr-ts
```

### Project Setup

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true
  }
}
```

```json
// package.json
{
  "type": "module",
  "dependencies": {
    "chr-ts": "^0.1.0"
  }
}
```

### Quick Smoke Test

```typescript
import { CHREngine } from 'chr-ts'

const engine = new CHREngine()
engine.addRules('hello @ greet(X) ==> hello(X);')
await engine.assert('greet', ['world'])
console.log(engine.store.snapshot())
// [ { name: 'hello', arity: 1, args: ['world'], id: 1 } ]
```

---

## 3. CHR in 5 Minutes

### Core Concepts

| Term | Meaning | Example |
|------|---------|---------|
| **Constraint** | A fact in the store | `price('AAPL', 150)` |
| **Rule** | If-then logic over constraints | `price(S, P) ==> P > 100 \| alert(S)` |
| **Guard** | Condition that must be true | `P > 100` |
| **Body** | What happens when rule fires | `alert(S)` |
| **Store** | Container of all constraints | Engine's working memory |
| **Propagation history** | Prevents infinite loops | Tracks which rule fired on which IDs |

### Your First Rule

```typescript
import { CHREngine } from 'chr-ts'

const engine = new CHREngine()

// When a price update arrives for a stock over $100, emit an alert
engine.addRules(`
  constraint price/2, alert/1;
  high_price @ price(Symbol, Price) ==> Price > 100 | alert(Symbol);
`)

await engine.assert('price', ['AAPL', 150])
const alerts = engine.store.lookup('alert', 1)
console.log(alerts[0].args[0]) // 'AAPL'
```

### Lifecycle

```
empty  --addRules()-->  ready  --assert()-->  running  --fixpoint-->  ready
                           ^                                            |
                           |----------------clear()---------------------|
```

---

## 4. Three Rule Types

CHR has three rule forms. Every CHR.ts programmer must understand these.

### Propagation (`==>`)

Keeps all matched constraints, adds body constraints.

```
trigger ==> guard | effect
```

```typescript
engine.addRules(`
  constraint order/2, audit/2;
  log_order @ order(Id, Amount) ==> Amount > 1000 | audit(Id, Amount);
`)

await engine.assert('order', ['ORD-1', 500])
await engine.assert('order', ['ORD-2', 1500])

console.log(engine.store.lookup('audit', 2).length) // 1 (only ORD-2)
console.log(engine.store.lookup('order', 2).length) // 2 (both kept)
```

### Simplification (`<=>`)

Removes matched constraints, adds body constraints. Use for state transitions.

```
old_state <=> guard | new_state
```

```typescript
engine.addRules(`
  constraint pending/2, fulfilled/2;
  fulfill @ pending(Id, Item) <=> fulfilled(Id, Item);
`)

await engine.assert('pending', ['REQ-1', 'widget'])
console.log(engine.store.lookup('pending', 2).length) // 0
console.log(engine.store.lookup('fulfilled', 2).length) // 1
```

### Simpagation (`\ <=>`)

Keeps some constraints, removes others. The most precise rule type.

```
kept \ removed <=> guard | effect
```

```typescript
engine.addRules(`
  constraint config/2, request/2, response/2;
  serve @ config(Key, Val) \\ request(Key, _) <=> response(Key, Val);
`)

await engine.assert('config', ['timeout', '30s'])
await engine.assert('request', ['timeout', 'ignored'])
console.log(engine.store.lookup('config', 2).length) // 1 (kept)
console.log(engine.store.lookup('request', 2).length) // 0 (removed)
console.log(engine.store.lookup('response', 2).length) // 1
```

### When to Use Which

| Rule Type | Keeps Heads | Removes Heads | Use Case |
|-----------|-----------|--------------|----------|
| Propagation | All | None | Monitoring, alerts, logging, derivation |
| Simplification | None | All | State machines, workflows, pipelines |
| Simpagation | Some | Some | Caching, configuration lookup, aggregation |

---

## 5. Host Functions: Calling TypeScript from Rules

Host functions let you call TypeScript code from CHR guards and body expressions.

### Registering a Function

```typescript
import { CHREngine } from 'chr-ts'

const engine = new CHREngine()

engine.registerFunction('isHighValue', (_ctx, amount: unknown) => {
  return typeof amount === 'number' && amount > 10000
})
```

### Using in Guards

```typescript
engine.addRules(`
  functions isHighValue/1;
  constraint transaction/2, flagged/1;
  flag @ transaction(Id, Amt) ==> isHighValue(Amt) | flagged(Id);
`)

await engine.assert('transaction', ['TXN-1', 50000])
```

### Using in Body Expressions

Functions can compute values for emitted constraint arguments:

```typescript
engine.registerFunction('applyFee', (_ctx, amount: unknown) => {
  return typeof amount === 'number' ? amount + 25 : amount
})

engine.addRules(`
  functions applyFee/1;
  constraint deposit/2, processed/2;
  process @ deposit(Id, Amt) ==> processed(Id, applyFee(Amt));
`)

await engine.assert('deposit', ['DEP-1', 1000])
// processed('DEP-1', 1025)
```

### Async Functions

Host functions can return Promises. The engine awaits them automatically.

```typescript
engine.registerFunction('checkFraud', async (_ctx, userId: unknown) => {
  const response = await fetch(`https://fraud-api/check/${userId}`)
  const data = await response.json()
  return data.risk === 'low'
})

engine.addRules(`
  functions checkFraud/1;
  constraint payment/2, approved/2;
  approve @ payment(User, Amt) ==> checkFraud(User) | approved(User, Amt);
`)
```

### Function Context

Every host function receives a context object as the first argument:

```typescript
interface HostFunctionContext {
  engine: CHREngine           // The engine instance
  store: ConstraintStore      // Access to all constraints
  history: PropagationHistory // Rule firing history
  rule: RuleNode              // Currently firing rule
  matched: ConstraintRecord[] // Matched constraints
  bindings: Record<string, unknown> // Variable bindings
}
```

### Registering Multiple Functions

```typescript
engine.registerFunctions({
  isPositive: (_ctx, x) => typeof x === 'number' && x > 0,
  isNegative: (_ctx, x) => typeof x === 'number' && x < 0,
  isZero: (_ctx, x) => x === 0
})
```

---

## 6. Host Actions: Side Effects

Actions are TypeScript functions called from rule bodies using the `!` prefix. They can modify the store directly and perform I/O.

### Basic Action

```typescript
engine.registerAction('notify', ({ args }) => {
  console.log(`[NOTIFICATION] ${args[0]}: ${args[1]}`)
})

engine.addRules(`
  actions notify/2;
  constraint alert/2;
  issue @ alert(Severity, Msg) ==> !notify(Severity, Msg);
`)
```

### Action Context

Actions receive `HostActionContext` which extends `HostFunctionContext`:

```typescript
interface HostActionContext extends HostFunctionContext {
  args: unknown[] // Evaluated arguments from the rule body
}
```

### Store Manipulation from Actions

Actions can add, remove, or update constraints in the store:

```typescript
engine.registerAction('deduct', (ctx) => {
  const accountId = ctx.args[0] as string
  const amount = ctx.args[1] as number

  // Find the balance constraint for this account
  const balances = ctx.store.lookup('balance', 2)
  const account = balances.find(b => b.args[0] === accountId)

  if (account) {
    const currentBalance = account.args[1] as number
    const newBalance = currentBalance - amount

    // Atomic replace: remove old, add new
    ctx.store.remove(account.id)
    ctx.store.add('balance', [accountId, newBalance])
  }
})

engine.addRules(`
  actions deduct/2;
  constraint withdrawal/3, receipt/3;
  process @ withdrawal(Id, Acct, Amt) ==> !deduct(Acct, Amt), receipt(Id, Acct, Amt);
`)
```

### Registering Multiple Actions

```typescript
engine.registerActions({
  log: ({ args }) => console.log('[LOG]', ...args),
  audit: ({ args }) => writeAuditLog(args[0], args[1]),
  revert: (ctx) => rollbackTransaction(ctx.args[0])
})
```

---

## 7. Guards: Controlling When Rules Fire

Guards are conditions that must all be true for a rule to fire. Multiple guard expressions are comma-separated and treated as AND.

### Basic Guards

```typescript
engine.registerFunction('isValidUser', (_ctx, id) =>
  ['alice', 'bob', 'charlie'].includes(id as string)
)

engine.addRules(`
  functions isValidUser/1;
  constraint login/2, session/2;
  allow @ login(User, Pass) ==> isValidUser(User), Pass !== '' | session(User, 'active');
`)
```

### Combining Multiple Conditions

```typescript
engine.addRules(`
  constraint trade/4, executed/4;
  execute @ trade(Id, Sym, Price, Qty) ==>
    Price > 0,
    Qty > 0,
    Qty <= 10000,
    Price * Qty < 1000000
  | executed(Id, Sym, Price, Qty);
`)
```

### Using `||` (OR) in Guards

```typescript
engine.addRules(`
  constraint speed/1, warning/1;
  overspeed @ speed(Kph) ==> Kph > 100 || Kph < 20 | warning(Kph);
`)
```

### Using `!` (NOT) in Guards

```typescript
engine.registerBuiltins()
engine.addRules(`
  constraint item/1, safe/1;
  check @ item(X) ==> !eq(X, 'forbidden') | safe(X);
`)
```

### Logical Operator Precedence

```
1.  ||    (lowest)
2.  &&
3.  ===  !==
4.  <  <=  >  >=  in
5.  +  -
6.  *  /
7.  !  -  (highest, unary)
```

### Guard Safety

If a guard function throws an error, the engine treats it as a **guard failure** -- the rule simply doesn't fire. This prevents a misbehaving function from crashing the engine:

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
// isSafe throws -> guard fails -> rule doesn't fire
// Store still has input(null), no ok constraint
```

### `in` Operator

Check array membership directly in guards:

```typescript
engine.addRules(`
  constraint status/1, allowed/1;
  filter @ status(X) ==> X in ["active", "pending", "approved"] | allowed(X);
`)

await engine.assert('status', ['active'])   // allowed emitted
await engine.assert('status', ['banned'])   // nothing emitted
```

---

## 8. Built-in Functions

Call `engine.registerBuiltins()` to make 22 built-in functions available.

### Comparison

| Function | Description | Example |
|----------|-------------|---------|
| `eq(a, b)` | Strict equality | `eq(X, 1)` |
| `neq(a, b)` | Strict inequality | `neq(X, 0)` |
| `gt(a, b)` | Greater than | `gt(Price, 100)` |
| `gte(a, b)` | Greater or equal | `gte(Score, 50)` |
| `lt(a, b)` | Less than | `lt(Age, 18)` |
| `lte(a, b)` | Less or equal | `lte(Risk, 0.05)` |

```typescript
engine.registerBuiltins()
engine.addRules(`
  constraint trade/4, approved/4;
  screen @ trade(Sym, Price, Vol, Risk) ==>
    gt(Price, 0), lte(Risk, 0.05) | approved(Sym, Price, Vol, Risk);
`)
```

### Arithmetic

| Function | Description | Example |
|----------|-------------|---------|
| `add(a, b)` | Addition | `add(Count, 1)` |
| `sub(a, b)` | Subtraction | `sub(Balance, Fee)` |
| `mul(a, b)` | Multiplication | `mul(Price, Qty)` |
| `div(a, b)` | Division | `div(Total, Count)` |
| `mod(a, b)` | Modulo | `mod(Id, 2)` |
| `min(a, b)` | Minimum | `min(Temp, 100)` |
| `max(a, b)` | Maximum | `max(Score, 0)` |
| `abs(a)` | Absolute value | `abs(Difference)` |

```typescript
engine.addRules(`
  constraint calc/1, result/1;
  compute @ calc(X) ==> result(add(mul(X, 2), 1));
`)

await engine.assert('calc', [5])
// result(11)
```

### Type Checks

| Function | Description | Example |
|----------|-------------|---------|
| `isNumber(x)` | Is it a number? | `isNumber(X)` |
| `isString(x)` | Is it a string? | `isString(Name)` |
| `isBoolean(x)` | Is it a boolean? | `isBoolean(Flag)` |
| `isNull(x)` | Is it null? | `isNull(X)` |

```typescript
engine.addRules(`
  constraint value/1, validated/1;
  validate @ value(X) ==> isNumber(X), gt(X, 0) | validated(X);
`)
```

### String Operations

| Function | Description | Example |
|----------|-------------|---------|
| `stringLength(s)` | Length of string | `gt(stringLength(Name), 3)` |
| `stringConcat(a, b)` | Concatenation | `stringConcat(First, Last)` |

```typescript
engine.addRules(`
  constraint name/2, fullName/1;
  combine @ name(First, Last) ==> fullName(stringConcat(First, Last));
`)
```

### allDifferent

Check that all values are distinct (variadic or array form):

```typescript
engine.addRules(`
  constraint items/3, ok/0;
  check @ items(A, B, C) ==> allDifferent(A, B, C) | ok;
`)

// Variadic form:
await engine.assert('items', [1, 2, 3]) // ok emitted
await engine.assert('items', [1, 2, 1]) // nothing

// Array form:
engine.addRules(`
  constraint list/1, unique/0;
  check @ list(X) ==> allDifferent(X) | unique;
`)
await engine.assert('list', [[1, 2, 3]]) // unique emitted
await engine.assert('list', [[1, 1]])    // nothing
```

### Store Query Functions

| Function | Description | Example |
|----------|-------------|---------|
| `lookup(name)` | Returns array of args arrays for all constraints named `name` | `lookup('balance')` |
| `lookupOne(name, idx)` | Returns args[idx] from first match of `name` | `lookupOne('config', 1)` |

```typescript
engine.registerBuiltins()
// lookupOne allows reading the store from within rules
engine.addRules(`
  constraint new_price/2, spread/1;
  check_spread @ new_price(Sym, P) ==> spread(sub(P, lookupOne(Sym, 1)));
`)
```

### Using BuiltinsModule Directly

Instead of `registerBuiltins()`, you can use `BuiltinsModule` directly:

```typescript
import { CHREngine, BuiltinsModule } from 'chr-ts'

const engine = new CHREngine()
engine.registerHost(BuiltinsModule)
// Now all builtins are available
```

---

## 9. Module System & Imports

### Named Host Modules

Register a module with a name, then import it from CHR source:

```typescript
import { CHREngine, defineHostModule, BuiltinsModule } from 'chr-ts'

const engine = new CHREngine()

// Register named modules
engine.registerHostModule('builtins', BuiltinsModule)

const financeModule = defineHostModule({
  functions: {
    isHighValue: (_ctx, amt) => typeof amt === 'number' && amt > 10000,
    applyTax: (_ctx, amt) => typeof amt === 'number' ? amt * 1.08 : amt
  },
  actions: {
    audit: ({ args }) => console.log('[AUDIT]', args[0])
  }
})
engine.registerHostModule('finance', financeModule)
```

### Importing from Source

```chr
import host builtins;
import host finance;

constraint invoice/3, approved/3;

approve @ invoice(Id, Vendor, Amount)
    ==> isHighValue(Amount),
        gt(Amount, 0)
    | !audit(Id), approved(Id, Vendor, applyTax(Amount));
```

### Benefits of Named Modules

1. **Auto-declaration** -- Functions and actions are implicitly declared; no need for `functions name/arity;` lines
2. **Self-documenting** -- `import host finance;` makes dependencies explicit
3. **Encapsulation** -- Modules can be shared across projects

### Multiple Imports

```chr
import host builtins;
import host validation;
import host notification;
import host audit;

constraint order/4, confirmed/4;

process @ order(Id, User, Item, Amt)
    ==> isValidUser(User),
        gt(Amt, 0)
    | !audit('confirm', Id),
      !notify(User, 'Order confirmed'),
      confirmed(Id, User, Item, applyTax(Amt));
```

### Module Resolution

- Modules are resolved at `addRules()` time
- An `import host nonexistent;` statement throws `Unknown host module`
- Duplicate imports are safe (idempotent)

---

## 10. Expressions in Depth

### Arithmetic Expressions

Full infix arithmetic with precedence:

```typescript
engine.addRules(`
  constraint calc/1, result/1;
  compute @ calc(X) ==> result(X + 1 * 2 > 0, X * 3 < 10);
`)
```

### String Literals

Double and single quotes, with escaping:

```typescript
engine.addRules(`
  constraint direction/1, move/1;
  go @ direction(D) ==> D in ["north", "south", "east", "west"] | move(D);
`)
```

### Array Literals

Inline arrays in guards and body expressions:

```typescript
// In guard:
engine.addRules(`
  constraint role/1, hasAccess/0;
  check @ role(R) ==> R in ["admin", "manager"] | hasAccess;
`)

// In body:
engine.registerFunction('contains', (_ctx, value, arr) =>
  (arr as unknown[]).includes(value)
)
engine.addRules(`
  functions contains/2;
  constraint user/1, result/1;
  check @ user(X) ==> result(contains(X, ["a", "b", "c"]));
`)
```

### Logical Operators

```typescript
// AND (comma-separated or &&)
engine.addRules(`
  constraint data/2, ok/0;
  both @ data(A, B) ==> A > 0 && B > 0 | ok;
`)

// OR (||)
engine.addRules(`
  constraint temp/1, warning/0;
  alert @ temp(T) ==> T > 100 || T < 0 | warning;
`)

// NOT (!)
engine.registerBuiltins()
engine.addRules(`
  constraint item/1, safe/0;
  check @ item(X) ==> !eq(X, 'bad') | safe;
`)
```

### Comparison Operators

```typescript
engine.addRules(`
  constraint score/1, result/1;
  compare @ score(S) ==>
    S >= 90 | result('A');
  compare2 @ score(S) ==>
    S >= 80, S < 90 | result('B');
`)
```

### let Bindings in Body

Compute a value once and reuse it in the body:

```typescript
engine.registerBuiltins()
engine.addRules(`
  constraint order/3, invoice/3;
  generate @ order(Id, Qty, Price) ==>
    let Total = mul(Qty, Price),
    let Taxed = add(Total, mul(Total, 0.08))
    | invoice(Id, Qty, Taxed);
`)
```

### Chaining Functions

```typescript
engine.registerFunction('discount', (_ctx, amt) =>
  typeof amt === 'number' ? amt * 0.9 : amt
)
engine.registerFunction('round', (_ctx, amt) =>
  typeof amt === 'number' ? Math.round(amt * 100) / 100 : amt
)

engine.addRules(`
  functions discount/1, round/1;
  constraint total/1, final/1;
  apply @ total(X) ==> final(round(discount(X)));
`)
```

---

## 11. Multi-Head Rules & Joins

Multi-head rules match multiple constraints simultaneously, enabling joins.

### Two-Way Join

```typescript
engine.addRules(`
  constraint user/2, role/2, permission/2;
  grant @ user(U, Dept), role(U, R) ==> permission(U, R);
`)

await engine.assertMany([
  { name: 'user', args: ['alice', 'engineering'] },
  { name: 'role', args: ['alice', 'admin'] }
])

console.log(engine.store.lookup('permission', 2).length) // 1
```

### Three-Way Join

```typescript
engine.addRules(`
  constraint order/3, inventory/2, pricing/2, fulfillment/3;
  fulfill @ order(Id, Item, Qty), inventory(Item, Stock), pricing(Item, Price)
      ==> Stock >= Qty | fulfillment(Id, Item, Qty * Price);
`)
```

### Join on Shared Variable

Variables with the same name must match across heads:

```typescript
engine.addRules(`
  constraint account/2, transaction/3, match/2;
  reconcile @ account(Id, Bal), transaction(Id, Amt, _)
      ==> match(Id, Bal);
`)

// Only matches when account Id == transaction Id
```

### Join with Literal in Head

Match specific values in head constraints:

```typescript
engine.addRules(`
  constraint error/1, handler/2, handled/1;
  auto_handle @ error('timeout'), handler('timeout', Action)
      ==> handled(Action);
`)
```

### Multi-Head Simpagation

```typescript
engine.addRules(`
  constraint cache/2, query/2, result/2;
  serve @ cache(Key, Val) \\ query(Key, _) <=> result(Key, Val);
`)

// cache is kept (can serve multiple queries)
// query is removed (consumed)
```

---

## 12. Unification Rules

Unification matches variables structurally rather than by strict equality. Activate it with the `unify` keyword.

### Why Unification?

Without unification, shared variables must be strictly equal:

```chr
-- strict: X must be the SAME value in both heads
join @ a(X), b(X) ==> c(X);
-- a(1) + b(1) matches, a(1) + b(2) does not
```

With unification, the engine builds a substitution:

```chr
-- unify: builds a substitution map
unify path(X, Y) \ path(Y, Z) ==> path(X, Z);
-- path(a,b) + path(b,c) -> X=a, Y=b, Z=c -> path(a,c)
```

### Transitive Closure Example

```typescript
engine.registerBuiltins()

// Build a transitive closure over a graph
engine.addRules(`
  unify path(X, Y) \ path(Y, Z) ==> path(X, Z);
`)

await engine.assertMany([
  { name: 'path', args: ['a', 'b'] },
  { name: 'path', args: ['b', 'c'] },
  { name: 'path', args: ['c', 'd'] }
])

const paths = engine.store.lookup('path', 2)
// Contains: a-b, b-c, c-d, a-c, a-d, b-d
```

### Unification with Guards

```typescript
engine.addRules(`
  unify edge(X, Y) \ edge(Y, Z) ==> eq(Z, 'target') | result(X, Z);
`)

await engine.assertMany([
  { name: 'edge', args: ['start', 'mid'] },
  { name: 'edge', args: ['mid', 'target'] }
])
// result('start', 'target') because Z unifies to 'target'
```

### Unification with Anonymous Variables

```typescript
engine.addRules(`
  unify connection(_, X) \ connection(_, Y) ==> linked(X, Y);
`)

await engine.assertMany([
  { name: 'connection', args: ['a', 'x'] },
  { name: 'connection', args: ['b', 'x'] }
])
// linked('x', 'x') -- _ matches anything, X and Y both unify to 'x'
```

### Programmatic Unification

```typescript
const engine = new CHREngine()
engine.addRule({
  name: 'transitive',
  kind: 'propagation',
  unify: true,  // Enable unification
  kept: [
    { name: 'link', args: [
      { type: 'variable', name: 'X' },
      { type: 'variable', name: 'Y' }
    ]},
    { name: 'link', args: [
      { type: 'variable', name: 'Y' },
      { type: 'variable', name: 'Z' }
    ]}
  ],
  removed: [],
  guard: [],
  body: [{
    type: 'constraint',
    constraint: {
      name: 'path',
      args: [
        { type: 'variable', name: 'X' },
        { type: 'variable', name: 'Z' }
      ]
    }
  }]
})
```

### Unification vs Strict: When to Use Which

| Scenario | Use | Reason |
|----------|-----|--------|
| Graph traversal, path finding | `unify` | Variables chain through intermediate values |
| Exact key matching | strict (default) | Faster, no substitution overhead |
| Configuration lookup | strict | Keys are exact strings |
| Rule chaining with shared values | `unify` | Automatic variable binding across heads |
| Simple predicates | strict | Clearer intent |

---

## 13. Constraint Declarations & Arity Safety

### Declaring Constraints

Always declare your constraints with arity:

```chr
constraint order/4, approved/4, rejected/1;
```

This enables arity checking at `assert()` time:

```typescript
engine.addRules(`
  constraint user/2, session/1;
  login @ user(Name, Pass) ==> session(Name);
`)

await engine.assert('user', ['alice', 'secret']) // OK
await engine.assert('user', ['bob'])             // Throws: violates declared arity
```

### Arity Checking in Source

The parser also enforces arity for emitted constraints:

```chr
constraints a/1, b/1;
rule @ a(X) ==> b(X, X);  -- Error! b/2 violates declared arity b/1
```

### Declaring Host Functions & Actions

```chr
functions isEligible/1, calculateFee/2;
actions notify/2, escalate/1;
```

### Strict Host Declarations Mode

```typescript
const engine = new CHREngine({ strictHostDeclarations: true })

// This throws at addRules time (not at runtime):
engine.addRules(`
  constraint input/1, ok/1;
  check @ input(X) ==> missingFunc(X) | ok(X);
`)
// Error: Host function missingFunc/1 is not declared in source.
```

### Why Use Strict Mode?

- Catches typos at `addRules()` time instead of at `assert()` time
- Self-documenting: every host dependency is listed
- Prevents silent failures from misspelled function names

### Declaring from Source

```typescript
engine.registerFunction('isPositive', (_ctx, x) => typeof x === 'number' && x > 0)
engine.registerAction('record', ({ args }) => console.log(args[0]))

engine.addRules(`
  functions isPositive/1;
  actions record/1;
  constraint input/1, approved/1;
  approve @ input(X) ==> isPositive(X) | !record(X), approved(X);
`)
```

---

## 14. Error Handling

### Error Types

| Error Class | When | Properties |
|-------------|------|------------|
| `CHRParseError` | Syntax errors in .chr source | `.span`, `.cause` |
| `CHRExecutionError` | Runtime errors during rule firing | `.span`, `.cause` |

### Parse Errors

```typescript
import { CHREngine, parseProgram } from 'chr-ts'

try {
  parseProgram('bad rule no operator;')
} catch (error) {
  console.log(error.message)
  // Shows source line with caret pointer
  console.log(error.span)
  // { start: { line: 1, column: 1, offset: 0 }, end: { ... } }
}
```

### Execution Errors

```typescript
const engine = new CHREngine()
engine.addRules('broken @ input(X) ==> ok(missing(X));')

try {
  await engine.assert('input', [1])
} catch (error) {
  console.log(error.message) // Unknown host function: missing
  console.log(error.span)    // Source location of the call
}
```

### Error Cause Chaining

When a host function or action throws, the error wraps the original:

```typescript
engine.registerFunction('boom', () => { throw new Error('kaboom') })
engine.addRules('fail @ a() ==> boom() | ok;')

try {
  await engine.assert('a', [])
} catch (error) {
  console.log(error.message) // Host function boom threw: kaboom
  console.log(error.cause.message) // kaboom (original error)
}
```

### Guard Errors Are Safe

Errors in guards are treated as guard failures (rule simply doesn't fire):

```typescript
engine.registerFunction('risky', (_ctx, x) => {
  if (x < 0) throw new Error('negative')
  return x > 10
})

engine.addRules(`
  functions risky/1;
  constraint value/1, flagged/1;
  check @ value(X) ==> risky(X) | flagged(X);
`)

await engine.assert('value', [-5])  // Guard fails silently, engine continues
await engine.assert('value', [-5])  // value(-5) remains in store
```

### Common Error Messages

| Error | Likely Cause |
|-------|-------------|
| `Unknown host function: foo` | Typo in function name, or forgot to register |
| `Unknown host action: foo` | Typo in action name, or forgot to register |
| `Host function foo/2 is not declared` | `strictHostDeclarations` is on and no declaration |
| `Host function foo/2 violates declared arity 1` | Called with wrong number of args |
| `Unknown host module 'mymod'` | Module not registered via `registerHostModule()` |
| `Constraint a/2 violates declared arity 1` | Wrong arity in assert or body |
| `Maximum rule firings exceeded` | Runaway rule loop |
| `No rules have been loaded` | Called `assert()` before `addRules()` |
| `Unbound variable X in rule foo` | Variable used in guard/body without head binding |

---

## 15. Debugging & Diagnostics

### Rule Fire Tracing

```typescript
const engine = new CHREngine({
  onRuleFired: (trace) => {
    console.log(`Rule ${trace.ruleName} fired:`)
    console.log(`  Match IDs: ${trace.matchedConstraintIds}`)
    console.log(`  Bindings:`, trace.bindings)
    console.log(`  Duration: ${trace.durationMs}ms`)
  }
})

engine.addRules('step @ seed(X) <=> next(X);')
await engine.assert('seed', [42])
// Output:
// Rule step fired:
//   Match IDs: [1]
//   Bindings: { X: 42 }
//   Duration: 0.12ms
```

### Formatted Store Display

```typescript
const engine = new CHREngine()
engine.addRules('step @ a(X) ==> b(X);')
await engine.assert('a', [1])
console.log(engine.printStore())
// a(1)
// b(1)
```

### Formatted Rule Listing

```typescript
const engine = new CHREngine()
engine.addRules('r1 @ a(X) ==> b(X); r2 @ b(X) ==> c(X);')
console.log(engine.printRules())
// r1: a(_) ==> b(_) [propagation]
// r2: b(_) ==> c(_) [propagation]
```

### Formatted History

```typescript
const engine = new CHREngine()
engine.addRules('r1 @ a(X) ==> b(X);')
await engine.assert('a', [1])
console.log(engine.printHistory())
// r1: [1]
```

### Snapshot

```typescript
const snap = engine.snapshot()
console.log(snap.rules)       // RuleNode[]
console.log(snap.constraints) // StoreSnapshotEntry[]
console.log(snap.history)     // Record<string, string[]>
```

### Dry-Run Validation

Check rules before loading them:

```typescript
const engine = new CHREngine({ strictHostDeclarations: true })
const result = engine.validate('broken @ a ==> missing() | ok;')

if (!result.ok) {
  console.log('Parse error:', result.parseError?.message)
  for (const err of result.executionErrors) {
    console.log('Execution error:', err.message)
  }
}
```

### Warnings

```typescript
const engine = new CHREngine()
engine.addRules(`
  constraint a/1, b/1;
  dead @ a(X) ==> true;  // X is bound but never used
`)

console.log(engine.getWarnings())
// ['Dead binding: X in rule dead']
```

| Warning Type | Description |
|-------------|-------------|
| `Dead binding: X in rule foo` | Variable bound in head but never used in guard/body |
| `Shadowed variable: X in rule foo` | Same variable name used for different values in multi-head |
| `Unused function declaration: foo/1` | Declared but never called in any rule |
| `Unused action declaration: foo/1` | Declared but never used in any rule |

### Query Helpers

```typescript
const engine = new CHREngine()
engine.addRules('step @ a(X) ==> b(X);')
await engine.assert('a', [1])

// Check existence
const result = engine.expect('b', [1])
console.log(result.exists)  // true
console.log(result.count)   // 1

// Find rules by head constraint
const rules = engine.getRulesByHead('a')
console.log(rules.length)   // 1
```

---

## 16. Runaway Protection

### maxRuleFirings

Prevents infinite loops by limiting total rule firings per `assert()`:

```typescript
// Engine-wide default
const engine = new CHREngine({ maxRuleFirings: 1000 })

// Per-assertion override
await engine.assert('spin', [0], { maxRuleFirings: 10 })
```

When exceeded:

```
Error: Maximum rule firings exceeded (10)
```

### Practical Example: Fibonacci

```typescript
const engine = new CHREngine({ maxRuleFirings: 50 })
engine.addRules(`
  fib_step @ upto(Max), fib(A, AV), fib(B, BV)
      ==> B === A + 1, B < Max | fib(B + 1, AV + BV);
`)

await engine.assertMany([
  { name: 'upto', args: [10] },
  { name: 'fib', args: [1, 1] },
  { name: 'fib', args: [2, 1] }
])

const fibs = engine.store.lookup('fib', 2)
console.log(fibs.map(f => f.args))
// [[1, 1], [2, 1], [3, 2], [4, 3], [5, 5], [6, 8], [7, 13], [8, 21], [9, 34], [10, 55]]
```

### Propagation History

The engine automatically prevents the same propagation rule from firing twice on the same constraint IDs:

```typescript
engine.addRules('dup @ a(X), b(Y) ==> c(X, Y);')

await engine.assert('a', [1])
await engine.assert('b', [2])
console.log(engine.store.lookup('c', 2).length) // 1

// Same constraints again -- no duplicate
await engine.assert('a', [1])
console.log(engine.store.lookup('c', 2).length) // still 1
```

### Clear

Reset the engine (store + history) while keeping rules:

```typescript
engine.clear()
console.log(engine.store.size())  // 0
console.log(engine.history.snapshot()) // {}
console.log(engine.getState())    // 'ready'
```

---

## 17. Store Operations

The `ConstraintStore` is accessible directly for diagnostics and advanced use cases.

### Query Methods

```typescript
const store = engine.store

// Lookup by functor
const alerts = store.lookup('alert', 1)

// Lookup by name only
const allAlerts = store.lookupByName('alert')

// Predicate search
const highPriority = store.find((record, name) =>
  name === 'alert' && Number(record.args[0]) > 5
)

// Check if constraints exist
const ids = [1, 2, 3]
const allExist = store.allAlive(ids)
```

### Iteration

```typescript
// forEach
store.forEach((record, id) => {
  console.log(`#${id}: ${record.name}(${record.args})`)
})

// map
const names = store.map((record) => record.name)

// entries with IDs
for (const { id, record } of store.entries()) {
  // ...
}

// Functors (unique name/arity pairs)
const functors = store.functors()
// ['alert/1', 'price/2', 'user/2']
```

### Snapshots

```typescript
// Snapshot (ordered by insertion)
const snap = store.snapshot()
// [{ id: 1, name: 'alert', arity: 1, args: ['high'] }, ...]

// JSON serializable
const json = JSON.stringify(store.toJSON())
```

### Defensive Copy

```typescript
const record = store.add('pair', [1, 2])
const args = store.args(record.id)
args.push(3)  // Does NOT mutate the stored args
console.log(record.args) // [1, 2] (unchanged)
```

### Strict Mode

```typescript
const store = new ConstraintStore({}, { strict: true })
// Enforces: nextId = max(existingIds) + 1 after every mutation
```

### Hooks

```typescript
const store = new ConstraintStore({
  onAdd: (record) => console.log(`Added: ${record.name}`),
  onRemove: (record) => console.log(`Removed: ${record.name}`)
})
```

### Invalidation

```typescript
store.invalidate()
console.log(store.invalid) // true
console.log(store.size())  // 0

store.clear()
console.log(store.invalid) // false (reset)
```

### Count

```typescript
console.log(`Store has ${store.size()} constraints`)
```

---

## 18. Finance Case Study: Invoice Processing Pipeline

A complete invoice processing system demonstrating propagation, guards, host functions, actions, and modules.

### The Rules

```chr
-- File: finance.chr
import host builtins;
import host finance;

constraint invoice/3, screened/3, priced/3, approved/3, paid/3, flagged/2;

-- Screen: reject negative amounts
screen_invoice @ invoice(Id, Vendor, Amount)
    <=> gt(Amount, 0)
    | !audit("screen", Id), screened(Id, Vendor, Amount);

-- Apply pricing: add tax for high-value invoices
price_invoice @ screened(Id, Vendor, Amount)
    <=> lt(Amount, 10000)
    | !audit("price", Id), priced(Id, Vendor, Amount);

price_invoice_high @ screened(Id, Vendor, Amount)
    <=> gte(Amount, 10000)
    | !audit("price_high", Id), priced(Id, Vendor, applyTax(Amount));

-- Approve: check vendor eligibility
approve_invoice @ priced(Id, Vendor, Amount)
    <=> isApprovedVendor(Vendor)
    | !audit("approve", Id), approved(Id, Vendor, Amount);

-- Flag suspicious invoices
flag_invoice @ priced(Id, Vendor, Amount)
    <=> isFlaggedVendor(Vendor)
    | !audit("flag", Id), flagged(Id, Vendor);

-- Pay approved invoices
pay_invoice @ approved(Id, Vendor, Amount)
    <=> gt(Amount, 0)
    | !audit("pay", Id), !processPayment(Vendor, Amount), paid(Id, Vendor, Amount);
```

### The TypeScript Host

```typescript
// File: finance.ts
import { CHREngine, defineHostModule, BuiltinsModule } from 'chr-ts'
import { readFileSync } from 'node:fs'

// --- Finance Host Module ---
const financeModule = defineHostModule({
  functions: {
    isApprovedVendor: (_ctx, vendor: unknown) => {
      const approved = ['V001', 'V002', 'V003', 'V004']
      return approved.includes(vendor as string)
    },
    isFlaggedVendor: (_ctx, vendor: unknown) => {
      const flagged = ['V009', 'V999']
      return flagged.includes(vendor as string)
    },
    applyTax: (_ctx, amount: unknown) => {
      return typeof amount === 'number' ? Math.round(amount * 1.08 * 100) / 100 : amount
    }
  },
  actions: {
    audit: ({ args }) => {
      console.log(`[AUDIT] ${args[0]}: ${args[1]}`)
    },
    processPayment: ({ args }) => {
      const vendor = args[0] as string
      const amount = args[1] as number
      console.log(`[PAYMENT] Sending $${amount} to vendor ${vendor}`)
      // In production: call payment API
    }
  }
})

// --- Engine Setup ---
const engine = new CHREngine({
  maxRuleFirings: 100,
  onRuleFired: (trace) => {
    console.log(`  -> ${trace.ruleName} fired (${trace.durationMs}ms)`)
  }
})

engine.registerHostModule('builtins', BuiltinsModule)
engine.registerHostModule('finance', financeModule)
engine.addRules(readFileSync('finance.chr', 'utf8'))

// --- Run Pipeline ---
const invoices = [
  ['INV-001', 'V001', 2500],
  ['INV-002', 'V003', 15000],
  ['INV-003', 'V999', 500],
  ['INV-004', 'V002', -100],   // rejected at screen
]

for (const [id, vendor, amount] of invoices) {
  console.log(`\nProcessing ${id} (${vendor}, $${amount})`)
  try {
    await engine.assert('invoice', [id, vendor, amount])
  } catch (err) {
    console.error(`  Error: ${err.message}`)
  }
}

// --- Results ---
console.log('\n=== RESULTS ===')
console.log(`Paid invoices: ${engine.store.lookup('paid', 3).length}`)
console.log(`Flagged: ${engine.store.lookup('flagged', 2).length}`)
console.log(`Screened: ${engine.store.lookup('screened', 3).length}`)
console.log(engine.printStore())
```

### Expected Output

```
Processing INV-001 (V001, $2500)
  -> screen_invoice fired
  -> price_invoice fired
  -> approve_invoice fired
  -> pay_invoice fired
  [AUDIT] screen: INV-001
  [AUDIT] price: INV-001
  [AUDIT] approve: INV-001
  [AUDIT] pay: INV-001
  [PAYMENT] Sending $2500 to vendor V001

Processing INV-002 (V003, $15000)
  -> screen_invoice fired
  -> price_invoice_high fired
  -> approve_invoice fired
  -> pay_invoice fired
  [AUDIT] screen: INV-002
  [AUDIT] price_high: INV-002
  [AUDIT] approve: INV-002
  [AUDIT] pay: INV-002
  [PAYMENT] Sending $16200 to vendor V003

Processing INV-003 (V999, $500)
  -> screen_invoice fired
  -> price_invoice fired
  -> flag_invoice fired
  [AUDIT] screen: INV-003
  [AUDIT] flag: INV-003

Processing INV-004 (V002, $-100)
  Error: guard failed  (screen_invoice: gt(Amount, 0) is false)
```

---

## 19. Security Case Study: Intrusion Response System

A multi-stage security incident response system using priorities, multi-head joins, simpagation, and escalation rules.

### The Rules

```chr
-- File: security.chr
import host builtins;
import host security;

constraint alert/3, triaged/3, investigated/3, contained/4;
constraint escalated/3, resolved/3, ticket/2;

-- Rule priority: higher number = higher priority
-- Priority 100: Critical alerts bypass triage
critical_escalate @ alert(Host, Sev, Src)
    ==> gte(Sev, 9)
    | !notify('critical', Host), escalated(Host, Sev, Src);
-- priority is implicit (rule order)

-- Priority 50: Normal triage
triage_alert @ alert(Host, Sev, Src)
    <=> gte(Sev, 4), lt(Sev, 9)
    | !log('triaged', Host), triaged(Host, Sev, Src);

-- Priority 40: Low-severity just gets logged
log_alert @ alert(Host, Sev, Src)
    <=> lt(Sev, 4)
    | !log('low', Host);

-- Investigate: match alert with host profile
investigate @ triaged(Host, Sev, Src), profile(Host, Zone, Criticality)
    ==> isCriticalSystem(Criticality)
    | !log('investigating', Host), investigated(Host, Sev, Src);

-- Multi-head containment: match alert + firewall rule
contain @ investigated(Host, Sev, Src), firewall(Host, Zone)
    ==> !blockHost(Host, Zone), contained(Host, Sev, Src, Zone);

-- Escalation: repeated alerts from same host
repeated @ triaged(Host, _, _) \ alert(Host, Sev, Src)
    <=> gte(Sev, 6)
    | !notify('repeat_offender', Host),
      !updateTicket(Host, Sev),
      escalated(Host, Sev, Src);

-- Resolution: everything contained, close the loop
resolve @ contained(Host, _, _, _), ticket(Host, Status)
    ==> eq(Status, 'open')
    | !closeTicket(Host), resolved(Host, 'closed');

-- Cleanup: remove resolved tickets
cleanup @ ticket(Host, _) \ resolved(Host, _) <=> true;
```

### The TypeScript Host

```typescript
// File: security.ts
import { CHREngine, defineHostModule, BuiltinsModule } from 'chr-ts'

interface TicketDb {
  [host: string]: { status: string; severity: number; count: number }
}

const tickets: TicketDb = {}

const securityModule = defineHostModule({
  functions: {
    isCriticalSystem: (_ctx, criticality: unknown) => {
      return (criticality as string) === 'critical'
    }
  },
  actions: {
    log: ({ args }) => {
      console.log(`[SEC] ${args[0]}: ${args[1]}`)
    },
    notify: ({ args }) => {
      const level = args[0] as string
      const host = args[1] as string
      console.log(`[NOTIFY][${level.toUpperCase()}] Incident on ${host}`)
      if (!tickets[host]) {
        tickets[host] = { status: 'open', severity: 0, count: 1 }
      }
    },
    blockHost: ({ args }) => {
      const host = args[0] as string
      const zone = args[1] as string
      console.log(`[BLOCK] ${host} in zone ${zone} -- firewall rule applied`)
    },
    updateTicket: ({ args }) => {
      const host = args[0] as string
      const sev = args[1] as number
      if (tickets[host]) {
        tickets[host].severity = Math.max(tickets[host].severity, sev)
        tickets[host].count++
        console.log(`[TICKET] ${host}: severity=${tickets[host].severity}, count=${tickets[host].count}`)
      }
    },
    closeTicket: ({ args }) => {
      const host = args[0] as string
      if (tickets[host]) {
        tickets[host].status = 'closed'
        console.log(`[TICKET] ${host}: CLOSED`)
      }
    }
  }
})

async function runSecurityScenario() {
  const engine = new CHREngine({
    maxRuleFirings: 200,
    onRuleFired: (trace) => {
      console.log(`  [FIRE] ${trace.ruleName} (${trace.durationMs.toFixed(2)}ms)`)
    }
  })

  engine.registerHostModule('builtins', BuiltinsModule)
  engine.registerHostModule('security', securityModule)
  engine.addRules(await readFile('security.chr', 'utf8'))

  // Seed profiles and firewall rules
  engine.store.add('profile', ['web-01', 'dmz', 'critical'])
  engine.store.add('profile', ['db-01', 'internal', 'critical'])
  engine.store.add('profile', ['dev-01', 'dev', 'non-critical'])
  engine.store.add('firewall', ['web-01', 'dmz'])
  engine.store.add('firewall', ['db-01', 'internal'])

  // Simulate alerts
  console.log('\n=== Alert 1: Critical on web-01 ===')
  await engine.assert('alert', ['web-01', 9, 'external'])

  console.log('\n=== Alert 2: Medium on dev-01 ===')
  await engine.assert('alert', ['dev-01', 5, 'internal'])

  console.log('\n=== Alert 3: Repeated medium on web-01 (escalation) ===')
  await engine.assert('alert', ['web-01', 7, 'external'])

  console.log('\n=== Alert 4: Low on db-01 ===')
  await engine.assert('alert', ['db-01', 2, 'internal'])

  // Create ticket for containment resolution demo
  engine.store.add('ticket', ['web-01', 'open'])

  console.log('\n=== Final Store ===')
  console.log(engine.printStore())
  console.log('\n=== Ticket DB ===')
  console.log(JSON.stringify(tickets, null, 2))
}

runSecurityScenario().catch(console.error)
```

### Expected Behavior

| Alert | Host | Severity | Result |
|-------|------|----------|--------|
| 1 | web-01 | 9 | Critical escalation (bypasses triage) |
| 2 | dev-01 | 5 | Triaged -> investigated -> contained |
| 3 | web-01 | 7 | Repeated -> escalated via simpagation |
| 4 | db-01 | 2 | Logged only (low severity) |

---

## 20. Automation Case Study: Industrial IoT Monitor

A sensor monitoring and automation system demonstrating unification, timeouts, multi-head joins, and store queries.

### The Rules

```chr
-- File: iot.chr
import host builtins;
import host iot;

constraint sensor/3, reading/4, alert/3, valve/2;
constraint threshold/3, average/2, maintenance/1;

-- Unification: chain sensor readings through pipelines
unify pipe_flow @ sensor('flow', Id, Rate) \ sensor('flow', Id, Rate)
    <=> gt(Rate, 0)
    | !recordFlow(Id, Rate);

-- Threshold breach: temperature sensors
temp_alert @ reading('temp', Id, Val, Ts)
    ==> gt(Val, lookupOne('threshold', 1))
    | !notify('HIGH_TEMP', Id, Val);

-- Multi-sensor fusion: confirm alert with two sensors
confirm @ reading('temp', Id, V1, _), reading('pressure', Id, V2, _)
    ==> gt(V1, 100), gt(V2, 50)
    | alert('CRITICAL', Id, V1 + V2);

-- Rolling average: collect readings, emit average
collect @ reading('flow', Id, Val, _)
    ==> !accumulate(Id, Val);

emit_avg @ average(Id, Count)
    ==> gte(Count, 5)
    | !publishAverage(Id);

-- Valve control: open/close based on pressure
valve_control @ valve(Id, Position), reading('pressure', Id, Val, _)
    ==> gt(Val, 80), eq(Position, 'closed')
    | !actuate(Id, 'open');

valve_close @ valve(Id, Position), reading('pressure', Id, Val, _)
    ==> lt(Val, 20), eq(Position, 'open')
    | !actuate(Id, 'close');

-- Maintenance trigger: high temp + low flow
schedule_maint @ reading('temp', Id, Temp, _), reading('flow', Id, Flow, _)
    ==> gt(Temp, 85), lt(Flow, 10)
    | !scheduleMaintenance(Id), maintenance(Id);

-- Simpagation: update threshold dynamically
update_threshold @ threshold('temp', Old) \ threshold('temp', Old)
    <=> gt(Old, 0)
    | threshold('temp', Old);
```

### The TypeScript Host

```typescript
// File: iot.ts
import { CHREngine, defineHostModule, BuiltinsModule } from 'chr-ts'

interface Accumulator {
  [id: string]: { sum: number; count: number }
}

const accumulators: Accumulator = {}

const iotModule = defineHostModule({
  functions: {
    // No custom functions needed here, builtins cover most needs
  },
  actions: {
    recordFlow: ({ args }) => {
      const [id, rate] = args
      console.log(`[FLOW] Sensor ${id}: ${rate} L/min`)
    },
    notify: ({ args }) => {
      const [level, id, val] = args
      console.log(`[ALERT][${level}] Sensor ${id}: value=${val}`)
    },
    accumulate: ({ args }) => {
      const [id, val] = args as [string, number]
      if (!accumulators[id]) accumulators[id] = { sum: 0, count: 0 }
      accumulators[id].sum += val
      accumulators[id].count++
      if (accumulators[id].count >= 5) {
        const avg = accumulators[id].sum / accumulators[id].count
        const store = args.__proto__ ? undefined : undefined // context not needed
        console.log(`[AVG] Sensor ${id}: avg=${avg.toFixed(2)} over ${accumulators[id].count} readings`)
        accumulators[id] = { sum: 0, count: 0 } // reset
      }
    },
    publishAverage: ({ args }) => {
      const id = args[0] as string
      console.log(`[PUBLISH] Average for sensor ${id} published to dashboard`)
    },
    actuate: ({ args }) => {
      const [id, action] = args as [string, string]
      console.log(`[ACTUATE] Valve ${id}: ${action.toUpperCase()}`)
    },
    scheduleMaintenance: ({ args }) => {
      const id = args[0] as string
      console.log(`[MAINTENANCE] Scheduled for sensor ${id}`)
    }
  }
})

async function runIoTScenario() {
  const engine = new CHREngine({
    maxRuleFirings: 500,
    hostFunctionTimeout: 3000
  })

  engine.registerHostModule('builtins', BuiltinsModule)
  engine.registerHostModule('iot', iotModule)
  engine.addRules(await readFile('iot.chr', 'utf8'))

  // Seed configuration
  engine.store.add('threshold', ['temp', 80])
  engine.store.add('valve', ['v-101', 'closed'])
  engine.store.add('valve', ['v-102', 'open'])

  // Simulate sensor readings
  const readings = [
    // [type, id, value, timestamp]
    ['temp', 's-001', 75, 1],
    ['flow', 's-001', 15, 1],
    ['pressure', 's-001', 60, 1],
    ['temp', 's-001', 82, 2],
    ['flow', 's-001', 12, 2],
    ['pressure', 's-001', 85, 2],
    ['temp', 's-001', 90, 3],     // threshold breach!
    ['flow', 's-001', 8, 3],       // low flow
    ['pressure', 's-001', 95, 3],  // high pressure -> valve should open
    ['temp', 's-001', 88, 4],
    ['flow', 's-001', 6, 4],       // low flow + high temp = maintenance!
    ['pressure', 's-001', 90, 4],
    ['temp', 's-002', 72, 1],      // second sensor
    ['flow', 's-002', 20, 1],
  ]

  for (const [type, id, value, ts] of readings) {
    console.log(`\n[READING] ${type}(${id}) = ${value} @ t=${ts}`)
    await engine.assert('reading', [type, id, value, ts])
  }

  console.log('\n=== Final Store ===')
  console.log(engine.printStore())

  console.log('\n=== Valve States ===')
  for (const v of engine.store.lookup('valve', 2)) {
    console.log(`  Valve ${v.args[0]}: ${v.args[1]}`)
  }
}

runIoTScenario().catch(console.error)
```

### Expected Behavior

| Step | Reading | Effect |
|------|---------|--------|
| t=1 | temp=75, flow=15, pressure=60 | Normal operation |
| t=2 | temp=82, pressure=85 | Pressure valve triggers: valve v-101 opens |
| t=3 | temp=90 (breach!), flow=8, pressure=95 | Temp alert, critical alert (temp+pressure fusion) |
| t=4 | temp=88, flow=6 | Maintenance scheduled (temp>85 + flow<10) |
| -- | s-002 readings | Independent processing for second sensor |

---

## Appendix A: Quick Reference

### Engine Setup

```typescript
import { CHREngine, defineHostModule, BuiltinsModule, createEngine } from 'chr-ts'

// Option 1: Full control
const engine = new CHREngine({ maxRuleFirings: 1000, hostFunctionTimeout: 5000 })
engine.registerBuiltins()
engine.registerFunction('myFunc', (_ctx, x) => x)
engine.registerAction('myAction', ({ args }) => {})
engine.registerHostModule('myMod', { functions: {}, actions: {} })
engine.addRules('rule @ a(X) ==> b(X);')

// Option 2: One-shot loader
const engine2 = createEngine({
  source: 'rule @ a(X) ==> b(X);',
  builtins: true,
  maxRuleFirings: 5000
})
```

### Common Patterns

| Pattern | Rule Form | Example |
|---------|-----------|---------|
| Pipeline | `<=>` (simplification) | Each step consumes and emits |
| Monitoring | `==>` (propagation) | Keep original, emit alerts |
| Configuration | `\ <=>` (simpagation) | Keep config, consume requests |
| Aggregation | `==>` (propagation) | Accumulate, emit when threshold met |
| State machine | `<=>` (simplification) | Transition between states |
| Graph traversal | `unify ... ==> ` | Build transitive closures |

### TypeScript + CHR Cheat Sheet

```typescript
// Register function (used in guards and body expressions)
engine.registerFunction('name', (_ctx, arg1, arg2) => result)

// Register action (used in body with ! prefix)
engine.registerAction('name', (ctx) => { ctx.store, ctx.args })

// Assert constraint
await engine.assert('name', [arg1, arg2])

// Assert multiple atomically
await engine.assertMany([
  { name: 'a', args: [1] },
  { name: 'b', args: [2] }
])

// Query store
engine.store.lookup('name', arity)
engine.store.find((rec, name) => name === 'x')
engine.store.allAlive([id1, id2])
engine.store.snapshot()

// Debug
engine.onRuleFired = (trace) => console.log(trace)
engine.getWarnings()
engine.validate(source)
engine.printStore()
```

---

*End of Tutorial*
