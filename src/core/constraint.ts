/**
 * Constraint record interface and factory functions.
 *
 * A `ConstraintRecord` is the runtime representation of a constraint in the
 * store. It carries:
 * - `id`: a unique auto-incrementing integer assigned by `ConstraintStore`.
 * - `name`: the constraint functor name (e.g. `'edge'`).
 * - `arity`: the number of arguments (derived from `args.length`).
 * - `args`: the constraint's argument values.
 * - `metadata`: optional user-defined key/value pairs.
 * - `toString()`: a convenience method for human-readable representation.
 *
 * Records are created by `createConstraint` and indexed by `createFunctor`.
 * The factory pattern is used instead of a class because records are
 * frequently cloned (e.g. in snapshots) and the factory ensures that
 * `toString()` closes over the correct record instance.
 */

/**
 * The runtime representation of a single constraint in the store.
 */
export interface ConstraintRecord {
  id: number
  name: string
  arity: number
  args: unknown[]
  metadata?: Record<string, unknown>
  toString (): string
}

/**
 * Build a functor string from a constraint name and arity.
 *
 * Functors are used as keys in the store's `byFunctor` index. The format
 * `name/arity` is chosen because it is human-readable, sortable, and
 * unambiguous for valid CHR identifiers.
 *
 * @example
 *   createFunctor('edge', 2) // => 'edge/2'
 */
export function createFunctor (name: string, arity: number): string {
  return `${name}/${arity}`
}

/**
 * Create a new `ConstraintRecord` with a fresh ID.
 *
 * The record's `toString()` method is bound to the record instance so that
 * it always reflects the current args.
 *
 * @param id - Unique constraint ID (assigned by the store).
 * @param name - Constraint functor name.
 * @param args - Constraint argument values.
 * @param metadata - Optional metadata key/value pairs.
 * @returns A fully initialized `ConstraintRecord`.
 */
export function createConstraint (
  id: number,
  name: string,
  args: unknown[],
  metadata?: Record<string, unknown>
): ConstraintRecord {
  const record: ConstraintRecord = {
    id,
    name,
    arity: args.length,
    args: [...args]
  }

  if (metadata) {
    record.metadata = metadata
  }

  record.toString = () => {
    if (record.arity === 0) {
      return record.name
    }
    return `${record.name}(${record.args.map((arg) => String(arg)).join(',')})`
  }

  return record
}
