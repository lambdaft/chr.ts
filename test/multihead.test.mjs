import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('multi-head propagation joins two constraints', async () => {
  const engine = new CHREngine()
  engine.addRules('both @ a(X), b(Y) ==> c(X, Y);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'b', args: [2] }
  ])

  const cs = engine.store.lookup('c', 2)
  assert.equal(cs.length, 1)
  assert.deepEqual(cs[0].args, [1, 2])
})

test('multi-head propagation does not fire if only one constraint exists', async () => {
  const engine = new CHREngine()
  engine.addRules('both @ a(X), b(Y) ==> c(X, Y);')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('c', 2).length, 0)
})

test('multi-head simplification removes both heads', async () => {
  const engine = new CHREngine()
  engine.addRules('merge @ a(X), b(Y) <=> c(X, Y);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'b', args: [2] }
  ])

  assert.equal(engine.store.lookup('a', 1).length, 0)
  assert.equal(engine.store.lookup('b', 1).length, 0)
  assert.equal(engine.store.lookup('c', 2).length, 1)
})

test('multi-head propagation with repeated variable', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(X), b(X) ==> c(X);')

  await engine.assertMany([
    { name: 'a', args: ['key1'] },
    { name: 'b', args: ['key1'] },
    { name: 'a', args: ['key2'] },
    { name: 'b', args: ['key2'] }
  ])

  const cs = engine.store.lookup('c', 1)
  assert.equal(cs.length, 2)
})

test('multi-head propagation with repeated variable does not match mismatched values', async () => {
  const engine = new CHREngine()
  engine.addRules('join @ a(X), b(X) ==> c(X);')

  await engine.assertMany([
    { name: 'a', args: ['key1'] },
    { name: 'b', args: ['key2'] }
  ])

  assert.equal(engine.store.lookup('c', 1).length, 0)
})

test('multi-head with literal in head', async () => {
  const engine = new CHREngine()
  engine.addRules('match @ a(1), b(X) ==> c(X);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'b', args: [42] }
  ])

  assert.equal(engine.store.lookup('c', 1).length, 1)
  assert.equal(engine.store.lookup('c', 1)[0].args[0], 42)
})

test('multi-head with literal mismatch in head', async () => {
  const engine = new CHREngine()
  engine.addRules('match @ a(1), b(X) ==> c(X);')

  await engine.assertMany([
    { name: 'a', args: [999] },
    { name: 'b', args: [42] }
  ])

  assert.equal(engine.store.lookup('c', 1).length, 0)
})

test('multi-head simpagation keeps kept, removes removed', async () => {
  const engine = new CHREngine()
  engine.addRules('keep @ keep(X) \\ drop(X) <=> done(X);')

  await engine.assertMany([
    { name: 'keep', args: [1] },
    { name: 'drop', args: [1] }
  ])

  assert.equal(engine.store.lookup('keep', 1).length, 1)
  assert.equal(engine.store.lookup('drop', 1).length, 0)
  assert.equal(engine.store.lookup('done', 1).length, 1)
})

test('new constraint with same value can create new multi-head propagation match', async () => {
  const engine = new CHREngine()
  engine.addRules('dup @ a(X), b(Y) ==> c(X, Y);')

  await engine.assert('a', [1])
  await engine.assert('b', [2])

  assert.equal(engine.store.lookup('c', 2).length, 1)

  await engine.assert('a', [1])

  assert.equal(engine.store.lookup('c', 2).length, 2)
})

test('multi-head three-way join', async () => {
  const engine = new CHREngine()
  engine.addRules('three @ a(X), b(Y), c(Z) ==> d(X, Y, Z);')

  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'b', args: [2] },
    { name: 'c', args: [3] }
  ])

  const ds = engine.store.lookup('d', 3)
  assert.equal(ds.length, 1)
  assert.deepEqual(ds[0].args, [1, 2, 3])
})

test('multi-head three-way join with shared variable', async () => {
  const engine = new CHREngine()
  engine.addRules('three @ a(X), b(X), c(Y) ==> d(X, Y);')

  await engine.assertMany([
    { name: 'a', args: ['id1'] },
    { name: 'b', args: ['id1'] },
    { name: 'c', args: ['val'] }
  ])

  const ds = engine.store.lookup('d', 2)
  assert.equal(ds.length, 1)
  assert.deepEqual(ds[0].args, ['id1', 'val'])
})

test('multi-head three-way join with shared variable fails on mismatch', async () => {
  const engine = new CHREngine()
  engine.addRules('three @ a(X), b(X), c(Y) ==> d(X, Y);')

  await engine.assertMany([
    { name: 'a', args: ['id1'] },
    { name: 'b', args: ['id2'] },
    { name: 'c', args: ['val'] }
  ])

  assert.equal(engine.store.lookup('d', 2).length, 0)
})

test('multi-head with guards', async () => {
  const engine = new CHREngine()
  engine.registerFunction('gt', (_ctx, a, b) => Number(a) > Number(b))
  engine.addRules('big @ a(X), b(Y) ==> gt(X, Y) | c(X);')

  await engine.assertMany([
    { name: 'a', args: [10] },
    { name: 'b', args: [3] }
  ])

  assert.equal(engine.store.lookup('c', 1).length, 1)
})

test('multi-head with guard rejection', async () => {
  const engine = new CHREngine()
  engine.registerFunction('gt', (_ctx, a, b) => Number(a) > Number(b))
  engine.addRules('big @ a(X), b(Y) ==> gt(X, Y) | c(X);')

  await engine.assertMany([
    { name: 'a', args: [3] },
    { name: 'b', args: [10] }
  ])

  assert.equal(engine.store.lookup('c', 1).length, 0)
})
