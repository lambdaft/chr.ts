import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHREngine,
  ConstraintStore,
  ArgumentIndex,
  EqualityIndex,
  PropagationHistory,
  SearchState,
  RelationalEngine,
  Substitution,
  parseProgram,
  unifyTerm,
  toExpression,
  occursIn,
  createEngine
} from '../dist/index.js'

test('Audit Bug #1: ConstraintStore.add resets _invalid and maintains monotonic IDs across remove/clear/invalidate', async () => {
  const store = new ConstraintStore()
  const c1 = store.add('wave', [1])
  assert.equal(c1.id, 1)

  store.invalidate()
  assert.equal(store.invalid, true)

  const c2 = store.add('wave', [2])
  assert.equal(store.invalid, false)
  assert.equal(c2.id, 2)

  store.remove(c2.id)
  const c3 = store.add('wave', [3])
  assert.equal(c3.id, 3, 'ID must not be reused after remove()')

  store.clear()
  const c4 = store.add('wave', [4])
  assert.equal(c4.id, 4, 'ID must remain monotonic after clear()')

  // Verify propagation rules fire on newly asserted constraints after removal
  const engine = new CHREngine()
  engine.addRules(`
    consume @ trigger, item(X) <=> true;
    prop @ item(X) ==> seen(X);
  `)
  await engine.assert('item', ['first'])
  await engine.assert('trigger', [])
  assert.equal(engine.store.lookup('item', 1).length, 0)

  await engine.assert('item', ['second'])
  const seen = engine.store.lookup('seen', 1).map((r) => r.args[0])
  assert.deepEqual(seen, ['first', 'second'])
})

test('Audit Bug #2: ConstraintStore.clear and invalidate clear lookupCache', () => {
  const store = new ConstraintStore()
  store.add('pivot', [100])
  assert.equal(store.lookup('pivot', 1).length, 1)

  store.clear()
  assert.equal(store.lookup('pivot', 1).length, 0)

  store.add('pivot', [200])
  assert.equal(store.lookup('pivot', 1).length, 1)

  store.invalidate()
  assert.equal(store.lookup('pivot', 1).length, 0)
})

test('Audit Bug #3: ArgumentIndex.clear preserves registered single and composite index schemas', () => {
  const idx = new ArgumentIndex()
  idx.createSingleIndex('edge', 2, 0)
  idx.createCompositeIndex('edge', 2, [0, 1])

  const r1 = { id: 1, name: 'edge', arity: 2, args: ['A', 'B'] }
  idx.add(r1)
  assert.deepEqual(idx.lookupByArg('edge', 2, 0, 'A'), [1])
  assert.deepEqual(idx.lookupByArgs('edge', 2, [0, 1], ['A', 'B']), [1])

  idx.clear()
  assert.equal(idx.hasSingleIndex('edge', 2, 0), true)
  assert.deepEqual(idx.lookupByArg('edge', 2, 0, 'A'), [])

  const r2 = { id: 2, name: 'edge', arity: 2, args: ['A', 'B'] }
  idx.add(r2)
  assert.deepEqual(idx.lookupByArg('edge', 2, 0, 'A'), [2])
  assert.deepEqual(idx.lookupByArgs('edge', 2, [0, 1], ['A', 'B']), [2])
})

test('Audit Bug #4: EqualityIndex isolates entries per argIndex', () => {
  const eqIdx = new EqualityIndex()
  eqIdx.add({ id: 1, name: 'pair', arity: 2, args: ['X', 'Y'] })
  eqIdx.add({ id: 2, name: 'pair', arity: 2, args: ['Y', 'X'] })

  assert.deepEqual(eqIdx.lookup('pair', 2, 0, 'X'), [1])
  assert.deepEqual(eqIdx.lookup('pair', 2, 1, 'X'), [2])
  assert.deepEqual(eqIdx.lookup('pair', 2, 0, 'Y'), [2])
  assert.deepEqual(eqIdx.lookup('pair', 2, 1, 'Y'), [1])
})

