import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHREngine, defineHostModule } from '../dist/index.js'

const fixtures = join(process.cwd(), 'test', 'fixtures')

test('finance fixture calls TypeScript functions in guard and body across five rules', async () => {
  const events = []
  const engine = new CHREngine()
  const host = defineHostModule({
    functions: {
      liquid: (_ctx, volume) => Number(volume) >= 1000,
      positive: (_ctx, price) => Number(price) > 0,
      withinRisk: (_ctx, risk) => Number(risk) <= 0.05,
      hedgeNeeded: (_ctx, volume) => Number(volume) >= 1500,
      bookable: (_ctx, price) => Number(price) > 0,
      bump: (_ctx, price) => Number(price) + 1
    },
    actions: {
      audit: ({ args }) => {
        events.push(args)
      }
    }
  })

  engine.registerHost(host)
  engine.addRules(readFileSync(join(fixtures, 'finance.chr'), 'utf8'))
  await engine.assert('order', ['AAPL', 100, 2000, 0.03])

  assert.equal(engine.store.lookup('booked', 4).length, 1)
  assert.equal(events.length, 5)
  assert.deepEqual(engine.store.lookup('booked', 4)[0].args, ['AAPL', 101, 2000, 0.03])
})

test('healthcare fixture calls TypeScript functions in guard and body across five rules', async () => {
  const notes = []
  const engine = new CHREngine()
  engine.registerHost(defineHostModule({
    functions: {
      urgent: (_ctx, severity, age) => Number(severity) >= 7 || Number(age) >= 65,
      hasWard: (_ctx, ward) => typeof ward === 'string' && ward.length > 0,
      treatable: (_ctx, severity) => Number(severity) >= 8,
      stable: (_ctx, severity) => Number(severity) <= 8,
      dischargeable: (_ctx, age) => Number(age) > 0,
      raiseSeverity: (_ctx, severity) => Number(severity) + 1
    },
    actions: {
      note: ({ args }) => {
        notes.push(args)
      }
    }
  }))

  engine.addRules(readFileSync(join(fixtures, 'healthcare.chr'), 'utf8'))
  await engine.assert('patient', ['P-1', 7, 44, 'ER'])

  assert.equal(engine.store.lookup('discharged', 4).length, 1)
  assert.equal(notes.length, 5)
  assert.deepEqual(engine.store.lookup('discharged', 4)[0].args, ['P-1', 8, 44, 'ER'])
})

test('logistics fixture calls TypeScript functions in guard and body across five rules', async () => {
  const moves = []
  const engine = new CHREngine()
  engine.registerHost(defineHostModule({
    functions: {
      routeReady: (_ctx, weight, priority) => Number(weight) > 0 && Number(priority) >= 1,
      weightOk: (_ctx, weight) => Number(weight) <= 200,
      dockReady: (_ctx, hub) => hub === 'NYC',
      destinationOpen: (_ctx, hub) => hub === 'NYC',
      completeWeight: (_ctx, weight) => Number(weight) > 0,
      incrementPriority: (_ctx, priority) => Number(priority) + 1
    },
    actions: {
      recordMove: ({ args }) => {
        moves.push(args)
      }
    }
  }))

  engine.addRules(readFileSync(join(fixtures, 'logistics.chr'), 'utf8'))
  await engine.assert('shipment', ['PKG-7', 120, 2, 'NYC'])

  assert.equal(engine.store.lookup('completed', 4).length, 1)
  assert.equal(moves.length, 5)
  assert.deepEqual(engine.store.lookup('completed', 4)[0].args, ['PKG-7', 120, 3, 'NYC'])
})

test('education fixture calls TypeScript functions in guard and body across five rules', async () => {
  const grades = []
  const engine = new CHREngine()
  engine.registerHost(defineHostModule({
    functions: {
      onTime: (_ctx, daysLeft) => Number(daysLeft) >= 0,
      wordCountOk: (_ctx, words, max) => Number(words) <= Number(max),
      passScore: (_ctx, score) => Number(score) >= 50,
      reviewReady: (_ctx, daysLeft) => Number(daysLeft) <= 7,
      publishable: (_ctx, score) => Number(score) >= 50,
      addBonus: (_ctx, score) => Number(score) + 5
    },
    actions: {
      logGrade: ({ args }) => {
        grades.push(args)
      }
    }
  }))

  engine.addRules(readFileSync(join(fixtures, 'education.chr'), 'utf8'))
  await engine.assert('submission', ['S-1', 1800, 3, 60])

  assert.equal(engine.store.lookup('archived', 4).length, 1)
  assert.equal(grades.length, 5)
  assert.deepEqual(engine.store.lookup('archived', 4)[0].args, ['S-1', 1800, 3, 65])
})

test('cybersecurity fixture calls TypeScript functions in guard and body across five rules', async () => {
  const alerts = []
  const engine = new CHREngine()
  engine.registerHost(defineHostModule({
    functions: {
      suspicious: (_ctx, severity, source) => Number(severity) >= 7 || source === 'external',
      severityUp: (_ctx, severity) => Number(severity) + 1,
      blockable: (_ctx, zone) => zone === 'east' || zone === 'west',
      remediable: (_ctx, severity) => Number(severity) >= 8,
      closable: (_ctx, severity) => Number(severity) >= 8,
      sourceKnown: (_ctx, source) => typeof source === 'string' && source.length > 0
    },
    actions: {
      logAlert: ({ args }) => {
        alerts.push(args)
      }
    }
  }))

  engine.addRules(readFileSync(join(fixtures, 'cybersecurity.chr'), 'utf8'))
  await engine.assert('alert', ['srv-01', 7, 'external', 'east'])

  assert.equal(engine.store.lookup('closed', 4).length, 1)
  assert.equal(alerts.length, 5)
  assert.deepEqual(engine.store.lookup('closed', 4)[0].args, ['srv-01', 8, 'external', 'east'])
})