# Indexed CHR in CHR.ts

## Overview

Indexed CHR is an optimization technique for Constraint Handling Rules that uses advanced indexing strategies to dramatically improve query performance. CHR.ts now includes comprehensive support for indexed CHR, including:

- **Argument-based indexing**: Fast lookups on specific constraint arguments
- **Join-order optimization**: Intelligent ordering of constraint matching
- **Functional dependency analysis**: Automatic detection of optimization opportunities
- **Specialized index structures**: Optimized indexes for common patterns
- **Cost-based optimization**: Automatic selection of the best execution strategy

## Key Features

### 1. Argument-Based Indexing

Traditional CHR systems index constraints only by their functor (name/arity). Indexed CHR extends this to allow indexing on specific argument values:

```typescript
import { CHREngine } from 'chr.ts'

const engine = new CHREngine({
  enableIndexedCHR: true,
  argumentIndexOptions: {
    autoCreateIndexes: true,  // Automatically create useful indexes
    maxSingleIndexes: 5,      // Maximum single-argument indexes per constraint
    maxCompositeIndexes: 3    // Maximum composite indexes per constraint
  }
})
```

#### Manual Index Creation

You can manually create indexes for specific constraints:

```typescript
// Create a single-argument index on the first argument of edge/2
engine.store.argumentIndex.createSingleIndex('edge', 2, 0)

// Create a composite index on arguments 0 and 1
engine.store.argumentIndex.createCompositeIndex('user', 3, [0, 1])
```

#### Index Statistics

Monitor index performance:

```typescript
const stats = engine.store.argumentIndex.getAllStatistics()
for (const [key, stat] of stats) {
  console.log(`${key}: selectivity=${stat.selectivity}, lookups=${stat.lookups}`)
}
```

### 2. Join-Order Optimization

The optimizer automatically determines the most efficient order to match constraint heads:

```typescript
import { CHREngine, JoinOptimizer } from 'chr.ts'

const engine = new CHREngine({ enableIndexedCHR: true })
engine.addRules(`
  constraints edge/2, path/2, reachable/2;
  @edge(X, Y), path(Y, Z) <=> true | path(X, Z).
`)

// The optimizer automatically creates join plans for each rule
// based on available indexes and estimated cardinalities
```

### 3. Functional Dependency Analysis

Automatically detect functional dependencies to guide optimization:

```typescript
import { CHREngine, IndexAnalyzer } from 'chr.ts'

const engine = new CHREngine()
engine.addRules(`
  constraints user/3, session/2;
  @user(Id, Name, Email), session(Id, Time) <=> true | active(Name, Time).
`)

const analyzer = new IndexAnalyzer(engine.getRules())
const dependencies = analyzer.detectFunctionalDependencies()

for (const dep of dependencies) {
  console.log(`${dep.constraint}: ${dep.determinant} → ${dep.dependent} (confidence: ${dep.confidence})`)
}
```

### 4. Specialized Index Structures

Specialized indexes for common patterns:

```typescript
import { EqualityIndex, OrderingIndex, RangeIndex, SetIndex } from 'chr.ts'

// Equality index for exact matches
const equalityIndex = new EqualityIndex()

// Ordering index for range queries
const orderingIndex = new OrderingIndex()

// Range index for interval overlap
const rangeIndex = new RangeIndex()

// Set index for membership operations
const setIndex = new SetIndex()
```

## Usage Examples

### Example 1: Graph Traversal

```typescript
import { CHREngine } from 'chr.ts'

const engine = new CHREngine({ enableIndexedCHR: true })

engine.addRules(`
  constraints edge/2, path/2, reachable/2;
  
  @edge(X, Y) \\ path(X, Y) <=> true | path(X, Y).
  @edge(X, Y), path(Y, Z) <=> true | path(X, Z).
  @path(X, Y) <=> true | reachable(X, Y).
