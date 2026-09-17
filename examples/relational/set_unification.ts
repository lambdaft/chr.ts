import { RelationalEngine } from '../../src/index.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'set_unification.chr'), 'utf-8')

const engine = new RelationalEngine()
engine.loadProgram(source)

console.log('--- Dovier Finite Set Unification with CHR-vee ---')
const setSolutions = engine.run(null, ['X', 'Y'], 'set(1, 2) == set(X, Y)')
console.log('Solutions for set(1, 2) == set(X, Y):', setSolutions)

const pairSolutions = engine.run(null, ['A', 'B'], 'pair(10, 20) == pair(A, B)')
console.log('Solutions for pair(10, 20) == pair(A, B):', pairSolutions)
