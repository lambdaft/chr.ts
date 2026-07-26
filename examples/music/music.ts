import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'music.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_hit: (ctx, ...args) => 0,
      duration: (ctx, ...args) => 0,
      genre: (ctx, ...args) => 0,
      bpm: (ctx, ...args) => 0,
      likes: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[music]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "song", args: ['id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
