/**
 * Recursive-descent parser for CHR source files.
 *
 * This module transforms a `.chr` source string into a `ProgramNode` AST that
 * the engine can compile and execute. It is the only place in the codebase that
 * understands the concrete syntax of the CHR rule language.
 *
 * Parsing strategy:
 *   1. Strip line-level comments (`#`, `%`, `--`) from each line.
 *   2. Split the source into top-level statements delimited by `;`.
 *   3. Classify each statement by its leading keyword (`constraint`, `function`,
 *      `action`, `import host`) and dispatch to the appropriate sub-parser.
 *   4. Rules are parsed into `RuleNode` objects by decomposing the rule into:
 *      - Optional `@priority@` annotation
 *      - Optional rule name (`name @`)
 *      - Optional `unify` flag
 *      - Rule kind (`==>`, `<=>` with optional `\`)
 *      - Guard list (`|`)
 *      - Body (`=>`)
 *   5. Expressions within constraints, guards, and body items are parsed by a
 *      separate Pratt-parser style `ExpressionParser` class with proper operator
 *      precedence.
 *
 * Error handling:
 *   - Parse errors throw `CHRParseError` with a `SourceSpan` so the engine can
 *     present the user with a line/column/caret diagnostic.
 *   - Errors that occur while parsing a specific expression are re-thrown with
 *     the enclosing rule's span for context.
 *
 * Thread-safety: The parser is stateless. All functions are pure transformations
 * from string + offset to AST nodes. Multiple calls can run in parallel.
 */

import {
  BinaryExpression,
  BodyAction,
  BodyConstraint,
  BodyConstraintUpdate,
  BodyItem,
  BodyLetBinding,
  CallExpression,
  ConstraintDeclaration,
  ConstraintPattern,
  Expression,
  HostActionDeclaration,
  HostFunctionDeclaration,
  HostImportDeclaration,
  LiteralExpression,
  ProgramNode,
  RuleKind,
  RuleNode,
  SourceSpan,
  VariableExpression
} from './ast.js'
import { CHRParseError } from './errors.js'

// ---------------------------------------------------------------------------
// Lexer tokens
// ---------------------------------------------------------------------------

/**
 * Token kinds produced by the `tokenize` function.
 *
 * These are the only atomic units the expression parser recognizes. Keywords
 * like `in`, `true`, `false`, and `null` are folded into identifier/boolean/null
 * token types so the expression parser can handle them without a separate
 * keyword table.
 */
type TokenType =
  | 'identifier'
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'operator'
  | 'paren'
  | 'comma'
  | 'eof'

/**
 * A single lexer token produced by `tokenize`.
 *
 * Tokens are consumed exclusively by `ExpressionParser`. The parser maintains
 * an `index` cursor that advances through the token array. `eof` is always the
 * last token.
 */
