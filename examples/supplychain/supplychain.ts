import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'supplychain.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_backordered: (ctx, ...args) => 0,
      is_oversupplied: (ctx, ...args) => 0,
      is_fragile: (ctx, ...args) => 0,
      demand: (ctx, ...args) => 0,
      lead_time: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[supplychain]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "supplier", args: ['id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
