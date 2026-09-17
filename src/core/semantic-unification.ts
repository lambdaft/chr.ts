/**
 * Semantic Unification standard library and utilities for CHR.ts.
 * 
 * Based on Section 5 of arXiv:2607.21204:
 * Reifies unification `==` as a user-extensible CHR constraint, enabling
 * equational theories and domain solvers (e.g. finite set unification).
 */

export const SEMANTIC_UNIFICATION_RULES = `
// Decompose structural pair equality
pair_eq @ pair(A, B) == pair(C, D) <=> A == C, B == D;

// Structural equality over non-empty lists
cons_eq @ cons(H1, T1) == cons(H2, T2) <=> H1 == H2, T1 == T2;

// Finite set unification (Dovier et al. 2000 / chrKanren Section 5)
set_empty @ set_empty == set_empty <=> true;

set_decompose @ set_cons(T, S) == set_cons(T2, S2) <=>
  (T == T2, S == S2) |
  (T == T2, set_cons(T, S) == S2) |
  (T == T2, S == set_cons(T2, S2));
`

/**
 * Creates a pair representation helper for relational programs.
 */
export function pair (a: unknown, b: unknown): { type: 'functor', name: 'pair', args: [unknown, unknown] } {
  return { type: 'functor', name: 'pair', args: [a, b] }
}

/**
 * Creates a set_cons representation helper for finite set solving.
 */
export function setCons (head: unknown, tail: unknown): { type: 'functor', name: 'set_cons', args: [unknown, unknown] } {
  return { type: 'functor', name: 'set_cons', args: [head, tail] }
}

/**
 * Representation helper for empty set atom in finite set solving.
 */
export const emptySet = 'set_empty'