interface Token {
  type: TokenType
  value: string
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Parse a complete `.chr` source string into a `ProgramNode`.
 *
 * This is the primary entry point for the parser. It:
 *   1. Handles the empty-source edge case (returns an empty program).
 *   2. Strips comments.
 *   3. Splits into top-level statements.
 *   4. Dispatches each statement to the appropriate sub-parser.
 *
 * Parse errors are wrapped with the source span of the failing top-level
 * statement so the caller can produce a helpful diagnostic.
 *
 * @param source - The raw `.chr` source text.
 * @returns A `ProgramNode` containing all parsed declarations and rules.
 * @throws {CHRParseError} If any top-level statement cannot be parsed.
 */
export function parseProgram (source: string): ProgramNode {
  if (!source.trim()) {
    return { declarations: [], functionDeclarations: [], actionDeclarations: [], hostImports: [], rules: [] }
  }

  source = stripComments(source)

  const declarations: ConstraintDeclaration[] = []
  const functionDeclarations: HostFunctionDeclaration[] = []
  const actionDeclarations: HostActionDeclaration[] = []
  const hostImports: HostImportDeclaration[] = []
  const rules: RuleNode[] = []

  // Split into top-level statements at semicolons, preserving byte offsets
  // so that error messages can reference the original source location.
  for (const statement of splitTopLevelWithOffsets(source, ';')) {
    const entry = statement.text.trim()
    if (!entry) {
      continue
    }

    try {
      // Classify the statement by its leading keyword.
      if (isImportHostStatement(entry)) {
        hostImports.push(parseImportHostStatement(entry, source, statement.offset))
      } else if (isConstraintDeclarationStatement(entry)) {
        declarations.push(...parseDeclarationStatement(entry, source, statement.offset))
      } else if (isFunctionDeclarationStatement(entry)) {
        functionDeclarations.push(...parseHostDeclarationStatement(entry, source, statement.offset, 'function'))
      } else if (isActionDeclarationStatement(entry)) {
        actionDeclarations.push(...parseHostDeclarationStatement(entry, source, statement.offset, 'action'))
      } else {
        rules.push(parseRule(entry, source, statement.offset))
      }
    } catch (error) {
      // Attach the enclosing statement's span to the error for precise diagnostics.
      const line = lineNumberAt(source, statement.offset)
      const column = columnNumberAt(source, statement.offset)
      const message = error instanceof Error ? error.message : String(error)
      const innerSpan = error instanceof CHRParseError ? error.span : undefined
      const span = innerSpan ?? createSpan(source, statement.offset, statement.offset + statement.text.length)
      throw new CHRParseError(`Parse error near top-level statement at line ${line}, column ${column}: ${message}`, span, undefined, source)
    }
  }

  return { declarations, functionDeclarations, actionDeclarations, hostImports, rules }
}

// ---------------------------------------------------------------------------
// Statement classification helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the statement is a constraint declaration.
 *
 * Matches both singular (`constraint`) and plural (`constraints`) prefixes.
 */
function isConstraintDeclarationStatement (source: string): boolean {
  return source.startsWith('constraint ') || source.startsWith('constraints ')
}

/**
 * Returns true if the statement is a host function declaration.
 *
 * Matches both singular (`function`) and plural (`functions`) prefixes.
 */
function isFunctionDeclarationStatement (source: string): boolean {
  return source.startsWith('function ') || source.startsWith('functions ')
}

/**
 * Returns true if the statement is a host action declaration.
 *
 * Matches both singular (`action`) and plural (`actions`) prefixes.
 */
function isActionDeclarationStatement (source: string): boolean {
  return source.startsWith('action ') || source.startsWith('actions ')
}

/**
 * Returns true if the statement is an import-host statement.
 */
function isImportHostStatement (source: string): boolean {
  return source.startsWith('import host ')
}

// ---------------------------------------------------------------------------
// Host import parsing
// ---------------------------------------------------------------------------

/**
 * Parse an `import host ModuleName` statement.
 *
 * Validates that the module name is a valid identifier (lowercase letter followed
 * by alphanumerics/underscores) and returns a `HostImportDeclaration`.
 */
function parseImportHostStatement (source: string, fullSource: string, offset: number): HostImportDeclaration {
  const name = source.slice('import host '.length).trim()
  if (!name) {
    throw new CHRParseError(`Import host declaration is empty: ${source}`, createSpan(fullSource, offset, offset + source.length))
  }
  if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) {
    throw new CHRParseError(`Invalid host module name in import: ${name}`, createSpan(fullSource, offset, offset + source.length))
  }
  return { name, span: createSpan(fullSource, offset, offset + source.length) }
}

// ---------------------------------------------------------------------------
// Constraint declaration parsing
// ---------------------------------------------------------------------------

/**
 * Parse one or more `name/arity` constraint declarations from a statement.
 *
 * Supports both singular (`constraint edge/2;`) and plural (`constraints edge/2, node/1;`)
 * forms. Multiple declarations are comma-separated at the top level.
 */
function parseDeclarationStatement (source: string, fullSource: string, baseOffset: number): ConstraintDeclaration[] {
  const prefix = source.startsWith('constraints ') ? 'constraints ' : 'constraint '
  const tail = source.slice(prefix.length).trim()
  if (!tail) {
    throw new CHRParseError(`Constraint declaration is empty: ${source}`, createSpan(fullSource, baseOffset, baseOffset + source.length))
  }

  return splitTopLevelWithOffsets(tail, ',')
    .map((entry) => ({ text: entry.text.trim(), offset: baseOffset + prefix.length + entry.offset }))
    .filter((entry) => Boolean(entry.text))
    .map((entry) => parseDeclaration(entry.text, fullSource, entry.offset))
}

/**
 * Parse a single `name/arity` constraint declaration.
 *
 * Validates the identifier pattern and that the arity is a non-negative integer.
 */
function parseDeclaration (source: string, fullSource: string, offset: number): ConstraintDeclaration {
  const match = /^([a-z][A-Za-z0-9_]*)\s*\/\s*(\d+)$/.exec(source)
  if (!match) {
    throw new CHRParseError(`Invalid constraint declaration: ${source}`, createSpan(fullSource, offset, offset + source.length))
  }

  const name = match[1]
  const arity = Number(match[2])
  if (!name || Number.isNaN(arity)) {
    throw new CHRParseError(`Invalid constraint declaration: ${source}`, createSpan(fullSource, offset, offset + source.length))
  }

  return { name, arity, span: createSpan(fullSource, offset, offset + source.length) }
}

// ---------------------------------------------------------------------------
// Host function/action declaration parsing
// ---------------------------------------------------------------------------

/**
 * Parse one or more `name/arity` host declarations from a statement.
 *
 * Supports both singular (`function foo/2;`) and plural (`functions foo/2, bar/1;`)
 * forms. The `kind` parameter determines whether the declarations are for
 * functions or actions.
 */
