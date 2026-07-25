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

  getState (): EngineState { return this._state }
  getWarnings (): readonly string[] { return this.warnings }

  addRule (rule: RuleNode): void {
    this.ensureEmpty()
    this.validateRuleConstraints(rule)
    this.validateVariableScoping(rule)
    const normalizedRule = { ...rule, name: rule.name ?? `rule_${this.rules.length}` }
    this.rules.push(normalizedRule)
    this.compileRule(normalizedRule)
    this.hostDeclarationsValidated = false
    this._state = 'ready'
  }

  private compileRule (rule: RuleNode): void {
    const headFunctors: Array<{ name: string, arity: number }> = []
    for (const pattern of [...rule.kept, ...rule.removed]) {
      headFunctors.push({ name: pattern.name, arity: pattern.args.length })
    }
    const compiled: CompiledRule = { rule, headFunctors, priority: rule.priority ?? 0 }
    this.compiledRules.push(compiled)
    this.rebuildSortedRules()
  }

  private rebuildSortedRules (): void {
    this.sortedCompiledRules = [...this.compiledRules].sort((a, b) => b.priority - a.priority)
  }

  private validateVariableScoping (rule: RuleNode): void {
    const patternVars = new Set<string>()
    for (const pattern of [...rule.kept, ...rule.removed]) {
      for (const arg of pattern.args) this.collectVariablesInExpression(arg, patternVars)
    }
    for (const guard of rule.guard) {
      const guardVars = new Set<string>()
      this.collectVariablesInExpression(guard, guardVars)
      for (const varName of guardVars) {
        if (varName !== '_' && !patternVars.has(varName)) {
          throw new CHRExecutionError(`Guard references unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'. Only variables bound in head constraints can appear in guards.`, rule.span)
        }
      }
    }
    for (const item of rule.body) {
      if (item.type === 'constraint') {
        for (const arg of item.constraint.args) {
          const bodyVars = new Set<string>()
          this.collectVariablesInExpression(arg, bodyVars)
          for (const varName of bodyVars) {
            if (varName !== '_' && !patternVars.has(varName)) {
              throw new CHRExecutionError(`Body constraint uses unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'.`, rule.span)
            }
          }
        }
      } else if (item.type === 'update') {
        for (const arg of [...item.old.args, ...item.constraint.args]) {
          const bodyVars = new Set<string>()
          this.collectVariablesInExpression(arg, bodyVars)
          for (const varName of bodyVars) {
            if (varName !== '_' && !patternVars.has(varName)) {
              throw new CHRExecutionError(`Body update uses unbound variable '${varName}' in rule '${rule.name ?? 'anonymous'}'.`, rule.span)
            }
          }
        }
      }
    }
  }

  private collectVariablesInExpression (expr: Expression, vars: Set<string>): void {
    if (expr.type === 'variable') vars.add(expr.name)
    else if (expr.type === 'unary') this.collectVariablesInExpression(expr.operand, vars)
    else if (expr.type === 'binary') { this.collectVariablesInExpression(expr.left, vars); this.collectVariablesInExpression(expr.right, vars) }
    else if (expr.type === 'call') for (const arg of expr.args) this.collectVariablesInExpression(arg, vars)
    else if (expr.type === 'array') for (const elem of expr.elements) this.collectVariablesInExpression(elem, vars)
  }

  addProgram (program: ProgramNode): void {
    this.ensureEmpty()
    const unusedFunctions = new Set(program.functionDeclarations.map((d) => d.name))
    const unusedActions = new Set(program.actionDeclarations.map((d) => d.name))
    for (const declaration of program.declarations) this.applyDeclaration(declaration)
    for (const declaration of program.functionDeclarations) this.applyFunctionDeclaration(declaration)
    for (const declaration of program.actionDeclarations) this.applyActionDeclaration(declaration)
    for (const imprt of program.hostImports) this.applyHostImport(imprt)
    for (const rule of program.rules) { this.addRule(rule); this.checkMatchingAndShadowing(rule); this.scanRuleUsage(rule, unusedFunctions, unusedActions) }
    for (const name of unusedFunctions) this.warnings.push(`Unused function declaration: f
