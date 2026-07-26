/**
 * Convenience factory for creating a pre-configured `CHREngine`.
 *
 * `createEngine` combines the most common setup steps into a single function
 * call:
 *   1. Construct a `CHREngine` with optional `maxRuleFirings`.
 *   2. Optionally register builtins.
 *   3. Optionally register a host module.
 *   4. Optionally load `.chr` source.
 *
 * This is the recommended entry point for scripts and examples. It reduces
 * boilerplate and ensures that builtins are registered consistently.
 *
 * Example:
 *   import { createEngine } from 'chr.ts'
 *
 *   const engine = createEngine({
 *     source: `
 *       constraint edge/2.
 *       constraint path/2.
 *       path(X, Y) \ edge(X, Y) ==> path(X, Y).
 *       path(X, Z) \ path(X, Y), edge(Y, Z) ==> path(X, Z).
 *     `,
 *     builtins: true
 *   })
 */

import type { CHREngineOptions, HostModule } from './engine.js'
import { CHREngine } from './engine.js'

/**
 * Options for the `createEngine` convenience factory.
 */
export interface LoadCHROptions {
  /** The `.chr` source string to load. */
  source: string
  /** Optional host module to register before loading rules. */
  host?: HostModule
  /** If true, register the built-in host module. */
  builtins?: boolean
  /** Override the default maximum rule firings. */
  maxRuleFirings?: number
}

/**
 * Create and configure a `CHREngine` in one step.
 *
 * @param options - Configuration options.
 * @returns A fully initialized `CHREngine` ready for constraint assertion.
 */
export function createEngine (options: LoadCHROptions = { source: '' }): CHREngine {
  const engineOpts: CHREngineOptions = {}
  if (options.maxRuleFirings !== undefined) {
    engineOpts.maxRuleFirings = options.maxRuleFirings
  }
  const engine = new CHREngine(engineOpts)

  if (options.builtins) {
    engine.registerBuiltins()
  }

  if (options.host) {
    engine.registerHost(options.host)
  }

  if (options.source.trim()) {
    engine.addRules(options.source)
  }

  return engine
}