function parseHostDeclarationStatement (
  source: string,
  fullSource: string,
  baseOffset: number,
  kind: 'function' | 'action'
): Array<HostFunctionDeclaration | HostActionDeclaration> {
  const singular = `${kind} `
  const plural = `${kind}s `
  const prefix = source.startsWith(plural) ? plural : singular
  const tail = source.slice(prefix.length).trim()
  if (!tail) {
    throw new CHRParseError(`${capitalize(kind)} declaration is empty: ${source}`, createSpan(fullSource, baseOffset, baseOffset + source.length))
  }

  return splitTopLevelWithOffsets(tail, ',')
    .map((entry) => ({ text: entry.text.trim(), offset: baseOffset + prefix.length + entry.offset }))
    .filter((entry) => Boolean(entry.text))
    .map((entry) => parseHostDeclaration(entry.text, fullSource, entry.offset))
}

/**
 * Parse a single `name/arity` host declaration.
 *
 * Host declarations have the same syntax as constraint declarations but are
 * stored separately in the `ProgramNode` because they are validated against
 * registered host modules rather than the constraint store.
 */
function parseHostDeclaration (source: string, fullSource: string, offset: number): HostFunctionDeclaration {
  const match = /^([a-z][A-Za-z0-9_]*)\s*\/\s*(\d+)$/.exec(source)
  if (!match) {
    throw new CHRParseError(`Invalid host declaration: ${source}`, createSpan(fullSource, offset, offset + source.length))
  }

  const name = match[1]
  const arity = Number(match[2])
  if (!name || Number.isNaN(arity)) {
    throw new CHRParseError(`Invalid host declaration: ${source}`, createSpan(fullSource, offset, offset + source.length))
  }

  return { name, arity, span: createSpan(fullSource, offset, offset + source.length) }
}

