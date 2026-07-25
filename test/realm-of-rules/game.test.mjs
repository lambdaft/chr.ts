import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHREngine, defineHostModule, ConstraintStore } from '../../dist/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RULES_SRC = readFileSync(join(__dirname, 'rules.chr'), 'utf8')

// ─── Host Module ─────────────────────────────────────────────────────────────

const realmHost = defineHostModule({
  functions: {
    goldProd: (_ctx, lvl) => Number(lvl) * 5 + 2,
    foodProd: (_ctx, lvl) => Number(lvl) * 3 + 1,
    woodProd: (_ctx, lvl) => Number(lvl) * 4,
    stoneProd: (_ctx, lvl) => Number(lvl) * 2,
    foodConsumption: (_ctx, pop) => Math.max(1, Math.floor(Number(pop) / 2)),
    popGrowth: (_ctx, hap, lvl) => {
      const h = Number(hap); const l = Number(lvl)
      return h > 70 ? Math.floor(l * 1.5) : h > 40 ? l : Math.max(0, l - 1)
    },
    popCap: (_ctx, lvl) => Number(lvl) * 25 + 10,
    happinessCalc: (_ctx, hap, pop, food, _lvl) => {
      const h = Number(hap); const p = Number(pop); const f = Number(food)
      let delta = 0
      if (f > p) delta += 5
      else if (f < p) delta -= 3
      return Math.max(0, Math.min(100, h + delta))
    },
    combatPower: (_ctx, _unit, count, xp) => Number(count) * Number(xp) * 2,
    canAfford: (_ctx, _bld, g, w, s) => {
      const gold = Number(g); const wood = Number(w); const stone = Number(s)
      return gold >= 50 && wood >= 30 && stone >= 20
    },
    cannotAfford: (_ctx, _bld, g, w, s) => {
      const gold = Number(g); const wood = Number(w); const stone = Number(s)
      return gold < 50 || wood < 30 || stone < 20
    },
    constructionCost: (_ctx, bld, idx) => {
      const costs = { farm: [30, 20, 10], mine: [40, 15, 25], lumber_mill: [20, 30, 15], quarry: [35, 10, 30], wall: [50, 40, 30], barracks: [80, 50, 40], market: [60, 30, 20], port: [100, 60, 50], temple: [120, 40, 60], library: [90, 50, 30], tavern: [40, 25, 15], tower: [150, 80, 100] }
      return costs[bld]?.[Number(idx)] ?? 999
    },
    buildTime: (_ctx, _lvl, _bld) => 10,
    upgradeCost: (_ctx, bld, lvl) => {
      const base = { farm: 30, mine: 40, lumber_mill: 20, quarry: 35, wall: 50, barracks: 80, market: 60, port: 100, temple: 120, library: 90, tavern: 40, tower: 150 }
      return (base[bld] ?? 50) * Number(lvl) + 20
    },
    monsterReward: (_ctx, mp) => Number(mp) * 3 + 50,
    tradeValue: (_ctx, lvl, _rel, _bonus) => Number(lvl) * 8,
    researchCost: (_ctx, _field) => 200,
    weatherChance: (_ctx, _w) => {
      const r = Math.random()
      return r < 0.3 ? 'rain' : r < 0.6 ? 'clear' : 'storm'
    },
    healingAmt: (_ctx, hap) => Math.max(1, Math.floor(Number(hap) / 20))
  },

  actions: {
    log: (_ctx) => { /* logging is handled by the test collecting log messages */ },
    spawnArmy: (ctx) => {
      const [type, count, xp] = ctx.args.map(a => typeof a === 'string' ? a : Number(a))
      const existing = [...ctx.store.lookup('army', 3)].find(r => r.args[0] === type)
      if (existing) ctx.store.remove(existing.id)
      ctx.store.add('army', [type, count, xp])
    },
    giveGold: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('gold', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('gold', [current + amount])
      }
    },
    giveFood: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('food', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('food', [current + amount])
      }
    },
    giveWood: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('wood', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('wood', [current + amount])
      }
    },
    giveStone: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('stone', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('stone', [current + amount])
      }
    },
    giveMana: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('mana', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('mana', [current + amount])
      }
    },
    boostArmy: (ctx) => {
      const [type, xpBoost] = ctx.args.map(a => typeof a === 'string' ? a : Number(a))
      const existing = [...ctx.store.lookup('army', 3)].find(r => r.args[0] === type)
      if (existing) {
        const currentXp = Number(existing.args[2])
        ctx.store.remove(existing.id)
        ctx.store.add('army', [type, existing.args[1], currentXp + xpBoost])
      }
    },
    consumeGold: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('gold', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('gold', [Math.max(0, current - amount)])
      }
    },
    consumeFood: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('food', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('food', [Math.max(0, current - amount)])
      }
    },
    consumeWood: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('wood', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('wood', [Math.max(0, current - amount)])
      }
    },
    consumeStone: (ctx) => {
      const amount = Number(ctx.args[0])
      const records = ctx.store.lookup('stone', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('stone', [Math.max(0, current - amount)])
      }
    },
    modifyRelation: (ctx) => {
      const [faction, _rel, delta] = ctx.args.map(a => typeof a === 'string' ? a : Number(a))
      const existing = [...ctx.store.lookup('relation', 3)].find(r => r.args[0] === faction)
      if (existing) {
        const newVal = Math.max(-100, Math.min(100, Number(existing.args[2]) + Number(delta)))
        ctx.store.remove(existing.id)
        ctx.store.add('relation', [faction, existing.args[1], newVal])
      }
    },
    applyDamage: (ctx) => {
      const dmg = Number(ctx.args[0])
      const records = ctx.store.lookup('population', 1)
      if (records.length > 0) {
        const current = Number(records[0].args[0])
        ctx.store.remove(records[0].id)
        ctx.store.add('population', [Math.max(1, current - Math.floor(dmg))])
      }
    },
    setWeather: (ctx) => {
      const w = ctx.args[0]
      const existing = [...ctx.store.lookup('weather', 1)]
      for (const r of existing) ctx.store.remove(r.id)
      ctx.store.add('weather', [w])
    },
    setHappiness: (ctx) => {
      const h = Math.max(0, Math.min(100, Number(ctx.args[0])))
      const records = ctx.store.lookup('happiness', 1)
      if (records.length > 0) {
        ctx.store.remove(records[0].id)
        ctx.store.add('happiness', [h])
      }
    },
    unlockTech: (ctx) => {
      const tech = ctx.args[0]
      const existing = [...ctx.store.lookup('technology', 1)].find(r => r.args[0] === tech)
      if (!existing) ctx.store.add('technology', [tech])
    },
    addQuest: (ctx) => {
      const q = ctx.args[0]
      ctx.store.add('quest', [q, 1])
    },
    setBuilding: (ctx) => {
      const [name, level] = ctx.args
      const existing = [...ctx.store.lookup('has_building', 2)].find(r => r.args[0] === name)
      if (existing) ctx.store.remove(existing.id)
      ctx.store.add('has_building', [name, Number(level)])
    }
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createGameEngine (overrides = {}) {
  const engine = new CHREngine({ strictHostDeclarations: false, ...overrides })
  engine.registerHostModule('realm', realmHost)
  engine.registerBuiltins()

  const validation = engine.validate(RULES_SRC)
  if (!validation.ok) {
    const parts = []
    if (validation.parseError) parts.push(validation.parseError.message)
    for (const e of validation.executionErrors) parts.push(e.message)
    throw new Error(`Rule validation failed: ${parts.join(', ')}`)
  }

  engine.addRules(RULES_SRC)

  const warnings = engine.getWarnings()
  if (warnings.length > 0) {
    console.log('Rule warnings:', warnings)
  }

  assert.equal(engine.getState(), 'ready')
  return engine
}

