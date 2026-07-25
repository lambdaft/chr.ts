import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'healthcare.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      urgent: (ctx, ...args) => 0,
      follow_up: (ctx, ...args) => 0,
      duration: (ctx, ...args) => 0,
      is_valid: (ctx, ...args) => 0,
      refill: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[healthcare]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'patient', args: ['p1', 'Alice', 34, 'fever'] },
    { name: 'appointment', args: ['p1', 'Dr. Smith', '2026-07-25', 10] },
    { name: 'patient', args: ['p2', 'Bob', 72, 'cardiac'] },
    { name: 'prescription', args: ['p2', 'Aspirin', 30] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
