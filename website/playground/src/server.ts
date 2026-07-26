import express from 'express'
import { createEngine } from '../../../dist/index.js'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PLAYGROUND_DIR = join(__dirname, '..')

const app = express()
const PORT = process.env.PORT ?? 4173
const traceArrays = new WeakMap<ReturnType<typeof createEngine>, Array<{ ruleName: string, kind: string, matchedIds: number[], bindings: Record<string, unknown>, durationMs?: number }>>()

app.use(express.json({ limit: '1mb' }))
app.use(express.static(PLAYGROUND_DIR))

function getTrace (engine: ReturnType<typeof createEngine>) {
  return traceArrays.get(engine) ?? []
}

function makeEngine() {
  const engine = createEngine({ source: '', maxRuleFirings: 5000 })
  engine.registerBuiltins()
  const trace: Array<{ ruleName: string, kind: string, matchedIds: number[], bindings: Record<string, unknown>, durationMs?: number }> = []
  traceArrays.set(engine, trace)
  engine.onRuleFired = (t) => {
    trace.push({
      ruleName: t.ruleName,
      kind: t.kind,
      matchedIds: t.matchedConstraintIds,
      bindings: t.bindings,
      durationMs: t.durationMs,
    })
  }
  return engine
}

let currentEngine = makeEngine()

app.post('/api/compile', async (req, res) => {
  const { source, hostCode } = req.body as { source?: string; hostCode?: string }
  if (!source) return res.status(400).json({ error: 'Missing "source" field' })

  let parseError: string | null = null
  currentEngine = makeEngine()

  try {
    if (hostCode && hostCode.trim()) {
      try {
        const fn = new Function(hostCode)
        const moduleDef = fn()
        if (moduleDef && typeof moduleDef === 'object') {
          currentEngine.registerHost(moduleDef)
        }
      } catch (err) {
        parseError = `Host module error: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    if (!parseError) {
      currentEngine.addRules(source)
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err)
  }

  res.json({
    parseError,
    store: parseError ? [] : currentEngine.store.snapshot(),
    rules: parseError ? [] : currentEngine.getRules().map(r => ({ name: r.name, kind: r.kind })),
    warnings: (currentEngine.getWarnings() ?? []).map((w: unknown) => ({
      message: typeof w === 'string' ? w : (w as { message?: string }).message ?? String(w),
    })),
    trace: getTrace(currentEngine),
  })
})

app.post('/api/assert', async (req, res) => {
  const { name, args } = req.body as { name?: string; args?: unknown[] }
  if (!name) return res.status(400).json({ error: 'Missing "name" field' })

  const trace = getTrace(currentEngine)
  trace.length = 0
  try {
    await currentEngine.assert(name, args ?? [])
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }

  res.json({ store: currentEngine.store.snapshot(), trace })
})

app.post('/api/clear', async (_req, res) => {
  currentEngine = makeEngine()
  res.json({ store: [], trace: [] })
})

app.get('/api/examples', (_req, res) => {
  res.json([
    {
      id: 'propagate',
      name: 'Propagation',
      source: `constraints number/1, even/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n`,
      hostCode: '',
    },
    {
      id: 'banking',
      name: 'Banking',
      source: `constraints account/2, transaction/1, loan/2;\nfunctions balance/2, eligible/1, overdrawn/1, interest/2;\nactions log/1;\nimport host builtins;\n\nloan(X, A) <=> lt(A, 0) | loan(X, 0);\naccount(X, B) <=> gte(B, 0) | !log("Account OK"), account(X, B);\ntransaction(X) ==> add(X, 1);\n`,
      hostCode: `return {
  functions: {
    balance: (ctx, owner, bank) => ctx.store.lookup("account", 2).find((a) => a.args[0] === owner)?.args[1] ?? 0,
    eligible: (ctx, x) => false,
    overdrawn: (ctx, x) => false,
    interest: (ctx, x, y) => y,
  },
  actions: {
    log: (ctx) => {}
  }
}`,
    },
  ])
})

app.listen(PORT, () => {
  console.log(`Playground server listening on http://localhost:${PORT}`)
})
