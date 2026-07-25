import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'iot.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_online: (ctx, ...args) => 0,
      measure: (ctx, ...args) => 0,
      threshold: (ctx, ...args) => 0,
      is_critical: (ctx, ...args) => 0,
      calibrate: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[iot]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'device', args: ['d1', 'temp_sensor', 'online'] },
    { name: 'reading', args: ['d1', 'temperature', 37.5] },
    { name: 'config', args: ['d1', 'interval', 60] },
    { name: 'alert', args: ['d1', 'temperature', 'normal'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
