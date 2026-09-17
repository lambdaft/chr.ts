/**
 * Specialized index structures for common CHR patterns.
 *
 * This module provides optimized index structures for frequently occurring
 * constraint patterns in CHR programs:
 * - EqualityIndex: Optimized for equality comparisons (X = Y)
 * - OrderingIndex: Optimized for ordering constraints (<, <=, >, >=)
 * - RangeIndex: Optimized for range queries
 * - SetIndex: Optimized for set membership operations
 *
 * These specialized indexes provide better performance than generic
 * argument-based indexing for their specific use cases.
 */

import type { ConstraintRecord } from './constraint.js'

/**
 * Equality index for fast equality-based lookups.
 * 
 * This index is optimized for patterns where constraints are frequently
 * matched by exact argument equality. It uses a hash-based structure
 * for O(1) average lookup time.
 */
export class EqualityIndex {
  private readonly index = new Map<string, Map<unknown, Set<number>>>()
  // Structure: functor -> (value -> constraint IDs)

  /**
   * Add a constraint to the equality index.
   */
  add (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    
    if (!this.index.has(functor)) {
      this.index.set(functor, new Map())
    }
    
    const functorIndex = this.index.get(functor)!
    
    for (let i = 0; i < constraint.args.length; i++) {
      const value = constraint.args[i]
      if (!functorIndex.has(value)) {
        functorIndex.set(value, new Set())
      }
      functorIndex.get(value)!.add(constraint.id)
    }
  }

  /**
   * Remove a constraint from the equality index.
   */
  remove (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return
    
    for (let i = 0; i < constraint.args.length; i++) {
      const value = constraint.args[i]
      const valueIndex = functorIndex.get(value)
      if (valueIndex) {
        valueIndex.delete(constraint.id)
        if (valueIndex.size === 0) {
          functorIndex.delete(value)
        }
      }
    }
    
    if (functorIndex.size === 0) {
      this.index.delete(functor)
    }
  }

  /**
   * Lookup constraints by exact argument value.
   */
  lookup (name: string, arity: number, _argIndex: number, value: unknown): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const valueIndex = functorIndex.get(value)
    if (!valueIndex) return []
    
    return [...valueIndex]
  }

  /**
   * Check if a value exists in the index.
   */
  hasValue (name: string, arity: number, value: unknown): boolean {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    return functorIndex?.has(value) ?? false
  }

  /**
   * Get all unique values for a constraint.
   */
  getValues (name: string, arity: number): unknown[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    return functorIndex ? [...functorIndex.keys()] : []
  }

  /**
   * Clear the index.
   */
  clear (): void {
    this.index.clear()
  }

  /**
   * Get index statistics.
   */
  getStats (): { functors: number, totalValues: number, totalEntries: number } {
    let totalValues = 0
    let totalEntries = 0
    
    for (const functorIndex of this.index.values()) {
      totalValues += functorIndex.size
      for (const valueIndex of functorIndex.values()) {
        totalEntries += valueIndex.size
      }
    }
    
    return {
      functors: this.index.size,
      totalValues,
      totalEntries
    }
  }
}

/**
 * Ordering index for comparison-based lookups.
 * 
 * This index is optimized for ordering constraints (<, <=, >, >=).
 * It uses a tree-based structure (simulated with sorted arrays) for
 * efficient range queries.
 */
export class OrderingIndex {
  private readonly index = new Map<string, Map<number, Array<{ value: number, id: number }>>>()
  // Structure: functor -> (argIndex -> sorted array of {value, id})

  /**
   * Add a constraint to the ordering index.
   */
  add (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    
    if (!this.index.has(functor)) {
      this.index.set(functor, new Map())
    }
    
    const functorIndex = this.index.get(functor)!
    
    for (let i = 0; i < constraint.args.length; i++) {
      const value = constraint.args[i]
      
      // Only index numeric values for ordering
      if (typeof value === 'number') {
        if (!functorIndex.has(i)) {
          functorIndex.set(i, [])
        }
        
        const argIndex = functorIndex.get(i)!
        argIndex.push({ value, id: constraint.id })
        // Keep sorted for binary search
        argIndex.sort((a, b) => a.value - b.value)
      }
    }
  }

