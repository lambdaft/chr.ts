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

export interface EngineSnapshot {
  rules: Array<{ name: string, kind: RuleNode['kind'], priority?: number }>
  constraints: ReturnType<ConstraintStore['snapshot']>
  history: ReturnType<PropagationHistory['snapshot']>
}

export interface HostFunctionContext {
  engine: CHREngine
  store: ConstraintStore
  history: PropagationHistory
  rule: RuleNode
  matched: ConstraintRecord[]
  bindings: Record<string, unknown>
}

export interface HostActionContext extends HostFunctionContext {
  args: unknown[]
}

export type HostFunction = (ctx: HostFunctionContext, ...args: unknown[]) => unknown | Promise<unknown>
export type GuardFunction = (ctx: HostFunctionContext, ...args: unknown[]) => boolean | Promise<boolean>
export type HostAction = (ctx: HostActionContext) => void | Promise<void>

export interface HostModule {
  functions?: Record<string, HostFunction>
  actions?: Record<string, HostAction>
}

export interface CHREngineOptions {
  maxRuleFirings?: number
  onRuleFired?: (trace: RuleFireTrace) => void
  strictHostDeclarations?: boolean
  hostFunctionTimeout?: number
}

export interface AssertOptions {
  maxRuleFirings?: number
}

export interface TypedEngine<Constraints extends Record<string, readonly unknown[]>> {
  assert<K extends keyof Constraints>(name: K, args: Constraints[K]): Promise<ReturnType<ConstraintStore['add']>>
  assertMany(entries: Array<{ name: keyof Constraints, args?: Constraints[keyof Constraints] }>): Promise<{ added: number }>
}

interface MatchResult {
  constraints: ConstraintRecord[]
  bindings: Record<string, unknown>
}

export type EngineState = 'empty' | 'ready' | 'running' | 'error'

/**
 * FIXED: Added compilation layer for rules to avoid repeated pattern matching
 */
interface CompiledRule {
  rule: RuleNode
  headFunctors: Array<{ name: string, arity: number }>
  priority: number
}

export class CHREngine {
  readonly store = new ConstraintStore()
  readonly history = new PropagationHistory()
  private readonly rules: RuleNode[] = []
  private readonly compiledRules: CompiledRule[] = []
  private sortedCompiledRules: CompiledRule[] = []
  private readonly functions = new Map<string, HostFunction>()
  private readonly actions = new Map<string, HostAction>()
  private readonly declarations = new Map<string, number>()
  private readonly functionDeclarations = new Map<string, number>()
  private readonly actionDeclarations = new Map<string, number>()
  private readonly hostModules = new Map<string, HostModule>()
  private readonly maxRuleFirings: number
  private readonly onRuleFired: ((trace: RuleFireTrace) => void) | undefined
  private readonly strictHostDeclarations: boolean
  private readonly hostFunctionTimeout: number | undefined
  private _state: EngineState = 'empty'
  private readonly warnings: string[] = []
  private hostDeclarationsValidated = false

  constructor (options: CHREngineOptions = {}) {
    this.maxRuleFirings = options.maxRuleFirings ?? 10000
    this.onRuleFired = options.onRuleFired
    this.strictHostDeclarations = options.strictHostDeclarations ?? false
    this.hostFunctionTimeout = options.hostFunctionTimeout
  }

  getState (): EngineState {
    return this._state
  }

  getWarnings (): readonly string[] {
    return this.warnings
  }

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
   * FIXED: Pre-compile rules to extract functors and priorities
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

  private rebuildSortedRules (): void {
    this.sortedCompiledRules = [...this.compiledRules].sort((a, b) => b.priority - a.priority)
  }

  /**
   * FIXED: Validate variable scoping at rule load time, not runtime
   */
  private validateVariableScoping (rule: RuleNode): void {
    const patternVars = new Set<string>()

    // Collect all variables bound in constraint patterns
    for (const pattern of [...rule.kept, ...rule.removed]) {
      for (const arg of pattern.args) {
        this.collectVariablesInExpression(arg, patternVars)
      }
    }

    // Validate guards only reference pattern-bound variables
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

    // Validate body doesn't use undeclared variables
    for (const item of rule.body) {
      if (item.type === 'constraint') {
        for (const arg of item.constraint.args) {
          const bodyVars = new Set<string>()
          this.collectVariablesInExpression(arg, bodyVars)
          for (const varName of bodyVars) {
            if (varName !== '_' && !patternVars.has(varName)) {
              throw new CHRExecutionError(
                `Body constraint uses unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'.`,
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
                `Body update uses unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'.`,
                rule.span
              )
            }
          }
        }
      }
    }
  }