test('Audit Bug #5: findMatchWithJoinPlan backtracks across join steps and preserves kept/removed head alignment', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    -- Simpagation where join planner may reorder or need backtracking
    join_simp @ keep(K, Shared) \\ rem(Shared, Val) <=> gt(Val, 10) | matched(K, Shared, Val);
  `)

  await engine.assertMany([
    { name: 'keep', args: ['K1', 'S1'] },
    { name: 'rem', args: ['S1', 5] },   // fails guard gt(Val, 10), must backtrack to next rem
    { name: 'rem', args: ['S1', 20] }   // passes guard!
  ])

  assert.equal(engine.store.lookup('keep', 2).length, 1, 'Kept head must remain in store')
  assert.equal(engine.store.lookup('rem', 2).length, 1, 'Only the matching removed head should be consumed')
  assert.equal(engine.store.lookup('rem', 2)[0].args[1], 5)
  const matched = engine.store.lookup('matched', 3)
  assert.equal(matched.length, 1)
  assert.deepEqual(matched[0].args, ['K1', 'S1', 20])
})

test('Audit Bug #6 & #7: PropagationHistory and SearchState support ordered head tuples for asymmetric rules', () => {
  const orderedHistory = new PropagationHistory({ preserveOrder: true })
  orderedHistory.add('asym', [1, 2])
  assert.equal(orderedHistory.has('asym', [1, 2]), true)
  assert.equal(orderedHistory.has('asym', [2, 1]), false, 'Ordered history must distinguish (1,2) from (2,1)')

  const state = new SearchState()
  const s1 = state.recordHistory('asym', [10, 20])
  assert.equal(s1.hasFired('asym', [10, 20]), true)
  assert.equal(s1.hasFired('asym', [20, 10]), false, 'SearchState.hasFired must preserve head tuple order')
})

test('Audit Bug #8 & #9: Runtime uppercase string values are treated as literals, not variables, in unification and stream', async () => {
  // Direct toExpression check
  const expr = toExpression('USD')
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, 'USD')

  // Unify rule with uppercase runtime string values
  const engine = new CHREngine()
  engine.addRules(`
    unify match_sym @ quote(Sym, P1), order(Sym, P2) ==> trade(Sym, P1, P2);
  `)
  await engine.assert('quote', ['BTCUSD', 65000])
  await engine.assert('order', ['ETHUSD', 3500])

  assert.equal(
    engine.store.lookup('trade', 3).length,
    0,
    'Distinct uppercase strings BTCUSD and ETHUSD must not unify as unbound variables'
  )

  await engine.assert('order', ['BTCUSD', 65000])
  assert.equal(engine.store.lookup('trade', 3).length, 1)
  assert.deepEqual(engine.store.lookup('trade', 3)[0].args, ['BTCUSD', 65000, 65000])
})

test('Audit Bug #10 & #11: Unification handles aliased variables without false-positive occurs check and detects cycles safely', () => {
  let subst = new Substitution()
  // Bind X -> Z and Y -> Z
  subst = unifyTerm({ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }, subst)
  assert.ok(subst)
  subst = unifyTerm({ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }, subst)
  assert.ok(subst)
  // Unify X and Y when both resolve to Z
  subst = unifyTerm({ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }, subst)
  assert.ok(subst)

  // Cyclic substitution should not cause stack overflow in occursIn
  const cyclic = new Substitution([
    ['A', { type: 'variable', name: 'B' }],
    ['B', { type: 'variable', name: 'A' }]
  ])
  assert.doesNotThrow(() => {
    occursIn('A', { type: 'variable', name: 'B' }, cyclic)
  })
})

test('Audit Bug #12: Parser handles escaped quotes in strings, multi-char operators in let, and := constraint updates', () => {
  const prog = parseProgram(`
    r1 @ msg("say \\"hello\\" | world") ==> ok("done");
    r2 @ val(X) ==> let B = X >= 10 | check(B);
    r3 @ counter(Id, N) ==> N < 5 | counter(Id, N) := counter(Id, N + 1);
  `)
  assert.equal(prog.rules.length, 3)
  assert.equal(prog.rules[0].kept[0].args[0].value, 'say "hello" | world')
  assert.equal(prog.rules[1].body[0].type, 'let')
  assert.equal(prog.rules[2].body[0].type, 'update')
})

test('Audit Bug #13: CHREngine.validate does not mutate engine rules, declarations, or state', () => {
  const engine = new CHREngine()
  engine.addRules('r1 @ a(X) ==> b(X);')
  const beforeRules = engine.getRules().length
  const beforeState = engine.getState()

  const res = engine.validate(`
    constraint temp/2;
    r2 @ temp(X, Y) ==> b(X);
  `)
  assert.equal(res.ok, true)
  assert.equal(engine.getRules().length, beforeRules)
  assert.equal(engine.getState(), beforeState)
})

test('Audit Bug #14: createEngine forwards all CHREngineOptions', async () => {
  const fired = []
  const engine = createEngine({
    source: 'r @ a(X), a(Y) ==> pair(X, Y);',
    maxRuleFirings: 42,
    preserveHistoryOrder: true,
    onRuleFired: (t) => fired.push(t.ruleName)
  })
  assert.equal(engine.maxRuleFirings, 42)
  assert.equal(engine.history.preserveOrder, true)
  await engine.assertMany([
    { name: 'a', args: [1] },
    { name: 'a', args: [2] }
  ])
  assert.ok(fired.length >= 2, 'Ordered propagation history allows both (1,2) and (2,1) firings')
})

test('Audit Bug #15: RecursionUnfolder composes 2^k steps and preserves base rule guards', async () => {
  const engine = new CHREngine({ enableRecursionUnfolding: true, maxUnfoldings: 3 })
  engine.registerBuiltins()
  engine.addRules(`
    countdown(N) <=> gt(N, 0) | countdown(sub(N, 1));
    countdown(0) <=> done;
  `)

  await engine.assert('countdown', [5])
  assert.equal(engine.store.lookup('done', 0).length, 1)
  assert.equal(engine.store.lookup('countdown', 1).length, 0)
})

test('Audit Bug #16: In-place constraint update (:= / ==) preserves constraint ID and RelationalEngine names unnamed rules uniquely', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRules(`
    inc @ counter(X) ==> lt(X, 2) | counter(X) := counter(add(X, 1));
  `)

  const c = await engine.assert('counter', [0])
  const remaining = engine.store.lookup('counter', 1)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].id, c.id, 'In-place update must preserve constraint ID')
  assert.equal(remaining[0].args[0], 1, 'Propagation history on preserved ID prevents infinite self-update loop')

  // RelationalEngine unnamed rules get distinct names
  const rel = new RelationalEngine()
  rel.addRules(`
    p ==> q1;
    p ==> q2;
  `)
  assert.equal(rel.rules.length, 2)
  assert.notEqual(rel.rules[0].name, rel.rules[1].name)
})
