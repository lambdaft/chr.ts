import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'social.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_viral: (ctx, ...args) => 0,
      is_popular: (ctx, ...args) => 0,
      length: (ctx, ...args) => 0,
      is_recent: (ctx, ...args) => 0,
      count: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[social]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "user", args: ['id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
