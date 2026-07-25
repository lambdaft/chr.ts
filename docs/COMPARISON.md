# CHR.ts vs Other CHR Systems -- Feature Comparison

*Generated July 2026 from research on SWI-Prolog CHR, K.U.Leuven JCHR, CCHR, and CHR.js*

---

## 1. Reference: Systems Compared

| System | Host Language | Status | Maturity | Key Reference |
|--------|--------------|--------|----------|---------------|
| **SWI-Prolog CHR** (K.U.Leuven) | Prolog | Stable, production | Very High | Schrijvers & Demoen 2004 |
| **K.U.Leuven JCHR** | Java | Stable, research-grade | High | Van Weert et al. 2005 |
| **CCHR** | C | Research prototype | Medium | Wuille, Schrijvers, Demoen 2007 |
| **CHR.js** | JavaScript | Research prototype (v0.x) | Low-Medium | Nogatz 2015 |
| **CHR.ts** | TypeScript | Bootstrap (v0.1) | Early | This project |

---

## 2. Core Rule Forms

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Propagation (`==>`) | Yes | Yes | Yes | Yes | Yes |
| Simplification (`<=>`) | Yes | Yes | Yes | Yes | Yes |
| Simpagation (`\ <=>`) | Yes | Yes | Yes | Yes | Yes |
| Rule naming (`name @`) | Yes (optional) | Yes | Yes | Yes | Yes |
| Multi-head rules | Yes | Yes | Yes | Yes | Yes |
| Guard (`\|`) | Yes | Yes | Yes | Yes | Yes |
| Anonymous variable (`_`) | Yes (Prolog `_`) | No native | No native | No | **Yes** |
| `unify` keyword prefix | No | No | No | No | **Yes** |

**CHR.ts differentiator:** `unify` keyword prefix for enabling structural unification per-rule is unique. Other systems either use full Prolog unification always (SWI-Prolog) or strict matching always (CHR.js, default CHR.ts). CHR.ts lets the programmer choose per-rule.

---

## 3. Host Language Integration

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Foreign function calls in guards | Prolog predicates | Java methods | C functions | `${...}` JS expressions | Registered `HostFunction` |
| Foreign function calls in body | Prolog predicates | Java methods | C functions | `${...}` JS expressions | Registered `HostFunction` |
| Side-effect actions | Prolog goals | Java statements | C statements | `${...}` JS expressions | `!actionName(args)` |
| Action context (store access) | Prolog assert/retract | Java handler methods | C store API | Direct JS store access | `HostActionContext` with store/history/engine |
| Function/action declaration required | No (Prolog dynamic) | Yes (Java method sigs) | Yes | No | Optional (strict mode) |
| Host module imports (`import host`) | No | No | No | No | **Yes** |
| `defineHostModule` helper | No | No | No | No | **Yes** |
| `createEngine` one-shot loader | No | No | No | Partial (REPL) | **Yes** |
| Async host functions | No (Prolog sync) | No (Java sync) | No (C sync) | Yes (JS native) | **Yes** (Promise-aware) |
| Host function timeout | No | No | No | No | **Yes** |

**CHR.ts differentiator:** First CHR to have `import host moduleName;` source-level imports, a typed `defineHostModule()` helper, `createEngine()` convenience loader, and host function timeout. The `HostActionContext` provides full store/history/engine access to actions.

---

## 4. Type System & Safety

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Constraint arity declarations | Yes (`chr_constraint`) | Yes (Java method sigs) | Yes (C headers) | No | Yes (`constraint name/N`) |
| Host function arity declarations | No | Yes (Java method sigs) | Yes (C headers) | No | Yes (`functions name/N`) |
| Host action arity declarations | No | Yes | Yes | No | Yes (`actions name/N`) |
| Argument type declarations | Yes (mode + type) | Yes (Java types) | Yes (C types) | No | No (untyped `unknown`) |
| Static type checking | Yes (mode/type analysis) | Yes (Java compiler) | Yes (C compiler) | No | No (JS runtime) |
| Dynamic type checking | Yes (optional, debug mode) | No (Java compiler) | No | No | No (JS runtime) |
| Strict declaration enforcement | N/A (Prolog dynamic) | Yes (Java compiler) | Yes | No | Optional (`strictHostDeclarations`) |
| `TypedEngine<Constraints>` generics | No | No | No | No | **Yes** (TypeScript generics) |

