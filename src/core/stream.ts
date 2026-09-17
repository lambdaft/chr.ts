/**
 * Search stream calculus and operational semantics for chrKanren ($CHR^\vee$).
 * 
 * Implements the first-order stream constructors and stepping metafunctions
 * from arXiv:2607.21204 Section 3.2 & Section 5:
 * 
 * - [] (failure stream)
 * - Γ :: s (solution stream)
 * - s1 ⊕ s2 (disjunction stream, fair interleaving)
 * - s >>= g (binding stream)
 * - Γ ⋈ g (paused binding stream)
 * - ↻ s (propagating stream)
 * - ⊚ Γ (paused propagating stream)
 * - Semantic Unification (==) with fallback to syntactic unification
 */

import { SearchState, type StateConstraint } from './state.js'
import type { RuleNode, Expression, ConstraintPattern, BodyItem } from './ast.js'
import { unifyTerm, materializeSubstitution } from './unification.js'
import { Substitution } from './substitution.js'

// ---------------------------------------------------------------------------
// Relational Goals
// ---------------------------------------------------------------------------

export type RelationalGoal =
  | { type: 'succeed' }
  | { type: 'fail' }
  | { type: 'unify', left: Expression | unknown, right: unknown }
  | { type: 'constraint', name: string, args: unknown[] }
  | { type: 'conj', goals: RelationalGoal[] }
  | { type: 'disj', branches: RelationalGoal[] }
  | { type: 'fresh', vars: string[], goal: RelationalGoal }
  | { type: 'custom', fn: (state: SearchState) => SearchStream }

// ---------------------------------------------------------------------------
// Search Streams
// ---------------------------------------------------------------------------

export type SearchStream =
  | { type: 'empty' }
  | { type: 'solution', head: SearchState, tail: SearchStream }
  | { type: 'disjunction', left: SearchStream, right: SearchStream }
  | { type: 'bind', stream: SearchStream, goal: RelationalGoal }
  | { type: 'paused_bind', state: SearchState, goal: RelationalGoal }
  | { type: 'propagating', stream: SearchStream }
  | { type: 'paused_propagate', state: SearchState }

export const emptyStream: SearchStream = { type: 'empty' }

export function solutionStream (head: SearchState, tail: SearchStream = emptyStream): SearchStream {
  return { type: 'solution', head, tail }
}

export function disjunctionStream (left: SearchStream, right: SearchStream): SearchStream {
  if (left.type === 'empty') return right
  if (right.type === 'empty') return left
  return { type: 'disjunction', left, right }
}

export function bindStream (stream: SearchStream, goal: RelationalGoal): SearchStream {
  if (stream.type === 'empty') return emptyStream
  return { type: 'bind', stream, goal }
}

export function pausedBindStream (state: SearchState, goal: RelationalGoal): SearchStream {
  return { type: 'paused_bind', state, goal }
}

export function propagatingStream (stream: SearchStream): SearchStream {
  if (stream.type === 'empty') return emptyStream
  return { type: 'propagating', stream }
}

export function pausedPropagateStream (state: SearchState): SearchStream {
  return { type: 'paused_propagate', state }
}

// ---------------------------------------------------------------------------
// Rule Matching & CHR Propagation
// ---------------------------------------------------------------------------

export interface RuleMatch {
  rule: RuleNode
  keptConstraints: StateConstraint[]
  removedConstraints: StateConstraint[]
  substitution: Substitution
  bodyGoals: RelationalGoal[]
}

function renameExpr (expr: Expression, id: number): Expression {
  switch (expr.type) {
    case 'variable':
      return { type: 'variable', name: `${expr.name}_${id}` }
    case 'literal':
      return expr
    case 'binary':
      return {
        type: 'binary',
        operator: expr.operator,
        left: renameExpr(expr.left, id),
        right: renameExpr(expr.right, id)
      }
    case 'unary':
      return {
        type: 'unary',
        operator: expr.operator,
        operand: renameExpr(expr.operand, id)
      }
    case 'call':
      return {
        type: 'call',
        callee: expr.callee,
        args: expr.args.map(a => renameExpr(a, id))
      }
    case 'array':
      return {
        type: 'array',
        elements: expr.elements.map(e => renameExpr(e, id))
      }
    default:
      return expr
  }
}