// ---------------------------------------------------------------------------
// Rule parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single CHR rule from a source string.
 *
 * Rule syntax (all components optional unless noted):
 *
 *     [name] @ [priority] @ [unify] [kind] head \ removed | guard => body
 *
 * Where:
 * - `name` is an optional rule identifier.
 * - `@ N @` sets an explicit numeric priority (default 0).
 * - `unify` enables structural unification for head variable binding.
 * - `kind` is one of `==>`, `<=>`, or `<=>` with `\` in the head.
 * - `head` is one or more comma-separated constraint patterns.
 * - `guard` is a comma-separated list of boolean expressions after `|`.
 * - `body` is a comma-separated list of constraint additions, actions,
 *   updates, or let-bindings.
 *
 * @param source - The raw rule source string.
 * @param fullSource - The complete `.chr` source (for span computation).
 * @param baseOffset - Byte offset of the rule within `fullSource`.
 * @returns A fully populated `RuleNode`.
 * @throws {CHRParseError} If the rule is syntactically invalid.
 */
export function parseRule (source: string, fullSource = source, baseOffset = 0): RuleNode {
  let priority: number | undefined
  let ruleSource = source

  // Extract optional `@priority@` annotation.
  if (ruleSource.startsWith('@')) {
    const priorityMatch = /^@\s*(\d+)\s*@\s*/.exec(ruleSource)
    if (priorityMatch) {
      priority = parseInt(priorityMatch[1]!, 10)
      ruleSource = ruleSource.slice(priorityMatch[0].length).trim()

      if (priority < 0 || priority > 1000000) {
        const span = createSpan(fullSource, baseOffset, baseOffset + source.length)
        throw new CHRParseError(`Rule priority must be between 0 and 1000000, got ${priority}`, span)
      }
    }
  }

  // Extract optional rule name (text before the next `@`).
  const named = splitRuleName(ruleSource)
  ruleSource = named.ruleSource
  let unify = false

  // Extract optional `unify` keyword.
  if (ruleSource.startsWith('unify ')) {
    unify = true
    ruleSource = ruleSource.slice(6).trim()
  }

  // Determine rule kind and split into head / tail.
  const kind = detectRuleKind(ruleSource)
  const [headSource, tailSource] = splitRuleOperator(ruleSource, kind)
  const [guardSource, bodySource] = splitGuard(tailSource)
  const span = createSpan(fullSource, baseOffset, baseOffset + source.length)

  if (!bodySource.trim()) {
    throw new CHRParseError(`Rule body is empty in: ${source}`, span)
  }

  const body = parseBody(bodySource)
  const base = {
    guard: parseGuardList(guardSource),
    body,
    unify,
    ...(priority !== undefined ? { priority } : {})
  }

  // Dispatch on rule kind to populate kept/removed heads correctly.
  if (kind === 'propagation') {
    const headParts = splitByBackslash(headSource)
    const kept = headParts.flatMap((part) => parseConstraints(part))
    return withOptionalName({
      kind,
      kept,
      removed: [],
      span,
      ...base
    }, named.name)
  }

  if (kind === 'simplification') {
    return withOptionalName({
      kind,
      kept: [],
      removed: parseConstraints(headSource),
      span,
      ...base
    }, named.name)
  }

  // Simpagation: everything before the `\` is kept; everything after is removed.
  const headParts = splitTopLevel(headSource, '\\')
  if (headParts.length < 2) {
    throw new CHRParseError(`Simpagation rule is missing kept/removed separator: ${source}`, span)
  }

  const kept = headParts.slice(0, -1).flatMap((part) => parseConstraints(part))
  const removed = parseConstraints(headParts[headParts.length - 1] ?? '')
  return withOptionalName({
    kind,
    kept,
    removed,
    span,
    ...base
  }, named.name)
}

/**
 * Split an optional rule name prefix from the rule source.
 *
 * Rule names are terminated by `@`. If no `@` is present the entire string is
 * treated as the rule source and no name is assigned.
 */
function splitRuleName (source: string): { name?: string, ruleSource: string } {
  const index = source.indexOf('@')
  if (index < 0) {
    return { ruleSource: source.trim() }
  }

  const name = source.slice(0, index).trim()
  const ruleSource = source.slice(index + 1).trim()
  return { name, ruleSource }
}

/**
 * Detect the rule kind by looking for the top-level rule operator.
 *
 * The parser first checks for `<=>` (simplification / simpagation) and then
 * for `==>` (propagation). String literals are temporarily masked so that the
 * operator cannot be hidden inside a quoted string.
 *
 * Simpagation is distinguished from simplification by the presence of `\` in
 * the head portion (before the operator).
 */
function detectRuleKind (source: string): RuleKind {
  const withoutStrings = source.replace(/'[^']*'|"[^"]*"/g, '""')
  const simpIdx = findTopLevelOperator(withoutStrings, '<=>')
  const propIdx = findTopLevelOperator(withoutStrings, '==>')

  if (simpIdx >= 0) {
    const before = withoutStrings.slice(0, simpIdx).trim()
    if (before.includes('\\')) return 'simpagation'
    return 'simplification'
  }

  if (propIdx >= 0) {
    return 'propagation'
  }

  throw new CHRParseError(`Unknown rule operator in: ${source}`)
}

/**
 * Split the rule source at the rule operator (`==>` or `<=>`).
 *
 * Returns `[headSource, tailSource]`. The operator itself is consumed and not
 * included in either half.
 */
function splitRuleOperator (source: string, kind: RuleKind): [string, string] {
  const operator = kind === 'propagation' ? '==>' : '<=>'
  const index = findTopLevelOperator(source, operator)
  if (index < 0) {
    throw new CHRParseError(`Could not find rule operator ${operator} in: ${source}`)
  }
  const head = source.slice(0, index).trim()
  const tail = source.slice(index + operator.length).trim()
  return [head, tail]
}

/**
 * Split a rule tail into `[guardSource, bodySource]`.
 *
 * The guard is separated from the body by a top-level `|`. If no `|` is found,
 * the entire string is treated as the body and the guard is `null`.
 */
function splitGuard (source: string): [string | null, string] {
  const result = splitTopLevelOnce(source, '|')
  if (result[1] === null) {
    return [null, source.trim()]
  }
  return [result[0]?.trim() ?? '', result[1].trim()]
}

/**
 * Parse a comma-separated guard list into an array of `Expression`.
 *
 * An empty or whitespace-only source returns an empty array (no guards).
 */
function parseGuardList (source: string | null): Expression[] {
  if (!source || !source.trim()) {
    return []
  }

  return splitTopLevel(source, ',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseExpression)
}

/**
 * Parse a comma-separated list of constraint patterns.
 *
 * Returns an array of `ConstraintPattern` objects. Empty entries are filtered
 * out so that trailing commas do not produce spurious empty patterns.
 */
function parseConstraints (source: string): ConstraintPattern[] {
  return splitTopLevel(source, ',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseConstraint)
}

/**
 * Parse a single constraint pattern like `edge(X, Y)` or `node`.
 *
 * Constraints without parentheses are treated as arity-0 (facts). The parser
 * does NOT validate the name against declared constraints; that is done later
 * by the engine.
 */
function parseConstraint (source: string): ConstraintPattern {
  const match = /^([a-z][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/.exec(source.trim())
  if (!match) {
    throw new CHRParseError(`Invalid constraint syntax: ${source}`)
  }

  const name = match[1]
  if (!name) {
    throw new CHRParseError(`Invalid constraint name in: ${source}`)
  }
  const argsSource = match[2]?.trim()
  const args = argsSource
    ? splitTopLevel(argsSource, ',').map((entry) => parseExpression(entry.trim()))
    : []

  return { name, args }
}

/**
 * Attach an optional name to a `RuleNode`.
 *
 * If `name` is undefined the rule remains anonymous. The engine assigns a
 * default name (`rule_N`) when adding the rule to its rule list.
 */
function withOptionalName (rule: Omit<RuleNode, 'name'>, name?: string): RuleNode {
  return name ? { ...rule, name } : rule
}

/**
 * Parse a comma-separated rule body into `BodyItem` objects.
 *
 * Body items are classified by their leading token:
 * - `!` → host action (`BodyAction`)
 * - `let` → local variable binding (`BodyLetBinding`)
 * - `<=` at the top level → constraint update (`BodyConstraintUpdate`)
 * - Otherwise → new constraint assertion (`BodyConstraint`)
 */
function parseBody (source: string): BodyItem[] {
  return splitTopLevel(source, ',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): BodyItem => {
      if (entry.startsWith('!')) {
        return parseAction(entry.slice(1).trim())
      }

      if (entry.startsWith('let ')) {
        return parseLetBinding(entry.slice(4).trim())
      }

      const updateIndex = findTopLevelOperator(entry, '<=')
      if (updateIndex >= 0) {
        const oldPart = entry.slice(0, updateIndex).trim()
        const newPart = entry.slice(updateIndex + 2).trim()
        const update: BodyConstraintUpdate = {
          type: 'update',
          old: parseConstraint(oldPart),
          constraint: parseConstraint(newPart)
        }
        return update
      }

      const constraint: BodyConstraint = {
        type: 'constraint',
        constraint: parseConstraint(entry)
      }
      return constraint
    })
}

/**
 * Parse a `let` binding: `let X = expression`.
 *
 * Validates that the left-hand side is a legal identifier (starts with a letter
 * or underscore, followed by alphanumerics/underscores).
 */
function parseLetBinding (source: string): BodyLetBinding {
  const eqIndex = findTopLevelOperator(source, '=')
  if (eqIndex < 0) {
    throw new CHRParseError(`Invalid let binding, expected '=': let ${source}`)
  }
  const name = source.slice(0, eqIndex).trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new CHRParseError(`Invalid variable name in let binding: ${name}`)
  }
  const exprSource = source.slice(eqIndex + 1).trim()
  return { type: 'let', name, expr: parseExpression(exprSource) }
}

/**
 * Parse a host action invocation: `!actionName(args...)`.
 *
 * The `!` prefix is stripped before parsing. The parser verifies that the
 * expression inside is a simple function call (no arbitrary expressions as
 * the "callee").
 */
function parseAction (source: string): BodyAction {
  const call = parseExpression(source)
  if (call.type !== 'call') {
    throw new CHRParseError(`Action must be a function call: ${source}`)
  }

  return {
    type: 'action',
    name: call.callee,
    args: call.args
  }
}

/**
 * Parse an expression string into an `Expression` AST node.
 *
 * This is a thin wrapper around `ExpressionParser` that tokenizes the input
 * and delegates to the recursive-descent parser. It is used by the rule parser
 * for constraint arguments, guard expressions, body items, and let-binding
 * right-hand sides.
 */
export function parseExpression (source: string): Expression {
  const tokens = tokenize(source)
  const parser = new ExpressionParser(tokens)
  return parser.parse()
}

// ---------------------------------------------------------------------------
// String splitting utilities (quote-aware, depth-aware)
// ---------------------------------------------------------------------------

/**
 * Split a source string on a single separator character (`\`) at top level only.
 *
 * Unlike `splitTopLevel`, this function returns exactly two parts: everything
 * before the first separator and everything after. It is used for simpagation
 * head splitting where we need to separate kept from removed constraints.
 */
function splitByBackslash (source: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: 'single' | 'double' | null = null

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const previous = index > 0 ? source[index - 1] : ''

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

    if (char === '\\' && depth === 0) {
      parts.push(current)
      current = ''
      index += 1
      continue
    }

    current += char
  }

  if (current) {
    parts.push(current)
  }

  return parts
}

/**
 * Split a source string on one or more separators at top level only.
 *
 * "Top level" means outside of quoted strings (`'...'` or `"..."`) and outside
 * of nested brackets/parens/braces. This prevents constraint arguments that
 * contain commas from being split incorrectly.
 *
 * @param source - The source string to split.
 * @param separator - A single separator string or an array of multi-character
 *   separators. Multi-character separators are matched left-to-right.
 * @returns An array of non-empty trimmed parts.
 */
function splitTopLevel (source: string, separator: string | string[]): string[] {
  const separators = Array.isArray(separator) ? separator : [separator]
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

    if (depth === 0) {
      const sepIndex = separators.findIndex((sep) => source.startsWith(sep, index))
      if (sepIndex >= 0) {
        parts.push(current)
        current = ''
        index += separators[sepIndex]!.length - 1
        continue
      }
    }

    current += char
  }

  if (current) {
    parts.push(current)
  }

  return parts
}

/**
 * Split a source string on a separator at top level only, returning at most
 * two parts: `[before, after]`.
 *
 * If the separator is not found, returns `[source.trim(), null]`. If found,
 * returns `[partBefore, restAfter]` where `restAfter` includes any additional
 * occurrences of the separator joined back together. This is used for guard/body
 * splitting where the body may contain `|` inside strings or nested expressions.
 */
function splitTopLevelOnce (source: string, separator: string): [string | null, string | null] {
  const parts = splitTopLevel(source, separator)
  if (parts.length < 2) {
    return [source.trim(), null]
  }

  return [parts[0]?.trim() ?? null, parts.slice(1).join(separator).trim()]
}

/**
 * Find the index of a multi-character operator at top level.
 *
 * Returns the 0-based index of the operator in the source string, or -1 if not
 * found. The search is quote-aware and depth-aware so that operators inside
 * strings or nested brackets are ignored.
 */
function findTopLevelOperator (source: string, operator: string): number {
  let depth = 0
  let quote: 'single' | 'double' | null = null
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (((quote === 'single' && char === "'") || (quote === 'double' && char === '"')) && source[index - 1] !== '\\') {
        quote = null
      }
      continue
    }
    if (char === "'") { quote = 'single'; continue }
    if (char === '"') { quote = 'double'; continue }
    if (char === '(' || char === '[' || char === '{') { depth += 1; continue }
    if (char === ')' || char === ']' || char === '}') { depth -= 1; continue }
    if (depth === 0 && source.startsWith(operator, index)) {
      return index
    }
  }
  return -1
}

/**
 * Split a source string on a separator at top level, preserving the byte offset
 * of each part relative to the original source.
 *
 * This is the offset-aware variant of `splitTopLevel`. Offsets are computed
 * incrementally during the scan, so the caller can use them to construct
 * accurate `SourceSpan` values for error reporting.
 */
function splitTopLevelWithOffsets (source: string, separator: string): Array<{ text: string, offset: number }> {
  const parts: Array<{ text: string, offset: number }> = []
  let current = ''
  let depth = 0
  let quote: 'single' | 'double' | null = null
  let currentOffset = 0

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const previous = index > 0 ? source[index - 1] : ''

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
      parts.push({ text: current, offset: currentOffset })
      current = ''
      index += separator.length - 1
      currentOffset = index + 1
      continue
    }

    current += char
  }

  if (current) {
    parts.push({ text: current, offset: currentOffset })
  }

  return parts
}

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Strip line-level comments from source text.
 *
 * CHR.ts supports three comment syntaxes:
 * - `#` (Prolog-style)
 * - `%` (CHR classic)
 * - `--` (SQL-style)
 *
 * Comments run from the marker to the end of the line. They are NOT stripped
 * inside quoted strings. The function preserves the original line structure so
 * that line/column numbers remain valid for error reporting.
 */
