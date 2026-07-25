import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'ecommerce.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      total: (ctx, ...args) => 0,
      apply_disc: (ctx, ...args) => 0,
      is_valid: (ctx, ...args) => 0,
      in_stock: (ctx, ...args) => 0,
      tax: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[ecommerce]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'user', args: ['u1', 'alice@mail.com', 'standard'] },
    { name: 'product', args: ['p1', 'Laptop', 999, 50] },
    { name: 'user', args: ['u2', 'bob@mail.com', 'gold'] },
    { name: 'cart', args: ['c1', 'u1', p1] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
