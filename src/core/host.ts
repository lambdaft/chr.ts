/**
 * Host module authoring helper.
 *
 * `defineHostModule` is a typed identity function that allows the TypeScript
 * compiler to infer `HostModule` from a plain object literal. Without it,
 * users would need to explicitly annotate their module objects, which is
 * verbose and error-prone.
 *
 * Usage:
 *   const myModule = defineHostModule({
 *     functions: {
 *       foo: (ctx, x) => x > 0
 *     },
 *     actions: {
 *       log: (ctx) => console.log(ctx.bindings)
 *     }
 *   })
 *   engine.registerHostModule('myModule', myModule)
 */

import type { HostAction, HostFunction, HostModule } from './engine.js'

/**
 * Input shape for a host module definition.
 *
 * Both `functions` and `actions` are optional so that a module can provide
 * only one kind of host callback.
 */
export interface HostModuleDefinition {
  functions?: Record<string, HostFunction>
  actions?: Record<string, HostAction>
}

/**
 * Create a typed host module from a definition object.
 *
 * This is a pure identity function at runtime: it returns `definition`
 * unchanged. Its only purpose is to give the TypeScript compiler enough
 * information to infer the `HostModule` type from the object literal shape.
 *
 * @param definition - The host module definition.
 * @returns The same object, typed as `HostModule`.
 */
export function defineHostModule (definition: HostModuleDefinition): HostModule {
  return definition
}