function stripComments (source: string): string {
  const lines = source.split('\n')
  const stripped = lines.map((line) => {
    let inString: false | '"' | "'" = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!
      if (!inString) {
        if (char === '"' || char === "'") {
          inString = char
        } else if (char === '#' || char === '%' || (char === '-' && line[i + 1] === '-')) {
          return line.slice(0, i)
        }
      } else if (char === inString && line[i - 1] !== '\\') {
        inString = false
      }
    }
    return line
  })
  return stripped.join('\n')
}

// ---------------------------------------------------------------------------
// Source location helpers
// ---------------------------------------------------------------------------

/**
 * Compute the 1-based line number at a given 0-based byte offset.
 */
function lineNumberAt (source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === '\n') {
      line += 1
    }
  }
  return line
}

/**
 * Compute the 1-based column number at a given 0-based byte offset.
 *
 * Column resets to 1 after each newline.
 */
function columnNumberAt (source: string, offset: number): number {
  let column = 1
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === '\n') {
      column = 1
    } else {
      column += 1
    }
  }
  return column
}

/**
 * Build a `SourceSpan` from start and end byte offsets.
 */
function createSpan (source: string, startOffset: number, endOffset: number): SourceSpan {
  return {
    start: {
      offset: startOffset,
      line: lineNumberAt(source, startOffset),
      column: columnNumberAt(source, startOffset)
    },
    end: {
      offset: endOffset,
      line: lineNumberAt(source, endOffset),
      column: columnNumberAt(source, endOffset)
    }
  }
}

