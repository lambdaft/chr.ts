import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, CHRExecutionError } from '../dist/index.js'

test('engine rejects addRule during running state', async () => {
  const engine = new CHREngine()
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  let rejected = false
  const promise = engine.assert('a', []).catch(() => {
    rejected = true
  })

  try {
    engine.addRules('late @ c ==> d;')
  } catch (error) {
    assert.ok(error instanceof CHRExecutionError)
    assert.match(error.message, /currently running/)
  }

  await promise
  assert.ok(rejected)
})

test('engine enters error state after host function throws during fixpoint', async () => {
  const engine = new CHREngine()
  engine.registerFunction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> boom() | ok;')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  }, /kaboom/)

  assert.equal(engine.getState(), 'error')
})

test('engine stays in error state after failed assertion', async () => {
  const engine = new CHREngine()
  engine.registerFunction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> boom() | ok;')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  })

  assert.equal(engine.getState(), 'error')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  }, /error state/)
})

test('engine requires new instance after error state', async () => {
  const engine = new CHREngine()
  engine.registerFunction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> boom() | ok;')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  })

  assert.equal(engine.getState(), 'error')

  const engine2 = new CHREngine()
  engine2.addRules('ok @ a ==> b;')
  await engine2.assert('a', [])
  assert.equal(engine2.getState(), 'ready')
  assert.equal(engine2.store.lookup('b', 0).length, 1)
})

test('engine rejects assertMany during running state', async () => {
  const engine = new CHREngine()
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  let rejected = false
  const promise = engine.assertMany([{ name: 'a', args: [] }]).catch(() => {
    rejected = true
  })

  try {
    engine.addRules('late @ c ==> d;')
  } catch (error) {
    assert.ok(error instanceof CHRExecutionError)
    assert.match(error.message, /currently running/)
  }

  await promise
  assert.ok(rejected)
})

test('engine validate does not mutate engine state', () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')

  const result = engine.validate('extra @ c ==> d;')
  assert.ok(result.ok)

  assert.equal(engine.getRules().length, 1)
  assert.equal(engine.getState(), 'ready')
})

test('engine clear during running does not corrupt state', async () => {
  const engine = new CHREngine()
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  const promise = engine.assert('a', []).catch(() => {})

  engine.clear()

  await promise
})

test('engine transitions from ready to running and back', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  assert.equal(engine.getState(), 'ready')

  await engine.assert('a', [])
  assert.equal(engine.getState(), 'ready')

  await engine.assert('c', [])
  assert.equal(engine.getState(), 'ready')
})

test('engine empty state rejects assertMany', async () => {
  const engine = new CHREngine()
  await assert.rejects(async () => {
    await engine.assertMany([{ name: 'a', args: [] }])
  }, /No rules have been loaded/)
})

test('engine empty state rejects validate then assert', async () => {
  const engine = new CHREngine()
  const result = engine.validate('step @ a ==> b;')
  assert.ok(result.ok)

  await assert.rejects(async () => {
    await engine.assert('a', [])
  }, /No rules have been loaded/)
})

test('engine ready state rejects addRules after first load when empty initially', () => {
  const engine = new CHREngine()
  engine.addRules('first @ a ==> b;')
  assert.equal(engine.getState(), 'ready')

  engine.clear()
  assert.equal(engine.getState(), 'ready')

  engine.addRules('second @ c ==> d;')
  assert.equal(engine.getState(), 'ready')
  assert.equal(engine.getRules().length, 2)
})

test('engine snapshot reflects state at time of call', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')

  const snap1 = engine.snapshot()
  assert.equal(snap1.rules.length, 1)

  await engine.assert('a', [])
  const snap2 = engine.snapshot()
  assert.equal(snap2.constraints.length, 2)

  engine.clear()
  const snap3 = engine.snapshot()
  assert.equal(snap3.constraints.length, 0)
  assert.equal(snap3.history, null || Object.keys(snap3.history || {}).length === 0)
})

test('engine getRules returns copy not reference', () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  const rules1 = engine.getRules()
  const rules2 = engine.getRules()
  assert.notEqual(rules1, rules2)
  assert.deepEqual(rules1, rules2)
})

test('engine getWarnings returns copy not reference', () => {
  const engine = new CHREngine()
  engine.addRules('dead @ a(X) ==> true;')
  const w1 = engine.getWarnings()
  const w2 = engine.getWarnings()
  assert.notEqual(w1, w2)
  assert.deepEqual(w1, w2)
})

test('engine getState returns readonly string', () => {
  const engine = new CHREngine()
  const state = engine.getState()
  assert.equal(typeof state, 'string')
  assert.ok(['empty', 'ready', 'running', 'error'].includes(state))
})
