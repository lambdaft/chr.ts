import test from 'node:test'
import assert from 'node:assert/strict'
import { parseExpression, parseProgram, parseRule } from '../dist/index.js'

test('parseProgram returns empty program for blank input', () => {
  const program = parseProgram('   ')
  assert.deepEqual(program, {
    declarations: [],
    functionDeclarations: [],
    actionDeclarations: [],
    hostImports: [],
    rules: []
  })
})

test('parseExpression respects arithmetic precedence', () => {
  const expr = parseExpression('A + 1 * 2')
  assert.equal(expr.type, 'binary')
  assert.equal(expr.operator, '+')
  assert.equal(expr.right.type, 'binary')
  assert.equal(expr.right.operator, '*')
})

test('parseExpression parses function calls with literals and variables', () => {
  const expr = parseExpression('positive(X, 3)')
  assert.equal(expr.type, 'call')
  assert.equal(expr.callee, 'positive')
  assert.equal(expr.args.length, 2)
})

test('parseRule parses propagation rules', () => {
  const rule = parseRule('grow @ seed(X) ==> X > 0 | next(X)')
  assert.equal(rule.kind, 'propagation')
  assert.equal(rule.name, 'grow')
  assert.equal(rule.kept.length, 1)
  assert.equal(rule.removed.length, 0)
})

test('parseRule parses simplification rules', () => {
  const rule = parseRule('finish @ done(X) <=> result(X)')
  assert.equal(rule.kind, 'simplification')
  assert.equal(rule.kept.length, 0)
  assert.equal(rule.removed.length, 1)
})

test('parseRule parses simpagation rules', () => {
  const rule = parseRule('retain @ keep(X) \\ drop(X) <=> mark(X)')
  assert.equal(rule.kind, 'simpagation')
  assert.equal(rule.kept.length, 1)
  assert.equal(rule.removed.length, 1)
})

test('parseRule parses explicit body actions', () => {
  const rule = parseRule('approve @ input(X) ==> X > 0 | !record(X), approved(X)')
  assert.equal(rule.body[0].type, 'action')
  assert.equal(rule.body[1].type, 'constraint')
})

test('parseProgram parses constraint declarations', () => {
  const program = parseProgram('constraints a/1, b/2; go @ a(X) ==> b(X, X);')
  assert.equal(program.declarations.length, 2)
  assert.equal(program.rules.length, 1)
})

test('parseProgram preserves source spans for rules', () => {
  const program = parseProgram('go @ a(X) ==> b(X);')
  assert.ok(program.rules[0].span)
  assert.equal(program.rules[0].span.start.line, 1)
})

test('parseExpression parses string literals', () => {
  const expr = parseExpression(`"east"`)
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, 'east')
})

test('parseProgram reports invalid declarations with spans', () => {
  assert.throws(() => parseProgram('constraints bad;'), (error) => {
    assert.match(error.message, /Invalid constraint declaration/)
    assert.ok(error.span)
    return true
  })
})

test('parseRule parses propagation rule with priority', () => {
  const rule = parseRule('@100 @ foo(X) ==> bar(X) | true')
  assert.equal(rule.kind, 'propagation')
  assert.equal(rule.priority, 100)
  assert.equal(rule.name, undefined)
})

test('parseRule parses simplification rule with priority', () => {
  const rule = parseRule('@50 @ foo(X) <=> bar(X) | true')
  assert.equal(rule.kind, 'simplification')
  assert.equal(rule.priority, 50)
})

test('parseRule parses simpagation rule with priority', () => {
  const rule = parseRule('@10 @ foo(X) \\ bar(X) <=> baz(X) | true')
  assert.equal(rule.kind, 'simpagation')
  assert.equal(rule.priority, 10)
})

test('parseRule leaves priority undefined when not present', () => {
  const rule = parseRule('foo(X) ==> bar(X) | true')
  assert.equal(rule.priority, undefined)
})

test('parseRule accepts priority zero', () => {
  const rule = parseRule('@0 @ foo(X) ==> bar(X) | true')
  assert.equal(rule.priority, 0)
})

test('parseRule accepts maximum priority', () => {
  const rule = parseRule('@1000000 @ foo(X) ==> bar(X) | true')
  assert.equal(rule.priority, 1000000)
})

test('parseRule rejects out-of-range priority above maximum', () => {
  assert.throws(() => parseRule('@1000001 @ foo(X) ==> bar(X) | true'), (error) => {
    assert.match(error.message, /Rule priority must be between 0 and 1000000/)
    return true
  })
})

test('parseRule rejects invalid priority syntax', () => {
  assert.throws(() => parseRule('@-1 @ foo(X) ==> bar(X) | true'))
})