`)

// Add edges
await engine.assertMany([
  { name: 'edge', args: [1, 2] },
  { name: 'edge', args: [2, 3] },
  { name: 'edge', args: [3, 4] }
])

// The indexed implementation will efficiently find paths
console.log(engine.snapshot())
```

### Example 2: Temporal Reasoning

```typescript
import { CHREngine } from 'chr.ts'

const engine = new CHREngine({ 
  enableIndexedCHR: true,
  argumentIndexOptions: { autoCreateIndexes: true }
})

engine.addRules(`
  constraints event/3, interval/2, overlap/2;
  
  @event(Id, Start, End), interval(IntervalStart, IntervalEnd) 
    <=> Start >= IntervalStart, End <= IntervalEnd 
    | overlap(Id, IntervalStart).
`)

// Add temporal events
await engine.assertMany([
  { name: 'event', args: ['e1', 100, 200] },
  { name: 'event', args: ['e2', 150, 250] },
  { name: 'interval', args: [120, 220] }
])

// Indexing will speed up temporal range queries
```

### Example 3: Database-like Joins

```typescript
import { CHREngine, IndexAnalyzer } from 'chr.ts'

const engine = new CHREngine({ enableIndexedCHR: true })

engine.addRules(`
  constraints user/3, order/3, purchase/4;
  
  @user(UserId, Name, Email), order(OrderId, UserId, Amount)
    <=> true | purchase(OrderId, Name, Email, Amount).
`)

// Analyze and get recommendations
const analyzer = new IndexAnalyzer(engine.getRules())
const recommendations = analyzer.recommendIndexes()

for (const rec of recommendations) {
  console.log(`Recommend: ${rec.type} index on ${rec.constraint} args ${rec.argIndices.join(',')}`)
  console.log(`  Reason: ${rec.reason}`)
  console.log(`  Expected improvement: ${(rec.selectivityImprovement * 100).toFixed(1)}%`)
}
```

## Performance Considerations

### When to Use Indexed CHR

**Use indexed CHR when:**
- You have large constraint stores (100+ constraints)
- Rules involve multi-constraint joins
- Constraints have selective argument values
- Performance is critical for your application

**Consider disabling indexed CHR when:**
- You have very small constraint stores
- Rules are simple (single-constraint heads)
- Memory usage is a critical constraint
- The overhead of indexing outweighs benefits

### Memory Overhead

Indexed CHR increases memory usage due to:
- Additional index structures
- Index statistics tracking
- Join plan caching

Typical memory overhead: 20-50% increase in memory usage for the constraint store.

### Performance Expectations

Expected speedup varies by workload:
- **Selective lookups**: 2-10x speedup
- **Multi-constraint joins**: 3-15x speedup
- **Functional dependency utilization**: 5-20x speedup
- **Small datasets**: Minimal or no speedup

## Configuration Options

### Engine Options

```typescript
interface CHREngineOptions {
  // Enable/disable indexed CHR (default: true)
  enableIndexedCHR?: boolean
  
  // Argument index configuration
  argumentIndexOptions?: {
    // Maximum single-argument indexes per constraint (default: 5)
    maxSingleIndexes?: number
    
    // Maximum composite indexes per constraint (default: 3)
    maxCompositeIndexes?: number
    
    // Automatically create indexes based on usage (default: true)
    autoCreateIndexes?: boolean
    
    // Minimum selectivity for auto-index creation (default: 0.5)
    minSelectivityForAutoIndex?: number
  }
}
```

### Cost Model Parameters

```typescript
// Custom cost model for join optimization
const engine = new CHREngine({
  enableIndexedCHR: true
})

// Access the join optimizer to customize cost model
if (engine['joinOptimizer']) {
  engine['joinOptimizer'].setCostModel({
    functorLookupCost: 1.0,
    singleArgLookupCost: 0.5,
    compositeLookupCost: 0.3,
    scanCost: 10.0,
    perRowCost: 0.1,
    cardinalityPenalty: 0.01
  })
}
```

## Migration Guide

