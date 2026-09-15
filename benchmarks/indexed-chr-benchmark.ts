/**
 * Performance benchmarks for indexed CHR implementation.
 *
 * This benchmark suite compares the performance of indexed CHR vs
 * non-indexed CHR for various common patterns and workloads.
 */

import { CHREngine, IndexAnalyzer, ArgumentIndex } from '../dist/index.js'

// Benchmark configuration
const WARMUP_ITERATIONS = 3
const BENCHMARK_ITERATIONS = 10
const CONSTRAINT_COUNTS = [100, 500, 1000, 5000]

/**
 * Benchmark result tracking.
 */
interface BenchmarkResult {
  name: string
  constraintCount: number
  indexedTime: number
  nonIndexedTime: number
  speedup: number
  memoryOverhead: number
}

/**
 * Utility to measure execution time.
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T, time: number }> {
  const start = performance.now()
  const result = await fn()
  const end = performance.now()
  return { result, time: end - start }
}

/**
 * Utility to get memory usage.
 */
function getMemoryUsage(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed / 1024 / 1024 // MB
  }
  return 0
}

/**
 * Benchmark: Simple graph edge matching.
 * 
 * Tests performance of matching edges in a graph where constraints
 * frequently join on node IDs.
 */
async function benchmarkGraphMatching(constraintCount: number): Promise<BenchmarkResult> {
  const rules = `
    constraints edge/2, path/2, reachable/2;
    
    @edge(X, Y) \\ path(X, Y) <=> true | path(X, Y).
    @edge(X, Y), path(Y, Z) <=> true | path(X, Z).
    @path(X, Y) <=> true | reachable(X, Y).
  `

  // Generate random graph
  const edges: Array<{ name: string, args: number[] }> = []
  const nodeCount = Math.sqrt(constraintCount)
  
  for (let i = 0; i < constraintCount; i++) {
    const from = Math.floor(Math.random() * nodeCount)
    const to = Math.floor(Math.random() * nodeCount)
    edges.push({ name: 'edge', args: [from, to] })
  }

  // Benchmark with indexed CHR
  const indexedEngine = new CHREngine({ 
    enableIndexedCHR: true,
    argumentIndexOptions: { autoCreateIndexes: true }
  })
  indexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    indexedEngine.clear()
    await indexedEngine.assertMany(edges)
  }
  
  // Actual benchmark
  indexedEngine.clear()
  const indexedStart = getMemoryUsage()
  const { time: indexedTime } = await measureTime(async () => {
    await indexedEngine.assertMany(edges)
  })
  const indexedEnd = getMemoryUsage()
  const indexedMemory = indexedEnd - indexedStart

  // Benchmark without indexed CHR
  const nonIndexedEngine = new CHREngine({ enableIndexedCHR: false })
  nonIndexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    nonIndexedEngine.clear()
    await nonIndexedEngine.assertMany(edges)
  }
  
  // Actual benchmark
  nonIndexedEngine.clear()
  const nonIndexedStart = getMemoryUsage()
  const { time: nonIndexedTime } = await measureTime(async () => {
    await nonIndexedEngine.assertMany(edges)
  })
  const nonIndexedEnd = getMemoryUsage()
  const nonIndexedMemory = nonIndexedEnd - nonIndexedStart

  return {
    name: 'Graph Matching',
    constraintCount,
    indexedTime,
    nonIndexedTime,
    speedup: nonIndexedTime / indexedTime,
    memoryOverhead: indexedMemory - nonIndexedMemory
  }
}

/**
 * Benchmark: Temporal constraint matching.
 * 
 * Tests performance of temporal constraints where time ranges
 * are frequently compared.
 */
