import type { BinaryExpression } from './ast.js'
import { CHRExecutionError } from './errors.js'

export function numeric(value: unknown): number {
  if (typeof value !== 'number') {
    throw new CHRExecutionError('Numeric operation requires number operands.')
  }
  return value
}

export function compare(left: unknown, right: unknown, op: (a: number, b: number) => boolean): boolean {
  return op(numeric(left), numeric(right))
}

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
