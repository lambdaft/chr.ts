import test from 'node:test'
import assert from 'node:assert/strict'
import { CHRParseError, CHRExecutionError, CHRGuardError, formatSourceSpan } from '../dist/core/errors.js'

test('formatSourceSpan correctly formats valid span', () => {
  const source = 'abc\ndef\nghi'
  const span = { start: { line: 2, column: 2 }, end: { line: 2, column: 3 } }
  const formatted = formatSourceSpan(source, span)
  assert.equal(formatted, '\n  def\n   ^')
})

test('formatSourceSpan handles out-of-bounds line', () => {
  const source = 'abc'
  const span = { start: { line: 5, column: 1 }, end: { line: 5, column: 2 } }
  const formatted = formatSourceSpan(source, span)
  assert.equal(formatted, '')
})

test('CHRParseError instantiates correctly without span', () => {
  const err = new CHRParseError('parse error')
  assert.equal(err.name, 'CHRParseError')
  assert.equal(err.message, 'parse error')
  assert.equal(err.span, undefined)
  assert.equal(err.cause, undefined)
})

test('CHRParseError instantiates with span and source', () => {
  const source = 'abc\n123'
  const span = { start: { line: 2, column: 1 }, end: { line: 2, column: 2 } }
  const err = new CHRParseError('bad syntax', span, undefined, source)
  assert.ok(err.message.includes('bad syntax\n  123\n  ^'))
})

test('CHRExecutionError instantiates correctly without span', () => {
  const err = new CHRExecutionError('exec error')
  assert.equal(err.name, 'CHRExecutionError')
  assert.equal(err.message, 'exec error')
  assert.equal(err.span, undefined)
  assert.equal(err.cause, undefined)
})

test('CHRExecutionError instantiates with span, cause, and source', () => {
  const source = 'line1\nline2'
  const span = { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } }
  const cause = new Error('inner')
  const err = new CHRExecutionError('runtime fault', span, cause, source)
  assert.ok(err.message.includes('runtime fault\n  line2\n  ^'))
  assert.equal(err.cause, cause)
})

test('CHRGuardError instantiates correctly', () => {
  const span = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
  const cause = new Error('inner')
  const err = new CHRGuardError('guard failed', span, cause)
  assert.equal(err.name, 'CHRGuardError')
  assert.equal(err.message, 'guard failed')
  assert.equal(err.span, span)
  assert.equal(err.cause, cause)
})
