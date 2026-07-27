import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'medical.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
      during: (_ctx: unknown, time: unknown, start: unknown, end: unknown) => Number(time) >= Number(start) && Number(time) <= Number(end) ? 1 : 0,
      before: (_ctx: unknown, time: unknown, cutoff: unknown) => Number(time) < Number(cutoff) ? 1 : 0,
      meets: (_ctx: unknown, time1: unknown, time2: unknown) => Number(time1) === Number(time2) ? 1 : 0,
      overlaps: (_ctx: unknown, time: unknown, start: unknown, end: unknown) => {
        const t = Number(time)
        const s = Number(start)
        const e = Number(end)
        return t > s && t < e ? 1 : 0
      },
      starts: (_ctx: unknown, time: unknown, start: unknown) => Number(time) === Number(start) ? 1 : 0,
      ends: (_ctx: unknown, time: unknown, end: unknown) => Number(time) === Number(end) ? 1 : 0,
      contains: (_ctx: unknown, container: unknown, contained: unknown) => Number(contained) >= Number(container) ? 1 : 0,
      abuts: (_ctx: unknown, time1: unknown, time2: unknown) => Number(time1) + 1 === Number(time2) || Number(time2) + 1 === Number(time1) ? 1 : 0,
      after: (_ctx: unknown, time1: unknown, time2: unknown) => Number(time1) > Number(time2) ? 1 : 0
    },
    actions: {
      log: ({ args }: { args: unknown[] }) => console.log("[medical]", args[0] ?? "", args[1] ?? ""),
      notify: ({ args }: { args: unknown[] }) => console.log("[NOTIFY]", args[0] ?? "", args[1] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "diagnosis", args: ['PAT1', 5, 'flu'] },
    { name: "appointment", args: ['PAT1', 'DR1', 6, 7] },
    { name: "medication", args: ['PAT1', 'Aspirin', 6, 10] },
    { name: "treatment", args: ['TRT1', 'PAT1', 6, 12] },
    { name: "test", args: ['TST1', 'PAT1', 8] },
    { name: "prescription", args: ['PAT1', 'Aspirin', 6] },
    { name: "admission", args: ['PAT1', 6, 'WARD1'] },
    { name: "discharge", args: ['PAT1', 12] },
    { name: "followUp", args: ['PAT1', 14, 'DR1'] },
    { name: "alert", args: ['PAT1', 8, 'high'] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
