import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'finance.chr'), 'utf8')

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
      log: ({ args }: { args: unknown[] }) => console.log("[finance]", args[0] ?? "", args[1] ?? ""),
      alert: ({ args }: { args: unknown[] }) => console.log("[ALERT]", args[0] ?? "", args[1] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "marketSession", args: ['SESSION1', 9, 17] },
    { name: "order", args: ['ORD1', 'AAPL', 10, 'buy'] },
    { name: "order", args: ['ORD2', 'AAPL', 18, 'sell'] },
    { name: "trade", args: ['TRD1', 'AAPL', 10, 150] },
    { name: "settlement", args: ['SET1', 'TRD1', 11] },
    { name: "cutoff", args: ['CUT1', 16] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
