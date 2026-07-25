import type { HostFunction, HostModule } from './engine.js'

function numeric (value: unknown): number {
  if (typeof value !== 'number') {
    throw new Error(`Expected number, got ${typeof value}`)
  }
  return value
}

function compare (left: unknown, right: unknown, op: (a: number, b: number) => boolean): boolean {
  return op(numeric(left), numeric(right))
}

export const BuiltinFunctions: Record<string, HostFunction> = {
  eq: (_ctx, a, b) => a === b,
  neq: (_ctx, a, b) => a !== b,
  lt: (_ctx, a, b) => compare(a, b, (x, y) => x < y),
  lte: (_ctx, a, b) => compare(a, b, (x, y) => x <= y),
  gt: (_ctx, a, b) => compare(a, b, (x, y) => x > y),
  gte: (_ctx, a, b) => compare(a, b, (x, y) => x >= y),
  add: (_ctx, a, b) => numeric(a) + numeric(b),
  sub: (_ctx, a, b) => numeric(a) - numeric(b),
  mul: (_ctx, a, b) => numeric(a) * numeric(b),
  div: (_ctx, a, b) => {
    const d = numeric(b)
    if (d === 0) throw new Error('Division by zero')
    return numeric(a) / d
  },
  mod: (_ctx, a, b) => {
    const d = numeric(b)
    if (d === 0) throw new Error('Division by zero')
    return numeric(a) % d
  },
  min: (_ctx, a, b) => Math.min(numeric(a), numeric(b)),
  max: (_ctx, a, b) => Math.max(numeric(a), numeric(b)),
  abs: (_ctx, a) => Math.abs(numeric(a)),
  not: (_ctx, a) => !a,
  isNumber: (_ctx, a) => typeof a === 'number',
  isString: (_ctx, a) => typeof a === 'string',
  isBoolean: (_ctx, a) => typeof a === 'boolean',
  isNull: (_ctx, a) => a === null,
  stringLength: (_ctx, a) => {
    if (typeof a !== 'string') throw new Error(`Expected string, got ${typeof a}`)
    return a.length
  },
  stringConcat: (_ctx, a, b) => {
    const sa = typeof a === 'string' ? a : String(a)
    const sb = typeof b === 'string' ? b : String(b)
    return sa + sb
  },
  allDifferent: (_ctx, ...args) => {
    const values = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args
    return values.every((v, i) => values.slice(i + 1).every((w) => v !== w))
  },
  in: (_ctx, value, arr) => {
    if (!Array.isArray(arr)) throw new Error(`Expected array, got ${typeof arr}`)
    return arr.includes(value)
  },
  lookup: (ctx, name) => {
    return ctx.store.lookupByName(String(name)).map((r) => r.args)
  },
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

export const BuiltinsModule: HostModule = {
  functions: BuiltinFunctions
}