/**
 * Capitalize the first character of a string.
 */
function capitalize (value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

/**
 * Convert a source string into a flat array of `Token` objects.
 *
 * The lexer operates in a single left-to-right pass. It recognizes:
 * - Whitespace (skipped)
 * - Multi-character operators: `===`, `!==`, `<=`, `>=`, `&&`, `||`
 * - Single-character operators: `<`, `>`, `+`, `-`, `*`, `/`, `!`
 * - Parentheses, brackets, braces: `(`, `)`, `[`, `]`, `{`, `}`
 * - Comma: `,`
 * - String literals: `'...'` or `"..."`
 * - Number literals: sequences of digits and decimal points
 * - Identifiers / keywords: `[A-Za-z_][A-Za-z0-9_]*`
 *   - `true`, `false` → boolean tokens
 *   - `null` → null token
 *   - Otherwise → identifier token
 *
 * An `eof` token is always appended as the sentinel.
 */
function tokenize (source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if (!char) {
      break
    }

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    // Three-character operators (must be checked before two-character).
    const threeChar = source.slice(index, index + 3)
    if (threeChar === '===') {
      tokens.push({ type: 'operator', value: '===' })
      index += 3
      continue
    }
    if (threeChar === '!==') {
      tokens.push({ type: 'operator', value: '!==' })
      index += 3
      continue
    }

    // Two-character operators.
    const twoChar = source.slice(index, index + 2)
    if (['<=', '>=', '&&', '||'].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar })
      index += 2
      continue
    }

    // Single-character operators.
    if (['<', '>', '+', '-', '*', '/', '!'].includes(char)) {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }

    // Brackets / parens.
    if (char === '(' || char === ')' || char === '[' || char === ']' || char === '{' || char === '}') {
      tokens.push({ type: 'paren', value: char })
      index += 1
      continue
    }

    // Comma.
    if (char === ',') {
      tokens.push({ type: 'comma', value: char })
      index += 1
      continue
    }

    // String literals.
    if (char === '"' || char === "'") {
      let value = ''
      const quote = char
      index += 1
      while (index < source.length) {
        const next = source[index]
        if (!next) {
          break
        }
        if (next === quote && source[index - 1] !== '\\') {
          index += 1
          break
        }
        value += next
        index += 1
      }
      tokens.push({ type: 'string', value })
      continue
    }

    // Numeric literals.
    if (/\d/.test(char)) {
      let value = char
      index += 1
      while (index < source.length && /[\d.]/.test(source[index] ?? '')) {
        value += source[index]
        index += 1
      }
      tokens.push({ type: 'number', value })
      continue
    }

    // Identifiers and keywords.
    if (/[A-Za-z_]/.test(char)) {
      let value = char
      index += 1
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index] ?? '')) {
        value += source[index]
        index += 1
      }
      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value })
      } else if (value === 'null') {
        tokens.push({ type: 'null', value })
      } else {
        tokens.push({ type: 'identifier', value })
      }
      continue
    }

    throw new CHRParseError(`Unexpected token '${char}' in expression: ${source}`)
  }

  tokens.push({ type: 'eof', value: '' })
  return tokens
}

