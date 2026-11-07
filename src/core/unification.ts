/**
 * Opt-in structural unification for CHR rule head matching.
 *
 * By default, the engine uses strict equality for head variable binding:
 * a variable `X` in the head pattern is bound to the first matching
 * constraint argument, and subsequent matches of `X` must have the exact
 * same value.
 *
 * Structural unification relaxes this by allowing variables to be bound to
 * other variables, creating a substitution map that is resolved lazily.
 * This enables:
 * - Transitive closure rules (`X == Y, Y == Z` → `X == Z`)
 * - Union-find / equivalence-class maintenance
 * - Symmetric and reflexive relation propagation
 *
 * When to use `unify`:
 * - The rule is declared with the `unify` keyword: `unify eq(X, Y) \ eq(Y, Z) ==> eq(X, Z)`.
 * - The engine calls `unifyTerm` for each head argument instead of strict
 *   equality comparison.
 * - The resulting `Substitution` is materialized into the match's `bindings`
 *   map before the rule body executes.
 *
 * When NOT to use `unify`:
 * - Most everyday CHR rules. Strict matching is faster and catches more
 *   programmer errors (e.g. accidentally using the same variable name for
 *   different concepts).
 * - Rules that do not need transitive variable binding.
 *
 * Cycle detection: `occursIn` prevents infinite substitutions like `X = f(X)`
 * by returning `null` when a variable would be bound to a term containing
 * itself (directly or through the substitution chain).
 */

import type { Expression, VariableExpression, LiteralExpression, CallExpression, ArrayExpression } from './ast.js'
import { Substitution } from './substitution.js'

/**
 * Unify a pattern expression with a concrete value under a substitution.
 *
 * This is the entry point for structural unification in the engine. It is
 * called from `engine.ts:matchPattern` when `rule.unify === true`.
 *
 * @param pattern - The AST expression from the rule head or value.
 * @param value - The concrete value from the constraint store or expression.
 * @param subst - The current substitution (accumulates bindings).
 * @returns The updated substitution, or `null` if unification fails.
 */
export function unifyTerm (
  pattern: Expression | unknown,
  value: unknown,
  subst: Substitution
): Substitution | null {
  if (pattern === value) {
    return subst
  }

  if (isVariable(pattern)) {
    return unifyVariable(pattern.name, value, subst)
  }

  if (isVariable(value)) {
    return unifyVariable(value.name, pattern, subst)
  }

  if (isLiteral(pattern)) {
    const rawVal = isLiteral(value) ? value.value : value
    return pattern.value === rawVal ? subst : null
  }

  if (isLiteral(value)) {
    const rawPattern = isLiteral(pattern) ? pattern.value : pattern
    return value.value === rawPattern ? subst : null
  }

  if (isCall(pattern)) {
    if (isCall(value)) {
      if (pattern.callee !== value.callee || pattern.args.length !== value.args.length) {
        return null
      }
      let currentSubst: Substitution | null = subst
      for (let i = 0; i < pattern.args.length; i++) {
        const p = pattern.args[i]
        const v = value.args[i]
        if (!p || v === undefined) return null
        currentSubst = unifyTerm(p, v, currentSubst)
        if (!currentSubst) return null
      }
      return currentSubst
    }
    if (isFunctor(value)) {
      if (pattern.callee !== value.name || pattern.args.length !== value.args.length) {
        return null
      }
      let currentSubst: Substitution | null = subst
      for (let i = 0; i < pattern.args.length; i++) {
        const p = pattern.args[i]
        const v = value.args[i]
        if (!p || v === undefined) return null
        currentSubst = unifyTerm(p, v, currentSubst)
        if (!currentSubst) return null
      }
      return currentSubst
    }
    return null
  }

  if (isFunctor(pattern)) {
    const patName = pattern.name
    const patArgs = pattern.args
    if (isFunctor(value)) {
      if (patName !== value.name || patArgs.length !== value.args.length) return null
      let currentSubst: Substitution | null = subst
      for (let i = 0; i < patArgs.length; i++) {
        const p = patArgs[i]
        const v = value.args[i]
        if (p === undefined || v === undefined) return null
        currentSubst = unifyTerm(toExpression(p), v, currentSubst)
        if (!currentSubst) return null
      }
      return currentSubst
    }
    if (isCall(value)) {
      if (patName !== value.callee || patArgs.length !== value.args.length) return null
      let currentSubst: Substitution | null = subst
      for (let i = 0; i < patArgs.length; i++) {
        const p = patArgs[i]
        const v = value.args[i]
        if (p === undefined || v === undefined) return null
        currentSubst = unifyTerm(toExpression(p), v, currentSubst)
        if (!currentSubst) return null
      }
      return currentSubst
    }
    return null
  }

  if (isArray(pattern)) {
    const valElements = isArray(value) ? value.elements : (Array.isArray(value) ? value : null)
    if (!valElements || pattern.elements.length !== valElements.length) return null
    let currentSubst: Substitution | null = subst
    for (let i = 0; i < pattern.elements.length; i++) {
      const p = pattern.elements[i]
      const v = valElements[i]
      if (!p || v === undefined) return null
      currentSubst = unifyTerm(p, v, currentSubst)
      if (!currentSubst) return null
    }
    return currentSubst
  }

  if (Array.isArray(pattern)) {
    const valElements = isArray(value) ? value.elements : (Array.isArray(value) ? value : null)
    if (!valElements || pattern.length !== valElements.length) return null
    let currentSubst: Substitution | null = subst
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i]
      const v = valElements[i]
      if (p === undefined || v === undefined) return null
      currentSubst = unifyTerm(toExpression(p), v, currentSubst)
      if (!currentSubst) return null
    }
    return currentSubst
  }

  return termsEqual(pattern, value) ? subst : null
}

