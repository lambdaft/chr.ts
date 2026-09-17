import type {
  RuleNode,
  ConstraintPattern,
  Expression,
  BodyItem,
  BodyConstraint
} from './ast.js'

export interface RecursionInfo {
  rule: RuleNode
  recursiveConstraint: ConstraintPattern
  recursiveBodyIndex: number
}

export function detectLinearRecursion (rule: RuleNode): RecursionInfo | null {
  const headPatterns = [...rule.kept, ...rule.removed]
  if (headPatterns.length !== 1) {
    return null
  }

  const head = headPatterns[0]
  if (!head) {
    return null
  }

  let callCount = 0
  let callIndex = -1

  for (let i = 0; i < rule.body.length; i++) {
    const item = rule.body[i]
    if (!item) {
      continue
    }
    if (item.type === 'constraint') {
      const constraint = item as BodyConstraint
      if (constraint.constraint.name === head.name && constraint.constraint.args.length === head.args.length) {
        callCount++
        callIndex = i
      }
    }
  }

  if (callCount === 1) {
    return {
      rule,
      recursiveConstraint: head,
      recursiveBodyIndex: callIndex
    }
  }

  return null
}

export function chainIdentity (matched: import('./constraint.js').ConstraintRecord[]): string {
  return matched.map(r => r.id).sort((a, b) => a - b).join(':')
}

export function specializeRule (rule: RuleNode, k: number, suffix: string = '_unfold'): RuleNode {
  const name = `${rule.name ?? 'anonymous'}${suffix}_${k}`

  const headPatterns = [...rule.kept, ...rule.removed]
  const head = headPatterns[0]
  if (!head) {
    return { ...rule, name }
  }

  const recursiveBodyIndex = rule.body.findIndex(item => {
    if (!item || item.type !== 'constraint') {
      return false
    }
    const c = item.constraint
    return c.name === head.name && c.args.length === head.args.length
  })

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
        })
      }
    } else {
      newBody.push(item)
    }
  }

  return {
    ...rule,
    name,
    kind: 'simplification',
    body: newBody
  }
}

export function generateUnfoldedRuleNames (baseName: string, maxK: number): string[] {
  const names: string[] = []
  let k = 1
  while (k <= maxK) {
    names.push(`${baseName}_unfold_${k}`)
    k *= 2
  }
  return names
}

export function cloneExpr (expr: Expression): Expression {
  if (expr.type === 'variable' || expr.type === 'literal') {
    return { ...expr }
  }
  if (expr.type === 'unary') {
    return { ...expr, operand: cloneExpr(expr.operand) }
  }
  if (expr.type === 'binary') {
    return { ...expr, left: cloneExpr(expr.left), right: cloneExpr(expr.right) }
  }
  if (expr.type === 'call') {
    return { ...expr, args: expr.args.map(cloneExpr) }
  }
  if (expr.type === 'array') {
    return { ...expr, elements: expr.elements.map(cloneExpr) }
  }
  return expr
}
