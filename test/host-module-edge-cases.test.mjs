import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, defineHostModule, BuiltinsModule } from '../dist/index.js'

test('registerHostModules registers multiple modules at once', () => {
  const engine = new CHREngine()
  const mod1 = defineHostModule({ functions: { fn1: () => true } })
  const mod2 = defineHostModule({ functions: { fn2: () => true } })

  engine.registerHostModules({ mod1, mod2 })

  engine.addRules('step @ a ==> fn1() | fn2();')
  engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 1)
})

test('registerHostModule throws on duplicate name', () => {
  const engine = new CHREngine()
  const mod = defineHostModule({ functions: { fn: () => true } })

  engine.registerHostModule('myMod', mod)
  assert.throws(() => {
    engine.registerHostModule('myMod', mod)
  }, /already registered/)
})

test('registerFunction auto-registers declaration for strict mode', () => {
  const engine = new CHREngine({ strictHostDeclarations: true })
  engine.registerFunction('myFunc', () => true)

  engine.addRules('step @ a ==> myFunc() | ok;')
  engine.assert('a', [])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('registerAction auto-registers declaration for strict mode', () => {
  const engine = new CHREngine({ strictHostDeclarations: true })
  engine.registerAction('myAction', () => {})

  engine.addRules('step @ a ==> true | !myAction();')
  engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 1)
})

test('strictHostDeclarations rejects undeclared function even after registerFunction', () => {
  const engine = new CHREngine({ strictHostDeclarations: true })
  engine.registerFunction('registeredFunc', () => true)

  const result = engine.validate('bad @ a ==> unregisteredFunc() | ok;')
  assert.ok(!result.ok)
  assert.ok(result.executionErrors.some(e => /not declared in source/.test(e.message)))
})

test('validate processes import host statements', () => {
  const engine = new CHREngine()
  engine.registerHostModule('builtins', BuiltinsModule)

  const result = engine.validate(`
    import host builtins;
    constraint a/1;
    step @ a(X) ==> gt(X, 0) | b(X);
  `)
  assert.ok(result.ok)
  assert.equal(result.executionErrors.length, 0)
})

test('validate with import host and undeclared function catches error', () => {
  const engine = new CHREngine({ strictHostDeclarations: true })
  engine.registerHostModule('builtins', BuiltinsModule)

  const result = engine.validate(`
    import host builtins;
    step @ a(X) ==> unknownFunc(X) | ok;
  `)
  assert.ok(!result.ok)
  assert.ok(result.executionErrors.length > 0)
})

test('registerHostModule then import host works in addRules', () => {
  const engine = new CHREngine()
  engine.registerHostModule('math', defineHostModule({
    functions: { double: (_ctx, x) => x * 2 }
  }))

  engine.addRules(`
    import host math;
    step @ a(X) ==> true | result(double(X));
  `)

  engine.assert('a', [5])
  assert.equal(engine.store.lookup('result', 1).length, 1)
  assert.equal(engine.store.lookup('result', 1)[0].args[0], 10)
})

test('registerBuiltins also registers as host module', () => {
  const engine = new CHREngine()
  engine.registerBuiltins()

  engine.addRules(`
    import host builtins;
    step @ a(X) ==> gt(X, 0) | b(X);
  `)

  engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('import host with non-existent module throws', () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.addRules(`
      import host nonexistent;
      step @ a ==> b;
    `)
  }, /Unknown host module/)
})

test('multiple import host statements accumulate', () => {
  const engine = new CHREngine()
  engine.registerHostModule('mod1', defineHostModule({ functions: { fn1: () => true } }))
  engine.registerHostModule('mod2', defineHostModule({ functions: { fn2: () => true } }))

  engine.addRules(`
    import host mod1;
    import host mod2;
    step @ a ==> fn1() | fn2();
  `)

  engine.assert('a', [])
  assert.equal(engine.store.lookup('a', 0).length, 1)
})

test('registerFunctions and registerActions batch registration', () => {
  const engine = new CHREngine()
  engine.registerFunctions({ f1: () => true, f2: () => true })
  engine.registerActions({ a1: () => {}, a2: () => {} })

  engine.addRules(`
    functions f1/0, f2/0;
    actions a1/0, a2/0;
    step @ x ==> f1() | !a1();
  `)

  engine.assert('x', [])
  assert.equal(engine.store.lookup('x', 0).length, 1)
})

test('import host with actions in body', () => {
  const engine = new CHREngine()
  const logs = []
  engine.registerHostModule('logger', defineHostModule({
    actions: { log: (ctx) => { logs.push(ctx.args[0]) } }
  }))

  engine.addRules(`
    import host logger;
    step @ a(X) ==> true | !log(X);
  `)

  engine.assert('a', ['hello'])
  assert.equal(logs.length, 1)
  assert.equal(logs[0], 'hello')
})

test('import host does not pollute global declarations for unused functions', () => {
  const engine = new CHREngine()
  engine.registerHostModule('math', defineHostModule({
    functions: { double: (_ctx, x) => x * 2, unused: (_ctx) => true }
  }))

  engine.addRules(`
    import host math;
    functions double/1;
    step @ a(X) ==> true | result(double(X));
  `)

  const warnings = engine.getWarnings()
  assert.ok(!warnings.some(w => /unused/.test(w) && /double/.test(w)))
})

test('strictHostDeclarations with imported module auto-satisfies declarations', () => {
  const engine = new CHREngine({ strictHostDeclarations: true })
  engine.registerHostModule('math', defineHostModule({
    functions: { double: (_ctx, x) => x * 2 }
  }))

  const result = engine.validate(`
    import host math;
    step @ a(X) ==> true | result(double(X));
  `)
  assert.ok(result.ok)
})

test('registerHostModule does not override existing module functions', () => {
  const engine = new CHREngine()
  const mod1 = defineHostModule({ functions: { shared: (_ctx) => 'first' } })
  const mod2 = defineHostModule({ functions: { shared: (_ctx) => 'second' } })

  engine.registerHostModule('first', mod1)
  engine.registerHostModule('second', mod2)

  engine.addRules(`
    import host first;
    import host second;
    step @ a ==> shared() | r1;
    step @ a ==> shared() | r2;
  `)

  engine.assert('a', [])
  const r1 = engine.store.lookup('r1', 0)
  const r2 = engine.store.lookup('r2', 0)
  assert.equal(r1.length, 1)
  assert.equal(r2.length, 1)
})
