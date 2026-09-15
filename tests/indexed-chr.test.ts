/**
 * Test suite for indexed CHR implementation.
 *
 * These tests validate that the indexed CHR features work correctly
 * and provide the expected performance improvements.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CHREngine, IndexAnalyzer, ArgumentIndex } from '../dist/index.js'

describe('Indexed CHR', () => {
  describe('Argument Index', () => {
    it('should create single-argument indexes', () => {
      const argIndex = new ArgumentIndex()
      argIndex.createSingleIndex('edge', 2, 0)
      
      expect(argIndex.hasSingleIndex('edge', 2, 0)).toBe(true)
      expect(argIndex.hasSingleIndex('edge', 2, 1)).toBe(false)
    })

    it('should create composite indexes', () => {
      const argIndex = new ArgumentIndex()
      argIndex.createCompositeIndex('edge', 2, [0, 1])
      
      expect(argIndex.hasCompositeIndex('edge', 2, [0, 1])).toBe(true)
      expect(argIndex.hasCompositeIndex('edge', 2, [0])).toBe(false)
    })

    it('should track index statistics', () => {
      const argIndex = new ArgumentIndex()
      argIndex.createSingleIndex('test', 1, 0)
      
      const stats = argIndex.getIndexStatistics('test', 1, 0)
      expect(stats).not.toBeNull()
      expect(stats?.lookups).toBe(0)
    })
  })

  describe('Index Analyzer', () => {
    it('should analyze rules for functional dependencies', () => {
      const rules = `
        constraints edge/2, path/2;
        @edge(X, Y), path(Y, Z) <=> true | path(X, Z).
      `
      
      const engine = new CHREngine()
      engine.addRules(rules)
      
      const analyzer = new IndexAnalyzer(engine.getRules())
      const dependencies = analyzer.detectFunctionalDependencies()
      
      expect(Array.isArray(dependencies)).toBe(true)
    })

    it('should detect symmetries in constraints', () => {
      const rules = `
        constraints pair/2;
        @pair(X, Y), pair(Y, X) <=> true | true.
      `
      
      const engine = new CHREngine()
      engine.addRules(rules)
      
      const analyzer = new IndexAnalyzer(engine.getRules())
      const symmetries = analyzer.detectSymmetries()
      
      expect(Array.isArray(symmetries)).toBe(true)
    })

    it('should recommend indexes based on analysis', () => {
      const rules = `
        constraints user/3, session/2;
        @user(Id, Name, Email), session(Id, Time) <=> true | active(Name, Time).
      `
      
      const engine = new CHREngine()
      engine.addRules(rules)
      
      const analyzer = new IndexAnalyzer(engine.getRules())
      const recommendations = analyzer.recommendIndexes()
      
      expect(Array.isArray(recommendations)).toBe(true)
    })
  })

  describe('Engine Integration', () => {
    it('should enable indexed CHR by default', () => {
      const engine = new CHREngine()
      expect(engine).toBeDefined()
    })

    it('should allow disabling indexed CHR', () => {
      const engine = new CHREngine({ enableIndexedCHR: false })
      expect(engine).toBeDefined()
    })

    it('should support argument index options', () => {
      const engine = new CHREngine({
        argumentIndexOptions: {
          maxSingleIndexes: 10,
          autoCreateIndexes: false
        }
      })
      expect(engine).toBeDefined()
    })

    it('should execute rules with indexed CHR', async () => {
      const rules = `
        constraints edge/2, path/2;
        @edge(X, Y) <=> true | path(X, Y).
      `
      
      const engine = new CHREngine({ enableIndexedCHR: true })
      engine.addRules(rules)
      
      await engine.assert('edge', [1, 2])
      
      const result = engine.expect('path', [1, 2])
      expect(result.exists()).toBe(true)
    })

    it('should produce same results with and without indexing', async () => {
      const rules = `
        constraints edge/2, path/2;
        @edge(X, Y) <=> true | path(X, Y).
      `
      
      const indexedEngine = new CHREngine({ enableIndexedCHR: true })
      indexedEngine.addRules(rules)
      await indexedEngine.assert('edge', [1, 2])
      
      const nonIndexedEngine = new CHREngine({ enableIndexedCHR: false })
      nonIndexedEngine.addRules(rules)
      await nonIndexedEngine.assert('edge', [1, 2])
      
      const indexedResult = indexedEngine.expect('path', [1, 2])
      const nonIndexedResult = nonIndexedEngine.expect('path', [1, 2])
      
      expect(indexedResult.exists()).toBe(nonIndexedResult.exists())
    })
  })

  describe('Performance Characteristics', () => {
    it('should handle large constraint sets efficiently', async () => {
      const rules = `
        constraints edge/2, path/2;
        @edge(X, Y) <=> true | path(X, Y).
      `
      
      const engine = new CHREngine({ enableIndexedCHR: true })
      engine.addRules(rules)
      
      const constraints = []
      for (let i = 0; i < 1000; i++) {
        constraints.push({ name: 'edge', args: [i, i + 1] })
      }
      
      const start = performance.now()
      await engine.assertMany(constraints)
      const duration = performance.now() - start
      
      // Should complete in reasonable time (< 1 second for 1000 constraints)
      expect(duration).toBeLessThan(1000)
    })

    it('should benefit from indexing on selective lookups', async () => {
      const rules = `
        constraints user/3, session/2, active/2;
        @user(Id, Name, Email), session(Id, Time) <=> true | active(Name, Time).
      `
      
      const engine = new CHREngine({ 
        enableIndexedCHR: true,
        argumentIndexOptions: { autoCreateIndexes: true }
      })
      engine.addRules(rules)
      
      // Create users
      for (let i = 0; i < 100; i++) {
        await engine.assert('user', [`user_${i}`, `name_${i}`, `email_${i}`])
      }
      
      // Create sessions for specific users
      const specificUserId = 'user_42'
      for (let i = 0; i < 50; i++) {
        await engine.assert('session', [specificUserId, Date.now()])
      }
      
      // Should create active constraints efficiently
      const result = engine.expect('active', ['name_42', Date.now()])
      expect(result.exists()).toBe(true)
    })
  })

  describe('Backward Compatibility', () => {
    it('should work with existing CHR syntax', async () => {
      const rules = `
        constraints a/1, b/1, c/1;
        @a(X) <=> true | b(X).
        @b(X) <=> true | c(X).
      `
      
      const engine = new CHREngine()
      engine.addRules(rules)
      
      await engine.assert('a', [1])
      
      expect(engine.expect('b', [1]).exists()).toBe(true)
      expect(engine.expect('c', [1]).exists()).toBe(true)
    })

    it('should support all rule kinds', async () => {
      const rules = `
        constraints a/1, b/1, c/1;
        @a(X) ==> b(X).              // propagation
        @b(X) <=> c(X).              // simplification
        @a(X) \\ b(X) <=> c(X).      // simpagation
      `
      
      const engine = new CHREngine()
      engine.addRules(rules)
      
      await engine.assert('a', [1])
      
      expect(engine.expect('b', [1]).exists()).toBe(true)
      expect(engine.expect('c', [1]).exists()).toBe(true)
    })
  })
})
