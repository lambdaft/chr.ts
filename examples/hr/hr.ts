import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'hr.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_senior: (ctx, ...args) => 0,
      eligible: (ctx, ...args) => 0,
      duration: (ctx, ...args) => 0,
      is_mandatory: (ctx, ...args) => 0,
      credit: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[hr]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "employee", args: ['id1', 'id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
