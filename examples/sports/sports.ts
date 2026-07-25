import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'sports.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      is_home: (ctx, ...args) => 0,
      is_winning: (ctx, ...args) => 0,
      is_draw: (ctx, ...args) => 0,
      is_final: (ctx, ...args) => 0,
      points: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[sports]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'team', args: ['t1', 'Lakers', 'basketball'] },
    { name: 'match', args: ['m1', 't1', 't2', 0,0] },
    { name: 'player', args: ['p1', 't1', 'forward'] },
    { name: 'score', args: ['m1', 'p1', 25] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