// ---------------------------------------------------------------------------
// Expression parser (recursive descent, precedence climbing)
// ---------------------------------------------------------------------------

/**
 * Recursive-descent expression parser with proper operator precedence.
 *
 * Grammar (highest to lowest precedence):
 *
 *   expression  → logicalOr
 *   logicalOr   → logicalAnd (|| logicalAnd)*
 *   logicalAnd  → equality (&& equality)*
 *   equality    → comparison ((=== | !==) comparison)*
 *   comparison  → additive ((<= | >= | < | > | in) additive)*
 *   additive    → multiplicative ((+ | -) multiplicative)*
 *   multiplicative → primary ((* | /) primary)*
 *   primary     → ! primary | - primary
 *                | number | string | boolean | null
 *                | identifier | identifier(args...)
 *                | ( expression ) | [ expression, ... ]
 *
 * Left-associative operators are handled by the while-loop pattern in each
 * method. `in` is parsed as a comparison operator (not a special keyword).
 *
 * The parser throws `CHRParseError` on unexpected tokens or unbalanced
 * parentheses/brackets.
 */
class ExpressionParser {
  constructor (private readonly tokens: Token[], private index = 0) {}

  /**
   * Parse a complete expression and verify EOF.
   *
   * @returns The root `Expression` AST node.
   * @throws {CHRParseError} If extra tokens remain after parsing.
   */
  parse (): Expression {
    const expression = this.parseLogicalOr()
    this.expect('eof')
    return expression
  }

  // logicalOr → logicalAnd (|| logicalAnd)*
  private parseLogicalOr (): Expression {
    let expr = this.parseLogicalAnd()
    while (this.matchOperator('||')) {
      expr = this.binary('||', expr, this.parseLogicalAnd())
    }
    return expr
  }

  // logicalAnd → equality (&& equality)*
  private parseLogicalAnd (): Expression {
    let expr = this.parseEquality()
    while (this.matchOperator('&&')) {
      expr = this.binary('&&', expr, this.parseEquality())
    }
    return expr
  }

  // equality → comparison ((=== | !==) comparison)*
  private parseEquality (): Expression {
    let expr = this.parseComparison()
    while (true) {
      if (this.matchOperator('===')) {
        expr = this.binary('===', expr, this.parseComparison())
        continue
      }
      if (this.matchOperator('!==')) {
        expr = this.binary('!==', expr, this.parseComparison())
        continue
      }
      return expr
    }
  }

  // comparison → additive ((<= | >= | < | > | in) additive)*
  private parseComparison (): Expression {
    let expr = this.parseAdditive()
    while (true) {
      if (this.matchOperator('<=')) {
        expr = this.binary('<=', expr, this.parseAdditive())
        continue
      }
      if (this.matchOperator('>=')) {
        expr = this.binary('>=', expr, this.parseAdditive())
        continue
      }
      if (this.matchOperator('<')) {
        expr = this.binary('<', expr, this.parseAdditive())
        continue
      }
      if (this.matchOperator('>')) {
        expr = this.binary('>', expr, this.parseAdditive())
        continue
      }
      if (this.matchKeyword('in')) {
        expr = this.binary('in', expr, this.parseAdditive())
        continue
      }
      return expr
    }
  }

