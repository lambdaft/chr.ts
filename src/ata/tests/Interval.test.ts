import test from 'node:test'
import assert from 'node:assert/strict'
import { Interval } from '../Interval.js'
import type { Relation, RelationInfo } from '../Relation.js'
import { defaultNumberComparator, findRelation, constraints, relationSets, relations } from '../Relation.js'

const compare = defaultNumberComparator

function makeInterval (start: number, end: number): Interval<number> {
  const interval = Interval.create(start, end, compare)
  if (!interval) {
    throw new Error(`Invalid interval: [${start}, ${end}]`)
  }
  return interval
}

test('every pair of intervals has exactly one Allen relation', () => {
  const intervals = [
    makeInterval(1, 3),
    makeInterval(2, 4),
    makeInterval(3, 5),
    makeInterval(5, 7),
    makeInterval(6, 8)
  ]

  for (const t of intervals) {
    for (const s of intervals) {
      const matches = Array.from(relationSets.full).filter((rel: Relation) => {
        const info = relations.find((r: RelationInfo) => r.relation === rel)
        return info ? info.test(t, s, compare) : false
      })
      assert.equal(matches.length, 1, `Expected exactly one relation between ${t.toString()} and ${s.toString()}`)
    }
  }
})

test('if a relation holds then its inverse also holds', () => {
  const intervals = [
    makeInterval(1, 3),
    makeInterval(2, 4),
    makeInterval(3, 5),
    makeInterval(5, 7),
    makeInterval(6, 8)
  ]

  for (const t of intervals) {
    for (const s of intervals) {
      const relation = findRelation(t, s, compare)
      const info = relations.find((r: RelationInfo) => r.relation === relation)
      if (!info) {
        throw new Error(`Relation not found: ${relation}`)
      }
      const inverseInfo = relations.find((r: RelationInfo) => r.relation === info.inverse)
      if (!inverseInfo) {
        throw new Error(`Inverse relation not found: ${info.inverse}`)
      }
      assert.ok(inverseInfo.test(s, t, compare), `Inverse relation ${info.inverse} should hold for ${t.toString()} and ${s.toString()}`)
    }
  }
})

test('relation inverses match the expected pairs', () => {
  const i = makeInterval(1, 3)
  const j = makeInterval(5, 7)

  assert.equal(i.before(j, compare), j.after(i, compare))
  assert.equal(i.meets(j, compare), j.metBy(i, compare))
  assert.equal(i.overlaps(j, compare), j.overlappedBy(i, compare))
  assert.equal(i.finishes(j, compare), j.finishedBy(i, compare))
  assert.equal(i.ends(j, compare), j.endedBy(i, compare))
  assert.equal(i.during(j, compare), j.contains(i, compare))
  assert.equal(i.starts(j, compare), j.startedBy(i, compare))
  assert.equal(i.encloses(j, compare), j.enclosedBy(i, compare))
})

test('abuts returns true only for meets and metBy', () => {
  const i = makeInterval(1, 3)
  const j = makeInterval(3, 5)
  const k = makeInterval(4, 6)

  assert.ok(i.abuts(j, compare))
  assert.ok(j.abuts(i, compare))
  assert.ok(!i.abuts(k, compare))
})

test('gap returns the expected interval for non-overlapping intervals', () => {
  const i = makeInterval(1, 3)
  const j = makeInterval(5, 7)

  const gap = i.gap(j, compare)
  assert.ok(gap)
  assert.deepEqual([gap.getStart(), gap.getEnd()], [3, 5])
})

test('gap returns null for overlapping intervals', () => {
  const i = makeInterval(1, 5)
  const j = makeInterval(3, 7)

  assert.equal(i.gap(j, compare), null)
})

test('intersection returns the expected interval', () => {
  const i = makeInterval(1, 5)
  const j = makeInterval(3, 7)

  const intersection = i.intersection(j, compare)
  assert.ok(intersection)
  assert.deepEqual([intersection.getStart(), intersection.getEnd()], [3, 5])
})

test('intersection returns null for disjoint intervals', () => {
  const i = makeInterval(1, 3)
  const j = makeInterval(5, 7)

  assert.equal(i.intersection(j, compare), null)
})

