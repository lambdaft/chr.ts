// src/core/errors.ts
function formatSourceSpan(source, span) {
  const lines = source.split("\n");
  const lineIndex = span.start.line - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) return "";
  const line = lines[lineIndex];
  if (line == null) return "";
  const col = span.start.column - 1;
  const caret = " ".repeat(Math.max(0, col)) + "^";
  return `
  ${line}
  ${caret}`;
}
var CHRParseError = class extends Error {
  span;
  cause;
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
  constructor(message, span, cause, source) {
    const formatted = span && source ? message + formatSourceSpan(source, span) : message;
    super(formatted, { cause });
    this.name = "CHRParseError";
    this.span = span;
    this.cause = cause;
  }
};
var CHRExecutionError = class extends Error {
  span;
  cause;
  /**
   * Construct an execution error.
   *
   * @param message - Human-readable error description.
   * @param span - Optional source location of the error.
   * @param cause - Optional underlying error for cause chaining.
   * @param source - Optional complete source text (needed for caret formatting).
   */
  constructor(message, span, cause, source) {
    const formatted = span && source ? message + formatSourceSpan(source, span) : message;
    super(formatted, { cause });
    this.name = "CHRExecutionError";
    this.span = span;
    this.cause = cause;
  }
};
var CHRGuardError = class extends Error {
  span;
  cause;
  /**
   * Construct a guard error.
   *
   * @param message - Human-readable error description.
   * @param span - Optional source location of the error.
   * @param cause - Optional underlying error for cause chaining.
   */
  constructor(message, span, cause) {
    super(message, { cause });
    this.name = "CHRGuardError";
    this.span = span;
    this.cause = cause;
  }
};

// src/core/utils.ts
function numeric(value) {
  if (typeof value !== "number") {
    throw new CHRExecutionError("Numeric operation requires number operands.");
  }
  return value;
}
function compare(left, right, op) {
  return op(numeric(left), numeric(right));
}
function evaluateBinary(operator, left, right) {
  switch (operator) {
    case "||":
      return Boolean(left) || Boolean(right);
    case "&&":
      return Boolean(left) && Boolean(right);
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case "<":
      return compare(left, right, (a, b) => a < b);
    case "<=":
      return compare(left, right, (a, b) => a <= b);
    case ">":
      return compare(left, right, (a, b) => a > b);
    case ">=":
      return compare(left, right, (a, b) => a >= b);
    case "+":
      return numeric(left) + numeric(right);
    case "-":
      return numeric(left) - numeric(right);
    case "*":
      return numeric(left) * numeric(right);
    case "/":
      return numeric(left) / numeric(right);
    case "in":
      if (!Array.isArray(right)) throw new CHRExecutionError('Right operand of "in" must be an array.');
      return right.includes(left);
    default:
      throw new CHRExecutionError(`Unsupported binary operator: ${String(operator)}`);
  }
}

// src/core/builtins.ts
var BuiltinFunctions = {
  /**
   * Strict equality (`===`).
   *
   * @example
   *   eq(1, 1) => true
   *   eq(1, 2) => false
   */
  eq: (_ctx, a, b) => a === b,
  /**
   * Strict inequality (`!==`).
   */
  neq: (_ctx, a, b) => a !== b,
  /**
   * Less-than comparison with numeric coercion.
   *
   * @throws {CHRExecutionError} If either argument is not a number.
   */
  lt: (_ctx, a, b) => compare(a, b, (x, y) => x < y),
  /**
   * Less-than-or-equal comparison with numeric coercion.
   */
  lte: (_ctx, a, b) => compare(a, b, (x, y) => x <= y),
  /**
   * Greater-than comparison with numeric coercion.
   */
  gt: (_ctx, a, b) => compare(a, b, (x, y) => x > y),
  /**
   * Greater-than-or-equal comparison with numeric coercion.
   */
  gte: (_ctx, a, b) => compare(a, b, (x, y) => x >= y),
  /**
   * Arithmetic addition with numeric coercion.
   */
  add: (_ctx, a, b) => numeric(a) + numeric(b),
  /**
   * Arithmetic subtraction with numeric coercion.
   */
  sub: (_ctx, a, b) => numeric(a) - numeric(b),
  /**
   * Arithmetic multiplication with numeric coercion.
   */
  mul: (_ctx, a, b) => numeric(a) * numeric(b),
  /**
   * Arithmetic division with numeric coercion and zero check.
   *
   * @throws {Error} If the divisor is zero.
   */
  div: (_ctx, a, b) => {
    const d = numeric(b);
    if (d === 0) throw new Error("Division by zero");
    return numeric(a) / d;
  },
  /**
   * Arithmetic modulo with numeric coercion and zero check.
   *
   * @throws {Error} If the divisor is zero.
   */
  mod: (_ctx, a, b) => {
    const d = numeric(b);
    if (d === 0) throw new Error("Division by zero");
    return numeric(a) % d;
  },
  /**
   * Minimum of two numbers with numeric coercion.
   */
  min: (_ctx, a, b) => Math.min(numeric(a), numeric(b)),
  /**
   * Maximum of two numbers with numeric coercion.
   */
  max: (_ctx, a, b) => Math.max(numeric(a), numeric(b)),
  /**
   * Absolute value with numeric coercion.
   */
  abs: (_ctx, a) => Math.abs(numeric(a)),
  /**
   * Logical NOT (boolean coercion).
   */
  not: (_ctx, a) => !a,
  /**
   * Type check: is the argument a number?
   */
  isNumber: (_ctx, a) => typeof a === "number",
  /**
   * Type check: is the argument a string?
   */
  isString: (_ctx, a) => typeof a === "string",
  /**
   * Type check: is the argument a boolean?
   */
  isBoolean: (_ctx, a) => typeof a === "boolean",
  /**
   * Type check: is the argument `null`?
   */
  isNull: (_ctx, a) => a === null,
  /**
   * Return the length of a string.
   *
   * @throws {Error} If the argument is not a string.
   */
  stringLength: (_ctx, a) => {
    if (typeof a !== "string") throw new Error(`Expected string, got ${typeof a}`);
    return a.length;
  },
  /**
   * Concatenate two values as strings.
   *
   * Non-string arguments are coerced via `String()`.
   */
  stringConcat: (_ctx, a, b) => {
    const sa = typeof a === "string" ? a : String(a);
    const sb = typeof b === "string" ? b : String(b);
    return sa + sb;
  },
  /**
   * Return true if all arguments are pairwise different.
   *
   * Accepts either a variadic list of arguments or a single array argument.
   * This dual calling convention allows `allDifferent(X)` when `X` is a
   * variable bound to an array.
   *
   * @example
   *   allDifferent(1, 2, 3) => true
   *   allDifferent([1, 2, 2]) => false
   */
  allDifferent: (_ctx, ...args) => {
    const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return values.every((v, i) => values.slice(i + 1).every((w) => v !== w));
  },
  /**
   * Test membership of `value` in `arr`.
   *
   * @throws {Error} If the right operand is not an array.
   */
  in: (_ctx, value, arr) => {
    if (!Array.isArray(arr)) throw new Error(`Expected array, got ${typeof arr}`);
    return arr.includes(value);
  },
  /**
   * Lookup all constraints with the given name and return their args.
   *
   * This is a store-introspection function: it inspects the current store
   * state and returns a 2D array of argument arrays.
   *
   * @example
   *   lookup(ctx, 'edge') // => [[1, 2], [2, 3]]
   */
  lookup: (ctx, name) => {
    return ctx.store.lookupByName(String(name)).map((r) => r.args);
  },
  /**
   * Lookup the first constraint with the given name and return the argument
   * at `argIndex`.
   *
   * @throws {Error} If no constraint with that name exists, or if the index
   *   is out of bounds.
   */
  lookupOne: (ctx, name, argIndex) => {
    const records = ctx.store.lookupByName(String(name));
    if (records.length === 0) throw new Error(`No constraint ${name} found`);
    const args = records[0].args;
    const index = Number(argIndex);
    if (index < 0 || index >= args.length) {
      throw new Error(`Argument index ${index} out of bounds for constraint ${name} with arity ${args.length}`);
    }
    return args[index];
  }
};
var BuiltinsModule = {
  functions: BuiltinFunctions
};

// src/core/history.ts
var PropagationHistory = class {
  /** Map from rule name to a set of sorted-ID hashes. */
  entries = /* @__PURE__ */ new Map();
  /**
   * Record that a rule has fired on a given set of constraint IDs.
   *
   * @param ruleName - The name of the rule that fired.
   * @param ids - The IDs of the matched constraints.
   */
  add(ruleName, ids) {
    const ruleEntries = this.entries.get(ruleName) ?? /* @__PURE__ */ new Set();
    ruleEntries.add(hashIds(ids));
    this.entries.set(ruleName, ruleEntries);
  }
  /**
   * Check whether a rule has already fired on a given set of constraint IDs.
   *
   * @param ruleName - The name of the rule to check.
   * @param ids - The IDs of the matched constraints.
   * @returns `true` if this combination has been seen before.
   */
  has(ruleName, ids) {
    return this.entries.get(ruleName)?.has(hashIds(ids)) ?? false;
  }
  /**
   * The negation of `has`.
   *
   * Provided as a convenience for the engine's `findMatchRecursive` which
   * wants to check "not already fired" before recording a new history entry.
   */
  notIn(ruleName, ids) {
    return !this.has(ruleName, ids);
  }
  /**
   * Clear all history entries.
   *
   * Called by `CHREngine.clear()` so that re-asserting constraints after a
   * clear can trigger propagation rules again.
   */
  clear() {
    this.entries.clear();
  }
  /**
   * Return a JSON-serializable snapshot of the history.
   *
   * Keys are rule names; values are sorted arrays of hash strings.
   */
  snapshot() {
    return Object.fromEntries(
      [...this.entries.entries()].map(([ruleName, ids]) => [ruleName, [...ids].sort()])
    );
  }
};
function hashIds(ids) {
  return [...ids].sort((left, right) => left - right).join(":");
}