function renamePattern (p: ConstraintPattern, id: number): ConstraintPattern {
  return {
    ...p,
    args: p.args.map(a => renameExpr(a, id))
  }
}

function renameBodyItem (item: BodyItem, id: number): BodyItem {
  if (item.type === 'constraint') {
    return {
      ...item,
      constraint: {
        ...item.constraint,
        args: item.constraint.args.map(a => renameExpr(a, id))
      }
    }
  } else if (item.type === 'disjunction') {
    return {
      ...item,
      branches: item.branches.map(branch => branch.map(b => renameBodyItem(b, id)))
    }
  }
  return item
}

let ruleInstanceCounter = 1

function renameRule (rule: RuleNode, id: number): RuleNode {
  return {
    ...rule,
    kept: rule.kept.map(p => renamePattern(p, id)),
    removed: rule.removed.map(p => renamePattern(p, id)),
    guard: rule.guard.map(g => renameExpr(g, id)),
    body: rule.body.map(b => renameBodyItem(b, id))
  }
}

/**
 * Find the first firing rule and matched constraints for the current state.
 */
export function findRuleMatch (state: SearchState, rules: readonly RuleNode[]): RuleMatch | null {
  for (const rule of rules) {
    const renamed = renameRule(rule, ruleInstanceCounter++)
    const match = matchRule(state, renamed)
    if (match) {
      return match
    }
  }
  return null
}

function matchRule (state: SearchState, rule: RuleNode): RuleMatch | null {
  const heads = [...rule.kept, ...rule.removed]
  if (heads.length === 0) return null

  const keptCount = rule.kept.length
  const candidateLists: StateConstraint[][] = heads.map(h => state.lookup(h.name, h.args.length))

  // Find valid combinations
  const combinations = findCombinations(candidateLists)
  for (const combo of combinations) {
    // Distinct constraints check for removed heads
    const usedIds = new Set<number>()
    let distinct = true
    for (const c of combo) {
      if (usedIds.has(c.id)) {
        distinct = false
        break
      }
      usedIds.add(c.id)
    }
    if (!distinct) continue

    const allIds = combo.map(c => c.id)
    const ruleName = rule.name ?? 'anonymous'
    if (rule.kind === 'propagation' && state.hasFired(ruleName, allIds)) {
      continue
    }

    // Attempt unification across heads
    let subst = state.substitution.clone()
    let matches = true

    for (let i = 0; i < heads.length; i++) {
      const pattern = heads[i]
      const actual = combo[i]
      if (!pattern || !actual) {
        matches = false
        break
      }

      for (let a = 0; a < pattern.args.length; a++) {
        const pArg = pattern.args[a]
        const aArg = actual.args[a]
        if (!pArg) {
          matches = false
          break
        }

        const nextSubst = unifyTerm(pArg, aArg, subst)
        if (!nextSubst) {
          matches = false
          break
        }
        subst = nextSubst
      }
      if (!matches) break
    }

    if (!matches) continue

    // Convert AST body items into RelationalGoals
    const bodyGoals = ruleBodyToGoals(rule, subst)

    const keptConstraints = combo.slice(0, keptCount)
    const removedConstraints = combo.slice(keptCount)

    return {
      rule,
      keptConstraints,
      removedConstraints,
      substitution: subst,
      bodyGoals
    }
  }

  return null
}

function findCombinations (lists: StateConstraint[][]): StateConstraint[][] {
  if (lists.length === 0) return [[]]
  const [first, ...rest] = lists
  if (!first || first.length === 0) return []
  const restCombos = findCombinations(rest)
  const result: StateConstraint[][] = []
  for (const item of first) {
    for (const r of restCombos) {
      result.push([item, ...r])
    }
  }
  return result
}

