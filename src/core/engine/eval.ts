/**
 * Expression evaluator for CHR guards and rule bodies.
 *
 * `evaluateExpression` recursively walks an `Expression` AST and produces a
 * JavaScript value. It is the execution backend for all expression evaluation
 * in the engine: guard checks, body argument evaluation, and `let` binding
 * right-hand sides.
 *
 * Evaluation rules:
 * - `literal`: return the literal value directly.
 * - `array`: recursively evaluate each element and return the resulting array.
 * - `variable`: look up the variable name in the `bindings` map. Throws
 *   `CHRExecutionError` if the variable is unbound (this should never happen
 *   if the engine's variable scoping validation is correct).
 * - `unary`: evaluate the operand, then apply `!` (logical NOT) or `-` (negation).
 * - `binary`: evaluate left and right operands, then dispatch to `evaluateBinary`.
 * - `call`: look up the host function by name, evaluate all arguments, then
 *   call the host function with the engine context.
 *
 * Error handling:
 * - Host function errors are wrapped in `CHRExecutionError` (for body expressions)
 *   or `CHRGuardError` (for guard expressions). `CHRGuardError` is special:
 *     it is caught by `engine.ts:evaluateGuards` and treated as a guard
 *     failure rather than a fatal engine error.
 * - Timeout support: if `hostFunctionTimeout` is set, host function calls
 *   are wrapped in `Promise.race` with a timer that rejects after the timeout.
 *
 * Dependencies are injected via the `EvalDeps` interface to avoid circular
 * imports between `engine.ts` and `eval.ts`.
 */

import type { Expression, RuleNode } from '../ast.js'
import type { ConstraintRecord } from '../constraint.js'
import { CHRExecutionError, CHRGuardError } from '../errors.js'
import { evaluateBinary } from '../utils.js'
import type { ConstraintStore } from '../store.js'
import type { CHREngine } from '../engine.js'

/**
 * Dependencies injected by the engine into the evaluator.
 *
 * This interface exists to break the circular dependency between `engine.ts`
 * and `eval.ts`. The engine constructs an `EvalDeps` object at evaluation
 * time and passes it to `evaluateExpression`.
 */
interface EvalDeps {
  readonly functions: Map<string, (ctx: unknown, ...args: unknown[]) => unknown | Promise<unknown>>
  readonly hostFunctionTimeout: number | undefined
  readonly store: ConstraintStore
  readonly history: {
    add(ruleName: string, ids: number[]): void
    has(ruleName: string, ids: number[]): boolean
    notIn(ruleName: string, ids: number[]): boolean
  }
  readonly isGuard: boolean
  readonly engine: CHREngine | undefined
  suggestSimilar(name: string, registry: Map<string, unknown>): string
}

/**
 * Recursively evaluate a CHR expression to a JavaScript value.
 *
 * @param deps - Injected engine dependencies.
 * @param expr - The expression AST to evaluate.
 * @param rule - The rule being evaluated (for error context).
 * @param matched - The matched constraint records (for host context).
 * @param bindings - Current variable bindings from head matching.
 * @returns The evaluated value.
 * @throws {CHRExecutionError} On evaluation errors (or wrapped host errors).
 * @throws {CHRGuardError} If `deps.isGuard` is true and a host function fails.
 */
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
    if (deps.isGuard) {
      throw new CHRGuardError(
        `Guard function ${expr.callee} failed in rule ${rule.name ?? 'anonymous'}: ${(error as Error).message}`,
        rule.span,
        error as Error
      )
    }
    throw new CHRExecutionError(
      `Host function ${expr.callee} threw in rule ${rule.name ?? 'anonymous'}: ${(error as Error).message}`,
      rule.span,
      error as Error
    )
  }
}

/**
 * Call a host function with the engine context and evaluated arguments.
 *
 * The context object passed to the host function is constructed from
 * `deps` and the current rule firing state.
 */
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
      engine: deps.engine,
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

/**
 * Wrap a host function call in an optional timeout.
 *
 * If `hostFunctionTimeout` is set and the result is a Promise, the call is
 * wrapped in `Promise.race` with a timer that rejects after the timeout
 * duration. Synchronous results pass through unchanged.
 *
 * @throws {Error} If the host function times out.
 */
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
