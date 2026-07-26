/**
 * Browser entry point for CHR.ts.
 *
 * This module provides a browser-compatible version of the CHR.ts library
 * by stubbing out Node.js-specific dependencies (like `node:fs`) that are
 * only needed for server-side file loading.
 *
 * The `load()` method on CHREngine uses `readFileSync` from `node:fs`.
 * In the browser, we throw a descriptive error if someone tries to use it.
 *
 * Usage (after bundling):
 *   import { CHREngine, parseProgram, createEngine, defineHostModule } from './chrts-bundle.js'
 */

// Re-export everything from the main entry point.
// The only Node.js-specific code is in engine.ts's `load()` method, which
// uses `readFileSync`. In the browser bundle, esbuild will either:
// 1. Replace it with a stub (if we use --inject or --alias)
// 2. Or we override the engine class to not have `load()` at all
//
// We use approach: re-export everything and let the bundler handle `node:fs`.
// esbuild will generate a polyfill or error depending on the platform=target.
// For `platform=browser`, esbuild will provide an empty stub for `node:fs`.

export { BrowserCHREngine } from './browser-engine.js'
export { CHREngine } from './core/engine.js'
export { parseProgram, parseExpression } from './core/parser.js'
export { createEngine } from './core/loader.js'
export { defineHostModule } from './core/host.js'
export { BuiltinsModule } from './core/builtins.js'
export { CHRParseError, CHRExecutionError, CHRGuardError, formatSourceSpan } from './core/errors.js'
export { ConstraintStore } from './core/store.js'
export { PropagationHistory } from './core/history.js'
export { Substitution } from './core/substitution.js'
export { unifyTerm, materializeSubstitution } from './core/unification.js'

export type {
  EngineSnapshot,
  HostFunctionContext,
  HostActionContext,
  HostFunction,
  GuardFunction,
  HostAction,
  HostModule,
  CHREngineOptions,
  TypedEngine,
  EngineState
} from './core/engine.js'

export type {
  ProgramNode,
  RuleNode,
  ConstraintPattern,
  Expression,
  BodyItem,
  BodyConstraint,
  BodyAction,
  BodyConstraintUpdate,
  BodyLetBinding,
  RuleFireTrace,
  RuleKind,
  SourceSpan,
  SourceLocation,
  ConstraintDeclaration,
  HostFunctionDeclaration,
  HostActionDeclaration,
  HostImportDeclaration
} from './core/ast.js'

export type { ConstraintRecord } from './core/constraint.js'
export type { StoreSnapshotEntry } from './core/store.js'

