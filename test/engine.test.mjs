import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine, defineHostModule } from '../dist/index.js'
import { parseProgram } from '../dist/index.js'

test('propagation generates fibonacci facts', async () => {
  const engine = new CHREngine()
  engine.addRules(`
    fib_step @ upto(Max), fib(A, AV), fib(B, BV) ==> B === A + 1, B < Max | fib(B + 1, AV + BV);
  `)

  await engine.assertMany([
    { name: 'upto', args: [5] },
    { name: 'fib', args: [1, 1] },
    { name: 'fib', args: [2, 1] }
  ])

  const fibs = engine.store.lookup('fib', 2).map((entry) => entry.args)
  assert.deepEqual(fibs, [[1, 1], [2, 1], [3, 2], [4, 3], [5, 5]])
})

test('simplification removes consumed fact and emits replacement fact', async () => {
  const engine = new CHREngine()
  engine.addRules(`
    finish @ done(X) <=> X === 0 | finished;
  `)

  await engine.assert('done', [0])

  assert.equal(engine.store.lookup('done', 1).length, 0)
  assert.equal(engine.store.lookup('finished', 0).length, 1)
})

test('simpagation keeps kept head and removes removed head', async () => {
  const engine = new CHREngine()
  engine.addRules(`
    retain_anchor @ anchor(X) \\ token(X) <=> mark(X);
  `)

  await engine.assertMany([
    { name: 'anchor', args: [1] },
    { name: 'token', args: [1] }
  ])

  assert.equal(engine.store.lookup('anchor', 1).length, 1)
  assert.equal(engine.store.lookup('token', 1).length, 0)
  assert.equal(engine.store.lookup('mark', 1).length, 1)
})

test('registered host functions and actions participate in execution', async () => {
  const engine = new CHREngine()
  const events = []

  engine.registerFunction('positive', (_ctx, value) => Number(value) > 0)
  engine.registerAction('record', ({ args }) => {
    events.push(args[0])
  })

  engine.addRules(`
    approve @ input(X) ==> positive(X) | !record(X), approved(X);
  `)

  await engine.assert('input', [7])

  assert.deepEqual(events, [7])
  assert.equal(engine.store.lookup('approved', 1).length, 1)
})

test('registerHost allows unified function and action registration', async () => {
  const seen = []
  const engine = new CHREngine()

  engine.registerHost({
    functions: {
      positive: (_ctx, value) => Number(value) > 0
    },
    actions: {
      record: ({ args }) => {
        seen.push(args[0])
      }
    }
  })

  engine.addRules('approve @ input(X) ==> positive(X) | !record(X), approved(X);')
  await engine.assert('input', [11])

  assert.deepEqual(seen, [11])
  assert.equal(engine.store.lookup('approved', 1).length, 1)
})

test('defineHostModule returns a host module usable by registerHost', async () => {
  const seen = []
  const engine = new CHREngine()
  const host = defineHostModule({
    functions: {
      positive: (_ctx, value) => Number(value) > 0
    },
    actions: {
      record: ({ args }) => {
        seen.push(args[0])
      }
    }
  })

  engine.registerHost(host)
  engine.addRules('approve @ input(X) ==> positive(X) | !record(X), approved(X);')
  await engine.assert('input', [21])

  assert.deepEqual(seen, [21])
  assert.equal(engine.store.lookup('approved', 1).length, 1)
})

test('declared arity is enforced for asserted and emitted constraints', async () => {
  const engine = new CHREngine()
  engine.declareConstraints({
    input: 1,
    approved: 1
  })
  engine.addRules('approve @ input(X) ==> approved(X);')

  await engine.assert('input', [1])
  assert.equal(engine.store.lookup('approved', 1).length, 1)

  await assert.rejects(async () => {
    await engine.assert('input', [1, 2])
  }, /violates declared arity/)
})

test('source-level constraint declarations are applied before rules', async () => {
  const engine = new CHREngine()
  engine.addRules(`
    constraints seed/1, next/1;
    step @ seed(X) <=> next(X);
  `)

  await engine.assert('seed', [3])
  assert.equal(engine.store.lookup('next', 1).length, 1)

  await assert.rejects(async () => {
    await engine.assert('seed', [1, 2])
  }, /violates declared arity/)
})

test('source-level function and action declarations support .chr host calls', async () => {
  const seen = []
  const engine = new CHREngine()
  engine.registerHost({
    functions: {
      positive: (_ctx, value) => Number(value) > 0
    },
    actions: {
      record: ({ args }) => {
        seen.push(args[0])
      }
    }
  })

  engine.addRules(`
    functions positive/1;
    actions record/1;
    approve @ input(X) ==> positive(X) | !record(X), approved(X);
  `)

  await engine.assert('input', [13])

  assert.deepEqual(seen, [13])
  assert.equal(engine.store.lookup('approved', 1).length, 1)
})