function isVariable (val: unknown): val is VariableExpression {
  return typeof val === 'object' && val !== null && (val as { type?: string }).type === 'variable'
}

function isLiteral (val: unknown): val is LiteralExpression {
  return typeof val === 'object' && val !== null && (val as { type?: string }).type === 'literal'
}

function isCall (val: unknown): val is CallExpression {
  return typeof val === 'object' && val !== null && (val as { type?: string }).type === 'call'
}

function isFunctor (val: unknown): val is { type: 'functor', name: string, args: unknown[] } {
  return typeof val === 'object' && val !== null && (val as { type?: string }).type === 'functor'
}

function isArray (val: unknown): val is ArrayExpression {
  return typeof val === 'object' && val !== null && (val as { type?: string }).type === 'array'
}

export function toExpression (val: unknown): Expression {
  if (val && typeof val === 'object' && 'type' in (val as object)) {
    return val as Expression
  }
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val === null) {
    return { type: 'literal', value: val }
  }
  return { type: 'literal', value: null }
}

/**
 * Unify a variable name with a value under a substitution.
 *
 * Cases:
 * - `_` (wildcard): always succeeds, no binding added.
 * - Variable already bound: unify the existing binding with the new value.
 * - Value is a variable: check for cycles with `occursIn` before binding.
 * - Otherwise: extend the substitution with the new binding.
 *
 * @returns The updated substitution, or `null` on failure.
 */
function unifyVariable (
  name: string,
  value: unknown,
  subst: Substitution
): Substitution | null {
  if (name === '_') {
    return subst
  }
  if (isVariable(value) && value.name === '_') {
    return subst
  }
  if (isVariable(value) && value.name === name) {
    return subst
  }

  const existing = subst.get(name)

  if (existing !== undefined) {
    if (isVariable(existing)) {
      if (isVariable(value)) {
        let rootA = existing.name
        let depthA = 0
        while (depthA < 100) {
          const nextA = subst.get(rootA)
          if (isVariable(nextA)) {
            rootA = nextA.name
            depthA++
          } else {
            break
          }
        }
        let rootB = value.name
        let depthB = 0
        while (depthB < 100) {
          const nextB = subst.get(rootB)
          if (isVariable(nextB)) {
            rootB = nextB.name
            depthB++
          } else {
            break
          }
        }
        if (rootA === rootB && subst.get(rootA) === undefined) {
          return subst
        }
      }
      return unifyVariable(existing.name, value, subst)
    }
    return unifyTerm(toExpression(existing), value, subst)
  }

  if (typeof value === 'object' && value !== null && (value as { type: string }).type === 'variable') {
    const varName = (value as VariableExpression).name
    if (name === varName) {
      return subst
    }
    if (subst.has(varName)) {
      const resolved = subst.get(varName)
      if (resolved !== undefined && occursIn(name, resolved, subst)) {
        return null
      }
    }
  }

  if (occursIn(name, value, subst)) {
    return null
  }

  const next = subst.clone()
  next.set(name, value)
  return next
}

/**
 * Check whether a variable name occurs inside a value (directly or through
 * the substitution chain).
 *
 * This is the occurs-check, which prevents infinite terms like `X = f(X)`.
 * It is essential for sound unification but adds overhead; in practice the
 * check rarely triggers because CHR rules typically operate over flat
 * constraint arguments rather than nested terms.
 *
 * @returns `true` if the variable occurs in the value (cycle detected).
 */
export function occursIn (name: string, value: unknown, subst: Substitution, visited = new Set<string>()): boolean {
  if (typeof value === 'object' && value !== null) {
    if ((value as { type: string }).type === 'variable') {
      const varName = (value as VariableExpression).name
      if (varName === name) return true
      if (visited.has(varName)) return false
      visited.add(varName)
      const resolved = subst.get(varName)
      if (resolved !== undefined) {
        return occursIn(name, resolved, subst, visited)
      }
    }
    if ((value as { type: string }).type === 'call') {
      const callVal = value as CallExpression
      return callVal.args.some(arg => occursIn(name, arg, subst, visited))
    }
    if ((value as { type: string }).type === 'functor') {
      const funcVal = value as unknown as { args: unknown[] }
      return funcVal.args.some(arg => occursIn(name, arg, subst, visited))
    }
    if ((value as { type: string }).type === 'array') {
      const arrVal = value as ArrayExpression
      return arrVal.elements.some(elem => occursIn(name, elem, subst, visited))
    }
  }
  if (Array.isArray(value)) {
    return value.some(elem => occursIn(name, elem, subst, visited))
  }
  return false
}

