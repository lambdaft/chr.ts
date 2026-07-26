import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'weather.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      temp_f: (ctx, ...args) => 0,
      is_severe: (ctx, ...args) => 0,
      humidity: (ctx, ...args) => 0,
      wind_speed: (ctx, ...args) => 0,
      uv_index: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[weather]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "station", args: ['id1', 'id1', 'id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