// src/core/parser.ts
function parseProgram(source) {
  if (!source.trim()) {
    return { declarations: [], functionDeclarations: [], actionDeclarations: [], hostImports: [], rules: [] };
  }
  source = stripComments(source);
  const declarations = [];
  const functionDeclarations = [];
  const actionDeclarations = [];
  const hostImports = [];
  const rules = [];
  for (const statement of splitTopLevelWithOffsets(source, ";")) {
    const entry = statement.text.trim();
    if (!entry) {
      continue;
    }
    try {
      if (isImportHostStatement(entry)) {
        hostImports.push(parseImportHostStatement(entry, source, statement.offset));
      } else if (isConstraintDeclarationStatement(entry)) {
        declarations.push(...parseDeclarationStatement(entry, source, statement.offset));
      } else if (isFunctionDeclarationStatement(entry)) {
        functionDeclarations.push(...parseHostDeclarationStatement(entry, source, statement.offset, "function"));
      } else if (isActionDeclarationStatement(entry)) {
        actionDeclarations.push(...parseHostDeclarationStatement(entry, source, statement.offset, "action"));
      } else {
        rules.push(parseRule(entry, source, statement.offset));
      }
    } catch (error) {
      const line = lineNumberAt(source, statement.offset);
      const column = columnNumberAt(source, statement.offset);
      const message = error instanceof Error ? error.message : String(error);
      const innerSpan = error instanceof CHRParseError ? error.span : void 0;
      const span = innerSpan ?? createSpan(source, statement.offset, statement.offset + statement.text.length);
      throw new CHRParseError(`Parse error near top-level statement at line ${line}, column ${column}: ${message}`, span, void 0, source);
    }
  }
  return { declarations, functionDeclarations, actionDeclarations, hostImports, rules };
}
function isConstraintDeclarationStatement(source) {
  return source.startsWith("constraint ") || source.startsWith("constraints ");
}
function isFunctionDeclarationStatement(source) {
  return source.startsWith("function ") || source.startsWith("functions ");
}
function isActionDeclarationStatement(source) {
  return source.startsWith("action ") || source.startsWith("actions ");
}
function isImportHostStatement(source) {
  return source.startsWith("import host ");
}
function parseImportHostStatement(source, fullSource, offset) {
  const name = source.slice("import host ".length).trim();
  if (!name) {
    throw new CHRParseError(`Import host declaration is empty: ${source}`, createSpan(fullSource, offset, offset + source.length));
  }
  if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) {
    throw new CHRParseError(`Invalid host module name in import: ${name}`, createSpan(fullSource, offset, offset + source.length));
  }
  return { name, span: createSpan(fullSource, offset, offset + source.length) };
}
function parseDeclarationStatement(source, fullSource, baseOffset) {
  const prefix = source.startsWith("constraints ") ? "constraints " : "constraint ";
  const tail = source.slice(prefix.length).trim();
  if (!tail) {
    throw new CHRParseError(`Constraint declaration is empty: ${source}`, createSpan(fullSource, baseOffset, baseOffset + source.length));
  }
  return splitTopLevelWithOffsets(tail, ",").map((entry) => ({ text: entry.text.trim(), offset: baseOffset + prefix.length + entry.offset })).filter((entry) => Boolean(entry.text)).map((entry) => parseDeclaration(entry.text, fullSource, entry.offset));
}
function parseDeclaration(source, fullSource, offset) {
  const match = /^([a-z][A-Za-z0-9_]*)\s*\/\s*(\d+)$/.exec(source);
  if (!match) {
    throw new CHRParseError(`Invalid constraint declaration: ${source}`, createSpan(fullSource, offset, offset + source.length));
  }
  const name = match[1];
  const arity = Number(match[2]);
  if (!name || Number.isNaN(arity)) {
    throw new CHRParseError(`Invalid constraint declaration: ${source}`, createSpan(fullSource, offset, offset + source.length));
  }
  return { name, arity, span: createSpan(fullSource, offset, offset + source.length) };
}
function parseHostDeclarationStatement(source, fullSource, baseOffset, kind) {
  const singular = `${kind} `;
  const plural = `${kind}s `;
  const prefix = source.startsWith(plural) ? plural : singular;
  const tail = source.slice(prefix.length).trim();
  if (!tail) {
    throw new CHRParseError(`${capitalize(kind)} declaration is empty: ${source}`, createSpan(fullSource, baseOffset, baseOffset + source.length));
  }
  return splitTopLevelWithOffsets(tail, ",").map((entry) => ({ text: entry.text.trim(), offset: baseOffset + prefix.length + entry.offset })).filter((entry) => Boolean(entry.text)).map((entry) => parseHostDeclaration(entry.text, fullSource, entry.offset));
}
function parseHostDeclaration(source, fullSource, offset) {
  const match = /^([a-z][A-Za-z0-9_]*)\s*\/\s*(\d+)$/.exec(source);
  if (!match) {
    throw new CHRParseError(`Invalid host declaration: ${source}`, createSpan(fullSource, offset, offset + source.length));
  }
  const name = match[1];
  const arity = Number(match[2]);
  if (!name || Number.isNaN(arity)) {
    throw new CHRParseError(`Invalid host declaration: ${source}`, createSpan(fullSource, offset, offset + source.length));
  }
  return { name, arity, span: createSpan(fullSource, offset, offset + source.length) };
}
function parseRule(source, fullSource = source, baseOffset = 0) {
  let priority;
  let ruleSource = source;
  if (ruleSource.startsWith("@")) {
    const priorityMatch = /^@\s*(\d+)\s*@\s*/.exec(ruleSource);
    if (priorityMatch) {
      priority = parseInt(priorityMatch[1], 10);
      ruleSource = ruleSource.slice(priorityMatch[0].length).trim();
      if (priority < 0 || priority > 1e6) {
        const span2 = createSpan(fullSource, baseOffset, baseOffset + source.length);
        throw new CHRParseError(`Rule priority must be between 0 and 1000000, got ${priority}`, span2);
      }
    }
  }
  const named = splitRuleName(ruleSource);
  ruleSource = named.ruleSource;
  let unify = false;
  if (ruleSource.startsWith("unify ")) {
    unify = true;
    ruleSource = ruleSource.slice(6).trim();
  }
  const kind = detectRuleKind(ruleSource);
  const [headSource, tailSource] = splitRuleOperator(ruleSource, kind);
  const [guardSource, bodySource] = splitGuard(tailSource);
  const span = createSpan(fullSource, baseOffset, baseOffset + source.length);
  if (!bodySource.trim()) {
    throw new CHRParseError(`Rule body is empty in: ${source}`, span);
  }
  const body = parseBody(bodySource);
  const base = {
    guard: parseGuardList(guardSource),
    body,
    unify,
    ...priority !== void 0 ? { priority } : {}
  };
  if (kind === "propagation") {
    const headParts2 = splitByBackslash(headSource);
    const kept2 = headParts2.flatMap((part) => parseConstraints(part));
    return withOptionalName({
      kind,
      kept: kept2,
      removed: [],
      span,
      ...base
    }, named.name);
  }
  if (kind === "simplification") {
    return withOptionalName({
      kind,
      kept: [],
      removed: parseConstraints(headSource),
      span,
      ...base
    }, named.name);
  }
  const headParts = splitTopLevel(headSource, "\\");
  if (headParts.length < 2) {
    throw new CHRParseError(`Simpagation rule is missing kept/removed separator: ${source}`, span);
  }
  const kept = headParts.slice(0, -1).flatMap((part) => parseConstraints(part));
  const removed = parseConstraints(headParts[headParts.length - 1] ?? "");
  return withOptionalName({
    kind,
    kept,
    removed,
    span,
    ...base
  }, named.name);
}
function splitRuleName(source) {
  const index = source.indexOf("@");
  if (index < 0) {
    return { ruleSource: source.trim() };
  }
  const name = source.slice(0, index).trim();
  const ruleSource = source.slice(index + 1).trim();
  return { name, ruleSource };
}
function detectRuleKind(source) {
  const withoutStrings = source.replace(/'[^']*'|"[^"]*"/g, '""');
  const simpIdx = findTopLevelOperator(withoutStrings, "<=>");
  const propIdx = findTopLevelOperator(withoutStrings, "==>");
  if (simpIdx >= 0) {
    const before = withoutStrings.slice(0, simpIdx).trim();
    if (before.includes("\\")) return "simpagation";
    return "simplification";
  }
  if (propIdx >= 0) {
    return "propagation";
  }
  throw new CHRParseError(`Unknown rule operator in: ${source}`);
}
function splitRuleOperator(source, kind) {
  const operator = kind === "propagation" ? "==>" : "<=>";
  const index = findTopLevelOperator(source, operator);
  if (index < 0) {
    throw new CHRParseError(`Could not find rule operator ${operator} in: ${source}`);
  }
  const head = source.slice(0, index).trim();
  const tail = source.slice(index + operator.length).trim();
  return [head, tail];
}
function splitGuard(source) {
  const result = splitTopLevelOnce(source, "|");
  if (result[1] === null) {
    return [null, source.trim()];
  }
  return [result[0]?.trim() ?? "", result[1].trim()];
}
function parseGuardList(source) {
  if (!source || !source.trim()) {
    return [];
  }
  return splitTopLevel(source, ",").map((entry) => entry.trim()).filter(Boolean).map(parseExpression);
}
function parseConstraints(source) {
  return splitTopLevel(source, ",").map((entry) => entry.trim()).filter(Boolean).map(parseConstraint);
}
function parseConstraint(source) {
  const match = /^([a-z][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/.exec(source.trim());
  if (!match) {
    throw new CHRParseError(`Invalid constraint syntax: ${source}`);
  }
  const name = match[1];
  if (!name) {
    throw new CHRParseError(`Invalid constraint name in: ${source}`);
  }
  const argsSource = match[2]?.trim();
  const args = argsSource ? splitTopLevel(argsSource, ",").map((entry) => parseExpression(entry.trim())) : [];
  return { name, args };
}
function withOptionalName(rule, name) {
  return name ? { ...rule, name } : rule;
}
function parseBody(source) {
  return splitTopLevel(source, ",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    if (entry.startsWith("!")) {
      return parseAction(entry.slice(1).trim());
    }
    if (entry.startsWith("let ")) {
      return parseLetBinding(entry.slice(4).trim());
    }
    const updateIndex = findTopLevelOperator(entry, "<=");
    if (updateIndex >= 0) {
      const oldPart = entry.slice(0, updateIndex).trim();
      const newPart = entry.slice(updateIndex + 2).trim();
      const update = {
        type: "update",
        old: parseConstraint(oldPart),
        constraint: parseConstraint(newPart)
      };
      return update;
    }
    const constraint = {
      type: "constraint",
      constraint: parseConstraint(entry)
    };
    return constraint;
  });
}
function parseLetBinding(source) {
  const eqIndex = findTopLevelOperator(source, "=");
  if (eqIndex < 0) {
    throw new CHRParseError(`Invalid let binding, expected '=': let ${source}`);
  }
  const name = source.slice(0, eqIndex).trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new CHRParseError(`Invalid variable name in let binding: ${name}`);
  }
  const exprSource = source.slice(eqIndex + 1).trim();
  return { type: "let", name, expr: parseExpression(exprSource) };
}
function parseAction(source) {
  const call = parseExpression(source);
  if (call.type !== "call") {
    throw new CHRParseError(`Action must be a function call: ${source}`);
  }
  return {
    type: "action",
    name: call.callee,
    args: call.args
  };
}
function parseExpression(source) {
  const tokens = tokenize(source);
  const parser = new ExpressionParser(tokens);
  return parser.parse();
}
function splitByBackslash(source) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const previous = index > 0 ? source[index - 1] : "";
    if (quote) {
      current += char;
      if ((quote === "single" && char === "'" || quote === "double" && char === '"') && previous !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "'") {
      quote = "single";
      current += char;
      continue;
    }
    if (char === '"') {
      quote = "double";
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
    }
    if (char === "\\" && depth === 0) {
      parts.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}
function splitTopLevel(source, separator) {
  const separators = Array.isArray(separator) ? separator : [separator];
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const previous = index > 0 ? source[index - 1] : "";
    if (quote) {
      current += char;
      if ((quote === "single" && char === "'" || quote === "double" && char === '"') && previous !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "'") {
      quote = "single";
      current += char;
      continue;
    }
    if (char === '"') {
      quote = "double";
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
    }
    if (depth === 0) {
      const sepIndex = separators.findIndex((sep) => source.startsWith(sep, index));
      if (sepIndex >= 0) {
        parts.push(current);
        current = "";
        index += separators[sepIndex].length - 1;
        continue;
      }
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}
function splitTopLevelOnce(source, separator) {
  const parts = splitTopLevel(source, separator);
  if (parts.length < 2) {
    return [source.trim(), null];
  }
  return [parts[0]?.trim() ?? null, parts.slice(1).join(separator).trim()];
}
function findTopLevelOperator(source, operator) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if ((quote === "single" && char === "'" || quote === "double" && char === '"') && source[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "'") {
      quote = "single";
      continue;
    }
    if (char === '"') {
      quote = "double";
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && source.startsWith(operator, index)) {
      return index;
    }
  }
  return -1;
}
function splitTopLevelWithOffsets(source, separator) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  let currentOffset = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const previous = index > 0 ? source[index - 1] : "";
    if (quote) {
      current += char;
      if ((quote === "single" && char === "'" || quote === "double" && char === '"') && previous !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "'") {
      quote = "single";
      current += char;
      continue;
    }
    if (char === '"') {
      quote = "double";
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
    }
    if (depth === 0 && source.startsWith(separator, index)) {
      parts.push({ text: current, offset: currentOffset });
      current = "";
      index += separator.length - 1;
      currentOffset = index + 1;
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push({ text: current, offset: currentOffset });
  }
  return parts;
}
function stripComments(source) {
  const lines = source.split("\n");
  const stripped = lines.map((line) => {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (!inString) {
        if (char === '"' || char === "'") {
          inString = char;
        } else if (char === "#" || char === "%" || char === "-" && line[i + 1] === "-") {
          return line.slice(0, i);
        }
      } else if (char === inString && line[i - 1] !== "\\") {
        inString = false;
      }
    }
    return line;
  });
  return stripped.join("\n");
}
function lineNumberAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}
function columnNumberAt(source, offset) {
  let column = 1;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === "\n") {
      column = 1;
    } else {
      column += 1;
    }
  }
  return column;
}
function createSpan(source, startOffset, endOffset) {
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
  };
}
function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (!char) {
      break;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const threeChar = source.slice(index, index + 3);
    if (threeChar === "===") {
      tokens.push({ type: "operator", value: "===" });
      index += 3;
      continue;
    }
    if (threeChar === "!==") {
      tokens.push({ type: "operator", value: "!==" });
      index += 3;
      continue;
    }
    const twoChar = source.slice(index, index + 2);
    if (["<=", ">=", "&&", "||"].includes(twoChar)) {
      tokens.push({ type: "operator", value: twoChar });
      index += 2;
      continue;
    }
    if (["<", ">", "+", "-", "*", "/", "!"].includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")" || char === "[" || char === "]" || char === "{" || char === "}") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma", value: char });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      let value = "";
      const quote = char;
      index += 1;
      while (index < source.length) {
        const next = source[index];
        if (!next) {
          break;
        }
        if (next === quote && source[index - 1] !== "\\") {
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }
      tokens.push({ type: "string", value });
      continue;
    }
    if (/\d/.test(char)) {
      let value = char;
      index += 1;
      while (index < source.length && /[\d.]/.test(source[index] ?? "")) {
        value += source[index];
        index += 1;
      }
      tokens.push({ type: "number", value });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = char;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index] ?? "")) {
        value += source[index];
        index += 1;
      }
      if (value === "true" || value === "false") {
        tokens.push({ type: "boolean", value });
      } else if (value === "null") {
        tokens.push({ type: "null", value });
      } else {
        tokens.push({ type: "identifier", value });
      }
      continue;
    }
    throw new CHRParseError(`Unexpected token '${char}' in expression: ${source}`);
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}
var ExpressionParser = class {
  constructor(tokens, index = 0) {
    this.tokens = tokens;
    this.index = index;
  }
  tokens;
  index;
  /**
   * Parse a complete expression and verify EOF.
   *
   * @returns The root `Expression` AST node.
   * @throws {CHRParseError} If extra tokens remain after parsing.
   */
  parse() {
    const expression = this.parseLogicalOr();
    this.expect("eof");
    return expression;
  }
  // logicalOr → logicalAnd (|| logicalAnd)*
  parseLogicalOr() {
    let expr = this.parseLogicalAnd();
    while (this.matchOperator("||")) {
      expr = this.binary("||", expr, this.parseLogicalAnd());
    }
    return expr;
  }
  // logicalAnd → equality (&& equality)*
  parseLogicalAnd() {
    let expr = this.parseEquality();
    while (this.matchOperator("&&")) {
      expr = this.binary("&&", expr, this.parseEquality());
    }
    return expr;
  }
  // equality → comparison ((=== | !==) comparison)*
  parseEquality() {
    let expr = this.parseComparison();
    while (true) {
      if (this.matchOperator("===")) {
        expr = this.binary("===", expr, this.parseComparison());
        continue;
      }
      if (this.matchOperator("!==")) {
        expr = this.binary("!==", expr, this.parseComparison());
        continue;
      }
      return expr;
    }
  }
  // comparison → additive ((<= | >= | < | > | in) additive)*
  parseComparison() {
    let expr = this.parseAdditive();
    while (true) {
      if (this.matchOperator("<=")) {
        expr = this.binary("<=", expr, this.parseAdditive());
        continue;
      }
      if (this.matchOperator(">=")) {
        expr = this.binary(">=", expr, this.parseAdditive());
        continue;
      }
      if (this.matchOperator("<")) {
        expr = this.binary("<", expr, this.parseAdditive());
        continue;
      }
      if (this.matchOperator(">")) {
        expr = this.binary(">", expr, this.parseAdditive());
        continue;
      }
      if (this.matchKeyword("in")) {
        expr = this.binary("in", expr, this.parseAdditive());
        continue;
      }
      return expr;
    }
  }
  // additive → multiplicative ((+ | -) multiplicative)*
  parseAdditive() {
    let expr = this.parseMultiplicative();
    while (true) {
      if (this.matchOperator("+")) {
        expr = this.binary("+", expr, this.parseMultiplicative());
        continue;
      }
      if (this.matchOperator("-")) {
        expr = this.binary("-", expr, this.parseMultiplicative());
        continue;
      }
      return expr;
    }
  }
  // multiplicative → primary ((* | /) primary)*
  parseMultiplicative() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.matchOperator("*")) {
        expr = this.binary("*", expr, this.parsePrimary());
        continue;
      }
      if (this.matchOperator("/")) {
        expr = this.binary("/", expr, this.parsePrimary());
        continue;
      }
      return expr;
    }
  }
  // primary → literals | identifiers | calls | parenthesized | arrays | unary
  parsePrimary() {
    if (this.matchOperator("!")) {
      const operand = this.parsePrimary();
      return { type: "unary", operator: "!", operand };
    }
    if (this.matchOperator("-")) {
      const operand = this.parsePrimary();
      return { type: "unary", operator: "-", operand };
    }
    const token = this.peek();
    if (token.type === "number") {
      this.advance();
      const literal = { type: "literal", value: Number(token.value) };
      return literal;
    }
    if (token.type === "string") {
      this.advance();
      return { type: "literal", value: token.value };
    }
    if (token.type === "boolean") {
      this.advance();
      return { type: "literal", value: token.value === "true" };
    }
    if (token.type === "null") {
      this.advance();
      return { type: "literal", value: null };
    }
    if (token.type === "identifier") {
      this.advance();
      if (this.matchParen("(")) {
        const args = [];
        if (!this.matchParen(")")) {
          do {
            args.push(this.parseLogicalOr());
          } while (this.match("comma"));
          this.expectParen(")");
        }
        const call = { type: "call", callee: token.value, args };
        return call;
      }
      if (/^[A-Z_]/.test(token.value)) {
        const variable = { type: "variable", name: token.value };
        return variable;
      }
      return { type: "literal", value: token.value };
    }
    if (this.matchParen("(")) {
      const expr = this.parseLogicalOr();
      this.expectParen(")");
      return expr;
    }
    if (this.matchParen("[")) {
      const elements = [];
      if (!this.matchParen("]")) {
        do {
          elements.push(this.parseLogicalOr());
        } while (this.match("comma"));
        this.expectParen("]");
      }
      return { type: "array", elements };
    }
    throw new CHRParseError(`Unexpected token ${token.value || token.type} in expression`);
  }
  binary(operator, left, right) {
    return { type: "binary", operator, left, right };
  }
  peek() {
    return this.tokens[this.index] ?? { type: "eof", value: "" };
  }
  advance() {
    const token = this.peek();
    this.index += 1;
    return token;
  }
  match(type) {
    if (this.peek().type === type) {
      this.advance();
      return true;
    }
    return false;
  }
  matchOperator(value) {
    if (this.peek().type === "operator" && this.peek().value === value) {
      this.advance();
      return true;
    }
    return false;
  }
  matchKeyword(value) {
    const token = this.peek();
    if (token.type === "identifier" && token.value === value) {
      this.advance();
      return true;
    }
    return false;
  }
  matchParen(value) {
    if (this.peek().type === "paren" && this.peek().value === value) {
      this.advance();
      return true;
    }
    return false;
  }
  expect(type) {
    if (!this.match(type)) {
      throw new CHRParseError(`Expected ${type} but found ${this.peek().type}`);
    }
  }
  expectParen(value) {
    if (!this.matchParen(value)) {
      throw new CHRParseError(`Expected '${value}' but found ${this.peek().value || this.peek().type}`);
    }
  }
};

