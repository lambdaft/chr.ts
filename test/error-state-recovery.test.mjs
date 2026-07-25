import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, CHRExecutionError } from '../dist/index.js'

test('engine rejects addRule during running', async () => {
  const engine = new CHREngine()
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  const promise = engine.assert('a', []).catch(() => {})
  try {
    engine.addRule({ name: 'late', kind: 'propagation', kept: [{ name: 'c', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'd', args: [] } }] })
    assert.fail('should have thrown')
  } catch (error) {
    assert.ok(error instanceof CHRExecutionError)
    assert.match(error.message, /currently running/)
  }

  await promise
})

test('engine rejects addRules during running', async () => {
  const engine = new CHREngine()
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  const promise = engine.assert('a', []).catch(() => {})
  try {
    engine.addRules('late @ c ==> d;')
    assert.fail('should have thrown')
  } catch (error) {
    assert.ok(error instanceof CHRExecutionError)
    assert.match(error.message, /currently running/)
  }

  await promise
})

test('engine rejects addProgram during running', async () => {
  const engine = new CHREngine()
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  const promise = engine.assert('a', []).catch(() => {})
  try {
    engine.addProgram({
      declarations: [],
      functionDeclarations: [],
      actionDeclarations: [],
      hostImports: [],
      rules: [{ name: 'late', kind: 'propagation', kept: [{ name: 'c', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'd', args: [] } }] }]
    })
    assert.fail('should have thrown')
  } catch (error) {
    assert.ok(error instanceof CHRExecutionError)
    assert.match(error.message, /currently running/)
  }

  await promise
})

test('engine stays in error state after host action throws in body', async () => {
  const engine = new CHREngine()
  engine.registerAction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> true | !boom();')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  }, /kaboom/)

  assert.equal(engine.getState(), 'error')
})

test('error state rejects all mutating operations', async () => {
  const engine = new CHREngine()
  engine.registerAction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> true | !boom();')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  })

  assert.equal(engine.getState(), 'error')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  }, /error state/)

  await assert.rejects(async () => {
    await engine.assertMany([{ name: 'a', args: [] }])
  }, /error state/)

  assert.throws(() => {
    engine.addRules('step @ b ==> c;')
  }, /error state/)

  assert.throws(() => {
    engine.addRule({ name: 'r', kind: 'propagation', kept: [{ name: 'b', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'c', args: [] } }] })
  }, /error state/)
})

test('error state allows read-only operations', async () => {
  const engine = new CHREngine()
  engine.registerAction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> true | !boom();')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  })

  assert.equal(engine.getState(), 'error')
  assert.equal(engine.getRules().length, 1)
  assert.deepEqual(engine.getWarnings(), [])
})

test('new engine instance recovers from error state', async () => {
  const engine = new CHREngine()
  engine.registerAction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> true | !boom();')

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

test('engine clear does not recover from error state', async () => {
  const engine = new CHREngine()
  engine.registerAction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> true | !boom();')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  })

  engine.clear()
  assert.equal(engine.getState(), 'error')
})

test('error state after action throw preserves cause', async () => {
  const engine = new CHREngine()
  const original = new Error('original')
  engine.registerAction('fail', () => {
    throw original
  })
  engine.addRules('crash @ a() ==> true | !fail();')

  let caught
  try {
    await engine.assert('a', [])
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.equal(caught.cause, original)
  assert.equal(engine.getState(), 'error')
})

test('error state from async host function timeout in guard', async () => {
  const engine = new CHREngine({ hostFunctionTimeout: 50 })
  engine.registerFunction('hang', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return true
  })
  engine.addRules('hang @ a() ==> hang() | ok;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('multiple engines are independent', async () => {
  const engine1 = new CHREngine()
  const engine2 = new CHREngine()

  engine1.addRules('e1 @ a ==> b;')
  engine2.addRules('e2 @ c ==> d;')

  await engine1.assert('a', [])
  await engine2.assert('c', [])

  assert.equal(engine1.store.lookup('b', 0).length, 1)
  assert.equal(engine1.store.lookup('d', 0).length, 0)
  assert.equal(engine2.store.lookup('d', 0).length, 1)
  assert.equal(engine2.store.lookup('b', 0).length, 0)
})

test('guard error does not put engine in error state', async () => {
  const engine = new CHREngine()
  engine.registerFunction('failGuard', () => {
    throw new Error('guard failed')
  })
  engine.addRules('guardFail @ a() ==> failGuard() | ok;')

  await engine.assert('a', [])
  assert.equal(engine.getState(), 'ready')
  assert.equal(engine.store.lookup('ok', 0).length, 0)
  assert.equal(engine.store.lookup('a', 0).length, 1)
})

test('guard error allows other rules to fire', async () => {
  const engine = new CHREngine()
  engine.registerFunction('failGuard', () => {
    throw new Error('guard failed')
  })
  engine.addRules('guardFail @ a() ==> failGuard() | ok;')
  engine.addRules('other @ a() ==> b;')

  await engine.assert('a', [])
  assert.equal(engine.getState(), 'ready')
  assert.equal(engine.store.lookup('b', 0).length, 1)
  assert.equal(engine.store.lookup('a', 0).length, 1)
})

test('guard returning false does not fire rule', async () => {
  const engine = new CHREngine()
  engine.registerFunction('check', () => false)
  engine.addRules('guarded @ a() ==> check() | ok;')

  await engine.assert('a', [])
  assert.equal(engine.getState(), 'ready')
  assert.equal(engine.store.lookup('ok', 0).length, 0)
  assert.equal(engine.store.lookup('a', 0).length, 1)
})
