import test from 'node:test'
import assert from 'node:assert/strict'
import { createConstraint, createFunctor } from '../dist/index.js'

test('createFunctor builds name/arity pairs', () => {
  assert.equal(createFunctor('fib', 2), 'fib/2')
})

test('createFunctor supports zero arity', () => {
  assert.equal(createFunctor('done', 0), 'done/0')
})

test('createConstraint sets id, name, and arity', () => {
  const record = createConstraint(3, 'fib', [1, 1])

  assert.equal(record.id, 3)
  assert.equal(record.name, 'fib')
  assert.equal(record.arity, 2)
})

test('createConstraint copies argument arrays defensively', () => {
  const args = [1, 2]
  const record = createConstraint(1, 'pair', args)
  args.push(3)

  assert.deepEqual(record.args, [1, 2])
})

test('createConstraint preserves metadata when provided', () => {
  const record = createConstraint(7, 'node', ['a'], { source: 'test' })

  assert.deepEqual(record.metadata, { source: 'test' })
})

test('createConstraint omits metadata when not provided', () => {
  const record = createConstraint(8, 'node', ['a'])

  assert.equal(Object.hasOwn(record, 'metadata'), false)
})
