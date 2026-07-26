/**
 * Abstract Syntax Tree (AST) type definitions for the CHR.ts parser.
 *
 * The AST is the intermediate representation produced by the parser and consumed
 * by the engine. Every node corresponds directly to a syntactic element in a `.chr`
 * source file. Source spans (`SourceSpan`) are preserved on every top-level node
 * so that the engine can emit precise diagnostics (line + column + caret).
 *
 * Design goals:
 *   - No mutable state on AST nodes; they are plain data carriers.
 *   - Every node carries enough information for the engine to compile and execute
 *     rules without re-parsing the original source.
 *   - `Expression` is a recursive, discriminated union; exhaustive `switch` over
 *     `type` is enforced by TypeScript's exhaustiveness checking when the engine
 *     walks the tree.
 */

// ---------------------------------------------------------------------------
// Rule kinds
// ---------------------------------------------------------------------------

/**
 * The three canonical CHR rule types.
 *
 * - `propagation` (`==>`): Adds new constraints without removing the head.
 *   Multi-headed propagation rules can fire repeatedly unless guarded by
 *   `PropagationHistory`.
 * - `simplification` (`<=>` with a single head): Removes the matched head
 *   constraints and replaces them with the body constraints.
 * - `simpagation` (`\` in head, `<=>` in tail): A hybrid. The constraints
 *   before the `\` are kept; the constraint after `\` is removed.
 */
export type RuleKind = 'propagation' | 'simplification' | 'simpagation'

// ---------------------------------------------------------------------------
// Source location and spans
// ---------------------------------------------------------------------------

/**
 * A 1-based source location within a `.chr` file.
 *
 * `offset` is the 0-based byte offset from the start of the file, used for
 * fast substring extraction when the engine needs to quote the offending
 * source in error messages.
 */
export interface SourceLocation {
  /** 1-based line number. */
  line: number
  /** 1-based column number within the line. */
  column: number
  /** 0-based byte offset from the start of the source. */
  offset: number
}

/**
 * A half-open `[start, end)` region of source text.
 *
 * Produced by the parser for every top-level declaration and rule. The engine
 * attaches these spans to `CHRParseError` and `CHRExecutionError` so that users
 * get a caret (`^`) pointing at the exact location of the problem.
 */
export interface SourceSpan {
  start: SourceLocation
  end: SourceLocation
}

// ---------------------------------------------------------------------------
// Expressions (recursive discriminated union)
// ---------------------------------------------------------------------------

/**
 * A variable reference in an expression or constraint argument.
 *
 * Variables that start with an uppercase letter or underscore (`X`, `Y`, `_`)
 * are treated as pattern variables by the parser. Variables that start with a
 * lowercase letter are treated as literal values when they appear in certain
 * positions (see `parser.ts:ExpressionParser.parsePrimary`).
 */
export interface VariableExpression {
  type: 'variable'
  name: string
}

/**
 * A literal value: string, number, boolean, or `null`.
 *
 * Unlike variables, literals are compared by value during head matching. A
 * literal `42` in a head pattern only matches a constraint argument that is
 * exactly the number `42`.
 */
export interface LiteralExpression {
  type: 'literal'
  value: string | number | boolean | null
}

/**
 * A unary operator applied to a single operand.
 *
 * Supported operators:
 * - `!` – logical NOT (coerces operand to boolean)
 * - `-` – arithmetic negation (operand must be a number)
 */
export interface UnaryExpression {
  type: 'unary'
  operator: '!' | '-'
  operand: Expression
}

/**
 * A binary operator applied to two operands.
 *
 * Supported operators (in precedence order, lowest to highest):
 * - `||`, `&&` – logical disjunction / conjunction
 * - `===`, `!==` – equality / inequality
 * - `<`, `<=`, `>`, `>=` – comparison
 * - `in` – membership test (right operand must evaluate to an array)
 * - `+`, `-`, `*`, `/` – arithmetic
 *
 * Precedence is resolved by `ExpressionParser` in `parser.ts`.
 */
export interface BinaryExpression {
  type: 'binary'
  operator: '||' | '&&' | '===' | '!==' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | 'in'
  left: Expression
  right: Expression
}

/**
 * A host function call expression.
 *
 * `callee` is the function name (must be declared via `functions name/arity;`
 * or imported from a host module). `args` are evaluated left-to-right before
 * the host function is invoked.
 */
export interface CallExpression {
  type: 'call'
  callee: string
  args: Expression[]
}

/**
 * An array literal expression.
 *
 * Array elements are arbitrary expressions evaluated recursively. Arrays are
 * primarily used as arguments to the built-in `in` host function, but may
 * also be returned from host functions.
 */
export interface ArrayExpression {
  type: 'array'
  elements: Expression[]
}

/**
 * The complete set of expression node types.
 *
 * This union type is exhaustively pattern-matched by `ExpressionParser` during
 * parsing and by `evaluateExpression` in `engine/eval.ts` during execution.
 * Adding a new expression kind requires updating both.
 */
export type Expression =
  | VariableExpression
  | LiteralExpression
  | UnaryExpression
  | BinaryExpression
  | CallExpression
  | ArrayExpression

// ---------------------------------------------------------------------------
// Constraint patterns
// ---------------------------------------------------------------------------

/**
 * A constraint pattern as it appears in a rule head or body.
 *
 * `name` is the constraint functor (must match a declaration or be asserted at
 * runtime). `args` are the argument expressions that will be matched against
 * the store or evaluated before insertion.
 */
export interface ConstraintPattern {
  name: string
  args: Expression[]
}

