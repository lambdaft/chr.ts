/**
 * Propagation history: order-independent loop detection for CHR rules.
 *
 * In CHR, propagation rules (`==>`) do not remove their head constraints. Without
 * loop detection, a propagation rule could fire indefinitely on the same set of
 * constraints, causing the fixpoint loop to run forever.
 *
 * `PropagationHistory` prevents this by recording every `(ruleName, constraintID
 * set)` pair that has fired. Before a propagation rule fires, the engine checks
 * whether the exact set of matched constraint IDs has already been seen for that
 * rule name. If so, the match is discarded.
 *
 * Order-independence:
 *   The same set of constraint IDs can be matched in different orders depending
 *   on the store's internal iteration order. To handle this, the history hashes
 *   the ID set by sorting the IDs and joining them with `:`. This ensures that
 *   `[1, 2, 3]` and `[3, 1, 2]` produce the same hash.
 *
 * Memory: The history grows linearly with the number of unique `(rule, ID-set)`
 * combinations. The engine does not currently evict history entries, so very
 * large fixpoint iterations may consume noticeable memory. In practice this is
 * rarely an issue because propagation histories are typically bounded by the
 * number of constraints in the store.
 */

export class PropagationHistory {
  /** Map from rule name to a set of sorted-ID hashes. */
  private readonly entries = new Map<string, Set<string>>()

  /**
   * Record that a rule has fired on a given set of constraint IDs.
   *
   * @param ruleName - The name of the rule that fired.
   * @param ids - The IDs of the matched constraints.
   */
  add (ruleName: string, ids: number[]): void {
    const ruleEntries = this.entries.get(ruleName) ?? new Set<string>()
    ruleEntries.add(hashIds(ids))
    this.entries.set(ruleName, ruleEntries)
  }

  /**
   * Check whether a rule has already fired on a given set of constraint IDs.
   *
   * @param ruleName - The name of the rule to check.
   * @param ids - The IDs of the matched constraints.
   * @returns `true` if this combination has been seen before.
   */
  has (ruleName: string, ids: number[]): boolean {
    return this.entries.get(ruleName)?.has(hashIds(ids)) ?? false
  }

  /**
   * The negation of `has`.
   *
   * Provided as a convenience for the engine's `findMatchRecursive` which
   * wants to check "not already fired" before recording a new history entry.
   */
  notIn (ruleName: string, ids: number[]): boolean {
    return !this.has(ruleName, ids)
  }

  /**
   * Clear all history entries.
   *
   * Called by `CHREngine.clear()` so that re-asserting constraints after a
   * clear can trigger propagation rules again.
   */
  clear (): void {
    this.entries.clear()
  }

  /**
   * Return a JSON-serializable snapshot of the history.
   *
   * Keys are rule names; values are sorted arrays of hash strings.
   */
  snapshot (): Record<string, string[]> {
    return Object.fromEntries(
      [...this.entries.entries()].map(([ruleName, ids]) => [ruleName, [...ids].sort()])
    )
  }
}

/**
 * Hash an array of constraint IDs into a string key.
 *
 * IDs are sorted before joining so that the hash is order-independent.
 * Example: `[3, 1, 2]` → `"1:2:3"`.
 */
function hashIds (ids: number[]): string {
  return [...ids].sort((left, right) => left - right).join(':')
}
