(async function () {
  const API = '/api'

  const sourceEditor = CodeMirror.fromTextArea(document.getElementById('source-editor'), {
      lineNumbers: true,
      matchBrackets: true,
      styleActiveLine: true,
      mode: 'chr',
      theme: 'monokai',
      indentUnit: 2,
      tabSize: 2,
    })

    const hostEditor = document.getElementById('host-editor')
    const compileBtn = document.getElementById('compile-btn')
    const autocompileToggle = document.getElementById('autocompile')
    const addBtn = document.getElementById('add-btn')
    const constraintInput = document.getElementById('constraint-input')
    const errorBox = document.getElementById('error-box')
  const storeBody = document.getElementById('store-body')
  const clearBtn = document.getElementById('clear-btn')
  const traceLog = document.getElementById('trace-log')
  const clearTraceBtn = document.getElementById('clear-trace-btn')
  const examplesSelect = document.getElementById('examples')

  let compileTimer = null

  function setError(msg) {
    errorBox.textContent = msg
    errorBox.classList.remove('hidden')
  }

  function clearError() {
    errorBox.textContent = ''
    errorBox.classList.add('hidden')
  }

  function renderStore(store = []) {
    storeBody.innerHTML = ''
    if (store.length === 0) {
      storeBody.innerHTML = '<tr><td></td><td>(empty)</td></tr>'
      return
    }
    store.forEach((c) => {
      const tr = document.createElement('tr')
      tr.dataset.id = c.id
      const tdId = document.createElement('td')
      tdId.textContent = c.id
      const tdStr = document.createElement('td')
      tdStr.innerHTML = `<code>${escapeHtml(`${c.name}(${c.args.join(',')})`)}</code>`
      const tdActions = document.createElement('td')
      const rm = document.createElement('button')
      rm.className = 'remove-btn'
      rm.textContent = '×'
      rm.title = 'Remove'
      rm.addEventListener('click', () => removeConstraint(c.id))
      tdActions.appendChild(rm)
      tr.append(tdId, tdStr, tdActions)
      storeBody.appendChild(tr)
    })
  }

  function renderTrace(trace = []) {
    traceLog.innerHTML = ''
    if (trace.length === 0) {
      traceLog.innerHTML = '<div class="trace-empty">No rule firings yet</div>'
      return
    }
    trace.forEach((t, idx) => {
      const row = document.createElement('div')
      row.className = 'trace-row'
      const ms = t.durationMs != null ? ` (${t.durationMs.toFixed(1)}ms)` : ''
      const bindings = Object.keys(t.bindings || {}).length > 0
        ? ' ' + Object.entries(t.bindings).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : ''
      const arrow = t.kind === 'propagation' ? '⇒' : t.kind === 'simplification' ? '⇔' : '\\⇔'
      row.innerHTML = `<span class="trace-idx">#${idx + 1}</span> <span class="trace-kind kind-${t.kind}">${arrow}</span> <span class="trace-name">${escapeHtml(t.ruleName)}</span><span class="trace-bindings">${escapeHtml(bindings)}</span><span class="trace-ms">${ms}</span>`
      traceLog.appendChild(row)
    })
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  async function removeConstraint(id) {
    const res = await fetch(`${API}/clear`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to clear store')
      return
    }
    // /clear re-creates engine; we also need to recompile current source
    await doCompile()
  }

  async function doCompile(assertions = []) {
    clearError()
    const source = sourceEditor.getValue()
    const hostCode = hostEditor.value.trim()
    if (!source.trim()) {
      renderStore([])
      return
    }
    const res = await fetch(`${API}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, hostCode }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Compiler error')
      return
    }
    const data = await res.json()
    if (data.parseError) {
      setError(data.parseError)
    }
    if (data.warnings && data.warnings.length > 0) {
      console.warn('Warnings:', data.warnings)
    }
    renderStore(data.store || [])
    renderTrace(data.trace || [])
  }

  async function doAssert() {
    const raw = constraintInput.value.trim()
    if (!raw) return
    clearError()
    const { name, args } = parseConstraint(raw)
    if (!name) {
      setError('Could not parse constraint. Expected: functor(arg1, arg2, ...)')
      return
    }
    constraintInput.value = ''
    const res = await fetch(`${API}/assert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Assert failed')
      return
    }
    const data = await res.json()
    renderStore(data.store || [])
    renderTrace(data.trace || [])
  }

  function parseConstraint(str) {
    str = str.trim()
    if (!str) return { name: '', args: [] }
    const parenIdx = str.indexOf('(')
    if (parenIdx === -1) return { name: str, args: [] }
    const name = str.slice(0, parenIdx).trim()
    const inner = str.slice(parenIdx + 1, str.lastIndexOf(')'))
    const args = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        if (s === 'true') return true
        if (s === 'false') return false
        if (s === 'null') return null
        const n = Number(s)
        if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(s)) return n
        // remove quotes
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          return s.slice(1, -1)
        }
        return s
      })
    return { name, args }
  }

  // Autocompile on source change
  sourceEditor.on('change', () => {
    if (!autocompileToggle.checked) return
    clearTimeout(compileTimer)
    compileTimer = setTimeout(doCompile, 400)
  })

  compileBtn.addEventListener('click', () => doCompile())

  addBtn.addEventListener('click', doAssert)
  constraintInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAssert()
  })

  clearBtn.addEventListener('click', async () => {
    clearError()
    const res = await fetch(`${API}/clear`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to clear')
      return
    }
    renderStore([])
    renderTrace([])
    await doCompile()
  })

  clearTraceBtn.addEventListener('click', () => renderTrace([]))

  // Examples
  async function loadExample(name) {
    if (!name) return
    clearError()
    const res = await fetch(`${API}/examples`)
    if (!res.ok) return
    const examples = await res.json()
    const match = examples.find((e) => e.id === name)
    if (match) {
      if (match.source) {
        sourceEditor.setValue(match.source)
      }
      if (match.hostCode !== undefined) {
        hostEditor.value = match.hostCode
      }
      await doCompile()
    }
  }
  examplesSelect.addEventListener('change', (e) => loadExample(e.target.value))

  // Initial compile
  await doCompile()
})()

