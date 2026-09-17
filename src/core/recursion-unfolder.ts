import type { RuleNode, ConstraintPattern, BodyItem, BodyConstraint } from './ast.js'
import type { ConstraintRecord } from './constraint.js'
import { detectLinearRecursion, chainIdentity, cloneExpr } from './unfolder-utils.js'
import { RecursionTracker } from './recursion-tracker.js'

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

    const kept: ConstraintPattern[] = [
      {
        name: '_unfold_trigger',
        args: [{ type: 'literal', value: k } as const]
      },
      ...rule.kept
    ]

    const removed = [...rule.removed]

    const newBody: BodyItem[] = []
    for (let i = 0; i < rule.body.length; i++) {
      const item = rule.body[i]
      if (!item) {
        continue
      }
      if (i === recursiveBodyIndex && item.type === 'constraint') {
        const recursiveConstraint = (item as BodyConstraint).constraint
        for (let j = 0; j < k; j++) {
          newBody.push({
            type: 'constraint',
            constraint: {
              ...recursiveConstraint,
              args: recursiveConstraint.args.map(cloneExpr)
            }
          } as BodyConstraint)
        }
      } else {
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
      guard: [...rule.guard],
      priority: (rule.priority ?? 0) + k
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
      guard: [],
      body: [mipConstraint],
      priority: (rule.priority ?? 0) + 1
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
