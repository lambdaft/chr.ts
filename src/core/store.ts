/**
 * The constraint store: the primary data structure holding all asserted constraints.
 *
 * `ConstraintStore` is a two-level index:
 * - `byId`: a `Map<number, ConstraintRecord>` keyed by auto-incrementing ID.
 *   This gives O(1) access by ID and preserves insertion order.
 * - `byFunctor`: a `Map<string, Set<number>>` keyed by `"name/arity"` functor.
 *   This gives O(1) lookup of all constraints matching a given name and arity,
 *   which is critical for the engine's rule-matching phase.
 *
 * A `lookupCache` caches the most recent functor lookup to avoid repeated
 * sorting and mapping when the same functor is queried multiple times in a
 * single fixpoint iteration. The cache is invalidated on every mutation.
 *
 * Invariants (enforced in `strict` mode):
 *   1. `nextId === 1` iff the store is empty.
 *   2. `nextId === maxId + 1` where `maxId` is the maximum ID in `byId`.
 *   3. `byFunctor` exactly mirrors `byId` (same functors, same IDs).
 *
 * Hooks: `onAdd` and `onRemove` callbacks allow external observers (e.g.
 * the engine's `PropagationHistory`) to react to store mutations without
 * coupling the store to the engine.
 */

import { ConstraintRecord, createConstraint, createFunctor } from './constraint.js'

/**
 * A lightweight snapshot entry for serialization and debugging.
 */
export interface StoreSnapshotEntry {
  id: number
  name: string
  arity: number
  args: unknown[]
}

/**
 * Hook configuration for observing store mutations.
 */
export interface ConstraintStoreHooks {
  onAdd?: (record: ConstraintRecord) => void
  onRemove?: (id: number) => void
}

/**
 * Options for constructing a `ConstraintStore`.
 */
export interface ConstraintStoreOptions {
  strict?: boolean | 'warn'
}

/**
 * The constraint store implementation.
 *
 * This class is the engine's single source of truth for constraint state.
 * All constraint insertions, removals, and lookups flow through it. It is
 * designed for:
 * - Fast insertion (amortized O(1))
 * - Fast lookup by functor (O(1) to find the set, O(N log N) to return sorted)
 * - O(1) removal by ID
 * - Observable mutations via hooks
 */
export class ConstraintStore {
  /** Auto-incrementing counter for constraint IDs. Reset to 1 when the store is empty. */
  private nextId = 1

  /** Primary index: constraint ID → record. */
  private readonly byId = new Map<number, ConstraintRecord>()

  /** Secondary index: functor (`name/arity`) → set of IDs. */
  private readonly byFunctor = new Map<string, Set<number>>()

  /** Hook callbacks for observing mutations. */
  private readonly hooks: ConstraintStoreHooks

  /** Whether the store has been invalidated (used by `invalidate()` / `invalid`). */
  private _invalid = false

  /** Strict mode: `true` throws on invariant violations, `'warn'` logs warnings, `false` ignores. */
  private readonly strict: boolean | 'warn'

  /** Cache for the most recent `lookup(name, arity)` result. Cleared on every mutation. */
  private readonly lookupCache = new Map<string, ConstraintRecord[]>()

  /**
   * Construct a new constraint store.
   *
   * @param hooks - Optional callbacks for `onAdd` and `onRemove`.
   * @param options - `strict` enables invariant checking.
   */
  constructor (hooks: ConstraintStoreHooks = {}, options: ConstraintStoreOptions = {}) {
    this.hooks = hooks
    this.strict = options.strict ?? false
    if (this.strict) this.assertInvariants()
  }

  /**
   * Add a new constraint to the store.
   *
   * Assigns a fresh auto-incrementing ID, indexes the constraint by functor,
   * fires the `onAdd` hook, invalidates the lookup cache, and checks
   * invariants (if strict mode is enabled).
   *
   * @param name - Constraint functor name.
   * @param args - Constraint arguments.
   * @param metadata - Optional user-defined metadata (not used by the engine).
   * @returns The newly created `ConstraintRecord`.
   */
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

  /** Run invariant checks in strict or warn mode. */
  private checkInvariants (): void {
    if (this.strict === 'warn') {
      try { this.assertInvariants() } catch (e) {
        console.warn(`[store] ${(e as Error).message}`)
      }
    } else if (this.strict) {
      this.assertInvariants()
    }
  }

  /**
   * Get a constraint record by ID.
   *
   * @returns The record, or `undefined` if no constraint with that ID exists.
   */
  get (id: number): ConstraintRecord | undefined {
    return this.byId.get(id)
  }

  /**
   * Check whether a constraint with the given ID exists.
   */
  has (id: number): boolean {
    return this.byId.has(id)
  }

