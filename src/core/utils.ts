/**
 * Shared runtime utilities for the CHR engine.
 *
 * This module provides small, focused helpers used across the engine, parser,
 * and builtins:
 *
 * - `numeric(value)`: Coerce a value to a number or throw a descriptive error.
 * - `compare(left, right, op)`: Compare two values as numbers using a comparator.
 * - `evaluateBinary(operator, left, right)`: Dispatch a binary operator by name.
 *
 * These utilities are kept in a separate module so that they can be imported
 * by both the engine runtime (`engine/eval.ts`) and the builtins module
 * (`builtins.ts`) without creating circular dependencies.
 */

import type { BinaryExpression } from './ast.js'
import { CHRExecutionError } from './errors.js'

/**
 * Coerce a value to a number or throw a descriptive error.
 *
 * This is used by arithmetic builtins (`add`, `sub`, `mul`, `div`, `mod`,
 * `min`, `max`, `abs`) and by the expression evaluator for arithmetic
 * operators. It ensures that non-numeric arguments produce a clear error
 * message rather than silently returning `NaN`.
 *
 * @param value - The value to coerce.
 * @returns The value as a number.
 * @throws {CHRExecutionError} If the value is not a number.
 */
export function numeric(value: unknown): number {
  if (typeof value !== 'number') {
    throw new CHRExecutionError('Numeric operation requires number operands.')
  }
  return value
}

/**
 * Compare two values as numbers using a binary comparator.
 *
 * Used by comparison builtins (`lt`, `lte`, `gt`, `gte`) and by the `evaluateBinary`
 * function for `<`, `<=`, `>`, `>=` operators.
 *
 * @param left - Left operand.
 * @param right - Right operand.
 * @param op - Comparator function (e.g. `(a, b) => a < b`).
 * @returns The result of `op(numeric(left), numeric(right))`.
 * @throws {CHRExecutionError} If either operand is not a number.
 */
export function compare(left: unknown, right: unknown, op: (a: number, b: number) => boolean): boolean {
  return op(numeric(left), numeric(right))
}

/**
 * Evaluate a binary operator with proper type coercion and error handling.
 *
 * This is the central dispatch for all binary operators in CHR expression
 * evaluation. It handles:
 * - Logical operators: `||`, `&&` (no coercion, JS truthiness rules)
 * - Equality operators: `===`, `!==` (strict equality)
 * - Comparison operators: `<`, `<=`, `>`, `>=` (numeric coercion via `compare`)
 * - Arithmetic operators: `+`, `-`, `*`, `/` (numeric coercion via `numeric`)
 * - Membership operator: `in` (right operand must be an array)
 *
 * @param operator - The operator token.
 * @param left - The already-evaluated left operand.
 * @param right - The already-evaluated right operand.
 * @returns The result of the operation.
 * @throws {CHRExecutionError} If the operator is unsupported or operands have wrong types.
 */
export function evaluateBinary(operator: BinaryExpression['operator'], left: unknown, right: unknown): unknown {
  switch (operator) {
    case '||': return Boolean(left) || Boolean(right)
    case '&&': return Boolean(left) && Boolean(right)
    case '===': return left === right
    case '!==': return left !== right
    case '<': return compare(left, right, (a, b) => a < b)
    case '<=': return compare(left, right, (a, b) => a <= b)
    case '>': return compare(left, right, (a, b) => a > b)
    case '>=': return compare(left, right, (a, b) => a >= b)
    case '+': return numeric(left) + numeric(right)
    case '-': return numeric(left) - numeric(right)
    case '*': return numeric(left) * numeric(right)
    case '/': return numeric(left) / numeric(right)
    case 'in':
      if (!Array.isArray(right)) throw new CHRExecutionError('Right operand of "in" must be an array.')
      return (right as unknown[]).includes(left)
    default:
      throw new CHRExecutionError(`Unsupported binary operator: ${String(operator)}`)
  }
}