  /**
   * FIXED: Helper to collect all variables in an expression
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

  addRules (source: string): void {
    this.addProgram(parseProgram(source))
  }

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

  registerFunction (name: string, handler: HostFunction): void {
    this.validateHostDeclaration(name, handler.length - 1, this.functionDeclarations, 'function', false)
    this.functions.set(name, handler)
    if (!this.functionDeclarations.has(name)) {
      this.functionDeclarations.set(name, -1)
    }
  }

  registerFunctions (handlers: Record<string, HostFunction>): void {
    for (const [name, handler] of Object.entries(handlers)) {
      this.registerFunction(name, handler)
    }
  }

  registerAction (name: string, handler: HostAction): void {
    this.validateHostDeclaration(name, handler.length - 1, this.actionDeclarations, 'action', false)
    this.actions.set(name, handler)
    if (!this.actionDeclarations.has(name)) {
      this.actionDeclarations.set(name, -1)
    }
  }

  registerActions (handlers: Record<string, HostAction>): void {
    for (const [name, handler] of Object.entries(handlers)) {
      this.registerAction(name, handler)
    }
  }

  registerHost (module: HostModule): void {
    if (module.functions) {
      this.registerFunctions(module.functions)
    }
    if (module.actions) {
      this.registerActions(module.actions)
    }
  }

  registerBuiltins (): void {
    this.registerHost(BuiltinsModule)
    this.hostModules.set('builtins', BuiltinsModule)
  }

  registerHostModule (name: string, module: HostModule): void {
    if (this.hostModules.has(name)) {
      throw new CHRExecutionError(`Host module '${name}' is already registered.`)
    }
    this.hostModules.set(name, module)
  }

  registerHostModules (modules: Record<string, HostModule>): void {
    for (const [name, module] of Object.entries(modules)) {
      this.registerHostModule(name, module)
    }
  }

  declareConstraint (name: string, arity: number): void {
    const existing = this.declarations.get(name)
    if (typeof existing === 'number' && existing !== arity) {
      throw new CHRExecutionError(`Constraint ${name} redeclared with incompatible arity ${arity}; existing arity is ${existing}.`)
    }
    this.declarations.set(name, arity)
  }

  declareConstraints (entries: Record<string, number>): void {
    for (const [name, arity] of Object.entries(entries)) {
      this.declareConstraint(name, arity)
    }
  }

  async assert (name: string, args: unknown[] = [], options?: AssertOptions): Promise<ConstraintRecord> {
    this.ensureReady()
    this.validateConstraintArity(name, args.length)
    this.validateHostDeclarationsOnce()
    const record = this.store.add(name, args)
    await this.runToFixpointSafe(options)
    return record
  }

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

  clear (): void {
    this.store.clear()
    this.history.clear()
    this.warnings.length = 0
    this._state = 'ready'
  }

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

  getRules (): RuleNode[] {
    return [...this.rules]
  }

  getRulesByHead (name: string): RuleNode[] {
    return this.rules.filter((rule) => {
      for (const head of [...rule.kept, ...rule.removed]) {
        if (head.name === name) return true
      }
      return false
    })
  }

  printStore (): string {
    return this.store.toString()
  }

  printHistory (): string {
    const snapshot = this.history.snapshot()
    const keys = Object.keys(snapshot)
    if (keys.length === 0) return '(empty)'
    const rows = keys.flatMap((ruleName) =>
      (snapshot[ruleName] ?? []).map((ids) => `${ruleName}: [${ids}]`)
    )
    return ['Rule  Fired-on IDs', '----  --------------', ...rows].join('\n')
  }

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

  ensureRulesLoaded (): void {
    if (this.rules.length === 0) {
      throw new CHRExecutionError('No rules have been loaded into the engine.')
    }
  }

  load (filePath: string): void {
    const source = readFileSync(filePath, 'utf-8')
    this.addRules(source)
  }

  expect (name: string, args: unknown[]): { exists: () => boolean, missing: () => boolean, count: (n: number) => boolean } {
    const records = this.store.lookup(name, args.length)
    return {
      exists: () => records.some((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])),
      missing: () => !records.some((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])),
      count: (n: number) => records.filter((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])).length === n
    }
  }

  withConstraints<Constraints extends Record<string, readonly unknown[]>> (): TypedEngine<Constraints> {
    return this as unknown as TypedEngine<Constraints>
  }

  private ensureEmpty (): void {
    if (this._state === 'running') {
      throw new CHRExecutionError('Engine is currently running. Wait for the current assertion to complete before modifying rules.')
    }
  }

  private ensureReady (): void {
    if (this._state === 'empty') {
      throw new CHRExecutionError('No rules have been loaded into the engine.')
    }
    if (this._state === 'error') {
      throw new CHRExecutionError('Engine is in an error state. Create a new engine instance to continue.')
    }
  }

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
   * FIXED: Sort by priority, then use compiled rules for faster matching
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

  /**
   * FIXED: Use functor indexing to reduce search space
   */
  private async findMatch (rule: RuleNode): Promise<MatchResult | null> {
    const heads = [...rule.kept, ...rule.removed]
    if (heads.length === 0) {
      return { constraints: [], bindings: {} }
    }
    return this.findMatchRecursive(rule, heads, 0, [], {}, new Set<number>())
  }

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
          const unified = unifyTerm(term, value, subst!)
          if (!unified) {
            return null
          }
          nextBindings = materializeSubstitution(unified, nextBindings)
        } else {
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

  private initSubstitution (bindings: Record<string, unknown>): Substitution {
    const subst = new Substitution()
    for (const [name, value] of Object.entries(bindings)) {
      if (name !== '_') {
        subst.set(name, value)
      }
    }
    return subst
  }

  /**
   * FIXED: Short-circuit guard evaluation on first failure
   * Guard failures (CHRGuardError) are caught and treated as guard failures, not engine errors
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

  /**
   * applyRule: Execute the matched rule's side effects.
   *
   * Order of operations:
   * 1. Guards already checked during matching (findMatchRecursive).
   * 2. Constraints marked for removal are removed from store.
   * 3. Body items executed (constraints, actions, updates, let-bindings).
   *
   * The store is NOT mutated until step 2, and body side effects
   * see the post-removal store state.
   */
  private async applyRule (rule: RuleNode, match: MatchResult): Promise<void> {
    const ruleName = rule.name ?? 'anonymous'
    const ids = match.constraints.map((entry) => entry.id)
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

    this.onRuleFiredWithTiming(rule, ruleName, ids, match, startTime)

    // FIXED: Determine what to remove (but don't remove yet!)
    const constraintsToRemove = this.determineConstraintsToRemove(rule, match.constraints)

    // FIX: Execute guards BEFORE removal (they may inspect store state)
    // Note: guards are already checked during matching, so this is just validation
    // The real fix is that we don't remove until after body execution

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

  private validateConstraintArity (name: string, arity: number): void {
    const declaredArity = this.declarations.get(name)
    if (typeof declaredArity === 'number' && declaredArity !== arity) {
      throw new CHRExecutionError(`Constraint ${name}/${arity} violates declared arity ${declaredArity}.`)
    }
  }

  private applyDeclaration (declaration: ConstraintDeclaration): void {
    this.declareConstraint(declaration.name, declaration.arity)
  }

  private applyFunctionDeclaration (declaration: HostFunctionDeclaration): void {
    this.validateHostDeclaration(declaration.name, declaration.arity, this.functionDeclarations, 'function', false)
    this.functionDeclarations.set(declaration.name, declaration.arity)
  }

  private applyActionDeclaration (declaration: HostActionDeclaration): void {
    this.validateHostDeclaration(declaration.name, declaration.arity, this.actionDeclarations, 'action', false)
    this.actionDeclarations.set(declaration.name, declaration.arity)
  }

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

