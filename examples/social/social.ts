import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'social.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      popularity: (ctx, ...args) => 0,
      is_following: (ctx, ...args) => 0,
      unread: (ctx, ...args) => 0,
      engagement: (ctx, ...args) => 0,
      hashtag: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[social]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'user', args: ['u1', 'Alice', '@alice', 500] },
    { name: 'post', args: ['p1', 'u1', 'Hello world!', 10] },
    { name: 'follow', args: ['u2', 'u1', '2026-01-01'] },
    { name: 'notification', args: ['u1', 'like', 'liked your post'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
