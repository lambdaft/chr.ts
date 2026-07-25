import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, defineHostModule, CHRExecutionError, ConstraintStore } from '../dist/index.js'

test('anonymous variable _ matches any value without binding', async () => {
  const engine = new CHREngine()
  engine.addRules('ignore @ a(_, X) ==> b(X);')

  await engine.assertMany([
    { name: 'a', args: [1, 10] },
    { name: 'a', args: [2, 20] }
  ])

  assert.equal(engine.store.lookup('b', 1).length, 2)
  assert.deepEqual(engine.store.lookup('b', 1).map((r) => r.args[0]), [10, 20])
})

test('anonymous variable _ allows repeated matches across heads', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(_, X) \\ a(_, Y) ==> X === Y | matched(X);')

  await engine.assertMany([
    { name: 'a', args: ['ignored', 5] },
    { name: 'a', args: ['other', 5] }
  ])

  assert.equal(engine.store.lookup('matched', 1).length, 1)
})

test('anonymous variable _ does not appear in warnings', async () => {
  const engine = new CHREngine()
  engine.addRules('ok @ a(_, X) ==> true | b(X);')

  const warnings = engine.getWarnings()
  assert.ok(!warnings.some((w) => w.includes('_')))
})

test('unary ! negates boolean host function result in guard', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('reject @ item(X) ==> !eq(X, 1) | rejected;')

  await engine.assert('item', [2])
  assert.equal(engine.store.lookup('rejected', 0).length, 1)
})

test('unary ! blocks rule when host function returns true', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('accept @ item(X) ==> !eq(X, 1) | accepted;')

  await engine.assert('item', [1])
  assert.equal(engine.store.lookup('accepted', 0).length, 0)
})

test('in operator checks array membership in guard', async () => {
  const engine = new CHREngine()
  engine.addRules('filter @ status(X) ==> X in ["active", "pending"] | allowed;')

  await engine.assertMany([
    { name: 'status', args: ['active'] },
    { name: 'status', args: ['banned'] }
  ])

  assert.equal(engine.store.lookup('allowed', 0).length, 1)
})

test('in operator with array literal in body expression', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('place @ item(X) ==> result(in(X, [1, 2, 3]));')

  await engine.assert('item', [2])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], true)
})

test('engine state transitions through lifecycle', async () => {
  const engine = new CHREngine()
  assert.equal(engine.getState(), 'empty')

  engine.addRules('step @ a ==> b;')
  assert.equal(engine.getState(), 'ready')

  await engine.assert('a', [1])
  assert.equal(engine.getState(), 'ready')

  engine.clear()
  assert.equal(engine.getState(), 'ready')
})

test('engine rejects assert before rules are added', async () => {
  const engine = new CHREngine()
  await assert.rejects(async () => {
    await engine.assert('a', [1])
  }, /No rules have been loaded/)
})

test('engine validate dry-run returns ok with no errors', async () => {
  const engine = new CHREngine()
  engine.registerFunction('positive', () => true)
  engine.registerAction('record', () => {})

  engine.addRules(`
    functions positive/1;
    actions record/1;
    approve @ input(X) ==> positive(X) | !record(X);
  `)

  const result = engine.validate('extra @ x ==> positive(x) | ok;')
  assert.equal(result.ok, true)
  assert.equal(result.executionErrors.length, 0)
})

test('engine validate dry-run catches undeclared host call', async () => {
  const engine = new CHREngine({ strictHostDeclarations: true })

  const result = engine.validate('broken @ a ==> missing() | ok;')
  assert.equal(result.ok, false)
  assert.equal(result.executionErrors.length, 1)
  assert.match(result.executionErrors[0].message, /not declared in source/)
})

test('engine validate dry-run catches parse errors', async () => {
  const engine = new CHREngine()
  const result = engine.validate('a ==>')
  assert.equal(result.ok, false)
  assert.ok(result.parseError)
})

test('rule priority affects firing order', async () => {
  const order = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      order.push(trace.ruleName)
    }
  })

  engine.addRule({ kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'low', args: [] } }], priority: 1 })
  engine.addRule({ kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'high', args: [] } }], priority: 10 })

  await engine.assert('a', [])
  assert.deepEqual(order, ['rule_1', 'rule_0'])
})

test('default rule priority is undefined', async () => {
  const engine = new CHREngine()
  engine.addRule({ kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'b', args: [] } }] })

  const rules = engine.getRules()
  assert.equal(rules[0].priority, undefined)
})

test('onRuleFired trace includes firedAt and durationMs', async () => {
  const traces = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      traces.push(trace)
    }
  })

  engine.addRules('step @ a() ==> b;')
  await engine.assert('a', [])

  assert.equal(traces.length, 1)
  assert.equal(typeof traces[0].firedAt, 'number')
  assert.equal(typeof traces[0].durationMs, 'number')
  assert.ok(traces[0].durationMs >= 0)
})

