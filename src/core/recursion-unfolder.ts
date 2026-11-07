import type { RuleNode, ConstraintPattern, BodyItem, BodyConstraint, Expression } from './ast.js'
import type { ConstraintRecord } from './constraint.js'
import { detectLinearRecursion, chainIdentity, cloneExpr } from './unfolder-utils.js'
import { RecursionTracker } from './recursion-tracker.js'

function substituteVarInExpr (expr: Expression, varName: string, replacement: Expression): Expression {
  if (expr.type === 'variable') {
    return expr.name === varName ? cloneExpr(replacement) : cloneExpr(expr)
  }
  if (expr.type === 'literal') {
    return cloneExpr(expr)
  }
  if (expr.type === 'unary') {
    return {
      ...expr,
      operand: substituteVarInExpr(expr.operand, varName, replacement)
    }
  }
  if (expr.type === 'binary') {
    return {
      ...expr,
      left: substituteVarInExpr(expr.left, varName, replacement),
      right: substituteVarInExpr(expr.right, varName, replacement)
    }
  }
  if (expr.type === 'call') {
    return {
      ...expr,
      args: expr.args.map(a => substituteVarInExpr(a, varName, replacement))
    }
  }
  if (expr.type === 'array') {
    return {
      ...expr,
      elements: expr.elements.map(e => substituteVarInExpr(e, varName, replacement))
    }
  }
  return cloneExpr(expr)
}

export interface UnfolderOptions {
  enabled?: boolean
  maxUnfoldings?: number
  minRecursiveDepth?: number
}

const DEFAULT_OPTIONS: Required<UnfolderOptions> = {
  enabled: false,
  maxUnfoldings: 8,
  minRecursiveDepth: 3
}

export interface UnfoldedRuleSet {
  originalRule: RuleNode
  unfoldedRules: RuleNode[]
  dispatcherRule: RuleNode
  entryRule?: RuleNode
}

export class RecursionUnfolder {
  private readonly options: Required<UnfolderOptions>
  private readonly tracker = new RecursionTracker()
  private unfoldedRuleSets: UnfoldedRuleSet[] = []
  private ruleIndex = new Map<string, UnfoldedRuleSet>()
  private unfolderRulesInserted = false