async function benchmarkTemporalMatching(constraintCount: number): Promise<BenchmarkResult> {
  const rules = `
    constraints event/3, interval/2, overlap/2;
    
    @event(Id, Start, End), interval(IntervalStart, IntervalEnd) 
      <=> Start >= IntervalStart, End <= IntervalEnd 
      | overlap(Id, IntervalStart).
  `

  // Generate temporal events
  const events: Array<{ name: string, args: number[] }> = []
  
  for (let i = 0; i < constraintCount; i++) {
    const start = Math.floor(Math.random() * 1000)
    const duration = Math.floor(Math.random() * 100) + 1
    const end = start + duration
    events.push({ name: 'event', args: [i, start, end] })
  }
  
  // Add some intervals
  for (let i = 0; i < 10; i++) {
    const start = Math.floor(Math.random() * 500)
    const end = start + Math.floor(Math.random() * 200) + 100
    events.push({ name: 'interval', args: [start, end] })
  }

  // Benchmark with indexed CHR
  const indexedEngine = new CHREngine({ 
    enableIndexedCHR: true,
    argumentIndexOptions: { autoCreateIndexes: true }
  })
  indexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    indexedEngine.clear()
    await indexedEngine.assertMany(events)
  }
  
  // Actual benchmark
  indexedEngine.clear()
  const { time: indexedTime } = await measureTime(async () => {
    await indexedEngine.assertMany(events)
  })

  // Benchmark without indexed CHR
  const nonIndexedEngine = new CHREngine({ enableIndexedCHR: false })
  nonIndexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    nonIndexedEngine.clear()
    await nonIndexedEngine.assertMany(events)
  }
  
  // Actual benchmark
  nonIndexedEngine.clear()
  const { time: nonIndexedTime } = await measureTime(async () => {
    await nonIndexedEngine.assertMany(events)
  })

  return {
    name: 'Temporal Matching',
    constraintCount,
    indexedTime,
    nonIndexedTime,
    speedup: nonIndexedTime / indexedTime,
    memoryOverhead: 0 // Simplified for this benchmark
  }
}

/**
 * Benchmark: Functional dependency utilization.
 * 
 * Tests performance when functional dependencies allow index optimization.
 */
async function benchmarkFunctionalDependencies(constraintCount: number): Promise<BenchmarkResult> {
  const rules = `
    constraints user/3, session/2, active/2;
    
    @user(Id, Name, Email), session(Id, Timestamp) 
      <=> true | active(Name, Timestamp).
  `

  // Generate users and sessions
  const constraints: Array<{ name: string, args: (string | number)[] }> = []
  const userCount = constraintCount / 2
  
  for (let i = 0; i < userCount; i++) {
    constraints.push({ 
      name: 'user', 
      args: [`user_${i}`, `name_${i}`, `email_${i}@example.com`] 
    })
  }
  
  for (let i = 0; i < userCount; i++) {
    const userId = Math.floor(Math.random() * userCount)
    constraints.push({ 
      name: 'session', 
      args: [`user_${userId}`, Math.floor(Date.now() / 1000)] 
    })
  }

  // Benchmark with indexed CHR
  const indexedEngine = new CHREngine({ 
    enableIndexedCHR: true,
    argumentIndexOptions: { autoCreateIndexes: true }
  })
  indexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    indexedEngine.clear()
    await indexedEngine.assertMany(constraints)
  }
  
  // Actual benchmark
  indexedEngine.clear()
  const { time: indexedTime } = await measureTime(async () => {
    await indexedEngine.assertMany(constraints)
  })

  // Benchmark without indexed CHR
  const nonIndexedEngine = new CHREngine({ enableIndexedCHR: false })
  nonIndexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    nonIndexedEngine.clear()
    await nonIndexedEngine.assertMany(constraints)
  }
  
  // Actual benchmark
  nonIndexedEngine.clear()
  const { time: nonIndexedTime } = await measureTime(async () => {
    await nonIndexedEngine.assertMany(constraints)
  })

  return {
    name: 'Functional Dependencies',
    constraintCount,
    indexedTime,
    nonIndexedTime,
    speedup: nonIndexedTime / indexedTime,
    memoryOverhead: 0
  }
}

/**
 * Benchmark: Multi-constraint joins.
 * 
 * Tests performance of rules with multiple constraint heads.
 */
