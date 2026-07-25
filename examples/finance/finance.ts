import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'finance.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      value: (ctx, ...args) => 0,
      risk: (ctx, ...args) => 0,
      return_rate: (ctx, ...args) => 0,
      diversify: (ctx, ...args) => 0,
      yield_pct: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[finance]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'portfolio', args: ['pf1', 'Alice'] },
    { name: 'asset', args: ['a1', 'stock', 100, 50] },
    { name: 'portfolio', args: ['pf2', 'Bob'] },
    { name: 'investment', args: ['inv1', 'pf1', 5000] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
