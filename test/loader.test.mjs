import test from 'node:test'
import assert from 'node:assert/strict'
import { createEngine, defineHostModule } from '../dist/index.js'

test('createEngine with source and host', async () => {
  const events = []
  const engine = createEngine({
    source: 'go @ a(X) ==> b(X);',
    host: defineHostModule({
      functions: {},
      actions: {}
    })
  })

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('createEngine with builtins enabled', async () => {
  const engine = createEngine({
    source: 'go @ a(X) ==> gt(X, 0) | b(X);',
    builtins: true
  })

  await engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('createEngine with builtins enabled and guard failure', async () => {
  const engine = createEngine({
    source: 'go @ a(X) ==> gt(X, 0) | b(X);',
    builtins: true
  })

  await engine.assert('a', [-1])
  assert.equal(engine.store.lookup('b', 1).length, 0)
})

test('createEngine with maxRuleFirings', async () => {
  const engine = createEngine({
    source: 'loop @ a(X) ==> a(add(X, 1));',
    builtins: true,
    maxRuleFirings: 5
  })

  await assert.rejects(async () => {
    await engine.assert('a', [0])
  }, /Maximum rule firings exceeded/)
})

test('createEngine with empty source returns ready engine', () => {
  const engine = createEngine({ source: '' })
  assert.equal(engine.getRules().length, 0)
})
