/**
 * Demonstration of indexed CHR features.
 * 
 * This example shows how to use the indexed CHR features in CHR.ts
 * to improve performance for constraint matching operations.
 */

import { CHREngine, IndexAnalyzer } from '../../dist/index.js'

async function demonstrateBasicIndexing (): Promise<void> {
  console.log('=== Basic Argument Indexing ===\n')
  
  const engine = new CHREngine({
    enableIndexedCHR: true,
    argumentIndexOptions: {
      autoCreateIndexes: true,
      maxSingleIndexes: 5
    }
  })

  const rules = `
    constraints user/3, session/2, active/2;
    
    @user(Id, Name, Email), session(Id, Timestamp) 
      <=> true | active(Name, Timestamp).
  `

  engine.addRules(rules)

  // Create users
  console.log('Creating 100 users...')
  for (let i = 0; i < 100; i++) {
    await engine.assert('user', [`user_${i}`, `name_${i}`, `email_${i}@example.com`])
  }

  // Create sessions for specific users
  console.log('Creating sessions for user_42...')
  for (let i = 0; i < 50; i++) {
    await engine.assert('session', ['user_42', Date.now()])
  }

  // Check results
  const activeCount = engine.store.lookup('active', 2).length
  console.log(`Generated ${activeCount} active constraints`)

  // Show index statistics
  console.log('\nIndex Statistics:')
  const stats = engine.store.argumentIndex.getAllStatistics()
  for (const [key, stat] of stats) {
    if (stat.lookups > 0) {
      console.log(`  ${key}: selectivity=${stat.selectivity.toFixed(3)}, lookups=${stat.lookups}`)
    }
  }
}

async function demonstrateJoinOptimization (): Promise<void> {
  console.log('\n=== Join Order Optimization ===\n')
  
  const engine = new CHREngine({
    enableIndexedCHR: true,
    argumentIndexOptions: { autoCreateIndexes: true }
  })

  const rules = `
    constraints edge/2, path/2, reachable/2;
    
    @edge(X, Y) \\ path(X, Y) <=> true | path(X, Y).
    @edge(X, Y), path(Y, Z) <=> true | path(X, Z).
    @path(X, Y) <=> true | reachable(X, Y).
  `

  engine.addRules(rules)

  // Create a graph
  console.log('Creating graph with 50 edges...')
  const edges = []
  for (let i = 0; i < 50; i++) {
    const from = Math.floor(Math.random() * 20)
    const to = Math.floor(Math.random() * 20)
    edges.push({ name: 'edge', args: [from, to] })
  }
  await engine.assertMany(edges)

  // Check results
  const pathCount = engine.store.lookup('path', 2).length
  const reachableCount = engine.store.lookup('reachable', 2).length
  console.log(`Generated ${pathCount} path constraints`)
  console.log(`Generated ${reachableCount} reachable constraints`)
}

async function demonstrateIndexAnalysis (): Promise<void> {
  console.log('\n=== Index Analysis ===\n')
  
  const engine = new CHREngine()
  
  const rules = `
    constraints user/3, session/2, order/3, purchase/4;
    
    @user(Id, Name, Email), session(Id, Timestamp) 
      <=> true | active(Name, Timestamp).
      
    @user(UserId, Name, Email), order(OrderId, UserId, Amount)
      <=> true | purchase(OrderId, Name, Email, Amount).
  `

  engine.addRules(rules)

  // Analyze the rules
  const analyzer = new IndexAnalyzer(engine.getRules())
  
  console.log('Functional Dependencies:')
  const dependencies = analyzer.detectFunctionalDependencies()
  for (const dep of dependencies) {
    if (dep.confidence > 0.5) {
      console.log(`  ${dep.constraint}: ${dep.determinant.join(',')} → ${dep.dependent.join(',')} (confidence: ${dep.confidence.toFixed(2)})`)
    }
  }

  console.log('\nSymmetries:')
  const symmetries = analyzer.detectSymmetries()
  for (const sym of symmetries) {
    console.log(`  ${sym.constraint}: ${sym.fullySymmetric ? 'fully symmetric' : 'partial symmetry'}`)
    for (const pair of sym.symmetricArgs) {
      console.log(`    args ${pair.join(',')} are symmetric`)
    }
  }

  console.log('\nIndex Recommendations:')
  const recommendations = analyzer.recommendIndexes()
  for (const rec of recommendations.slice(0, 5)) { // Show top 5
    console.log(`  ${rec.type} index on ${rec.constraint} args ${rec.argIndices.join(',')}`)
    console.log(`    Reason: ${rec.reason}`)
    console.log(`    Expected improvement: ${(rec.selectivityImprovement * 100).toFixed(1)}%`)
  }
}