**CHR.ts differentiator:** `TypedEngine<Constraints>` is a TypeScript-generic wrapper for type-safe `assert()` calls. CHR.ts lacks the sophisticated mode/type declarations of SWI-Prolog CHR but offers optional strict host declaration enforcement.

---

## 5. Constraint Store

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Hash-table indexed store | Yes | Yes | Partial | No (linear) | Yes (functor-keyed Map) |
| Functor-based lookup | Yes | Yes | Yes | Yes | Yes (`lookup(name, arity)`) |
| Name-based lookup | Partial | Partial | Partial | No | Yes (`lookupByName(name)`) |
| Predicate-based search | No | No | No | No | **Yes** (`find(predicate)`) |
| Bulk existence check | No | No | No | No | **Yes** (`allAlive(ids)`) |
| Metadata on constraints | No | No | No | No | **Yes** (`metadata?` field) |
| Iteration (forEach/map) | Via findall | Via iterators | Via pointers | Via array | **Yes** (`forEach`, `map`, `entries`) |
| Strict invariant checking | No | No | No | No | **Yes** (optional `strict: true \| 'warn'`) |
| Invalidation flag | No | No | No | No | **Yes** (`invalid` property) |
| Hooks (onAdd/onRemove) | No | No | No | No | **Yes** (`ConstraintStoreHooks`) |
| Defensive arg copy | No (Prolog logical vars) | No | No | No | **Yes** (args copied on create and get) |

**CHR.ts differentiator:** Most feature-rich constraint store among all compared systems. Unique features: `find(predicate)`, `allAlive(ids)`, metadata on constraints, `forEach`/`map` iterators, strict invariant checking, invalidation flag, hooks, defensive copying.

---

## 6. Propagation History

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Order-independent ID hashing | No (Prolog term-based) | No | No | No | **Yes** (sorted join `:`) |
| Scope per rule | Yes | Yes | Yes | Yes | Yes |
| Clear | Yes | Yes | Yes | Yes | Yes |
| Snapshot | No (debug only) | No | No | No | **Yes** |
| `notIn` query | No | No | No | No | **Yes** |

**CHR.ts differentiator:** Order-independent history hashing, snapshot for debugging, and `notIn()` convenience method.

---

## 7. Guard & Expression Evaluation

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Inline infix operators | Prolog `>`, `=:=`, etc. | Java `>`, `==`, etc. | C `>`, `==`, etc. | JS `>`, `===`, etc. | Yes (`>`, `===`, `+`, `in`, etc.) |
| Logical operators | Prolog `,` (AND), `;` (OR) | `&&`, `\|\|` | `&&`, `\|\|` | `&&`, `\|\|` | `&&`, `\|\|` (infix) |
| Arithmetic operators | Prolog `is`, `+`, `-` | Java `+`, `-`, `*`, `/` | C `+`, `-`, `*`, `/` | JS `+`, `-`, `*`, `/` | `+`, `-`, `*`, `/` (infix) |
| Array literals | No | Yes (Java arrays) | Yes (C arrays) | Yes (JS arrays) | **Yes** (`[1, 2, 3]`) |
| `in` operator (membership) | No | No | No | No | **Yes** |
| Unary `!` negation | Prolog `\+` | Java `!` | C `!` | JS `!` | **Yes** |
| `let` binding in body | No | No | No | No | **Yes** |
| Guard throw = pass/fail | N/A (Prolog fails) | N/A (Java throws) | N/A (C return) | N/A (JS throw) | **Yes** (throw -> guard failure) |
| Guard fail short-circuits | Yes | Yes | Yes | Yes | Yes |
| Binary operator precedence | Prolog standard | Java standard | C standard | JS standard | Explicit (recursive descent) |

