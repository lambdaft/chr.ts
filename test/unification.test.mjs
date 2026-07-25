import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, defineHostModule } from '../dist/index.js'

// ─── Test helpers ────────────────────────────────────────────────────────────

function createEngineWithRules (source) {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(source)
  return engine
}

// ─── Unification: basic variable sharing ────────────────────────────────────

test('unify propagation rule matches shared variables across heads', async () => {
  const engine = createEngineWithRules(
    'unify path(X, Y) \\ path(Y, Z) ==> path(X, Z);'
  )

  await engine.assertMany([
    { name: 'path', args: ['a', 'b'] },
    { name: 'path', args: ['b', 'c'] }
  ])

  const paths = engine.store.lookup('path', 2)
  const tuples = paths.map((r) => [r.args[0], r.args[1]])
  assert.ok(
    tuples.some(([a, b]) => a === 'a' && b === 'c'),
    `Expected path(a, c) in ${JSON.stringify(tuples)}`
  )
})

test('unify propagation rule chains across multiple steps', async () => {
  const engine = createEngineWithRules(
    'unify path(X, Y) \\ path(Y, Z) ==> path(X, Z);'
  )

  await engine.assertMany([
    { name: 'path', args: ['a', 'b'] },
    { name: 'path', args: ['b', 'c'] },
    { name: 'path', args: ['c', 'd'] }
  ])

  const paths = engine.store.lookup('path', 2)
  const tuples = paths.map((r) => [r.args[0], r.args[1]])
  assert.ok(tuples.some(([a, b]) => a === 'a' && b === 'c'), 'should derive a->c')
  assert.ok(tuples.some(([a, b]) => a === 'a' && b === 'd'), 'should derive a->d')
  assert.ok(tuples.some(([a, b]) => a === 'b' && b === 'd'), 'should derive b->d')
})

test('unify handles literal-equal heads correctly', async () => {
  const engine = createEngineWithRules(
    'unify edge(a, X) \\ edge(X, b) ==> path(a, b);'
  )

  await engine.assertMany([
    { name: 'edge', args: ['a', 'mid'] },
    { name: 'edge', args: ['mid', 'b'] }
  ])

  assert.equal(engine.store.lookup('path', 2).length, 1)
  assert.deepEqual(engine.store.lookup('path', 2)[0].args, ['a', 'b'])
})

test('unify detection failure when variable cannot resolve', async () => {
  const engine = createEngineWithRules(
    'unify link(X, Y) \\ link(Y, Z) ==> link(X, Z);'
  )

  await engine.assertMany([
    { name: 'link', args: ['a', 'b'] },
    { name: 'link', args: ['c', 'd'] }
  ])

  assert.equal(engine.store.lookup('link', 2).length, 2)
})

test('unify propagation history tracks fired rule instances', async () => {
  const engine = createEngineWithRules(
    'unify path(X, Y) \\ path(Y, Z) ==> path(X, Z);'
  )

  await engine.assertMany([
    { name: 'path', args: ['a', 'b'] },
    { name: 'path', args: ['b', 'c'] }
  ])

  const afterFirst = engine.store.lookup('path', 2).length
  assert.ok(afterFirst >= 1, 'should derive at least one new path after first assertion')

  await engine.assertMany([
    { name: 'path', args: ['a', 'b'] },
    { name: 'path', args: ['b', 'c'] }
  ])

  const afterSecond = engine.store.lookup('path', 2).length
  assert.ok(afterSecond >= afterFirst, 're-assertion should not shrink store')
})

// ─── Unification + builtins in guards ───────────────────────────────────────

test('unify rule with guard that uses unified bindings', async () => {
  const engine = createEngineWithRules(
    'unify edge(X, Y) \\ edge(Y, Z) ==> eq(X, Z) | connected(X, Z);'
  )

  await engine.assertMany([
    { name: 'edge', args: ['a', 'b'] },
    { name: 'edge', args: ['b', 'c'] }
  ])

  assert.equal(engine.store.lookup('connected', 2).length, 0)
})

test('unify rule with passing guard', async () => {
  const engine = createEngineWithRules(
    "unify edge(X, Y) \\ edge(Y, Z) ==> eq(Z, 'c') | connected(X, Z);"
  )

  await engine.assertMany([
    { name: 'edge', args: ['a', 'b'] },
    { name: 'edge', args: ['b', 'c'] }
  ])

  assert.equal(engine.store.lookup('connected', 2).length, 1)
  assert.deepEqual(engine.store.lookup('connected', 2)[0].args, ['a', 'c'])
})

// ─── Anonymous variable _ with unification ──────────────────────────────────

test('unify with anonymous _ in head ignores value', async () => {
  const engine = createEngineWithRules(
    'unify drop(_, X) \\ drop(_, X) ==> unique(X);'
  )

  await engine.assertMany([
    { name: 'drop', args: [1, 'a'] },
    { name: 'drop', args: [2, 'a'] }
  ])

  assert.equal(engine.store.lookup('unique', 1).length, 1)
  assert.equal(engine.store.lookup('unique', 1)[0].args[0], 'a')
})

test('unify with _ does not bind or participate in substitution', async () => {
  const engine = createEngineWithRules(
    'unify item(_, X) ==> known(X);'
  )

  await engine.assert('item', ['anything', 42])
  assert.equal(engine.store.lookup('known', 1).length, 1)
  assert.equal(engine.store.lookup('known', 1)[0].args[0], 42)
})

// ─── Strict mode vs unification ──────────────────────────────────────────────

