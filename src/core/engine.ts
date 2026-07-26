/**
 * The central CHR (Constraint Handling Rules) execution engine.
 *
 * `CHREngine` is the heart of CHR.ts. It owns the constraint store, the
 * propagation history (for loop detection), the compiled rule set, and the
 * host function/action registries. All constraint manipulation flows through
 * this class.
 *
 * Lifecycle:
 *   1. Construct an instance with optional `CHREngineOptions`.
 *   2. Register builtins (`registerBuiltins()`) and/or host modules.
 *   3. Load rules via `addProgram(ProgramNode)`, `addRules(source)`, or
 *      `load(filePath)`.
 *   4. Assert constraints with `assert(name, args)` or `assertMany(entries)`.
 *   5. Each assertion triggers `runToFixpoint` which fires rules until no more
 *      rules match or the maximum firing limit is reached.
 *   6. Inspect the resulting store with `snapshot()`, `printStore()`, or
 *      `expect(name, args)`.
 *
 * State machine:
 *   - `empty` → no rules loaded; mutations are rejected.
 *   - `ready` → rules loaded; assertions allowed.
 *   - `running` → fixpoint loop in progress; rule mutations rejected.
 *   - `error` → fatal error occurred; only `clear()` or new instance allowed.
 *
 * Thread-safety: `CHREngine` is NOT thread-safe. A single instance should only
 * be used from one async context at a time.
 */

import {
  BodyAction,
  BodyConstraint,
  BodyConstraintUpdate,
  ConstraintDeclaration,
  ConstraintPattern,
  Expression,
  HostActionDeclaration,
  HostFunctionDeclaration,
  HostImportDeclaration,
  ProgramNode,
  RuleFireTrace,
  RuleNode
} from './ast.js'
import { BuiltinsModule } from './builtins.js'
import { ConstraintRecord } from './constraint.js'
import { CHRExecutionError, CHRParseError, CHRGuardError } from './errors.js'
import { PropagationHistory } from './history.js'
import { parseProgram } from './parser.js'
import { ConstraintStore } from './store.js'
import { Substitution } from './substitution.js'
import { materializeSubstitution, unifyTerm } from './unification.js'
import { readFileSync } from 'node:fs'
import { evaluateExpression as evalExpression } from './engine/eval.js'

// ---------------------------------------------------------------------------
// Public interfaces and types
// ---------------------------------------------------------------------------

/**
 * A snapshot of the engine's complete state.
 *
 * Useful for inspection, debugging, and serialization. The snapshot is a
 * shallow copy of the engine's internal data structures, so mutations to the
 * snapshot do not affect the engine.
 */
export interface EngineSnapshot {
  rules: Array<{ name: string, kind: RuleNode['kind'], priority?: number }>
  constraints: ReturnType<ConstraintStore['snapshot']>
  history: ReturnType<PropagationHistory['snapshot']>
}

/**
 * Context object passed to every host function invocation.
 *
 * Host functions receive this context as their first argument, followed by
 * the evaluated argument list. The context provides access to the engine,
 * store, history, matched constraints, and variable bindings established
 * during head matching.
 */
export interface HostFunctionContext {
  engine: CHREngine
  store: ConstraintStore
  history: PropagationHistory
  rule: RuleNode
  matched: ConstraintRecord[]
  bindings: Record<string, unknown>
}

/**
 * Extended context object passed to every host action invocation.
 *
 * Host actions are like host functions but return no meaningful value and are
 * only allowed in rule bodies. They receive the same base context plus an
 * `args` array containing the already-evaluated action arguments.
 */
export interface HostActionContext extends HostFunctionContext {
  args: unknown[]
}

/**
 * A host function signature.
 *
 * Host functions are called from guard and body expressions. They must accept
 * a `HostFunctionContext` followed by the expected number of arguments.
 * They may return a value (for guards) or a `Promise` of a value.
 */
export type HostFunction = (ctx: HostFunctionContext, ...args: unknown[]) => unknown | Promise<unknown>

/**
 * A guard function signature.
 *
 * Guard functions are a specialized form of host function that must return a
 * boolean (or a `Promise<boolean>`). If a guard function returns a falsy value
 * or throws `CHRGuardError`, the rule match is discarded without propagating
 * the error as a fatal engine failure.
 */
export type GuardFunction = (ctx: HostFunctionContext, ...args: unknown[]) => boolean | Promise<boolean>

/**
 * A host action signature.
 *
 * Host actions are called from rule bodies for side effects. They accept a
 * `HostActionContext` and return `void` or a `Promise<void>`.
 */
export type HostAction = (ctx: HostActionContext) => void | Promise<void>

/**
 * A host module bundles host functions and actions under a single namespace.
 *
 * Host modules are registered with `registerHostModule(name, module)` and
 * later imported in `.chr` source via `import host Name;`. The module's
 * `functions` and `actions` are merged into the engine's registries at import
 * time.
 */
export interface HostModule {
  functions?: Record<string, HostFunction>
  actions?: Record<string, HostAction>
}

/**
 * Options for constructing a `CHREngine` instance.
 */
export interface CHREngineOptions {
  /** Maximum number of rule firings per fixpoint iteration (default: 10000). Prevents infinite loops from buggy rule sets. */
  maxRuleFirings?: number
  /** Optional callback invoked after every successful rule firing with a `RuleFireTrace`. */
  onRuleFired?: (trace: RuleFireTrace) => void
  /** If true, host functions/actions must be declared in the `.chr` source before use. Default: false. */
  strictHostDeclarations?: boolean
  /** Maximum wall-clock time (ms) for a single host function call. `undefined` means no timeout. */
  hostFunctionTimeout?: number
}

/**
 * Options for `assert` and `assertMany`.
 */
export interface AssertOptions {
  /** Override the engine-wide maximum firings for this assertion only. */
  maxRuleFirings?: number
}

/**
 * A type-safe wrapper around `CHREngine` for a fixed set of constraint names
 * and arities.
 *
 * Obtained via `engine.withConstraints<T>()`. The generic parameter `T` is a
 * record mapping constraint names to tuples of argument types. This allows the
 * compiler to catch arity mismatches and wrong argument types at build time.
 */
export interface TypedEngine<Constraints extends Record<string, readonly unknown[]>> {
  assert<K extends keyof Constraints>(name: K, args: Constraints[K]): Promise<ReturnType<ConstraintStore['add']>>
  assertMany(entries: Array<{ name: keyof Constraints, args?: Constraints[keyof Constraints] }>): Promise<{ added: number }>
}

/**
 * Internal match result returned by `findMatch` and `findMatchRecursive`.
 */
interface MatchResult {
  constraints: ConstraintRecord[]
  bindings: Record<string, unknown>
}

/**
 * The possible states of the engine's state machine.
 */
export type EngineState = 'empty' | 'ready' | 'running' | 'error'

/**
 * A pre-compiled rule representation used for fast rule scheduling.
 *
 * The engine compiles `RuleNode` objects into `CompiledRule` objects at load
 * time. Pre-extracting `headFunctors` and `priority` avoids recomputing them
 * on every fixpoint iteration.
 */