/**
 * Check whether two terms are equal.
 *
 * Handles the special case where both terms are variable expressions
 * (compare by name) as well as reference equality for primitives.
 */
function termsEqual (left: unknown, right: unknown): boolean {
  if (left === right) return true

  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    const a = left as Record<string, unknown>
    const b = right as Record<string, unknown>
    if (a.type !== b.type) return false
    if (a.type === 'variable') {
      return (a as unknown as VariableExpression).name === (b as unknown as VariableExpression).name
    }
  }

  return false
}

/**
 * Resolve a variable name through a substitution chain.
 *
 * Follows variable→variable bindings until a non-variable value is found
 * or the maximum depth is exceeded. Used by `materializeSubstitution` to
 * flatten the substitution into the match's `bindings` map.
 *
 * @throws {Error} If the maximum substitution depth (100) is exceeded,
 *   indicating a cycle in the substitution graph.
 */
export function resolveVariable (name: string, subst: Substitution): unknown {
  const MAX_SUBSTITUTION_DEPTH = 100
  let current = name
  let depth = 0

  while (depth < MAX_SUBSTITUTION_DEPTH) {
    const resolved = subst.get(current)
    if (resolved === undefined) {
      return undefined
    }
    if (typeof resolved === 'string' || typeof resolved === 'number' || typeof resolved === 'boolean' || resolved === null) {
      return resolved
    }
    if (typeof resolved === 'object' && resolved !== null) {
      if ((resolved as { type: string }).type === 'variable') {
        current = (resolved as VariableExpression).name
        depth++
        continue
      }
      if ((resolved as { type: string }).type === 'literal') {
        return (resolved as LiteralExpression).value
      }
      if ((resolved as { type: string }).type === 'call') {
        const callVal = resolved as CallExpression
        return {
          ...callVal,
          args: callVal.args.map(arg => resolveTerm(arg, subst, depth + 1))
        }
      }
      if ((resolved as { type: string }).type === 'functor') {
        const funcVal = resolved as unknown as { type: 'functor', name: string, args: unknown[] }
        return {
          ...funcVal,
          args: funcVal.args.map(arg => resolveTerm(arg, subst, depth + 1))
        }
      }
      if ((resolved as { type: string }).type === 'array') {
        const arrVal = resolved as ArrayExpression
        return arrVal.elements.map(elem => resolveTerm(elem, subst, depth + 1))
      }
      if (Array.isArray(resolved)) {
        return resolved.map(elem => resolveTerm(elem, subst, depth + 1))
      }
    }
    return resolved
  }

  throw new Error(`Substitution cycle detected: maximum depth ${MAX_SUBSTITUTION_DEPTH} exceeded for variable ${name}`)
}

function resolveTerm (term: unknown, subst: Substitution, depth: number): unknown {
  if (depth > 100) {
    throw new Error('Substitution cycle detected: maximum depth 100 exceeded')
  }
  if (isVariable(term)) {
    const resolved = resolveVariable(term.name, subst)
    return resolved !== undefined ? resolved : term
  }
  if (isLiteral(term)) {
    return term.value
  }
  if (isCall(term)) {
    return {
      ...term,
      args: term.args.map(a => resolveTerm(a, subst, depth + 1))
    }
  }
  if (isFunctor(term)) {
    return {
      ...term,
      args: term.args.map(a => resolveTerm(a, subst, depth + 1))
    }
  }
  if (isArray(term)) {
    return term.elements.map(e => resolveTerm(e, subst, depth + 1))
  }
  if (Array.isArray(term)) {
    return term.map(e => resolveTerm(e, subst, depth + 1))
  }
  return term
}

/**
 * Convert a `Substitution` into a plain `Record<string, unknown>` bindings map.
 *
 * Each variable in the substitution is resolved through `resolveVariable`
 * and added to the result. The `fallback` map is preserved so that bindings
 * from previous unification steps are not lost.
 *
 * This is called after a successful `unifyTerm` match to produce the final
 * `bindings` object that the rule body and guards will use.
 */
export function materializeSubstitution (
  subst: Substitution,
  fallback: Record<string, unknown> = {}
): Record<string, unknown> {
  const bindings: Record<string, unknown> = { ...fallback }

  for (const [name] of subst.entries()) {
    if (name === '_') continue
    const resolved = resolveVariable(name, subst)
    if (resolved !== undefined) {
      bindings[name] = resolved
    }
  }

  return bindings
}
