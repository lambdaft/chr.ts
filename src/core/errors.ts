/**
 * Error classes for the CHR.ts engine.
 *
 * Three error types are defined:
 *
 * 1. `CHRParseError` – thrown by the parser when source text is syntactically
 *    invalid. Carries a `SourceSpan` for precise line/column reporting.
 *
 * 2. `CHRExecutionError` – thrown by the engine when a runtime invariant is
 *    violated: arity mismatches, undeclared host functions, rule execution
 *    failures, etc. Also carries a `SourceSpan`.
 *
 * 3. `CHRGuardError` – an internal error type thrown by host functions during
 *    guard evaluation. The engine catches `CHRGuardError` in
 *    `engine.ts:evaluateGuards` and treats it as a guard failure (the rule
 *    does not fire) rather than a fatal engine error. This allows host
 *    functions to signal "this guard doesn't apply" without aborting the
 *    entire fixpoint loop.
 *
 * Source-span formatting:
 *   `formatSourceSpan` produces a caret (`^`) pointing at the start of the
 *   span on the relevant source line. This is appended to error messages when
 *   both `span` and `source` are provided.
 *
 * All three error classes extend the built-in `Error` and set `name` to their
 * class name for easy identification in catch blocks.
 */

import type { SourceSpan } from './ast.js'

/**
 * Format a `SourceSpan` as a source-code excerpt with a caret pointer.
 *
 * Example output:
 *   ```
 *     edge(1, 2)
 *     ^
 *   ```
 *
 * @param source - The complete source text.
 * @param span - The span to format.
 * @returns A multi-line string with the source line and caret, or empty string on invalid input.
 */
export function formatSourceSpan (source: string, span: SourceSpan): string {
  const lines = source.split('\n')
  const lineIndex = span.start.line - 1
  if (lineIndex < 0 || lineIndex >= lines.length) return ''
  const line = lines[lineIndex]
  if (line == null) return ''
  const col = span.start.column - 1
  const caret = ' '.repeat(Math.max(0, col)) + '^'
  return `\n  ${line}\n  ${caret}`
}

/**
 * Error thrown when the parser encounters invalid CHR source syntax.
 *
 * In addition to the standard `Error` properties, `CHRParseError` carries:
 * - `span`: the `SourceSpan` of the offending syntax.
 * - `cause`: the underlying error (if any).
 */
export class CHRParseError extends Error {
  readonly span: SourceSpan | undefined
  override readonly cause: Error | undefined

  /**
   * Construct a parse error.
   *
   * If `span` and `source` are provided, the error message is augmented with
   * a source-code excerpt and caret pointer for precise diagnostics.
   *
   * @param message - Human-readable error description.
   * @param span - Optional source location of the error.
   * @param cause - Optional underlying error for cause chaining.
   * @param source - Optional complete source text (needed for caret formatting).
   */
  constructor (message: string, span?: SourceSpan, cause?: Error, source?: string) {
    const formatted = span && source ? message + formatSourceSpan(source, span) : message
    super(formatted, { cause })
    this.name = 'CHRParseError'
    this.span = span
    this.cause = cause as Error | undefined
  }
}

/**
 * Error thrown when the engine encounters a runtime violation.
 *
 * This covers arity mismatches, missing host registrations, store invariant
 * violations, and other execution-time failures.
 */
export class CHRExecutionError extends Error {
  readonly span: SourceSpan | undefined
  override readonly cause: Error | undefined

  /**
   * Construct an execution error.
   *
   * @param message - Human-readable error description.
   * @param span - Optional source location of the error.
   * @param cause - Optional underlying error for cause chaining.
   * @param source - Optional complete source text (needed for caret formatting).
   */
  constructor (message: string, span?: SourceSpan, cause?: Error, source?: string) {
    const formatted = span && source ? message + formatSourceSpan(source, span) : message
    super(formatted, { cause })
    this.name = 'CHRExecutionError'
    this.span = span
    this.cause = cause as Error | undefined
  }
}

/**
 * Internal error class used to signal that a guard evaluation failed.
 *
 * These are caught by the engine and treated as guard failures (rule does
 * not fire), not as fatal engine errors.
 *
 * Host functions can throw `CHRGuardError` to indicate that a guard
 * condition is not met without aborting the entire fixpoint loop.
 */
export class CHRGuardError extends Error {
  readonly span: SourceSpan | undefined
  override readonly cause: Error | undefined

  /**
   * Construct a guard error.
   *
   * @param message - Human-readable error description.
   * @param span - Optional source location of the error.
   * @param cause - Optional underlying error for cause chaining.
   */
  constructor (message: string, span?: SourceSpan, cause?: Error) {
    super(message, { cause })
    this.name = 'CHRGuardError'
    this.span = span
    this.cause = cause as Error | undefined
  }
}