function ruleBodyToGoals (rule: RuleNode, subst: Substitution): RelationalGoal[] {
  const goals: RelationalGoal[] = []

  for (const item of rule.body) {
    if (item.type === 'constraint') {
      const evaluatedArgs = item.constraint.args.map(arg => evaluateExpr(arg, subst))
      goals.push({
        type: 'constraint',
        name: item.constraint.name,
        args: evaluatedArgs
      })
    } else if (item.type === 'disjunction') {
      // Disjunction branch in rule body
      const branchGoals: RelationalGoal[] = item.branches.map(branch => {
        const subGoals: RelationalGoal[] = branch.map(bItem => {
          if (bItem.type === 'constraint') {
            const evaluatedArgs = bItem.constraint.args.map(a => evaluateExpr(a, subst))
            return {
              type: 'constraint' as const,
              name: bItem.constraint.name,
              args: evaluatedArgs
            }
          }
          return { type: 'succeed' as const }
        })
        return subGoals.length === 1 ? (subGoals[0] ?? { type: 'succeed' }) : { type: 'conj', goals: subGoals }
      })
      goals.push({ type: 'disj', branches: branchGoals })
    }
  }

  return goals
}

function evaluateExpr (expr: Expression, subst: Substitution): unknown {
  if (expr.type === 'literal') return expr.value
  if (expr.type === 'variable') {
    const val = subst.get(expr.name)
    return val !== undefined ? val : expr
  }
  return expr
}

// ---------------------------------------------------------------------------
// Stream Stepping & Trampoline
// ---------------------------------------------------------------------------

/**
 * Advance a search stream by one quantum (step).
 * Fairly interleaves branches and drives constraint propagation to fixpoint.
 */
export function stepStream (stream: SearchStream, rules: readonly RuleNode[]): SearchStream {
  switch (stream.type) {
    case 'empty':
      return emptyStream

    case 'solution':
      // Mature solution: step tail
      return solutionStream(stream.head, stepStream(stream.tail, rules))

    case 'disjunction': {
      // Fair interleaving (mplus / ⊕)
      if (stream.left.type === 'solution') {
        return solutionStream(stream.left.head, disjunctionStream(stream.right, stream.left.tail))
      }
      const leftStepped = stepStream(stream.left, rules)
      if (leftStepped.type === 'solution') {
        return solutionStream(leftStepped.head, disjunctionStream(stream.right, leftStepped.tail))
      }
      if (leftStepped.type === 'empty') {
        return stepStream(stream.right, rules)
      }
      return disjunctionStream(stream.right, leftStepped)
    }

    case 'bind': {
      // Monadic bind (>>=)
      if (stream.stream.type === 'solution') {
        const bound = pausedBindStream(stream.stream.head, stream.goal)
        return disjunctionStream(bound, bindStream(stream.stream.tail, stream.goal))
      }
      const s = stepStream(stream.stream, rules)
      if (s.type === 'empty') return emptyStream
      if (s.type === 'solution') {
        const bound = pausedBindStream(s.head, stream.goal)
        return disjunctionStream(bound, bindStream(s.tail, stream.goal))
      }
      return bindStream(s, stream.goal)
    }

    case 'paused_bind': {
      // Γ ⋈ g
      return startGoal(stream.goal, stream.state, rules)
    }

    case 'propagating': {
      // ↻ s
      if (stream.stream.type === 'solution') {
        const propagated = pausedPropagateStream(stream.stream.head)
        return disjunctionStream(propagated, propagatingStream(stream.stream.tail))
      }
      const s = stepStream(stream.stream, rules)
      if (s.type === 'empty') return emptyStream
      if (s.type === 'solution') {
        const propagated = pausedPropagateStream(s.head)
        return disjunctionStream(propagated, propagatingStream(s.tail))
      }
      return propagatingStream(s)
    }

    case 'paused_propagate': {
      // ⊚ Γ
      return propagateState(stream.state, rules)
    }
  }
}

/**
 * Propagate a state against rules up to a single rule firing step.
 */
