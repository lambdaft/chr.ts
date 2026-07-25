import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'inventory.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      stock_level: (ctx, ...args) => 0,
      reorder: (ctx, ...args) => 0,
      is_urgent: (ctx, ...args) => 0,
      ship_cost: (ctx, ...args) => 0,
      priority: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[inventory]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'product', args: ['p1', 'Widget', 'A', 50, 20] },
    { name: 'supplier', args: ['s1', 'FastCo'] },
    { name: 'product', args: ['p2', 'Gadget', 'B', 5, 10] },
    { name: 'shipment', args: ['s1', 'UPS', 'pending'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
