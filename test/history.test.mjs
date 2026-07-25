import test from 'node:test'
import assert from 'node:assert/strict'
import { PropagationHistory } from '../dist/index.js'

test('history remembers added rule/id combinations', () => {
  const history = new PropagationHistory()
  history.add('fib_step', [1, 2, 3])

  assert.equal(history.has('fib_step', [1, 2, 3]), true)
})

test('history hashes ids independent of order', () => {
  const history = new PropagationHistory()
  history.add('fib_step', [3, 1, 2])

  assert.equal(history.has('fib_step', [1, 2, 3]), true)
})

test('history distinguishes rule names', () => {
  const history = new PropagationHistory()
  history.add('rule_a', [1])

  assert.equal(history.has('rule_b', [1]), false)
})

test('history snapshot is grouped by rule name', () => {
  const history = new PropagationHistory()
  history.add('rule_a', [2, 1])
  history.add('rule_b', [4])

  assert.deepEqual(history.snapshot(), {
    rule_a: ['1:2'],
    rule_b: ['4']
  })
})

test('history clear removes all entries', () => {
  const history = new PropagationHistory()
  history.add('rule_a', [1])
  history.clear()

  assert.equal(history.has('rule_a', [1]), false)
  assert.deepEqual(history.snapshot(), {})
})

test('history deduplicates repeated adds for same rule and ids', () => {
  const history = new PropagationHistory()
  history.add('rule_a', [1, 2])
  history.add('rule_a', [2, 1])

  assert.deepEqual(history.snapshot(), {
    rule_a: ['1:2']
  })
})
