import test from 'node:test'
import assert from 'node:assert/strict'
import { ConstraintStore } from '../dist/index.js'

test('store functors returns empty array for empty store', () => {
  const store = new ConstraintStore()
  assert.deepEqual(store.functors(), [])
})

test('store functors returns all constraint functors', () => {
  const store = new ConstraintStore()
  store.add('fib', [1, 1])
  store.add('fib', [2, 1])
  store.add('done', [])

  assert.deepEqual(store.functors().sort(), ['done/0', 'fib/2'])
})

test('store functors updates after removal', () => {
  const store = new ConstraintStore()
  store.add('fib', [1, 1])
  store.add('done', [])
  store.remove(store.add('temp', [7]).id)

  assert.deepEqual(store.functors().sort(), ['done/0', 'fib/2'])
})

test('store entries returns objects with id and record', () => {
  const store = new ConstraintStore()
  const a = store.add('a', [1])
  const b = store.add('b', [2])

  const entries = store.entries()
  assert.equal(entries.length, 2)
  assert.equal(entries[0].id, a.id)
  assert.equal(entries[0].record.name, 'a')
  assert.equal(entries[1].id, b.id)
  assert.equal(entries[1].record.name, 'b')
})

test('store entries preserves insertion order', () => {
  const store = new ConstraintStore()
  const second = store.add('b', [2])
  const first = store.add('a', [1])

  const ids = store.entries().map((e) => e.id)
  assert.deepEqual(ids, [second.id, first.id])
})

test('store forEach invokes callback for each constraint', () => {
  const store = new ConstraintStore()
  const a = store.add('a', [1])
  const b = store.add('b', [2])

  const seen = []
  store.forEach((record, id) => {
    seen.push({ id, name: record.name })
  })

  assert.deepEqual(seen, [
    { id: a.id, name: 'a' },
    { id: b.id, name: 'b' }
  ])
})

test('store forEach skips empty store', () => {
  const store = new ConstraintStore()
  let calls = 0
  store.forEach(() => { calls++ })
  assert.equal(calls, 0)
})

test('store map transforms each constraint', () => {
  const store = new ConstraintStore()
  store.add('fib', [1, 1])
  store.add('fib', [2, 1])

  const names = store.map((record) => record.name)
  assert.deepEqual(names, ['fib', 'fib'])
})

test('store map preserves order and allows any return type', () => {
  const store = new ConstraintStore()
  const a = store.add('a', [1])
  const b = store.add('b', [2])

  const sums = store.map((_record, id) => id + 10)
  assert.deepEqual(sums, [a.id + 10, b.id + 10])
})

test('store map returns empty array for empty store', () => {
  const store = new ConstraintStore()
  assert.deepEqual(store.map((r) => r.name), [])
})

test('store args returns args array for existing id', () => {
  const store = new ConstraintStore()
  const record = store.add('pair', [1, 2])

  assert.deepEqual(store.args(record.id), [1, 2])
})

test('store args returns empty array for unknown id', () => {
  const store = new ConstraintStore()
  store.add('pair', [1, 2])

  assert.deepEqual(store.args(999), [])
})

test('store args does not expose internal mutation', () => {
  const store = new ConstraintStore()
  const record = store.add('pair', [1, 2])
  const args = store.args(record.id)
  args.push(3)

  assert.deepEqual(record.args, [1, 2])
})

test('store allAlive returns true when all ids exist', () => {
  const store = new ConstraintStore()
  const a = store.add('a', [1])
  const b = store.add('b', [2])

  assert.equal(store.allAlive([a.id, b.id]), true)
})

test('store allAlive returns true for empty id list', () => {
  const store = new ConstraintStore()
  store.add('a', [1])

  assert.equal(store.allAlive([]), true)
})

test('store allAlive returns false when any id is missing', () => {
  const store = new ConstraintStore()
  const a = store.add('a', [1])

  assert.equal(store.allAlive([a.id, 999]), false)
})

test('store allAlive returns false after removal', () => {
  const store = new ConstraintStore()
  const a = store.add('a', [1])
  store.remove(a.id)

  assert.equal(store.allAlive([a.id]), false)
})

test('store toJSON returns snapshot equivalent', () => {
  const store = new ConstraintStore()
  store.add('b', [])
  store.add('a', [1])

  const json = store.toJSON()
  const snapshot = store.snapshot()

  assert.deepEqual(json, snapshot)
})

test('store invalidate clears constraints and sets invalid flag', () => {
  const store = new ConstraintStore()
  store.add('a', [1])
  store.add('b', [2])

  store.invalidate()

  assert.equal(store.size(), 0)
  assert.equal(store.invalid, true)
  assert.equal(store.functors().length, 0)
})

test('store clear resets invalid flag to false', () => {
  const store = new ConstraintStore()
  store.add('a', [1])
  store.invalidate()
  store.clear()

  assert.equal(store.invalid, false)
  assert.equal(store.size(), 0)
})

test('store invalid flag is false by default', () => {
  const store = new ConstraintStore()
  assert.equal(store.invalid, false)
})

test('store invalid flag remains false after normal operations', () => {
  const store = new ConstraintStore()
  store.add('a', [1])
  store.remove(1)

  assert.equal(store.invalid, false)
})
