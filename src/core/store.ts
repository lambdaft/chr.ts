import { ConstraintRecord, createConstraint, createFunctor } from './constraint.js'

export interface StoreSnapshotEntry {
  id: number
  name: string
  arity: number
  args: unknown[]
}

export interface ConstraintStoreHooks {
  onAdd?: (record: ConstraintRecord) => void
  onRemove?: (id: number) => void
}

export interface ConstraintStoreOptions {
  strict?: boolean | 'warn'
}

export class ConstraintStore {
  private nextId = 1
  private readonly byId = new Map<number, ConstraintRecord>()
  private readonly byFunctor = new Map<string, Set<number>>()
  private readonly hooks: ConstraintStoreHooks
  private _invalid = false
  private readonly strict: boolean | 'warn'
  private readonly lookupCache = new Map<string, ConstraintRecord[]>()

  constructor (hooks: ConstraintStoreHooks = {}, options: ConstraintStoreOptions = {}) {
    this.hooks = hooks
    this.strict = options.strict ?? false
    if (this.strict) this.assertInvariants()
  }

  add (name: string, args: unknown[], metadata?: Record<string, unknown>): ConstraintRecord {
    const record = createConstraint(this.nextId++, name, args, metadata)
    this.byId.set(record.id, record)

    const functor = createFunctor(name, args.length)
    const ids = this.byFunctor.get(functor) ?? new Set<number>()
    ids.add(record.id)
    this.byFunctor.set(functor, ids)

    this.hooks.onAdd?.(record)

    this.lookupCache.clear()

    this.checkInvariants()

    return record
  }

  private checkInvariants (): void {
    if (this.strict === 'warn') {
      try { this.assertInvariants() } catch (e) {
        console.warn(`[store] ${(e as Error).message}`)
      }
    } else if (this.strict) {
      this.assertInvariants()
    }
  }

  get (id: number): ConstraintRecord | undefined {
    return this.byId.get(id)
  }

  has (id: number): boolean {
    return this.byId.has(id)
  }

  remove (id: number): boolean {
    const record = this.byId.get(id)
    if (!record) {
      return false
    }

    this.byId.delete(id)
    const functor = createFunctor(record.name, record.arity)
    const ids = this.byFunctor.get(functor)
    ids?.delete(id)
    if (ids && ids.size === 0) {
      this.byFunctor.delete(functor)
    }

    if (this.byId.size === 0) {
      this.nextId = 1
    }

    this.lookupCache.clear()

    this.hooks.onRemove?.(id)

    this.checkInvariants()

    return true
  }

  lookupByName (name: string): ConstraintRecord[] {
    const results: ConstraintRecord[] = []
    for (const [, record] of this.byId) {
      if (record.name === name) results.push(record)
    }
    return results.sort((a, b) => a.id - b.id)
  }

  lookup (name: string, arity: number): ConstraintRecord[] {
    const functor = createFunctor(name, arity)
    const cached = this.lookupCache.get(functor)
    if (cached !== undefined) {
      return cached
    }

    const ids = this.byFunctor.get(functor)
    if (!ids) {
      this.lookupCache.set(functor, [])
      return []
    }

    const result = [...ids]
      .sort((left, right) => left - right)
      .map((id) => this.byId.get(id))
      .filter((entry): entry is ConstraintRecord => Boolean(entry))

    this.lookupCache.set(functor, result)
    return result
  }

  clear (): void {
    this.byId.clear()
    this.byFunctor.clear()
    this.nextId = 1
    this._invalid = false
  }

  invalidate (): void {
    this.byId.clear()
    this.byFunctor.clear()
    this.nextId = 1
    this._invalid = true
  }

  get invalid (): boolean {
    return this._invalid
  }

  size (): number {
    return this.byId.size
  }

  functors (): string[] {
    return [...this.byFunctor.keys()]
  }

  entries (): Array<{ id: number, record: ConstraintRecord }> {
    return [...this.byId.entries()].map(([id, record]) => ({ id, record }))
  }

  find (predicate: (record: ConstraintRecord, name: string, args: unknown[]) => boolean): ConstraintRecord[] {
    const results: ConstraintRecord[] = []
    for (const [, record] of this.byId) {
      if (predicate(record, record.name, record.args)) {
        results.push(record)
      }
    }
    return results.sort((a, b) => a.id - b.id)
  }

  forEach (callback: (record: ConstraintRecord, id: number) => void): void {
    for (const [id, record] of this.byId) {
      callback(record, id)
    }
  }

  map<T>(callback: (record: ConstraintRecord, id: number) => T): T[] {
    const result: T[] = []
    for (const [id, record] of this.byId) {
      result.push(callback(record, id))
    }
    return result
  }

  args (id: number): unknown[] {
    return [...(this.byId.get(id)?.args ?? [])]
  }

  allAlive (ids: number[]): boolean {
    return ids.every((id) => this.byId.has(id))
  }

  snapshot (): StoreSnapshotEntry[] {
    return [...this.byId.values()]
      .sort((left, right) => left.id - right.id)
      .map((record) => ({
        id: record.id,
        name: record.name,
        arity: record.arity,
        args: [...record.args]
      }))
  }

  toJSON (): StoreSnapshotEntry[] {
    return this.snapshot()
  }

  toString (): string {
    if (this.size() === 0) {
      return '(empty)'
    }

    const rows = this.snapshot().map((entry) => {
      const id = String(entry.id).padStart(2)
      const value = entry.arity === 0 ? entry.name : `${entry.name}(${entry.args.join(',')})`
      return `${id}   ${value}`
    })

    return ['ID  Constraint', '--  ----------', ...rows].join('\n')
  }

  private assertInvariants (): void {
    if (this.byId.size === 0) {
      if (this.nextId !== 1) {
        throw new Error('Store invariant violated: empty store but nextId is not 1')
      }
      return
    }

    let maxId = 0
    for (const id of this.byId.keys()) {
      if (id > maxId) maxId = id
    }

    if (this.nextId !== maxId + 1) {
      throw new Error(`Store invariant violated: nextId ${this.nextId} should be maxId+1=${maxId + 1}`)
    }

    const byName: Record<string, Set<number>> = {}
    for (const [id, record] of this.byId) {
      const functor = createFunctor(record.name, record.arity)
      if (!byName[functor]) byName[functor] = new Set()
      byName[functor].add(id)
    }

    for (const [functor, indexedIds] of this.byFunctor) {
      const expected = byName[functor]
      if (!expected) {
        throw new Error(`Store invariant violated: functor ${functor} in index but not in byId`)
      }
      if (indexedIds.size !== expected.size || ![...indexedIds].every((id) => expected.has(id))) {
        throw new Error(`Store invariant violated: index mismatch for functor ${functor}`)
      }
    }

    for (const functor of Object.keys(byName)) {
      if (!this.byFunctor.has(functor)) {
        throw new Error(`Store invariant violated: functor ${functor} in byName but not in index`)
      }
    }
  }
}