**CHR.ts differentiator:** Infix `in` operator for array membership, `let` bindings in rule bodies, and guard-throws-become-failures safety. Array literals in guards/bodies.

---

## 8. Debugging & Diagnostics

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Source location preservation | Yes (line info) | Yes (ANTLR) | Partial | Yes (PEG.js) | **Yes** (line/column/offset) |
| Rule fire tracing | Yes (debug ports) | No | No | No | **Yes** (`onRuleFired` callback) |
| Trace with timing (firedAt, durationMs) | No | No | No | No | **Yes** |
| Store snapshot | Yes (`chr_show_store`) | No | No | No | **Yes** |
| History snapshot | No | No | No | No | **Yes** |
| Formatted store/rule/history print | Partial | No | No | No | **Yes** (`printStore`, `printRules`, `printHistory`) |
| Error caret (source snippet) | Partial | No | No | Partial | **Yes** (formatted source + caret) |
| Error cause chaining | No | Java exception chain | No | No | **Yes** (`.cause` property) |
| Did-you-mean suggestions | No | No | No | No | **Yes** (fuzzy name matching) |
| Unused declaration warnings | No | No | No | No | **Yes** |
| Shadowed variable warnings | No | No | No | No | **Yes** |
| Dead binding warnings | No | No | No | No | **Yes** |
| Rule priority | No | No | No | No | **Yes** (numerical, higher = sooner) |
| `validate()` dry-run | No | No | No | No | **Yes** |
| Engine state machine | No | No | No | No | **Yes** (`empty -> ready -> running -> error`) |

**CHR.ts differentiator:** Most comprehensive diagnostics of any CHR system. Unique: onRuleFired tracing with timing, formatted store/history/rule printing, error cause chaining, did-you-mean suggestions, multiple warning types (dead bindings, shadowed vars, unused declarations), rule priority, dry-run validation, and explicit engine state machine.

---

## 9. Parsing & Compilation

| Feature | SWI-Prolog CHR | JCHR | CCHR | CHR.js | CHR.ts |
|---------|---------------|------|------|--------|--------|
| Parser approach | Prolog term_expansion | ANTLR parser | Custom parser | PEG.js / Babel plugin | Custom recursive descent |
| JIT compilation | No (compile to Prolog) | No (compile to Java) | No (compile to C) | Yes (runtime transpile) | **Interpreted** (no code gen) |
| AOT compilation | Yes (to Prolog) | Yes (to Java) | Yes (to C) | Yes (CLI transpile) | No |
| Typed intermediate representation | Prolog AST | CIF (CHR Intermediate Form) | C AST | JS AST | **Yes** (TypeScript AST in `ast.ts`) |
| Serializable IR | No | Yes (CIF) | No | No | **Yes** (plain objects) |
| Full Prolog unification | Yes | No | No | No | Partial (optional `unify`) |
| Logical variables | Yes | Yes (optional class) | Yes | No | No |
| Backtracking | Yes (Prolog native) | Yes (explicit backjumping) | Yes | No | No (committed-choice only) |

**CHR.ts differentiator:** Pure interpreted engine (no code generation). Typed, serializable IR. No logical variables, no backtracking -- committed-choice forward chaining only. This is by design (specifically listed as non-goal for v0.1). CHR.js similarly lacks logical variables.

---

## 10. Missing Features (CHR.ts gaps vs other systems)

