import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProgram, parseRule, parseExpression, CHRParseError } from '../dist/index.js'

test('parseProgram ignores line comments', () => {
  const program = parseProgram(`
    -- this is a comment
    constraint a/1;
    -- another comment
    step @ a ==> b;
  `)
  assert.equal(program.rules.length, 1)
  assert.equal(program.declarations.length, 1)
})

test('parseProgram ignores hash comments', () => {
  const program = parseProgram(`
    # hash comment
    constraint a/1;
    # another
    step @ a ==> b;
  `)
  assert.equal(program.rules.length, 1)
  assert.equal(program.declarations.length, 1)
})

test('parseProgram ignores percent comments', () => {
  const program = parseProgram(`
    % percent comment
    constraint a/1;
    step @ a ==> b;
  `)
  assert.equal(program.rules.length, 1)
  assert.equal(program.declarations.length, 1)
})

test('parseProgram ignores inline comments after rules', () => {
  const program = parseProgram(`
    step @ a ==> b; -- inline comment
    constraint c/1;
  `)
  assert.equal(program.rules.length, 1)
  assert.equal(program.declarations.length, 1)
})

test('parseProgram handles comment-only input', () => {
  const program = parseProgram(`
    -- only comments here
    # and here
    % and here
  `)
  assert.equal(program.rules.length, 0)
  assert.equal(program.declarations.length, 0)
})

test('parseProgram handles mixed comments and declarations', () => {
  const program = parseProgram(`
    -- declare constraints
    constraint a/1, b/1;
    -- declare functions
    functions foo/1;
    -- rules
    r @ a(X) ==> b(X);
  `)
  assert.equal(program.rules.length, 1)
  assert.equal(program.declarations.length, 1)
  assert.equal(program.functionDeclarations.length, 1)
})

test('parseExpression handles escaped double-quoted strings', () => {
  const expr = parseExpression('"hello \\\"world\\\" here"')
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, 'hello "world" here')
})

test('parseExpression handles escaped single-quoted strings', () => {
  const expr = parseExpression("'hello \\'world\\' here'")
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, "hello 'world' here")
})

test('parseExpression handles escaped backslash', () => {
  const expr = parseExpression('"path\\\\to\\\\file"')
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, 'path\\to\\file')
})

test('parseExpression handles empty string', () => {
  const expr = parseExpression('""')
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, '')
})

test('parseExpression handles single-quoted empty string', () => {
  const expr = parseExpression("''")
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, '')
})

test('parseExpression handles empty array literal', () => {
  const expr = parseExpression('[]')
  assert.equal(expr.type, 'array')
  assert.equal(expr.elements.length, 0)
})

test('parseRule handles zero-argument constraint without parens', () => {
  const rule = parseRule('step @ done ==> true;')
  assert.equal(rule.kept[0].name, 'done')
  assert.equal(rule.kept[0].args.length, 0)
})

test('parseRule handles zero-argument constraint with parens', () => {
  const rule = parseRule('step @ done() ==> true;')
  assert.equal(rule.kept[0].name, 'done')
  assert.equal(rule.kept[0].args.length, 0)
})

test('parseRule handles deeply nested unary expressions', () => {
  const rule = parseRule('step @ a(X) ==> !!!gt(X, 0) | b(X);')
  assert.equal(rule.guard.length, 1)
  const guard = rule.guard[0]
  assert.equal(guard.type, 'unary')
  assert.equal(guard.operator, '!')
  assert.equal(guard.operand.type, 'unary')
  assert.equal(guard.operand.operator, '!')
})

test('parseRule handles unary minus in expression', () => {
  const rule = parseRule('step @ a(X) ==> gt(X, -5) | b(X);')
  assert.equal(rule.guard[0].type, 'call')
  assert.equal(rule.guard[0].args[1].type, 'unary')
  assert.equal(rule.guard[0].args[1].operator, '-')
  assert.equal(rule.guard[0].args[1].operand.value, 5)
})

test('parseRule rejects unclosed string', () => {
  assert.throws(() => {
    parseRule('step @ a("unclosed) ==> b;')
  }, /unclosed string|string/i)
})

