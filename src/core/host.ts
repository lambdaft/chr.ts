import type { HostAction, HostFunction, HostModule } from './engine.js'

export interface HostModuleDefinition {
  functions?: Record<string, HostFunction>
  actions?: Record<string, HostAction>
}

export function defineHostModule (definition: HostModuleDefinition): HostModule {
  return definition
}