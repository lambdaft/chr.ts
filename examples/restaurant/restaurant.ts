import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'restaurant.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_available: (ctx, ...args) => 0,
      total: (ctx, ...args) => 0,
      is_vegan: (ctx, ...args) => 0,
      is_busy: (ctx, ...args) => 0,
      tip: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[restaurant]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "table", args: ['id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