  constructor (options: UnfolderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  get enabled (): boolean {
    return this.options.enabled
  }

  get maxUnfoldings (): number {
    return this.options.maxUnfoldings
  }

  reset (): void {
    this.tracker.reset()
    this.unfoldedRuleSets = []
    this.ruleIndex.clear()
    this.unfolderRulesInserted = false
  }

  analyze (rules: RuleNode[]): Map<string, UnfoldedRuleSet> {
    const index = new Map<string, UnfoldedRuleSet>()

    for (const rule of rules) {
      const info = detectLinearRecursion(rule)
      if (!info) {
        continue
      }

      const headName = info.recursiveConstraint.name
      if (this.ruleIndex.has(headName)) {
        continue
      }

      const baseRule = this.findBaseRule(rules, headName, info.recursiveConstraint.args.length)
      const unfoldedRules = this.buildUnfoldedRules(rule, baseRule)
      const entryRule = this.buildEntryRule(rule)

      const ruleSet: UnfoldedRuleSet = {
        originalRule: rule,
        unfoldedRules,
        dispatcherRule: rule,
        entryRule
      }

      index.set(headName, ruleSet)
      this.unfoldedRuleSets.push(ruleSet)
    }

    this.ruleIndex = index
    return index
  }

  getRuleSet (headName: string): UnfoldedRuleSet | undefined {
    return this.ruleIndex.get(headName)
  }

  getUnfolderRules (): RuleNode[] {
    if (this.unfoldedRuleSets.length === 0) {
      return []
    }

    const rules: RuleNode[] = []
    for (const set of this.unfoldedRuleSets) {
      if (set.entryRule) {
        rules.push(set.entryRule)
      }
      for (const unfolded of set.unfoldedRules) {
        rules.push(unfolded)
      }
    }

    if (!this.unfolderRulesInserted) {
      this.unfolderRulesInserted = true
    }

    return rules
  }

  onTrace (trace: { ruleName: string | undefined, matchedConstraintIds: number[] }): void {
    if (!this.options.enabled) {
      return
    }

    const ruleName = trace.ruleName
    if (!ruleName || !this.isRecursiveRuleName(ruleName)) {
      return
    }

    const identity = chainIdentity(trace.matchedConstraintIds.map(id => ({ id } as ConstraintRecord)))

    this.tracker.enter(identity)
  }

  private isRecursiveRuleName (name: string): boolean {
    for (const ruleSet of this.unfoldedRuleSets) {
      if (ruleSet.originalRule.name === name) {
        return true
      }
      for (const rule of ruleSet.unfoldedRules) {
        if (rule.name === name) {
          return true
        }
      }
    }
    return false
  }

  private buildUnfoldedRules (rule: RuleNode, _baseRule: RuleNode | undefined): RuleNode[] {
    const rules: RuleNode[] = []
    const maxK = this.options.maxUnfoldings
    let k = 1

    while (k <= maxK) {
      const unfolded = this.buildDispatchRule(rule, k)
      rules.push(unfolded)
      k *= 2
    }

    return rules
  }

  private buildDispatchRule (rule: RuleNode, k: number): RuleNode {
    const name = `${rule.name ?? 'anonymous'}_unfold_${k}`
    const headPatterns = [...rule.kept, ...rule.removed]
    const head = headPatterns[0]
    if (!head) {
      return { ...rule, name, kind: 'simplification' }
    }

    const recursiveBodyIndex = rule.body.findIndex(item => {
      if (!item || item.type !== 'constraint') {
        return false
      }
      const c = item.constraint
      return c.name === head.name && c.args.length === head.args.length
    })

    const kept: ConstraintPattern[] = []

    const removed: ConstraintPattern[] = [
      {
        name: '_unfold_trigger',
        args: [{ type: 'literal', value: k } as const]
      },
      ...rule.kept,
      ...rule.removed
    ]

    const headVarName = head.args[0]?.type === 'variable' ? head.args[0].name : undefined
    const recursiveConstraintItem = recursiveBodyIndex >= 0 ? (rule.body[recursiveBodyIndex] as BodyConstraint | undefined) : undefined
    const stepExpr = recursiveConstraintItem?.constraint.args[0]

    const unfoldedGuards: Expression[] = []
    const newBody: BodyItem[] = []

    if (headVarName && stepExpr && recursiveConstraintItem) {
      let currentVarExpr: Expression = { type: 'variable', name: headVarName }
      for (let step = 0; step < k; step++) {
        for (const g of rule.guard) {
          unfoldedGuards.push(substituteVarInExpr(g, headVarName, currentVarExpr))
        }
        for (let i = 0; i < rule.body.length; i++) {
          const item = rule.body[i]
          if (!item || i === recursiveBodyIndex) continue
          newBody.push(item)
        }
        currentVarExpr = substituteVarInExpr(stepExpr, headVarName, currentVarExpr)
      }
      newBody.push({
        type: 'constraint',
        constraint: {
          ...recursiveConstraintItem.constraint,
          args: [
            currentVarExpr,
            ...recursiveConstraintItem.constraint.args.slice(1).map(cloneExpr)
          ]
        }
      } as BodyConstraint)
    } else {
      unfoldedGuards.push(...rule.guard.map(cloneExpr))
      for (let i = 0; i < rule.body.length; i++) {
        const item = rule.body[i]
        if (!item) continue
        newBody.push(item)
      }
    }

    return {
      ...rule,
      name,
      kind: 'simplification',
      kept,
      removed,
      body: newBody,
      guard: unfoldedGuards,
      priority: (rule.priority ?? 0) + 100 + k
    }
  }

  private buildEntryRule (rule: RuleNode): RuleNode {
    const headPatterns = [...rule.kept, ...rule.removed]
    const head = headPatterns[0]
    if (!head) {
      return { ...rule, name: `${rule.name ?? 'anonymous'}_entry`, kind: 'propagation' }
    }

    const argExprs = head.args.map(cloneExpr)
    const mipConstraint: BodyConstraint = {
      type: 'constraint',
      constraint: {
        name: 'mip',
        args: [
          ...argExprs,
          { type: 'literal', value: 1 } as const
        ]
      }
    }

    return {
      name: `${rule.name ?? 'anonymous'}_entry`,
      kind: 'propagation',
      kept: [{
        name: head.name,
        args: argExprs
      }],
      removed: [],
      guard: rule.guard.map(cloneExpr),
      body: [mipConstraint],
      priority: (rule.priority ?? 0) - 10
    }
  }

  private findBaseRule (rules: RuleNode[], headName: string, arity: number): RuleNode | undefined {
    for (const rule of rules) {
      if (rule.kind !== 'simplification' && rule.kind !== 'simpagation') {
        continue
      }

      const head = rule.kept[0] ?? rule.removed[0]
      if (!head || head.name !== headName || head.args.length !== arity) {
        continue
      }

      let hasRecursiveCall = false
      for (const item of rule.body) {
        if (item.type === 'constraint' && item.constraint.name === headName && item.constraint.args.length === arity) {
          hasRecursiveCall = true
          break
        }
      }

      if (!hasRecursiveCall) {
        return rule
      }
    }

    return undefined
  }
}