interface CompiledRule {
  rule: RuleNode
  headFunctors: Array<{ name: string, arity: number }>
  priority: number
}

// ---------------------------------------------------------------------------
// CHREngine class
// ---------------------------------------------------------------------------

/**
 * The main CHR engine class.
 *
 * This class exposes the complete CHR.ts API. Most users interact with it
 * through the convenience factory `createEngine` (from `loader.ts`) or by
 * constructing it directly and calling `addRules`, `registerBuiltins`, and
 * `assert`.
 */
export class CHREngine {
  // -------------------------------------------------------------------------
  // Public mutable state (readonly views for consumers)
  // -------------------------------------------------------------------------

  /** The constraint store: the primary data structure holding all asserted constraints. */
  readonly store = new ConstraintStore()

  /** The propagation history: tracks which rule/constraint-ID combinations have already fired. */
  readonly history = new PropagationHistory()

  // -------------------------------------------------------------------------
  // Private internal state
  // -------------------------------------------------------------------------

  /** Raw parsed rules as loaded by the user. */
  private readonly rules: RuleNode[] = []

  /** Pre-compiled rules with extracted head functors and priorities. */
  private readonly compiledRules: CompiledRule[] = []

  /** Rules sorted by descending priority for fixpoint scheduling. */
  private sortedCompiledRules: CompiledRule[] = []

  /** Registered host functions, keyed by name. */
  private readonly functions = new Map<string, HostFunction>()

  /** Registered host actions, keyed by name. */
  private readonly actions = new Map<string, HostAction>()

  /** Declared constraint arities, keyed by constraint name. */
  private readonly declarations = new Map<string, number>()

  /** Declared host function arities, keyed by function name. `-1` means imported. */
  private readonly functionDeclarations = new Map<string, number>()

  /** Declared host action arities, keyed by action name. `-1` means imported. */
  private readonly actionDeclarations = new Map<string, number>()

  /** Registered host modules, keyed by module name. */
  private readonly hostModules = new Map<string, HostModule>()

  /** Maximum rule firings per fixpoint (from constructor options). */
  private readonly maxRuleFirings: number

  /** Optional callback for rule-firing observability. */
  private readonly onRuleFired: ((trace: RuleFireTrace) => void) | undefined

  /** If true, undeclared host functions/actions raise errors at validation time. */
  private readonly strictHostDeclarations: boolean

  /** Host function call timeout in milliseconds. `undefined` means no timeout. */
  private readonly hostFunctionTimeout: number | undefined

  /** Current engine state. */
  private _state: EngineState = 'empty'

  /** Accumulated warnings (non-fatal issues like shadowed variables or unused declarations). */
  private readonly warnings: string[] = []

  /** Whether host declaration validation has already run for the current program. */
  private hostDeclarationsValidated = false

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  /**
   * Construct a new `CHREngine` instance.
   *
   * The engine starts in the `empty` state. Rules and host modules must be
   * registered before any constraints can be asserted.
   *
   * @param options - Optional engine configuration.
   */
  constructor (options: CHREngineOptions = {}) {
    this.maxRuleFirings = options.maxRuleFirings ?? 10000
    this.onRuleFired = options.onRuleFired
    this.strictHostDeclarations = options.strictHostDeclarations ?? false
    this.hostFunctionTimeout = options.hostFunctionTimeout
  }

  // -------------------------------------------------------------------------
  // State inspection
  // -------------------------------------------------------------------------

  /**
   * Return the current engine state.
   *
   * Possible values: `'empty'`, `'ready'`, `'running'`, `'error'`.
   */
  getState (): EngineState {
    return this._state
  }

  /**
   * Return accumulated warnings from the most recent program load.
   *
   * Warnings include things like shadowed variables, dead bindings, and
   * unused host declarations. They do not prevent the engine from running
   * but may indicate bugs in the rule source.
   */
  getWarnings (): readonly string[] {
    return this.warnings
  }

  // -------------------------------------------------------------------------
  // Rule loading
  // -------------------------------------------------------------------------

  /**
   * Add a single rule to the engine.
   *
   * Rules must be added before any constraints are asserted. Adding rules
   * while the engine is `running` throws an error. Adding rules transitions
   * the engine to the `ready` state.
   *
   * @param rule - The parsed rule to add.
   * @throws {CHRExecutionError} If the engine is running or the rule is invalid.
   */
  addRule (rule: RuleNode): void {
    this.ensureEmpty()
    this.validateRuleConstraints(rule)
    this.validateVariableScoping(rule)
    const normalizedRule = {
      ...rule,
      name: rule.name ?? `rule_${this.rules.length}`
    }
    this.rules.push(normalizedRule)
    this.compileRule(normalizedRule)
    this.hostDeclarationsValidated = false
    this._state = 'ready'
  }

  /**
   * Pre-compile a rule to extract head functors and priority.
   *
   * This optimization avoids recomputing head functors on every fixpoint
   * iteration. The compiled representation is stored in `compiledRules` and
   * the sorted priority list is rebuilt.
   */
  private compileRule (rule: RuleNode): void {
    const headFunctors: Array<{ name: string, arity: number }> = []

    for (const pattern of [...rule.kept, ...rule.removed]) {
      headFunctors.push({
        name: pattern.name,
        arity: pattern.args.length
      })
    }

    const compiled: CompiledRule = {
      rule,
      headFunctors,
      priority: rule.priority ?? 0
    }

    this.compiledRules.push(compiled)
    this.rebuildSortedRules()
  }

  /**
   * Rebuild the priority-sorted rule list.
   *
   * Called after every `compileRule` to ensure that `fireNextRule` always
   * tries the highest-priority rule first.
   */
  private rebuildSortedRules (): void {
    this.sortedCompiledRules = [...this.compiledRules].sort((a, b) => b.priority - a.priority)
  }

  /**
   * Validate that all variables used in guards and body are bound in the head.
   *
   * This check runs at rule-load time (not at match time) so that mistakes
   * like using an unbound variable in a guard are caught immediately with a
   * precise source location.
   *
   * The wildcard variable `_` is exempt from the check because it is
   * intentionally anonymous.
   */
  private validateVariableScoping (rule: RuleNode): void {
    const patternVars = new Set<string>()

    // Collect all variables bound in constraint patterns (kept + removed heads).
    for (const pattern of [...rule.kept, ...rule.removed]) {
      for (const arg of pattern.args) {
        this.collectVariablesInExpression(arg, patternVars)
      }
    }

    // Validate guards only reference pattern-bound variables.
    for (const guard of rule.guard) {
      const guardVars = new Set<string>()
      this.collectVariablesInExpression(guard, guardVars)

      for (const varName of guardVars) {
        if (varName !== '_' && !patternVars.has(varName)) {
          throw new CHRExecutionError(
            `Guard references unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'. Only variables bound in head constraints can appear in guards.`,
            rule.span
          )
        }
      }
    }

    // Validate body doesn't use undeclared variables.
    for (const item of rule.body) {
      if (item.type === 'constraint') {
        for (const arg of item.constraint.args) {
          const bodyVars = new Set<string>()
          this.collectVariablesInExpression(arg, bodyVars)
          for (const varName of bodyVars) {
            if (varName !== '_' && !patternVars.has(varName)) {
              throw new CHRExecutionError(
                `Body constraint uses unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'..`,
                rule.span
              )
            }
          }
        }
      } else if (item.type === 'update') {
        for (const arg of [...item.old.args, ...item.constraint.args]) {
          const bodyVars = new Set<string>()
          this.collectVariablesInExpression(arg, bodyVars)
          for (const varName of bodyVars) {
            if (varName !== '_' && !patternVars.has(varName)) {
              throw new CHRExecutionError(
                `Body update uses unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'..`,
                rule.span
              )
            }
          }
        }
      }
    }
  }