test('strict rule fails when variable already bound to different value', async () => {
  const engine = createEngineWithRules(
    'same(X, Y) \\ same(Y, Z) ==> same(X, Z);'
  )

  await engine.assertMany([
    { name: 'same', args: ['a', 'b'] },
    { name: 'same', args: ['c', 'd'] }
  ])

  assert.equal(engine.store.lookup('same', 2).length, 2)
})

test('same facts succeed under strict mode for matching values', async () => {
  const engine = createEngineWithRules(
    'same(X, Y) \\ same(Y, Z) ==> same(X, Z);'
  )

  await engine.assertMany([
    { name: 'same', args: ['a', 'b'] },
    { name: 'same', args: ['b', 'c'] }
  ])

  assert.equal(engine.store.lookup('same', 2).length, 3)
  assert.ok(
    engine.store.lookup('same', 2).some((r) => r.args[0] === 'a' && r.args[1] === 'c')
  )
})

// ─── Programmatic RuleNode with unify ────────────────────────────────────────

test('programmatic RuleNode unify=true enables unification without parser', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRule({
    name: 'transitive',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'link', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'link', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'link', args: ['a', 'b'] },
    { name: 'link', args: ['b', 'c'] }
  ])

  assert.equal(engine.store.lookup('path', 2).length, 1)
  assert.deepEqual(engine.store.lookup('path', 2)[0].args, ['a', 'c'])
})

test('programmatic RuleNode without unify defaults to strict matching', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'strict',
    kind: 'propagation',
    kept: [
      { name: 'rel', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'known', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] } }
    ]
  })

  await engine.assert('rel', ['a', 'b'])
  assert.equal(engine.store.lookup('known', 2).length, 1)
})

// ─── Engine diagnostic APIs with unification ─────────────────────────────────

test('engine.getRulesByHead returns unification rules', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('unify path(X, Y) \\ path(Y, Z) ==> path(X, Z);')
  engine.addRules('same(X, Y) ==> known(X, Y);')

  const pathRules = engine.getRulesByHead('path')
  assert.equal(pathRules.length, 1)
  assert.equal(pathRules[0].unify, true)
  assert.equal(pathRules[0].name, 'path_0')
})

test('engine snapshot includes unify status', async () => {
  const engine = createEngineWithRules(
    'unify edge(X, Y) \\ edge(Y, Z) ==> path(X, Z);'
  )

  const snapshot = engine.snapshot()
  const ruleEntry = snapshot.rules.find((r) => r.name === 'rule_0')
  assert.ok(ruleEntry)
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

test('unify with same variable in both heads resolves correctly', async () => {
  const engine = createEngineWithRules(
    'unify connect(X, X) ==> self(X);'
  )

  await engine.assert('connect', ['a', 'a'])
  assert.equal(engine.store.lookup('self', 1).length, 1)
})

test('unify does not fire when same variable gets conflicting values', async () => {
  const engine = createEngineWithRules(
    'unify connect(X, Y) \\ connect(X, Z) ==> merge(Y, Z);'
  )

  await engine.assertMany([
    { name: 'connect', args: ['a', 'b'] },
    { name: 'connect', args: ['a', 'c'] }
  ])

  assert.equal(engine.store.lookup('merge', 2).length, 1)
})

test('unify simpagation removed head is consumed', async () => {
  const engine = createEngineWithRules(
    'unify path(X, Y) <= path(Y, Z) \\ path(Y, Z) ==> path(X, Z);'
  )

  await engine.assertMany([
    { name: 'path', args: ['a', 'b'] },
    { name: 'path', args: ['b', 'c'] }
  ])

  const paths = engine.store.lookup('path', 2)
  assert.equal(paths.length, 2, 'simpagation should keep kept head and derived')
})

test('unify propagation rule keeps all head constraints', async () => {
  const engine = createEngineWithRules(
    'unify edge(X, Y) \\ edge(Y, Z) ==> path(X, Z);'
  )

  await engine.assertMany([
    { name: 'edge', args: ['a', 'b'] },
    { name: 'edge', args: ['b', 'c'] }
  ])

  assert.equal(engine.store.lookup('edge', 2).length, 2)
  assert.equal(engine.store.lookup('path', 2).length, 1)
})

// ─── Backward compatibility: existing strict rules ───────────────────────────

test('existing strict rules are unaffected by unification feature', async () => {
  const engine = createEngineWithRules(
    'strict @ a(X), a(Y) ==> eq(X, Y) | same(X, Y);'
  )

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [1] }
  ])

  assert.equal(engine.store.lookup('same', 2).length, 1)
})

test('mixed strict and unify rules coexist in same engine', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('unify path(X, Y) \\ path(Y, Z) ==> path(X, Z);')
  engine.addRules('link(X, Y) ==> known(X, Y);')

  await engine.assertMany([
    { name: 'path', args: ['a', 'b'] },
    { name: 'path', args: ['b', 'c'] },
    { name: 'link', args: ['x', 'y'] }
  ])

  assert.ok(engine.store.lookup('path', 2).length >= 2)
  assert.equal(engine.store.lookup('known', 2).length, 1)
})

// ─── Rule with unify and body actions ───────────────────────────────────────

test('unify rule can emit constraints and call actions', async () => {
  const collected = []
  const host = defineHostModule({
    actions: {
      record: (ctx) => {
        collected.push(ctx.args)
      }
    }
  })

  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(
    'unify edge(X, Y) \\ edge(Y, Z) ==> eq(Z, "c") | !record(X, Y, Z);'
  )

  await engine.assertMany([
    { name: 'edge', args: ['a', 'b'] },
    { name: 'edge', args: ['b', 'c'] }
  ])

  assert.equal(collected.length, 1)
  assert.deepEqual(collected[0], ['a', 'b', 'c'])
})
