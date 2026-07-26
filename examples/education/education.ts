import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'education.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      gpa: (ctx, ...args) => 0,
      passed: (ctx, ...args) => 0,
      is_fulltime: (ctx, ...args) => 0,
      grade_avg: (ctx, ...args) => 0,
      due_soon: (ctx, ...args) => 0
    },
    actions: {
      log: ({ args }) => console.log("[education]", args[0] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "student", args: ['id1', 'id1', 'id1'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