async function demonstratePerformanceComparison (): Promise<void> {
  console.log('\n=== Performance Comparison ===\n')
  
  const rules = `
    constraints edge/2, path/2;
    
    @edge(X, Y) <=> true | path(X, Y).
  `

  const constraintCount = 500
  const constraints = []
  for (let i = 0; i < constraintCount; i++) {
    constraints.push({ name: 'edge', args: [i, i + 1] })
  }

  // Test with indexed CHR
  console.log(`Testing with ${constraintCount} constraints (indexed CHR)...`)
  const indexedEngine = new CHREngine({ 
    enableIndexedCHR: true,
    argumentIndexOptions: { autoCreateIndexes: true }
  })
  indexedEngine.addRules(rules)
  
  const indexedStart = performance.now()
  await indexedEngine.assertMany(constraints)
  const indexedTime = performance.now() - indexedStart
  
  console.log(`  Indexed CHR: ${indexedTime.toFixed(2)}ms`)

  // Test without indexed CHR
  console.log(`Testing with ${constraintCount} constraints (non-indexed CHR)...`)
  const nonIndexedEngine = new CHREngine({ enableIndexedCHR: false })
  nonIndexedEngine.addRules(rules)
  
  const nonIndexedStart = performance.now()
  await nonIndexedEngine.assertMany(constraints)
  const nonIndexedTime = performance.now() - nonIndexedStart
  
  console.log(`  Non-indexed CHR: ${nonIndexedTime.toFixed(2)}ms`)
  
  const speedup = nonIndexedTime / indexedTime
  console.log(`  Speedup: ${speedup.toFixed(2)}x`)
}

async function demonstrateSpecializedIndexes (): Promise<void> {
  console.log('\n=== Specialized Index Structures ===\n')
  
  const engine = new CHREngine()
  
  const rules = `
    constraints range/2, point/1, contained/1;
    
    @point(X), range(Start, End) 
      <=> X >= Start, X <= End 
      | contained(X).
  `

  engine.addRules(rules)

  // Create ranges
  console.log('Creating ranges...')
  await engine.assertMany([
    { name: 'range', args: [0, 100] },
    { name: 'range', args: [50, 150] },
    { name: 'range', args: [100, 200] }
  ])

  // Create points
  console.log('Creating points...')
  const points = []
  for (let i = 0; i < 100; i++) {
    points.push({ name: 'point', args: [Math.floor(Math.random() * 200)] })
  }
  await engine.assertMany(points)

  // Check results
  const containedCount = engine.store.lookup('contained', 1).length
  console.log(`Generated ${containedCount} contained constraints`)
  
  console.log('\nNote: Specialized indexes (EqualityIndex, OrderingIndex, RangeIndex, SetIndex)')
  console.log('can be used for even better performance on specific patterns.')
}

async function main (): Promise<void> {
  console.log('Indexed CHR Demonstration')
  console.log('==========================\n')
  
  try {
    await demonstrateBasicIndexing()
    await demonstrateJoinOptimization()
    await demonstrateIndexAnalysis()
    await demonstratePerformanceComparison()
    await demonstrateSpecializedIndexes()
    
    console.log('\n=== Demonstration Complete ===')
    console.log('All indexed CHR features demonstrated successfully!')
  } catch (error) {
    console.error('Error during demonstration:', error)
  }
}

void main()
