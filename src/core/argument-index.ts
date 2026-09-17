/**
 * Argument-based indexing for CHR constraints.
 *
 * This module provides multi-level indexing on constraint arguments to enable
 * efficient lookups beyond the basic functor-based indexing. This is essential
 * for implementing indexed CHR, where constraints can be quickly located based
 * on specific argument values rather than scanning all constraints of a given
 * functor.
 *
 * The indexing strategy:
 * - Single-argument indexes: (functor, argIndex, value) → constraint IDs
 * - Composite indexes: (functor, [argIndices], [values]) → constraint IDs
 * - Selectivity tracking: maintains statistics to guide join-order optimization
 */

import type { ConstraintRecord } from './constraint.js'

/**
 * Index key for a single argument position.
 * Format: "name/arity/argIndex"
 */
type SingleArgIndexKey = string

/**
 * Index key for composite (multi-argument) indexing.
 * Format: "name/arity/argIndex1,argIndex2,..."
 */
type CompositeArgIndexKey = string

/**
 * Statistics about index usage and selectivity.
 */
export interface IndexStatistics {
  /** Number of lookups performed on this index. */
  lookups: number
  /** Number of results returned (average). */
  avgResults: number
  /** Index selectivity (0-1, lower is more selective). */
  selectivity: number
  /** Number of distinct values indexed. */
  distinctValues: number
}

/**
 * Configuration for argument indexing.
 */
export interface ArgumentIndexOptions {
  /** Maximum number of single-argument indexes per constraint. */
  maxSingleIndexes?: number
  /** Maximum number of composite indexes per constraint. */
  maxCompositeIndexes?: number
  /** Enable automatic index creation based on usage patterns. */
  autoCreateIndexes?: boolean
  /** Minimum selectivity threshold for automatic index creation. */
  minSelectivityForAutoIndex?: number
}

/**
 * A single-argument index mapping values to constraint IDs.
 */
class SingleArgumentIndex {
  private readonly valueToIds = new Map<unknown, Set<number>>()
  private stats: IndexStatistics = {
    lookups: 0,
    avgResults: 0,
    selectivity: 1.0,
    distinctValues: 0
  }

  /**
   * Add a constraint to the index.
   */
  add (id: number, value: unknown): void {
    let ids = this.valueToIds.get(value)
    if (!ids) {
      ids = new Set()
      this.valueToIds.set(value, ids)
      this.stats.distinctValues++
    }
    ids.add(id)
  }

  /**
   * Remove a constraint from the index.
   */
  remove (id: number, value: unknown): void {
    const ids = this.valueToIds.get(value)
    if (ids) {
      ids.delete(id)
      if (ids.size === 0) {
        this.valueToIds.delete(value)
        this.stats.distinctValues--
      }
    }
  }

  /**
   * Lookup constraint IDs by value.
   */
  lookup (value: unknown): number[] {
    this.stats.lookups++
    const ids = this.valueToIds.get(value)
    const result = ids ? [...ids] : []
    
    // Update average results
    this.stats.avgResults = 
      (this.stats.avgResults * (this.stats.lookups - 1) + result.length) / 
      this.stats.lookups
    
    // Update selectivity (lower is more selective)
    if (this.stats.distinctValues > 0) {
      this.stats.selectivity = result.length / this.stats.distinctValues
    }
    
    return result
  }

  /**
   * Get index statistics.
   */
  getStatistics (): IndexStatistics {
    return { ...this.stats }
  }

  /**
   * Clear the index.
   */
  clear (): void {
    this.valueToIds.clear()
    this.stats = {
      lookups: 0,
      avgResults: 0,
      selectivity: 1.0,
      distinctValues: 0
    }
  }
}

/**
 * A composite (multi-argument) index for efficient multi-column lookups.
 */
class CompositeArgumentIndex {
  private readonly keyToIds = new Map<string, Set<number>>()
  private readonly argIndices: number[]
  private stats: IndexStatistics = {
    lookups: 0,
    avgResults: 0,
    selectivity: 1.0,
    distinctValues: 0
  }

  constructor (argIndices: number[]) {
    this.argIndices = argIndices
  }

  /**
   * Generate a composite key from argument values.
   */
  private generateKey (args: unknown[]): string {
    return this.argIndices
      .map(idx => args[idx])
      .map(v => typeof v === 'object' ? JSON.stringify(v) : String(v))
      .join('|')
  }

  /**
   * Add a constraint to the composite index.
   */
  add (id: number, args: unknown[]): void {
    const key = this.generateKey(args)
    let ids = this.keyToIds.get(key)
    if (!ids) {
      ids = new Set()
      this.keyToIds.set(key, ids)
      this.stats.distinctValues++
    }
    ids.add(id)
  }

