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
      damage: (ctx, ...args) => 0,
      heal: (ctx, ...args) => 0,
      has_item: (ctx, ...args) => 0,
      cast: (ctx, ...args) => 0,
      count: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[gaming]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'character', args: ['c1', 'Aragorn', 'Ranger', 100, 100] },
    { name: 'quest', args: ['q1', 'Destroy Ring', gold,sword, 'active'] },
    { name: 'inventory', args: ['c1', sword,shield] },
    { name: 'skill', args: ['c1', 'Swordsmanship', 5] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
