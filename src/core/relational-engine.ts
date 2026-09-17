/**
 * Relational solver ($CHR^\vee$) runner and query execution API.
 * 
 * Provides `run(n, vars, goals)` and lazy solution streaming on top of
 * the stream operational semantics in `stream.ts`.
 */

import { SearchState } from './state.js'
import {
  type RelationalGoal,
  type SearchStream,
  startGoal,
  stepStream,
  takeSolutions,
  formatSolution
} from './stream.js'
import type { RuleNode } from './ast.js'
import { parseProgram, parseExpression } from './parser.js'

export interface RelationalQueryOptions {
  maxSolutions?: number | null
  maxSteps?: number
  initialState?: SearchState
}

export class RelationalEngine {
  readonly rules: RuleNode[]

  constructor (rules: RuleNode[] = []) {
    this.rules = [...rules]
  }

  /**
   * Add rules to the relational engine from a source string.
   */
  addRules (source: string): this {
    const parsed = parseProgram(source)
    this.rules.push(...parsed.rules)
    return this
  }

  /**
   * Load a full CHR program including rules.
   */
  loadProgram (source: string): this {
    const program = parseProgram(source)
    this.rules.push(...program.rules)
    return this
  }

  /**
   * Solve a query and retrieve up to `n` materialized solution bindings.
   * 
   * @param n - Maximum number of solutions to find (null for all finite solutions)
   * @param vars - Variable names to extract from the resulting substitutions
   * @param goals - Query goals or string of goals/constraints
   * @param options - Execution configuration
   */
  run (
    n: number | null,
    vars: string[],
    goals: RelationalGoal | RelationalGoal[] | string,
    options: RelationalQueryOptions = {}
  ): Array<Record<string, unknown>> {
    const goalList = typeof goals === 'string'
      ? this.parseQueryGoals(goals)
      : Array.isArray(goals)
        ? goals
        : [goals]
    const goal: RelationalGoal = goalList.length === 1
      ? (goalList[0] ?? { type: 'succeed' })
      : { type: 'conj', goals: goalList }

    const initialState = options.initialState ?? new SearchState()
    const initialStream = startGoal(goal, initialState, this.rules)
    const solutions = takeSolutions(initialStream, this.rules, n, options.maxSteps ?? 50000)

    return solutions.map(sol => formatSolution(sol, vars))
  }

  /**
   * Lazy generator yielding solutions one by one.
   */
  *streamSolutions (
    vars: string[],
    goals: RelationalGoal | RelationalGoal[] | string,
    options: RelationalQueryOptions = {}
  ): Generator<Record<string, unknown>> {
    const goalList = typeof goals === 'string'
      ? this.parseQueryGoals(goals)
      : Array.isArray(goals)
        ? goals
        : [goals]
    const goal: RelationalGoal = goalList.length === 1
      ? (goalList[0] ?? { type: 'succeed' })
      : { type: 'conj', goals: goalList }

    const initialState = options.initialState ?? new SearchState()
    let stream: SearchStream = startGoal(goal, initialState, this.rules)
    let steps = 0
    const maxSteps = options.maxSteps ?? 50000

    while (stream.type !== 'empty' && steps < maxSteps) {
      if (stream.type === 'solution') {
        yield formatSolution(stream.head, vars)
        stream = stream.tail
      } else {
        stream = stepStream(stream, this.rules)
        steps++
      }
    }
  }

  /**
   * Parse a comma-separated query string (e.g. `coin(X), X == heads`) into RelationalGoals.
   */
  private parseQueryGoals (source: string): RelationalGoal[] {
    const goals: RelationalGoal[] = []
    const parts = splitTopLevel(source.trim(), ',')

    for (const part of parts) {
      const eqIdx = findTopLevelOperator(part, '==')
      if (eqIdx >= 0) {
        const left = part.slice(0, eqIdx).trim()
        const right = part.slice(eqIdx + 2).trim()
        const leftExpr = parseExpression(left)
        const rightExpr = parseExpression(right)

        goals.push({
          type: 'constraint',
          name: '==',
          args: [leftExpr, rightExpr]
        })
        continue
      }

      const match = /^([a-z_][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/.exec(part)
      if (match) {
        const name = match[1] ?? 'fact'
        const argsStr = match[2]?.trim()
        const args = argsStr
          ? splitTopLevel(argsStr, ',').map(a => parseExpression(a.trim()))
          : []
        goals.push({ type: 'constraint', name, args })
      }
    }

    return goals
  }
}

function splitTopLevel (source: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: 'single' | 'double' | null = null

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    const previous = index > 0 ? source[index - 1]! : ''

    if (quote) {
      current += char
      if (((quote === 'single' && char === "'") || (quote === 'double' && char === '"')) && previous !== '\\') {
        quote = null
      }
      continue
    }

    if (char === "'") {
      quote = 'single'
      current += char
      continue
    }

    if (char === '"') {
      quote = 'double'
      current += char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
    }

    if (depth === 0 && source.startsWith(separator, index)) {
      parts.push(current.trim())
      current = ''
      index += separator.length - 1
      continue
    }

    current += char
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

function findTopLevelOperator (source: string, operator: string): number {
  let depth = 0
  let quote: 'single' | 'double' | null = null

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!
    const previous = index > 0 ? source[index - 1]! : ''

    if (quote) {
      if (((quote === 'single' && char === "'") || (quote === 'double' && char === '"')) && previous !== '\\') {
        quote = null
      }
      continue
    }

    if (char === "'") {
      quote = 'single'
      continue
    }

    if (char === '"') {
      quote = 'double'
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
    }

    if (depth === 0 && source.startsWith(operator, index)) {
      return index
    }
  }

  return -1
}
