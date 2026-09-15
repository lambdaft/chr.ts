/**
 * Join-order optimization for CHR rule matching.
 *
 * This module implements cost-based join-order optimization to determine
 * the most efficient order to match constraint heads in CHR rules. The optimizer
 * considers:
 * - Index selectivity (how selective each index is)
 * - Estimated cardinality of intermediate results
 * - Available indexes (single-argument, composite)
 * - Join costs (lookup vs iteration)
 *
 * The goal is to minimize the total cost of rule matching by choosing join
 * orders that reduce intermediate result sizes early.
 */

import type { RuleNode, ConstraintPattern } from './ast.js'
import type { ArgumentIndex } from './argument-index.js'
import type { ConstraintStore } from './store.js'

/**
 * A single step in a join plan.
 */
export interface JoinStep {
  /** Index of the constraint in the rule head. */
  constraintIndex: number
  /** Lookup method to use. */
  lookupMethod: 'functor' | 'single-arg' | 'composite' | 'scan'
  /** For single-arg lookups, which argument index. */
  argIndex?: number
  /** For single-arg lookups, the expected value (if known). */
  argValue?: unknown
  /** For composite lookups, which argument indices. */
  compositeIndices?: number[]
  /** For composite lookups, the expected values (if known). */
  compositeValues?: unknown[]
  /** Estimated cost of this step. */
  estimatedCost: number
  /** Estimated cardinality after this step. */
  estimatedCardinality: number
}

/**
 * A complete join plan for a rule.
 */
export interface JoinPlan {
  /** Ordered steps for constraint matching. */
  steps: JoinStep[]
  /** Total estimated cost of the plan. */
  totalCost: number
  /** Estimated final cardinality. */
  finalCardinality: number
  /** Whether this plan uses indexing. */
  usesIndexing: boolean
}

/**
 * Cost model parameters for join optimization.
 */
export interface CostModel {
  /** Base cost for a functor lookup. */
  functorLookupCost: number
  /** Base cost for a single-argument index lookup. */
  singleArgLookupCost: number
  /** Base cost for a composite index lookup. */
  compositeLookupCost: number
  /** Base cost for a full scan. */
  scanCost: number
  /** Cost per row processed. */
  perRowCost: number
  /** Penalty for intermediate result cardinality. */
  cardinalityPenalty: number
}

/**
 * Default cost model parameters.
 */
const DEFAULT_COST_MODEL: CostModel = {
  functorLookupCost: 1.0,
  singleArgLookupCost: 0.5,
  compositeLookupCost: 0.3,
  scanCost: 10.0,
  perRowCost: 0.1,
  cardinalityPenalty: 0.01
}

/**
 * Join optimizer for CHR rules.
 */
export class JoinOptimizer {
  private readonly costModel: CostModel
  private readonly argumentIndex: ArgumentIndex
  private readonly store: ConstraintStore

  constructor (
    argumentIndex: ArgumentIndex,
    store: ConstraintStore,
    costModel: Partial<CostModel> = {}
  ) {
    this.argumentIndex = argumentIndex
    this.store = store
    this.costModel = { ...DEFAULT_COST_MODEL, ...costModel }
  }

  /**
   * Optimize join order for a rule.
   * 
   * This analyzes the rule's head constraints and available indexes to
   * determine the most efficient join order.
   */
  optimizeJoin (rule: RuleNode): JoinPlan {
    const heads = [...rule.kept, ...rule.removed]
    if (heads.length === 0) {
      return this.createEmptyPlan()
    }

    if (heads.length === 1) {
      return this.optimizeSingleConstraint(heads[0], 0)
    }

    return this.optimizeMultiConstraintJoin(rule, heads)
  }

  /**
   * Create an empty join plan (no constraints).
   */
  private createEmptyPlan (): JoinPlan {
    return {
      steps: [],
      totalCost: 0,
      finalCardinality: 0,
      usesIndexing: false
    }
  }

  /**
   * Optimize join for a single constraint.
   */
  private optimizeSingleConstraint (head: ConstraintPattern, index: number): JoinPlan {
    const functor = `${head.name}/${head.args.length}`
    const step = this.createBestLookupStep(head, index, null)
    
    return {
      steps: [step],
      totalCost: step.estimatedCost,
      finalCardinality: step.estimatedCardinality,
      usesIndexing: step.lookupMethod !== 'functor' && step.lookupMethod !== 'scan'
    }
  }