async function benchmarkMultiConstraintJoins(constraintCount: number): Promise<BenchmarkResult> {
  const rules = `
    constraints a/2, b/2, c/2, result/3;
    
    @a(X, Y), b(Y, Z), c(Z, W) <=> true | result(X, Z, W).
  `

  // Generate constraints for multi-way joins
  const constraints: Array<{ name: string, args: number[] }> = []
  
  for (let i = 0; i < constraintCount; i++) {
    const x = Math.floor(Math.random() * 100)
    const y = Math.floor(Math.random() * 100)
    constraints.push({ name: 'a', args: [x, y] })
  }
  
  for (let i = 0; i < constraintCount; i++) {
    const y = Math.floor(Math.random() * 100)
    const z = Math.floor(Math.random() * 100)
    constraints.push({ name: 'b', args: [y, z] })
  }
  
  for (let i = 0; i < constraintCount; i++) {
    const z = Math.floor(Math.random() * 100)
    const w = Math.floor(Math.random() * 100)
    constraints.push({ name: 'c', args: [z, w] })
  }

  // Benchmark with indexed CHR
  const indexedEngine = new CHREngine({ 
    enableIndexedCHR: true,
    argumentIndexOptions: { autoCreateIndexes: true }
  })
  indexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    indexedEngine.clear()
    await indexedEngine.assertMany(constraints)
  }
  
  // Actual benchmark
  indexedEngine.clear()
  const { time: indexedTime } = await measureTime(async () => {
    await indexedEngine.assertMany(constraints)
  })

  // Benchmark without indexed CHR
  const nonIndexedEngine = new CHREngine({ enableIndexedCHR: false })
  nonIndexedEngine.addRules(rules)
  
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    nonIndexedEngine.clear()
    await nonIndexedEngine.assertMany(constraints)
  }
  
  // Actual benchmark
  nonIndexedEngine.clear()
  const { time: nonIndexedTime } = await measureTime(async () => {
    await nonIndexedEngine.assertMany(constraints)
  })

  return {
    name: 'Multi-Constraint Joins',
    constraintCount,
    indexedTime,
    nonIndexedTime,
    speedup: nonIndexedTime / indexedTime,
    memoryOverhead: 0
  }
}

/**
 * Run all benchmarks.
 */
async function runBenchmarks(): Promise<void> {
  console.log('Indexed CHR Performance Benchmarks')
  console.log('====================================')
  console.log(`Warmup iterations: ${WARMUP_ITERATIONS}`)
  console.log(`Benchmark iterations: ${BENCHMARK_ITERATIONS}`)
  console.log(`Constraint counts: ${CONSTRAINT_COUNTS.join(', ')}`)
  console.log()

  const results: BenchmarkResult[] = []

  for (const count of CONSTRAINT_COUNTS) {
    console.log(`Testing with ${count} constraints...`)
    
    // Graph matching
    const graphResult = await benchmarkGraphMatching(count)
    results.push(graphResult)
    
    // Temporal matching
    const temporalResult = await benchmarkTemporalMatching(count)
    results.push(temporalResult)
    
    // Functional dependencies
    const fdResult = await benchmarkFunctionalDependencies(count)
    results.push(fdResult)
    
    // Multi-constraint joins
    const multiResult = await benchmarkMultiConstraintJoins(count)
    results.push(multiResult)
  }

  // Print results
  console.log()
  console.log('Results:')
  console.log('--------')
  console.log()
  
  // Group by benchmark name
  const grouped = new Map<string, BenchmarkResult[]>()
  for (const result of results) {
    const existing = grouped.get(result.name) ?? []
    existing.push(result)
    grouped.set(result.name, existing)
  }
  
  for (const [name, benchmarkResults] of grouped) {
    console.log(`${name}:`)
    console.log('  Constraints | Indexed (ms) | Non-Indexed (ms) | Speedup | Memory Overhead (MB)')
    console.log('  -----------|--------------|------------------|---------|-------------------')
    
    for (const result of benchmarkResults) {
      console.log(
        `  ${result.constraintCount.toString().padStart(10)} | ` +
        `${result.indexedTime.toFixed(2).padStart(12)} | ` +
        `${result.nonIndexedTime.toFixed(2).padStart(16)} | ` +
        `${result.speedup.toFixed(2).padStart(7)}x | ` +
        `${result.memoryOverhead.toFixed(2).padStart(17)}`
      )
    }
    console.log()
  }

  // Summary statistics
  console.log('Summary:')
  console.log('--------')
  const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length
  const maxSpeedup = Math.max(...results.map(r => r.speedup))
  const minSpeedup = Math.min(...results.map(r => r.speedup))
  
  console.log(`Average speedup: ${avgSpeedup.toFixed(2)}x`)
  console.log(`Maximum speedup: ${maxSpeedup.toFixed(2)}x`)
  console.log(`Minimum speedup: ${minSpeedup.toFixed(2)}x`)
}

// Run benchmarks
runBenchmarks().catch(console.error)
