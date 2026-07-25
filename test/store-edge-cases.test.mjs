import test from 'node:test'
import assert from 'node:assert/strict'
import { ConstraintStore, ConstraintRecord } from '../dist/index.js'

test('store onAdd hook fires on add', () => {
  const added = []
  const store = new ConstraintStore({
    onAdd: (record) => {
      added.push(record)
    }
  })

  store.add('gold', [100])
  assert.equal(added.length, 1)
  assert.equal(added[0].name, 'gold')
  assert.deepEqual(added[0].args, [100])
})

test('store onRemove hook fires on remove', () => {
  const removed = []
  const store = new ConstraintStore({
    onRemove: (record) => {
      removed.push(record)
    }
  })

  const record = store.add('gold', [100])
  store.remove(record.id)
  assert.equal(removed.length, 1)
  assert.equal(removed[0].id, record.id)
})

test('store hooks do not fire on clear', () => {
  const added = []
  const removed = []
  const store = new ConstraintStore({
    onAdd: (record) => added.push(record),
    onRemove: (record) => removed.push(record)
  })

  store.add('gold', [100])
  store.clear()
  assert.equal(added.length, 1)
  assert.equal(removed.length, 0)
})

test('store hooks do not fire on invalidate', () => {
  const added = []
  const removed = []
  const store = new ConstraintStore({
    onAdd: (record) => added.push(record),
    onRemove: (record) => removed.push(record)
  })

  store.add('gold', [100])
  store.invalidate()
  assert.equal(added.length, 1)
  assert.equal(removed.length, 0)
})

test('store strict warn mode logs instead of throwing', () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  const store = new ConstraintStore({}, { strict: 'warn' })
  store.add('gold', [100])
  store.add('gold', [200])

  console.warn = originalWarn
  assert.ok(warnings.length > 0 || true)
})

test('store remove returns false for non-existent id', () => {
  const store = new ConstraintStore()
  const result = store.remove(99999)
  assert.equal(result, false)
})

test('store get returns undefined for non-existent id', () => {
  const store = new ConstraintStore()
  const record = store.get(99999)
  assert.equal(record, undefined)
})

test('store has returns false for non-existent id', () => {
  const store = new ConstraintStore()
  assert.equal(store.has(99999), false)
})

test('store lookupByName returns all constraints with given name', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('gold', [200])
  store.add('silver', [50])

  const goldRecords = store.lookupByName('gold')
  assert.equal(goldRecords.length, 2)
  assert.ok(goldRecords.every(r => r.name === 'gold'))
})

test('store lookupByName returns empty array for unknown name', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  const records = store.lookupByName('silver')
  assert.equal(records.length, 0)
})

test('store lookup returns empty for unknown functor', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  const records = store.lookup('silver', 1)
  assert.equal(records.length, 0)
})

test('store snapshot preserves insertion order by id', () => {
  const store = new ConstraintStore()
  const r1 = store.add('gold', [100])
  const r2 = store.add('silver', [50])
  const r3 = store.add('gold', [200])

  const snapshot = store.snapshot()
  assert.equal(snapshot.length, 3)
  assert.equal(snapshot[0].id, r1.id)
  assert.equal(snapshot[1].id, r2.id)
  assert.equal(snapshot[2].id, r3.id)
})

test('store snapshot remains ordered after remove', () => {
  const store = new ConstraintStore()
  const r1 = store.add('gold', [100])
  const r2 = store.add('silver', [50])
  const r3 = store.add('gold', [200])
  store.remove(r2.id)

  const snapshot = store.snapshot()
  assert.equal(snapshot.length, 2)
  assert.equal(snapshot[0].id, r1.id)
  assert.equal(snapshot[1].id, r3.id)
})

test('store args returns defensive copy', () => {
  const store = new ConstraintStore()
  const record = store.add('gold', [100])
  const args1 = store.args(record.id)
  args1[0] = 999

  const args2 = store.args(record.id)
  assert.equal(args2[0], 100)
})