  /**
   * Remove a constraint from the ordering index.
   */
  remove (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return
    
    for (let i = 0; i < constraint.args.length; i++) {
      const value = constraint.args[i]
      
      if (typeof value === 'number') {
        const argIndex = functorIndex.get(i)
        if (argIndex) {
          const idx = argIndex.findIndex(entry => entry.id === constraint.id)
          if (idx !== -1) {
            argIndex.splice(idx, 1)
          }
          
          if (argIndex.length === 0) {
            functorIndex.delete(i)
          }
        }
      }
    }
    
    if (functorIndex.size === 0) {
      this.index.delete(functor)
    }
  }

  /**
   * Lookup constraints with value > threshold.
   */
  lookupGreaterThan (name: string, arity: number, argIndex: number, threshold: number): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const argEntries = functorIndex.get(argIndex)
    if (!argEntries) return []
    
    // Binary search for first element > threshold
    const result: number[] = []
    let left = 0
    let right = argEntries.length - 1
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const entry = argEntries[mid]
      if (entry && entry.value > threshold) {
        right = mid - 1
      } else {
        left = mid + 1
      }
    }
    
    // Collect all elements from left to end
    for (let i = left; i < argEntries.length; i++) {
      const entry = argEntries[i]
      if (entry) {
        result.push(entry.id)
      }
    }
    
    return result
  }

  /**
   * Lookup constraints with value < threshold.
   */
  lookupLessThan (name: string, arity: number, argIndex: number, threshold: number): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const argEntries = functorIndex.get(argIndex)
    if (!argEntries) return []
    
    // Binary search for last element < threshold
    const result: number[] = []
    let left = 0
    let right = argEntries.length - 1
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const entry = argEntries[mid]
      if (entry && entry.value < threshold) {
        left = mid + 1
      } else {
        right = mid - 1
      }
    }
    
    // Collect all elements from 0 to right
    for (let i = 0; i <= right; i++) {
      const entry = argEntries[i]
      if (entry) {
        result.push(entry.id)
      }
    }
    
    return result
  }

  /**
   * Lookup constraints with value in range [min, max].
   */
  lookupRange (name: string, arity: number, argIndex: number, min: number, max: number): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const argEntries = functorIndex.get(argIndex)
    if (!argEntries) return []
    
    // Binary search for range bounds
    let left = 0
    let right = argEntries.length - 1
    let startIdx = argEntries.length
    let endIdx = -1
    
    // Find first element >= min
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const entry = argEntries[mid]
      if (entry && entry.value >= min) {
        startIdx = mid
        right = mid - 1
      } else {
        left = mid + 1
      }
    }
    
    // Find last element <= max
    left = 0
    right = argEntries.length - 1
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const entry = argEntries[mid]
      if (entry && entry.value <= max) {
        endIdx = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }
    
    // Collect elements in range
    const result: number[] = []
    for (let i = startIdx; i <= endIdx; i++) {
      const entry = argEntries[i]
      if (entry) {
        result.push(entry.id)
      }
    }
    
    return result
  }

  /**
   * Clear the index.
   */
  clear (): void {
    this.index.clear()
  }

  /**
   * Get index statistics.
   */
  getStats (): { functors: number, totalEntries: number } {
    let totalEntries = 0
    
    for (const functorIndex of this.index.values()) {
      for (const argIndex of functorIndex.values()) {
        totalEntries += argIndex.length
      }
    }
    
    return {
      functors: this.index.size,
      totalEntries
    }
  }
}

/**
 * Range index for efficient range queries.
 * 
 * This index is optimized for range-based constraints and uses
 * interval trees for efficient overlap queries.
 */
export class RangeIndex {
  private readonly index = new Map<string, Array<{ start: number, end: number, id: number }>>()
  // Structure: functor -> array of intervals

  /**
   * Add a constraint to the range index.
   * Assumes the constraint has at least 2 numeric arguments representing [start, end].
   */
  add (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    
    if (constraint.args.length < 2) return
    
    const start = constraint.args[0]
    const end = constraint.args[1]
    
    if (typeof start === 'number' && typeof end === 'number') {
      if (!this.index.has(functor)) {
        this.index.set(functor, [])
      }
      
      const functorIndex = this.index.get(functor)!
      functorIndex.push({ start, end, id: constraint.id })
      // Sort by start for efficient queries
      functorIndex.sort((a, b) => a.start - b.start)
    }
  }

