/**
 * Browser-compatible CHREngine.
 *
 * This extends the main CHREngine but overrides the `load()` method to
 * throw a descriptive error instead of importing `node:fs`.
 * Everything else works identically in the browser.
 */

import { CHREngine, type CHREngineOptions } from './core/engine.js'

/**
 * A browser-compatible CHR engine.
 *
 * Same as CHREngine but the `load()` method (which reads files from disk)
 * throws a descriptive error explaining that file loading is not supported
 * in the browser. Use `addRules()` or `addProgram()` instead.
 */
export class BrowserCHREngine extends CHREngine {
  constructor (options: CHREngineOptions = {}) {
    super(options)
  }

  /**
   * Load rules from a `.chr` file on disk.
   *
   * NOT SUPPORTED IN BROWSER. Use `addRules(source)` or `addProgram(program)` instead.
   *
   * @throws {Error} Always throws in browser environments.
   */
  override load (_filePath: string): void {
    throw new Error(
      'CHR.ts: File loading (load()) is not supported in the browser. ' +
      'Use addRules(source) or addProgram(program) instead.'
    )
  }
}