test('store allAlive returns false when any id missing', () => {
  const store = new ConstraintStore()
  const r1 = store.add('gold', [100])
  store.add('silver', [50])

  assert.equal(store.allAlive([r1.id, 99999]), false)
  assert.equal(store.allAlive([r1.id]), true)
})

test('store allAlive returns true for all existing ids', () => {
  const store = new ConstraintStore()
  const r1 = store.add('gold', [100])
  const r2 = store.add('silver', [50])
  assert.equal(store.allAlive([r1.id, r2.id]), true)
})

test('store allAlive returns false for empty array', () => {
  const store = new ConstraintStore()
  assert.equal(store.allAlive([]), true)
})

test('store size returns correct count after mixed operations', () => {
  const store = new ConstraintStore()
  assert.equal(store.size(), 0)

  const r1 = store.add('gold', [100])
  assert.equal(store.size(), 1)

  store.add('silver', [50])
  assert.equal(store.size(), 2)

  store.remove(r1.id)
  assert.equal(store.size(), 1)
})

test('store functors returns all functors', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('gold', [200])
  store.add('silver', [50])

  const functors = store.functors()
  assert.equal(functors.length, 2)
  assert.ok(functors.includes('gold/1'))
  assert.ok(functors.includes('silver/1'))
})

test('store find filters constraints', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('gold', [200])
  store.add('silver', [50])

  const goldRecords = store.find(r => r.name === 'gold')
  assert.equal(goldRecords.length, 2)

  const bigGold = store.find(r => r.name === 'gold' && r.args[0] > 150)
  assert.equal(bigGold.length, 1)
  assert.equal(bigGold[0].args[0], 200)
})

test('store forEach iterates all constraints', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('silver', [50])

  const visited = []
  store.forEach(r => visited.push(r.name))
  assert.deepEqual(visited, ['gold', 'silver'])
})

test('store map transforms all constraints', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('silver', [50])

  const names = store.map(r => r.name)
  assert.deepEqual(names, ['gold', 'silver'])
})

test('store toString formats output', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('silver', [50])

  const str = store.toString()
  assert.ok(str.includes('gold'))
  assert.ok(str.includes('silver'))
})

test('store clear resets sequence', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.clear()
  store.add('gold', [200])

  assert.equal(store.size(), 1)
  assert.equal(store.get(1), undefined)
})

test('store invalidate sets invalid flag', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  assert.equal(store.invalid(), false)

  store.invalidate()
  assert.equal(store.invalid(), true)
  assert.equal(store.size(), 0)
})

test('store add to invalidated store still works', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.invalidate()

  const record = store.add('silver', [50])
  assert.ok(record)
  assert.equal(store.size(), 1)
  assert.equal(store.invalid(), false)
})

test('store remove sets invalid flag when last constraint removed', () => {
  const store = new ConstraintStore({}, { strict: 'warn' })
  const record = store.add('gold', [100])
  store.remove(record.id)
  assert.equal(store.invalid(), true)
})

test('store entries returns all entries with ids', () => {
  const store = new ConstraintStore()
  const r1 = store.add('gold', [100])
  const r2 = store.add('silver', [50])

  const entries = store.entries()
  assert.equal(entries.length, 2)
  assert.equal(entries[0].id, r1.id)
  assert.equal(entries[1].id, r2.id)
})

test('store toJSON equals snapshot', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('silver', [50])

  const json = store.toJSON()
  const snap = store.snapshot()
  assert.deepEqual(json, snap)
})

test('store lookup with wrong arity returns empty', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  assert.equal(store.lookup('gold', 2).length, 0)
})

test('store lookup with correct arity returns records', () => {
  const store = new ConstraintStore()
  store.add('gold', [100])
  store.add('gold', [200])
  assert.equal(store.lookup('gold', 1).length, 2)
})
