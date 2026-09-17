import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RelationalEngine,
  SearchState,
  startGoal,
  takeSolutions,
  formatSolution,
  disjunctionStream,
  solutionStream,
  emptyStream
} from '../dist/index.js'

test('chrKanren: disjunctive branching (CHR-vee)', () => {
  const engine = new RelationalEngine()
  engine.addRules(`
    flip @ coin(X) <=> X == heads | X == tails;
  `)

  const solutions = engine.run(null, ['X'], 'coin(X)')
  assert.equal(solutions.length, 2)
  const values = solutions.map(s => s.X)
  assert.ok(values.includes('heads'))
  assert.ok(values.includes('tails'))
})

test('chrKanren: multi-step disjunction search', () => {
  const engine = new RelationalEngine()
  engine.addRules(`
    choose_num @ choose(X) <=> X == 1 | X == 2 | X == 3;
    filter_even @ even(X), choose(X) ==> X === 2 | fail;
  `)

  const solutions = engine.run(null, ['X'], 'choose(X)')
  assert.equal(solutions.length, 3)
  assert.deepEqual(solutions.map(s => s.X).sort(), [1, 2, 3])
})

test('chrKanren: semantic equality & set unification', () => {
  const engine = new RelationalEngine()
  engine.addRules(`
    pair_eq @ pair(A, B) == pair(C, D) <=> A == C, B == D;
    set_eq @ set(A, B) == set(C, D) <=> (A == C, B == D) | (A == D, B == C);
  `)

  const sol1 = engine.run(null, ['X', 'Y'], 'pair(1, 2) == pair(X, Y)')
  assert.equal(sol1.length, 1)
  assert.equal(sol1[0].X, 1)
  assert.equal(sol1[0].Y, 2)

  // Set commutativity branch exploration
  const sol2 = engine.run(null, ['X', 'Y'], 'set(1, 2) == set(X, Y)')
  assert.equal(sol2.length, 2)
  assert.deepEqual(sol2[0], { X: 1, Y: 2 })
  assert.deepEqual(sol2[1], { X: 2, Y: 1 })
})

test('chrKanren: finite failure on impossible sub-goals (early pruning)', () => {
  const engine = new RelationalEngine()
  engine.addRules(`
    // Constraint-driven evaluator decomposing pair evaluation
    eval_cons @ eval_pair(Lhs, Rhs, Lval, Rval) <=> eval(Lhs, Lval), eval(Rhs, Rval);
    eval_lit @ eval(X, Y) <=> X == Y;
  `)

  // Asking for pair evaluation where rhs=2 must evaluate to 3 (impossible -> finite failure)
  const solutions = engine.run(null, ['Q'], 'eval_pair(Q, 2, 1, 3)')
  assert.equal(solutions.length, 0, 'Must exhibit finite failure without diverging')
})

test('chrKanren: lazy solution streaming generator', () => {
  const engine = new RelationalEngine()
  engine.addRules(`
    choices @ pick(X) <=> X == a | X == b | X == c;
  `)

  const generator = engine.streamSolutions(['X'], 'pick(X)')
  const results = []
  for (const sol of generator) {
    results.push(sol.X)
  }

  assert.deepEqual(results.sort(), ['a', 'b', 'c'])
})

test('chrKanren: CHREngine integration (runRelational and streamSolutions)', async () => {
  const { CHREngine } = await import('../dist/index.js')
  const engine = new CHREngine()
  engine.addRules(`
    color_choice @ color(C) <=> C == red | C == green | C == blue;
  `)

  const solutions = engine.runRelational(2, ['C'], 'color(C)')
  assert.equal(solutions.length, 2)
  assert.equal(solutions[0].C, 'red')
  assert.equal(solutions[1].C, 'green')

  const streamed = []
  for (const s of engine.streamSolutions(['C'], 'color(C)')) {
    streamed.push(s.C)
  }
  assert.deepEqual(streamed, ['red', 'green', 'blue'])
})

test('chrKanren: relational typechecker rules with finite failure', async () => {
  const { readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const chrRules = readFileSync(join(__dirname, '../examples/relational/relational_typecheck.chr'), 'utf-8')

  const engine = new RelationalEngine()
  engine.loadProgram(chrRules)

  // Success case
  const qSuccess = "has_type('x', 'int'), has_type('y', 'int'), plus('x', 'y', 'z'), has_type('z', T)"
  const res1 = engine.run(1, ['T'], qSuccess)
  assert.equal(res1.length, 1)
  assert.equal(res1[0].T, 'int')

  // Type mismatch failure
  const qFail = "has_type('f', arrow('int', 'bool')), has_type('arg', 'string'), app('f', 'arg', 'res')"
  const resFail = engine.run(1, [], qFail)
  assert.equal(resFail.length, 0)
})
