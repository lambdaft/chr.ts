import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const s = readFileSync(join(__dirname, 'rules.chr'), 'utf8')
const rules = s.split('\n').filter(l => l.trim()).filter(l => l.includes('@'))
const bs = String.fromCharCode(92)

// Show all rules containing backslash
for (const r of rules) {
  if (r.indexOf(bs) >= 0) {
    const display = r.substring(0, 85).replace(/\\/g, '<BS>')
    console.log('HAS BS:', display)
  }
}
console.log('---')
// Show all <=> rules
for (const r of rules) {
  if (r.includes('<=>')) {
    const hasB = r.indexOf(bs) >= 0
    const label = hasB ? 'SIMPG' : 'SIMPL'
    const display = r.substring(0, 85).replace(/\\/g, '<BS>')
    console.log(label, display)
  }
}
