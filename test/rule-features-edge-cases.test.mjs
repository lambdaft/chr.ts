import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('let binding caches expression result for later body items', async () => {
  let callCount = 0
  const engine = new CHREngine()
  engine.registerFunction('expensive', (_ctx, x) => {
    callCount++
    return x * 2
  })

  engine.addRules(`
    functions expensive/1;
    step @ a(X) ==> let Y = expensive(X) | gt(Y, 5), b(Y);
  `)

  await engine.assert('a', [3])
  assert.equal(callCount, 1)
  assert.equal(engine.store.lookup('b', 1).length, 1)
  assert.equal(engine.store.lookup('b', 1)[0].args[0], 6)
})

test('multiple let bindings chain correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ a(X, Y) ==>
      let Sum = add(X, Y)
      | let Doubled = add(Sum, Sum)
      | result(Doubled);
  `)

  await engine.assert('a', [3, 4])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 14)
})

test('let binding variable available in later body items', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ a(X) ==>
      let Doubled = add(X, X)
      | gt(Doubled, 10)
      | result(Doubled);
  `)

  await engine.assert('a', [6])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 12)
})

test('let binding in simplification rule', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ a(X) <=>
      let Doubled = add(X, X)
      | result(Doubled);
  `)

  await engine.assert('a', [5])
  assert.equal(engine.store.lookup('a', 1).length, 0)
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 10)
})

test('let binding in simpagation rule', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ keep(X) \ remove(X) <=>
      let Doubled = add(X, X)
      | result(Doubled);
  `)

  await engine.assertMany([
    { name: 'keep', args: [5] },
    { name: 'remove', args: [5] }
  ])

  assert.equal(engine.store.lookup('keep', 1).length, 1)
  assert.equal(engine.store.lookup('remove', 1).length, 0)
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 10)
})

test('let binding with host action side effect', async () => {
  const logs = []
  const engine = new CHREngine()
  engine.registerFunction('calc', (_ctx, x) => x * 2)
  engine.registerAction('log', (ctx) => {
    logs.push(ctx.args[0])
  })

  engine.addRules(`
    functions calc/1;
    actions log/1;
    step @ a(X) ==>
      let Y = calc(X)
      | gt(Y, 5)
      | !log(Y);
  `)

  await engine.assert('a', [3])
  assert.equal(logs.length, 1)
  assert.equal(logs[0], 6)
})

test('let binding with unification rule', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRule({
    name: 'unify-let',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'let', name: 'Sum', expr: { type: 'call', callee: 'add', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } },
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }, { type: 'variable', name: 'Sum' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] }
  ])

  assert.equal(engine.store.lookup('path', 3).length, 1)
  assert.equal(engine.store.lookup('path', 3)[0].args[2], 4)
})

test('in-place update replaces matching constraint', async () => {
  const engine = new CHREngine()
  engine.addRules(`
    step @ gold(G) <= gold(add(G, 1));
  `)

  await engine.assert('gold', [10])
  const records = engine.store.lookup('gold', 1)
  assert.equal(records.length, 1)
  assert.equal(records[0].args[0], 11)
})

test('in-place update with expression in new value', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ gold(G) <= gold(mul(G, 2));
  `)

  await engine.assert('gold', [5])
  const records = engine.store.lookup('gold', 1)
  assert.equal(records.length, 1)
  assert.equal(records[0].args[0], 10)
})

test('in-place update in simpagation', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ keep(X) \ gold(G) <= gold(add(G, 1));
  `)

  await engine.assertMany([
    { name: 'keep', args: [1] },
    { name: 'gold', args: [10] }
  ])

  assert.equal(engine.store.lookup('keep', 1).length, 1)
  assert.equal(engine.store.lookup('gold', 1).length, 1)
  assert.equal(engine.store.lookup('gold', 1)[0].args[0], 11)
})

test('in-place update with unification', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRule({
    name: 'unify-update',
    kind: 'simpagation',
    unify: true,
    kept: [{ name: 'keep', args: [{ type: 'variable', name: 'X' }] }],
    removed: [{ name: 'counter', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'V' }] }],
    guard: [],
    body: [
      { type: 'update', old: { name: 'counter', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'V' }] }, constraint: { name: 'counter', args: [{ type: 'variable', name: 'X' }, { type: 'call', callee: 'add', args: [{ type: 'variable', name: 'V' }, { type: 'literal', value: 1 }] }] } }
    ]
  })

  await engine.assertMany([
    { name: 'keep', args: [1] },
    { name: 'counter', args: [1, 5] }
  ])

  assert.equal(engine.store.lookup('keep', 1).length, 1)
  assert.equal(engine.store.lookup('counter', 2).length, 1)
  assert.equal(engine.store.lookup('counter', 2)[0].args[1], 6)
})

test('in-place update with anonymous _ in old pattern', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ a(_) <= a(1);
  `)

  await engine.assert('a', [99])
  const records = engine.store.lookup('a', 1)
  assert.equal(records.length, 1)
  assert.equal(records[0].args[0], 1)
})

test('constraint lookup in guard returns all matching args arrays', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookup/1;
    step @ command('check', _) ==>
      gt(lookupOne('gold', 0), 0)
      | checked;
  `)

  await engine.assert('gold', [100])
  await engine.assert('command', ['check', 'x'])
  assert.equal(engine.store.lookup('checked', 0).length, 1)
})

test('constraint lookupOne returns arg from first match', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookupOne/2;
    step @ a() ==> true | result(lookupOne('target', 1));
  `)

  await engine.assert('target', ['first', 'second'])
  const result = engine.store.lookup('result', 1)
  assert.equal(result.length, 1)
  assert.equal(result[0].args[0], 'second')
})

test('constraint lookupOne throws when no constraint of name exists', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookupOne/2;
    step @ a() ==> true | result(lookupOne('empty', 0));
  `)

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /No constraint empty found/)
})

test('constraint lookupOne throws when index out of bounds', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookupOne/2;
    step @ a() ==> true | result(lookupOne('target', 5));
  `)

  await engine.assert('target', [1, 2])
  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /out of bounds/)
})

test('constraint lookup in guard with multiple matches', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookup/1;
    step @ a() ==>
      gt(lookup('score')[0][0], 10)
      | high;
  `)

  await engine.assert('score', [15])
  await engine.assert('a', [])
  assert.equal(engine.store.lookup('high', 0).length, 1)
})

test('in-place update removes all matching old constraints', async () => {
  const engine = new CHREngine()
  engine.addRules(`
    step @ a(X) <= a(add(X, 1));
  `)

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] },
    { name: 'a', args: [3] }
  ])

  assert.equal(engine.store.lookup('a', 1).length, 3)
})

test('in-place update with host function in expression', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    step @ a(X) <= a(mul(X, 2));
  `)

  await engine.assert('a', [5])
  const records = engine.store.lookup('a', 1)
  assert.equal(records.length, 1)
  assert.equal(records[0].args[0], 10)
})

test('let binding with multiple lets overriding same name not allowed by parser', () => {
  assert.throws(() => {
    const engine = new CHREngine()
    engine.addRules(`
      step @ a(X) ==>
        let X = 1
        | let X = 2
        | result(X);
    `)
  })
})