  /**
   * Optimize join for multiple constraints.
   */
  private optimizeMultiConstraintJoin (rule: RuleNode, heads: ConstraintPattern[]): JoinPlan {
    // Generate all possible join orders and evaluate their costs
    const plans = this.generateJoinPlans(rule, heads)
    
    // Select the plan with minimum cost
    let bestPlan = plans[0]
    for (const plan of plans) {
      if (plan.totalCost < bestPlan.totalCost) {
        bestPlan = plan
      }
    }
    
    return bestPlan
  }

  /**
   * Generate all possible join plans for a rule.
   */
  private generateJoinPlans (rule: RuleNode, heads: ConstraintPattern[]): JoinPlan[] {
    const plans: JoinPlan[] = []
    const headIndices = heads.map((_, i) => i)
    
    // Generate permutations of join orders (limited to avoid explosion)
    const maxPermutations = Math.min(this.factorial(heads.length), 24) // Limit to 24 permutations
    const permutations = this.generatePermutations(headIndices).slice(0, maxPermutations)
    
    for (const permutation of permutations) {
      const plan = this.buildPlanForOrder(rule, heads, permutation)
      plans.push(plan)
    }
    
    return plans
  }

  /**
   * Build a join plan for a specific join order.
   */
  private buildPlanForOrder (rule: RuleNode, heads: ConstraintPattern[], order: number[]): JoinPlan {
    const steps: JoinStep[] = []
    let totalCost = 0
    let currentCardinality = 0
    let usesIndexing = false
    
    for (let i = 0; i < order.length; i++) {
      const headIndex = order[i]
      const head = heads[headIndex]
      const previousSteps = steps.slice(0, i)
      
      const step = this.createBestLookupStep(head, headIndex, previousSteps)
      steps.push(step)
      
      totalCost += step.estimatedCost
      currentCardinality = step.estimatedCardinality
      
      if (step.lookupMethod !== 'functor' && step.lookupMethod !== 'scan') {
        usesIndexing = true
      }
    }
    
    return {
      steps,
      totalCost,
      finalCardinality: currentCardinality,
      usesIndexing
    }
  }

  /**
   * Create the best lookup step for a constraint.
   */
  private createBestLookupStep (
    head: ConstraintPattern,
    headIndex: number,
    previousSteps: JoinStep[] | null
  ): JoinStep {
    const functor = `${head.name}/${head.args.length}`
    const candidates: JoinStep[] = []
    
    // Option 1: Functor-based lookup (always available)
    const functorCost = this.estimateFunctorLookupCost(functor)
    const functorCardinality = this.estimateFunctorCardinality(functor)
    candidates.push({
      constraintIndex: headIndex,
      lookupMethod: 'functor',
      estimatedCost: functorCost,
      estimatedCardinality: functorCardinality
    })
    
    // Option 2: Single-argument index lookups
    for (let i = 0; i < head.args.length; i++) {
      if (this.argumentIndex.hasSingleIndex(head.name, head.args.length, i)) {
        const arg = head.args[i]
        let value: unknown | undefined
        
        // Try to infer value from previous steps if it's a variable
        if (arg.type === 'variable' && previousSteps) {
          value = this.inferVariableValue(arg.name, previousSteps)
        }
        
        if (value !== undefined || arg.type === 'literal') {
          const lookupValue = arg.type === 'literal' ? arg.value : value
          const cost = this.estimateSingleArgLookupCost(functor, i, lookupValue)
          const cardinality = this.estimateSingleArgCardinality(functor, i, lookupValue)
          
          candidates.push({
            constraintIndex: headIndex,
            lookupMethod: 'single-arg',
            argIndex: i,
            argValue: lookupValue,
            estimatedCost: cost,
            estimatedCardinality: cardinality
          })
        }
      }
    }
    
    // Option 3: Composite index lookups
    const compositeIndexes = this.findCompositeIndexes(head.name, head.args.length)
    for (const indices of compositeIndexes) {
      const values: unknown[] = []
      let allValuesKnown = true
      
      for (const idx of indices) {
        const arg = head.args[idx]
        if (arg.type === 'literal') {
          values.push(arg.value)
        } else if (previousSteps) {
          const value = this.inferVariableValue(arg.name, previousSteps)
          if (value !== undefined) {
            values.push(value)
          } else {
            allValuesKnown = false
            break
          }
        } else {
          allValuesKnown = false
          break
        }
      }
      
      if (allValuesKnown) {
        const cost = this.estimateCompositeLookupCost(functor, indices, values)
        const cardinality = this.estimateCompositeCardinality(functor, indices, values)
        
        candidates.push({
          constraintIndex: headIndex,
          lookupMethod: 'composite',
          compositeIndices: indices,
          compositeValues: values,
          estimatedCost: cost,
          estimatedCardinality: cardinality
        })
      }
    }
    
    // Option 4: Full scan (worst case)
    const scanCost = this.estimateScanCost(functor)
    candidates.push({
      constraintIndex: headIndex,
      lookupMethod: 'scan',
      estimatedCost: scanCost,
      estimatedCardinality: this.estimateFunctorCardinality(functor)
    })
    
    // Select the best candidate
    let best = candidates[0]
    for (const candidate of candidates) {
      if (candidate.estimatedCost < best.estimatedCost) {
        best = candidate
      }
    }
    
    return best
  }

