import type { Expression, VariableExpression } from './ast.js'
import { Substitution } from './substitution.js'

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
