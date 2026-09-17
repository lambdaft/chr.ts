/**
 * Index analysis for CHR optimization.
 *
 * This module provides static analysis capabilities for CHR rule sets to:
 * - Detect functional dependencies between constraint arguments
 * - Identify symmetry properties in constraints
 * - Analyze join patterns to recommend optimal index configurations
 * - Estimate selectivity of different indexing strategies
 *
 * Functional dependencies are crucial for join optimization: if argument X
 * uniquely determines argument Y in a constraint, we can optimize lookups
 * by indexing on X and avoiding full scans.
 */

import type { RuleNode, ConstraintPattern } from './ast.js'

/**
 * A functional dependency: determinant arguments determine dependent arguments.
 */
export interface FunctionalDependency {
  /** Constraint functor (e.g., "edge/2"). */
  constraint: string
  /** Argument indices that determine others (0-based). */
  determinant: number[]
  /** Argument indices that are determined by the determinant. */
  dependent: number[]
  /** Confidence score (0-1) based on rule analysis. */
  confidence: number
}

/**
 * Symmetry information for constraints.
 */
export interface SymmetryInfo {
  /** Constraint functor. */
  constraint: string
  /** Argument indices that are symmetric (can be swapped). */
  symmetricArgs: number[][]
  /** Whether the constraint is fully symmetric (all args can be permuted). */
  fullySymmetric: boolean
}

/**
 * Index recommendation based on analysis.
 */
export interface IndexRecommendation {
  /** Constraint functor. */
  constraint: string
  /** Type of index recommended. */
  type: 'single' | 'composite'
  /** Argument indices to index. */
  argIndices: number[]
  /** Expected selectivity improvement (0-1, higher is better). */
  selectivityImprovement: number
  /** Reason for the recommendation. */
  reason: string
}

/**
 * Join pattern analysis result.
 */
export interface JoinPattern {
  /** Constraints involved in the join. */
  constraints: string[]
  /** Join variables (argument indices that are shared). */
  joinVariables: Array<{ constraint: string, argIndex: number }>
  /** Estimated join cardinality. */
  estimatedCardinality: number
  /** Recommended join order. */
  recommendedOrder: number[]
}

/**
 * Index analyzer for CHR optimization.
 */
export class IndexAnalyzer {
  private readonly rules: RuleNode[]
  private readonly constraintUsages = new Map<string, Set<number>>()
  private readonly argumentCooccurrences = new Map<string, number>()

  constructor (rules: RuleNode[]) {
    this.rules = rules
    this.analyzeRules()
  }

  /**
   * Analyze rules to collect usage statistics and co-occurrence data.
   */
  private analyzeRules (): void {
    for (const rule of this.rules) {
      const heads = [...rule.kept, ...rule.removed]
      
      // Track constraint usage
      for (const head of heads) {
        const functor = `${head.name}/${head.args.length}`
        const usages = this.constraintUsages.get(functor) ?? new Set<number>()
        usages.add(rule.kept.length + rule.removed.length)
        this.constraintUsages.set(functor, usages)
      }

      // Track argument co-occurrences in heads
      for (let i = 0; i < heads.length; i++) {
        const headI = heads[i]
        if (!headI) continue
        for (let j = i + 1; j < heads.length; j++) {
          const headJ = heads[j]
          if (!headJ) continue
          this.trackCooccurrence(headI, headJ)
        }
      }
    }
  }

  /**
   * Track co-occurrence of variables between two constraint patterns.
   */
  private trackCooccurrence (pattern1: ConstraintPattern, pattern2: ConstraintPattern): void {
    const functor1 = `${pattern1.name}/${pattern1.args.length}`
    const functor2 = `${pattern2.name}/${pattern2.args.length}`
    
    const vars1 = this.extractVariables(pattern1)
    const vars2 = this.extractVariables(pattern2)
    
    // Find shared variables
    for (const [var1, indices1] of Object.entries(vars1)) {
      for (const [var2, indices2] of Object.entries(vars2)) {
        if (var1 === var2) {
          for (const idx1 of indices1) {
            for (const idx2 of indices2) {
              const key = `${functor1}:${idx1}->${functor2}:${idx2}`
              const count = this.argumentCooccurrences.get(key) ?? 0
              this.argumentCooccurrences.set(key, count + 1)
            }
          }
        }
      }
    }
  }

  /**
   * Extract variable names and their positions from a pattern.
   */
  private extractVariables (pattern: ConstraintPattern): Record<string, number[]> {
    const vars: Record<string, number[]> = {}
    for (let i = 0; i < pattern.args.length; i++) {
      const arg = pattern.args[i]
      if (arg && arg.type === 'variable' && arg.name !== '_') {
        const existing = vars[arg.name] ?? []
        existing.push(i)
        vars[arg.name] = existing
      }
    }
    return vars
  }

