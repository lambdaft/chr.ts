import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, BuiltinsModule } from '../dist/index.js'

test('builtin div by zero throws in guard', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a(X) ==> div(X, 0) | ok;')

  await engine.assert('a', [10])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin mod by zero throws in guard', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a(X) ==> mod(X, 0) | ok;')

  await engine.assert('a', [10])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin div by zero throws in body', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a() ==> true | result(div(1, 0));')

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /div(?:ision)? by zero/i)
})

test('builtin stringLength on non-string throws in guard', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a(X) ==> stringLength(X) | ok;')

  await engine.assert('a', [42])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin stringLength on non-string throws in body', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a() ==> true | result(stringLength(42));')

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Expected string/)
})

test('builtin numeric coercion throws for non-number in gt', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a(X) ==> gt(X, 0) | ok;')

  await engine.assert('a', ['not-a-number'])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin numeric coercion throws for non-number in add', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a(X) ==> true | result(add(X, 1));')

  let caught
  try {
    await engine.assert('a', ['not-a-number'])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Expected number/)
})

test('builtin min works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> true | result(min(X, Y));')

  await engine.assert('a', [10, 20])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 10)
})

test('builtin max works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> true | result(max(X, Y));')

  await engine.assert('a', [10, 20])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 20)
})

test('builtin isBoolean works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> isBoolean(X) | ok;')

  await engine.assert('a', [true])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin isNull works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> isNull(X) | ok;')

  await engine.assert('a', [null])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [0])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin lt works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> lt(X, Y) | ok;')

  await engine.assert('a', [1, 2])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [2, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin lte works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> lte(X, Y) | ok;')

  await engine.assert('a', [1, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [2, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin gte works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> gte(X, Y) | ok;')

  await engine.assert('a', [2, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [1, 2])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin not works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> not(eq(X, 1)) | ok;')

  await engine.assert('a', [2])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin allDifferent throws for non-array second arg', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a() ==> true | result(allDifferent(1, 2));')

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
})

test('builtin in throws for non-array second arg', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('bad @ a() ==> true | result(in(1, "not-array"));')

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Expected array/)
})

test('builtin in returns true for member', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a() ==> true | result(in(2, [1, 2, 3]));')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], true)
})

test('builtin in returns false for non-member', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a() ==> true | result(in(5, [1, 2, 3]));')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], false)
})

test('builtin stringConcat coerces non-strings', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a() ==> true | result(stringConcat(1, 2));')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], '12')
})

test('builtin abs works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> true | result(abs(X));')

  await engine.assert('a', [-5])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 5)
})

test('builtin eq works with different types', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> eq(X, Y) | ok;')

  await engine.assert('a', [1, '1'])
  assert.equal(engine.store.lookup('ok', 0).length, 0)

  engine.clear()
  await engine.assert('a', [1, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('builtin neq works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X, Y) ==> neq(X, Y) | ok;')

  await engine.assert('a', [1, 2])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [1, 1])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin allDifferent with array form', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a() ==> true | result(allDifferent([1, 2, 3]));')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], true)
})

test('builtin allDifferent with duplicates returns false', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a() ==> true | result(allDifferent([1, 1, 2]));')

  await engine.assert('a', [])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], false)
})

test('builtin isNumber works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> isNumber(X) | ok;')

  await engine.assert('a', [42])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', ['hello'])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin isString works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> isString(X) | ok;')

  await engine.assert('a', ['hello'])
  assert.equal(engine.store.lookup('ok', 0).length, 1)

  engine.clear()
  await engine.assert('a', [42])
  assert.equal(engine.store.lookup('ok', 0).length, 0)
})

test('builtin stringLength works correctly', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules('step @ a(X) ==> true | result(stringLength(X));')

  await engine.assert('a', ['hello'])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 5)
})

test('builtin lookup returns array of args arrays', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookup/1;
    step @ a() ==> true | result(lookup('target'));
  `)
  await engine.assert('target', [1, 2])
  await engine.assert('target', [3, 4])

  const result = engine.store.lookup('result', 1)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].args[0], [[1, 2], [3, 4]])
})

test('builtin lookupOne returns first match arg at index', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookupOne/2;
    step @ a() ==> true | result(lookupOne('target', 0));
  `)
  await engine.assert('target', [42, 99])

  const result = engine.store.lookup('result', 1)
  assert.equal(result.length, 1)
  assert.equal(result[0].args[0], 42)
})

test('builtin lookupOne throws when constraint missing', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    functions lookupOne/2;
    step @ a() ==> true | result(lookupOne('missing', 0));
  `)

  let caught
  try {
    await engine.assert('a', [])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /No constraint missing found/)
})

test('builtin lookupOne throws when arg index out of bounds', async () => {
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

test('builtin module can be registered directly', () => {
  const engine = new CHREngine()
  engine.registerHost(BuiltinsModule)

  engine.addRules('step @ a(X) ==> gt(X, 0) | b(X);')
  engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})
