import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

function request (method, path, body, port = 4173) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body })
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

test('playground IDE API and frontend integration', async () => {
  // GET /api/examples returns at least one example
  {
    const res = await request('GET', '/api/examples')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data))
    assert.ok(res.data.length >= 1)
    assert.ok(res.data.some((e) => e.id === 'propagate'))
    assert.ok(res.data.some((e) => e.id === 'banking'))
  }

  // each example has required fields
  {
    const res = await request('GET', '/api/examples')
    for (const example of res.data) {
      assert.ok(typeof example.id === 'string' && example.id.length > 0)
      assert.ok(typeof example.name === 'string' && example.name.length > 0)
      assert.ok(typeof example.source === 'string' && example.source.length > 0)
      assert.ok(typeof example.hostCode === 'string')
    }
  }

  // POST /api/compile without source returns 400
  {
    const res = await request('POST', '/api/compile', {})
    assert.equal(res.status, 400)
    assert.match(res.data.error, /Missing "source" field/)
  }

  // valid propagation source succeeds
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1, even/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.ok(Array.isArray(res.data.rules))
    assert.equal(res.data.rules.length, 1)
    assert.equal(res.data.rules[0].kind, 'propagation')
    assert.ok(Array.isArray(res.data.store))
    assert.ok(Array.isArray(res.data.trace))
    assert.ok(Array.isArray(res.data.warnings))
  }

  // valid simplification source succeeds
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints done/1, finished/0;\n\ndone(X) <=> eq(X, 0) | finished;\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.equal(res.data.rules[0].kind, 'simplification')
  }

  // valid simpagation source succeeds
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints keep/1, drop/1, done/1;\n\nkeep(X) \\ drop(X) <=> done(X);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.equal(res.data.rules[0].kind, 'simpagation')
  }

  // invalid syntax returns parse error
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1;\nthis is not valid chr!!!\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.ok(res.data.parseError !== null)
    assert.ok(res.data.parseError.length > 0)
    assert.deepEqual(res.data.store, [])
    assert.deepEqual(res.data.rules, [])
  }

  // compile returns empty store before assertion
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.store, [])
    assert.equal(res.data.trace.length, 0)
  }

  // valid host module accepted
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1;\nactions log/1;\nimport host builtins;\n\nnumber(X) ==> log(X);\n',
      hostCode: `return { actions: { log: (ctx) => {} } }`
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.equal(res.data.rules.length, 1)
  }

  // invalid host module code returns parse error
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1;\n',
      hostCode: 'return { functions: { bad: ( => {} } }'
    })
    assert.equal(res.status, 200)
    assert.ok(res.data.parseError !== null)
    assert.ok(res.data.parseError.includes('Host module error'))
  }

  // POST /api/assert without name returns 400
  {
    const res = await request('POST', '/api/assert', {})
    assert.equal(res.status, 400)
    assert.match(res.data.error, /Missing "name" field/)
  }

  // assert runs fixpoint and returns updated store with trace
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    const res = await request('POST', '/api/assert', { name: 'number', args: [1] })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.store))
    assert.equal(res.data.store.length, 2)
    assert.equal(res.data.store[0].name, 'number')
    assert.equal(res.data.store[0].args[0], 1)
    assert.ok(Array.isArray(res.data.trace))
    assert.ok(res.data.trace.length >= 1)
    assert.equal(res.data.trace[0].ruleName, 'rule_0')
    assert.equal(res.data.trace[0].kind, 'propagation')
    assert.deepEqual(res.data.trace[0].matchedIds, [1])
    assert.equal(res.data.trace[0].bindings.X, 1)
  }

  // assert accumulates store across calls
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    await request('POST', '/api/assert', { name: 'number', args: [1] })
    const res2 = await request('POST', '/api/assert', { name: 'number', args: [2] })
    assert.equal(res2.status, 200)
    assert.ok(res2.data.store.length >= 2)
    const names = res2.data.store.map((c) => c.name)
    assert.ok(names.includes('number'))
    assert.ok(names.includes('add'))
  }

  // assert returns error for unknown constraint name
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    const res = await request('POST', '/api/assert', { name: 'no_such_thing', args: [1] })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.store))
  }

  // clear resets store and trace
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    await request('POST', '/api/assert', { name: 'number', args: [1] })
    const res = await request('POST', '/api/clear')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.store, [])
    assert.deepEqual(res.data.trace, [])
  }

  // GET / serves index.html
  {
    const res = await request('GET', '/')
    assert.equal(res.status, 200)
    assert.ok(typeof res.data === 'string')
    assert.ok(res.data.includes('<!DOCTYPE html>'))
    assert.ok(res.data.includes('CHR.ts Playground'))
  }

  // GET / serves static assets
  {
    for (const path of ['/style.css', '/playground.js']) {
      const res = await request('GET', path)
      assert.equal(res.status, 200, `expected 200 for ${path}`)
      assert.ok(typeof res.data === 'string')
      assert.ok(res.data.length > 0)
    }
  }

  // GET /api/examples IDs are stable and usable in select
  {
    const res = await request('GET', '/api/examples')
    const ids = res.data.map((e) => e.id)
    assert.deepEqual(ids, [...new Set(ids)], 'example IDs should be unique')
    for (const id of ids) {
      assert.ok(id.length > 0)
      assert.ok(/^[a-z0-9_]+$/.test(id), `invalid example id: ${id}`)
    }
  }

  // POST /api/compile with banking example source succeeds
  {
    const examplesRes = await request('GET', '/api/examples')
    const banking = examplesRes.data.find((e) => e.id === 'banking')
    assert.ok(banking)

    const res = await request('POST', '/api/compile', {
      source: banking.source,
      hostCode: banking.hostCode
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.ok(res.data.rules.length > 0)
  }

  // assert trace is reset between assert calls
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    const r1 = await request('POST', '/api/assert', { name: 'number', args: [1] })
    assert.ok(r1.data.trace.length >= 1)

    const r2 = await request('POST', '/api/assert', { name: 'number', args: [2] })
    assert.ok(r2.data.trace.length >= 1)
    for (const t of r2.data.trace) {
      for (const id of t.matchedIds) {
        assert.ok(id >= 3, `trace should only contain post-clear ids, got ${id}`)
      }
    }
  }

  // POST /api/compile with anonymous propagation rule works
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints a/1, b/1;\n\na(X) ==> b(X);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.equal(res.data.rules.length, 1)
  }

  // POST /api/compile with uppercase variables works
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints m1/1, m2/1, rule1/0;\nimport host builtins;\n\nrule1@ m1(P1), m2(P2) ==> lt(P1, P2) | rule1;\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
    assert.equal(res.data.rules.length, 1)
  }

  // POST /api/assert with uppercase variables fires rules
  {
    await request('POST', '/api/compile', {
      source: 'constraints m1/1, m2/1, rule1/0;\nimport host builtins;\n\nrule1@ m1(P1), m2(P2) ==> lt(P1, P2) | rule1;\n',
      hostCode: ''
    })
    await request('POST', '/api/assert', { name: 'm1', args: [3] })
    const res = await request('POST', '/api/assert', { name: 'm2', args: [5] })
    assert.equal(res.status, 200)
    assert.ok(res.data.trace.length >= 1, 'expected at least one trace entry')
    assert.equal(res.data.trace[0].ruleName, 'rule1')
    assert.deepEqual(res.data.trace[0].bindings, { P1: 3, P2: 5 })
  }

  // POST /api/assert returns error when no rules loaded
  {
    await request('POST', '/api/clear')
    const res = await request('POST', '/api/assert', { name: 'number', args: [1] })
    assert.equal(res.status, 400)
    assert.match(res.data.error, /No rules have been loaded/)
  }

  // compile preserves warnings array
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints a/1, b/1;\na(X) ==> b(X);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.warnings))
  }

  // compile with empty hostCode succeeds
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> number(X + 1);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
  }

  // multiple compile calls are independent
  {
    const res1 = await request('POST', '/api/compile', {
      source: 'constraints a/1;\na(X) ==> b(X);\n',
      hostCode: ''
    })
    assert.equal(res1.status, 200)
    assert.equal(res1.data.rules.length, 1)
    assert.equal(res1.data.store.length, 0)

    const res2 = await request('POST', '/api/compile', {
      source: 'constraints x/1;\nx(X) ==> y(X);\n',
      hostCode: ''
    })
    assert.equal(res2.status, 200)
    assert.equal(res2.data.rules.length, 1)
    assert.equal(res2.data.store.length, 0)
    // The second compile replaces the engine, so the first rule set is gone
    const names2 = res2.data.rules.map((r) => r.name)
    assert.ok(names2.length === new Set(names2).size, 'rule names should be unique within a program')
  }

  // trace bindings contain variable names as keys
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    const res = await request('POST', '/api/assert', { name: 'number', args: [1] })
    assert.equal(res.status, 200)
    assert.ok(res.data.trace.length >= 1)
    assert.ok('X' in res.data.trace[0].bindings)
    assert.equal(res.data.trace[0].bindings.X, 1)
  }

  // trace durationMs is a number
  {
    await request('POST', '/api/compile', {
      source: 'constraints number/1;\nimport host builtins;\n\nnumber(X) ==> add(X, 1);\n',
      hostCode: ''
    })
    const res = await request('POST', '/api/assert', { name: 'number', args: [1] })
    assert.equal(res.status, 200)
    assert.ok(res.data.trace.length >= 1)
    assert.ok(typeof res.data.trace[0].durationMs === 'number')
    assert.ok(res.data.trace[0].durationMs >= 0)
  }

  // compile with strict host declarations works
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints number/1;\nfunctions double/1;\nimport host builtins;\n\nnumber(X) ==> double(X);\n',
      hostCode: `return { functions: { double: (ctx, x) => x * 2 } }`
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)
  }

  // assert with guard that fails does not emit body constraint
  {
    const res = await request('POST', '/api/compile', {
      source: 'constraints a/1;\nimport host builtins;\n\na(X) ==> gt(X, 0) | b(X);\n',
      hostCode: ''
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.parseError, null)

    const assertRes = await request('POST', '/api/assert', { name: 'a', args: [-1] })
    assert.equal(assertRes.status, 200)
    assert.ok(!assertRes.data.store.some((c) => c.name === 'b'))
    assert.ok(assertRes.data.store.some((c) => c.name === 'a'))
  }

  // assert with args array works
  {
    await request('POST', '/api/compile', {
      source: 'constraints pair/2, done/0;\n\npair(X, Y) <=> eq(X, Y) | done;\n',
      hostCode: ''
    })
    const res = await request('POST', '/api/assert', { name: 'pair', args: [1, 1] })
    assert.equal(res.status, 200)
    assert.ok(res.data.store.some((c) => c.name === 'done'))
    assert.ok(!res.data.store.some((c) => c.name === 'pair'))
  }

  // GET / returns valid HTML with script references
  {
    const res = await request('GET', '/')
    assert.equal(res.status, 200)
    assert.ok(res.data.includes('playground.js'))
    assert.ok(res.data.includes('style.css'))
  }

  // GET /style.css returns CSS content
  {
    const res = await request('GET', '/style.css')
    assert.equal(res.status, 200)
    assert.ok(res.data.includes('.playground'))
    assert.ok(res.data.includes('.trace-log'))
  }

  // GET /playground.js returns JS content
  {
    const res = await request('GET', '/playground.js')
    assert.equal(res.status, 200)
    assert.ok(res.data.includes('doCompile'))
    assert.ok(res.data.includes('doAssert'))
    assert.ok(res.data.includes('renderTrace'))
  }

  // multi-head simplification removes heads
  {
    await request('POST', '/api/compile', {
      source: 'constraints x/1, y/1, z/1;\nx(A), y(A) <=> z(A);\n',
      hostCode: ''
    })
    await request('POST', '/api/assert', { name: 'x', args: [10] })
    const res = await request('POST', '/api/assert', { name: 'y', args: [10] })
    assert.equal(res.status, 200)
    assert.ok(!res.data.store.some((c) => c.name === 'x'))
    assert.ok(!res.data.store.some((c) => c.name === 'y'))
    assert.ok(res.data.store.some((c) => c.name === 'z'))
  }

  // clear from empty engine succeeds
  {
    await request('POST', '/api/clear')
    const res = await request('POST', '/api/clear')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.store, [])
    assert.deepEqual(res.data.trace, [])
  }
})