// src/core/constraint.ts
function createFunctor(name, arity) {
  return `${name}/${arity}`;
}
function createConstraint(id, name, args, metadata) {
  const record = {
    id,
    name,
    arity: args.length,
    args: [...args]
  };
  if (metadata) {
    record.metadata = metadata;
  }
  record.toString = () => {
    if (record.arity === 0) {
      return record.name;
    }
    return `${record.name}(${record.args.map((arg) => String(arg)).join(",")})`;
  };
  return record;
}

// src/core/store.ts
var ConstraintStore = class {
  /** Auto-incrementing counter for constraint IDs. Reset to 1 when the store is empty. */
  nextId = 1;
  /** Primary index: constraint ID → record. */
  byId = /* @__PURE__ */ new Map();
  /** Secondary index: functor (`name/arity`) → set of IDs. */
  byFunctor = /* @__PURE__ */ new Map();
  /** Hook callbacks for observing mutations. */
  hooks;
  /** Whether the store has been invalidated (used by `invalidate()` / `invalid`). */
  _invalid = false;
  /** Strict mode: `true` throws on invariant violations, `'warn'` logs warnings, `false` ignores. */
  strict;
  /** Cache for the most recent `lookup(name, arity)` result. Cleared on every mutation. */
  lookupCache = /* @__PURE__ */ new Map();
  /**
   * Construct a new constraint store.
   *
   * @param hooks - Optional callbacks for `onAdd` and `onRemove`.
   * @param options - `strict` enables invariant checking.
   */
  constructor(hooks = {}, options = {}) {
    this.hooks = hooks;
    this.strict = options.strict ?? false;
    if (this.strict) this.assertInvariants();
  }
  /**
   * Add a new constraint to the store.
   *
   * Assigns a fresh auto-incrementing ID, indexes the constraint by functor,
   * fires the `onAdd` hook, invalidates the lookup cache, and checks
   * invariants (if strict mode is enabled).
   *
   * @param name - Constraint functor name.
   * @param args - Constraint arguments.
   * @param metadata - Optional user-defined metadata (not used by the engine).
   * @returns The newly created `ConstraintRecord`.
   */
  add(name, args, metadata) {
    const record = createConstraint(this.nextId++, name, args, metadata);
    this.byId.set(record.id, record);
    const functor = createFunctor(name, args.length);
    const ids = this.byFunctor.get(functor) ?? /* @__PURE__ */ new Set();
    ids.add(record.id);
    this.byFunctor.set(functor, ids);
    this.hooks.onAdd?.(record);
    this.lookupCache.clear();
    this.checkInvariants();
    return record;
  }
  /** Run invariant checks in strict or warn mode. */
  checkInvariants() {
    if (this.strict === "warn") {
      try {
        this.assertInvariants();
      } catch (e) {
        console.warn(`[store] ${e.message}`);
      }
    } else if (this.strict) {
      this.assertInvariants();
    }
  }
  /**
   * Get a constraint record by ID.
   *
   * @returns The record, or `undefined` if no constraint with that ID exists.
   */
  get(id) {
    return this.byId.get(id);
  }
  /**
   * Check whether a constraint with the given ID exists.
   */
  has(id) {
    return this.byId.has(id);
  }
  /**
   * Remove a constraint by ID.
   *
   * Removes the record from `byId`, removes the ID from the functor index
   * set, resets `nextId` to 1 if the store becomes empty (to avoid ID
   * overflow over long runs), fires the `onRemove` hook, and clears the
   * lookup cache.
   *
   * @returns `true` if a constraint was removed, `false` if the ID was not found.
   */
  remove(id) {
    const record = this.byId.get(id);
    if (!record) {
      return false;
    }
    this.byId.delete(id);
    const functor = createFunctor(record.name, record.arity);
    const ids = this.byFunctor.get(functor);
    ids?.delete(id);
    if (ids && ids.size === 0) {
      this.byFunctor.delete(functor);
    }
    if (this.byId.size === 0) {
      this.nextId = 1;
    }
    this.lookupCache.clear();
    this.hooks.onRemove?.(id);
    this.checkInvariants();
    return true;
  }
  /**
   * Lookup all constraints by name, ignoring arity.
   *
   * Returns results sorted by ID. This is a full scan of `byId` and is
   * slower than `lookup(name, arity)`. Prefer the arity-aware version when
   * the arity is known.
   */
  lookupByName(name) {
    const results = [];
    for (const [, record] of this.byId) {
      if (record.name === name) results.push(record);
    }
    return results.sort((a, b) => a.id - b.id);
  }
  /**
   * Lookup all constraints matching a given name and arity.
   *
   * Results are cached by functor. The cache is invalidated on every
   * `add` or `remove`. Results are returned sorted by ID for deterministic
   * iteration order (important for reproducible rule firing).
   *
   * @param name - Constraint functor name.
   * @param arity - Constraint arity.
   * @returns Array of matching `ConstraintRecord` objects, sorted by ID.
   */
  lookup(name, arity) {
    const functor = createFunctor(name, arity);
    const cached = this.lookupCache.get(functor);
    if (cached !== void 0) {
      return cached;
    }
    const ids = this.byFunctor.get(functor);
    if (!ids) {
      this.lookupCache.set(functor, []);
      return [];
    }
    const result = [...ids].sort((left, right) => left - right).map((id) => this.byId.get(id)).filter((entry) => Boolean(entry));
    this.lookupCache.set(functor, result);
    return result;
  }
  /**
   * Remove all constraints from the store and reset the ID counter.
   *
   * Does NOT fire `onRemove` hooks for individual entries (unlike repeated
   * `remove` calls). Used by `CHREngine.clear()`.
   */
  clear() {
    this.byId.clear();
    this.byFunctor.clear();
    this.nextId = 1;
    this._invalid = false;
  }
  /**
   * Mark the store as invalid and clear all data.
   *
   * Similar to `clear()` but sets `_invalid = true`. The engine uses this
   * to distinguish between an intentionally empty store and an invalid one.
   */
  invalidate() {
    this.byId.clear();
    this.byFunctor.clear();
    this.nextId = 1;
    this._invalid = true;
  }
  /** Whether the store has been invalidated. */
  get invalid() {
    return this._invalid;
  }
  /** The number of constraints currently in the store. */
  size() {
    return this.byId.size;
  }
  /** All functor names currently in the index. */
  functors() {
    return [...this.byFunctor.keys()];
  }
  /** All `(id, record)` pairs in insertion order (by ID). */
  entries() {
    return [...this.byId.entries()].map(([id, record]) => ({ id, record }));
  }
  /**
   * Find all constraints matching a predicate.
   *
   * The predicate receives the record, its name, and its args.
   *
   * @returns Matching records sorted by ID.
   */
  find(predicate) {
    const results = [];
    for (const [, record] of this.byId) {
      if (predicate(record, record.name, record.args)) {
        results.push(record);
      }
    }
    return results.sort((a, b) => a.id - b.id);
  }
  /**
   * Iterate over all constraints in insertion order (by ID).
   */
  forEach(callback) {
    for (const [id, record] of this.byId) {
      callback(record, id);
    }
  }
  /**
   * Map over all constraints in insertion order (by ID).
   *
   * @returns An array of mapped values.
   */
  map(callback) {
    const result = [];
    for (const [id, record] of this.byId) {
      result.push(callback(record, id));
    }
    return result;
  }
  /**
   * Return the args of the constraint with the given ID.
   *
   * @returns A copy of the args array, or an empty array if not found.
   */
  args(id) {
    return [...this.byId.get(id)?.args ?? []];
  }
  /**
   * Check whether all given IDs still exist in the store.
   */
  allAlive(ids) {
    return ids.every((id) => this.byId.has(id));
  }
  /**
   * Take a snapshot of the store's current contents.
   *
   * Returns an array of `StoreSnapshotEntry` objects sorted by ID. The
   * returned objects are shallow copies; mutations to them do not affect
   * the store.
   */
  snapshot() {
    return [...this.byId.values()].sort((left, right) => left.id - right.id).map((record) => ({
      id: record.id,
      name: record.name,
      arity: record.arity,
      args: [...record.args]
    }));
  }
  /**
   * Alias for `snapshot()`. Provided for JSON serialization compatibility.
   */
  toJSON() {
    return this.snapshot();
  }
  /**
   * Return a human-readable string of the store's contents.
   *
   * Format:
   *   ID  Constraint
   *   --  ----------
   *    1  edge(1, 2)
   *    2  node(3)
   */
  toString() {
    if (this.size() === 0) {
      return "(empty)";
    }
    const rows = this.snapshot().map((entry) => {
      const id = String(entry.id).padStart(2);
      const value = entry.arity === 0 ? entry.name : `${entry.name}(${entry.args.join(",")})`;
      return `${id}   ${value}`;
    });
    return ["ID  Constraint", "--  ----------", ...rows].join("\n");
  }
  /**
   * Assert store invariants. Only called in strict mode.
   *
   * Invariants:
   * 1. Empty store → `nextId === 1`.
   * 2. `nextId === maxId + 1`.
   * 3. `byFunctor` exactly mirrors `byId` (no orphaned functors, no missing IDs).
   */
  assertInvariants() {
    if (this.byId.size === 0) {
      if (this.nextId !== 1) {
        throw new Error("Store invariant violated: empty store but nextId is not 1");
      }
      return;
    }
    let maxId = 0;
    for (const id of this.byId.keys()) {
      if (id > maxId) maxId = id;
    }
    if (this.nextId !== maxId + 1) {
      throw new Error(`Store invariant violated: nextId ${this.nextId} should be maxId+1=${maxId + 1}`);
    }
    const byName = {};
    for (const [id, record] of this.byId) {
      const functor = createFunctor(record.name, record.arity);
      if (!byName[functor]) byName[functor] = /* @__PURE__ */ new Set();
      byName[functor].add(id);
    }
    for (const [functor, indexedIds] of this.byFunctor) {
      const expected = byName[functor];
      if (!expected) {
        throw new Error(`Store invariant violated: functor ${functor} in index but not in byId`);
      }
      if (indexedIds.size !== expected.size || ![...indexedIds].every((id) => expected.has(id))) {
        throw new Error(`Store invariant violated: index mismatch for functor ${functor}`);
      }
    }
    for (const functor of Object.keys(byName)) {
      if (!this.byFunctor.has(functor)) {
        throw new Error(`Store invariant violated: functor ${functor} in byName but not in index`);
      }
    }
  }
};