| Feature | Present In | Missing From CHR.ts | Priority |
|---------|-----------|---------------------|----------|
| Full Prolog unification | SWI-Prolog | No (partial `unify`) | Medium |
| Logical variables | SWI-Prolog, JCHR | No | Medium |
| Backtracking / search | SWI-Prolog, JCHR | No (committed-choice only) | Low |
| Constraint argument type declarations | SWI-Prolog, JCHR, CCHR | No (untyped `unknown`) | Medium |
| AOT compilation to host code | SWI-Prolog, JCHR, CCHR, CHR.js | No (interpreted only) | Low |
| Module system for CHR programs | SWI-Prolog | No (single global rule set) | Low |
| Pragmas (passive, etc.) | SWI-Prolog, JCHR | No | Low |
| Optimization passes | SWI-Prolog, JCHR | No | Low |
| Hash indices on constraint arguments | SWI-Prolog, JCHR | Functor-only indexing | Medium |
| Guard binding check | SWI-Prolog | No | Low |
| `chr_show_store` / constraint enumeration | SWI-Prolog | No (but `printStore` exists) | Low |
| Debugger / step-through execution | SWI-Prolog, JCHR | No (only trace callbacks) | Medium |
| REPL / interactive mode | CHR.js | No | Low |
| Browser bundling | CHR.js | No (Node.js only) | Low |
| `pragma passive` for efficiency | SWI-Prolog, JCHR | No | Low |
| Join ordering optimization | JCHR, SWI-Prolog | No (sequential) | Low |
| Existential/universal iterators | JCHR | No | Low |

---

## 11. Feature Count Summary

| Category | SWI-Prolog CHR | JCHR | CCHR | CHR.js | **CHR.ts** |
|----------|---------------|------|------|--------|-----------|
| Core CHR semantics | Full | Full | Full | Full | Full |
| Host interop | Prolog | Java | C | JS | TS |
| Type safety | Strong | Strong | Strong | Dynamic | Partial (generics) |
| Diagnostics | Basic | Basic | Basic | Basic | **Most extensive** |
| Store features | Standard | Standard | Standard | Minimal | **Most features** |
| History | Standard | Standard | Standard | Standard | **Enhanced** |
| Unification | Full Prolog | Optional | Optional | None | Per-rule `unify` |
| No-eval safety | Yes | Yes | Yes | Uses `${}` eval | **Explicit only** |
| Async support | No | No | No | Yes | Yes |
| Serialization | No | Partial | No | No | Yes |
| Concurrency safety | No | No | No | No | State machine |
| Tooling | Debugger | Eclipse plugin | None | Babel plugin | **Prints + traces + validate** |

---

## 12. Conclusions

### CHR.ts Strengths (vs all other systems)

1. **Safety-first design** -- No `eval`, no `with`, no ambient scope capture. All host interop is explicit via registered functions/actions.
2. **Best diagnostics** -- Source spans with caret, did-you-mean suggestions, rule fire tracing with timing, multiple warning types (dead bindings, shadowed vars, unused declarations), dry-run validation, formatted store/history/rule output.
3. **Most feature-rich store** -- `find(predicate)`, `allAlive(ids)`, `forEach`/`map`, metadata, hooks, strict invariant mode, invalidation flag, defensive copies.
4. **Unique CHR language features** -- `unify` per-rule keyword, `import host moduleName;`, `let` bindings in body, `in` operator, anonymous `_` variable.
5. **TypeScript integration** -- `TypedEngine<Constraints>` generics, `defineHostModule()` type-safe helper, `createEngine()` one-shot loader.
6. **Async-aware** -- Promise-returning host functions, optional timeout, await-based assert.
7. **Rule priority** -- Numerical priority for deterministic scheduling.

### CHR.ts Gaps (vs most mature systems)

1. **No logical variables** -- Constraints hold ground values only (by design for v0.1).
2. **No backtracking** -- Pure committed-choice (by design).
3. **No AOT compilation** -- Interpreted only (no code generation to TypeScript).
4. **No constraint argument types** -- All args are `unknown` (no int/string/boolean declaration).
5. **Functor-only store indexing** -- No hash-index on specific arguments (JCHR/SWI have this).
6. **Immature optimization** -- No join ordering, passive pragma, or scheduling analysis.

### Verdict

CHR.ts is the **safest and most diagnosable** CHR implementation. It sacrifices the logical variable model and AOT compilation for safety, explicitness, and debuggability. It is the only CHR system designed from the ground up for a **modern async TypeScript environment** with comprehensive error reporting. It is **not yet competitive** with SWI-Prolog CHR or JCHR on optimization or feature depth for production constraint solving, but excels in the areas the spec explicitly prioritizes: safety, diagnostics, and explicit host interop.
