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

type TokenType = 'identifier' | 'number' | 'string' | 'boolean' | 'null' | 'operator' | 'paren' | 'comma' | 'eof'

interface Token {
  type: TokenType
  value: string
}

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

  for (const statement of splitTopLevelWithOffsets(source, ';')) {
    const entry = statement.text.trim()
    if (!entry) {
      continue
    }

    try {
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

function isConstraintDeclarationStatement (source: string): boolean {
  return source.startsWith('constraint ') || source.startsWith('constraints ')
}

function isFunctionDeclarationStatement (source: string): boolean {
  return source.startsWith('function ') || source.startsWith('functions ')
}

function isActionDeclarationStatement (source: string): boolean {
  return source.startsWith('action ') || source.startsWith('actions ')
}

function isImportHostStatement (source: string): boolean {
  return source.startsWith('import host ')
}

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

export function parseRule (source: string, fullSource = source, baseOffset = 0): RuleNode {
  let priority: number | undefined
  let ruleSource = source

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

  const named = splitRuleName(ruleSource)
  ruleSource = named.ruleSource
  let unify = false

  if (ruleSource.startsWith('unify ')) {
    unify = true
    ruleSource = ruleSource.slice(6).trim()
  }

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

function splitRuleName (source: string): { name?: string, ruleSource: string } {
  const index = source.indexOf('@')
  if (index < 0) {
    return { ruleSource: source.trim() }
  }

  const name = source.slice(0, index).trim()
  const ruleSource = source.slice(index + 1).trim()
  return { name, ruleSource }
}

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

function splitGuard (source: string): [string | null, string] {
  const result = splitTopLevelOnce(source, '|')
  if (result[1] === null) {
    return [null, source.trim()]
  }
  return [result[0]?.trim() ?? '', result[1].trim()]
}

function parseGuardList (source: string | null): Expression[] {
  if (!source || !source.trim()) {
    return []
  }

  return splitTopLevel(source, ',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseExpression)
}

function parseConstraints (source: string): ConstraintPattern[] {
  return splitTopLevel(source, ',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseConstraint)
}

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

function withOptionalName (rule: Omit<RuleNode, 'name'>, name?: string): RuleNode {
  return name ? { ...rule, name } : rule
}

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

export function parseExpression (source: string): Expression {
  const tokens = tokenize(source)
  const parser = new ExpressionParser(tokens)
  return parser.parse()
}

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

function splitTopLevelOnce (source: string, separator: string): [string | null, string | null] {
  const parts = splitTopLevel(source, separator)
  if (parts.length < 2) {
    return [source.trim(), null]
  }

  return [parts[0]?.trim() ?? null, parts.slice(1).join(separator).trim()]
}

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

function lineNumberAt (source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === '\n') {
      line += 1
    }
  }
  return line
}

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

function capitalize (value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

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

    const twoChar = source.slice(index, index + 2)
    if (['<=', '>=', '&&', '||'].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar })
      index += 2
      continue
    }

    if (['<', '>', '+', '-', '*', '/', '!'].includes(char)) {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }

    if (char === '(' || char === ')' || char === '[' || char === ']' || char === '{' || char === '}') {
      tokens.push({ type: 'paren', value: char })
      index += 1
      continue
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: char })
      index += 1
      continue
    }

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

class ExpressionParser {
  constructor (private readonly tokens: Token[], private index = 0) {}

  parse (): Expression {
    const expression = this.parseLogicalOr()
    this.expect('eof')
    return expression
  }

  private parseLogicalOr (): Expression {
    let expr = this.parseLogicalAnd()
    while (this.matchOperator('||')) {
      expr = this.binary('||', expr, this.parseLogicalAnd())
    }
    return expr
  }

  private parseLogicalAnd (): Expression {
    let expr = this.parseEquality()
    while (this.matchOperator('&&')) {
      expr = this.binary('&&', expr, this.parseEquality())
    }
    return expr
  }

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

  private parsePrimary (): Expression {
    if (this.matchOperator('!')) {
      const operand = this.parsePrimary()
      return { type: 'unary', operator: '!', operand }
    }
    if (this.matchOperator('-')) {
      const operand = this.parsePrimary()
      return { type: 'unary', operator: '-', operand }
    }

    const token = this.peek()

    if (token.type === 'number') {
      this.advance()
      const literal: LiteralExpression = { type: 'literal', value: Number(token.value) }
      return literal
    }

    if (token.type === 'string') {
      this.advance()
      return { type: 'literal', value: token.value }
    }

    if (token.type === 'boolean') {
      this.advance()
      return { type: 'literal', value: token.value === 'true' }
    }

    if (token.type === 'null') {
      this.advance()
      return { type: 'literal', value: null }
    }

    if (token.type === 'identifier') {
      this.advance()
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

      if (/^[A-Z_]/.test(token.value)) {
        const variable: VariableExpression = { type: 'variable', name: token.value }
        return variable
      }

      return { type: 'literal', value: token.value }
    }

    if (this.matchParen('(')) {
      const expr = this.parseLogicalOr()
      this.expectParen(')')
      return expr
    }

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