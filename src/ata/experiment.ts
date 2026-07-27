import { Interval } from './Interval.js'
import { findRelation, defaultNumberComparator, constraints, relationSets } from './Relation.js'

const compare = defaultNumberComparator

const a: Interval<number> = Interval.create(1, 5, compare)!
const b: Interval<number> = Interval.create(3, 8, compare)!
const c: Interval<number> = Interval.create(5, 5, compare)!

if (a && b) {
  console.log(findRelation(a, b, compare))

  console.log(a.intersection(b, compare)?.toString())
  console.log(a.union(b, compare)?.toString())
  console.log(a.minus(b, compare).map((i: Interval<number>) => i.toString()))
  console.log(b.minus(a, compare).map((i: Interval<number>) => i.toString()))
}

if (a && c) {
  console.log(findRelation(a, c, compare))
  console.log(a.intersection(c, compare)?.toString())
}

console.log(constraints(relationSets.dur, relationSets.con).toString())