test('parseRule rejects unknown operator', () => {
  assert.throws(() => {
    parseRule('step @ a(X) ==> X == 1 | b;')
  })
})

test('parseRule handles multiple head constraints with repeated variables', () => {
  const rule = parseRule('join @ a(X), a(X) ==> true | b(X);')
  assert.equal(rule.kept.length, 2)
  assert.equal(rule.kept[0].args[0].name, 'X')
  assert.equal(rule.kept[1].args[0].name, 'X')
})

test('parseExpression handles nested binary expressions', () => {
  const expr = parseExpression('a + b * c - d / e')
  assert.equal(expr.type, 'binary')
  assert.equal(expr.operator, '-')
  assert.equal(expr.left.type, 'binary')
  assert.equal(expr.left.operator, '+')
  assert.equal(expr.right.type, 'binary')
  assert.equal(expr.right.operator, '/')
})

test('parseExpression handles parenthesized expressions', () => {
  const expr = parseExpression('(a + b) * c')
  assert.equal(expr.type, 'binary')
  assert.equal(expr.operator, '*')
  assert.equal(expr.left.type, 'binary')
  assert.equal(expr.left.operator, '+')
})

test('parseRule handles array literal in head', () => {
  const rule = parseRule('step @ a([1, 2, 3]) ==> true;')
  assert.equal(rule.kept[0].args[0].type, 'array')
  assert.equal(rule.kept[0].args[0].elements.length, 3)
})

test('parseRule handles function call in body with array arg', () => {
  const rule = parseRule('step @ a(X) ==> result(foo([1, 2, 3]));')
  assert.equal(rule.body[0].type, 'constraint')
  assert.equal(rule.body[0].constraint.args[0].type, 'call')
  assert.equal(rule.body[0].constraint.args[0].args[0].type, 'array')
})

test('parseRule preserves source spans for rule with name', () => {
  const rule = parseRule('myRule @ a(X) ==> b(X);')
  assert.ok(rule.span)
  assert.ok(rule.span.start.line >= 1)
  assert.ok(rule.name === 'myRule')
})

test('parseRule preserves source spans for anonymous rule', () => {
  const rule = parseRule('a(X) ==> b(X);')
  assert.ok(rule.span)
  assert.ok(rule.name === undefined)
})

test('parseExpression handles single-quoted string with special chars', () => {
  const expr = parseExpression("'tab\\there\\nnewline'")
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, 'tab\there\nnewline')
})

test('parseExpression parses double-quoted string with special chars', () => {
  const expr = parseExpression('"tab\\there\\nnewline"')
  assert.equal(expr.type, 'literal')
  assert.equal(expr.value, 'tab\there\nnewline')
})

test('parseRule handles unary not in guard', () => {
  const rule = parseRule('step @ a(X) ==> !positive(X) | b(X);')
  assert.equal(rule.guard[0].type, 'unary')
  assert.equal(rule.guard[0].operator, '!')
  assert.equal(rule.guard[0].operand.type, 'call')
  assert.equal(rule.guard[0].operand.callee, 'positive')
})

test('parseRule handles logical or in guard', () => {
  const rule = parseRule('step @ a(X) ==> gt(X, 0) || lt(X, -10) | b(X);')
  assert.equal(rule.guard[0].type, 'binary')
  assert.equal(rule.guard[0].operator, '||')
})

test('parseRule handles logical and in guard', () => {
  const rule = parseRule('step @ a(X) ==> gt(X, 0) && lt(X, 100) | b(X);')
  assert.equal(rule.guard[0].type, 'binary')
  assert.equal(rule.guard[0].operator, '&&')
})

test('parseRule handles in operator in guard', () => {
  const rule = parseRule('step @ a(X) ==> X in [1, 2, 3] | b(X);')
  assert.equal(rule.guard[0].type, 'binary')
  assert.equal(rule.guard[0].operator, 'in')
})

test('parseRule handles not-equal operator', () => {
  const rule = parseRule('step @ a(X) ==> neq(X, 0) | b(X);')
  assert.equal(rule.guard[0].type, 'call')
  assert.equal(rule.guard[0].callee, 'neq')
})
