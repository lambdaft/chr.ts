import { RelationalEngine } from '../../src/index.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'relational_typecheck.chr'), 'utf-8')

const engine = new RelationalEngine()
engine.loadProgram(source)

console.log('--- Relational Type Checker & Inference with CHR-vee ---')
// Query: Infer return type of z given plus(x, y, z) where x: int, y: int
const query = "has_type('x', 'int'), has_type('y', 'int'), plus('x', 'y', 'z'), has_type('z', T)"
const solutions = engine.run(1, ['T'], query)
console.log('Inferred type for T:', solutions)
