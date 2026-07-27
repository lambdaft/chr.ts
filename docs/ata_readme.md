# Allen's Temporal Algebra (ATA) TypeScript Port

> **Credit:** This TypeScript port is based on the original Scala library [**Between**](https://github.com/Philippus/between) by [Philippus](https://github.com/Philippus). The original implementation, documentation, and test cases served as the authoritative reference for this translation.

---

## Table of Contents

1. [What Is This Port?](#1-what-is-this-port)
2. [Quick Start](#2-quick-start)
3. [Core Features](#3-core-features)
4. [API Reference](#4-api-reference)
5. [Using ATA in CHR Rules](#5-using-ata-in-chr-rules)
6. [Examples by Domain](#6-examples-by-domain)
7. [Running the Tests](#7-running-the-tests)
8. [Implementation Notes](#8-implementation-notes)
9. [Original Library Background](#9-original-library-background)
10. [Resources](#10-resources)

---

## 1. What Is This Port?

This is a **TypeScript port of Allen's Temporal Algebra (ATA)**, translated from the original Scala implementation in `src/ata/`.

The port provides:

- A generic `Interval<T>` class for temporal intervals
- All **13 Allen relations** with their inverses
- A **transitivity table** for composing relations
- Helper functions for constraint propagation and relation lookup

It is designed to work seamlessly with **CHR.ts** as host functions in rule guards, enabling temporal reasoning directly inside CHR programs.

---

## 2. Quick Start

```typescript
import { Interval, findRelation, defaultNumberComparator, constraints, relationSets } from 'chr-ts'

const compare = defaultNumberComparator

const a = Interval.create(1, 5, compare)
const b = Interval.create(3, 8, compare)

if (a && b) {
  console.log(findRelation(a, b, compare)) // "o" (overlaps)
  console.log(a.intersection(b, compare)?.toString()) // "[3, 5]"
  console.log(a.union(b, compare)?.toString()) // "[1, 8]"
  console.log(a.minus(b, compare).map(i => i.toString())) // ["[1, 3]"]
}
```

---

## 3. Core Features

### 3.1 Generic Interval Class

```typescript
const i = Interval.create(start, end, comparator)
```

- `start` and `end` can be any comparable type `T`
- A `Comparator<T>` function `(a, b) => number` is required
- Returns `null` if `start >= end`

### 3.2 All 13 Allen Relations

Given two intervals there is always exactly one of the following thirteen relations true:

| relation | symbol | inverse | inverse relation | diagram |
| -------------- | ------- | ------- | ------------------ | --------------------------- |
| x `before` y | `<` | `>` | y `after` x | <pre>xxx yyy</pre> |
| x `equals` y | `is` | `is` | y `equals` x | <pre>  xxx<br>  yyy</pre> |
| x `meets` y | `m` | `mi` | y `metBy` x | <pre>xxxyyy</pre> |
| x `overlaps` y | `o` | `oi` | y `overlappedBy` x | <pre> xxx<br>  yyy</pre> |
| x `during` y | `d` | `di` | y `contains` x | <pre>  xxx<br> yyyyy</pre> |
| x `starts` y | `s` | `si` | y `startedBy` x | <pre> xxx<br> yyyyy</pre> |
| x `finishes` y | `f` | `fi` | y `finishedBy` x | <pre>   xxx<br> yyyyy</pre> |

* `before` and `after` are also available as `precedes` and `precededBy`, respectively.
* `finishes` and `finishedBy` are also available as `ends` and `endedBy`.

There's a `findRelation` method which can be used to find out which relation exists between two intervals. The
`Relation` has an `inverse` property implemented, which gives the inverse of a relation.

```typescript
import { Interval, findRelation } from 'chr-ts'

const compare = (a: number, b: number) => a - b
const i = Interval.create(1, 2, compare)!
const j = Interval.create(2, 3, compare)!

const relationBetweenIAndJ = findRelation(i, j, compare) // "m" (meets)

// Look up the inverse relation from the relations table
const info = relations.find(r => r.relation === relationBetweenIAndJ)!
const inverse = info.inverse // "mi" (metBy)
```

### 3.3 Interval Operations

- `gap(other)` — returns the interval that is between this interval and the supplied interval, or `null`
- `intersection(other)` — returns the intersection of this interval and the supplied interval, or `null`
- `span(other)` — returns the smallest interval that contains this interval and the supplied interval
- `minus(other)` — returns the result of subtracting the supplied interval from this interval
- `union(other)` — returns the union of this interval and the supplied interval, or `null`
- `chop(point)` — chops this interval into two intervals that meet at the supplied point
- `containsPoint(point)` — checks if supplied point is within the interval
- `startsAt(point)` / `endsAt(point)` — boundary checks
- `withStart(point)` / `withEnd(point)` — returns a copy of this interval with the supplied endpoint
- `clamp(point)` — clamps a supplied point within the interval
- `afterPoint(point)` — checks if the interval is after the supplied point
- `beforePoint(point)` — checks if the interval is before the supplied point

### 3.4 Transitivity and Constraint Propagation

```typescript
import { constraints, relationSets } from 'chr-ts'

// Compute the transitive closure of two relation sets
const result = constraints(relationSets.dur, relationSets.con)
```

- `relationSets.dur` = `{s, d, f}`
- `relationSets.con` = `{fi, di, si}`
- `relationSets.concur` = `{o, fi, di, s, is, si, d, f, oi}`
- `relationSets.full` = all 13 relations
- `transitivityTable` maps `(relation, relation) -> Set<relation>`

### 3.5 Finding Relations

```typescript
const relation = findRelation(intervalA, intervalB, comparator)
```

Iterates all relation tests in a deterministic order and returns the first matching relation.

---

## 4. API Reference

### `Interval<T>`

```typescript
class Interval<T> {
  static create<T>(start: T, end: T, compare: Comparator<T>): Interval<T> | null

  getStart(): T
  getEnd(): T

  before(other, compare): boolean
  after(other, compare): boolean
  meets(other, compare): boolean
  metBy(other, compare): boolean
  overlaps(other, compare): boolean
  overlappedBy(other, compare): boolean
  during(other, compare): boolean
  contains(other, compare): boolean
  starts(other, compare): boolean
  startedBy(other, compare): boolean
  finishes(other, compare): boolean
  endedBy(other, compare): boolean
  equals(other, compare): boolean
  abuts(other, compare): boolean
  encloses(other, compare): boolean
  enclosedBy(other, compare): boolean

  gap(other, compare): Interval<T> | null
  intersection(other, compare): Interval<T> | null
  span(other, compare): Interval<T>
  minus(other, compare): Interval<T>[]
  union(other, compare): Interval<T> | null

  afterPoint(point, compare): boolean
  beforePoint(point, compare): boolean
  chop(point, compare): [Interval<T>, Interval<T>] | null
  containsPoint(point, compare): boolean
  startsAt(point, compare): boolean
  endsAt(point, compare): boolean
  withStart(point, compare): Interval<T> | null
  withEnd(point, compare): Interval<T> | null
  clamp(point, compare): T

  toString(): string
}
```

### `Relation`

```typescript
type Relation = '<' | '>' | 'm' | 'mi' | 'o' | 'oi' | 'fi' | 'di' | 's' | 'si' | 'd' | 'f' | 'is'

interface RelationInfo {
  readonly relation: Relation
  readonly inverse: Relation
  readonly test: <T>(t: Interval<T>, s: Interval<T>, compare: Comparator<T>) => boolean
}

const relations: RelationInfo[]
const relationSets: { dur: Set<Relation>; con: Set<Relation>; concur: Set<Relation>; full: Set<Relation> }
const transitivityTable: Map<string, Set<Relation>>

function constraints(r1: Set<Relation>, r2: Set<Relation>): Set<Relation>
function findRelation<T>(t: Interval<T>, s: Interval<T>, compare: Comparator<T>): Relation
type Comparator<T> = (a: T, b: T) => number
function defaultNumberComparator(a: number, b: number): number
```

---

## 5. Using ATA in CHR Rules

ATA functions are exposed as **host functions** that can be called in CHR rule guards. Each function takes a `Comparator`-style set of arguments and returns a truthy value.

### Declaring ATA Functions

```chr
constraints order/4, trade/4;
functions during/3, before/2, meets/2, overlaps/3, starts/2, ends/2, contains/2, abuts/2, after/2;

import host builtins;
```

### Using ATA in Guards

```chr
rule_name @ order(OrderId, Symbol, Time, Type) <=> during(Time, 9, 17) | !log("Order accepted"), valid_order(OrderId, Symbol, Time);

rule_name @ trade(TradeId, Symbol, TradeTime, Price), order(OrderId, Symbol, OrderTime, Type) <=> after(TradeTime, OrderTime) | !log("Trade executed"), matched(TradeId, OrderId);

rule_name @ settlement(SettlementId, TradeId, SettleTime), trade(TradeId, Symbol, TradeTime, Price) <=> meets(SettleTime, TradeTime) | !log("Settled"), settled(SettlementId, TradeId);
```

### Host Module Implementation

```typescript
import { defineHostModule } from 'chr-ts'

const host = defineHostModule({
  functions: {
    during: (_ctx, time, start, end) => Number(time) >= Number(start) && Number(time) <= Number(end) ? 1 : 0,
    before: (_ctx, time, cutoff) => Number(time) < Number(cutoff) ? 1 : 0,
    meets: (_ctx, time1, time2) => Number(time1) === Number(time2) ? 1 : 0,
    overlaps: (_ctx, time, start, end) => Number(time) > Number(start) && Number(time) < Number(end) ? 1 : 0,
    starts: (_ctx, time, start) => Number(time) === Number(start) ? 1 : 0,
    ends: (_ctx, time, end) => Number(time) === Number(end) ? 1 : 0,
    contains: (_ctx, container, contained) => Number(contained) >= Number(container) ? 1 : 0,
    abuts: (_ctx, time1, time2) => Math.abs(Number(time1) - Number(time2)) === 1 ? 1 : 0,
    after: (_ctx, time1, time2) => Number(time1) > Number(time2) ? 1 : 0
  },
  actions: {
    log: ({ args }) => console.log(args[0] ?? "")
  }
})
```

---

## 6. Examples by Domain

Five complete example projects demonstrate ATA in CHR rule guards:

| Domain | Rules | Temporal Relations Used | Path |
|--------|-------|------------------------|------|
| **Finance** | 14 | `during`, `after`, `meets`, `starts`, `ends`, `contains`, `before`, `overlaps` | [examples/finance/finance.chr](examples/finance/finance.chr) |
| **Banking** | 13 | `during`, `contains`, `overlaps`, `starts`, `ends`, `meets`, `abuts`, `after` | [examples/banking/banking.chr](examples/banking/banking.chr) |
| **Medical** | 15 | `before`, `during`, `after`, `meets`, `starts`, `ends`, `contains`, `abuts` | [examples/medical/medical.chr](examples/medical/medical.chr) |
| **Collusion Avoidance** | 14 | `during`, `before`, `meets`, `overlaps`, `starts`, `ends`, `contains`, `abuts`, `after` | [examples/collusion/collusion.chr](examples/collusion/collusion.chr) |
| **Navigation** | 16 | `during`, `before`, `meets`, `overlaps`, `starts`, `ends`, `contains`, `abuts`, `after` | [examples/navigation/navigation.chr](examples/navigation/navigation.chr) |

Each example includes:
- `<domain>.chr` — CHR rules using ATA in guards
- `<domain>.ts` — TypeScript runner with host module
- `package.json` and `tsconfig.json` — build configuration
- `fixup.cjs` — path fixup for compiled output

### Running an Example

```bash
cd examples/finance
npm run build
npm run start
```

---

## 7. Running the Tests

```bash
# Build the project
npm run build

# Run ATA-specific tests
node --test dist/ata/tests/Interval.test.js

# Run the full test suite
npm test
```

The ATA test suite (`src/ata/tests/Interval.test.ts`) covers 26 scenarios:
- Every pair of intervals has exactly one Allen relation
- Inverse relations hold bidirectionally
- `abuts`, `gap`, `intersection`, `minus`, `span`, `union`
- Point operations: `after`, `before`, `chop`, `contains`, `endsAt`, `startsAt`
- `withStart`, `withEnd`, `clamp`
- `constraints()` transitive closure

---

## 8. Implementation Notes

### TypeScript Idioms

| Scala Concept | TypeScript Equivalent |
|--------------|----------------------|
| `Ordering[T]` (implicit) | `Comparator<T>` passed explicitly |
| `Option[Interval[T]]` | `Interval<T> \| null` |
| `final case class` | `class` with private constructor + `static create()` |
| `Map[(A, B), V]` | `Map<string, V>` (string-keyed to avoid reference-equality bugs) |

### Known Limitations

- The transitivity table uses string keys rather than tuple keys. This is a deliberate workaround for JavaScript's `Map` reference-equality behavior on arrays.
- Host functions must be declared with the correct arity in `.chr` files; the engine validates this at load time.
- `Interval.create()` returns `null` for invalid intervals rather than throwing.

### Source Layout

```
src/ata/
  Interval.ts          -- Generic Interval<T> class
  Relation.ts          -- Relation type, transitivity table, findRelation, constraints
  experiment.ts        -- Quick manual experiment script
  tests/
    Interval.test.ts   -- 26 deterministic tests for ATA operations
    Interval.scala     -- Original Scala source (reference only)
    Relation.scala     -- Original Scala source (reference only)
```

---

## 9. Original Library Background

Between is a library for working with (time) intervals and the relations between them. It takes as a basis the thirteen
relations of Allen's Interval Algebra. This is a system for reasoning about (temporal) intervals as described in
the paper [Maintaining Knowledge about Temporal Intervals](https://cse.unl.edu/~choueiry/Documents/Allen-CACM1983.pdf).

### The Backstory

The original author got inspired to write this library during [Eric Evans](https://github.com/ericevans0)'s talk at the
[Domain-Driven Design Europe 2018](https://dddeurope.com/2018/) conference. He started writing it on the train on the way
back from the conference, which can be represented like this:

`write lib <-(o)- - train - -(>, mi)-> DDD Europe - -(di)-> EE talk <-(d) - - inspired`

Since the composition table of relations and the `constraints` method are implemented we can find out what the possible
relations between `write lib` and `DDD Europe` are:

```scala
import nl.gn0s1s.between._

Relation.constraints(Set(o), Set(<, m)) // res0: Set[nl.gn0s1s.between.Relation] = Set(<)
```

---

## 10. Resources

### Allen's Interval Algebra

- [Maintaining Knowledge about Temporal Intervals](https://cse.unl.edu/~choueiry/Documents/Allen-CACM1983.pdf) — the original paper by James F. Allen
- [Wikipedia entry](https://en.wikipedia.org/wiki/Allen%27s_interval_algebra)
- Thomas A. Alspaugh's Foundations Material on [Allen's Interval Algebra](https://thomasalspaugh.org/pub/fnd/allen.html)
- [Moments and Points in an Interval-Based Temporal Logic](https://onlinelibrary.wiley.com/doi/10.1111/j.1467-8640.1989.tb00329.x)

### Related Links

- [A Modal Logic for Chopping Intervals](https://staff.fnwi.uva.nl/y.venema/papers/1991/vene-moda91.pdf)
- [SOWL QL: Querying Spatio-Temporal Ontologies in OWL](http://www.intelligence.tuc.gr/~petrakis/publications/SOWLQL-JDS.pdf)
- [AsterixDB Temporal Functions: Allen's Relations](https://asterixdb.apache.org/docs/0.8.8-incubating/aql/allens.html)
- Haskell package that does something similar for Haskell - https://github.com/novisci/interval-algebra

### Original Scala Implementation

- GitHub: https://github.com/Philippus/between
- License: Mozilla Public License, version 2.0

---

*Generated for the CHR.ts ATA TypeScript port (July 2026).*
