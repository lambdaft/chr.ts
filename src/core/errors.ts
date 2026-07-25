import type { SourceSpan } from './ast.js'

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

export class CHRParseError extends Error {
  readonly span: SourceSpan | undefined
  override readonly cause: Error | undefined

  constructor (message: string, span?: SourceSpan, cause?: Error, source?: string) {
    const formatted = span && source ? message + formatSourceSpan(source, span) : message
    super(formatted, { cause })
    this.name = 'CHRParseError'
    this.span = span
    this.cause = cause as Error | undefined
  }
}

export class CHRExecutionError extends Error {
  readonly span: SourceSpan | undefined
  override readonly cause: Error | undefined

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
 * These are caught by the engine and treated as guard failures (rule does not fire),
 * not as fatal engine errors.
 */
export class CHRGuardError extends Error {
  readonly span: SourceSpan | undefined
  override readonly cause: Error | undefined

  constructor (message: string, span?: SourceSpan, cause?: Error) {
    super(message, { cause })
    this.name = 'CHRGuardError'
    this.span = span
    this.cause = cause as Error | undefined
  }
}