// src/core/substitution.ts
var Substitution = class _Substitution {
  /** The underlying map of variable name → value bindings. */
  map = /* @__PURE__ */ new Map();
  /**
   * Get the current binding for a variable name.
   *
   * @returns The bound value, or `undefined` if the variable is unbound.
   */
  get(name) {
    return this.map.get(name);
  }
  /**
   * Bind a variable name to a value.
   *
   * @param name - The variable to bind.
   * @param value - The value to bind it to.
   */
  set(name, value) {
    this.map.set(name, value);
  }
  /**
   * Check whether a variable name has a binding.
   */
  has(name) {
    return this.map.has(name);
  }
  /**
   * Create a shallow copy of this substitution.
   *
   * Used by `unifyVariable` to implement non-destructive unification: each
   * recursive call clones the current substitution before adding a new
   * binding. This makes backtracking automatic (failed branches simply
   * discard the cloned substitution).
   */
  clone() {
    const copy = new _Substitution();
    for (const [k, v] of this.map) {
      copy.map.set(k, v);
    }
    return copy;
  }
  /**
   * Check whether the substitution contains any bindings.
   */
  isEmpty() {
    return this.map.size === 0;
  }
  /**
   * Return all bindings as an array of `[name, value]` tuples.
   */
  entries() {
    return [...this.map.entries()];
  }
  /**
   * Human-readable representation for debugging.
   *
   * Format: `X => 1, Y => "foo"`
   */
  toString() {
    return [...this.map.entries()].map(([k, v]) => `${k} => ${JSON.stringify(v)}`).join(", ");
  }
};

// src/core/unification.ts
function unifyTerm(pattern, value, subst) {
  if (pattern.type === "variable") {
    return unifyVariable(pattern.name, value, subst);
  }
  if (pattern.type === "literal") {
    return pattern.value === value ? subst : null;
  }
  return null;
}
function unifyVariable(name, value, subst) {
  if (name === "_") {
    return subst;
  }
  const existing = subst.get(name);
  if (existing !== void 0) {
    return termsEqual(existing, value) ? subst : null;
  }
  if (typeof value === "object" && value !== null && value.type === "variable") {
    const varName = value.name;
    if (subst.has(varName)) {
      const resolved = subst.get(varName);
      if (resolved !== void 0 && occursIn(name, resolved, subst)) {
        return null;
      }
    }
    if (occursIn(name, value, subst)) {
      return null;
    }
  }
  const next = subst.clone();
  next.set(name, value);
  return next;
}
function occursIn(name, value, subst) {
  if (typeof value === "object" && value !== null) {
    if (value.type === "variable") {
      const varName = value.name;
      if (varName === name) return true;
      const resolved = subst.get(varName);
      if (resolved !== void 0) {
        return occursIn(name, resolved, subst);
      }
    }
  }
  return false;
}
function termsEqual(left, right) {
  if (left === right) return true;
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const a = left;
    const b = right;
    if (a.type !== b.type) return false;
    if (a.type === "variable") {
      return a.name === b.name;
    }
  }
  return false;
}
function resolveVariable(name, subst) {
  const MAX_SUBSTITUTION_DEPTH = 100;
  let current = name;
  let depth = 0;
  while (depth < MAX_SUBSTITUTION_DEPTH) {
    const resolved = subst.get(current);
    if (resolved === void 0) {
      return current;
    }
    if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean" || resolved === null) {
      return resolved;
    }
    if (typeof resolved === "object" && resolved !== null && resolved.type === "variable") {
      current = resolved.name;
      depth++;
      continue;
    }
    return resolved;
  }
  throw new Error(`Substitution cycle detected: maximum depth ${MAX_SUBSTITUTION_DEPTH} exceeded for variable ${name}`);
}
function materializeSubstitution(subst, fallback) {
  const bindings = { ...fallback };
  for (const [name] of subst.entries()) {
    if (name === "_") continue;
    const resolved = resolveVariable(name, subst);
    bindings[name] = resolved;
  }
  return bindings;
}

// playground/chrts-fs-stub.js
function readFileSync() {
  throw new Error("CHR.ts: File loading (load()) is not supported in the browser. Use addRules() or addProgram() instead.");
}

