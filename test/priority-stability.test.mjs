import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('equal priority rules fire in stable insertion order', async () => {
  const order = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      order.push(trace.ruleName)
    }
  })

  engine.addRule({ name: 'first', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'r1', args: [] } }], priority: 5 })
  engine.addRule({ name: 'second', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'r2', args: [] } }], priority: 5 })
  engine.addRule({ name: 'third', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'r3', args: [] } }], priority: 5 })

  await engine.assert('a', [])
  assert.deepEqual(order, ['first', 'second', 'third'])
})

test('negative priority is treated as lower than default zero', async () => {
  const order = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      order.push(trace.ruleName)
    }
  })

  engine.addRule({ name: 'low', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'low_r', args: [] } }], priority: -10 })
  engine.addRule({ name: 'default', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'def_r', args: [] } }] })
  engine.addRule({ name: 'high', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'high_r', args: [] } }], priority: 10 })

  await engine.assert('a', [])
  assert.deepEqual(order, ['high', 'default', 'low'])
})

test('priority works across simplification and propagation', async () => {
  const order = []
  const engine = new CHREngine({
    onRuleFired: (trace) => {
      order.push(trace.ruleName)
    }
  })

  engine.addRule({ name: 'simp_low', kind: 'simplification', kept: [], removed: [{ name: 'a', args: [] }], guard: [], body: [{ type: 'constraint', constraint: { name: 'simp_out', args: [] } }], priority: 1 })
  engine.addRule({ name: 'prop_high', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'prop_out', args: [] } }], priority: 10 })

  await engine.assert('a', [])
  assert.equal(order[0], 'prop_high')
})

test('priority field is exposed in snapshot', async () => {
  const engine = new CHREngine()
  engine.addRule({ name: 'rule', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'b', args: [] } }], priority: 42 })

  const snap = engine.snapshot()
  assert.equal(snap.rules.length, 1)
  assert.equal(snap.rules[0].priority, 42)
})

test('priority undefined when not set', () => {
  const engine = new CHREngine()
  engine.addRule({ name: 'rule', kind: 'propagation', kept: [{ name: 'a', args: [] }], removed: [], guard: [], body: [{ type: 'constraint', constraint: { name: 'b', args: [] } }] })

  const rules = engine.getRules()
  assert.equal(rules[0].priority, undefined)
})