test('declared host functions can be used inside emitted constraint expressions', async () => {
  const engine = new CHREngine()
  engine.registerFunction('inc', (_ctx, value) => Number(value) + 1)
  engine.addRules(`
    functions inc/1;
    bump @ input(X) ==> output(inc(X));
  `)

  await engine.assert('input', [3])

  assert.deepEqual(engine.store.lookup('output', 1)[0].args, [4])
})

test('undeclared host function in source is rejected when declarations are present', () => {
  const engine = new CHREngine()

  assert.throws(() => {
    engine.addRules(`
      functions positive/1;
      bad @ input(X) ==> missing(X) | approved(X);
    `)
  }, /not declared in source/)
})

test('host action declaration arity is enforced', () => {
  const engine = new CHREngine()

  assert.throws(() => {
    engine.addRules(`
      actions record/1;
      bad @ input(X) ==> true | !record(X, X);
    `)
  }, /violates declared arity/)
})

test('registered host function arity is checked against declarations', () => {
  const engine = new CHREngine()
  engine.addRules('functions positive/1; ok @ input(X) ==> positive(X) | approved(X);')

  assert.throws(() => {
    engine.registerFunction('positive', (_ctx) => true)
  }, /violates declared arity/)
})

test('parser reports statement-level errors for invalid declarations', () => {
  try {
    parseProgram(`
      constraints bad;
      ok @ a <=> b;
    `)
    assert.fail('expected parse error')
  } catch (error) {
    assert.match(error.message, /top-level statement at line 1|top-level statement at line 2/)
    assert.ok(error.span)
    assert.equal(typeof error.span.start.line, 'number')
  }
})

test('rule fire tracing reports matched ids and bindings', async () => {
  const traces = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      traces.push(trace)
    }
  })

  engine.addRules('step @ seed(X) <=> next(X);')

  await engine.assert('seed', [3])

  assert.equal(traces.length, 1)
  assert.equal(traces[0].ruleName, 'step')
  assert.equal(traces[0].bindings.X, 3)
  assert.deepEqual(traces[0].matchedConstraintIds, [1])
})

test('execution errors preserve rule span when host function is missing', async () => {
  const engine = new CHREngine({ strictHostDeclarations: false })
  engine.addRules('broken @ input(X) ==> ok(missing(X));')

  await assert.rejects(async () => {
    await engine.assert('input', [1])
  }, (error) => {
    assert.match(error.message, /Unknown host function: missing/)
    assert.ok(error.span)
    assert.equal(error.span.start.line, 1)
    return true
  })
})

test('addProgram loads declarations and rules together', async () => {
  const engine = new CHREngine()
  const program = parseProgram(`
    constraint seed/1;
    step @ seed(X) <=> next(X);
  `)

  engine.addProgram(program)
  await engine.assert('seed', [9])

  assert.equal(engine.store.lookup('next', 1).length, 1)
})

test('getRules returns named rules in registration order', () => {
  const engine = new CHREngine()
  engine.addRules(`
    first @ a ==> b;
    second @ b <=> c;
  `)

  assert.deepEqual(engine.getRules().map((rule) => rule.name), ['first', 'second'])
})

test('ensureRulesLoaded throws when no rules are present', () => {
  const engine = new CHREngine()
  assert.throws(() => engine.ensureRulesLoaded(), /No rules have been loaded/)
})

test('clear resets store and propagation history', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ seed(X) ==> grown(X);')
  await engine.assert('seed', [1])

  engine.clear()

  assert.equal(engine.store.size(), 0)
  assert.deepEqual(engine.history.snapshot(), {})
})

test('snapshot returns rules, constraints and history', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ seed(X) ==> grown(X);')
  await engine.assert('seed', [2])

  const snapshot = engine.snapshot()
  assert.equal(snapshot.rules.length, 1)
  assert.equal(snapshot.constraints.length, 2)
  assert.ok(snapshot.history.step)
})

test('registerFunctions supports multiple handlers at once', async () => {
  const engine = new CHREngine()
  engine.registerFunctions({
    positive: (_ctx, value) => Number(value) > 0,
    even: (_ctx, value) => Number(value) % 2 === 0
  })
  engine.addRules('gate @ input(X) ==> positive(X), even(X) | passed(X);')

  await engine.assert('input', [4])
  assert.equal(engine.store.lookup('passed', 1).length, 1)
})

