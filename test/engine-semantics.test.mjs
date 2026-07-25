import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('propagation rule keeps head and adds body', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 1)
  assert.equal(engine.store.lookup('b', 0).length, 1)
})

test('simplification rule removes head and adds body', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a <=> b;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 0)
  assert.equal(engine.store.lookup('b', 0).length, 1)
})

test('simpagation keeps left head and removes right head', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ keep \ remove <=> result;')

  await engine.assertMany([
    { name: 'keep', args: [] },
    { name: 'remove', args: [] }
  ])

  assert.equal(engine.store.lookup('keep', 0).length, 1)
  assert.equal(engine.store.lookup('remove', 0).length, 0)
  assert.equal(engine.store.lookup('result', 0).length, 1)
})

test('multiple propagation rules fire in priority order', async () => {
  const order = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      order.push(trace.ruleName)
    }
  })

  engine.addRule({ name: 'low', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'low_r', args: [] } }], priority: 1 })
  engine.addRule({ name: 'high', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'high_r', args: [] } }], priority: 10 })

  await engine.assert('a', [])
  assert.equal(order[0], 'high')
})

test('propagation rule with guard that fails does not fire', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> gt(X, 10) | b(X);')

  await engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 0)
})

test('propagation rule with guard that passes fires', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> gt(X, 0) | b(X);')

  await engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('simplification removes all matching heads', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a <=> b;')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] },
    { name: 'a', args: [3] }
  ])

  assert.equal(engine.store.lookup('a', 1).length, 0)
  assert.equal(engine.store.lookup('b', 1).length, 3)
})

test('simpagation removes only right-side heads', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a \ b <=> c;')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] },
    { name: 'b', args: [1] },
    { name: 'b', args: [2] }
  ])

  assert.equal(engine.store.lookup('a', 1).length, 2)
  assert.equal(engine.store.lookup('b', 1).length, 0)
  assert.equal(engine.store.lookup('c', 1).length, 2)
})

test('propagation history prevents infinite loop', async () => {
  const engine = new CHREngine({ maxRuleFirings: 100 })
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 1)
  assert.equal(engine.store.lookup('b', 0).length, 1)
})

test('fixpoint reached when no more rules fire', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('b', 0).length, 1)
})

test('assertMany adds all constraints then runs fixpoint', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(X), b(X) ==> c(X);')

  const result = await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'b', args: [1] }
  ])

  assert.equal(result.added, 2)
  assert.equal(engine.store.lookup('c', 1).length, 1)
})

test('simplification with guard passes', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) <=> gt(X, 0) | b(X);')

  await engine.assert('a', [5])
  assert.equal(engine.store.lookup('a', 1).length, 0)
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('simplification with guard fails keeps head', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) <=> gt(X, 10) | b(X);')

  await engine.assert('a', [5])
  assert.equal(engine.store.lookup('a', 1).length, 1)
  assert.equal(engine.store.lookup('b', 1).length, 0)
})

test('simpagation with guard passes', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) \ b(X) <=> gt(X, 0) | c(X);')

  await engine.assertMany([
    { name: 'a', args: [5] },
    { name: 'b', args: [5] }
  ])

  assert.equal(engine.store.lookup('a', 1).length, 1)
  assert.equal(engine.store.lookup('b', 1).length, 0)
  assert.equal(engine.store.lookup('c', 1).length, 1)
})

test('propagation rule with multiple heads fires on pairwise match', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(X), b(X) ==> c(X);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] },
    { name: 'b', args: [2] },
    { name: 'b', args: [3] }
  ])

  const cRecords = engine.store.lookup('c', 1)
  assert.equal(cRecords.length, 1)
  assert.equal(cRecords[0].args[0], 2)
})

test('propagation with three heads matches all combinations', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(X), b(X), c(X) ==> d(X);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'b', args: [1] },
    { name: 'c', args: [1] }
  ])

  assert.equal(engine.store.lookup('d', 1).length, 1)
})

test('sequential assertions each run fixpoint', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  engine.addRules('step2 @ b ==> c;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('b', 0).length, 1)
  assert.equal(engine.store.lookup('c', 0).length, 0)

  await engine.assert('b', [])
  assert.equal(engine.store.lookup('c', 0).length, 1)
})

test('clear resets store but keeps rules', () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 1)

  engine.clear()
  assert.equal(engine.store.lookup('a', 0).length, 0)
  assert.equal(engine.store.lookup('b', 0).length, 0)
  assert.equal(engine.getRules().length, 1)
})

test('maxRuleFirings prevents runaway loop', async () => {
  const engine = new CHREngine({ maxRuleFirings: 5 })
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  await assert.rejects(async () => {
    await engine.assert('a', [])
  }, /Maximum rule firings exceeded/)
})

test('per-assertion maxRuleFirings overrides engine default', async () => {
  const engine = new CHREngine({ maxRuleFirings: 1000 })
  engine.addRules('loop @ a ==> b;')
  engine.addRules('loop2 @ b ==> a;')

  await assert.rejects(async () => {
    await engine.assert('a', [], { maxRuleFirings: 3 })
  }, /Maximum rule firings exceeded/)
})

test('host function in guard that throws is treated as guard failure', async () => {
  const engine = new CHREngine()
  engine.registerFunction('volatile', () => {
    throw new Error('guard error')
  })
  engine.addRules('step @ a ==> volatile() | b;')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('b', 0).length, 0)
})

test('host function in body that throws aborts rule', async () => {
  const engine = new CHREngine()
  engine.registerFunction('boom', () => {
    throw new Error('body error')
  })
  engine.addRules('step @ a ==> true | result(boom());')

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Host function boom threw/)
})

test('host action in body that throws aborts rule', async () => {
  const engine = new CHREngine()
  engine.registerAction('fail', () => {
    throw new Error('action error')
  })
  engine.addRules('step @ a ==> true | !fail();')

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Host action fail threw/)
})

test('rule with no body throws at add time', () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.addRules('bad @ a ==>;')
  }, /Rule body is empty/)
})
