import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, defineHostModule } from '../dist/index.js'

test('assertMany returns added count', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')

  const result = await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] },
    { name: 'a', args: [3] }
  ])

  assert.equal(result.added, 3)
})

test('assertMany with empty array does nothing', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')

  const result = await engine.assertMany([])
  assert.equal(result.added, 0)
  assert.equal(engine.store.lookup('b', 0).length, 0)
})

test('assertMany runs fixpoint once after all assertions', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(X), b(X) ==> c(X);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] },
    { name: 'b', args: [1] },
    { name: 'b', args: [2] }
  ])

  assert.equal(engine.store.lookup('c', 1).length, 2)
})

test('assertMany with mixed constraints', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  engine.addRules('step2 @ b ==> c;')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] }
  ])

  assert.equal(engine.store.lookup('b', 1).length, 2)
  assert.equal(engine.store.lookup('c', 1).length, 2)
})

test('host action receives correct context and args', async () => {
  const calls = []
  const engine = new CHREngine()
  engine.registerAction('record', (ctx) => {
    calls.push({
      args: [...ctx.args],
      engineSame: ctx.engine === engine,
      storeSame: ctx.store === engine.store,
      historySame: ctx.history === engine.history
    })
  })
  engine.addRules('step @ a(X) ==> true | !record(X, X);')

  await engine.assert('a', [42])
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, [42, 42])
  assert.ok(calls[0].engineSame)
  assert.ok(calls[0].storeSame)
  assert.ok(calls[0].historySame)
})

test('host function receives context with matched constraints', async () => {
  const matched = []
  const engine = new CHREngine()
  engine.registerFunction('inspect', (ctx, ...args) => {
    matched.push({
      matchedCount: ctx.matched.length,
      ruleName: ctx.rule.name,
      bindingsKeys: Object.keys(ctx.bindings)
    })
    return true
  })
  engine.addRules('step @ a(X) ==> inspect(X) | b(X);')

  await engine.assert('a', [5])
  assert.equal(matched.length, 1)
  assert.equal(matched[0].matchedCount, 1)
  assert.ok(matched[0].bindingsKeys.includes('X'))
})

test('addRule with name generates automatic name when missing', () => {
  const engine = new CHREngine()
  engine.addRule({ kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'b', args: [] } }] })

  const rules = engine.getRules()
  assert.equal(rules.length, 1)
  assert.ok(rules[0].name.startsWith('rule_'))
})

test('addRule validates variable scoping at load time', () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.addRule({
      name: 'bad',
      kind: 'propagation',
      kept: [{ name: 'a', args: [{ type: 'variable', name: 'X' }] }],
      removed: [],
      guard: [{ type: 'call', callee: 'check', args: [{ type: 'variable', name: 'Y' }] }],
      body: []
    })
  }, /unbound variable/)
})

test('addRule validates body variable scoping', () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.addRule({
      name: 'bad',
      kind: 'propagation',
      kept: [{ name: 'a', args: [{ type: 'variable', name: 'X' }] }],
      removed: [],
      guard: [],
      body: [{ type: 'constraint', constraint: { name: 'b', args: [{ type: 'variable', name: 'Z' }] } }]
    })
  }, /unbound variable/)
})

test('addRule with unify prefix via source', () => {
  const engine = new CHREngine()
  engine.addRules('unify link @ edge(X, Y), edge(Y, Z) ==> path(X, Z);')

  const rules = engine.getRules()
  assert.equal(rules.length, 1)
  assert.equal(rules[0].unify, true)
})

test('addProgram processes declarations then rules', () => {
  const engine = new CHREngine()
  engine.addProgram({
    declarations: [{ name: 'gold', arity: 1 }],
    functionDeclarations: [{ name: 'double', arity: 1 }],
    actionDeclarations: [{ name: 'log', arity: 1 }],
    hostImports: [],
    rules: [{ name: 'step', kind: 'propagation', kept: [{ name: 'gold', args: [{ type: 'variable', name: 'X' }] }], removed: [], guard: [], body: [{ type: 'action', name: 'log', args: [{ type: 'variable', name: 'X' }] }] }]
  })

  assert.equal(engine.getRules().length, 1)
  assert.equal(engine.getState(), 'ready')
})

test('addRules processes function declarations', () => {
  const engine = new CHREngine()
  engine.addRules(`
    functions double/1;
    step @ a(X) ==> true | result(double(X));
  `)

  assert.equal(engine.getRules().length, 1)
})

test('addRules processes action declarations', () => {
  const engine = new CHREngine()
  engine.addRules(`
    actions log/1;
    step @ a(X) ==> true | !log(X);
  `)

  assert.equal(engine.getRules().length, 1)
})

test('declareConstraint sets arity', () => {
  const engine = new CHREngine()
  engine.declareConstraint('gold', 1)
  engine.declareConstraints({ silver: 2, bronze: 1 })

  assert.throws(() => {
    engine.assert('gold', [1, 2])
  }, /arity/)
})

test('declareConstraint rejects conflicting arity', () => {
  const engine = new CHREngine()
  engine.declareConstraint('gold', 1)
  assert.throws(() => {
    engine.declareConstraint('gold', 2)
  }, /incompatible arity/)
})

test('constraint arity enforced on assert', async () => {
  const engine = new CHREngine()
  engine.declareConstraint('gold', 1)
  engine.addRules('step @ a ==> b;')

  await assert.rejects(async () => {
    await engine.assert('gold', [1, 2])
  }, /arity/)
})

test('constraint arity enforced on body emission', () => {
  const engine = new CHREngine()
  engine.declareConstraint('gold', 1)
  engine.declareConstraint('silver', 2)
  assert.throws(() => {
    engine.addRules('step @ a ==> gold(1, 2);')
  }, /arity/)
})

test('engine snapshot contains history after fixpoint', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [])

  const snap = engine.snapshot()
  assert.ok(snap.history !== undefined)
  assert.ok(Object.keys(snap.history || {}).length > 0)
})

test('onRuleFired trace includes all fields', async () => {
  const traces = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      traces.push(trace)
    }
  })

  engine.addRules('step @ a(X) ==> gt(X, 0) | b(X);')
  await engine.assert('a', [5])

  assert.equal(traces.length, 1)
  assert.equal(traces[0].ruleName, 'step')
  assert.equal(traces[0].kind, 'propagation')
  assert.ok(Array.isArray(traces[0].matchedConstraintIds))
  assert.ok(typeof traces[0].firedAt === 'number')
  assert.ok(typeof traces[0].durationMs === 'number')
  assert.ok(traces[0].durationMs >= 0)
})
