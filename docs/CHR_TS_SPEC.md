# CHR.ts Specification

## 1. Purpose

This document defines a fresh TypeScript-first CHR engine specification derived from surveyed open-source CHR implementations and the original CHR.js research prototype.

The purpose is not to replicate every legacy implementation detail. The purpose is to preserve CHR semantics while designing a runtime that is robust, inspectable, explicit, and safe enough to support a larger production system.

## 2. Survey Basis

This specification is informed by the following representative open-source CHR implementations and references:

1. SWI-Prolog / K.U. Leuven CHR
The SWI-Prolog manual and `packages-chr` repository show a mature compiler-plus-runtime architecture with explicit translation, runtime support, debugging hooks, store variants, and compiler diagnostics.

2. JCHR
The Java implementation demonstrates a CHR system hosted in an imperative, typed language. That matters because `CHR.ts` also targets an imperative host language with strong typing.

3. CHR.js
The original CHR.js prototype shows how CHR can be embedded in JavaScript, but it also documents prototype limitations: parser complexity, dynamic execution fragility, and incomplete optimization work.

4. CHR.js Research Report
The report establishes the high-level architecture to keep: parser, compiler, runtime, refined operational semantics, and imperative-host-language compilation.

5. CHR for Imperative Host Languages
The implementation strategy in Van Weert et al. motivates explicit activators, occurrence handling, indexing, and propagation history.

## 3. Non-Goals

The first stable version of `CHR.ts` will not attempt to support everything at once.

Not in scope for v0.1:

- full Prolog unification,
- logical variables in the store,
- unsafe implicit host-language scope capture,
- stringly-typed runtime code generation,
- browser bundling tricks as a primary design constraint.

## 4. Semantic Core

`CHR.ts` shall support the three standard rule forms:

1. Propagation
`A ==> G | B`

2. Simplification
`A <=> G | B`

3. Simpagation
`K \\ R <=> G | B`

Where:

- `A`, `K`, and `R` are conjunctions of head constraints,
- `G` is a conjunction of built-in predicates or typed host guards,
- `B` is a conjunction of emitted constraints and optional host actions.

The engine shall preserve refined operational semantics as a design target.

## 5. Required Architectural Layers

### 5.1 Parser

The parser produces a typed intermediate representation and must not execute host code.

The parser shall:

- parse rules, constraints, guards, and bodies,
- preserve source locations,
- preserve rule names,
- normalize the three rule kinds into one typed IR,
- reject malformed rule syntax with explicit diagnostics.

### 5.2 Intermediate Representation

The IR is the system boundary between frontend and runtime/compiler logic.

The IR shall be:

- typed,
- serializable,
- stable across JIT and AOT modes,
- independent from any `eval`-based runtime execution.

### 5.3 Runtime

The runtime must own:

- constraint instances,
- store indexing,
- propagation history,
- rule scheduling,
- tracing hooks,
- deterministic error surfaces.

### 5.4 Host Interop Layer

Host-language integration must be explicit.

Guards and bodies shall use one typed ABI instead of ad hoc runtime reconstruction.

Recommended host ABI:

```ts
type GuardHandler = (ctx: GuardContext) => boolean | Promise<boolean>
type BodyHandler = (ctx: BodyContext) => void | Promise<void>
```

The engine shall never depend on ambient `with` scope or runtime string evaluation of host functions.

### 5.4.1 Source-level Host Module Imports

Host modules may be imported directly from `.chr` source using `import host <name>;` syntax.

Modules are registered on the engine by name before rule loading:

```
engine.registerHostModule('builtins', BuiltinsModule)
engine.addRules('import host builtins; constraint a/1; match @ a(X) ==> gt(X, 0) | b(X);')
```

When a host module is imported from source, all its functions and actions are registered automatically and satisfy `strictHostDeclarations` without requiring explicit `functions name/arity;` declarations.

## 6. Constraint Model

Each constraint instance shall contain at least:

- `name`,
- `arity`,
- `args`,
- `id`,
- `alive`,
- optional metadata for tracing.

The store must support:

- add,
- remove / kill,
- lookup by functor,
- snapshots,
- iteration,
- stable ordering for diagnostics.

## 7. History Model

Propagation history shall be explicit and rule-scoped.

The history API must support:

- `add(ruleName, ids)`,
- `has(ruleName, ids)`,
- `clear()`,
- optional snapshots for debugging.

## 8. Safety Requirements

`CHR.ts` shall avoid the fragile mechanisms that made legacy CHR.js difficult to extend:

- no `with`,
- no runtime `eval` for executing embedded host handlers,
- no implicit host-scope capture,
- no silent promise rejection without error objects,
- no duplicated JIT/AOT semantic paths.

## 9. Ergonomic Requirements

The implementation must be pleasant enough for serious application work.

Mandatory ergonomics:

- typed public API,
- typed diagnostics,
- stable source locations,
- store snapshots,
- trace hooks,
- constraint declarations,
- reproducible execution order,
- parser/compiler/runtime error categories.

## 10. Fresh `CHR.ts` API Direction

Proposed high-level API:

```ts
const engine = new CHREngine()
engine.addRules(source)
await engine.assert('fib', [1, 1])
await engine.assert('fib', [2, 1])
const snapshot = engine.store.snapshot()
```

Later extensions can add:

- ahead-of-time compilation,
- visual traces,
- VS Code integration,
- IR serialization,
- benchmarking hooks,
- rule planner optimizations.

## 11. Implementation Phases

### Phase 1

- typed AST,
- typed store,
- typed history,
- safe subset parser,
- engine skeleton.

### Phase 2

- single-head rule execution,
- propagation history enforcement,
- typed host guard/body handlers,
- trace hooks.

### Phase 3

- multi-head rule planner,
- simpagation support in execution engine,
- join ordering and indexing improvements,
- deterministic scheduler.

### Phase 4

- AOT compiler,
- IR persistence,
- devtools and debugger integration,
- performance tuning.

## 12. Comparison to Original CHR.js

`CHR.ts` keeps from CHR.js:

- parser/compiler/runtime separation,
- support for all three CHR rule forms,
- host-language embedding as a first-class goal,
- store/history model,
- imperative-host-language compilation strategy.

`CHR.ts` intentionally rejects from CHR.js:

- runtime `eval` of embedded logic,
- `with`-based ambient scope tricks,
- duplicated semantic behavior between JIT and AOT,
- opaque promise failures,
- weak diagnostics.

## 13. Initial Decision

The project should proceed as a fresh implementation, not as an endless patch series on top of legacy CHR.js internals.

The old project remains a semantic reference and migration source. It is not the architectural base.