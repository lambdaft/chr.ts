import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'restaurant.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      available: (ctx, ...args) => 0,
      prep_time: (ctx, ...args) => 0,
      total: (ctx, ...args) => 0,
      rating: (ctx, ...args) => 0,
      is_ready: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[restaurant]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'reservation', args: ['r1', 'Alice', '19:00', 4, 'confirmed'] },
    { name: 'table', args: ['t1', 4, 'available'] },
    { name: 'menu_item', args: ['m1', 'Pasta', 18, 'main'] },
    { name: 'order', args: ['o1', Pasta, 18, 'pending'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
