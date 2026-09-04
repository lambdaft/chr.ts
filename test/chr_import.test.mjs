import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('import chr module from in-memory registry', async () => {
  const engine = new CHREngine()
  engine.registerChrModule('common.chr', `
    constraints num/1, double/1;
    calc @ num(X) ==> double(X * 2);
  `)

  engine.addRules(`
    import chr "common.chr";
    constraints input/1;
    feed @ input(X) ==> num(X);
  `)

  await engine.assert('input', [5])
  const results = engine.store.lookup('double', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].args[0], 10)
})

test('import chr module with custom resolver', async () => {
  const engine = new CHREngine()
  const modules = new Map([
    ['schema.chr', 'constraints a/1, b/1;'],
    ['logic.chr', 'import "schema.chr"; rule1 @ a(X) ==> b(X + 1);']
  ])

  engine.setChrModuleResolver((path) => modules.get(path))
  engine.addRules(`
    import chr "logic.chr";
  `)

  await engine.assert('a', [10])
  const results = engine.store.lookup('b', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].args[0], 11)
})

test('import chr circular dependency detection', async () => {
  const engine = new CHREngine()
  engine.registerChrModule('modA.chr', 'import chr "modB.chr"; constraints a/1;')
  engine.registerChrModule('modB.chr', 'import chr "modA.chr"; constraints b/1;')

  // Should succeed without infinite loop due to visited set
  engine.addRules('import chr "modA.chr";')
  await engine.assert('a', [1])
  assert.equal(engine.store.lookup('a', 1).length, 1)
})

test('import chr unknown module throws error', async () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.addRules('import chr "missing.chr"; constraints a/1;')
  }, /Cannot resolve CHR module import/)
})
