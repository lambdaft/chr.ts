import type { CHREngineOptions, HostModule } from './engine.js'
import { CHREngine } from './engine.js'

export interface LoadCHROptions {
  source: string
  host?: HostModule
  builtins?: boolean
  maxRuleFirings?: number
}

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
