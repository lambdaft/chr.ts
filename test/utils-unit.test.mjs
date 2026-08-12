import test from 'node:test'
import assert from 'node:assert/strict'
import { numeric, compare, evaluateBinary } from '../dist/core/utils.js'
import { CHRExecutionError } from '../dist/core/errors.js'

test('numeric - accepts numbers', () => {
  assert.equal(numeric(42), 42)
  assert.equal(numeric(-3.14), -3.14)
  assert.equal(numeric(0), 0)
})

test('numeric - rejects non-numbers', () => {
  assert.throws(() => numeric('42'), CHRExecutionError, /requires number operands/)
  assert.throws(() => numeric(null), CHRExecutionError)
  assert.throws(() => numeric(undefined), CHRExecutionError)
  assert.throws(() => numeric({}), CHRExecutionError)
})

test('compare - delegates to op after coercion', () => {
  assert.equal(compare(1, 2, (a, b) => a < b), true)
  assert.equal(compare(2, 1, (a, b) => a < b), false)
})

test('compare - throws on non-numeric', () => {
  assert.throws(() => compare(1, '2', (a, b) => a < b), CHRExecutionError)
})

test('evaluateBinary - logical operators', () => {
  assert.equal(evaluateBinary('||', true, false), true)
  assert.equal(evaluateBinary('&&', true, false), false)
  // truthiness coercion
  assert.equal(evaluateBinary('||', 0, 1), true) // wait, Boolean(0) is false, Boolean(1) is true. Result is boolean true.
})

test('evaluateBinary - equality operators', () => {
  assert.equal(evaluateBinary('===', 42, 42), true)
  assert.equal(evaluateBinary('===', 42, '42'), false)
  assert.equal(evaluateBinary('!==', 42, '42'), true)
})

test('evaluateBinary - comparison operators', () => {
  assert.equal(evaluateBinary('<', 1, 2), true)
  assert.equal(evaluateBinary('<=', 2, 2), true)
  assert.equal(evaluateBinary('>', 3, 2), true)
  assert.equal(evaluateBinary('>=', 2, 2), true)
})

test('evaluateBinary - comparison throws on non-numbers', () => {
  assert.throws(() => evaluateBinary('<', '1', 2), CHRExecutionError)
})

test('evaluateBinary - arithmetic operators', () => {
  assert.equal(evaluateBinary('+', 1, 2), 3)
  assert.equal(evaluateBinary('-', 5, 2), 3)
  assert.equal(evaluateBinary('*', 2, 3), 6)
  assert.equal(evaluateBinary('/', 6, 2), 3)
})

test('evaluateBinary - arithmetic throws on non-numbers', () => {
  assert.throws(() => evaluateBinary('+', '1', 2), CHRExecutionError)
})

test('evaluateBinary - in operator', () => {
  assert.equal(evaluateBinary('in', 2, [1, 2, 3]), true)
  assert.equal(evaluateBinary('in', 4, [1, 2, 3]), false)
})

test('evaluateBinary - in operator throws if right is not array', () => {
  assert.throws(() => evaluateBinary('in', 2, '1,2,3'), CHRExecutionError, /must be an array/)
})

test('evaluateBinary - unsupported operator', () => {
  assert.throws(() => evaluateBinary('^', 1, 2), CHRExecutionError, /Unsupported binary operator/)
})