/**
 * Guard expressions are identical to general expressions.
 *
 * Guards are evaluated after all head constraints are matched but before the
 * rule body is executed. A guard that evaluates to a falsy value causes the
 * match to be discarded. Host function calls in guards that throw
 * `CHRGuardError` are also treated as guard failures.
 */
export type GuardExpression = Expression

// ---------------------------------------------------------------------------
// Rule body items
// ---------------------------------------------------------------------------

/**
 * A new constraint to be added to the store when the rule fires.
 */
export interface BodyConstraint {
  type: 'constraint'
  constraint: ConstraintPattern
}

/**
 * A host action to be executed when the rule fires.
 *
 * Actions are side-effecting operations defined in host modules. They receive
 * a `HostActionContext` that exposes the engine, store, history, matched
 * constraints, and variable bindings.
 */
export interface BodyAction {
  type: 'action'
  name: string
  args: Expression[]
}

/**
 * An in-place constraint update: remove `old` and add `constraint`.
 *
 * The engine locates all store entries matching `old` and removes them, then
 * evaluates `constraint` and inserts the resulting constraint. This is the
 * CHR equivalent of a "retract + assert" pair in Prolog-like systems.
 */
export interface BodyConstraintUpdate {
  type: 'update'
  old: ConstraintPattern
  constraint: ConstraintPattern
}

/**
 * A local variable binding evaluated before the rest of the body runs.
 *
 * The result is stored in the rule's `bindings` map and can be referenced by
 * subsequent body items. `let` bindings are purely local to a single rule
 * firing and do not affect the global constraint store.
 */
export interface BodyLetBinding {
  type: 'let'
  name: string
  expr: Expression
}

/**
 * All possible items that may appear in a rule body.
 */
export type BodyItem = BodyConstraint | BodyAction | BodyConstraintUpdate | BodyLetBinding

// ---------------------------------------------------------------------------
// Rule node
// ---------------------------------------------------------------------------

/**
 * A fully parsed CHR rule, ready for engine compilation.
 *
 * A `RuleNode` is the parsed representation of a single CHR rule. The engine
 * compiles it into a `CompiledRule` (see `engine.ts`) that pre-extracts head
 * functors and priority for fast indexing during fixpoint iteration.
 *
 * Rule naming:
 * - Named rules (`name` present) are used in `PropagationHistory` keys and
 *   `onRuleFired` traces.
 * - Anonymous rules receive auto-generated names (`rule_N`) by `CHREngine.addRule`.
 *
 * The `unify` flag (default `false`) enables structural unification for the
 * head constraints. When `true`, the engine uses `unifyTerm` (from
 * `unification.ts`) instead of strict equality for variable binding. This is
 * required for rules that implement transitive closure, union-find, or
 * equivalence-class maintenance.
 */
export interface RuleNode {
  name?: string
  kind: RuleKind
  kept: ConstraintPattern[]
  removed: ConstraintPattern[]
  guard: GuardExpression[]
  body: BodyItem[]
  span?: SourceSpan
  priority?: number
  unify?: boolean
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

/**
 * A constraint declaration: `name/arity`.
 *
 * Declarations enforce arity checking. If a constraint is declared as `edge/2`,
 * asserting `edge(1, 2, 3)` or matching `edge(X)` will throw an execution error.
 */
export interface ConstraintDeclaration {
  name: string
  arity: number
  span?: SourceSpan
}

/**
 * A host function declaration: `name/arity`.
 *
 * Host functions are guard or body expressions that call back into user-supplied
 * TypeScript code. Declaring them up-front allows the engine to validate arity
 * and report missing implementations before the fixpoint loop begins.
 */
export interface HostFunctionDeclaration {
  name: string
  arity: number
  span?: SourceSpan
}

/**
 * A host action declaration: `name/arity`.
 *
 * Actions are similar to functions but are only allowed in rule bodies and
 * return no meaningful value (they are executed for side effects).
 */
export interface HostActionDeclaration {
  name: string
  arity: number
  span?: SourceSpan
}

/**
 * An import host statement: `import host ModuleName`.
 *
 * When parsed, the engine looks up `ModuleName` in the set of registered host
 * modules and merges its `functions` and `actions` into the current engine.
 */
export interface HostImportDeclaration {
  name: string
  span?: SourceSpan
}

// ---------------------------------------------------------------------------
// Program node (top-level parsed result)
// ---------------------------------------------------------------------------

/**
 * The top-level AST node produced by `parseProgram`.
 *
 * A `ProgramNode` aggregates all declarations, imports, and rules from a single
 * `.chr` source file. It is passed to `CHREngine.addProgram` which applies each
 * component in order: declarations → function declarations → action declarations
 * → host imports → rules.
 */
export interface ProgramNode {
  declarations: ConstraintDeclaration[]
  functionDeclarations: HostFunctionDeclaration[]
  actionDeclarations: HostActionDeclaration[]
  hostImports: HostImportDeclaration[]
  rules: RuleNode[]
}

// ---------------------------------------------------------------------------
// Rule fire trace (observability)
// ---------------------------------------------------------------------------

/**
 * A trace record emitted for every successful rule firing via `onRuleFired`.
 *
 * The trace includes the rule identity, the matched constraint IDs (so the
 * caller can inspect exactly which store entries triggered the rule), the
 * variable bindings established by head matching, and optional timing
 * information.
 *
 * `RuleFireTrace` is the primary observability hook for debugging CHR programs
 * and for building visualizations of constraint propagation.
 */
export interface RuleFireTrace {
  ruleName: string
  kind: RuleKind
  priority?: number
  matchedConstraintIds: number[]
  bindings: Record<string, unknown>
  guardResults?: unknown[]
  firedAt?: number
  durationMs?: number
}