  /**
   * Infer variable value from previous join steps.
   */
  private inferVariableValue (varName: string, previousSteps: JoinStep[]): unknown | undefined {
    // This is a simplified implementation - in practice, you'd need to track
    // variable bindings through the join process
    for (const step of previousSteps) {
      if (step.argValue !== undefined) {
        return step.argValue
      }
    }
    return undefined
  }

  /**
   * Find composite indexes for a constraint.
   */
  private findCompositeIndexes (name: string, arity: number): number[][] {
    const indices: number[][] = []
    
    // Check for common composite index patterns
    for (let i = 0; i < arity; i++) {
      for (let j = i + 1; j < arity; j++) {
        if (this.argumentIndex.hasCompositeIndex(name, arity, [i, j])) {
          indices.push([i, j])
        }
      }
    }
    
    return indices
  }

  /**
   * Estimate cost of functor-based lookup.
   */
  private estimateFunctorLookupCost (functor: string): number {
    const cardinality = this.estimateFunctorCardinality(functor)
    return this.costModel.functorLookupCost + (cardinality * this.costModel.perRowCost)
  }

  /**
   * Estimate cardinality from functor lookup.
   */
  private estimateFunctorCardinality (functor: string): number {
    const candidates = this.store.lookup(functor.split('/')[0], parseInt(functor.split('/')[1], 10))
    return candidates.length
  }

  /**
   * Estimate cost of single-argument lookup.
   */
  private estimateSingleArgLookupCost (functor: string, argIndex: number, value: unknown): number {
    const cardinality = this.estimateSingleArgCardinality(functor, argIndex, value)
    return this.costModel.singleArgLookupCost + (cardinality * this.costModel.perRowCost)
  }

  /**
   * Estimate cardinality from single-argument lookup.
   */
  private estimateSingleArgCardinality (functor: string, argIndex: number, value: unknown): number {
    const ids = this.argumentIndex.lookupByArg(
      functor.split('/')[0],
      parseInt(functor.split('/')[1], 10),
      argIndex,
      value
    )
    return ids.length
  }

  /**
   * Estimate cost of composite lookup.
   */
  private estimateCompositeLookupCost (functor: string, indices: number[], values: unknown[]): number {
    const cardinality = this.estimateCompositeCardinality(functor, indices, values)
    return this.costModel.compositeLookupCost + (cardinality * this.costModel.perRowCost)
  }

  /**
   * Estimate cardinality from composite lookup.
   */
  private estimateCompositeCardinality (functor: string, indices: number[], values: unknown[]): number {
    const ids = this.argumentIndex.lookupByArgs(
      functor.split('/')[0],
      parseInt(functor.split('/')[1], 10),
      indices,
      values
    )
    return ids.length
  }

  /**
   * Estimate cost of full scan.
   */
  private estimateScanCost (functor: string): number {
    const cardinality = this.estimateFunctorCardinality(functor)
    return this.costModel.scanCost + (cardinality * this.costModel.perRowCost)
  }

  /**
   * Generate permutations of an array.
   */
  private generatePermutations<T>(arr: T[]): T[][] {
    if (arr.length === 0) return [[]]
    if (arr.length === 1) return [arr]
    
    const result: T[][] = []
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i]
      const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)]
      const remainingPerms = this.generatePermutations(remaining)
      for (const perm of remainingPerms) {
        result.push([current, ...perm])
      }
    }
    return result
  }

  /**
   * Calculate factorial (with limit to prevent overflow).
   */
  private factorial (n: number): number {
    if (n <= 1) return 1
    if (n > 10) return 3628800 // 10! = 3,628,800
    return n * this.factorial(n - 1)
  }

  /**
   * Update cost model parameters.
   */
  setCostModel (model: Partial<CostModel>): void {
    Object.assign(this.costModel, model)
  }

  /**
   * Get current cost model.
   */
  getCostModel (): CostModel {
    return { ...this.costModel }
  }
}
