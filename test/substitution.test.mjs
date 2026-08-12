import test from 'node:test'
import assert from 'node:assert/strict'
import { Substitution } from '../dist/core/substitution.js'

test('Substitution set and get', () => {
  const subst = new Substitution()
  assert.equal(subst.get('X'), undefined)
  subst.set('X', 42)
  assert.equal(subst.get('X'), 42)
})

test('Substitution has', () => {
  const subst = new Substitution()
  assert.equal(subst.has('Y'), false)
  subst.set('Y', 'foo')
  assert.equal(subst.has('Y'), true)
})

test('Substitution isEmpty', () => {
  const subst = new Substitution()
  assert.equal(subst.isEmpty(), true)
  subst.set('Z', null)
  assert.equal(subst.isEmpty(), false)
})

test('Substitution entries', () => {
  const subst = new Substitution()
  subst.set('A', 1)
  subst.set('B', 2)
  const entries = subst.entries()
  assert.deepEqual(entries, [['A', 1], ['B', 2]])
})

test('Substitution toString', () => {
  const subst = new Substitution()
  subst.set('A', 1)
  subst.set('B', 'text')
  assert.equal(subst.toString(), 'A => 1, B => "text"')
})

test('Substitution clone creates a shallow copy', () => {
  const original = new Substitution()
  original.set('A', 1)
  
  const cloned = original.clone()
  assert.equal(cloned.get('A'), 1)
  
  // Modify clone
  cloned.set('B', 2)
  assert.equal(original.get('B'), undefined)
  assert.equal(cloned.get('B'), 2)
  
  // Modify original
  original.set('C', 3)
  assert.equal(cloned.get('C'), undefined)
  assert.equal(original.get('C'), 3)
})
