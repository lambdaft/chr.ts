import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'calendar.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_busy: (ctx, ...args) => 0,
      overlap: (ctx, ...args) => 0,
      duration: (ctx, ...args) => 0,
      valid: (ctx, ...args) => 0,
      notify: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[calendar]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'event', args: ['e1', 'Conference', '2026-08-01', '2026-08-03', alice,bob] },
    { name: 'reminder', args: ['e1', '2026-07-30', 'email'] },
    { name: 'meeting', args: ['m1', alice, '2026-08-01', '2026-08-02'] },
    { name: 'reminder', args: ['m1', '2026-07-31', 'sms'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
