import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'library.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      calc_fine: (ctx, ...args) => 0,
      is_active: (ctx, ...args) => 0,
      days_overdue: (ctx, ...args) => 0,
      overdue: (ctx, ...args) => 0,
      can_borrow: (ctx, ...args) => 0,
      new_book: (ctx, ...args) => 0,
      today: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[library]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'book', args: ['b1', 'The Hobbit', 'available'] },
    { name: 'member', args: ['m1', 'active'] },
    { name: 'book', args: ['b2', 'Dune', 'available'] },
    { name: 'member', args: ['m2', 'active'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
