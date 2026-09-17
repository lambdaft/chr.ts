/**
 * @module
 *
 * Public API barrel for the CHR.ts engine.
 *
 * Re-exports every public symbol from the `core/` sub-modules so that consumers
 * can import from a single entry-point:
 *
 *   import { CHREngine, parseProgram, createConstraint, BuiltinsModule } from 'chr.ts'
 *
 * Order of re-exports mirrors the module dependency graph (leaf modules first,
 * then engine, then loader) to assist tree-shaking and IDE auto-completion.
 */

export * from './core/ast.js'
export * from './core/argument-index.js'
export * from './core/builtins.js'
export * from './core/constraint.js'
export * from './core/engine.js'
export * from './core/errors.js'
export * from './core/history.js'
export * from './core/host.js'
export * from './core/index-analyzer.js'
export * from './core/join-optimizer.js'
export * from './core/loader.js'
export * from './core/parser.js'
export * from './core/recursion-tracker.js'
export * from './core/recursion-unfolder.js'
export * from './core/specialized-indexes.js'
export * from './core/store.js'
export * from './core/state.js'
export * from './core/stream.js'
export * from './core/relational-engine.js'
export * from './core/semantic-unification.js'
export * from './core/substitution.js'
export * from './core/unfold-interpreter.js'
export * from './core/unfolder-utils.js'
export * from './core/unification.js'
export * from './core/utils.js'
export * from 'temporal.ts'
