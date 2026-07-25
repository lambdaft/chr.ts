import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'hr.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      tenure: (ctx, ...args) => 0,
      eligible_for_leave: (ctx, ...args) => 0,
      score: (ctx, ...args) => 0,
      budget: (ctx, ...args) => 0,
      headcount: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[hr]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'employee', args: ['e1', 'Alice', 'Engineering', 'SWE'] },
    { name: 'department', args: ['d1', 'Engineering'] },
    { name: 'leave', args: ['e1', '2026-08-01', '2026-08-05', 'vacation'] },
    { name: 'review', args: ['e1', 95, 'Great work'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
