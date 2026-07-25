import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'
import { readFileSync, unlink, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CHR_PATH = join(process.cwd(), 'test-temp-rules.chr')

test('engine load reads and parses chr file', () => {
  writeFileSync(TEST_CHR_PATH, 'constraint a/1;\nstep @ a ==> b;')
  const engine = new CHREngine()
  engine.load(TEST_CHR_PATH)
  assert.equal(engine.getRules().length, 1)
  assert.equal(engine.getState(), 'ready')
})

test('engine load missing file throws ENOENT', () => {
  const engine = new CHREngine()
  assert.throws(() => {
    engine.load('nonexistent-file-xyz.chr')
  }, /ENOENT|not found/i)
})

test('engine load with declarations and rules', () => {
  writeFileSync(TEST_CHR_PATH, `
    constraint a/1, b/1;
    functions double/1;
    actions log/1;
    step @ a(X) ==> double(X) | !log(X), b(X);
  `)
  const engine = new CHREngine()
  engine.registerFunction('double', (_ctx, x) => x * 2)
  engine.registerAction('log', () => {})
  engine.load(TEST_CHR_PATH)

  assert.equal(engine.getRules().length, 1)
})

test('engine load with multiple rules', () => {
  writeFileSync(TEST_CHR_PATH, `
    r1 @ a ==> b;
    r2 @ b ==> c;
    r3 @ c ==> d;
  `)
  const engine = new CHREngine()
  engine.load(TEST_CHR_PATH)
  assert.equal(engine.getRules().length, 3)
})

test('engine load with unification rules', () => {
  writeFileSync(TEST_CHR_PATH, `
    unify link @ edge(X, Y), edge(Y, Z) ==> path(X, Z);
  `)
  const engine = new CHREngine()
  engine.load(TEST_CHR_PATH)

  const rules = engine.getRules()
  assert.equal(rules.length, 1)
  assert.equal(rules[0].unify, true)
})

test('engine load with host import', () => {
  const { BuiltinsModule } = require('../dist/index.js')
  writeFileSync(TEST_CHR_PATH, `
    import host builtins;
    step @ a(X) ==> gt(X, 0) | b(X);
  `)
  const engine = new CHREngine()
  engine.registerHostModule('builtins', BuiltinsModule)
  engine.load(TEST_CHR_PATH)

  engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('engine load with import host builtins directly', () => {
  const { BuiltinsModule } = require('../dist/index.js')
  writeFileSync(TEST_CHR_PATH, `
    import host builtins;
    step @ a(X) ==> gt(X, 0) | b(X);
  `)
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.load(TEST_CHR_PATH)

  engine.assert('a', [5])
  assert.equal(engine.store.lookup('b', 1).length, 1)
})

test('engine load file with comments', () => {
  writeFileSync(TEST_CHR_PATH, `
    -- load test
    constraint a/1;
    -- rule below
    step @ a ==> b;
  `)
  const engine = new CHREngine()
  engine.load(TEST_CHR_PATH)
  assert.equal(engine.getRules().length, 1)
})

test('engine load file with string literals', () => {
  writeFileSync(TEST_CHR_PATH, `
    constraint msg/1;
    step @ a ==> msg("hello from file");
  `)
  const engine = new CHREngine()
  engine.load(TEST_CHR_PATH)
  assert.equal(engine.getRules().length, 1)
})

test('engine load overwrites previous rules', () => {
  writeFileSync(TEST_CHR_PATH, 'r_new @ x ==> y;')
  const engine = new CHREngine()
  engine.addRules('r_old @ a ==> b;')
  engine.load(TEST_CHR_PATH)

  assert.equal(engine.getRules().length, 2)
})

test('engine load throws on parse error in file', () => {
  writeFileSync(TEST_CHR_PATH, 'bad rule here ==>')
  const engine = new CHREngine()
  assert.throws(() => {
    engine.load(TEST_CHR_PATH)
  }, /parse error/i)
})

test('engine load file with strictHostDeclarations and undeclared call', () => {
  writeFileSync(TEST_CHR_PATH, `
    step @ a ==> missing() | ok;
  `)
  const engine = new CHREngine({ strictHostDeclarations: true })
  assert.throws(() => {
    engine.load(TEST_CHR_PATH)
  }, /not declared/)
})

test.teardown(() => {
  try {
    unlink(TEST_CHR_PATH)
  } catch {
    // ignore cleanup errors
  }
})
