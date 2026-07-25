import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'banking.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      balance: (ctx, ...args) => 0,
      overdrawn: (ctx, ...args) => 0,
      compound: (ctx, ...args) => 0,
      penalty: (ctx, ...args) => 0,
      eligible: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[banking]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'customer', args: ['c1', 'standard'] },
    { name: 'account', args: ['a1', 'Alice', 1500] },
    { name: 'customer', args: ['c2', 'VIP'] },
    { name: 'account', args: ['a2', 'Bob', 100] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