function seedWorld (engine, overrides = {}) {
  const defaults = {
    turn: 1,
    gold: 100,
    food: 50,
    wood: 30,
    stone: 20,
    population: 20,
    happiness: 75,
    mana: 10,
    villageLevel: 1,
    weather: 'clear',
    season: 'spring'
  }

  const state = { ...defaults, ...overrides }

  engine.store.add('turn', [state.turn])
  engine.store.add('gold', [state.gold])
  engine.store.add('food', [state.food])
  engine.store.add('wood', [state.wood])
  engine.store.add('stone', [state.stone])
  engine.store.add('population', [state.population])
  engine.store.add('happiness', [state.happiness])
  engine.store.add('mana', [state.mana])
  engine.store.add('has_building', ['village', state.villageLevel])
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'villageLevel') continue
    const match = /^(\w+)Level$/.exec(key)
    if (match) {
      engine.store.add('has_building', [match[1], value])
    }
  }
  engine.store.add('weather', [state.weather])
  engine.store.add('season', [state.season])

  return state
}

function getResource (store, name) {
  const records = store.lookup(name, 1)
  return records.length > 0 ? Number(records[0].args[0]) : undefined
}

function getBuilding (store, name) {
  const records = store.lookup('has_building', 2)
  const b = records.find(r => r.args[0] === name)
  return b ? Number(b.args[1]) : undefined
}