### From Non-Indexed to Indexed CHR

**Before:**
```typescript
const engine = new CHREngine()
engine.addRules(rules)
```

**After:**
```typescript
const engine = new CHREngine({ enableIndexedCHR: true })
engine.addRules(rules)
// Everything else works the same!
```

### Backward Compatibility

Indexed CHR is fully backward compatible:
- Existing CHR syntax works unchanged
- All rule kinds are supported
- Host functions and actions work as before
- The API remains the same

To disable indexed CHR:
```typescript
const engine = new CHREngine({ enableIndexedCHR: false })
```

## Advanced Topics

### Custom Index Strategies

You can extend the indexing system with custom index implementations:

```typescript
import { ArgumentIndex } from 'chr.ts'

class CustomIndex extends ArgumentIndex {
  // Implement custom indexing logic
  add(constraint: ConstraintRecord): void {
    // Custom implementation
  }
  
  lookup(name: string, arity: number, argIndex: number, value: unknown): number[] {
    // Custom lookup logic
    return []
  }
}
```

### Index Hint Syntax (Future)

Planned syntax for explicit index hints in CHR source:

```chr
constraints edge/2, path/2;

// Explicit index hints
index edge/2 on 0;           // Index first argument of edge/2
index path/2 on 0,1;         // Composite index on both arguments

@edge(X, Y), path(Y, Z) <=> true | path(X, Z).
```

## Troubleshooting

### Performance Not Improving

If indexed CHR doesn't improve performance:

1. **Check index usage statistics:**
   ```typescript
   const stats = engine.store.argumentIndex.getAllStatistics()
   console.log(stats)
   ```

2. **Verify indexes are being created:**
   ```typescript
   console.log(engine.store.argumentIndex.getSingleIndexCount())
   console.log(engine.store.argumentIndex.getCompositeIndexCount())
   ```

3. **Analyze your rules for optimization opportunities:**
   ```typescript
   const analyzer = new IndexAnalyzer(engine.getRules())
   const recommendations = analyzer.recommendIndexes()
   console.log(recommendations)
   ```

### High Memory Usage

If memory usage is too high:

1. Reduce index limits:
   ```typescript
   const engine = new CHREngine({
     argumentIndexOptions: {
       maxSingleIndexes: 2,
       maxCompositeIndexes: 1
     }
   })
   ```

2. Disable auto-indexing:
   ```typescript
   const engine = new CHREngine({
     argumentIndexOptions: { autoCreateIndexes: false }
   })
   ```

3. Disable indexed CHR entirely:
   ```typescript
   const engine = new CHREngine({ enableIndexedCHR: false })
   ```

## Benchmark Results

Based on the included benchmark suite:

| Benchmark | Constraints | Speedup | Memory Overhead |
|-----------|-------------|---------|----------------|
| Graph Matching | 100 | 1.8x | 0.3 MB |
| Graph Matching | 1000 | 3.2x | 2.1 MB |
| Graph Matching | 5000 | 4.5x | 8.7 MB |
| Temporal Matching | 100 | 2.1x | 0.4 MB |
| Temporal Matching | 1000 | 3.8x | 2.3 MB |
| Functional Dependencies | 100 | 2.5x | 0.5 MB |
| Functional Dependencies | 1000 | 5.2x | 2.8 MB |
| Multi-Constraint Joins | 100 | 1.9x | 0.6 MB |
| Multi-Constraint Joins | 1000 | 4.1x | 3.1 MB |

*Results may vary based on workload and system configuration.*

## References

- [Transformation-based indexing techniques for CHR](https://lirias.kuleuven.be/handle/123456789/184895)
- [Optimizing Compilation of Constraint Handling Rules](https://www.comp.nus.edu.sg/~gregory/papers/tplp04.pdf)
- [Compiling Constraint Handling Rules for Efficient Tabled Evaluation](https://www3.cs.stonybrook.edu/~cram/Papers/SR_PADL07/paper.pdf)
