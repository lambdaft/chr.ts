import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'travel.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      duration: (ctx, ...args) => 0,
      is_available: (ctx, ...args) => 0,
      price: (ctx, ...args) => 0,
      bookable: (ctx, ...args) => 0,
      is_peak: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[travel]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "booking", args: ['id1', 'id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
