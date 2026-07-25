import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'supplychain.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      inventory_level: (ctx, ...args) => 0,
      lead_time: (ctx, ...args) => 0,
      cost: (ctx, ...args) => 0,
      is_urgent: (ctx, ...args) => 0,
      quality: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[supplychain]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'product', args: ['pr1', 'Widget', 5, 'WarehouseA'] },
    { name: 'supplier', args: ['sup1', 'FastParts', 4.5] },
    { name: 'order', args: ['o1', 'pr1', 'reorder', 100] },
    { name: 'shipment', args: ['s1', 'pending'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