  // additive → multiplicative ((+ | -) multiplicative)*
  private parseAdditive (): Expression {
    let expr = this.parseMultiplicative()
    while (true) {
      if (this.matchOperator('+')) {
        expr = this.binary('+', expr, this.parseMultiplicative())
        continue
      }
      if (this.matchOperator('-')) {
        expr = this.binary('-', expr, this.parseMultiplicative())
        continue
      }
      return expr
    }
  }

  // multiplicative → primary ((* | /) primary)*
  private parseMultiplicative (): Expression {
    let expr = this.parsePrimary()
    while (true) {
      if (this.matchOperator('*')) {
        expr = this.binary('*', expr, this.parsePrimary())
        continue
      }
      if (this.matchOperator('/')) {
        expr = this.binary('/', expr, this.parsePrimary())
        continue
      }
      return expr
    }
  }

  // primary → literals | identifiers | calls | parenthesized | arrays | unary
  private parsePrimary (): Expression {
    // Unary prefix operators.
    if (this.matchOperator('!')) {
      const operand = this.parsePrimary()
      return { type: 'unary', operator: '!', operand }
    }
    if (this.matchOperator('-')) {
      const operand = this.parsePrimary()
      return { type: 'unary', operator: '-', operand }
    }

    const token = this.peek()

    // Numeric literal.
    if (token.type === 'number') {
      this.advance()
      const literal: LiteralExpression = { type: 'literal', value: Number(token.value) }
      return literal
    }

    // String literal.
    if (token.type === 'string') {
      this.advance()
      return { type: 'literal', value: token.value }
    }

    // Boolean literal.
    if (token.type === 'boolean') {
      this.advance()
      return { type: 'literal', value: token.value === 'true' }
    }

    // Null literal.
    if (token.type === 'null') {
      this.advance()
      return { type: 'literal', value: null }
    }

    // Identifier or function call.
    if (token.type === 'identifier') {
      this.advance()
      // Function call: identifier followed by `(`.
      if (this.matchParen('(')) {
        const args: Expression[] = []
        if (!this.matchParen(')')) {
          do {
            args.push(this.parseLogicalOr())
          } while (this.match('comma'))
          this.expectParen(')')
        }
        const call: CallExpression = { type: 'call', callee: token.value, args }
        return call
      }

      // Variable: identifier starting with uppercase letter or underscore.
      if (/^[A-Z_]/.test(token.value)) {
        const variable: VariableExpression = { type: 'variable', name: token.value }
        return variable
      }

      // Lowercase identifier without parens: treated as a literal string value.
      return { type: 'literal', value: token.value }
    }

    // Parenthesized expression.
    if (this.matchParen('(')) {
      const expr = this.parseLogicalOr()
      this.expectParen(')')
      return expr
    }

    // Array literal.
    if (this.matchParen('[')) {
      const elements: Expression[] = []
      if (!this.matchParen(']')) {
        do {
          elements.push(this.parseLogicalOr())
        } while (this.match('comma'))
        this.expectParen(']')
      }
      return { type: 'array', elements }
    }

    throw new CHRParseError(`Unexpected token ${token.value || token.type} in expression`)
  }

  private binary (operator: BinaryExpression['operator'], left: Expression, right: Expression): BinaryExpression {
    return { type: 'binary', operator, left, right }
  }

  private peek (): Token {
    return this.tokens[this.index] ?? { type: 'eof', value: '' }
  }

  private advance (): Token {
    const token = this.peek()
    this.index += 1
    return token
  }

  private match (type: TokenType): boolean {
    if (this.peek().type === type) {
      this.advance()
      return true
    }
    return false
  }

  private matchOperator (value: string): boolean {
    if (this.peek().type === 'operator' && this.peek().value === value) {
      this.advance()
      return true
    }
    return false
  }

  private matchKeyword (value: string): boolean {
    const token = this.peek()
    if (token.type === 'identifier' && token.value === value) {
      this.advance()
      return true
    }
    return false
  }

  private matchParen (value: '(' | ')' | '[' | ']'): boolean {
    if (this.peek().type === 'paren' && this.peek().value === value) {
      this.advance()
      return true
    }
    return false
  }

  private expect (type: TokenType): void {
    if (!this.match(type)) {
      throw new CHRParseError(`Expected ${type} but found ${this.peek().type}`)
    }
  }

  private expectParen (value: '(' | ')' | '[' | ']'): void {
    if (!this.matchParen(value)) {
      throw new CHRParseError(`Expected '${value}' but found ${this.peek().value || this.peek().type}`)
    }
  }
}