  /**
   * Remove a constraint from the composite index.
   */
  remove (id: number, args: unknown[]): void {
    const key = this.generateKey(args)
    const ids = this.keyToIds.get(key)
    if (ids) {
      ids.delete(id)
      if (ids.size === 0) {
        this.keyToIds.delete(key)
        this.stats.distinctValues--
      }
    }
  }

  /**
   * Lookup constraint IDs by argument values.
   */
  lookup (args: unknown[]): number[] {
    this.stats.lookups++
    const key = this.generateKey(args)
    const ids = this.keyToIds.get(key)
    const result = ids ? [...ids] : []
    
    // Update statistics
    this.stats.avgResults = 
      (this.stats.avgResults * (this.stats.lookups - 1) + result.length) / 
      this.stats.lookups
    
    if (this.stats.distinctValues > 0) {
      this.stats.selectivity = result.length / this.stats.distinctValues
    }
    
    return result
  }

  /**
   * Get the argument indices this index covers.
   */
  getArgIndices (): number[] {
    return [...this.argIndices]
  }

  /**
   * Get index statistics.
   */
  getStatistics (): IndexStatistics {
    return { ...this.stats }
  }

  /**
   * Clear the index.
   */
  clear (): void {
    this.keyToIds.clear()
    this.stats = {
      lookups: 0,
      avgResults: 0,
      selectivity: 1.0,
      distinctValues: 0
    }
  }
}

/**
 * Main argument index manager.
 *
 * Manages single-argument and composite indexes for constraints,
 * providing efficient lookups based on argument values.
 */
export class ArgumentIndex {
  private readonly singleIndexes = new Map<SingleArgIndexKey, SingleArgumentIndex>()
  private readonly compositeIndexes = new Map<CompositeArgIndexKey, CompositeArgumentIndex>()
  private readonly options: Required<ArgumentIndexOptions>

  constructor (options: ArgumentIndexOptions = {}) {
    this.options = {
      maxSingleIndexes: options.maxSingleIndexes ?? 5,
      maxCompositeIndexes: options.maxCompositeIndexes ?? 3,
      autoCreateIndexes: options.autoCreateIndexes ?? true,
      minSelectivityForAutoIndex: options.minSelectivityForAutoIndex ?? 0.5
    }
  }

  /**
   * Generate a single-argument index key.
   */
  private generateSingleKey (name: string, arity: number, argIndex: number): SingleArgIndexKey {
    return `${name}/${arity}/${argIndex}`
  }

  /**
   * Generate a composite index key.
   */
  private generateCompositeKey (name: string, arity: number, argIndices: number[]): CompositeArgIndexKey {
    return `${name}/${arity}/${argIndices.join(',')}`
  }

  /**
   * Ensure a single-argument index exists.
   */
  private ensureSingleIndex (name: string, arity: number, argIndex: number): SingleArgumentIndex {
    const key = this.generateSingleKey(name, arity, argIndex)
    let index = this.singleIndexes.get(key)
    if (!index) {
      index = new SingleArgumentIndex()
      this.singleIndexes.set(key, index)
    }
    return index
  }

  /**
   * Ensure a composite index exists.
   */
  private ensureCompositeIndex (name: string, arity: number, argIndices: number[]): CompositeArgumentIndex {
    const key = this.generateCompositeKey(name, arity, argIndices)
    let index = this.compositeIndexes.get(key)
    if (!index) {
      index = new CompositeArgumentIndex(argIndices)
      this.compositeIndexes.set(key, index)
    }
    return index
  }

  /**
   * Add a constraint to relevant indexes.
   */
  add (constraint: ConstraintRecord): void {
    const { name, arity, args, id } = constraint

    // Add to single-argument indexes
    for (let i = 0; i < args.length; i++) {
      const key = this.generateSingleKey(name, arity, i)
      const index = this.singleIndexes.get(key)
      if (index) {
        index.add(id, args[i])
      }
    }

    // Add to composite indexes
    for (const [key, index] of this.compositeIndexes) {
      const parts = key.split('/')
      const functor = parts.slice(0, 2).join('/')
      if (functor === `${name}/${arity}`) {
        index.add(id, args)
      }
    }
  }