  /**
   * Recursively collect all variable names referenced in an expression.
   *
   * Used by `validateVariableScoping` to build the set of bound variables
   * from the rule head.
   */
  private collectVariablesInExpression (expr: Expression, vars: Set<string>): void {
    if (expr.type === 'variable') {
      vars.add(expr.name)
    } else if (expr.type === 'unary') {
      this.collectVariablesInExpression(expr.operand, vars)
    } else if (expr.type === 'binary') {
      this.collectVariablesInExpression(expr.left, vars)
      this.collectVariablesInExpression(expr.right, vars)
    } else if (expr.type === 'call') {
      for (const arg of expr.args) {
        this.collectVariablesInExpression(arg, vars)
      }
    } else if (expr.type === 'array') {
      for (const elem of expr.elements) {
        this.collectVariablesInExpression(elem, vars)
      }
    }
  }

  /**
   * Load a complete program from a `ProgramNode`.
   *
   * Processes declarations, function/action declarations, host imports, and
   * rules in order. After loading, validates host declarations and scans for
   * unused functions/actions, pushing warnings into the `warnings` array.
   *
   * @param program - The parsed AST to load.
   * @throws {CHRExecutionError} If the engine is not `empty`.
   */
  addProgram (program: ProgramNode): void {
    this.ensureEmpty()
    const unusedFunctions = new Set(program.functionDeclarations.map((d) => d.name))
    const unusedActions = new Set(program.actionDeclarations.map((d) => d.name))

    for (const declaration of program.declarations) {
      this.applyDeclaration(declaration)
    }

    for (const declaration of program.functionDeclarations) {
      this.applyFunctionDeclaration(declaration)
    }

    for (const declaration of program.actionDeclarations) {
      this.applyActionDeclaration(declaration)
    }

    for (const imprt of program.hostImports) {
      this.applyHostImport(imprt)
    }

    for (const rule of program.rules) {
      this.addRule(rule)
      this.checkMatchingAndShadowing(rule)
      this.scanRuleUsage(rule, unusedFunctions, unusedActions)
    }

    for (const name of unusedFunctions) {
      this.warnings.push(`Unused function declaration: functions ${name}/...`)
    }
    for (const name of unusedActions) {
      this.warnings.push(`Unused action declaration: actions ${name}/...`)
    }
  }

  /**
   * Parse and load a `.chr` source string in one step.
   *
   * Equivalent to `addProgram(parseProgram(source))`.
   */
  addRules (source: string): void {
    this.addProgram(parseProgram(source))
  }

  /**
   * Validate a `.chr` source string without executing it.
   *
   * Returns an object indicating whether the source parsed and validated
   * successfully. Parse errors are returned as `parseError`; execution-time
   * validation errors (e.g. unbound variables, arity mismatches) are returned
   * as `executionErrors`. The engine state is not modified.
   */
  validate (source: string): { ok: boolean, parseError?: CHRParseError, executionErrors: CHRExecutionError[] } {
    const executionErrors: CHRExecutionError[] = []
    try {
      const program = parseProgram(source)

      for (const declaration of program.declarations) {
        this.applyDeclaration(declaration)
      }
      for (const declaration of program.functionDeclarations) {
        this.applyFunctionDeclaration(declaration)
      }
      for (const declaration of program.actionDeclarations) {
        this.applyActionDeclaration(declaration)
      }
      for (const imprt of program.hostImports) {
        this.applyHostImport(imprt)
      }

      for (const rule of program.rules) {
        try {
          this.validateRuleConstraints(rule)
          this.validateVariableScoping(rule)
          this.checkMatchingAndShadowing(rule)
        } catch (error) {
          if (error instanceof CHRExecutionError) {
            executionErrors.push(error)
          } else {
            throw error
          }
        }
      }
      return { ok: executionErrors.length === 0, executionErrors }
    } catch (error) {
      if (error instanceof CHRParseError) {
        return { ok: false, parseError: error, executionErrors }
      }
      throw error
    }
  }

  // -------------------------------------------------------------------------
  // Host registration
  // -------------------------------------------------------------------------

  /**
   * Register a single host function by name.
   *
   * The function's arity is inferred from `handler.length - 1` (the first
   * parameter is the context object, so it is excluded). If a function with
   * the same name is already registered, it is replaced.
   */
  registerFunction (name: string, handler: HostFunction): void {
    this.validateHostDeclaration(name, handler.length - 1, this.functionDeclarations, 'function', false)
    this.functions.set(name, handler)
    if (!this.functionDeclarations.has(name)) {
      this.functionDeclarations.set(name, -1)
    }
  }

  /**
   * Register multiple host functions from a record.
   *
   * Convenience wrapper around `registerFunction`.
   */
  registerFunctions (handlers: Record<string, HostFunction>): void {
    for (const [name, handler] of Object.entries(handlers)) {
      this.registerFunction(name, handler)
    }
  }

  /**
   * Register a single host action by name.
   *
   * The action's arity is inferred from `handler.length - 1`. If an action
   * with the same name is already registered, it is replaced.
   */
  registerAction (name: string, handler: HostAction): void {
    this.validateHostDeclaration(name, handler.length - 1, this.actionDeclarations, 'action', false)
    this.actions.set(name, handler)
    if (!this.actionDeclarations.has(name)) {
      this.actionDeclarations.set(name, -1)
    }
  }

  /**
   * Register multiple host actions from a record.
   *
   * Convenience wrapper around `registerAction`.
   */
  registerActions (handlers: Record<string, HostAction>): void {
    for (const [name, handler] of Object.entries(handlers)) {
      this.registerAction(name, handler)
    }
  }

  /**
   * Register a complete host module (functions + actions) at once.
   */
  registerHost (module: HostModule): void {
    if (module.functions) {
      this.registerFunctions(module.functions)
    }
    if (module.actions) {
      this.registerActions(module.actions)
    }
  }

  /**
   * Register the built-in host module (22 standard functions).
   *
   * The builtins module provides arithmetic, comparison, type checking,
   * string manipulation, and store inspection functions. It is registered
   * under the reserved name `'builtins'` and its functions are merged into
   * the engine's function registry.
   */
  registerBuiltins (): void {
    this.registerHost(BuiltinsModule)
    this.hostModules.set('builtins', BuiltinsModule)
  }

  /**
   * Register a named host module for later import via `import host Name`.
   *
   * @param name - The module name used in `.chr` source.
   * @param module - The module containing `functions` and/or `actions`.
   * @throws {CHRExecutionError} If a module with the same name is already registered.
   */
  registerHostModule (name: string, module: HostModule): void {
    if (this.hostModules.has(name)) {
      throw new CHRExecutionError(`Host module '${name}' is already registered.`)
    }
    this.hostModules.set(name, module)
  }

