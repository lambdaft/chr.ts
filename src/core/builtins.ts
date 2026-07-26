/**
 * Built-in host functions for the CHR engine.
 *
 * `BuiltinsModule` provides 22 standard host functions that cover the most
 * common operations in CHR rule bodies and guards. These are registered
 * automatically when the user calls `engine.registerBuiltins()`.
 *
 * Design notes:
 * - Functions that operate on numbers use the `numeric()` helper from
 *   `utils.ts`, which throws a clear `CHRExecutionError` if a non-number
 *   is passed.
 * - Comparison functions (`lt`, `lte`, `gt`, `gte`) use the `compare()`
 *   helper which wraps `numeric()` and delegates to the comparison operator.
 * - `lookup` and `lookupOne` are store-introspection functions that allow
 *   rules to query the current constraint set. They are useful for
 *   implementing custom matching strategies or for debugging.
 * - `allDifferent` accepts either a variadic list of arguments or a single
 *   array argument (for convenience when the value comes from a variable).
 * - `in` tests membership in an array. The right operand must evaluate to
 *   an array or a `CHRExecutionError` is thrown.
 *
 * Thread-safety: Builtins are stateless and safe to call from any async
 * context.
 */

import type { HostFunction, HostModule } from "./engine.js"
import { compare, numeric } from "./utils.js"

/**
 * Registry of all built-in host functions.
 *
 * Each function receives a `HostFunctionContext` as its first argument
 * (named `_ctx` here because builtins do not use it directly). The
 * remaining arguments are the evaluated expression arguments from the
 * `.chr` source.
 */
export const BuiltinFunctions: Record<string, HostFunction> = {
  /**
   * Strict equality (`===`).
   *
   * @example
   *   eq(1, 1) => true
   *   eq(1, 2) => false
   */
  eq: (_ctx, a, b) => a === b,

  /**
   * Strict inequality (`!==`).
   */
  neq: (_ctx, a, b) => a !== b,

  /**
   * Less-than comparison with numeric coercion.
   *
   * @throws {CHRExecutionError} If either argument is not a number.
   */
  lt: (_ctx, a, b) => compare(a, b, (x, y) => x < y),

  /**
   * Less-than-or-equal comparison with numeric coercion.
   */
  lte: (_ctx, a, b) => compare(a, b, (x, y) => x <= y),

  /**
   * Greater-than comparison with numeric coercion.
   */
  gt: (_ctx, a, b) => compare(a, b, (x, y) => x > y),

  /**
   * Greater-than-or-equal comparison with numeric coercion.
   */
  gte: (_ctx, a, b) => compare(a, b, (x, y) => x >= y),

  /**
   * Arithmetic addition with numeric coercion.
   */
  add: (_ctx, a, b) => numeric(a) + numeric(b),

  /**
   * Arithmetic subtraction with numeric coercion.
   */
  sub: (_ctx, a, b) => numeric(a) - numeric(b),

  /**
   * Arithmetic multiplication with numeric coercion.
   */
  mul: (_ctx, a, b) => numeric(a) * numeric(b),

  /**
   * Arithmetic division with numeric coercion and zero check.
   *
   * @throws {Error} If the divisor is zero.
   */
  div: (_ctx, a, b) => {
    const d = numeric(b)
    if (d === 0) throw new Error('Division by zero')
    return numeric(a) / d
  },

  /**
   * Arithmetic modulo with numeric coercion and zero check.
   *
   * @throws {Error} If the divisor is zero.
   */
  mod: (_ctx, a, b) => {
    const d = numeric(b)
    if (d === 0) throw new Error('Division by zero')
    return numeric(a) % d
  },

  /**
   * Minimum of two numbers with numeric coercion.
   */
  min: (_ctx, a, b) => Math.min(numeric(a), numeric(b)),

  /**
   * Maximum of two numbers with numeric coercion.
   */
  max: (_ctx, a, b) => Math.max(numeric(a), numeric(b)),

  /**
   * Absolute value with numeric coercion.
   */
  abs: (_ctx, a) => Math.abs(numeric(a)),

  /**
   * Logical NOT (boolean coercion).
   */
  not: (_ctx, a) => !a,

  /**
   * Type check: is the argument a number?
   */
  isNumber: (_ctx, a) => typeof a === 'number',

  /**
   * Type check: is the argument a string?
   */
  isString: (_ctx, a) => typeof a === 'string',

  /**
   * Type check: is the argument a boolean?
   */
  isBoolean: (_ctx, a) => typeof a === 'boolean',

  /**
   * Type check: is the argument `null`?
   */
  isNull: (_ctx, a) => a === null,

  /**
   * Return the length of a string.
   *
   * @throws {Error} If the argument is not a string.
   */
  stringLength: (_ctx, a) => {
    if (typeof a !== 'string') throw new Error(`Expected string, got ${typeof a}`)
    return a.length
  },

  /**
   * Concatenate two values as strings.
   *
   * Non-string arguments are coerced via `String()`.
   */
  stringConcat: (_ctx, a, b) => {
    const sa = typeof a === 'string' ? a : String(a)
    const sb = typeof b === 'string' ? b : String(b)
    return sa + sb
  },

  /**
   * Return true if all arguments are pairwise different.
   *
   * Accepts either a variadic list of arguments or a single array argument.
   * This dual calling convention allows `allDifferent(X)` when `X` is a
   * variable bound to an array.
   *
   * @example
   *   allDifferent(1, 2, 3) => true
   *   allDifferent([1, 2, 2]) => false
   */
  allDifferent: (_ctx, ...args) => {
    const values = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args
    return values.every((v, i) => values.slice(i + 1).every((w) => v !== w))
  },

  /**
   * Test membership of `value` in `arr`.
   *
   * @throws {Error} If the right operand is not an array.
   */
  in: (_ctx, value, arr) => {
    if (!Array.isArray(arr)) throw new Error(`Expected array, got ${typeof arr}`)
    return arr.includes(value)
  },

  /**
   * Lookup all constraints with the given name and return their args.
   *
   * This is a store-introspection function: it inspects the current store
   * state and returns a 2D array of argument arrays.
   *
   * @example
   *   lookup(ctx, 'edge') // => [[1, 2], [2, 3]]
   */
  lookup: (ctx, name) => {
    return ctx.store.lookupByName(String(name)).map((r) => r.args)
  },

  /**
   * Lookup the first constraint with the given name and return the argument
   * at `argIndex`.
   *
   * @throws {Error} If no constraint with that name exists, or if the index
   *   is out of bounds.
   */
  lookupOne: (ctx, name, argIndex) => {
    const records = ctx.store.lookupByName(String(name))
    if (records.length === 0) throw new Error(`No constraint ${name} found`)
    const args = records[0]!.args
    const index = Number(argIndex)
    if (index < 0 || index >= args.length) {
      throw new Error(`Argument index ${index} out of bounds for constraint ${name} with arity ${args.length}`)
    }
    return args[index]!
  }
}

/**
 * The built-in host module.
 *
 * Registered via `engine.registerBuiltins()`. Its `functions` are merged
 * into the engine's function registry under their respective names.
 */
export const BuiltinsModule: HostModule = {
  functions: BuiltinFunctions
}
