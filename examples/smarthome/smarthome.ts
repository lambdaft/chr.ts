import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'smarthome.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_on: (ctx, ...args) => 0,
      temp_c: (ctx, ...args) => 0,
      motion: (ctx, ...args) => 0,
      trigger: (ctx, ...args) => 0,
      status: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[smarthome]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'device', args: ['d1', 'light', 'on'] },
    { name: 'sensor', args: ['s1', 'temp', 25, 30] },
    { name: 'automation', args: ['a1', 'motion', true, 'turn_on'] },
    { name: 'alert', args: ['d1', 'info'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
