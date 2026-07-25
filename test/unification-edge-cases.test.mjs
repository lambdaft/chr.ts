import test from 'node:test'
import assert from 'node:assert/strict'
import { CHREngine } from '../dist/index.js'

test('unification occurs check prevents infinite substitution cycle', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'cycle',
    kind: 'propagation',
    unify: true,
    kept: [{ name: 'link', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] }],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'link', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'X' }] } }
    ]
  })

  await engine.assert('link', [1, 2])
  const records = engine.store.lookup('link', 2)
  assert.equal(records.length, 1)
})

test('unification with conflicting bindings fails match', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'conflict',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] },
    { name: 'edge', args: [1, 4] },
    { name: 'edge', args: [4, 5] }
  ])

  const paths = engine.store.lookup('path', 2)
  assert.equal(paths.length, 2)
  assert.ok(paths.some(p => p.args[0] === 1 && p.args[1] === 3))
  assert.ok(paths.some(p => p.args[0] === 1 && p.args[1] === 5))
})

test('unification with literal heads that unify', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'literal',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'const', args: [{ type: 'literal', value: 'same' }, { type: 'variable', name: 'X' }] },
      { name: 'const', args: [{ type: 'literal', value: 'same' }, { type: 'variable', name: 'Y' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'matched', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'const', args: ['same', 1] },
    { name: 'const', args: ['same', 2] }
  ])

  assert.equal(engine.store.lookup('matched', 2).length, 1)
})

test('unification with literal heads that do not unify', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'literal-fail',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'const', args: [{ type: 'literal', value: 'a' }, { type: 'variable', name: 'X' }] },
      { name: 'const', args: [{ type: 'literal', value: 'b' }, { type: 'variable', name: 'Y' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'matched', args: [] } }
    ]
  })

  await engine.assertMany([
    { name: 'const', args: ['a', 1] },
    { name: 'const', args: ['b', 2] }
  ])

  assert.equal(engine.store.lookup('matched', 0).length, 0)
})

test('unification in simplification removes both heads', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'simplify',
    kind: 'simplification',
    unify: true,
    kept: [],
    removed: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] }
  ])

  assert.equal(engine.store.lookup('edge', 2).length, 0)
  assert.equal(engine.store.lookup('path', 2).length, 1)
})

test('unification in simpagation keeps left head and removes right', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'simp',
    kind: 'simpagation',
    unify: true,
    kept: [{ name: 'keep', args: [{ type: 'variable', name: 'X' }] }],
    removed: [{ name: 'remove', args: [{ type: 'variable', name: 'X' }] }],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'result', args: [{ type: 'variable', name: 'X' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'keep', args: [1] },
    { name: 'remove', args: [1] }
  ])

  assert.equal(engine.store.lookup('keep', 1).length, 1)
  assert.equal(engine.store.lookup('remove', 1).length, 0)
  assert.equal(engine.store.lookup('result', 1).length, 1)
})

test('unification propagation respects history', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'hist',
    kind: 'propagation',
    unify: true,
    kept: [{ name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] }],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] } }
    ]
  })

  await engine.assert('edge', [1, 2])
  assert.equal(engine.store.lookup('path', 2).length, 1)

  engine.clear()
  await engine.assert('edge', [1, 2])
  assert.equal(engine.store.lookup('path', 2).length, 1)
})

test('unification with guards using unified bindings', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRule({
    name: 'guard',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [{ type: 'call', callee: 'gt', args: [{ type: 'variable', name: 'Z' }, { type: 'literal', value: 0 }] }],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, -3] }
  ])

  assert.equal(engine.store.lookup('path', 2).length, 0)
})

test('unification with anonymous _ does not bind underscore', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'anon',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'link', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: '_' }] },
      { name: 'link', args: [{ type: 'variable', name: '_' }, { type: 'variable', name: 'Y' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'link', args: [1, 'any'] },
    { name: 'link', args: ['other', 2] }
  ])

  assert.equal(engine.store.lookup('path', 2).length, 0)
})

test('strict and unify rules coexist in same engine', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'strict',
    kind: 'propagation',
    kept: [{ name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] }],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'strict_path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] } }
    ]
  })
  engine.addRule({
    name: 'unify',
    kind: 'propagation',
    unify: true,
    kept: [{ name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] }],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'unify_path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] }
  ])

  assert.equal(engine.store.lookup('strict_path', 2).length, 1)
  assert.equal(engine.store.lookup('unify_path', 2).length, 2)
})

test('unification source syntax produces unify: true', () => {
  const engine = new CHREngine()
  engine.addRules('unify link @ edge(X, Y), edge(Y, Z) ==> path(X, Z);')

  const rules = engine.getRules()
  assert.equal(rules.length, 1)
  assert.equal(rules[0].unify, true)
  assert.equal(rules[0].name, 'link')
})

test('unification with body actions', async () => {
  const engine = new CHREngine()
  const actions = []
  engine.registerAction('log', (ctx) => {
    actions.push([...ctx.bindings])
  })
  engine.addRule({
    name: 'action',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'action', name: 'log', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] }
  ])

  assert.equal(actions.length, 1)
  assert.deepEqual(actions[0], { X: 1, Y: 2, Z: 3 })
})

test('unification does not fire on already-fired pair', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'once',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] }
  ])

  assert.equal(engine.store.lookup('path', 2).length, 1)

  await engine.assert('edge', [1, 2])
  assert.equal(engine.store.lookup('path', 2).length, 1)
})

test('unification with three-way chain', async () => {
  const engine = new CHREngine()
  engine.addRule({
    name: 'chain',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] },
    { name: 'edge', args: [3, 4] }
  ])

  const paths = engine.store.lookup('path', 2)
  assert.equal(paths.length, 3)
  assert.ok(paths.some(p => p.args[0] === 1 && p.args[1] === 3))
  assert.ok(paths.some(p => p.args[0] === 2 && p.args[1] === 4))
  assert.ok(paths.some(p => p.args[0] === 1 && p.args[1] === 4))
})

test('unification with let binding in body', async () => {
  const engine = new CHREngine()
  engine.registerBuiltins()
  engine.addRule({
    name: 'let-rule',
    kind: 'propagation',
    unify: true,
    kept: [
      { name: 'edge', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Y' }] },
      { name: 'edge', args: [{ type: 'variable', name: 'Y' }, { type: 'variable', name: 'Z' }] }
    ],
    removed: [],
    guard: [],
    body: [
      { type: 'let', name: 'sum', expr: { type: 'call', callee: 'add', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }] } },
      { type: 'constraint', constraint: { name: 'path', args: [{ type: 'variable', name: 'X' }, { type: 'variable', name: 'Z' }, { type: 'variable', name: 'sum' }] } }
    ]
  })

  await engine.assertMany([
    { name: 'edge', args: [1, 2] },
    { name: 'edge', args: [2, 3] }
  ])

  assert.equal(engine.store.lookup('path', 3).length, 1)
  assert.equal(engine.store.lookup('path', 3)[0].args[2], 4)
})
