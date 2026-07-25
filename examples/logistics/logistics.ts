import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'logistics.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      distance: (ctx, ...args) => 0,
      ETA: (ctx, ...args) => 0,
      is_valid: (ctx, ...args) => 0,
      cost: (ctx, ...args) => 0,
      on_time: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[logistics]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'package', args: ['pkg1', 'WarehouseA', 'StoreB', 10, 'pending'] },
    { name: 'route', args: ['r1', 'WarehouseA', 'StoreB', hub1] },
    { name: 'shipment', args: ['s1', 'TRK001', 'pending'] },
    { name: 'carrier', args: ['c1', 'FastShip'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
