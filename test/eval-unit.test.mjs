import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateExpression, withTimeout } from '../dist/core/engine/eval.js'
import { CHRExecutionError, CHRGuardError } from '../dist/core/errors.js'
import { CHREngine } from '../dist/core/engine.js'

function createDeps(opts = {}) {
  return {
    functions: new Map(opts.functions || []),
    hostFunctionTimeout: opts.hostFunctionTimeout,
    store: {}, // mock
    history: { add: () => {}, has: () => false, notIn: () => true },
    isGuard: opts.isGuard || false,
    engine: new CHREngine(),
    suggestSimilar: () => '',
    ...opts
  }
}

const dummyRule = { name: 'test_rule', span: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } }

test('evaluateExpression - literal', async () => {
  const result = await evaluateExpression(createDeps(), { type: 'literal', value: 'hello' }, dummyRule, [], {})
  assert.equal(result, 'hello')
})

test('evaluateExpression - array', async () => {
  const result = await evaluateExpression(createDeps(), { type: 'array', elements: [{ type: 'literal', value: 1 }, { type: 'literal', value: 2 }] }, dummyRule, [], {})
  assert.deepEqual(result, [1, 2])
})

test('evaluateExpression - variable bound', async () => {
  const result = await evaluateExpression(createDeps(), { type: 'variable', name: 'X' }, dummyRule, [], { X: 42 })
  assert.equal(result, 42)
})

test('evaluateExpression - variable unbound throws', async () => {
  await assert.rejects(
    evaluateExpression(createDeps(), { type: 'variable', name: 'X' }, dummyRule, [], {}),
    CHRExecutionError
  )
})

test('evaluateExpression - unary operators', async () => {
  const resultNot = await evaluateExpression(createDeps(), { type: 'unary', operator: '!', operand: { type: 'literal', value: false } }, dummyRule, [], {})
  assert.equal(resultNot, true)

  const resultNeg = await evaluateExpression(createDeps(), { type: 'unary', operator: '-', operand: { type: 'literal', value: 42 } }, dummyRule, [], {})
  assert.equal(resultNeg, -42)
})

test('evaluateExpression - unknown unary operator throws', async () => {
  await assert.rejects(
    evaluateExpression(createDeps(), { type: 'unary', operator: '~', operand: { type: 'literal', value: 42 } }, dummyRule, [], {}),
    CHRExecutionError
  )
})

test('evaluateExpression - binary "in" operator', async () => {
  const resultTrue = await evaluateExpression(createDeps(), { type: 'binary', operator: 'in', left: { type: 'literal', value: 2 }, right: { type: 'array', elements: [{ type: 'literal', value: 1 }, { type: 'literal', value: 2 }] } }, dummyRule, [], {})
  assert.equal(resultTrue, true)

  await assert.rejects(
    evaluateExpression(createDeps(), { type: 'binary', operator: 'in', left: { type: 'literal', value: 2 }, right: { type: 'literal', value: 2 } }, dummyRule, [], {}),
    CHRExecutionError,
    /Right operand of "in" must be an array/
  )
})

test('evaluateExpression - unknown host function', async () => {
  await assert.rejects(
    evaluateExpression(createDeps(), { type: 'call', callee: 'missing', args: [] }, dummyRule, [], {}),
    CHRExecutionError,
    /Unknown host function/
  )
})

test('evaluateExpression - host function throws (guard)', async () => {
  const deps = createDeps({
    isGuard: true,
    functions: [['failGuard', () => { throw new Error('nope') }]]
  })
  await assert.rejects(
    evaluateExpression(deps, { type: 'call', callee: 'failGuard', args: [] }, dummyRule, [], {}),
    CHRGuardError
  )
})

test('evaluateExpression - host function throws (body)', async () => {
  const deps = createDeps({
    isGuard: false,
    functions: [['failBody', () => { throw new Error('nope') }]]
  })
  await assert.rejects(
    evaluateExpression(deps, { type: 'call', callee: 'failBody', args: [] }, dummyRule, [], {}),
    CHRExecutionError
  )
})

test('withTimeout - passes through synchronous result', async () => {
  const result = await withTimeout(createDeps({ hostFunctionTimeout: 100 }), 42, 'test', dummyRule)
  assert.equal(result, 42)
})

test('withTimeout - passes through successful promise', async () => {
  const result = await withTimeout(createDeps({ hostFunctionTimeout: 100 }), Promise.resolve(42), 'test', dummyRule)
  assert.equal(result, 42)
})

test('withTimeout - rejects on timeout', async () => {
  const slowPromise = new Promise(resolve => setTimeout(() => resolve(42), 200))
  await assert.rejects(
    withTimeout(createDeps({ hostFunctionTimeout: 50 }), slowPromise, 'slow', dummyRule),
    /Host function slow timed out/
  )
})
