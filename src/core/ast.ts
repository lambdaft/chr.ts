export type RuleKind = 'propagation' | 'simplification' | 'simpagation'

export interface SourceLocation {
  line: number
  column: number
  offset: number
}

export interface SourceSpan {
  start: SourceLocation
  end: SourceLocation
}

export interface VariableExpression {
  type: 'variable'
  name: string
}

export interface LiteralExpression {
  type: 'literal'
  value: string | number | boolean | null
}

export interface UnaryExpression {
  type: 'unary'
  operator: '!' | '-'
  operand: Expression
}

export interface BinaryExpression {
  type: 'binary'
  operator: '||' | '&&' | '===' | '!==' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | 'in'
  left: Expression
  right: Expression
}

export interface CallExpression {
  type: 'call'
  callee: string
  args: Expression[]
}

export interface ArrayExpression {
  type: 'array'
  elements: Expression[]
}

export type Expression = VariableExpression | LiteralExpression | UnaryExpression | BinaryExpression | CallExpression | ArrayExpression

export interface ConstraintPattern {
  name: string
  args: Expression[]
}

export type GuardExpression = Expression

export interface BodyConstraint {
  type: 'constraint'
  constraint: ConstraintPattern
}

export interface BodyAction {
  type: 'action'
  name: string
  args: Expression[]
}

export interface BodyConstraintUpdate {
  type: 'update'
  old: ConstraintPattern
  constraint: ConstraintPattern
}

export interface BodyLetBinding {
  type: 'let'
  name: string
  expr: Expression
}

export type BodyItem = BodyConstraint | BodyAction | BodyConstraintUpdate | BodyLetBinding

export interface RuleNode {
  name?: string
  kind: RuleKind
  kept: ConstraintPattern[]
  removed: ConstraintPattern[]
  guard: GuardExpression[]
  body: BodyItem[]
  span?: SourceSpan
  priority?: number
  unify?: boolean
}

export interface ConstraintDeclaration {
  name: string
  arity: number
  span?: SourceSpan
}

export interface HostFunctionDeclaration {
  name: string
  arity: number
  span?: SourceSpan
}

export interface HostActionDeclaration {
  name: string
  arity: number
  span?: SourceSpan
}

export interface HostImportDeclaration {
  name: string
  span?: SourceSpan
}

export interface ProgramNode {
  declarations: ConstraintDeclaration[]
  functionDeclarations: HostFunctionDeclaration[]
  actionDeclarations: HostActionDeclaration[]
  hostImports: HostImportDeclaration[]
  rules: RuleNode[]
}

export interface RuleFireTrace {
  ruleName: string
  kind: RuleKind
  priority?: number
  matchedConstraintIds: number[]
  bindings: Record<string, unknown>
  guardResults?: unknown[]
  firedAt?: number
  durationMs?: number
}