  /**
   * Remove a constraint from indexes.
   */
  remove (constraint: ConstraintRecord): void {
    const { name, arity, args, id } = constraint

    // Remove from single-argument indexes
    for (let i = 0; i < args.length; i++) {
      const key = this.generateSingleKey(name, arity, i)
      const index = this.singleIndexes.get(key)
      if (index) {
        index.remove(id, args[i])
      }
    }

    // Remove from composite indexes
    for (const [key, index] of this.compositeIndexes) {
      const parts = key.split('/')
      const functor = parts.slice(0, 2).join('/')
      if (functor === `${name}/${arity}`) {
        index.remove(id, args)
      }
    }
  }

  /**
   * Lookup constraints by single argument value.
   */
  lookupByArg (name: string, arity: number, argIndex: number, value: unknown): number[] {
    const key = this.generateSingleKey(name, arity, argIndex)
    const index = this.singleIndexes.get(key)
    return index ? index.lookup(value) : []
  }

  /**
   * Lookup constraints by multiple argument values (composite index).
   */
  lookupByArgs (name: string, arity: number, argIndices: number[], values: unknown[]): number[] {
    if (argIndices.length !== values.length) {
      throw new Error(`Argument count mismatch: ${argIndices.length} indices but ${values.length} values`)
    }

    const key = this.generateCompositeKey(name, arity, argIndices)
    const index = this.compositeIndexes.get(key)
    
    if (index) {
      // Reconstruct full args array for composite lookup
      const fullArgs = new Array(arity).fill(undefined)
      for (let i = 0; i < argIndices.length; i++) {
        const idx = argIndices[i]
        if (idx !== undefined) {
          fullArgs[idx] = values[i]
        }
      }
      return index.lookup(fullArgs)
    }
    
    return []
  }

  /**
   * Create a single-argument index.
   */
  createSingleIndex (name: string, arity: number, argIndex: number): void {
    const existingForFunctor = [...this.singleIndexes.keys()]
      .filter(k => k.startsWith(`${name}/${arity}/`)).length

    if (existingForFunctor >= this.options.maxSingleIndexes) {
      throw new Error(
        `Maximum single-argument indexes (${this.options.maxSingleIndexes}) reached for ${name}/${arity}`
      )
    }

    this.ensureSingleIndex(name, arity, argIndex)
  }

  /**
   * Create a composite index.
   */
  createCompositeIndex (name: string, arity: number, argIndices: number[]): void {
    if (argIndices.length < 2) {
      throw new Error('Composite index requires at least 2 argument indices')
    }

    const existingForFunctor = [...this.compositeIndexes.keys()]
      .filter(k => k.startsWith(`${name}/${arity}/`)).length

    if (existingForFunctor >= this.options.maxCompositeIndexes) {
      throw new Error(
        `Maximum composite indexes (${this.options.maxCompositeIndexes}) reached for ${name}/${arity}`
      )
    }

    this.ensureCompositeIndex(name, arity, argIndices)
  }

  /**
   * Get statistics for a specific index.
   */
  getIndexStatistics (name: string, arity: number, argIndex?: number): IndexStatistics | null {
    if (argIndex !== undefined) {
      const key = this.generateSingleKey(name, arity, argIndex)
      const index = this.singleIndexes.get(key)
      return index ? index.getStatistics() : null
    }
    return null
  }

  /**
   * Get all index statistics.
   */
  getAllStatistics (): Map<string, IndexStatistics> {
    const result = new Map<string, IndexStatistics>()
    
    for (const [key, index] of this.singleIndexes) {
      result.set(key, index.getStatistics())
    }
    
    for (const [key, index] of this.compositeIndexes) {
      result.set(key, index.getStatistics())
    }
    
    return result
  }

  /**
   * Check if an index exists for a specific argument.
   */
  hasSingleIndex (name: string, arity: number, argIndex: number): boolean {
    const key = this.generateSingleKey(name, arity, argIndex)
    return this.singleIndexes.has(key)
  }

  /**
   * Check if a composite index exists.
   */
  hasCompositeIndex (name: string, arity: number, argIndices: number[]): boolean {
    const key = this.generateCompositeKey(name, arity, argIndices)
    return this.compositeIndexes.has(key)
  }

  /**
   * Clear all indexes.
   */
  clear (): void {
    for (const index of this.singleIndexes.values()) {
      index.clear()
    }
    for (const index of this.compositeIndexes.values()) {
      index.clear()
    }
    this.singleIndexes.clear()
    this.compositeIndexes.clear()
  }

  /**
   * Get the number of single-argument indexes.
   */
  getSingleIndexCount (): number {
    return this.singleIndexes.size
  }

  /**
   * Get the number of composite indexes.
   */
  getCompositeIndexCount (): number {
    return this.compositeIndexes.size
  }
}
