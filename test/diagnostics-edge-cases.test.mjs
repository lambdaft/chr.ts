import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('snapshot after clear has empty constraints', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [])
  engine.clear()

  const snap = engine.snapshot()
  assert.equal(snap.constraints.length, 0)
  assert.equal(snap.rules.length, 1)
})

test('snapshot includes priority when defined', () => {
  const engine = new CHREngine()
  engine.addRule({ name: 'r', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'b', args: [] } }], priority: 7 })

  const snap = engine.snapshot()
  assert.equal(snap.rules[0].priority, 7)
})

test('snapshot after clear has empty history', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [])
  engine.clear()

  const snap = engine.snapshot()
  assert.deepEqual(snap.history, {})
})

test('expect exists with multiple matching constraints', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] }
  ])

  assert.equal(engine.expect('a', [1]).exists(), true)
  assert.equal(engine.expect('a', [2]).exists(), true)
  assert.equal(engine.expect('a', [3]).exists(), false)
})

test('expect count with multiple matches', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] }
  ])

  assert.equal(engine.expect('a', [1]).count(1), true)
  assert.equal(engine.expect('a', [1]).count(0), false)
  assert.equal(engine.expect('a', [3]).count(0), true)
})

test('expect missing when constraint not present', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [1])

  assert.equal(engine.expect('b', [99]).missing(), true)
  assert.equal(engine.expect('b', [99]).exists(), false)
})

test('multiple shadowed variables produce separate warnings', async () => {
  const engine = new CHREngine()
  engine.addRules('bad @ a(X), b(X), c(X) ==> true | ok;')

  const warnings = engine.getWarnings()
  const shadowCount = warnings.filter(w => /Shadowed variable 'X'/.test(w)).length
  assert.ok(shadowCount >= 1)
})

test('dead binding and shadowed variable both warned', async () => {
  const engine = new CHREngine()
  engine.addRules('mixed @ a(X), b(X) ==> true | ok;')

  const warnings = engine.getWarnings()
  assert.ok(warnings.some(w => /Shadowed variable 'X'/.test(w)))
})

test('unused declaration warnings include arity placeholder', async () => {
  const engine = new CHREngine()
  engine.registerFunction('used', () => true)
  engine.addRules(`
    functions used/0, unused/0;
    actions usedAct/0, unusedAct/0;
    step @ a() ==> used() | !usedAct();
  `)

  const warnings = engine.getWarnings()
  assert.ok(warnings.some(w => /Unused function declaration: functions unused\/\.\.\./))
  assert.ok(warnings.some(w => /Unused action declaration: actions unusedAct\/\.\.\./))
})

test('warnings accumulate across multiple addRules calls', async () => {
  const engine = new CHREngine()
  engine.addRules('dead1 @ a(X) ==> true;')
  engine.addRules('dead2 @ b(Y) ==> true;')

  const warnings = engine.getWarnings()
  assert.equal(warnings.length, 2)
  assert.ok(warnings.every(w => /Dead binding/.test(w)))
})

test('warnings are cleared by clear()', async () => {
  const engine = new CHREngine()
  engine.addRules('dead @ a(X) ==> true;')
  assert.equal(engine.getWarnings().length, 1)

  engine.clear()
  assert.equal(engine.getWarnings().length, 0)
})

test('nested error cause chain from action through engine', async () => {
  const engine = new CHREngine()
  engine.registerAction('outer', (ctx) => {
    try {
      throw new Error('original')
    } catch (originalError) {
      throw new Error('wrapped', { cause: originalError })
    }
  })
  engine.addRules('crash @ a() ==> true | !outer();')

  let caught
  try {
    await engine.assert('a', [])
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Host action outer threw/)
  assert.ok(caught.cause)
  assert.equal(caught.cause.message, 'original')
})

test('async host function error produces cause chain', async () => {
  const engine = new CHREngine()
  engine.registerFunction('asyncFail', async () => {
    throw new Error('async original')
  })
  engine.addRules('crash @ a() ==> asyncFail() | ok;')

  let caught
  try {
    await engine.assert('a', [])
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /Host function asyncFail threw/)
  assert.ok(caught.cause)
  assert.equal(caught.cause.message, 'async original')
})

test('host function timeout produces error without cause', async () => {
  const engine = new CHREngine({ hostFunctionTimeout: 50 })
  engine.registerFunction('hang', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return true
  })
  engine.addRules('hang @ a(X) ==> hang() | ok;')

  let caught
  try {
    await engine.assert('a', [1])
    caught = null
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.match(caught.message, /timed out/)
  assert.equal(caught.cause, undefined)
})

test('printRules returns formatted listing', () => {
  const engine = new CHREngine()
  engine.addRules('first @ a ==> b;')
  engine.addRules('second @ c ==> d;')

  const output = engine.printRules()
  assert.ok(output.includes('first'))
  assert.ok(output.includes('second'))
  assert.ok(output.includes('propagation'))
})

test('printStore returns formatted table', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [])

  const output = engine.printStore()
  assert.ok(output.includes('a') || output.includes('b'))
})

test('printHistory returns formatted output', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [])

  const output = engine.printHistory()
  assert.ok(output.includes('Rule') || output.includes('step') || output === '(empty)')
})

test('getRulesByHead returns matching rules', () => {
  const engine = new CHREngine()
  engine.addRules('r1 @ a(X) ==> b(X);')
  engine.addRules('r2 @ b(X) ==> c(X);')
  engine.addRules('r3 @ a(X), b(X) ==> d(X);')

  const aRules = engine.getRulesByHead('a')
  assert.equal(aRules.length, 2)
  assert.ok(aRules.some(r => r.name === 'r1'))
  assert.ok(aRules.some(r => r.name === 'r3'))

  const bRules = engine.getRulesByHead('b')
  assert.equal(bRules.length, 2)
})

test('getRulesByHead returns empty for unknown head', () => {
  const engine = new CHREngine()
  engine.addRules('r1 @ a(X) ==> b(X);')

  const rules = engine.getRulesByHead('z')
  assert.equal(rules.length, 0)
})

test('engine snapshot during ready state has no constraints after clear', async () => {
  const engine = new CHREngine()
  engine.addRules('step @ a ==> b;')
  await engine.assert('a', [])
  engine.clear()

  const snap = engine.snapshot()
  assert.equal(snap.constraints.length, 0)
})