// src/core/engine/eval.ts
async function evaluateExpression(deps, expr, rule, matched, bindings) {
  if (expr.type === "literal") {
    return expr.value;
  }
  if (expr.type === "array") {
    const elements = [];
    for (const element of expr.elements) {
      elements.push(await evaluateExpression(deps, element, rule, matched, bindings));
    }
    return elements;
  }
  if (expr.type === "variable") {
    if (!Object.hasOwn(bindings, expr.name)) {
      throw new CHRExecutionError(`Unbound variable ${expr.name}`, rule.span);
    }
    return bindings[expr.name];
  }
  if (expr.type === "unary") {
    const operand = await evaluateExpression(deps, expr.operand, rule, matched, bindings);
    if (expr.operator === "!") {
      return !operand;
    }
    if (expr.operator === "-") {
      return -operand;
    }
    throw new CHRExecutionError(`Unknown unary operator ${expr.operator}`, rule.span);
  }
  if (expr.type === "binary") {
    if (expr.operator === "in") {
      const left2 = await evaluateExpression(deps, expr.left, rule, matched, bindings);
      const right2 = await evaluateExpression(deps, expr.right, rule, matched, bindings);
      if (!Array.isArray(right2)) {
        throw new CHRExecutionError('Right operand of "in" must be an array.', rule.span);
      }
      return right2.includes(left2);
    }
    const left = await evaluateExpression(deps, expr.left, rule, matched, bindings);
    const right = await evaluateExpression(deps, expr.right, rule, matched, bindings);
    return evaluateBinary(expr.operator, left, right);
  }
  const fn = deps.functions.get(expr.callee);
  if (!fn) {
    throw new CHRExecutionError(
      `Unknown host function: ${expr.callee}${deps.suggestSimilar(expr.callee, deps.functions)}`,
      rule.span
    );
  }
  const args = [];
  for (const arg of expr.args) {
    args.push(await evaluateExpression(deps, arg, rule, matched, bindings));
  }
  try {
    return await callHostFunction(deps, fn, expr.callee, rule, matched, bindings, args);
  } catch (error) {
    if (deps.isGuard) {
      throw new CHRGuardError(
        `Guard function ${expr.callee} failed in rule ${rule.name ?? "anonymous"}: ${error.message}`,
        rule.span,
        error
      );
    }
    throw new CHRExecutionError(
      `Host function ${expr.callee} threw in rule ${rule.name ?? "anonymous"}: ${error.message}`,
      rule.span,
      error
    );
  }
}
async function callHostFunction(deps, fn, name, rule, matched, bindings, args) {
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
  );
  return withTimeout(deps, result, name, rule);
}
async function withTimeout(deps, promise, name, rule) {
  if (deps.hostFunctionTimeout === void 0 || typeof promise !== "object" || promise === null || !("then" in promise)) {
    return promise;
  }
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Host function ${name} timed out after ${deps.hostFunctionTimeout}ms in rule ${rule.name ?? "anonymous"}`));
    }, deps.hostFunctionTimeout);
  });
  return Promise.race([promise, timeoutPromise]);
}

// src/core/engine.ts
var CHREngine = class {
  // -------------------------------------------------------------------------
  // Public mutable state (readonly views for consumers)
  // -------------------------------------------------------------------------
  /** The constraint store: the primary data structure holding all asserted constraints. */
  store = new ConstraintStore();
  /** The propagation history: tracks which rule/constraint-ID combinations have already fired. */
  history = new PropagationHistory();
  // -------------------------------------------------------------------------
  // Private internal state
  // -------------------------------------------------------------------------
  /** Raw parsed rules as loaded by the user. */
  rules = [];
  /** Pre-compiled rules with extracted head functors and priorities. */
  compiledRules = [];
  /** Rules sorted by descending priority for fixpoint scheduling. */
  sortedCompiledRules = [];
  /** Registered host functions, keyed by name. */
  functions = /* @__PURE__ */ new Map();
  /** Registered host actions, keyed by name. */
  actions = /* @__PURE__ */ new Map();
  /** Declared constraint arities, keyed by constraint name. */
  declarations = /* @__PURE__ */ new Map();
  /** Declared host function arities, keyed by function name. `-1` means imported. */
  functionDeclarations = /* @__PURE__ */ new Map();
  /** Declared host action arities, keyed by action name. `-1` means imported. */
  actionDeclarations = /* @__PURE__ */ new Map();
  /** Registered host modules, keyed by module name. */
  hostModules = /* @__PURE__ */ new Map();
  /** Maximum rule firings per fixpoint (from constructor options). */
  maxRuleFirings;
  /** Optional callback for rule-firing observability. */
  onRuleFired;
  /** If true, undeclared host functions/actions raise errors at validation time. */
  strictHostDeclarations;
  /** Host function call timeout in milliseconds. `undefined` means no timeout. */
  hostFunctionTimeout;
  /** Current engine state. */
  _state = "empty";
  /** Accumulated warnings (non-fatal issues like shadowed variables or unused declarations). */
  warnings = [];
  /** Whether host declaration validation has already run for the current program. */
  hostDeclarationsValidated = false;
  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  /**
   * Construct a new `CHREngine` instance.
   *
   * The engine starts in the `empty` state. Rules and host modules must be
   * registered before any constraints can be asserted.
   *
   * @param options - Optional engine configuration.
   */
  constructor(options = {}) {
    this.maxRuleFirings = options.maxRuleFirings ?? 1e4;
    this.onRuleFired = options.onRuleFired;
    this.strictHostDeclarations = options.strictHostDeclarations ?? false;
    this.hostFunctionTimeout = options.hostFunctionTimeout;
  }
  // -------------------------------------------------------------------------
  // State inspection
  // -------------------------------------------------------------------------
  /**
   * Return the current engine state.
   *
   * Possible values: `'empty'`, `'ready'`, `'running'`, `'error'`.
   */
  getState() {
    return this._state;
  }
  /**
   * Return accumulated warnings from the most recent program load.
   *
   * Warnings include things like shadowed variables, dead bindings, and
   * unused host declarations. They do not prevent the engine from running
   * but may indicate bugs in the rule source.
   */
  getWarnings() {
    return this.warnings;
  }
  // -------------------------------------------------------------------------
  // Rule loading
  // -------------------------------------------------------------------------
  /**
   * Add a single rule to the engine.
   *
   * Rules must be added before any constraints are asserted. Adding rules
   * while the engine is `running` throws an error. Adding rules transitions
   * the engine to the `ready` state.
   *
   * @param rule - The parsed rule to add.
   * @throws {CHRExecutionError} If the engine is running or the rule is invalid.
   */
  addRule(rule) {
    this.ensureEmpty();
    this.validateRuleConstraints(rule);
    this.validateVariableScoping(rule);
    const normalizedRule = {
      ...rule,
      name: rule.name ?? `rule_${this.rules.length}`
    };
    this.rules.push(normalizedRule);
    this.compileRule(normalizedRule);
    this.hostDeclarationsValidated = false;
    this._state = "ready";
  }
  /**
   * Pre-compile a rule to extract head functors and priority.
   *
   * This optimization avoids recomputing head functors on every fixpoint
   * iteration. The compiled representation is stored in `compiledRules` and
   * the sorted priority list is rebuilt.
   */
  compileRule(rule) {
    const headFunctors = [];
    for (const pattern of [...rule.kept, ...rule.removed]) {
      headFunctors.push({
        name: pattern.name,
        arity: pattern.args.length
      });
    }
    const compiled = {
      rule,
      headFunctors,
      priority: rule.priority ?? 0
    };
    this.compiledRules.push(compiled);
    this.rebuildSortedRules();
  }
  /**
   * Rebuild the priority-sorted rule list.
   *
   * Called after every `compileRule` to ensure that `fireNextRule` always
   * tries the highest-priority rule first.
   */
  rebuildSortedRules() {
    this.sortedCompiledRules = [...this.compiledRules].sort((a, b) => b.priority - a.priority);
  }
  /**
   * Validate that all variables used in guards and body are bound in the head.
   *
   * This check runs at rule-load time (not at match time) so that mistakes
   * like using an unbound variable in a guard are caught immediately with a
   * precise source location.
   *
   * The wildcard variable `_` is exempt from the check because it is
   * intentionally anonymous.
   */
  validateVariableScoping(rule) {
    const patternVars = /* @__PURE__ */ new Set();
    for (const pattern of [...rule.kept, ...rule.removed]) {
      for (const arg of pattern.args) {
        this.collectVariablesInExpression(arg, patternVars);
      }
    }
    for (const guard of rule.guard) {
      const guardVars = /* @__PURE__ */ new Set();
      this.collectVariablesInExpression(guard, guardVars);
      for (const varName of guardVars) {
        if (varName !== "_" && !patternVars.has(varName)) {
          throw new CHRExecutionError(
            `Guard references unbound variable '${varName}' in rule '${rule.name ?? "anonymous"}'. Only variables bound in head constraints can appear in guards.`,
            rule.span
          );
        }
      }
    }
    for (const item of rule.body) {
      if (item.type === "constraint") {
        for (const arg of item.constraint.args) {
          const bodyVars = /* @__PURE__ */ new Set();
          this.collectVariablesInExpression(arg, bodyVars);
          for (const varName of bodyVars) {
            if (varName !== "_" && !patternVars.has(varName)) {
              throw new CHRExecutionError(
                `Body constraint uses unbound variable '${varName}' in rule '${rule.name ?? "anonymous"}'..`,
                rule.span
              );
            }
          }
        }
      } else if (item.type === "update") {
        for (const arg of [...item.old.args, ...item.constraint.args]) {
          const bodyVars = /* @__PURE__ */ new Set();
          this.collectVariablesInExpression(arg, bodyVars);
          for (const varName of bodyVars) {
            if (varName !== "_" && !patternVars.has(varName)) {
              throw new CHRExecutionError(
                `Body update uses unbound variable '${varName}' in rule '${rule.name ?? "anonymous"}'..`,
                rule.span
              );
            }
          }
        }
      }
    }
  }
  /**
   * Recursively collect all variable names referenced in an expression.
   *
   * Used by `validateVariableScoping` to build the set of bound variables
   * from the rule head.
   */
  collectVariablesInExpression(expr, vars) {
    if (expr.type === "variable") {
      vars.add(expr.name);
    } else if (expr.type === "unary") {
      this.collectVariablesInExpression(expr.operand, vars);
    } else if (expr.type === "binary") {
      this.collectVariablesInExpression(expr.left, vars);
      this.collectVariablesInExpression(expr.right, vars);
    } else if (expr.type === "call") {
      for (const arg of expr.args) {
        this.collectVariablesInExpression(arg, vars);
      }
    } else if (expr.type === "array") {
      for (const elem of expr.elements) {
        this.collectVariablesInExpression(elem, vars);
      }
    }
  }
  /**
   * Load a complete program from a `ProgramNode`.
   *
   * Processes declarations, function/action declarations, host imports, and
   * rules in order. After loading, validates host declarations and scans for
   * unused functions/actions, pushing warnings into the `warnings` array.
   *
   * @param program - The parsed AST to load.
   * @throws {CHRExecutionError} If the engine is not `empty`.
   */
  addProgram(program) {
    this.ensureEmpty();
    const unusedFunctions = new Set(program.functionDeclarations.map((d) => d.name));
    const unusedActions = new Set(program.actionDeclarations.map((d) => d.name));
    for (const declaration of program.declarations) {
      this.applyDeclaration(declaration);
    }
    for (const declaration of program.functionDeclarations) {
      this.applyFunctionDeclaration(declaration);
    }
    for (const declaration of program.actionDeclarations) {
      this.applyActionDeclaration(declaration);
    }
    for (const imprt of program.hostImports) {
      this.applyHostImport(imprt);
    }
    for (const rule of program.rules) {
      this.addRule(rule);
      this.checkMatchingAndShadowing(rule);
      this.scanRuleUsage(rule, unusedFunctions, unusedActions);
    }
    for (const name of unusedFunctions) {
      this.warnings.push(`Unused function declaration: functions ${name}/...`);
    }
    for (const name of unusedActions) {
      this.warnings.push(`Unused action declaration: actions ${name}/...`);
    }
  }
  /**
   * Parse and load a `.chr` source string in one step.
   *
   * Equivalent to `addProgram(parseProgram(source))`.
   */
  addRules(source) {
    this.addProgram(parseProgram(source));
  }
  /**
   * Validate a `.chr` source string without executing it.
   *
   * Returns an object indicating whether the source parsed and validated
   * successfully. Parse errors are returned as `parseError`; execution-time
   * validation errors (e.g. unbound variables, arity mismatches) are returned
   * as `executionErrors`. The engine state is not modified.
   */
  validate(source) {
    const executionErrors = [];
    try {
      const program = parseProgram(source);
      for (const declaration of program.declarations) {
        this.applyDeclaration(declaration);
      }
      for (const declaration of program.functionDeclarations) {
        this.applyFunctionDeclaration(declaration);
      }
      for (const declaration of program.actionDeclarations) {
        this.applyActionDeclaration(declaration);
      }
      for (const imprt of program.hostImports) {
        this.applyHostImport(imprt);
      }
      for (const rule of program.rules) {
        try {
          this.validateRuleConstraints(rule);
          this.validateVariableScoping(rule);
          this.checkMatchingAndShadowing(rule);
        } catch (error) {
          if (error instanceof CHRExecutionError) {
            executionErrors.push(error);
          } else {
            throw error;
          }
        }
      }
      return { ok: executionErrors.length === 0, executionErrors };
    } catch (error) {
      if (error instanceof CHRParseError) {
        return { ok: false, parseError: error, executionErrors };
      }
      throw error;
    }
  }
  // -------------------------------------------------------------------------
  // Host registration
  // -------------------------------------------------------------------------
  /**
   * Register a single host function by name.
   *
   * The function's arity is inferred from `handler.length - 1` (the first
   * parameter is the context object, so it is excluded). If a function with
   * the same name is already registered, it is replaced.
   */
  registerFunction(name, handler) {
    this.validateHostDeclaration(name, handler.length - 1, this.functionDeclarations, "function", false);
    this.functions.set(name, handler);
    if (!this.functionDeclarations.has(name)) {
      this.functionDeclarations.set(name, -1);
    }
  }
  /**
   * Register multiple host functions from a record.
   *
   * Convenience wrapper around `registerFunction`.
   */
  registerFunctions(handlers) {
    for (const [name, handler] of Object.entries(handlers)) {
      this.registerFunction(name, handler);
    }
  }
  /**
   * Register a single host action by name.
   *
   * The action's arity is inferred from `handler.length - 1`. If an action
   * with the same name is already registered, it is replaced.
   */
  registerAction(name, handler) {
    this.validateHostDeclaration(name, handler.length - 1, this.actionDeclarations, "action", false);
    this.actions.set(name, handler);
    if (!this.actionDeclarations.has(name)) {
      this.actionDeclarations.set(name, -1);
    }
  }
  /**
   * Register multiple host actions from a record.
   *
   * Convenience wrapper around `registerAction`.
   */
  registerActions(handlers) {
    for (const [name, handler] of Object.entries(handlers)) {
      this.registerAction(name, handler);
    }
  }
  /**
   * Register a complete host module (functions + actions) at once.
   */
  registerHost(module) {
    if (module.functions) {
      this.registerFunctions(module.functions);
    }
    if (module.actions) {
      this.registerActions(module.actions);
    }
  }
  /**
   * Register the built-in host module (22 standard functions).
   *
   * The builtins module provides arithmetic, comparison, type checking,
   * string manipulation, and store inspection functions. It is registered
   * under the reserved name `'builtins'` and its functions are merged into
   * the engine's function registry.
   */
  registerBuiltins() {
    this.registerHost(BuiltinsModule);
    this.hostModules.set("builtins", BuiltinsModule);
  }
  /**
   * Register a named host module for later import via `import host Name`.
   *
   * @param name - The module name used in `.chr` source.
   * @param module - The module containing `functions` and/or `actions`.
   * @throws {CHRExecutionError} If a module with the same name is already registered.
   */
  registerHostModule(name, module) {
    if (this.hostModules.has(name)) {
      throw new CHRExecutionError(`Host module '${name}' is already registered.`);
    }
    this.hostModules.set(name, module);
  }
  /**
   * Register multiple named host modules.
   */
  registerHostModules(modules) {
    for (const [name, module] of Object.entries(modules)) {
      this.registerHostModule(name, module);
    }
  }
  // -------------------------------------------------------------------------
  // Constraint declaration
  // -------------------------------------------------------------------------
  /**
   * Declare a single constraint with a fixed arity.
   *
   * Constraint declarations enforce arity checking. Declaring `edge/2` and
   * then asserting `edge(1)` or matching `edge(X, Y, Z)` will throw an
   * execution error.
   *
   * @param name - Constraint functor name.
   * @param arity - Expected number of arguments.
   * @throws {CHRExecutionError} If the constraint is redeclared with a different arity.
   */
  declareConstraint(name, arity) {
    const existing = this.declarations.get(name);
    if (typeof existing === "number" && existing !== arity) {
      throw new CHRExecutionError(`Constraint ${name} redeclared with incompatible arity ${arity}; existing arity is ${existing}.`);
    }
    this.declarations.set(name, arity);
  }
  /**
   * Declare multiple constraints from a name→arity map.
   */
  declareConstraints(entries) {
    for (const [name, arity] of Object.entries(entries)) {
      this.declareConstraint(name, arity);
    }
  }
  // -------------------------------------------------------------------------
  // Constraint assertion (primary user-facing API)
  // -------------------------------------------------------------------------
  /**
   * Assert a single constraint into the store and run the fixpoint loop.
   *
   * This is the main way to introduce new constraints. After adding the
   * constraint to the store, the engine iterates over rules (highest
   * priority first) and fires the first matching rule, repeating until no
   * more rules match or `maxRuleFirings` is exceeded.
   *
   * @param name - Constraint functor name.
   * @param args - Constraint arguments (must match declared arity if declared).
   * @param options - Optional per-assertion options.
   * @returns The `ConstraintRecord` that was added to the store.
   * @throws {CHRExecutionError} If no rules are loaded, arity is wrong, or max firings exceeded.
   */
  async assert(name, args = [], options) {
    this.ensureReady();
    this.validateConstraintArity(name, args.length);
    this.validateHostDeclarationsOnce();
    const record = this.store.add(name, args);
    await this.runToFixpointSafe(options);
    return record;
  }
  /**
   * Assert multiple constraints in batch and run the fixpoint loop once.
   *
   * More efficient than calling `assert` repeatedly because the fixpoint
   * loop only runs once after all constraints are added.
   *
   * @param entries - Array of `{ name, args }` constraint descriptors.
   * @param options - Optional per-assertion options.
   * @returns `{ added: number }` count of asserted constraints.
   */
  async assertMany(entries, options) {
    this.ensureReady();
    this.validateHostDeclarationsOnce();
    for (const entry of entries) {
      this.validateConstraintArity(entry.name, (entry.args ?? []).length);
      this.store.add(entry.name, entry.args ?? []);
    }
    await this.runToFixpointSafe(options);
    return { added: entries.length };
  }
  /**
   * Clear the constraint store, history, and warnings.
   *
   * Does NOT remove rules or host modules. The engine returns to `ready`
   * state and can accept new assertions.
   */
  clear() {
    this.store.clear();
    this.history.clear();
    this.warnings.length = 0;
    this._state = "ready";
  }
  // -------------------------------------------------------------------------
  // Inspection / debugging
  // -------------------------------------------------------------------------
  /**
   * Take a snapshot of the engine's current state.
   *
   * The snapshot includes the rule list, constraint store contents, and
   * propagation history. It is a point-in-time copy; subsequent engine
   * mutations do not affect the snapshot.
   */
  snapshot() {
    return {
      rules: this.rules.map((rule) => {
        const entry = {
          name: rule.name ?? "anonymous",
          kind: rule.kind
        };
        if (rule.priority !== void 0) {
          entry.priority = rule.priority;
        }
        return entry;
      }),
      constraints: this.store.snapshot(),
      history: this.history.snapshot()
    };
  }
  /**
   * Return a shallow copy of the loaded rules.
   */
  getRules() {
    return [...this.rules];
  }
  /**
   * Return all rules whose head contains a constraint with the given name.
   *
   * Useful for introspection and debugging: you can ask "which rules care
   * about `edge` constraints?" and get the answer.
   */
  getRulesByHead(name) {
    return this.rules.filter((rule) => {
      for (const head of [...rule.kept, ...rule.removed]) {
        if (head.name === name) return true;
      }
      return false;
    });
  }
  /**
   * Return a human-readable string of the constraint store contents.
   */
  printStore() {
    return this.store.toString();
  }
  /**
   * Return a human-readable string of the propagation history.
   */
  printHistory() {
    const snapshot = this.history.snapshot();
    const keys = Object.keys(snapshot);
    if (keys.length === 0) return "(empty)";
    const rows = keys.flatMap(
      (ruleName) => (snapshot[ruleName] ?? []).map((ids) => `${ruleName}: [${ids}]`)
    );
    return ["Rule  Fired-on IDs", "----  --------------", ...rows].join("\n");
  }
  /**
   * Return a human-readable string describing all loaded rules.
   */
  printRules() {
    if (this.rules.length === 0) return "(no rules loaded)";
    return this.rules.map((rule, i) => {
      const name = rule.name ?? `rule_${i}`;
      const kind = rule.kind;
      const kept = rule.kept.map((h) => `${h.name}/${h.args.length}`).join(", ");
      const removed = rule.removed.map((h) => `${h.name}/${h.args.length}`).join(", ");
      return `${i}: ${name} [${kind}] kept=[${kept}] removed=[${removed}]`;
    }).join("\n");
  }
  /**
   * Throw if no rules have been loaded.
   *
   * @throws {CHRExecutionError} If `this.rules` is empty.
   */
  ensureRulesLoaded() {
    if (this.rules.length === 0) {
      throw new CHRExecutionError("No rules have been loaded into the engine.");
    }
  }
  /**
   * Load rules from a `.chr` file on disk.
   *
   * @param filePath - Absolute or relative path to the `.chr` file.
   * @throws {CHRExecutionError} If the engine is running.
   */
  load(filePath) {
    const source = readFileSync(filePath, "utf-8");
    this.addRules(source);
  }
  // -------------------------------------------------------------------------
  // Test DSL: fluent assertion API
  // -------------------------------------------------------------------------
  /**
   * Create a fluent assertion descriptor for testing.
   *
   * Returns an object with `exists()`, `missing()`, and `count(n)` methods
   * that check whether a constraint matching the given name and args is
   * present in the store.
   *
   * Example:
   *   engine.assert('edge', [1, 2])
   *   expect(engine.expect('edge', [1, 2]).exists()).toBe(true)
   */
  expect(name, args) {
    const records = this.store.lookup(name, args.length);
    return {
      exists: () => records.some((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])),
      missing: () => !records.some((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])),
      count: (n) => records.filter((r) => r.args.length === args.length && r.args.every((v, i) => v === args[i])).length === n
    };
  }
  /**
   * Return a type-safe assertion wrapper.
   *
   * The generic parameter `Constraints` is a record mapping constraint names
   * to tuples of argument types. The returned object exposes `assert` and
   * `assertMany` with compile-time arity checking.
   */
  withConstraints() {
    return this;
  }
  // -------------------------------------------------------------------------
  // Private state guards
  // -------------------------------------------------------------------------
  /** Throw if the engine is currently running (mutations not allowed during fixpoint). */
  ensureEmpty() {
    if (this._state === "running") {
      throw new CHRExecutionError("Engine is currently running. Wait for the current assertion to complete before modifying rules.");
    }
  }
  /** Throw if the engine is `empty` or in `error` state. */
  ensureReady() {
    if (this._state === "empty") {
      throw new CHRExecutionError("No rules have been loaded into the engine.");
    }
    if (this._state === "error") {
      throw new CHRExecutionError("Engine is in an error state. Create a new engine instance to continue.");
    }
  }
  // -------------------------------------------------------------------------
  // Host declaration validation
  // -------------------------------------------------------------------------
  /**
   * Validate that all declared host functions and actions have been registered.
   *
   * This runs once before the first assertion (cached in
   * `hostDeclarationsValidated`). It ensures that `functions foo/2;` in the
   * `.chr` source has a corresponding `engine.registerFunction('foo', ...)`
   * call in the host setup code.
   */
  validateHostDeclarationsOnce() {
    if (this.hostDeclarationsValidated) {
      return;
    }
    for (const [name, arity] of this.functionDeclarations) {
      if (!this.functions.has(name)) {
        throw new CHRExecutionError(`Declared function ${name}/${arity} is not registered. Call engine.registerFunction('${name}', handler) before asserting constraints.`);
      }
    }
    for (const [name, arity] of this.actionDeclarations) {
      if (!this.actions.has(name)) {
        throw new CHRExecutionError(`Declared action ${name}/${arity} is not registered. Call engine.registerAction('${name}', handler) before asserting constraints.`);
      }
    }
    this.hostDeclarationsValidated = true;
  }
  /**
   * Scan a rule for used host functions and actions, removing them from the
   * "unused" sets.
   *
   * After all rules are loaded, any names remaining in `unusedFunctions` or
   * `unusedActions` are reported as warnings. This helps catch dead declarations
   * in the `.chr` source.
   */
  scanRuleUsage(rule, unusedFunctions, unusedActions) {
    const usedFunctions = /* @__PURE__ */ new Set();
    const usedActions = /* @__PURE__ */ new Set();
    const scanExpression = (expr) => {
      if (expr.type === "call") {
        usedFunctions.add(expr.callee);
      } else if (expr.type === "binary") {
        scanExpression(expr.left);
        scanExpression(expr.right);
      } else if (expr.type === "unary") {
        scanExpression(expr.operand);
      }
    };
    const scanExprs = (exprs) => {
      for (const e of exprs) scanExpression(e);
    };
    const scanBody = (items) => {
      for (const item of items) {
        if (item.type === "action") {
          usedActions.add(item.name);
          scanExprs(item.args);
        } else if (item.type === "constraint" || item.type === "update") {
          for (const arg of item.constraint.args) scanExpression(arg);
          if (item.type === "update") {
            for (const arg of item.old.args) scanExpression(arg);
          }
        } else if (item.type === "let") {
          scanExpression(item.expr);
        }
      }
    };
    for (const guard of rule.guard) {
      scanExpression(guard);
    }
    scanBody(rule.body);
    for (const name of usedFunctions) {
      unusedFunctions.delete(name);
    }
    for (const name of usedActions) {
      unusedActions.delete(name);
    }
  }
  /**
   * Check a rule for common authoring mistakes.
   *
   * Two warnings are produced:
   * 1. Shadowed variables: a variable name appears in more than one head
   *    constraint. This is often a typo.
   * 2. Dead bindings: a variable is bound in the head but never used in
   *    guards or body.
   */
  checkMatchingAndShadowing(rule) {
    const allHeadVars = /* @__PURE__ */ new Map();
    for (let c = 0; c < rule.kept.length; c++) {
      for (const arg of rule.kept[c].args) {
        if (arg.type === "variable" && arg.name !== "_") {
          const key = arg.name;
          const existing = allHeadVars.get(key) ?? [];
          existing.push({ constraintIndex: c });
          allHeadVars.set(key, existing);
        }
      }
    }
    for (let c = 0; c < rule.removed.length; c++) {
      for (const arg of rule.removed[c].args) {
        if (arg.type === "variable" && arg.name !== "_") {
          const key = arg.name;
          const existing = allHeadVars.get(key) ?? [];
          existing.push({ constraintIndex: c });
          allHeadVars.set(key, existing);
        }
      }
    }
    const guardVars = /* @__PURE__ */ new Set();
    const bodyVars = /* @__PURE__ */ new Set();
    const collectVars = (expr) => {
      if (expr.type === "variable" && expr.name !== "_") {
        bodyVars.add(expr.name);
      } else if (expr.type === "unary") {
        collectVars(expr.operand);
      } else if (expr.type === "binary") {
        collectVars(expr.left);
        collectVars(expr.right);
      } else if (expr.type === "call") {
        for (const arg of expr.args) collectVars(arg);
      } else if (expr.type === "array") {
        for (const elem of expr.elements) collectVars(elem);
      }
    };
    for (const guard of rule.guard) {
      collectVars(guard);
      for (const v of bodyVars) guardVars.add(v);
    }
    bodyVars.clear();
    for (const item of rule.body) {
      if (item.type === "constraint") {
        for (const arg of item.constraint.args) {
          collectVars(arg);
        }
      } else if (item.type === "action") {
        for (const arg of item.args) collectVars(arg);
      } else if (item.type === "update") {
        for (const arg of item.old.args) collectVars(arg);
        for (const arg of item.constraint.args) collectVars(arg);
      } else if (item.type === "let") {
        collectVars(item.expr);
      }
    }
    for (const [varName, occurrences] of allHeadVars) {
      if (occurrences.length > 1) {
        this.warnings.push(`Shadowed variable '${varName}' appears in multiple head constraints in rule '${rule.name ?? "anonymous"}'. This is likely a typo.`);
      }
      if (!bodyVars.has(varName) && !guardVars.has(varName)) {
        this.warnings.push(`Dead binding '${varName}' in rule '${rule.name ?? "anonymous"}': bound in head but never used in guards or body.`);
      }
    }
  }
  // -------------------------------------------------------------------------
  // Fixpoint loop
  // -------------------------------------------------------------------------
  /**
   * Run the fixpoint loop with error-state management.
   *
   * Sets `_state = 'running'` before calling `runToFixpoint`. On success the
   * state returns to `'ready'`; on failure it transitions to `'error'`.
   */
  async runToFixpointSafe(options) {
    this._state = "running";
    try {
      await this.runToFixpoint(options);
      this._state = "ready";
    } catch (error) {
      this._state = "error";
      throw error;
    }
  }
  /**
   * Execute the core fixpoint loop.
   *
   * Repeatedly calls `fireNextRule` until no rule fires or the maximum
   * firing count is exceeded. The maximum is either the per-assertion option
   * or the engine-wide default.
   *
   * @throws {CHRExecutionError} If `maxRuleFirings` is exceeded.
   */
  async runToFixpoint(options) {
    let firings = 0;
    const maxFirings = options?.maxRuleFirings ?? this.maxRuleFirings;
    while (true) {
      const fired = await this.fireNextRule();
      if (!fired) {
        return;
      }
      firings += 1;
      if (firings > maxFirings) {
        throw new CHRExecutionError(`Maximum rule firings exceeded (${maxFirings}).`);
      }
    }
  }
  /**
   * Find and fire the first rule that has a matching head and passing guards.
   *
   * Rules are tried in descending priority order (highest priority first).
   * Only one rule fires per call. Returns `true` if a rule was fired, `false`
   * if no rules matched.
   */
  async fireNextRule() {
    for (const compiled of this.sortedCompiledRules) {
      const rule = compiled.rule;
      const match = await this.findMatch(rule);
      if (!match) {
        continue;
      }
      await this.applyRule(rule, match);
      return true;
    }
    return false;
  }
  // -------------------------------------------------------------------------
  // Pattern matching
  // -------------------------------------------------------------------------
  /**
   * Attempt to find a match for a rule's head constraints in the store.
   *
   * Uses `findMatchRecursive` to perform a depth-first search over the
   * Cartesian product of store entries matching each head pattern. Returns
   * the first complete match whose guards all pass.
   */
  async findMatch(rule) {
    const heads = [...rule.kept, ...rule.removed];
    if (heads.length === 0) {
      return { constraints: [], bindings: {} };
    }
    return this.findMatchRecursive(rule, heads, 0, [], {}, /* @__PURE__ */ new Set());
  }
  /**
   * Recursively search for a complete head match.
   *
   * For each head pattern at `index`, iterate over all store entries that
   * match the functor and arity. For each candidate, extend the current
   * bindings with `matchPattern`. If all heads are matched and guards pass,
   * return the match. Otherwise backtrack and try the next candidate.
   *
   * The `usedIds` set prevents the same constraint from being matched twice
   * in a single rule head.
   */
  async findMatchRecursive(rule, heads, index, matched, bindings, usedIds) {
    if (index >= heads.length) {
      const ids = matched.map((entry) => entry.id);
      const guardsOk = await this.evaluateGuards(rule, matched, bindings);
      if (!guardsOk) {
        return null;
      }
      if (rule.kind === "propagation") {
        if (this.history.has(rule.name ?? "anonymous", ids)) {
          return null;
        }
        this.history.add(rule.name ?? "anonymous", ids);
      }
      return { constraints: matched, bindings };
    }
    const pattern = heads[index];
    if (!pattern) {
      return null;
    }
    for (const candidate of this.store.lookup(pattern.name, pattern.args.length)) {
      if (usedIds.has(candidate.id)) {
        continue;
      }
      const newBindings = this.matchPattern(rule, pattern, candidate, bindings);
      if (!newBindings) {
        continue;
      }
      const nextUsedIds = new Set(usedIds);
      nextUsedIds.add(candidate.id);
      const recursive = await this.findMatchRecursive(
        rule,
        heads,
        index + 1,
        [...matched, candidate],
        newBindings,
        nextUsedIds
      );
      if (recursive) {
        return recursive;
      }
    }
    return null;
  }
  /**
   * Match a single head pattern against a candidate constraint record.
   *
   * If `rule.unify` is true, uses structural unification (transitive variable
   * binding). Otherwise uses strict equality: a variable that is already bound
   * must match exactly; literals must match exactly.
   */
  matchPattern(rule, pattern, constraint, bindings) {
    let nextBindings = { ...bindings };
    const useUnification = rule.unify === true;
    const subst = useUnification ? this.initSubstitution(bindings) : null;
    for (let index = 0; index < pattern.args.length; index++) {
      const term = pattern.args[index];
      const value = constraint.args[index];
      if (!term) {
        return null;
      }
      if (term.type === "variable") {
        if (term.name === "_") {
          continue;
        }
        if (useUnification) {
          const unified = unifyTerm(term, value, subst);
          if (!unified) {
            return null;
          }
          nextBindings = materializeSubstitution(unified, nextBindings);
        } else {
          if (Object.hasOwn(nextBindings, term.name)) {
            if (nextBindings[term.name] !== value) {
              return null;
            }
          } else {
            nextBindings = { ...nextBindings, [term.name]: value };
          }
        }
        continue;
      }
      if (term.type === "literal") {
        if (term.value !== value) {
          return null;
        }
        continue;
      }
      throw new CHRExecutionError(`Head expressions must be variables or literals. Unsupported term in ${pattern.name}/${pattern.args.length}.`, rule.span);
    }
    return nextBindings;
  }
  /**
   * Initialize a `Substitution` from existing variable bindings.
   *
   * Used only when `rule.unify` is true. The wildcard `_` is excluded from
   * the substitution because it never needs to be resolved.
   */
  initSubstitution(bindings) {
    const subst = new Substitution();
    for (const [name, value] of Object.entries(bindings)) {
      if (name !== "_") {
        subst.set(name, value);
      }
    }
    return subst;
  }
  // -------------------------------------------------------------------------
  // Guard evaluation
  // -------------------------------------------------------------------------
  /**
   * Evaluate all guards for a candidate match.
   *
   * Guards are evaluated left-to-right. Evaluation short-circuits on the
   * first falsy result. `CHRGuardError` thrown by a host function is caught
   * and treated as a guard failure (the rule does not fire), not as a fatal
   * engine error.
   *
   * @returns `true` if all guards pass, `false` if any guard fails.
   */
  async evaluateGuards(rule, matched, bindings) {
    for (const guard of rule.guard) {
      try {
        const value = await this.evaluateExpression(guard, rule, matched, bindings, true);
        if (!value) {
          return false;
        }
      } catch (error) {
        if (error instanceof CHRGuardError) {
          return false;
        }
        throw error;
      }
    }
    return true;
  }
  // -------------------------------------------------------------------------
  // Rule application (side effects)
  // -------------------------------------------------------------------------
  /**
   * Execute a matched rule's side effects.
   *
   * Order of operations:
   * 1. Fire the `onRuleFired` callback with timing information.
   * 2. Determine which matched constraints should be removed.
   * 3. Remove those constraints from the store.
   * 4. Execute body items (constraint additions, actions, updates, let-bindings).
   *
   * The store is not mutated during head matching or guard evaluation. It is
   * only mutated in step 3 (removal) and step 4 (addition / update), and
   * body items see the post-removal store state.
   */
  async applyRule(rule, match) {
    const ruleName = rule.name ?? "anonymous";
    const ids = match.constraints.map((entry) => entry.id);
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.onRuleFiredWithTiming(rule, ruleName, ids, match, startTime);
    const constraintsToRemove = this.determineConstraintsToRemove(rule, match.constraints);
    for (const constraint of constraintsToRemove) {
      this.store.remove(constraint.id);
    }
    for (const item of rule.body) {
      if (item.type === "constraint") {
        await this.emitConstraint(rule, match, item);
      } else if (item.type === "action") {
        await this.runAction(rule, match, item);
      } else if (item.type === "update") {
        await this.applyConstraintUpdate(rule, match, item);
      } else if (item.type === "let") {
        await this.evaluateExpression(item.expr, rule, match.constraints, match.bindings, false);
      }
    }
  }
  /**
   * Determine which matched constraints should be removed based on rule kind.
   *
   * - `propagation`: no constraints are removed (kept = all).
   * - `simplification`: all matched constraints are removed.
   * - `simpagation`: only the removed head constraints are removed (those
   *   after the `\` separator).
   */
  determineConstraintsToRemove(rule, matched) {
    if (rule.kind === "propagation") {
      return [];
    }
    if (rule.kind === "simplification") {
      return matched;
    }
    return matched.slice(rule.kept.length);
  }
  /**
   * Emit a new constraint into the store as part of rule body execution.
   *
   * Special case: `true` (arity 0) is silently ignored because it is a no-op
   * in CHR semantics.
   */
  async emitConstraint(rule, match, item) {
    if (item.constraint.name === "true" && item.constraint.args.length === 0) {
      return;
    }
    const args = [];
    for (const arg of item.constraint.args) {
      args.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false));
    }
    this.validateConstraintArity(item.constraint.name, args.length);
    this.store.add(item.constraint.name, args);
  }
  /**
   * Perform an in-place constraint update: remove `old` and add `constraint`.
   *
   * The engine locates all store entries matching `old` by comparing names,
   * arities, and every argument value. Matching entries are removed before
   * the new constraint is added.
   */
  async applyConstraintUpdate(rule, match, item) {
    const oldArgs = [];
    for (const arg of item.old.args) {
      oldArgs.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false));
    }
    const toRemove = this.store.lookup(item.old.name, oldArgs.length).filter((c) => {
      if (c.args.length !== oldArgs.length) return false;
      return c.args.every((v, i) => v === oldArgs[i]);
    });
    for (const c of toRemove) {
      this.store.remove(c.id);
    }
    const newArgs = [];
    for (const arg of item.constraint.args) {
      newArgs.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false));
    }
    this.validateConstraintArity(item.constraint.name, newArgs.length);
    this.store.add(item.constraint.name, newArgs);
  }
  /**
   * Execute a host action with the given evaluated arguments.
   *
   * Looks up the action by name in the action registry. If not found, throws
   * `CHRExecutionError` with a "did you mean?" suggestion if a similar name
   * exists. Wraps any action error in `CHRExecutionError` with the rule span.
   */
  async runAction(rule, match, item) {
    const action = this.actions.get(item.name);
    if (!action) {
      throw new CHRExecutionError(
        `Unknown host action: ${item.name}${this.suggestSimilar(item.name, this.actions)}`,
        rule.span
      );
    }
    const args = [];
    for (const arg of item.args) {
      args.push(await this.evaluateExpression(arg, rule, match.constraints, match.bindings, false));
    }
    try {
      await action({
        engine: this,
        store: this.store,
        history: this.history,
        rule,
        matched: match.constraints,
        bindings: match.bindings,
        args
      });
    } catch (error) {
      throw new CHRExecutionError(
        `Host action ${item.name} threw in rule ${rule.name ?? "anonymous"}: ${error.message}`,
        rule.span,
        error
      );
    }
  }
  // -------------------------------------------------------------------------
  // Expression evaluation (delegates to engine/eval.ts)
  // -------------------------------------------------------------------------
  /**
   * Evaluate an expression in the context of a rule firing.
   *
   * This is a thin wrapper around `evaluateExpression` from `engine/eval.ts`
   * that injects the engine's runtime dependencies (function map, timeout,
   * store, history, and similarity suggester).
   */
  evaluateExpression = async (expr, rule, matched, bindings, isGuard = false) => {
    return evaluateExpression(
      {
        functions: this.functions,
        hostFunctionTimeout: this.hostFunctionTimeout,
        store: this.store,
        history: this.history,
        isGuard,
        engine: this,
        suggestSimilar: (...args) => this.suggestSimilar(...args)
      },
      expr,
      rule,
      matched,
      bindings
    );
  };
  // -------------------------------------------------------------------------
  // Validation helpers
  // -------------------------------------------------------------------------
  /**
   * Validate that a rule's head constraints and body expressions are well-formed.
   *
   * Checks:
   * 1. All head constraints have declared arities (if declared).
   * 2. All host function calls in guards are declared.
   * 3. All body constraint arities match declarations.
   * 4. All host actions in the body are declared.
   * 5. All host function calls in body expressions are declared.
   */
  validateRuleConstraints(rule) {
    for (const head of [...rule.kept, ...rule.removed]) {
      this.validateConstraintArity(head.name, head.args.length);
    }
    for (const guard of rule.guard) {
      this.validateHostCallsInExpression(guard, rule, "function");
    }
    for (const item of rule.body) {
      if (item.type === "constraint") {
        this.validateConstraintArity(item.constraint.name, item.constraint.args.length);
        for (const arg of item.constraint.args) {
          this.validateHostCallsInExpression(arg, rule, "function");
        }
      } else if (item.type === "action") {
        this.validateHostDeclaration(item.name, item.args.length, this.actionDeclarations, "action", true, rule);
      } else if (item.type === "update") {
        this.validateConstraintArity(item.constraint.name, item.constraint.args.length);
        for (const arg of [...item.old.args, ...item.constraint.args]) {
          this.validateHostCallsInExpression(arg, rule, "function");
        }
      }
    }
  }
  /**
   * Throw if a constraint name is declared with a different arity.
   */
  validateConstraintArity(name, arity) {
    const declaredArity = this.declarations.get(name);
    if (typeof declaredArity === "number" && declaredArity !== arity) {
      throw new CHRExecutionError(`Constraint ${name}/${arity} violates declared arity ${declaredArity}.`);
    }
  }
  // -------------------------------------------------------------------------
  // Declaration application
  // -------------------------------------------------------------------------
  /** Apply a constraint declaration to the engine's declaration map. */
  applyDeclaration(declaration) {
    this.declareConstraint(declaration.name, declaration.arity);
  }
  /** Apply a host function declaration to the engine's declaration map. */
  applyFunctionDeclaration(declaration) {
    this.validateHostDeclaration(declaration.name, declaration.arity, this.functionDeclarations, "function", false);
    this.functionDeclarations.set(declaration.name, declaration.arity);
  }
  /** Apply a host action declaration to the engine's declaration map. */
  applyActionDeclaration(declaration) {
    this.validateHostDeclaration(declaration.name, declaration.arity, this.actionDeclarations, "action", false);
    this.actionDeclarations.set(declaration.name, declaration.arity);
  }
  /**
   * Apply a host import statement by looking up the named module.
   *
   * The module's functions and actions are merged into the engine's
   * registries. Their declarations are recorded with arity `-1` (imported)
   * so that subsequent `validateHostDeclaration` calls do not require an
   * explicit `functions name/arity;` declaration in the `.chr` source.
   */
  applyHostImport(imprt) {
    const module = this.hostModules.get(imprt.name);
    if (!module) {
      throw new CHRExecutionError(
        `Unknown host module '${imprt.name}' in import. Available modules: ${[...this.hostModules.keys()].join(", ") || "(none registered)"}`,
        imprt.span
      );
    }
    if (module.functions) {
      for (const [name, handler] of Object.entries(module.functions)) {
        this.functions.set(name, handler);
        this.functionDeclarations.set(name, -1);
      }
    }
    if (module.actions) {
      for (const [name, handler] of Object.entries(module.actions)) {
        this.actions.set(name, handler);
        this.actionDeclarations.set(name, -1);
      }
    }
  }
  // -------------------------------------------------------------------------
  // Host validation helpers
  // -------------------------------------------------------------------------
  /**
   * Recursively validate that all host function calls in an expression are
   * properly declared.
   */
  validateHostCallsInExpression(expr, rule, kind) {
    if (expr.type === "unary") {
      if (expr.operand.type === "call" || expr.operand.type === "binary" || expr.operand.type === "unary") {
        this.validateHostCallsInExpression(expr.operand, rule, kind);
      }
      return;
    }
    if (expr.type === "binary") {
      this.validateHostCallsInExpression(expr.left, rule, kind);
      this.validateHostCallsInExpression(expr.right, rule, kind);
      return;
    }
    if (expr.type !== "call") {
      return;
    }
    this.validateHostDeclaration(expr.callee, expr.args.length, this.functionDeclarations, kind, true, rule);
    for (const arg of expr.args) {
      this.validateHostCallsInExpression(arg, rule, kind);
    }
  }
  /**
   * Validate a single host function or action declaration against its registry.
   *
   * @param name - Function or action name.
   * @param arity - Number of arguments passed.
   * @param declarations - The registry map to check against.
   * @param kind - `'function'` or `'action'` (for error messages).
   * @param requireDeclaration - If true, throw when the name is not in the registry at all.
   * @param rule - Optional rule for attaching the error span.
   * @throws {CHRExecutionError} If arity mismatches or declaration is missing.
   */
  validateHostDeclaration(name, arity, declarations, kind, requireDeclaration, rule) {
    const declaredArity = declarations.get(name);
    if (typeof declaredArity === "number" && declaredArity !== arity && declaredArity !== -1) {
      throw new CHRExecutionError(`Host ${kind} ${name}/${arity} violates declared arity ${declaredArity}.`, rule?.span);
    }
    if (requireDeclaration && (declarations.size > 0 || this.strictHostDeclarations) && declaredArity === void 0) {
      throw new CHRExecutionError(`Host ${kind} ${name}/${arity} is not declared in source. Use "${kind}s ${name}/${arity};" in the rule source.`, rule?.span);
    }
  }
  // -------------------------------------------------------------------------
  // Observability
  // -------------------------------------------------------------------------
  /**
   * Build and fire the `onRuleFired` callback with timing information.
   *
   * Timing is measured using `performance.now()` (browser / Node >= 16) or
   * falls back to `Date.now()`. Errors in the callback are silently ignored
   * so that observability hooks cannot disrupt rule execution.
   */
  onRuleFiredWithTiming(rule, ruleName, ids, match, startTime) {
    if (!this.onRuleFired) return;
    const trace = {
      ruleName,
      kind: rule.kind,
      matchedConstraintIds: ids,
      bindings: { ...match.bindings },
      guardResults: [],
      firedAt: startTime
    };
    if (rule.priority !== void 0) {
      trace.priority = rule.priority;
    }
    const endTraceTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    trace.durationMs = endTraceTime - startTime;
    try {
      this.onRuleFired(trace);
    } catch {
    }
  }
  // -------------------------------------------------------------------------
  // Utility: fuzzy name matching
  // -------------------------------------------------------------------------
  /**
   * Suggest a similar registered name for a typo.
   *
   * Uses Levenshtein-style character-by-character comparison. If the best
   * match has distance <= 3, returns a `. Did you mean X?` suggestion.
   * Otherwise returns an empty string.
   */
  suggestSimilar(name, registry) {
    let bestDistance = Infinity;
    let bestName = "";
    for (const key of registry.keys()) {
      let distance = 0;
      const len = Math.max(name.length, key.length);
      for (let i = 0; i < len; i++) {
        if ((name[i] ?? "") !== (key[i] ?? "")) distance++;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestName = key;
      }
    }
    if (bestDistance <= 3 && bestName) {
      return `. Did you mean ${bestName}?`;
    }
    return "";
  }
};

// src/browser-engine.ts
var BrowserCHREngine = class extends CHREngine {
  constructor(options = {}) {
    super(options);
  }
  /**
   * Load rules from a `.chr` file on disk.
   *
   * NOT SUPPORTED IN BROWSER. Use `addRules(source)` or `addProgram(program)` instead.
   *
   * @throws {Error} Always throws in browser environments.
   */
  load(_filePath) {
    throw new Error(
      "CHR.ts: File loading (load()) is not supported in the browser. Use addRules(source) or addProgram(program) instead."
    );
  }
};

// src/core/loader.ts
function createEngine(options = { source: "" }) {
  const engineOpts = {};
  if (options.maxRuleFirings !== void 0) {
    engineOpts.maxRuleFirings = options.maxRuleFirings;
  }
  const engine = new CHREngine(engineOpts);
  if (options.builtins) {
    engine.registerBuiltins();
  }
  if (options.host) {
    engine.registerHost(options.host);
  }
  if (options.source.trim()) {
    engine.addRules(options.source);
  }
  return engine;
}

// src/core/host.ts
function defineHostModule(definition) {
  return definition;
}
self.BrowserCHREngine = BrowserCHREngine;
self.BuiltinsModule = BuiltinsModule;
self.CHREngine = CHREngine;
self.CHRExecutionError = CHRExecutionError;
self.CHRGuardError = CHRGuardError;
self.CHRParseError = CHRParseError;
self.ConstraintStore = ConstraintStore;
self.PropagationHistory = PropagationHistory;
self.Substitution = Substitution;
self.createEngine = createEngine;
self.defineHostModule = defineHostModule;
self.formatSourceSpan = formatSourceSpan;
self.materializeSubstitution = materializeSubstitution;
self.parseExpression = parseExpression;
self.parseProgram = parseProgram;
self.unifyTerm = unifyTerm;