test('minus returns the expected intervals for overlapping intervals', () => {
  const i = makeInterval(1, 5)
  const j = makeInterval(3, 7)

  const result = i.minus(j, compare)
  assert.ok(result.length >= 1)
  const first = result[0]!
  assert.deepEqual([first.getStart(), first.getEnd()], [1, 3])
})

test('minus returns empty set when interval is enclosed by another', () => {
  const i = makeInterval(2, 4)
  const j = makeInterval(1, 5)

  assert.equal(i.minus(j, compare).length, 0)
})

test('span encloses both intervals', () => {
  const i = makeInterval(1, 5)
  const j = makeInterval(4, 8)

  const span = i.span(j, compare)
  assert.ok(span.encloses(i, compare))
  assert.ok(span.encloses(j, compare))
})

test('union returns the expected interval for overlapping intervals', () => {
  const i = makeInterval(1, 5)
  const j = makeInterval(3, 7)

  const union = i.union(j, compare)
  assert.ok(union)
  assert.deepEqual([union.getStart(), union.getEnd()], [1, 7])
})

test('union returns null for disjoint intervals', () => {
  const i = makeInterval(1, 3)
  const j = makeInterval(5, 7)

  assert.equal(i.union(j, compare), null)
})

test('after returns expected value for points', () => {
  const i = makeInterval(3, 5)

  assert.ok(i.afterPoint(1, compare))
  assert.ok(!i.afterPoint(3, compare))
  assert.ok(!i.afterPoint(4, compare))
})

test('before returns expected value for points', () => {
  const i = makeInterval(1, 3)

  assert.ok(i.beforePoint(5, compare))
  assert.ok(!i.beforePoint(3, compare))
  assert.ok(!i.beforePoint(2, compare))
})

test('chop splits an interval into two meeting intervals', () => {
  const i = makeInterval(1, 5)
  const chopped = i.chop(3, compare)

  assert.ok(chopped)
  const [left, right] = chopped
  assert.deepEqual([left.getStart(), left.getEnd()], [1, 3])
  assert.deepEqual([right.getStart(), right.getEnd()], [3, 5])
  assert.ok(left.meets(right, compare))
})

test('chop returns null for points outside the interval', () => {
  const i = makeInterval(1, 3)

  assert.equal(i.chop(0, compare), null)
  assert.equal(i.chop(3, compare), null)
})

test('contains returns expected value for points', () => {
  const i = makeInterval(1, 5)

  assert.ok(i.containsPoint(1, compare))
  assert.ok(i.containsPoint(3, compare))
  assert.ok(i.containsPoint(5, compare))
  assert.ok(!i.containsPoint(0, compare))
  assert.ok(!i.containsPoint(6, compare))
})

test('endsAt returns expected value for points', () => {
  const i = makeInterval(1, 3)

  assert.ok(i.endsAt(3, compare))
  assert.ok(!i.endsAt(1, compare))
  assert.ok(!i.endsAt(2, compare))
})

test('startsAt returns expected value for points', () => {
  const i = makeInterval(1, 3)

  assert.ok(i.startsAt(1, compare))
  assert.ok(!i.startsAt(2, compare))
  assert.ok(!i.startsAt(3, compare))
})

test('withStart returns expected interval when valid', () => {
  const i = makeInterval(1, 5)

  const result = i.withStart(0, compare)
  assert.ok(result)
  assert.deepEqual([result.getStart(), result.getEnd()], [0, 5])
})

test('withStart returns null when invalid', () => {
  const i = makeInterval(1, 5)

  assert.equal(i.withStart(6, compare), null)
})

test('withEnd returns expected interval when valid', () => {
  const i = makeInterval(1, 5)

  const result = i.withEnd(6, compare)
  assert.ok(result)
  assert.deepEqual([result.getStart(), result.getEnd()], [1, 6])
})

test('withEnd returns null when invalid', () => {
  const i = makeInterval(1, 5)

  assert.equal(i.withEnd(0, compare), null)
})

test('clamp returns expected value for points', () => {
  const i = makeInterval(1, 5)

  assert.equal(i.clamp(0, compare), 1)
  assert.equal(i.clamp(3, compare), 3)
  assert.equal(i.clamp(6, compare), 5)
})

test('constraints computes the transitive closure of two relation sets', () => {
  const result = constraints(relationSets.dur, relationSets.con)
  assert.ok(result.has('s'))
  assert.ok(result.has('d'))
  assert.ok(result.has('f'))
})
