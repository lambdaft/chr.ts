export type Comparator<T> = (a: T, b: T) => number

export class Interval<T> {
  private readonly start: T
  private readonly end: T

  private constructor (start: T, end: T) {
    this.start = start
    this.end = end
  }

  static create<T> (start: T, end: T, compare: Comparator<T>): Interval<T> | null {
    if (compare(start, end) < 0) {
      return new Interval(start, end)
    }
    return null
  }

  getStart (): T {
    return this.start
  }

  getEnd (): T {
    return this.end
  }

  before (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.end, other.start) < 0
  }

  precedes (other: Interval<T>, compare: Comparator<T>): boolean {
    return this.before(other, compare)
  }

  meets (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.end, other.start) === 0
  }

  overlaps (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.start, other.start) < 0 &&
      compare(this.end, other.start) > 0 &&
      compare(this.end, other.end) < 0
  }

  finishedBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.finishes(this, compare)
  }

  endedBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.finishes(this, compare)
  }

  contains (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.during(this, compare)
  }

  starts (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.start, other.start) === 0 && compare(this.end, other.end) < 0
  }

  startedBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.starts(this, compare)
  }

  during (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.start, other.start) > 0 && compare(this.end, other.end) < 0
  }

  finishes (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.start, other.start) > 0 && compare(this.end, other.end) === 0
  }

  ends (other: Interval<T>, compare: Comparator<T>): boolean {
    return this.finishes(other, compare)
  }

  overlappedBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.overlaps(this, compare)
  }

  metBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.meets(this, compare)
  }

  after (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.before(this, compare)
  }

  precededBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.before(this, compare)
  }

  abuts (other: Interval<T>, compare: Comparator<T>): boolean {
    return this.meets(other, compare) || this.metBy(other, compare)
  }

  encloses (other: Interval<T>, compare: Comparator<T>): boolean {
    return other.during(this, compare) ||
      this.equals(other, compare) ||
      this.startedBy(other, compare) ||
      this.finishedBy(other, compare)
  }

  enclosedBy (other: Interval<T>, compare: Comparator<T>): boolean {
    return this.during(other, compare) ||
      this.equals(other, compare) ||
      this.starts(other, compare) ||
      this.finishes(other, compare)
  }

  gap (other: Interval<T>, compare: Comparator<T>): Interval<T> | null {
    if (this.before(other, compare) || this.after(other, compare)) {
      return Interval.create(
        compare(this.end, other.end) <= 0 ? this.end : other.end,
        compare(this.start, other.start) >= 0 ? this.start : other.start,
        compare
      )
    }
    return null
  }

  intersection (other: Interval<T>, compare: Comparator<T>): Interval<T> | null {
    if (
      !(this.before(other, compare) ||
        this.abuts(other, compare) ||
        this.after(other, compare))
    ) {
      return Interval.create(
        compare(this.start, other.start) >= 0 ? this.start : other.start,
        compare(this.end, other.end) <= 0 ? this.end : other.end,
        compare
      )
    }
    return null
  }

  span (other: Interval<T>, compare: Comparator<T>): Interval<T> {
    const minStart = compare(this.start, other.start) <= 0 ? this.start : other.start
    const maxEnd = compare(this.end, other.end) >= 0 ? this.end : other.end
    return new Interval(minStart, maxEnd)
  }

  minus (other: Interval<T>, compare: Comparator<T>): Interval<T>[] {
    if (this.enclosedBy(other, compare)) {
      return []
    } else if (this.overlaps(other, compare) || this.finishedBy(other, compare)) {
      return [new Interval(this.start, other.start)]
    } else if (this.overlappedBy(other, compare) || this.startedBy(other, compare)) {
      return [new Interval(other.end, this.end)]
    } else if (this.during(other, compare)) {
      return [
        new Interval(this.start, other.start),
        new Interval(other.end, this.end)
      ]
    } else {
      return [this]
    }
  }

  union (other: Interval<T>, compare: Comparator<T>): Interval<T> | null {
    if (!(this.before(other, compare) || this.after(other, compare))) {
      const minStart = compare(this.start, other.start) <= 0 ? this.start : other.start
      const maxEnd = compare(this.end, other.end) >= 0 ? this.end : other.end
      return new Interval(minStart, maxEnd)
    }
    return null
  }

  afterPoint (point: T, compare: Comparator<T>): boolean {
    return compare(point, this.start) < 0
  }

  beforePoint (point: T, compare: Comparator<T>): boolean {
    return compare(this.end, point) < 0
  }

  chop (point: T, compare: Comparator<T>): [Interval<T>, Interval<T>] | null {
    if (compare(this.start, point) < 0 && compare(this.end, point) > 0) {
      return [new Interval(this.start, point), new Interval(point, this.end)]
    }
    return null
  }

  containsPoint (point: T, compare: Comparator<T>): boolean {
    return compare(this.start, point) <= 0 && compare(this.end, point) >= 0
  }

  endsAt (point: T, compare: Comparator<T>): boolean {
    return compare(this.end, point) === 0
  }

  startsAt (point: T, compare: Comparator<T>): boolean {
    return compare(this.start, point) === 0
  }

  withStart (point: T, compare: Comparator<T>): Interval<T> | null {
    return Interval.create(point, this.end, compare)
  }

  withEnd (point: T, compare: Comparator<T>): Interval<T> | null {
    return Interval.create(this.start, point, compare)
  }

  clamp (point: T, compare: Comparator<T>): T {
    if (compare(point, this.start) < 0) {
      return this.start
    } else if (compare(point, this.end) > 0) {
      return this.end
    }
    return point
  }

  equals (other: Interval<T>, compare: Comparator<T>): boolean {
    return compare(this.start, other.start) === 0 && compare(this.end, other.end) === 0
  }

  toString (): string {
    return `[${this.start}, ${this.end}]`
  }
}
