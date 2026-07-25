import type { Expression, RuleNode } from '../ast.js'
import type { ConstraintRecord } from '../constraint.js'
import { CHRExecutionError } from '../errors.js'
import { evaluateBinary } from '../utils.js'
import type { ConstraintStore } from '../store.js'

interface EvalDeps {
  readonly functions: Map<string, (ctx: unknown, ...args: unknown[]) => unknown | Promise<unknown>>
  readonly hostFunctionTimeout: number | undefined
  readonly store: ConstraintStore
  readonly history: {
    add(ruleName: string, ids: number[]): void
    has(ruleName: string, ids: number[]): boolean
    notIn(ruleName: string, ids: number[]): boolean
  }
  suggestSimilar(name: string, registry: Map<string, unknown>): string
}

export async function evaluateExpression (
  deps: EvalDeps,
  expr: Expression,
  rule: RuleNode,
  matched: ConstraintRecord[],
  bindings: Record<string, unknown>
): Promise<unknown> {
  if (expr.type === 'literal') {
    return expr.value
  }

  if (expr.type === 'array') {
    const elements: unknown[] = []
    for (const element of expr.elements) {
      elements.push(await evaluateExpression(deps, element, rule, matched, bindings))
    }
    return elements
  }

  if (expr.type === 'variable') {
    if (!Object.hasOwn(bindings, expr.name)) {
      throw new CHRExecutionError(`Unbound variable ${expr.name}`, rule.span)
    }
    return bindings[expr.name]
  }

  if (expr.type === 'unary') {
    const operand = await evaluateExpression(deps, expr.operand, rule, matched, bindings)
    if (expr.operator === '!') {
      return !operand
    }
    if (expr.operator === '-') {
      return -(operand as number)
    }
    throw new CHRExecutionError(`Unknown unary operator ${expr.operator}`, rule.span)
  }

  if (expr.type === 'binary') {
    if (expr.operator === 'in') {
      const left = await evaluateExpression(deps, expr.left, rule, matched, bindings)
      const right = await evaluateExpression(deps, expr.right, rule, matched, bindings)
      if (!Array.isArray(right)) {
        throw new CHRExecutionError('Right operand of "in" must be an array.', rule.span)
      }
      return right.includes(left)
    }

    const left = await evaluateExpression(deps, expr.left, rule, matched, bindings)
    const right = await evaluateExpression(deps, expr.right, rule, matched, bindings)
    return evaluateBinary(expr.operator, left, right)
  }

  const fn = deps.functions.get(expr.callee)
  if (!fn) {
    throw new CHRExecutionError(
      `Unknown host function: ${expr.callee}${deps.suggestSimilar(expr.callee, deps.functions)}`,
      rule.span
    )
  }

  const args: unknown[] = []
  for (const arg of expr.args) {
    args.push(await evaluateExpression(deps, arg, rule, matched, bindings))
  }

  try {
    return await callHostFunction(deps, fn, expr.callee, rule, matched, bindings, args)
  } catch (error) {
    throw new CHRExecutionError(
      `Host function ${expr.callee} threw in rule ${rule.name ?? 'anonymous'}: ${(error as Error).message}`,
      rule.span,
      error as Error
    )
  }
}

async function callHostFunction (
  deps: EvalDeps,
  fn: (ctx: unknown, ...args: unknown[]) => unknown | Promise<unknown>,
  name: string,
  rule: RuleNode,
  matched: ConstraintRecord[],
  bindings: Record<string, unknown>,
  args: unknown[]
): Promise<unknown> {
  const result = fn(
    {
      engine: undefined as unknown,
      store: deps.store,
      history: deps.history,
      rule,
      matched,
      bindings
    },
    ...args
  )

  return withTimeout(deps, result, name, rule)
}

export async function withTimeout<T> (
  deps: EvalDeps,
  promise: T | Promise<T>,
  name: string,
  rule: RuleNode
): Promise<T> {
  if (deps.hostFunctionTimeout === undefined || typeof promise !== 'object' || promise === null || !('then' in (promise as Promise<T>))) {
    return promise as T
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Host function ${name} timed out after ${deps.hostFunctionTimeout}ms in rule ${rule.name ?? 'anonymous'}`))
    }, deps.hostFunctionTimeout)
  })

  return Promise.race([promise as Promise<T>, timeoutPromise])
}
