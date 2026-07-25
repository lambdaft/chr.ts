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
      is_favorite: (ctx, ...args) => 0,
      duration: (ctx, ...args) => 0,
      genre: (ctx, ...args) => 0,
      is_up_next: (ctx, ...args) => 0,
      repeat: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[music]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'song', args: ['s1', 'Bohemian Rhapsody', 'Queen', 354] },
    { name: 'playlist', args: ['pl1', 'Classics', 50] },
    { name: 'rating', args: ['r1', 's1', 5] },
    { name: 'queue', args: ['q1', 's1', 1] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
