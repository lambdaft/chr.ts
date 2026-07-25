import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'rules.chr'), 'utf8')
const stmts = src.split(';').map(s => s.trim()).filter(Boolean)
const rules = stmts.filter(s => s.includes('@'))

const bs = String.fromCharCode(92)

const simpg = rules.filter(s => s.includes('<=>') && s.includes(bs))
const simpl = rules.filter(s => s.includes('<=>') && !s.includes(bs))
const prop  = rules.filter(s => s.includes('==>') && !s.includes('<='))
const named = rules.filter(s => /^[a-z][a-z0-9_]*\s*@/i.test(s.trim()))

console.log('=== RULE COUNTS ===')
console.log('Total rules:', rules.length)
console.log('  Propagation (==>):', prop.length)
console.log('  Simplification (<==>):', simpl.length)
console.log('  Simpagation (<==> with BS):', simpg.length)
console.log('  Named:', named.length)
console.log('  Rules with guards:', rules.filter(s => s.includes('|')).length)
console.log('  Rules with actions (!):', rules.filter(s => s.includes('!')).length)
console.log('')
console.log('=== FEATURES ===')
console.log('import host builtins:', src.includes('import host builtins'))
console.log('import host custom:', src.includes('import host realm'))
console.log('Constraint stmts:', stmts.filter(s => s.startsWith('constraint') || s.startsWith('constraints')).length)
console.log('Functions stmts:', stmts.filter(s => s.startsWith('function') || s.startsWith('functions')).length)
console.log('Actions stmts:', stmts.filter(s => s.startsWith('action') || s.startsWith('actions')).length)
console.log('')
console.log('=== BUILTIN USAGE ===')
for (const b of ['add','sub','mul','div','min','max','mod','gt','lt','gte','lte','eq','neq','not','abs']) {
  const c = (src.match(new RegExp('\\b' + b + '\\(', 'g')) || []).length
  if (c > 0) console.log('  ' + b + ':', c)
}
