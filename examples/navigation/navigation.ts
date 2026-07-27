import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', 'navigation.chr'), 'utf8')

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
      log: ({ args }: { args: unknown[] }) => console.log("[navigation]", args[0] ?? "", args[1] ?? ""),
      warn: ({ args }: { args: unknown[] }) => console.log("[WARN]", args[0] ?? "", args[1] ?? "")
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
    { name: "vessel", args: ['VES1', 'POS1', 10, 20] },
    { name: "route", args: ['VES1', 'RTE1', 10, 20, 'PORT_A'] },
    { name: "waypoint", args: ['WP1', 'VES1', 12, 'POS2'] },
    { name: "zone", args: ['ZONE1', 10, 20, 'restricted'] },
    { name: "port", args: ['PORT1', 9, 18, 'LOC1'] },
    { name: "speed", args: ['VES1', 12, 15] },
    { name: "eta", args: ['VES1', 20, 'PORT_A'] },
    { name: "alert", args: ['VES1', 10, 'high'] },
    { name: "clearance", args: ['VES1', 11, 'COASTGUARD'] },
    { name: "collision", args: ['VES1', 'VES2', 14] }
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
