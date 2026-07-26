/**
 * A simple substitution map for use during unification.
 *
 * `Substitution` wraps a `Map<string, unknown>` and provides a small set of
 * operations needed by the unification algorithm in `unification.ts`:
 *
 * - `get(name)` / `set(name, value)` / `has(name)`: basic map operations.
 * - `clone()`: create a copy for backtracking (unification never mutates an
 *   existing substitution; it always produces a new one).
 * - `isEmpty()`: check whether any bindings exist.
 * - `entries()`: iterate over all bindings.
 * - `toString()`: human-readable representation for debugging.
 *
 * Why a custom class instead of `Map` directly?
 * - `clone()` is used heavily in unification to implement backtracking
 *   without reference-sharing bugs.
 * - The class provides a clear type boundary: `Substitution` is the only
 *   thing that unification code depends on, making it easy to swap the
 *   underlying implementation if needed.
 */

export class Substitution {
  /** The underlying map of variable name → value bindings. */
  private readonly map = new Map<string, unknown>()

  /**
   * Get the current binding for a variable name.
   *
   * @returns The bound value, or `undefined` if the variable is unbound.
   */
  get (name: string): unknown | undefined {
    return this.map.get(name)
  }

  /**
   * Bind a variable name to a value.
   *
   * @param name - The variable to bind.
   * @param value - The value to bind it to.
   */
  set (name: string, value: unknown): void {
    this.map.set(name, value)
  }

  /**
   * Check whether a variable name has a binding.
   */
  has (name: string): boolean {
    return this.map.has(name)
  }

  /**
   * Create a shallow copy of this substitution.
   *
   * Used by `unifyVariable` to implement non-destructive unification: each
   * recursive call clones the current substitution before adding a new
   * binding. This makes backtracking automatic (failed branches simply
   * discard the cloned substitution).
   */
  clone (): Substitution {
    const copy = new Substitution()
    for (const [k, v] of this.map) {
      copy.map.set(k, v)
    }
    return copy
  }

  /**
   * Check whether the substitution contains any bindings.
   */
  isEmpty (): boolean {
    return this.map.size === 0
  }

  /**
   * Return all bindings as an array of `[name, value]` tuples.
   */
  entries (): Array<[string, unknown]> {
    return [...this.map.entries()]
  }

  /**
   * Human-readable representation for debugging.
   *
   * Format: `X => 1, Y => "foo"`
   */
  toString (): string {
    return [...this.map.entries()]
      .map(([k, v]) => `${k} => ${JSON.stringify(v)}`)
      .join(', ')
  }
}