  /**
   * Register multiple named host modules.
   */
  registerHostModules (modules: Record<string, HostModule>): void {
    for (const [name, module] of Object.entries(modules)) {
      this.registerHostModule(name, module)
    }
  }

  // -------------------------------------------------------------------------
  // Constraint declaration
  // -------------------------------------------------------------------------

  /**
   * Declare a single constraint with a fixed arity.
   *
   * Constraint declarations enforce arity checking. Declaring `edge/2` and
   * then asserting `edge(1)` or matching `edge(X, Y, Z)` will throw an
   * execution error.
   *
   * @param name - Constraint functor name.
   * @param arity - Expected number of arguments.
   * @throws {CHRExecutionError} If the constraint is redeclared with a different arity.
   */
  declareConstraint (name: string, arity: number): void {
    const existing = this.declarations.get(name)
    if (typeof existing === 'number' && existing !== arity) {
      throw new CHRExecutionError(`Constraint ${name} redeclared with incompatible arity ${arity}; existing arity is ${existing}.`)
    }
    this.declarations.set(name, arity)
  }

  /**
   * Declare multiple constraints from a name→arity map.
   */
  declareConstraints (entries: Record<string, number>): void {
    for (const [name, arity] of Object.entries(entries)) {
      this.declareConstraint(name, arity)
    }
  }

  // -------------------------------------------------------------------------
  // Constraint assertion (primary user-facing API)
  // -------------------------------------------------------------------------

  /**
   * Assert a single constraint into the store and run the fixpoint loop.
   *
   * This is the main way to introduce new constraints. After adding the
   * constraint to the store, the engine iterates over rules (highest
   * priority first) and fires the first matching rule, repeating until no
   * more rules match or `maxRuleFirings` is exceeded.
   *
   * @param name - Constraint functor name.
   * @param args - Constraint arguments (must match declared arity if declared).
   * @param options - Optional per-assertion options.
   * @returns The `ConstraintRecord` that was added to the store.
   * @throws {CHRExecutionError} If no rules are loaded, arity is wrong, or max firings exceeded.
   */
  async assert (name: string, args: unknown[] = [], options?: AssertOptions): Promise<ConstraintRecord> {
    this.ensureReady()
    this.validateConstraintArity(name, args.length)
    this.validateHostDeclarationsOnce()
    const record = this.store.add(name, args)
    await this.runToFixpointSafe(options)
    return record
  }

  /**
   * Assert multiple constraints in batch and run the fixpoint loop once.
   *
   * More efficient than calling `assert` repeatedly because the fixpoint
   * loop only runs once after all constraints are added.
   *
   * @param entries - Array of `{ name, args }` constraint descriptors.
   * @param options - Optional per-assertion options.
   * @returns `{ added: number }` count of asserted constraints.
   */
  async assertMany (entries: Array<{ name: string, args?: unknown[] }>, options?: AssertOptions): Promise<{ added: number }> {
    this.ensureReady()
    this.validateHostDeclarationsOnce()
    for (const entry of entries) {
      this.validateConstraintArity(entry.name, (entry.args ?? []).length)
      this.store.add(entry.name, entry.args ?? [])
    }
    await this.runToFixpointSafe(options)
    return { added: entries.length }
  }

  /**
   * Clear the constraint store, history, and warnings.
   *
   * Does NOT remove rules or host modules. The engine returns to `ready`
   * state and can accept new assertions.
   */
  clear (): void {
    this.store.clear()
    this.history.clear()
    this.warnings.length = 0
    this._state = 'ready'
  }

  // -------------------------------------------------------------------------
  // Inspection / debugging
  // -------------------------------------------------------------------------

  /**
   * Take a snapshot of the engine's current state.
   *
   * The snapshot includes the rule list, constraint store contents, and
   * propagation history. It is a point-in-time copy; subsequent engine
   * mutations do not affect the snapshot.
   */
  snapshot (): EngineSnapshot {
    return {
      rules: this.rules.map((rule) => {
        const entry: { name: string, kind: RuleNode['kind'] } & Record<string, unknown> = {
          name: rule.name ?? 'anonymous',
          kind: rule.kind
        }
        if (rule.priority !== undefined) {
          entry.priority = rule.priority
        }
        return entry as { name: string, kind: RuleNode['kind'], priority?: number }
      }),
      constraints: this.store.snapshot(),
      history: this.history.snapshot()
    }
  }

  /**
   * Return a shallow copy of the loaded rules.
   */
  getRules (): RuleNode[] {
    return [...this.rules]
  }

  /**
   * Return all rules whose head contains a constraint with the given name.
   *
   * Useful for introspection and debugging: you can ask "which rules care
   * about `edge` constraints?" and get the answer.
   */
  getRulesByHead (name: string): RuleNode[] {
    return this.rules.filter((rule) => {
      for (const head of [...rule.kept, ...rule.removed]) {
        if (head.name === name) return true
      }
      return false
    })
  }

  /**
   * Return a human-readable string of the constraint store contents.
   */
  printStore (): string {
    return this.store.toString()
  }

  /**
   * Return a human-readable string of the propagation history.
   */
  printHistory (): string {
    const snapshot = this.history.snapshot()
    const keys = Object.keys(snapshot)
    if (keys.length === 0) return '(empty)'
    const rows = keys.flatMap((ruleName) =>
      (snapshot[ruleName] ?? []).map((ids) => `${ruleName}: [${ids}]`)
    )
    return ['Rule  Fired-on IDs', '----  --------------', ...rows].join('\n')
  }

  /**
   * Return a human-readable string describing all loaded rules.
   */
  printRules (): string {
    if (this.rules.length === 0) return '(no rules loaded)'
    return this.rules.map((rule, i) => {
      const name = rule.name ?? `rule_${i}`
      const kind = rule.kind
      const kept = rule.kept.map((h) => `${h.name}/${h.args.length}`).join(', ')
      const removed = rule.removed.map((h) => `${h.name}/${h.args.length}`).join(', ')
      return `${i}: ${name} [${kind}] kept=[${kept}] removed=[${removed}]`
    }).join('\n')
  }

  /**
   * Throw if no rules have been loaded.
   *
   * @throws {CHRExecutionError} If `this.rules` is empty.
   */
  ensureRulesLoaded (): void {
    if (this.rules.length === 0) {
      throw new CHRExecutionError('No rules have been loaded into the engine.')
    }
  }

  /**
   * Load rules from a `.chr` file on disk.
   *
   * @param filePath - Absolute or relative path to the `.chr` file.
   * @throws {CHRExecutionError} If the engine is running.
   */
  load (filePath: string): void {
    const source = readFileSync(filePath, 'utf-8')
    this.addRules(source)
  }

  // -------------------------------------------------------------------------
  // Test DSL: fluent assertion API
  // -------------------------------------------------------------------------