test('registerActions supports multiple handlers at once', async () => {
  const seen = []
  const engine = new CHREngine()
  engine.registerFunctions({ ok: () => true })
  engine.registerActions({
    recordA: ({ args }) => { seen.push(['A', ...args]) },
    recordB: ({ args }) => { seen.push(['B', ...args]) }
  })
  engine.addRules('act @ input(X) ==> ok() | !recordA(X), !recordB(X);')

  await engine.assert('input', [5])
  assert.deepEqual(seen, [['A', 5], ['B', 5]])
})

test('maxRuleFirings guards against runaway propagation', async () => {
  const engine = new CHREngine({ maxRuleFirings: 3 })
  engine.addRules('loop @ spin(X) ==> spin(X + 1);')

  await assert.rejects(async () => {
    await engine.assert('spin', [0])
  }, /Maximum rule firings exceeded/)
})

test('infix binary operators work in guards and bodies', async () => {
  const engine = new CHREngine()
  engine.registerFunctions({
    positive: (_ctx, v) => Number(v) > 0,
    nonNegative: (_ctx, v) => Number(v) >= 0,
    isEven: (_ctx, v) => Number(v) % 2 === 0,
    isOdd: (_ctx, v) => Number(v) % 2 !== 0
  })

  engine.addRules(`
    arith @ calc(X) ==> X + 1 * 2 > 0, X * 3 < 10, X / 2 >= 0 | result(X);
  `)

  await engine.assert('calc', [3])
  assert.equal(engine.store.lookup('result', 1).length, 1)
})

test('logical operator && works in guards', async () => {
  const engine = new CHREngine()
  engine.registerFunctions({
    positive: (_ctx, v) => Number(v) > 0
  })

  engine.addRules(`
    logic @ data(A, B) ==> positive(A) && A > 0 | ok;
  `)

  await engine.assert('data', [5, 3])
  assert.equal(engine.store.lookup('ok', 0).length, 1)
})

test('getRulesByHead finds rules referencing a constraint name', () => {
  const engine = new CHREngine()
  engine.addRules(`
    r1 @ a(X) ==> b(X);
    r2 @ b(X) ==> c(X);
    r3 @ a(X), c(X) ==> d(X);
  `)
  const forA = engine.getRulesByHead('a')
  const forB = engine.getRulesByHead('b')
  const forC = engine.getRulesByHead('c')
  assert.equal(forA.length, 2)
  assert.equal(forB.length, 1)
  assert.equal(forC.length, 1)
})

test('printStore returns formatted store content', async () => {
  const engine = new CHREngine()
  engine.addRules('id @ a(X) ==> b(X);')
  await engine.assert('a', [1])
  const output = engine.printStore()
  assert.match(output, /a/)
  assert.match(output, /b/)
})

test('printRules returns formatted rule listing', () => {
  const engine = new CHREngine()
  engine.addRules('r1 @ a(X) ==> b(X); r2 @ b(X) ==> c(X);')
  const output = engine.printRules()
  assert.match(output, /r1/)
  assert.match(output, /r2/)
  assert.match(output, /propagation/)
})

test('printHistory returns formatted history', async () => {
  const engine = new CHREngine()
  engine.addRules('r1 @ a(X) ==> b(X);')
  await engine.assert('a', [1])
  const output = engine.printHistory()
  assert.match(output, /r1/)
})

test('assertMany returns added count', async () => {
  const engine = new CHREngine()
  engine.addRules('id @ a(X) ==> b(X);')
  const result = await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] }
  ])
  assert.deepEqual(result, { added: 2 })
})

test('per-assertion maxRuleFirings overrides engine default', async () => {
  const engine = new CHREngine({ maxRuleFirings: 10000 })
  engine.addRules('loop @ spin(X) ==> spin(X + 1);')

  await assert.rejects(async () => {
    await engine.assert('spin', [0], { maxRuleFirings: 3 })
  }, /Maximum rule firings exceeded/)
})

test('store.find filters constraints by predicate', async () => {
  const engine = new CHREngine()
  engine.addRules('id @ a(X) ==> b(X);')
  await engine.assert('a', [42])

  const found = engine.store.find((record, name) => name === 'a')
  assert.equal(found.length, 1)
  assert.equal(found[0].args[0], 42)
})

test('parse error includes source line and caret', () => {
  assert.throws(() => {
    parseProgram('bad rule without operator;')
  }, (err) => {
    assert.match(err.message, /\^/)
    return true
  })
})
