/**
 * First-order search state representation for CHR relational solver.
 * 
 * In accordance with chrKanren (arXiv:2607.21204), solver states Γ are triples:
 *   Γ = ⟨σ, θ, ω⟩
 * 
 * - σ (substitution): Logic variable bindings (Variable -> Term/Value)
 * - θ (constraint store): Active constraints multiset
 * - ω (history): Rule application history preventing duplicate propagation firings
 */

import { Substitution } from './substitution.js'

export interface StateConstraint {
  readonly id: number
  readonly name: string
  readonly arity: number
  readonly args: readonly unknown[]
}

export class SearchState {
  readonly substitution: Substitution
  readonly store: readonly StateConstraint[]
  readonly history: ReadonlySet<string>
  readonly nextConstraintId: number

  constructor (
    substitution: Substitution = new Substitution(),
    store: readonly StateConstraint[] = [],
    history: ReadonlySet<string> = new Set<string>(),
    nextConstraintId = 1
  ) {
    this.substitution = substitution
    this.store = store
    this.history = history
    this.nextConstraintId = nextConstraintId
  }

  /**
   * Clone state with optional modifications.
   */
  with (changes: {
    substitution?: Substitution
    store?: readonly StateConstraint[]
    history?: ReadonlySet<string>
    nextConstraintId?: number
  }): SearchState {
    return new SearchState(
      changes.substitution ?? this.substitution,
      changes.store ?? this.store,
      changes.history ?? this.history,
      changes.nextConstraintId ?? this.nextConstraintId
    )
  }

  /**
   * Add a new constraint to the constraint store.
   */
  addConstraint (name: string, args: readonly unknown[]): { state: SearchState, constraint: StateConstraint } {
    const id = this.nextConstraintId
    const constraint: StateConstraint = {
      id,
      name,
      arity: args.length,
      args: [...args]
    }
    const newStore = [...this.store, constraint]
    const newState = new SearchState(
      this.substitution,
      newStore,
      this.history,
      id + 1
    )
    return { state: newState, constraint }
  }

  /**
   * Remove constraints by their IDs.
   */
  removeConstraints (ids: ReadonlySet<number> | readonly number[]): SearchState {
    const idSet = ids instanceof Set ? ids : new Set(ids)
    const newStore = this.store.filter(c => !idSet.has(c.id))
    return this.with({ store: newStore })
  }

  /**
   * Record a rule firing in history.
   */
  recordHistory (ruleName: string, constraintIds: readonly number[]): SearchState {
    const key = `${ruleName}:${[...constraintIds].sort((a, b) => a - b).join(',')}`
    const newHistory = new Set(this.history)
    newHistory.add(key)
    return this.with({ history: newHistory })
  }

  /**
   * Check if a rule has already fired on the given combination of constraints.
   */
  hasFired (ruleName: string, constraintIds: readonly number[]): boolean {
    const key = `${ruleName}:${[...constraintIds].sort((a, b) => a - b).join(',')}`
    return this.history.has(key)
  }

  /**
   * Look up constraints matching a functor name and arity.
   */
  lookup (name: string, arity: number): StateConstraint[] {
    return this.store.filter(c => c.name === name && c.arity === arity)
  }
}
