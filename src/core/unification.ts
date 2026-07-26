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

import type { Expression, VariableExpression } from './ast.js'
import { Substitution } from './substitution.js'

/**
 * Unify a pattern expression with a concrete value under a substitution.
 *
 * This is the entry point for structural unification in the engine. It is
 * called from `engine.ts:matchPattern` when `rule.unify === true`.
 *
 * @param pattern - The AST expression from the rule head.
 * @param value - The concrete value from the constraint store.
 * @param subst - The current substitution (accumulates bindings).
 * @returns The updated substitution, or `null` if unification fails.
 */
export function unifyTerm (
  pattern: Expression,
  value: unknown,
  subst: Substitution
): Substitution | null {
  if (pattern.type === 'variable') {
    return unifyVariable(pattern.name, value, subst)
  }

  if (pattern.type === 'literal') {
    return pattern.value === value ? subst : null
  }

  return null
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

  const existing = subst.get(name)

  if (existing !== undefined) {
    return termsEqual(existing, value) ? subst : null
  }

  if (typeof value === 'object' && value !== null && (value as { type: string }).type === 'variable') {
    const varName = (value as VariableExpression).name
    if (subst.has(varName)) {
      const resolved = subst.get(varName)
      if (resolved !== undefined && occursIn(name, resolved, subst)) {
        return null
      }
    }
    if (occursIn(name, value, subst)) {
      return null
    }
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
function occursIn (name: string, value: unknown, subst: Substitution): boolean {
  if (typeof value === 'object' && value !== null) {
    if ((value as { type: string }).type === 'variable') {
      const varName = (value as VariableExpression).name
      if (varName === name) return true
      const resolved = subst.get(varName)
      if (resolved !== undefined) {
        return occursIn(name, resolved, subst)
      }
    }
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
      return current
    }
    if (typeof resolved === 'string' || typeof resolved === 'number' || typeof resolved === 'boolean' || resolved === null) {
      return resolved
    }
    if (typeof resolved === 'object' && resolved !== null && (resolved as { type: string }).type === 'variable') {
      current = (resolved as VariableExpression).name
      depth++
      continue
    }
    return resolved
  }

  throw new Error(`Substitution cycle detected: maximum depth ${MAX_SUBSTITUTION_DEPTH} exceeded for variable ${name}`)
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
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const bindings: Record<string, unknown> = { ...fallback }

  for (const [name] of subst.entries()) {
    if (name === '_') continue
    const resolved = resolveVariable(name, subst)
    bindings[name] = resolved
  }

  return bindings
}