export function propagateState (state: SearchState, rules: readonly RuleNode[]): SearchStream {
  const match = findRuleMatch(state, rules)
  if (match) {
    // Apply rule match
    let nextState = state.with({ substitution: match.substitution })
    if (match.removedConstraints.length > 0) {
      nextState = nextState.removeConstraints(match.removedConstraints.map(c => c.id))
    }
    if (match.rule.kind === 'propagation') {
      const allIds = [...match.keptConstraints, ...match.removedConstraints].map(c => c.id)
      const ruleName = match.rule.name ?? 'anonymous'
      nextState = nextState.recordHistory(ruleName, allIds)
    }

    // Execute body goals
    if (match.bodyGoals.length === 0) {
      return pausedPropagateStream(nextState)
    }

    const goal: RelationalGoal = match.bodyGoals.length === 1
      ? (match.bodyGoals[0] ?? { type: 'succeed' })
      : { type: 'conj', goals: match.bodyGoals }

    return propagatingStream(startGoal(goal, nextState, rules))
  }

  // Fallback: If no user rule matched, check if there is an unreduced '==' constraint in the store
  const eqIndex = state.store.findIndex(c => c.name === '==' && c.arity === 2)
  if (eqIndex >= 0) {
    const eqConstraint = state.store[eqIndex]
    if (eqConstraint) {
      const left = eqConstraint.args[0]
      const right = eqConstraint.args[1]
      const leftExpr = toExpression(left)
      const nextSubst = unifyTerm(leftExpr, right, state.substitution)
      if (!nextSubst) {
        return emptyStream // Finite failure
      }
      const nextState = state.removeConstraints([eqConstraint.id]).with({ substitution: nextSubst })
      return pausedPropagateStream(nextState)
    }
  }

  // Fixpoint reached
  return solutionStream(state, emptyStream)
}

function toExpression (val: unknown): Expression {
  if (val && typeof val === 'object' && 'type' in (val as object)) {
    return val as Expression
  }
  if (typeof val === 'string' && /^[A-Z_][A-Za-z0-9_]*$/.test(val)) {
    return { type: 'variable', name: val }
  }
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val === null) {
    return { type: 'literal', value: val }
  }
  return { type: 'literal', value: null }
}

/**
 * Initialize a goal execution from a state.
 */
export function startGoal (goal: RelationalGoal, state: SearchState, rules: readonly RuleNode[]): SearchStream {
  switch (goal.type) {
    case 'succeed':
      return solutionStream(state, emptyStream)

    case 'fail':
      return emptyStream

    case 'unify': {
      const leftExpr = toExpression(goal.left)
      const nextSubst = unifyTerm(leftExpr, goal.right, state.substitution)
      if (!nextSubst) return emptyStream
      return solutionStream(state.with({ substitution: nextSubst }), emptyStream)
    }

    case 'constraint': {
      const { state: nextState } = state.addConstraint(goal.name, goal.args)
      return pausedPropagateStream(nextState)
    }

    case 'conj': {
      if (goal.goals.length === 0) return solutionStream(state, emptyStream)
      const [first, ...rest] = goal.goals
      if (!first) return solutionStream(state, emptyStream)
      const restGoal: RelationalGoal = rest.length === 1 ? (rest[0] ?? { type: 'succeed' }) : { type: 'conj', goals: rest }
      return bindStream(startGoal(first, state, rules), restGoal)
    }

    case 'disj': {
      if (goal.branches.length === 0) return emptyStream
      let combined: SearchStream = emptyStream
      for (let i = goal.branches.length - 1; i >= 0; i--) {
        const branch = goal.branches[i]
        if (branch) {
          combined = disjunctionStream(startGoal(branch, state, rules), combined)
        }
      }
      return combined
    }

    case 'fresh': {
      return startGoal(goal.goal, state, rules)
    }

    case 'custom': {
      return goal.fn(state)
    }
  }
}

/**
 * Collect up to n solutions from a stream.
 */
export function takeSolutions (
  initialStream: SearchStream,
  rules: readonly RuleNode[],
  maxSolutions: number | null = null,
  maxSteps = 50000
): SearchState[] {
  const solutions: SearchState[] = []
  let current = initialStream
  let steps = 0

  while (current.type !== 'empty' && steps < maxSteps) {
    if (maxSolutions !== null && solutions.length >= maxSolutions) {
      break
    }

    if (current.type === 'solution') {
      solutions.push(current.head)
      current = current.tail
    } else {
      current = stepStream(current, rules)
      steps++
    }
  }

  return solutions
}

/**
 * Materialize solutions into variable mappings.
 */
export function formatSolution (state: SearchState, vars: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const materialized = materializeSubstitution(state.substitution, {})
  for (const v of vars) {
    let val = materialized[v] ?? state.substitution.get(v)
    if (val && typeof val === 'object' && (val as { type?: string }).type === 'literal') {
      val = (val as { value: unknown }).value
    }
    result[v] = val
  }
  return result
}
