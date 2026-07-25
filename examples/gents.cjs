const fs = require('fs');
const path = require('path');

const baseDir = '/home/pc/mew/CHR.ts/examples';

function tsRunner(ex) {
  const funcDecls = ex.functions.map(f => `      ${f}: (ctx, ...args) => 0`).join(',\n');
  const assertLines = ex.asserts.map(a => 
    `    { name: '${a.name}', args: [${a.args.map(v => typeof v === 'string' ? "'" + v + "'" : v).join(', ')}] }`
  ).join(',\n');
  
  return `import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '..', '${ex.name}.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
${funcDecls}
    },
    actions: {
      log: ({ args }) => {
        console.log('[${ex.name}]', args[0] ?? '')
      }
    }
  })

  engine.registerBuiltins()
  engine.registerHost(host)
  engine.addRules(source)

  await engine.assertMany([
${assertLines}
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
`;
}

const allExamples = [
  {
    name: 'library',
    functions: ['calc_fine', 'is_active', 'days_overdue', 'overdue', 'can_borrow', 'new_book', 'today'],
    asserts: [
      { name: 'book', args: ['b1', 'The Hobbit', 'available'] },
      { name: 'member', args: ['m1', 'active'] },
      { name: 'book', args: ['b2', 'Dune', 'available'] },
      { name: 'member', args: ['m2', 'active'] },
    ]
  },
  {
    name: 'banking',
    functions: ['balance', 'overdrawn', 'compound', 'penalty', 'eligible'],
    asserts: [
      { name: 'customer', args: ['c1', 'standard'] },
      { name: 'account', args: ['a1', 'Alice', 1500] },
      { name: 'customer', args: ['c2', 'VIP'] },
      { name: 'account', args: ['a2', 'Bob', 100] },
    ]
  },
  {
    name: 'healthcare',
    functions: ['urgent', 'follow_up', 'duration', 'is_valid', 'refill'],
    asserts: [
      { name: 'patient', args: ['p1', 'Alice', 34, 'fever'] },
      { name: 'appointment', args: ['p1', 'Dr. Smith', '2026-07-25', 10] },
      { name: 'patient', args: ['p2', 'Bob', 72, 'cardiac'] },
      { name: 'prescription', args: ['p2', 'Aspirin', 30] },
    ]
  },
  {
    name: 'ecommerce',
    functions: ['total', 'apply_disc', 'is_valid', 'in_stock', 'tax'],
    asserts: [
      { name: 'user', args: ['u1', 'alice@mail.com', 'standard'] },
      { name: 'product', args: ['p1', 'Laptop', 999, 50] },
      { name: 'user', args: ['u2', 'bob@mail.com', 'gold'] },
      { name: 'cart', args: ['c1', 'u1', ['p1']] },
    ]
  },
  {
    name: 'education',
    functions: ['gpa', 'passes', 'eligible', 'satisfied', 'weighted'],
    asserts: [
      { name: 'student', args: ['s1', 'Alice', 'CS'] },
      { name: 'course', args: ['c1', 'CS101', 'Intro', 3] },
      { name: 'student', args: ['s2', 'Bob', 'Math'] },
      { name: 'enrollment', args: ['s1', 'CS101', 'enrolled'] },
    ]
  },
  {
    name: 'calendar',
    functions: ['is_busy', 'overlap', 'duration', 'valid', 'notify'],
    asserts: [
      { name: 'event', args: ['e1', 'Conference', '2026-08-01', '2026-08-03', ['alice', 'bob']] },
      { name: 'reminder', args: ['e1', '2026-07-30', 'email'] },
      { name: 'meeting', args: ['m1', ['alice'], '2026-08-01', '2026-08-02'] },
      { name: 'reminder', args: ['m1', '2026-07-31', 'sms'] },
    ]
  },
  {
    name: 'inventory',
    functions: ['stock_level', 'reorder', 'is_urgent', 'ship_cost', 'priority'],
    asserts: [
      { name: 'product', args: ['p1', 'Widget', 'A', 50, 20] },
      { name: 'supplier', args: ['s1', 'FastCo'] },
      { name: 'product', args: ['p2', 'Gadget', 'B', 5, 10] },
      { name: 'shipment', args: ['s1', 'UPS', 'pending'] },
    ]
  },
  {
    name: 'gaming',
    functions: ['level', 'damage', 'heal', 'has_item', 'cast', 'count'],
    asserts: [
      { name: 'character', args: ['c1', 'Aragorn', 'Ranger', 100, 100] },
      { name: 'quest', args: ['q1', 'Destroy Ring', ['gold', 'sword'], 'active'] },
      { name: 'inventory', args: ['c1', ['sword', 'shield']] },
      { name: 'skill', args: ['c1', 'Swordsmanship', 5] },
    ]
  },
  {
    name: 'travel',
    functions: ['duration', 'is_available', 'price', 'bookable', 'duration_hours'],
    asserts: [
      { name: 'flight', args: ['f1', 'NYC', 'LON', 8, 20] },
      { name: 'hotel', args: ['h1', 'Grand', 10] },
      { name: 'booking', args: ['b1', 'f1', 'h1', 'pending'] },
      { name: 'passenger', args: ['p1', 'economy'] },
    ]
  },
  {
    name: 'smarthome',
    functions: ['is_on', 'temp_c', 'motion', 'trigger', 'status'],
    asserts: [
      { name: 'device', args: ['d1', 'light', 'on'] },
      { name: 'sensor', args: ['s1', 'temp', 25, 30] },
      { name: 'automation', args: ['a1', 'motion', true, 'turn_on'] },
      { name: 'alert', args: ['d1', 'info'] },
    ]
  },
  {
    name: 'finance',
    functions: ['value', 'risk', 'return_rate', 'diversify', 'yield_pct'],
    asserts: [
      { name: 'portfolio', args: ['pf1', 'Alice'] },
      { name: 'asset', args: ['a1', 'stock', 100, 50] },
      { name: 'portfolio', args: ['pf2', 'Bob'] },
      { name: 'investment', args: ['inv1', 'pf1', 5000] },
    ]
  },
  {
    name: 'hr',
    functions: ['tenure', 'eligible_for_leave', 'score', 'budget', 'headcount'],
    asserts: [
      { name: 'employee', args: ['e1', 'Alice', 'Engineering', 'SWE'] },
      { name: 'department', args: ['d1', 'Engineering'] },
      { name: 'leave', args: ['e1', '2026-08-01', '2026-08-05', 'vacation'] },
      { name: 'review', args: ['e1', 95, 'Great work'] },
    ]
  },
  {
    name: 'logistics',
    functions: ['distance', 'ETA', 'is_valid', 'cost', 'on_time'],
    asserts: [
      { name: 'package', args: ['pkg1', 'WarehouseA', 'StoreB', 10, 'pending'] },
      { name: 'route', args: ['r1', 'WarehouseA', 'StoreB', ['hub1']] },
      { name: 'shipment', args: ['s1', 'TRK001', 'pending'] },
      { name: 'carrier', args: ['c1', 'FastShip'] },
    ]
  },
  {
    name: 'weather',
    functions: ['temp_f', 'is_severe', 'humidity', 'wind_speed', 'uv_index'],
    asserts: [
      { name: 'station', args: ['ws1', 'Central', 40.7, -74.0, 10] },
      { name: 'alert', args: ['ws1', 'storm', 'warning'] },
      { name: 'advisory', args: ['ws1', 'heat', 'stay indoors'] },
      { name: 'forecast', args: ['ws1', '2026-07-26', 95, 72] },
    ]
  },
  {
    name: 'restaurant',
    functions: ['available', 'prep_time', 'total', 'rating', 'is_ready'],
    asserts: [
      { name: 'reservation', args: ['r1', 'Alice', '19:00', 4, 'confirmed'] },
      { name: 'table', args: ['t1', 4, 'available'] },
      { name: 'menu_item', args: ['m1', 'Pasta', 18, 'main'] },
      { name: 'order', args: ['o1', ['Pasta'], 18, 'pending'] },
    ]
  },
  {
    name: 'social',
    functions: ['popularity', 'is_following', 'unread', 'engagement', 'hashtag'],
    asserts: [
      { name: 'user', args: ['u1', 'Alice', '@alice', 500] },
      { name: 'post', args: ['p1', 'u1', 'Hello world!', 10] },
      { name: 'follow', args: ['u2', 'u1', '2026-01-01'] },
      { name: 'notification', args: ['u1', 'like', 'liked your post'] },
    ]
  },
  {
    name: 'iot',
    functions: ['is_online', 'measure', 'threshold', 'is_critical', 'calibrate'],
    asserts: [
      { name: 'device', args: ['d1', 'temp_sensor', 'online'] },
      { name: 'reading', args: ['d1', 'temperature', 37.5] },
      { name: 'config', args: ['d1', 'interval', 60] },
      { name: 'alert', args: ['d1', 'temperature', 'normal'] },
    ]
  },
  {
    name: 'supplychain',
    functions: ['inventory_level', 'lead_time', 'cost', 'is_urgent', 'quality'],
    asserts: [
      { name: 'product', args: ['pr1', 'Widget', 5, 'WarehouseA'] },
      { name: 'supplier', args: ['sup1', 'FastParts', 4.5] },
      { name: 'order', args: ['o1', 'pr1', 'reorder', 100] },
      { name: 'shipment', args: ['s1', 'pending'] },
    ]
  },
  {
    name: 'sports',
    functions: ['is_home', 'is_winning', 'is_draw', 'is_final', 'points'],
    asserts: [
      { name: 'team', args: ['t1', 'Lakers', 'basketball'] },
      { name: 'match', args: ['m1', 't1', 't2', [0, 0]] },
      { name: 'player', args: ['p1', 't1', 'forward'] },
      { name: 'score', args: ['m1', 'p1', 25] },
    ]
  },
  {
    name: 'music',
    functions: ['is_favorite', 'duration', 'genre', 'is_up_next', 'repeat'],
    asserts: [
      { name: 'song', args: ['s1', 'Bohemian Rhapsody', 'Queen', 354] },
      { name: 'playlist', args: ['pl1', 'Classics', 50] },
      { name: 'rating', args: ['r1', 's1', 5] },
      { name: 'queue', args: ['q1', 's1', 1] },
    ]
  }
];

allExamples.forEach(ex => {
  fs.writeFileSync(path.join(baseDir, ex.name, ex.name + '.ts'), tsRunner(ex));
});

console.log('Regenerated TS files');