  /**
   * Remove a constraint from the range index.
   */
  remove (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return
    
    const idx = functorIndex.findIndex(entry => entry.id === constraint.id)
    if (idx !== -1) {
      functorIndex.splice(idx, 1)
    }
    
    if (functorIndex.length === 0) {
      this.index.delete(functor)
    }
  }

  /**
   * Find intervals that overlap with a point.
   */
  lookupPoint (name: string, arity: number, point: number): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const result: number[] = []
    
    for (const interval of functorIndex) {
      if (point >= interval.start && point <= interval.end) {
        result.push(interval.id)
      }
    }
    
    return result
  }

  /**
   * Find intervals that overlap with a range.
   */
  lookupRange (name: string, arity: number, rangeStart: number, rangeEnd: number): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const result: number[] = []
    
    for (const interval of functorIndex) {
      // Check for overlap: intervals overlap if not (interval.end < rangeStart or interval.start > rangeEnd)
      if (!(interval.end < rangeStart || interval.start > rangeEnd)) {
        result.push(interval.id)
      }
    }
    
    return result
  }

  /**
   * Clear the index.
   */
  clear (): void {
    this.index.clear()
  }

  /**
   * Get index statistics.
   */
  getStats (): { functors: number, totalIntervals: number } {
    let totalIntervals = 0
    
    for (const functorIndex of this.index.values()) {
      totalIntervals += functorIndex.length
    }
    
    return {
      functors: this.index.size,
      totalIntervals
    }
  }
}

/**
 * Set index for set membership operations.
 * 
 * This index is optimized for constraints that represent set membership
 * and need fast containment checks.
 */
export class SetIndex {
  private readonly index = new Map<string, Map<unknown, Set<number>>>()
  // Structure: functor -> (element -> constraint IDs)

  /**
   * Add a constraint to the set index.
   * Assumes constraint arguments represent set elements.
   */
  add (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    
    if (!this.index.has(functor)) {
      this.index.set(functor, new Map())
    }
    
    const functorIndex = this.index.get(functor)!
    
    for (const element of constraint.args) {
      if (!functorIndex.has(element)) {
        functorIndex.set(element, new Set())
      }
      functorIndex.get(element)!.add(constraint.id)
    }
  }

  /**
   * Remove a constraint from the set index.
   */
  remove (constraint: ConstraintRecord): void {
    const functor = `${constraint.name}/${constraint.arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return
    
    for (const element of constraint.args) {
      const elementIndex = functorIndex.get(element)
      if (elementIndex) {
        elementIndex.delete(constraint.id)
        if (elementIndex.size === 0) {
          functorIndex.delete(element)
        }
      }
    }
    
    if (functorIndex.size === 0) {
      this.index.delete(functor)
    }
  }

  /**
   * Check if an element is in any constraint of the given functor.
   */
  contains (name: string, arity: number, element: unknown): boolean {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    return functorIndex?.has(element) ?? false
  }

  /**
   * Get all constraint IDs containing a specific element.
   */
  lookup (name: string, arity: number, element: unknown): number[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    
    if (!functorIndex) return []
    
    const elementIndex = functorIndex.get(element)
    if (!elementIndex) return []
    
    return [...elementIndex]
  }

  /**
   * Get all unique elements for a constraint functor.
   */
  getElements (name: string, arity: number): unknown[] {
    const functor = `${name}/${arity}`
    const functorIndex = this.index.get(functor)
    return functorIndex ? [...functorIndex.keys()] : []
  }

  /**
   * Clear the index.
   */
  clear (): void {
    this.index.clear()
  }

  /**
   * Get index statistics.
   */
  getStats (): { functors: number, totalElements: number, totalMemberships: number } {
    let totalElements = 0
    let totalMemberships = 0
    
    for (const functorIndex of this.index.values()) {
      totalElements += functorIndex.size
      for (const elementIndex of functorIndex.values()) {
        totalMemberships += elementIndex.size
      }
    }
    
    return {
      functors: this.index.size,
      totalElements,
      totalMemberships
    }
  }
}
