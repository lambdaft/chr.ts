import test from 'node:test'
import assert from 'node:assert/strict'
import { unifyTerm, resolveVariable, materializeSubstitution } from '../dist/core/unification.js'
import { Substitution } from '../dist/core/substitution.js'

test('unifyTerm - literal matches', () => {
  const subst = new Substitution()
  const result = unifyTerm({ type: 'literal', value: 42 }, 42, subst)
  assert.ok(result)
  assert.equal(result.isEmpty(), true)

  const fail = unifyTerm({ type: 'literal', value: 42 }, 43, subst)
  assert.equal(fail, null)
})

test('unifyTerm - wildcard matches anything', () => {
  const subst = new Substitution()
  const result = unifyTerm({ type: 'variable', name: '_' }, 42, subst)
  assert.ok(result)
  assert.equal(result.isEmpty(), true)
})

test('unifyTerm - unsupported pattern type fails', () => {
  const subst = new Substitution()
  const result = unifyTerm({ type: 'call', callee: 'foo', args: [] }, 42, subst)
  assert.equal(result, null)
})

test('unifyTerm - binds new variable', () => {
  const subst = new Substitution()
  const result = unifyTerm({ type: 'variable', name: 'X' }, 42, subst)
  assert.ok(result)
  assert.equal(result.get('X'), 42)
})

test('unifyTerm - matching existing variable', () => {
  const subst = new Substitution()
  subst.set('X', 42)
  const result = unifyTerm({ type: 'variable', name: 'X' }, 42, subst)
  assert.ok(result)
  
  const fail = unifyTerm({ type: 'variable', name: 'X' }, 43, subst)
  assert.equal(fail, null)
})

test('unifyTerm - structural variable-to-variable cycles caught by occursIn', () => {
  const subst = new Substitution()
  // Y is bound to X
  subst.set('Y', { type: 'variable', name: 'X' })
  // Now trying to bind X to Y should trigger occursIn cycle detection
  const result = unifyTerm({ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }, subst)
  assert.equal(result, null)
})

test('resolveVariable - follows substitution chain', () => {
  const subst = new Substitution()
  subst.set('X', { type: 'variable', name: 'Y' })
  subst.set('Y', { type: 'variable', name: 'Z' })
  subst.set('Z', 42)

  const resolved = resolveVariable('X', subst)
  assert.equal(resolved, 42)
})

test('resolveVariable - throws on maximum depth exceeded (cycle)', () => {
  const subst = new Substitution()
  let prev = 'V0'
  for (let i = 1; i <= 105; i++) {
    const next = `V${i}`
    subst.set(prev, { type: 'variable', name: next })
    prev = next
  }

  assert.throws(() => {
    resolveVariable('V0', subst)
  }, /Substitution cycle detected/)
})

test('materializeSubstitution - ignores wildcard and flattens', () => {
  const subst = new Substitution()
  subst.set('_', 999)
  subst.set('X', { type: 'variable', name: 'Y' })
  subst.set('Y', 42)

  const fallback = { Z: 10 }
  const bindings = materializeSubstitution(subst, fallback)

  assert.equal(bindings['_'], undefined)
  assert.equal(bindings['X'], 42)
  assert.equal(bindings['Y'], 42)
  assert.equal(bindings['Z'], 10)
})
