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
      is_overdue: (ctx, ...args) => 0,
      is_reserved: (ctx, ...args) => 0,
      category: (ctx, ...args) => 0,
      popularity: (ctx, ...args) => 0,
      late_fee: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[library]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "book", args: ['id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
