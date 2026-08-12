import test from 'node:test'
import assert from 'node:assert/strict'
import { createEngine } from '../dist/core/loader.js'
import { defineHostModule } from '../dist/core/host.js'

test('createEngine - defaults', () => {
  const engine = createEngine()
  assert.ok(engine)
  assert.equal(engine.maxRuleFirings, 1000) // Default from CHREngine
  assert.equal(engine.getRules().length, 0)
})

test('createEngine - maxRuleFirings override', () => {
  const engine = createEngine({ source: '', maxRuleFirings: 50 })
  assert.equal(engine.maxRuleFirings, 50)
})

test('createEngine - builtins registration', () => {
  const engine = createEngine({ source: '', builtins: true })
  // Should have builtins registered (e.g. gt, eq, add)
  assert.ok(engine.hostModules.length > 0)
})

test('createEngine - custom host module', () => {
  const customHost = defineHostModule({
    functions: { custom_fn: () => true }
  })
  const engine = createEngine({ source: '', host: customHost })
  assert.ok(engine.hostModules.includes(customHost))
})

test('createEngine - with source rules', () => {
  const engine = createEngine({ source: 'a ==> b;' })
  assert.equal(engine.getRules().length, 1)
})

test('createEngine - trims empty source', () => {
  const engine = createEngine({ source: '   \\n  ' })
  assert.equal(engine.getRules().length, 0)
})