  /**
   * Detect functional dependencies in constraints.
   * 
   * A functional dependency X → Y means that for any given value of X,
   * there is at most one value of Y. This is detected by analyzing rules
   * where X and Y appear together and checking if Y is uniquely determined.
   */
  detectFunctionalDependencies (): FunctionalDependency[] {
    const dependencies: FunctionalDependency[] = []
    
    for (const [functor] of this.constraintUsages) {
      const parts = functor.split('/')
      const arity = parseInt(parts[1] ?? '0', 10)
      
      // Analyze each argument position
      for (let detIdx = 0; detIdx < arity; detIdx++) {
        for (let depIdx = 0; depIdx < arity; depIdx++) {
          if (detIdx === depIdx) continue
          
          const confidence = this.calculateDependencyConfidence(functor, detIdx, depIdx)
          if (confidence > 0.7) {
            dependencies.push({
              constraint: functor,
              determinant: [detIdx],
              dependent: [depIdx],
              confidence
            })
          }
        }
      }
    }
    
    return dependencies
  }

  /**
   * Calculate confidence that detIdx determines depIdx.
   */
  private calculateDependencyConfidence (functor: string, detIdx: number, depIdx: number): number {
    // Look for rules where both arguments appear with the same variable
    let sameVarCount = 0
    let totalCooccurrences = 0
    
    for (const [key, count] of this.argumentCooccurrences) {
      const parts = key.split('->')
      const source = parts[0] ?? ''
      const target = parts[1] ?? ''
      const sourceParts = source.split(':')
      const targetParts = target.split(':')
      const sourceFunctor = sourceParts[0]
      const sourceIdx = sourceParts[1]
      const targetFunctor = targetParts[0]
      const targetIdx = targetParts[1]
      
      if (sourceFunctor === functor && targetFunctor === functor && sourceIdx !== undefined && targetIdx !== undefined) {
        totalCooccurrences += count
        if (parseInt(sourceIdx, 10) === detIdx && parseInt(targetIdx, 10) === depIdx) {
          sameVarCount += count
        }
      }
    }
    
    if (totalCooccurrences === 0) return 0
    return sameVarCount / totalCooccurrences
  }

  /**
   * Detect symmetry properties in constraints.
   * 
   * Symmetry means that swapping certain argument positions yields
   * equivalent constraints. This is detected by analyzing rules that
   * treat multiple argument positions identically.
   */
  detectSymmetries (): SymmetryInfo[] {
    const symmetries: SymmetryInfo[] = []
    
    for (const functor of this.constraintUsages.keys()) {
      const parts = functor.split('/')
      const arity = parseInt(parts[1] ?? '0', 10)
      
      const symmetricPairs: number[][] = []
      let fullySymmetric = true
      
      // Check each pair of argument positions
      for (let i = 0; i < arity; i++) {
        for (let j = i + 1; j < arity; j++) {
          if (this.arePositionsSymmetric(functor, i, j)) {
            symmetricPairs.push([i, j])
          } else {
            fullySymmetric = false
          }
        }
      }
      
      if (symmetricPairs.length > 0) {
        symmetries.push({
          constraint: functor,
          symmetricArgs: symmetricPairs,
          fullySymmetric
        })
      }
    }
    
    return symmetries
  }

  /**
   * Check if two argument positions are symmetric.
   */
  private arePositionsSymmetric (functor: string, idx1: number, idx2: number): boolean {
    // Check if positions are used identically in rules
    const key1 = `${functor}:${idx1}`
    const key2 = `${functor}:${idx2}`
    
    let count1 = 0
    let count2 = 0
    let symmetricCount = 0
    
    for (const [key, count] of this.argumentCooccurrences) {
      if (key.includes(key1)) count1 += count
      if (key.includes(key2)) count2 += count
      
      // Check if they co-occur with the same patterns
      const pattern1 = key.replace(key1, 'X')
      const pattern2 = key.replace(key2, 'X')
      if (pattern1 === pattern2) {
        symmetricCount += count
      }
    }
    
    if (count1 === 0 || count2 === 0) return false
    
    // If most co-occurrences are symmetric, consider them symmetric
    const ratio = symmetricCount / Math.min(count1, count2)
    return ratio > 0.8
  }