test('host function error in body expression is wrapped with context and cause', async () => {
  const engine = new CHREngine()
  engine.registerFunction('boom', () => {
    throw new Error('kaboom')
  })
  engine.addRules('fail @ a() ==> true | result(boom());')

  let caught
  try {
    await engine.assert('a', [])
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Host function boom threw/)
  assert.ok(caught.cause instanceof Error)
  assert.equal(caught.cause.message, 'kaboom')
})

test('host action error is wrapped with context and cause', async () => {
  const engine = new CHREngine()
  let actionCaused
  engine.registerAction('fail', (ctx) => {
    const err = new Error('action kaboom')
    actionCaused = err
    throw err
  })
  engine.addRules('fail @ a() ==> true | !fail();')

  let caught
  try {
    await engine.assert('a', [])
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Host action fail threw/)
  assert.ok(caught.cause)
  assert.equal(caught.cause.message, 'action kaboom')
})

test('eager validation checks declared function is registered before assert', async () => {
  const engine = new CHREngine()
  engine.addRules('functions check/1; gate @ a ==> check(X) | ok;')

  await assert.rejects(async () => {
    await engine.assert('a', [1])
  }, /Declared function check\/1 is not registered/)
})

test('eager validation checks declared action is registered before assert', async () => {
  const engine = new CHREngine()
  engine.addRules('actions log/1; gate @ a ==> true | !log(X);')

  await assert.rejects(async () => {
    await engine.assert('a', [1])
  }, /Declared action log\/1 is not registered/)
})

test('addProgram detects unused function declarations', async () => {
  const engine = new CHREngine()
  engine.registerFunction('used', () => true)
  engine.registerAction('log', (ctx) => {})

  engine.addRules(`
    functions used/0, unused/0;
    actions log/0;
    step @ a() ==> used() | !log();
  `)

  const warnings = engine.getWarnings()
  assert.ok(warnings.some((w) => /Unused function declaration/.test(w)))
  assert.ok(!warnings.some((w) => /Unused action declaration/.test(w)))
})

test('addProgram detects unused action declarations', async () => {
  const engine = new CHREngine()
  engine.registerFunction('check', () => true)
  engine.registerAction('used', () => {})

  engine.addRules(`
    functions check/0;
    actions used/0, unused/0;
    step @ a ==> check() | !used();
  `)

  const warnings = engine.getWarnings()
  assert.ok(warnings.some((w) => /Unused action declaration/.test(w)))
  assert.ok(!warnings.some((w) => /Unused function declaration/.test(w)))
})

test('checkMatchingAndShadowing warns on shadowed variable', async () => {
  const engine = new CHREngine()
  engine.addRules('bad @ a(X), a(X) ==> true | ok;')

  const warnings = engine.getWarnings()
  assert.ok(warnings.some((w) => /Shadowed variable/.test(w)))
})

test('checkMatchingAndShadowing warns on dead binding', async () => {
  const engine = new CHREngine()
  engine.addRules('dead @ a(X) ==> true;')

  const warnings = engine.getWarnings()
  assert.ok(warnings.some((w) => /Dead binding/.test(w)))
})

test('host function timeout prevents slow rule from firing', async () => {
  const engine = new CHREngine({ hostFunctionTimeout: 100 })
  engine.registerFunction('hang', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return true
  })
  engine.addRules('hang @ a(X) ==> hang() | ok;')

  const start = Date.now()
  await engine.assert('a', [1])
  const elapsed = Date.now() - start
  assert.ok(elapsed < 500, `Expected timeout <500ms, got ${elapsed}ms`)
  assert.equal(engine.store.lookup('ok', 0).length, 0, 'rule should not fire after timeout')
})

test('host function timeout does not interfere with fast functions', async () => {
  const engine = new CHREngine({ hostFunctionTimeout: 1000 })
  engine.registerFunction('fast', async () => {
    return 'done'
  })
  engine.addRules('fast @ a(X) ==> fast() | ok;')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('store strict mode asserts invariants after add', () => {
  const store = new ConstraintStore({}, { strict: true })
  const a = store.add('x', [1])
  assert.equal(a.id, 1)
})

test('store strict mode asserts invariants after remove', () => {
  const store = new ConstraintStore({}, { strict: true })
  const a = store.add('x', [1])
  store.remove(a.id)
  assert.equal(store.size(), 0)
})

test('host timeout works for slow hanging function via Promise', async () => {
  const engine = new CHREngine({ hostFunctionTimeout: 150 })
  engine.registerFunction('hangSync', async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return true
  })
  engine.addRules('wait @ a(X) ==> hangSync() | ok;')

  const start = Date.now()
  await engine.assert('a', [1])
  assert.ok(Date.now() - start < 500)
  assert.equal(engine.store.lookup('ok', 0).length, 0, 'rule should not fire after timeout')
})

test('error cause chaining preserves original error', () => {
  const original = new Error('root cause')

  const err = new CHRExecutionError('msg', undefined, original)
  assert.equal(err.cause, original)
  assert.equal(err.cause.message, 'root cause')
})
