import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, BuiltinsModule } from '../dist/index.js'

test('import host builtins registers functions from source', async () => {
  const engine = new CHREngine()
  engine.registerHostModule('builtins', BuiltinsModule)
  engine.addRules('import host builtins; constraint a/1, b/1; match @ a(X) ==> eq(X, 1) | b(X);')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('import host builtins allows using functions in guards', async () => {
  const engine = new CHREngine()
  engine.registerHostModule('builtins', BuiltinsModule)
  engine.addRules('import host builtins; constraint a/1, b/1; check @ a(X) ==> gt(X, 5) | b(X);')

  await engine.assert('a', [10])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('import host modules are independent', async () => {
  const customModule = {
    functions: {
      isPositive: (_ctx, x) => typeof x === 'number' && x > 0
    }
  }

  const engine = new CHREngine()
  engine.registerHostModule('builtins', BuiltinsModule)
  engine.registerHostModule('custom', customModule)
  engine.addRules(
    'import host builtins; import host custom; constraint a/1, b/1; check @ a(X) ==> isPositive(X), gt(X, 0) | b(X);'
  )

  await engine.assert('a', [42])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('import host unknown module throws error', async () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.addRules('import host nonexistent; constraint a/1;')
  }, /Unknown host module/)
})

test('import host with strictHostDeclarations works', async () => {
  const engine = new CHREngine({ strictHostDeclarations: true })
  engine.registerHostModule('builtins', BuiltinsModule)
  engine.addRules('import host builtins; constraint a/1, b/1; match @ a(X) ==> eq(X, 1) | b(X);')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('import host modules can have actions', async () => {
  let acted = false
  const actionModule = {
    functions: {},
    actions: {
      record: () => { acted = true }
    }
  }

  const engine = new CHREngine()
  engine.registerHostModule('actions', actionModule)
  engine.addRules('import host actions; constraint a/1; fire @ a(X) ==> !record();')

  await engine.assert('a', [1])
  assert.equal(acted, true)
})

test('double import host modules from source is allowed', async () => {
  const engine = new CHREngine()
  engine.registerHostModule('builtins', BuiltinsModule)
  engine.addRules('import host builtins;')
  engine.addRules('import host builtins;')
  engine.addRules('constraint a/1, b/1; match @ a(X) ==> eq(X, 1) | b(X);')

  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('import host with host actions in body uses imported module', async () => {
  let logged = ''
  const logModule = {
    actions: {
      log: (ctx) => { logged = String(ctx.args[0]) }
    }
  }

  const engine = new CHREngine()
  engine.registerHostModule('logger', logModule)
  engine.addRules('import host logger; constraint a/1; fire @ a(X) ==> !log(X);')

  await engine.assert('a', ['hello'])
  assert.equal(logged, 'hello')
})