function getArmy (store, type) {
  const records = store.lookup('army', 3)
  const a = records.find(r => r.args[0] === type)
  return a ? { count: Number(a.args[1]), xp: Number(a.args[2]) } : undefined
}

function assertAlive (store, name, arity, expectedCount) {
  const records = store.lookup(name, arity)
  assert.equal(records.length, expectedCount, `Expected ${name}/${arity} to have ${expectedCount} constraint(s), got ${records.length}`)
}

function assertAliveIds (store, name, arity, expectedIds) {
  const records = store.lookup(name, arity)
  const actualIds = records.map(r => r.id).sort()
  assert.deepEqual(actualIds, expectedIds.sort(), `Expected ${name}/${arity} ids to match`)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('realm: resource production over multiple turns', async () => {
  const engine = createGameEngine()
  seedWorld(engine)

  assert.equal(engine.getState(), 'ready')
  assert.ok(engine.store.functors().includes('turn/1'))

  // Turn 1
  await engine.assert('tick', [])
  assert.equal(getResource(engine.store, 'turn'), 2)
  assert.ok(getResource(engine.store, 'gold') > 100)
  assert.ok(getResource(engine.store, 'food') > 0)

  // Turn 2
  await engine.assert('tick', [])
  assert.equal(getResource(engine.store, 'turn'), 3)

  // Check gold grows consistently
  const gold1 = getResource(engine.store, 'gold')
  await engine.assert('tick', [])
  const gold2 = getResource(engine.store, 'gold')
  assert.ok(gold2 > gold1)
  assert.equal(engine.getState(), 'ready')
})

test('realm: building construction consumes resources', async () => {
  const engine = createGameEngine()
  seedWorld(engine, { gold: 200, wood: 100, stone: 80 })

  assert.ok(engine.store.has(engine.store.lookup('gold', 1)[0]?.id))

  await engine.assert('command', ['build', 'mine', 1])
  assert.ok(getBuilding(engine.store, 'mine') !== undefined)
  const goldAfter = getResource(engine.store, 'gold')
  assert.ok(goldAfter < 200, `gold ${goldAfter} should be less than 200`)

  // Verify building_progress was created and then consumed
  const progressRecords = engine.store.lookup('building_progress', 2)
  assert.equal(progressRecords.length, 0, 'building_progress should be consumed after build_done')
})

test('realm: building construction fails without resources', async () => {
  const engine = createGameEngine()
  seedWorld(engine, { gold: 10, food: 0, wood: 5, stone: 3 })

  await engine.assert('command', ['build', 'mine', 1])
  assert.equal(getBuilding(engine.store, 'mine'), undefined)

  // Gold should remain unchanged
  assert.equal(getResource(engine.store, 'gold'), 10)
})

test('realm: army training and combat', async () => {
  const engine = createGameEngine()
  seedWorld(engine, { gold: 500, population: 50, happiness: 70 })

  // Train soldiers
  await engine.assert('command', ['train', 'soldier', 10])
  let army = getArmy(engine.store, 'soldier')
  assert.ok(army)
  assert.equal(army.count, 10)
  assert.equal(army.xp, 1)

  // Scout reveals dragon based on population
  await engine.assert('command', ['scout', '', 0])
  const monsters = engine.store.lookup('monster', 2)
  assert.equal(monsters.length, 1)

  // Verify monster power scales with population
  const monsterPower = Number(monsters[0].args[1])
  assert.ok(monsterPower >= 20, 'monster power should scale with population')
})

test('realm: happiness affects population growth', async () => {
  const engine = createGameEngine()
  seedWorld(engine, { food: 200, population: 20, happiness: 90, villageLevel: 2 })

  const popBefore = getResource(engine.store, 'population')
  await engine.assert('tick', [])
  const popAfter = getResource(engine.store, 'population')
  assert.ok(popAfter >= popBefore, 'population should not decrease with high happiness')

  // Verify calc_pop constraint was processed
  const calcRecords = engine.store.lookup('calc_pop', 1)
  assert.equal(calcRecords.length, 0, 'calc_pop should be consumed after processing')
})

test('realm: research and technology unlocks', async () => {
  const engine = createGameEngine()
  seedWorld(engine, { gold: 500, population: 30, happiness: 60, libraryLevel: 1 })

  // Override researchCost for deterministic test
  let researchCost = 200
  if (realmHost.functions) realmHost.functions.researchCost = (_ctx, _field) => researchCost

  // Start research - gold is consumed
  await engine.assert('command', ['research', 'agriculture', 0])
  const goldAfter = getResource(engine.store, 'gold')
  assert.ok(goldAfter < 500, 'research should consume gold')

  // Research progresses on tick
  await engine.assert('tick', [])
  await engine.assert('tick', [])
  await engine.assert('tick', [])

  // Eventually technology exists
  const techs = engine.store.lookup('technology', 1)
  assert.ok(
    techs.find(r => r.args[0] === 'agriculture'),
    'agriculture technology should be unlocked after enough ticks'
  )
})

test('realm: diplomacy builds relations', async () => {
  const engine = createGameEngine({ hostFunctionTimeout: 2000 })
  seedWorld(engine)
  engine.store.add('relation', ['elves', 'neutral', 20])

  // Improve relations
  await engine.assert('command', ['diplomacy', 'elves', 0])

  const rels = engine.store.lookup('relation', 3)
  const elvesRel = rels.find(r => r.args[0] === 'elves')
  assert.ok(elvesRel, 'elves relation should exist')
  assert.ok(Number(elvesRel.args[2]) > 20, 'relation value should increase after diplomacy')
})

test('realm: full game scenario', async () => {
  const engine = createGameEngine({ hostFunctionTimeout: 5000 })
  seedWorld(engine, { gold: 200, food: 80, wood: 60, stone: 40, population: 15, happiness: 65, mana: 5 })

  // Advance 5 turns
  for (let i = 0; i < 5; i++) await engine.assert('tick', [])

  assert.equal(getResource(engine.store, 'turn'), 6)
  assert.ok(getResource(engine.store, 'gold') > 200)

  // Build a farm
  const g1 = getResource(engine.store, 'gold')
  await engine.assert('command', ['build', 'farm', 1])
  const g2 = getResource(engine.store, 'gold')
  assert.ok(g2 < g1, 'building a farm should cost gold')

  // Verify building exists
  assert.ok(getBuilding(engine.store, 'farm') !== undefined, 'farm should be built')

  // Train soldiers
  await engine.assert('command', ['train', 'soldier', 5])
  const army = getArmy(engine.store, 'soldier')
  assert.ok(army)
  assert.equal(army.count, 5)

  // Status report (just verify it doesn't crash)
  await engine.assert('command', ['status', '', 0])

  // More turns
  for (let i = 0; i < 3; i++) await engine.assert('tick', [])

  const finalGold = getResource(engine.store, 'gold')
  assert.ok(finalGold >= 0, 'gold should never be negative')
  assert.equal(getResource(engine.store, 'turn'), 9)
})

test('realm: engine lifecycle and state transitions', async () => {
  const engine = new CHREngine()
  assert.equal(engine.getState(), 'empty')

  engine.registerHostModule('realm', realmHost)
  engine.registerBuiltins()
  engine.addRules(RULES_SRC)
  assert.equal(engine.getState(), 'ready')

  await engine.assert('tick', [])
  assert.equal(engine.getState(), 'ready', 'state should return to ready after fixpoint')

  engine.clear()
  assert.equal(engine.getState(), 'ready')
  assert.equal(engine.store.size(), 0)
  assert.equal(engine.store.invalid, false)
})

test('realm: store toString and functors reflect current state', async () => {
  const engine = createGameEngine()
  seedWorld(engine)

  const snapshot = engine.store.snapshot()
  assert.ok(snapshot.length > 0, 'store should have constraints after seeding')

  const functors = engine.store.functors()
  assert.ok(functors.includes('turn/1'))
  assert.ok(functors.includes('gold/1'))
  assert.ok(functors.includes('has_building/2'))

  const storeText = engine.store.toString()
  assert.ok(storeText.includes('turn('))
  assert.ok(storeText.includes('gold('))
})

test('realm: history tracks propagation rule firings', async () => {
  const engine = createGameEngine()
  seedWorld(engine)

  await engine.assert('tick', [])

  const history = engine.history.snapshot()
  assert.ok(Object.keys(history).length > 0, 'history should record rule firings')

  // Verify we can check if a rule fired using notIn
  const ruleNames = Object.keys(history)
  for (const name of ruleNames) {
    const ids = history[name]
    assert.ok(engine.history.notIn(name, [999999]), 'notIn should return true for nonexistent ids')
  }
})

test('realm: allAlive verifies batch constraint existence', async () => {
  const engine = createGameEngine()
  seedWorld(engine)

  const turnRecords = engine.store.lookup('turn', 1)
  const goldRecords = engine.store.lookup('gold', 1)

  assert.ok(turnRecords.length > 0 && goldRecords.length > 0)

  const idsToCheck = [turnRecords[0].id, goldRecords[0].id]
  assert.ok(engine.store.allAlive(idsToCheck), 'allAlive should return true for existing ids')

  engine.store.remove(turnRecords[0].id)
  assert.ok(!engine.store.allAlive(idsToCheck), 'allAlive should return false after removal')
})

test('realm: constraint args defensive copy', async () => {
  const engine = createGameEngine()
  seedWorld(engine)

  const turnRecords = engine.store.lookup('turn', 1)
  const args = engine.store.args(turnRecords[0].id)
  args.push(999)

  assert.equal(turnRecords[0].args.length, 1, 'internal args should not be mutated by store.args()')
})

test('realm: store invalidation clears state and preserves flag', async () => {
  const engine = createGameEngine()
  seedWorld(engine)

  assert.equal(engine.store.invalid, false)
  assert.ok(engine.store.size() > 0)

  engine.store.invalidate()
  assert.equal(engine.store.size(), 0)
  assert.equal(engine.store.invalid, true)
  assert.deepEqual(engine.store.functors(), [])

  // Clear resets the invalid flag
  engine.store.clear()
  assert.equal(engine.store.invalid, false)
})
