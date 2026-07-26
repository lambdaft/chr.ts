import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'gaming.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      level: (ctx, ...args) => 0,
      is_win: (ctx, ...args) => 0,
      bonus: (ctx, ...args) => 0,
      rarity: (ctx, ...args) => 0,
      power: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[gaming]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "player", args: ['id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