  /**
   * Remove a constraint by ID.
   *
   * Removes the record from `byId`, removes the ID from the functor index
   * set, resets `nextId` to 1 if the store becomes empty (to avoid ID
   * overflow over long runs), fires the `onRemove` hook, and clears the
   * lookup cache.
   *
   * @returns `true` if a constraint was removed, `false` if the ID was not found.
   */
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

  /**
   * Lookup all constraints by name, ignoring arity.
   *
   * Returns results sorted by ID. This is a full scan of `byId` and is
   * slower than `lookup(name, arity)`. Prefer the arity-aware version when
   * the arity is known.
   */
  lookupByName (name: string): ConstraintRecord[] {
    const results: ConstraintRecord[] = []
    for (const [, record] of this.byId) {
      if (record.name === name) results.push(record)
    }
    return results.sort((a, b) => a.id - b.id)
  }

  /**
   * Lookup all constraints matching a given name and arity.
   *
   * Results are cached by functor. The cache is invalidated on every
   * `add` or `remove`. Results are returned sorted by ID for deterministic
   * iteration order (important for reproducible rule firing).
   *
   * @param name - Constraint functor name.
   * @param arity - Constraint arity.
   * @returns Array of matching `ConstraintRecord` objects, sorted by ID.
   */
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

  /**
   * Remove all constraints from the store and reset the ID counter.
   *
   * Does NOT fire `onRemove` hooks for individual entries (unlike repeated
   * `remove` calls). Used by `CHREngine.clear()`.
   */
  clear (): void {
    this.byId.clear()
    this.byFunctor.clear()
    this.nextId = 1
    this._invalid = false
  }

  /**
   * Mark the store as invalid and clear all data.
   *
   * Similar to `clear()` but sets `_invalid = true`. The engine uses this
   * to distinguish between an intentionally empty store and an invalid one.
   */
  invalidate (): void {
    this.byId.clear()
    this.byFunctor.clear()
    this.nextId = 1
    this._invalid = true
  }

  /** Whether the store has been invalidated. */
  get invalid (): boolean {
    return this._invalid
  }

  /** The number of constraints currently in the store. */
  size (): number {
    return this.byId.size
  }

  /** All functor names currently in the index. */
  functors (): string[] {
    return [...this.byFunctor.keys()]
  }

  /** All `(id, record)` pairs in insertion order (by ID). */
  entries (): Array<{ id: number, record: ConstraintRecord }> {
    return [...this.byId.entries()].map(([id, record]) => ({ id, record }))
  }

  /**
   * Find all constraints matching a predicate.
   *
   * The predicate receives the record, its name, and its args.
   *
   * @returns Matching records sorted by ID.
   */
  find (predicate: (record: ConstraintRecord, name: string, args: unknown[]) => boolean): ConstraintRecord[] {
    const results: ConstraintRecord[] = []
    for (const [, record] of this.byId) {
      if (predicate(record, record.name, record.args)) {
        results.push(record)
      }
    }
    return results.sort((a, b) => a.id - b.id)
  }

  /**
   * Iterate over all constraints in insertion order (by ID).
   */
  forEach (callback: (record: ConstraintRecord, id: number) => void): void {
    for (const [id, record] of this.byId) {
      callback(record, id)
    }
  }

  /**
   * Map over all constraints in insertion order (by ID).
   *
   * @returns An array of mapped values.
   */
  map<T>(callback: (record: ConstraintRecord, id: number) => T): T[] {
    const result: T[] = []
    for (const [id, record] of this.byId) {
      result.push(callback(record, id))
    }
    return result
  }

  /**
   * Return the args of the constraint with the given ID.
   *
   * @returns A copy of the args array, or an empty array if not found.
   */
  args (id: number): unknown[] {
    return [...(this.byId.get(id)?.args ?? [])]
  }

  /**
   * Check whether all given IDs still exist in the store.
   */
  allAlive (ids: number[]): boolean {
    return ids.every((id) => this.byId.has(id))
  }

  /**
   * Take a snapshot of the store's current contents.
   *
   * Returns an array of `StoreSnapshotEntry` objects sorted by ID. The
   * returned objects are shallow copies; mutations to them do not affect
   * the store.
   */
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

  /**
   * Alias for `snapshot()`. Provided for JSON serialization compatibility.
   */
  toJSON (): StoreSnapshotEntry[] {
    return this.snapshot()
  }

  /**
   * Return a human-readable string of the store's contents.
   *
   * Format:
   *   ID  Constraint
   *   --  ----------
   *    1  edge(1, 2)
   *    2  node(3)
   */
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

  /**
   * Assert store invariants. Only called in strict mode.
   *
   * Invariants:
   * 1. Empty store → `nextId === 1`.
   * 2. `nextId === maxId + 1`.
   * 3. `byFunctor` exactly mirrors `byId` (no orphaned functors, no missing IDs).
   */
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