  /**
   * Analyze join patterns in rules.
   * 
   * Join pattern analysis identifies how constraints are joined together
   * and estimates the cardinality of intermediate results.
   */
  analyzeJoinPatterns (): JoinPattern[] {
    const patterns: JoinPattern[] = []
    
    for (const rule of this.rules) {
      const heads = [...rule.kept, ...rule.removed]
      if (heads.length < 2) continue
      
      const constraints = heads.map(h => `${h.name}/${h.args.length}`)
      const joinVariables: Array<{ constraint: string, argIndex: number }> = []
      
      // Find join variables (variables appearing in multiple heads)
      const allVars = new Map<string, Array<{ constraint: string, argIndex: number }>>()
      
      for (let i = 0; i < heads.length; i++) {
        const head = heads[i]
        const functor = constraints[i]
        if (!head || !functor) continue
        const vars = this.extractVariables(head)
        
        for (const [varName, indices] of Object.entries(vars)) {
          for (const idx of indices) {
            const existing = allVars.get(varName) ?? []
            existing.push({ constraint: functor, argIndex: idx })
            allVars.set(varName, existing)
          }
        }
      }
      
      // Variables appearing in multiple heads are join variables
      for (const [, occurrences] of allVars) {
        if (occurrences.length > 1) {
          joinVariables.push(...occurrences)
        }
      }
      
      // Estimate cardinality (simplified)
      const estimatedCardinality = this.estimateJoinCardinality(constraints, joinVariables)
      
      // Recommend join order based on selectivity
      const recommendedOrder = this.recommendJoinOrder(constraints, joinVariables)
      
      patterns.push({
        constraints,
        joinVariables,
        estimatedCardinality,
        recommendedOrder
      })
    }
    
    return patterns
  }

  /**
   * Estimate join cardinality based on constraint usage statistics.
   */
  private estimateJoinCardinality (constraints: string[], joinVariables: Array<{ constraint: string, argIndex: number }>): number {
    // Simplified estimation based on constraint frequencies
    let cardinality = 1
    
    for (const constraint of constraints) {
      const usages = this.constraintUsages.get(constraint)?.size ?? 1
      cardinality *= Math.sqrt(usages) // Conservative estimate
    }
    
    // Reduce cardinality based on join selectivity
    const joinSelectivity = 1 / (joinVariables.length + 1)
    cardinality *= joinSelectivity
    
    return Math.round(cardinality)
  }

  /**
   * Recommend optimal join order based on selectivity.
   */
  private recommendJoinOrder (constraints: string[], _joinVariables: Array<{ constraint: string, argIndex: number }>): number[] {
    // Calculate selectivity for each constraint
    const selectivities = constraints.map(constraint => {
      const usages = this.constraintUsages.get(constraint)?.size ?? 1
      return 1 / usages // Lower usage = higher selectivity
    })
    
    // Sort by selectivity (most selective first)
    const indexed = constraints.map((c, i) => ({ constraint: c, selectivity: selectivities[i] ?? 1, index: i }))
    indexed.sort((a, b) => b.selectivity - a.selectivity)
    
    return indexed.map(item => item.index)
  }

  /**
   * Recommend indexes based on analysis.
   * 
   * This combines functional dependency analysis, join pattern analysis,
   * and usage statistics to recommend which indexes would be most beneficial.
   */
  recommendIndexes (): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = []
    
    // Get functional dependencies
    const dependencies = this.detectFunctionalDependencies()
    
    // Recommend single-argument indexes for functional dependencies
    for (const dep of dependencies) {
      if (dep.confidence > 0.8) {
        recommendations.push({
          constraint: dep.constraint,
          type: 'single',
          argIndices: dep.determinant,
          selectivityImprovement: dep.confidence,
          reason: `Functional dependency detected: arguments ${dep.determinant} determine ${dep.dependent}`
        })
      }
    }
    
    // Get join patterns
    const joinPatterns = this.analyzeJoinPatterns()
    
    // Recommend composite indexes for frequent joins
    for (const pattern of joinPatterns) {
      if (pattern.joinVariables.length >= 2) {
        // Find the most common join pattern
        const constraintGroups = new Map<string, number[]>()
        for (const jv of pattern.joinVariables) {
          const existing = constraintGroups.get(jv.constraint) ?? []
          existing.push(jv.argIndex)
          constraintGroups.set(jv.constraint, existing)
        }
        
        for (const [constraint, argIndices] of constraintGroups) {
          if (argIndices.length >= 2) {
            const improvement = 1 - (1 / argIndices.length)
            recommendations.push({
              constraint,
              type: 'composite',
              argIndices: [...new Set(argIndices)], // Remove duplicates
              selectivityImprovement: improvement,
              reason: `Frequent join pattern detected on arguments ${argIndices.join(', ')}`
            })
          }
        }
      }
    }
    
    // Sort by selectivity improvement
    recommendations.sort((a, b) => b.selectivityImprovement - a.selectivityImprovement)
    
    return recommendations
  }

  /**
   * Get usage statistics for a constraint.
   */
  getConstraintUsage (constraint: string): number {
    return this.constraintUsages.get(constraint)?.size ?? 0
  }

  /**
   * Get all constraints analyzed.
   */
  getAnalyzedConstraints (): string[] {
    return [...this.constraintUsages.keys()]
  }
}