  /**
   * Create a fluent assertion descriptor for testing.
   *
   * Returns an object with `exists()`, `missing()`, and `count(n)` methods
   * that check whether a constraint matching the given name and args is
   * present in the store.
   *
   * Example:
   *   engine.assert('edge', [1, 2])
   *   expect(engine.expect('edge', [1, 2]).exists()).toBe(true)
   */
  expect (name: string, args: unknown[]): { exists: () => boolean, missing: () => boolean, count: (n: number) => boolean } {
    const records = this.store.lookup(name, args.length)
    return {
      exists: () => records.some((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])),
      missing: () => !records.some((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])),
      count: (n: number) => records.filter((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])).length === n
    }
  }

  /**
   * Return a type-safe assertion wrapper.
   *
   * The generic parameter `Constraints` is a record mapping constraint names
   * to tuples of argument types. The returned object exposes `assert` and
   * `assertMany` with compile-time arity checking.
   */
  withConstraints<Constraints extends Record<string, readonly unknown[]>> (): TypedEngine<Constraints> {
    return this as unknown as TypedEngine<Constraints>
  }

  // -------------------------------------------------------------------------
  // Private state guards
  // -------------------------------------------------------------------------

  /** Throw if the engine is currently running (mutations not allowed during fixpoint). */
  private ensureEmpty (): void {
    if (this._state === 'running') {
      throw new CHRExecutionError('Engine is currently running. Wait for the current assertion to complete before modifying rules.')
    }
  }

  /** Throw if the engine is `empty` or in `error` state. */
  private ensureReady (): void {
    if (this._state === 'empty') {
      throw new CHRExecutionError('No rules have been loaded into the engine.')
    }
    if (this._state === 'error') {
      throw new CHRExecutionError('Engine is in an error state. Create a new engine instance to continue.')
    }
  }

  // -------------------------------------------------------------------------
  // Host declaration validation
  // -------------------------------------------------------------------------

  /**
   * Validate that all declared host functions and actions have been registered.
   *
   * This runs once before the first assertion (cached in
   * `hostDeclarationsValidated`). It ensures that `functions foo/2;` in the
   * `.chr` source has a corresponding `engine.registerFunction('foo', ...)`
   * call in the host setup code.
   */
  private validateHostDeclarationsOnce (): void {
    if (this.hostDeclarationsValidated) {
      return
    }

    for (const [name, arity] of this.functionDeclarations) {
      if (!this.functions.has(name)) {
        throw new CHRExecutionError(`Declared function ${name}/${arity} is not registered. Call engine.registerFunction('${name}', handler) before asserting constraints.`)
      }
    }
    for (const [name, arity] of this.actionDeclarations) {
      if (!this.actions.has(name)) {
        throw new CHRExecutionError(`Declared action ${name}/${arity} is not registered. Call engine.registerAction('${name}', handler) before asserting constraints.`)
      }
    }

    this.hostDeclarationsValidated = true
  }

  /**
   * Scan a rule for used host functions and actions, removing them from the
   * "unused" sets.
   *
   * After all rules are loaded, any names remaining in `unusedFunctions` or
   * `unusedActions` are reported as warnings. This helps catch dead declarations
   * in the `.chr` source.
   */
  private scanRuleUsage (rule: RuleNode, unusedFunctions: Set<string>, unusedActions: Set<string>): void {
    const usedFunctions = new Set<string>()
    const usedActions = new Set<string>()

    const scanExpression = (expr: Expression) => {
      if (expr.type === 'call') {
        usedFunctions.add(expr.callee)
      } else if (expr.type === 'binary') {
        scanExpression(expr.left)
        scanExpression(expr.right)
      } else if (expr.type === 'unary') {
        scanExpression(expr.operand)
      }
    }

    const scanExprs = (exprs: Expression[]) => { for (const e of exprs) scanExpression(e) }

    const scanBody = (items: RuleNode['body']) => {
      for (const item of items) {
        if (item.type === 'action') {
          usedActions.add(item.name)
          scanExprs(item.args)
        } else if (item.type === 'constraint' || item.type === 'update') {
          for (const arg of item.constraint.args) scanExpression(arg)
          if (item.type === 'update') {
            for (const arg of item.old.args) scanExpression(arg)
          }
        } else if (item.type === 'let') {
          scanExpression(item.expr)
        }
      }
    }

    for (const guard of rule.guard) {
      scanExpression(guard)
    }
    scanBody(rule.body)

    for (const name of usedFunctions) {
      unusedFunctions.delete(name)
    }
    for (const name of usedActions) {
      unusedActions.delete(name)
    }
  }

  /**
   * Check a rule for common authoring mistakes.
   *
   * Two warnings are produced:
   * 1. Shadowed variables: a variable name appears in more than one head
   *    constraint. This is often a typo.
   * 2. Dead bindings: a variable is bound in the head but never used in
   *    guards or body.
   */
  private checkMatchingAndShadowing (rule: RuleNode): void {
    const allHeadVars = new Map<string, Array<{ constraintIndex: number }>>()

    for (let c = 0; c < rule.kept.length; c++) {
      for (const arg of (rule.kept[c]!).args) {
        if (arg.type === 'variable' && arg.name !== '_') {
          const key = arg.name
          const existing = allHeadVars.get(key) ?? []
          existing.push({ constraintIndex: c })
          allHeadVars.set(key, existing)
        }
      }
    }

    for (let c = 0; c < rule.removed.length; c++) {
      for (const arg of (rule.removed[c]!).args) {
        if (arg.type === 'variable' && arg.name !== '_') {
          const key = arg.name
          const existing = allHeadVars.get(key) ?? []
          existing.push({ constraintIndex: c })
          allHeadVars.set(key, existing)
        }
      }
    }

    const guardVars = new Set<string>()
    const bodyVars = new Set<string>()

    const collectVars = (expr: Expression) => {
      if (expr.type === 'variable' && expr.name !== '_') {
        bodyVars.add(expr.name)
      } else if (expr.type === 'unary') {
        collectVars(expr.operand)
      } else if (expr.type === 'binary') {
        collectVars(expr.left)
        collectVars(expr.right)
      } else if (expr.type === 'call') {
        for (const arg of expr.args) collectVars(arg)
      } else if (expr.type === 'array') {
        for (const elem of expr.elements) collectVars(elem)
      }
    }

    for (const guard of rule.guard) {
      collectVars(guard)
      for (const v of bodyVars) guardVars.add(v)
    }
    bodyVars.clear()

    for (const item of rule.body) {
      if (item.type === 'constraint') {
        for (const arg of item.constraint.args) {
          collectVars(arg)
        }
      } else if (item.type === 'action') {
        for (const arg of item.args) collectVars(arg)
      } else if (item.type === 'update') {
        for (const arg of item.old.args) collectVars(arg)
        for (const arg of item.constraint.args) collectVars(arg)
      } else if (item.type === 'let') {
        collectVars(item.expr)
      }
    }

    for (const [varName, occurrences] of allHeadVars) {
      if (occurrences.length > 1) {
        this.warnings.push(`Shadowed variable '${varName}' appears in multiple head constraints in rule '${rule.name ?? 'anonymous'}'. This is likely a typo.`)
      }
      if (!bodyVars.has(varName) && !guardVars.has(varName)) {
        this.warnings.push(`Dead binding '${varName}' in rule '${rule.name ?? 'anonymous'}': bound in head but never used in guards or body.`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Fixpoint loop
  // -------------------------------------------------------------------------

  /**
   * Run the fixpoint loop with error-state management.
   *
   * Sets `_state = 'running'` before calling `runToFixpoint`. On success the
   * state returns to `'ready'`; on failure it transitions to `'error'`.
   */
  private async runToFixpointSafe (options?: AssertOptions): Promise<void> {
    this._state = 'running'
    try {
      await this.runToFixpoint(options)
      this._state = 'ready'
    } catch (error) {
      this._state = 'error'
      throw error
    }
  }

  /**
   * Execute the core fixpoint loop.
   *
   * Repeatedly calls `fireNextRule` until no rule fires or the maximum
   * firing count is exceeded. The maximum is either the per-assertion option
   * or the engine-wide default.
   *
   * @throws {CHRExecutionError} If `maxRuleFirings` is exceeded.
   */
  private async runToFixpoint (options?: AssertOptions): Promise<void> {
    let firings = 0
    const maxFirings = options?.maxRuleFirings ?? this.maxRuleFirings

    while (true) {
      const fired = await this.fireNextRule()
      if (!fired) {
        return
      }

      firings += 1
      if (firings > maxFirings) {
        throw new CHRExecutionError(`Maximum rule firings exceeded (${maxFirings}).`)
      }
    }
  }

  /**
   * Find and fire the first rule that has a matching head and passing guards.
   *
   * Rules are tried in descending priority order (highest priority first).
   * Only one rule fires per call. Returns `true` if a rule was fired, `false`
   * if no rules matched.
   */
  private async fireNextRule (): Promise<boolean> {
    for (const compiled of this.sortedCompiledRules) {
      const rule = compiled.rule
      const match = await this.findMatch(rule)
      if (!match) {
        continue
      }

      await this.applyRule(rule, match)
      return true
    }

    return false
  }

  // -------------------------------------------------------------------------
  // Pattern matching
  // -------------------------------------------------------------------------

  /**
   * Attempt to find a match for a rule's head constraints in the store.
   *
   * Uses `findMatchRecursive` to perform a depth-first search over the
   * Cartesian product of store entries matching each head pattern. Returns
   * the first complete match whose guards all pass.
   */
  private async findMatch (rule: RuleNode): Promise<MatchResult | null> {
    const heads = [...rule.kept, ...rule.removed]
    if (heads.length === 0) {
      return { constraints: [], bindings: {} }
    }
    return this.findMatchRecursive(rule, heads, 0, [], {}, new Set<number>())
  }

  /**
   * Recursively search for a complete head match.
   *
   * For each head pattern at `index`, iterate over all store entries that
   * match the functor and arity. For each candidate, extend the current
   * bindings with `matchPattern`. If all heads are matched and guards pass,
   * return the match. Otherwise backtrack and try the next candidate.
   *
   * The `usedIds` set prevents the same constraint from being matched twice
   * in a single rule head.
   */
  private async findMatchRecursive (
    rule: RuleNode,
    heads: ConstraintPattern[],
    index: number,
    matched: ConstraintRecord[],
    bindings: Record<string, unknown>,
    usedIds: Set<number>
  ): Promise<MatchResult | null> {
    if (index >= heads.length) {
      const ids = matched.map((entry) => entry.id)

      const guardsOk = await this.evaluateGuards(rule, matched, bindings)
      if (!guardsOk) {
        return null
      }

      // Propagation rules use history to prevent infinite loops.
      if (rule.kind === 'propagation') {
        if (this.history.has(rule.name ?? 'anonymous', ids)) {
          return null
        }
        this.history.add(rule.name ?? 'anonymous', ids)
      }

      return { constraints: matched, bindings }
    }

    const pattern = heads[index]
    if (!pattern) {
      return null
    }

    for (const candidate of this.store.lookup(pattern.name, pattern.args.length)) {
      if (usedIds.has(candidate.id)) {
        continue
      }

      const newBindings = this.matchPattern(rule, pattern, candidate, bindings)
      if (!newBindings) {
        continue
      }

      const nextUsedIds = new Set(usedIds)
      nextUsedIds.add(candidate.id)

      const recursive = await this.findMatchRecursive(
        rule,
        heads,
        index + 1,
        [...matched, candidate],
        newBindings,
        nextUsedIds
      )

      if (recursive) {
        return recursive
      }
    }

    return null
  }

  /**
   * Match a single head pattern against a candidate constraint record.
   *
   * If `rule.unify` is true, uses structural unification (transitive variable
   * binding). Otherwise uses strict equality: a variable that is already bound
   * must match exactly; literals must match exactly.
   */
  private matchPattern (
    rule: RuleNode,
    pattern: ConstraintPattern,
    constraint: ConstraintRecord,
    bindings: Record<string, unknown>
  ): Record<string, unknown> | null {
    let nextBindings: Record<string, unknown> = { ...bindings }
    const useUnification = rule.unify === true
    const subst = useUnification ? this.initSubstitution(bindings) : null

    for (let index = 0; index < pattern.args.length; index++) {
      const term = pattern.args[index]
      const value = constraint.args[index]
      if (!term) {
        return null
      }

      if (term.type === 'variable') {
        if (term.name === '_') {
          continue
        }

        if (useUnification) {
          // Structural unification: may introduce new bindings or discover conflicts.
          const unified = unifyTerm(term, value, subst!)
          if (!unified) {
            return null
          }
          nextBindings = materializeSubstitution(unified, nextBindings)
        } else {
          // Strict matching: variable must not conflict with existing bindings.
          if (Object.hasOwn(nextBindings, term.name)) {
            if (nextBindings[term.name] !== value) {
              return null
            }
          } else {
            nextBindings = { ...nextBindings, [term.name]: value }
          }
        }
        continue
      }

      if (term.type === 'literal') {
        if (term.value !== value) {
          return null
        }
        continue
      }

      throw new CHRExecutionError(`Head expressions must be variables or literals. Unsupported term in ${pattern.name}/${pattern.args.length}.`, rule.span)
    }

    return nextBindings
  }

  /**
   * Initialize a `Substitution` from existing variable bindings.
   *
   * Used only when `rule.unify` is true. The wildcard `_` is excluded from
   * the substitution because it never needs to be resolved.
   */
  private initSubstitution (bindings: Record<string, unknown>): Substitution {
    const subst = new Substitution()
    for (const [name, value] of Object.entries(bindings)) {
      if (name !== '_') {
        subst.set(name, value)
      }
    }
    return subst
  }

  // -------------------------------------------------------------------------
  // Guard evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate all guards for a candidate match.
   *
   * Guards are evaluated left-to-right. Evaluation short-circuits on the
   * first falsy result. `CHRGuardError` thrown by a host function is caught
   * and treated as a guard failure (the rule does not fire), not as a fatal
   * engine error.
   *
   * @returns `true` if all guards pass, `false` if any guard fails.
   */
  private async evaluateGuards (rule: RuleNode, matched: ConstraintRecord[], bindings: Record<string, unknown>): Promise<boolean> {
    for (const guard of rule.guard) {
      try {
        const value = await this.evaluateExpression(guard, rule, matched, bindings, true)
        if (!value) {
          return false
        }
      } catch (error) {
        if (error instanceof CHRGuardError) {
          return false // Guard failure, not engine error
        }
        throw error // Other errors still fatal
      }
    }
    return true
  }

  // -------------------------------------------------------------------------
  // Rule application (side effects)
  // -------------------------------------------------------------------------

  /**
   * Execute a matched rule's side effects.
   *
   * Order of operations:
   * 1. Fire the `onRuleFired` callback with timing information.
   * 2. Determine which matched constraints should be removed.
   * 3. Remove those constraints from the store.
   * 4. Execute body items (constraint additions, actions, updates, let-bindings).
   *
   * The store is not mutated during head matching or guard evaluation. It is
   * only mutated in step 3 (removal) and step 4 (addition / update), and
   * body items see the post-removal store state.
   */
  private async applyRule (rule: RuleNode, match: MatchResult): Promise<void> {
    const ruleName = rule.name ?? 'anonymous'
    const ids = match.constraints.map((entry) => entry.id)
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

    this.onRuleFiredWithTiming(rule, ruleName, ids, match, startTime)

    // FIXED: Determine what to remove (but don't remove yet!)
    const constraintsToRemove = this.determineConstraintsToRemove(rule, match.constraints)

    // FIXED: Now remove constraints (after guards passed)
    for (const constraint of constraintsToRemove) {
      this.store.remove(constraint.id)
    }

    // FIXED: Execute body with modified store
    for (const item of rule.body) {
      if (item.type === 'constraint') {
        await this.emitConstraint(rule, match, item)
      } else if (item.type === 'action') {
        await this.runAction(rule, match, item)
      } else if (item.type === 'update') {
        await this.applyConstraintUpdate(rule, match, item)
      } else if (item.type === 'let') {
        await this.evaluateExpression(item.expr, rule, match.constraints, match.bindings, false)
      }
    }
  }

  /**
   * Determine which matched constraints should be removed based on rule kind.
   *
   * - `propagation`: no constraints are removed (kept = all).
   * - `simplification`: all matched constraints are removed.
   * - `simpagation`: only the removed head constraints are removed (those
   *   after the `\` separator).
   */
  private determineConstraintsToRemove (rule: RuleNode, matched: ConstraintRecord[]): ConstraintRecord[] {
    if (rule.kind === 'propagation') {
      return []
    }

    if (rule.kind === 'simplification') {
      return matched
    }

    // Simpagation: remove all but the kept ones
    return matched.slice(rule.kept.length)
  }

  /**
   * Emit a new constraint into the store as part of rule body execution.
   *
   * Special case: `true` (arity 0) is silently ignored because it is a no-op
   * in CHR semantics.
   */
  private async emitConstraint (rule: RuleNode, match: MatchResult, item: BodyConstraint): Promise<void> {
    if (item.constraint.name === 'true' && item.constraint.args.length === 0) {
      return
    }

    const args: unknown[] = []
    for (const arg of item.constraint.args) {
      args.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false))
    }

    this.validateConstraintArity(item.constraint.name, args.length)
    this.store.add(item.constraint.name, args)
  }

  /**
   * Perform an in-place constraint update: remove `old` and add `constraint`.
   *
   * The engine locates all store entries matching `old` by comparing names,
   * arities, and every argument value. Matching entries are removed before
   * the new constraint is added.
   */
  private async applyConstraintUpdate (rule: RuleNode, match: MatchResult, item: BodyConstraintUpdate): Promise<void> {
    const oldArgs: unknown[] = []
    for (const arg of item.old.args) {
      oldArgs.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false))
    }

    const toRemove = this.store.lookup(item.old.name, oldArgs.length)
      .filter((c) => {
        if (c.args.length !== oldArgs.length) return false
        return c.args.every((v, i) => v === oldArgs[i])
      })
    for (const c of toRemove) {
      this.store.remove(c.id)
    }

    const newArgs: unknown[] = []
    for (const arg of item.constraint.args) {
      newArgs.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false))
    }
    this.validateConstraintArity(item.constraint.name, newArgs.length)
    this.store.add(item.constraint.name, newArgs)
  }

  /**
   * Execute a host action with the given evaluated arguments.
   *
   * Looks up the action by name in the action registry. If not found, throws
   * `CHRExecutionError` with a "did you mean?" suggestion if a similar name
   * exists. Wraps any action error in `CHRExecutionError` with the rule span.
   */
  private async runAction (rule: RuleNode, match: MatchResult, item: BodyAction): Promise<void> {
    const action = this.actions.get(item.name)
    if (!action) {
      throw new CHRExecutionError(
        `Unknown host action: ${item.name}${this.suggestSimilar(item.name, this.actions)}`,
        rule.span
      )
    }

    const args: unknown[] = []
    for (const arg of item.args) {
      args.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false))
    }

    try {
      await action({
        engine: this,
        store: this.store,
        history: this.history,
        rule,
        matched: match.constraints,
        bindings: match.bindings,
        args
      })
    } catch (error) {
      throw new CHRExecutionError(
        `Host action ${item.name} threw in rule ${rule.name ?? 'anonymous'}: ${(error as Error).message}`,
        rule.span,
        error as Error
      )
    }
  }

  // -------------------------------------------------------------------------
  // Expression evaluation (delegates to engine/eval.ts)
  // -------------------------------------------------------------------------

  /**
   * Evaluate an expression in the context of a rule firing.
   *
   * This is a thin wrapper around `evaluateExpression` from `engine/eval.ts`
   * that injects the engine's runtime dependencies (function map, timeout,
   * store, history, and similarity suggester).
   */
  private evaluateExpression = async (
    expr: Expression,
    rule: RuleNode,
    matched: ConstraintRecord[],
    bindings: Record<string, unknown>,
    isGuard: boolean = false
  ): Promise<unknown> => {
    return evalExpression(
      {
        functions: this.functions as Map<string, any>,
        hostFunctionTimeout: this.hostFunctionTimeout,
        store: this.store,
        history: this.history,
        isGuard,
        engine: this,
        suggestSimilar: (...args: [string, Map<string, any>]) => this.suggestSimilar(...args)
      },
      expr,
      rule,
      matched,
      bindings
    )
  }

  // -------------------------------------------------------------------------
  // Validation helpers
  // -------------------------------------------------------------------------

  /**
   * Validate that a rule's head constraints and body expressions are well-formed.
   *
   * Checks:
   * 1. All head constraints have declared arities (if declared).
   * 2. All host function calls in guards are declared.
   * 3. All body constraint arities match declarations.
   * 4. All host actions in the body are declared.
   * 5. All host function calls in body expressions are declared.
   */
  private validateRuleConstraints (rule: RuleNode): void {
    for (const head of [...rule.kept, ...rule.removed]) {
      this.validateConstraintArity(head.name, head.args.length)
    }

    for (const guard of rule.guard) {
      this.validateHostCallsInExpression(guard, rule, 'function')
    }

    for (const item of rule.body) {
      if (item.type === 'constraint') {
        this.validateConstraintArity(item.constraint.name, item.constraint.args.length)
        for (const arg of item.constraint.args) {
          this.validateHostCallsInExpression(arg, rule, 'function')
        }
      } else if (item.type === 'action') {
        this.validateHostDeclaration(item.name, item.args.length, this.actionDeclarations, 'action', true, rule)
      } else if (item.type === 'update') {
        this.validateConstraintArity(item.constraint.name, item.constraint.args.length)
        for (const arg of [...item.old.args, ...item.constraint.args]) {
          this.validateHostCallsInExpression(arg, rule, 'function')
        }
      }
    }
  }

  /**
   * Throw if a constraint name is declared with a different arity.
   */
  private validateConstraintArity (name: string, arity: number): void {
    const declaredArity = this.declarations.get(name)
    if (typeof declaredArity === 'number' && declaredArity !== arity) {
      throw new CHRExecutionError(`Constraint ${name}/${arity} violates declared arity ${declaredArity}.`)
    }
  }

  // -------------------------------------------------------------------------
  // Declaration application
  // -------------------------------------------------------------------------

  /** Apply a constraint declaration to the engine's declaration map. */
  private applyDeclaration (declaration: ConstraintDeclaration): void {
    this.declareConstraint(declaration.name, declaration.arity)
  }

  /** Apply a host function declaration to the engine's declaration map. */
  private applyFunctionDeclaration (declaration: HostFunctionDeclaration): void {
    this.validateHostDeclaration(declaration.name, declaration.arity, this.functionDeclarations, 'function', false)
    this.functionDeclarations.set(declaration.name, declaration.arity)
  }

  /** Apply a host action declaration to the engine's declaration map. */
  private applyActionDeclaration (declaration: HostActionDeclaration): void {
    this.validateHostDeclaration(declaration.name, declaration.arity, this.actionDeclarations, 'action', false)
    this.actionDeclarations.set(declaration.name, declaration.arity)
  }

  /**
   * Apply a host import statement by looking up the named module.
   *
   * The module's functions and actions are merged into the engine's
   * registries. Their declarations are recorded with arity `-1` (imported)
   * so that subsequent `validateHostDeclaration` calls do not require an
   * explicit `functions name/arity;` declaration in the `.chr` source.
   */
  private applyHostImport (imprt: HostImportDeclaration): void {
    const module = this.hostModules.get(imprt.name)
    if (!module) {
      throw new CHRExecutionError(
        `Unknown host module '${imprt.name}' in import. Available modules: ${[...this.hostModules.keys()].join(', ') || '(none registered)'}`,
        imprt.span
      )
    }

    if (module.functions) {
      for (const [name, handler] of Object.entries(module.functions)) {
        this.functions.set(name, handler)
        this.functionDeclarations.set(name, -1)
      }
    }

    if (module.actions) {
      for (const [name, handler] of Object.entries(module.actions)) {
        this.actions.set(name, handler)
        this.actionDeclarations.set(name, -1)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Host validation helpers
  // -------------------------------------------------------------------------

  /**
   * Recursively validate that all host function calls in an expression are
   * properly declared.
   */
  private validateHostCallsInExpression (expr: Expression, rule: RuleNode, kind: 'function' | 'action'): void {
    if (expr.type === 'unary') {
      if (expr.operand.type === 'call' || expr.operand.type === 'binary' || expr.operand.type === 'unary') {
        this.validateHostCallsInExpression(expr.operand, rule, kind)
      }
      return
    }

    if (expr.type === 'binary') {
      this.validateHostCallsInExpression(expr.left, rule, kind)
      this.validateHostCallsInExpression(expr.right, rule, kind)
      return
    }

    if (expr.type !== 'call') {
      return
    }

    this.validateHostDeclaration(expr.callee, expr.args.length, this.functionDeclarations, kind, true, rule)
    for (const arg of expr.args) {
      this.validateHostCallsInExpression(arg, rule, kind)
    }
  }

  /**
   * Validate a single host function or action declaration against its registry.
   *
   * @param name - Function or action name.
   * @param arity - Number of arguments passed.
   * @param declarations - The registry map to check against.
   * @param kind - `'function'` or `'action'` (for error messages).
   * @param requireDeclaration - If true, throw when the name is not in the registry at all.
   * @param rule - Optional rule for attaching the error span.
   * @throws {CHRExecutionError} If arity mismatches or declaration is missing.
   */
  private validateHostDeclaration (
    name: string,
    arity: number,
    declarations: Map<string, number>,
    kind: 'function' | 'action',
    requireDeclaration: boolean,
    rule?: RuleNode
  ): void {
    const declaredArity = declarations.get(name)
    if (typeof declaredArity === 'number' && declaredArity !== arity && declaredArity !== -1) {
      throw new CHRExecutionError(`Host ${kind} ${name}/${arity} violates declared arity ${declaredArity}.`, rule?.span)
    }

    if (requireDeclaration && (declarations.size > 0 || this.strictHostDeclarations) && declaredArity === undefined) {
      throw new CHRExecutionError(`Host ${kind} ${name}/${arity} is not declared in source. Use "${kind}s ${name}/${arity};" in the rule source.`, rule?.span)
    }
  }

  // -------------------------------------------------------------------------
  // Observability
  // -------------------------------------------------------------------------

  /**
   * Build and fire the `onRuleFired` callback with timing information.
   *
   * Timing is measured using `performance.now()` (browser / Node >= 16) or
   * falls back to `Date.now()`. Errors in the callback are silently ignored
   * so that observability hooks cannot disrupt rule execution.
   */
  private onRuleFiredWithTiming (rule: RuleNode, ruleName: string, ids: number[], match: MatchResult, startTime: number): void {
    if (!this.onRuleFired) return
    const trace: RuleFireTrace = {
      ruleName,
      kind: rule.kind,
      matchedConstraintIds: ids,
      bindings: { ...match.bindings },
      guardResults: [],
      firedAt: startTime
    }
    if (rule.priority !== undefined) {
      trace.priority = rule.priority
    }
    const endTraceTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
    trace.durationMs = endTraceTime - startTime
    try {
      this.onRuleFired(trace)
    } catch {
      // ignore trace callback errors
    }
  }

  // -------------------------------------------------------------------------
  // Utility: fuzzy name matching
  // -------------------------------------------------------------------------

  /**
   * Suggest a similar registered name for a typo.
   *
   * Uses Levenshtein-style character-by-character comparison. If the best
   * match has distance <= 3, returns a `. Did you mean X?` suggestion.
   * Otherwise returns an empty string.
   */
  private suggestSimilar (name: string, registry: Map<string, { }>): string {
    let bestDistance = Infinity
    let bestName = ''
    for (const key of registry.keys()) {
      let distance = 0
      const len = Math.max(name.length, key.length)
      for (let i = 0; i < len; i++) {
        if ((name[i] ?? '') !== (key[i] ?? '')) distance++
      }
      if (distance < bestDistance) {
        bestDistance = distance
        bestName = key
      }
    }
    if (bestDistance <= 3 && bestName) {
      return `. Did you mean ${bestName}?`
    }
    return ''
  }
}
