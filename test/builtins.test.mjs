import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, BuiltinsModule } from '../dist/index.js'

test('builtin eq compares values', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('match @ a(X) ==> eq(X, 1) | b(X);')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('builtin eq fails on mismatch', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('match @ a(X) ==> eq(X, 1) | b(X);')

  await engine.assert('a', [2])
  assert.equal(engine.store.lookup('b', 1).length, 0)
})

test('builtin neq passes on mismatch', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('match @ a(X) ==> neq(X, 1) | b(X);')

  await engine.assert('a', [2])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('builtin arithmetic in expressions', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('calc @ a(X) ==> b(add(X, 1)), c(mul(X, 2));')

  await engine.assert('a', [5])

  const bs = engine.store.lookup('b', 1)
  const cs = engine.store.lookup('c', 1)
  assert.equal(bs.length, 1)
  assert.equal(cs.length, 1)
  assert.equal(bs[0].args[0], 6)
  assert.equal(cs[0].args[0], 10)
})

test('builtin type checks in guards', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ a(X) ==> isNumber(X), gt(X, 0) | b(X);')

  await engine.assert('a', [42])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('builtin type guard rejects non-number', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ a(X) ==> isNumber(X), gt(X, 0) | b(X);')

  await engine.assert('a', ['hello'])
  assert.equal(engine.store.lookup('b', 1).length, 0)
})

test('builtin string operations', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('concat @ a(X, Y) ==> b(stringConcat(X, Y));')

  await engine.assert('a', ['hello', ' world'])

  const bs = engine.store.lookup('b', 1)
  assert.equal(bs.length, 1)
  assert.equal(bs[0].args[0], 'hello world')
})

test('builtin stringLength', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ a(X) ==> isString(X), gt(stringLength(X), 3) | b(X);')

  await engine.assert('a', ['hello'])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('builtin abs in guard', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ a(X) ==> gt(abs(X), 5) | b(X);')

  await engine.assert('a', [-10])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('BuiltinsModule export can be used directly', async () => {
  const engine = new CHREngine()
  engine.registerHost(BuiltinsModule)
  engine.addRules('match @ a(X) ==> eq(X, 1) | b(X);')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('builtin allDifferent passes for distinct values', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ item(X, Y, Z) ==> allDifferent(X, Y, Z) | ok;')

  await engine.assert('item', [1, 2, 3])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('builtin allDifferent fails for duplicate values', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ item(X, Y, Z) ==> allDifferent(X, Y, Z) | ok;')

  await engine.assert('item', [1, 2, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin allDifferent passes for two distinct values', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ pair(X, Y) ==> allDifferent(X, Y) | ok;')

  await engine.assert('pair', ['a', 'b'])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('builtin allDifferent fails for two equal values', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ pair(X, Y) ==> allDifferent(X, Y) | ok;')

  await engine.assert('pair', ['a', 'a'])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin allDifferent supports array form', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ items(X) ==> allDifferent(X) | ok;')

  await engine.assert('items', [[1, 2, 3]])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('builtin allDifferent fails array form with duplicate', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('check @ items(X) ==> allDifferent(X) | ok;')

  await engine.assert('items', [[1, 1]])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})
