import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'education.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      gpa: (ctx, ...args) => 0,
      passes: (ctx, ...args) => 0,
      eligible: (ctx, ...args) => 0,
      satisfied: (ctx, ...args) => 0,
      weighted: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => {
        console.log('[education]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: 'student', args: ['s1', 'Alice', 'CS'] },
    { name: 'course', args: ['c1', 'CS101', 'Intro', 3] },
    { name: 'student', args: ['s2', 'Bob', 'Math'] },
    { name: 'enrollment', args: ['s1', 'CS101', 'enrolled'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
