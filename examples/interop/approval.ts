import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, 'approval.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      positive: (_ctx, value) => Number(value) > 0,
      inc: (_ctx, value) => Number(value) + 1
    },
    actions: {
      record: ({ args }) => {
        console.log('[approval]', args[0])
      }
    }
  })

  engine.registerHost(host)
  engine.addRules(source)

  await engine.assert('input', [5])

  console.log(engine.snapshot())
}

void main()