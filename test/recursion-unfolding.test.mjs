import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('recursion unfolding: simple linear recursion with base case', async () => {
  const engine = new CHREngine({ enableRecursionUnfolding: true, maxUnfoldings: 4 })
  engine.addRules(`
    base @ p(0) <=> true;
    rec @ p(N) ==> gt(N, 0) | p(sub(N, 1));
  `)
  await engine.assert('p(3)')
  const store = engine.store.snapshot()
  assert.equal(store.filter(c => c.name === 'p').length, 0, 'all p/1 constraints should be removed by base case')
})

test('recursion unfolding: does not inject when disabled', () => {
  const engine = new CHREngine({ enableRecursionUnfolding: false })
  engine.addRules(`
    base @ p(0) <=> true;
    rec @ p(N) ==> gt(N, 0) | p(sub(N, 1));
  `)
  const allRules = engine.getRules()
  const unfolded = allRules.filter(r => (r.name ?? '').includes('_unfold_'))
  assert.equal(unfolded.length, 0, 'no unfolded rules should be injected when disabled')
})
