const fs = require('fs');
const path = require('path');

const baseDir = '/home/pc/mew/CHR.ts/examples';

function pkgJson(name) {
  return JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    scripts: { build: 'tsc', start: 'node dist/' + name + '.js' }
  }, null, 2);
}

function tsconfigJson() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      outDir: './dist',
      rootDir: '.'
    },
    include: ['*.ts']
  }, null, 2);
}

function tsRunner(ex) {
  return `import { CHREngine, defineHostModule } from '../../dist/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main (): Promise<void> {
  const engine = new CHREngine()
  const source = readFileSync(join(__dirname, '${ex.name}.chr'), 'utf8')

  const host = defineHostModule({
    functions: {
${ex.functions.map(f => '      ' + f + ': (ctx, ...args) => 0').join(',\n')}
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
${ex.asserts.map(a => '    { name: \'' + a.name + '\', args: [' + a.args.map(v => typeof v === 'string' ? '\'' + v + '\'' : v).join(', ') + '] }').join(',\n')}
  ])

  console.log(JSON.stringify(engine.snapshot(), null, 2))
}

void main()
`;
}

function chrFile(ex) {
  let out = 'constraints ' + ex.constraints.join(', ') + ';\n';
  out += 'functions ' + ex.functions.join(', ') + ';\n';
  out += 'actions ' + ex.actions.join(', ') + ';\n';
  out += 'import host builtins;\n\n';
  out += ex.rules.map((r, i) => (i+1) + ': ' + r).join('\n') + '\n';
  return out;
}

const allExamples = [
  {
    name: 'library',
    constraints: ['book/3', 'member/2', 'loan/3', 'hold/3', 'fine/2'],
    functions: ['calc_fine/2', 'is_active/1', 'days_overdue/2', 'overdue/1', 'can_borrow/2'],
    actions: ['log/1'],
    rules: [
      'r1 book(X, Title, available) ==> new_book(X, Title, "available"), log("Registered book: " + Title)',
      'r2 book(X, Title, available) \\ book(X, Title, available) <=> book(X, Title, "checked-out")',
      'r3 member(X, active) \\ member(X, active), hold(X, B, D) ==> loan(X, B, D)',
      'r4 loan(X, B, D) \\ loan(X, B, D) ==>, log("Returned loan for book " + B)',
      'r5 loan(X, B, D), fine(B, Amt) ==> fine(B, add(Amt, 1))',
      'r6 book(X, Title, available), member(X, active) ==> hold(X, Title, today()), log("Held available book")',
      'r7 fine(B, 0) \\ loan(X, B, D) ==>, fine(B, 0), log("Book returned, no fine")',
      'r8 hold(X, B, D), loan(X, B, D) \\ hold(X, B, D) <=> loan(X, B, D)',
      'r9 member(X, suspended) \\ member(X, suspended) <=> member(X, active)',
      'r10 fine(B, Amt) \\ fine(B, Amt) <=> fine(B, add(Amt, 1))',
      'r11 loan(X, B, D), days_overdue(D, N) \\ loan(X, B, D) ==>, loan(X, B, D)',
      'r12 book(X, Title, checked-out) \\ book(X, Title, checked-out) <=> book(X, Title, available)',
      'r13 member(X, M) \\ member(X, M) ==> member(X, "active")',
      'r14 fine(B, Amt) \\ fine(B, Amt) ==>, fine(B, 0), log("Fine cleared")',
      'r15 loan(X, B, D) \\ loan(X, B, D) <=> loan(X, B, today())',
      'r16 book(X, T, S), member(X, M) \\ book(X, T, S), member(X, M) ==>, hold(X, T, today())',
      'r17 hold(X, B, D) \\ hold(X, B, D), loan(X, B, D) ==>, log("Hold converted to loan")',
      'r18 fine(B, Amt) \\ fine(B, Amt) ==>, fine(B, sub(Amt, 1))',
      'r19 loan(X, B, D) \\ loan(X, B, D) ==>, loan(X, B, D), log("Loan renewed")',
      'r20 book(X, "none", S) \\ book(X, "none", S) <=> true',
    ],
    asserts: [
      { name: 'book', args: ['b1', 'The Hobbit', 'available'] },
      { name: 'member', args: ['m1', 'active'] },
      { name: 'book', args: ['b2', 'Dune', 'available'] },
      { name: 'member', args: ['m2', 'active'] },
    ]
  },
  {
    name: 'banking',
    constraints: ['account/3', 'transaction/3', 'alert/3', 'fee/2', 'loan/3', 'customer/2'],
    functions: ['balance/2', 'overdrawn/1', 'compound/3', 'penalty/2', 'eligible/2'],
    actions: ['log/1'],
    rules: [
      'r1 account(X, Owner, Bal) \\ account(X, Owner, Bal) <=> account(X, Owner, Bal)',
      'r2 account(X, Owner, Bal) | overdrawn(Bal) ==> fee(X, "overdraft")',
      'r3 transaction(X, T, "deposit") \\ account(X, Owner, Bal) ==>, account(X, Owner, add(Bal, 100))',
      'r4 transaction(X, T, "withdraw") \\ account(X, Owner, Bal) ==>, account(X, Owner, sub(Bal, 50))',
      'r5 fee(X, Reason) \\ fee(X, Reason) <=> fee(X, "waived"), log("Fee waived for " + X)',
      'r6 loan(X, Cust, Amt) \\ loan(X, Cust, Amt) ==>, loan(X, Cust, add(Amt, 1))',
      'r7 account(X, Owner, Bal), overdrawn(Bal) \\ account(X, Owner, Bal) ==> alert(X, "low balance")',
      'r8 alert(X, Msg) \\ alert(X, Msg) ==>, log("Alert: " + Msg)',
      'r9 customer(X, VIP) \\ customer(X, VIP) ==> account(X, VIP, 100000)',
      'r10 transaction(X, T, "deposit") \\ transaction(X, T, "deposit") ==>, transaction(X, T, "completed")',
      'r11 loan(X, Cust, Amt) \\ loan(X, Cust, Amt) <=> loan(X, Cust, 0)',
      'r12 account(X, O, Bal) \\ account(X, O, Bal) ==>, account(X, O, Bal)',
      'r13 fee(X, "overdraft") \\ fee(X, "overdraft") ==>, fee(X, 0)',
      'r14 alert(X, M), transaction(X, T, "large") \\ alert(X, M) ==>, log("Large transaction alert")',
      'r15 customer(X, standard) \\ customer(X, standard) ==>, customer(X, "normal")',
      'r16 account(X, O, Bal) | gte(Bal, 1000) ==>, account(X, O, Bal), log("High balance account")',
      'r17 loan(X, C, A) | lt(A, 500) \\ loan(X, C, A) ==>, loan(X, C, 500)',
      'r18 transaction(X, T, "transfer") \\ transaction(X, T, "transfer") ==>, transaction(X, T, "done")',
      'r19 alert(X, "low") \\ alert(X, "low") ==>, alert(X, "info")',
      'r20 customer(X, Name) \\ customer(X, Name) ==>, customer(X, Name)',
    ],
    asserts: [
      { name: 'customer', args: ['c1', 'standard'] },
      { name: 'account', args: ['a1', 'Alice', 1500] },
      { name: 'customer', args: ['c2', 'VIP'] },
      { name: 'account', args: ['a2', 'Bob', 100] },
    ]
  },
  {
    name: 'healthcare',
    constraints: ['patient/4', 'appointment/4', 'diagnosis/3', 'treatment/3', 'prescription/3'],
    functions: ['urgent/1', 'follow_up/2', 'duration/2', 'is_valid/1', 'refill/2'],
    actions: ['log/1'],
    rules: [
      'r1 patient(X, Name, Age, Cond) \\ patient(X, Name, Age, Cond) ==>, patient(X, Name, Age, "stable")',
      'r2 appointment(X, Doc, Date, Time) | gte(Time, 9), lte(Time, 17) ==>, appointment(X, Doc, Date, Time)',
      'r3 appointment(X, Doc, Date, Time) | lt(Time, 9) \\ appointment(X, Doc, Date, Time) ==>, appointment(X, Doc, Date, 9)',
      'r4 diagnosis(X, Cond, Sev) | eq(Sev, "critical") \\ diagnosis(X, Cond, Sev) ==>, treatment(X, "emergency", "immediate")',
      'r5 treatment(X, Name, Plan) \\ treatment(X, Name, Plan) ==>, treatment(X, Name, "ongoing"), log("Treatment started: " + Name)',
      'r6 prescription(X, Med, Days) \\ prescription(X, Med, Days) ==>, prescription(X, Med, sub(Days, 7))',
      'r7 patient(X, N, A, C) | lt(A, 18) \\ patient(X, N, A, C) ==>, diagnosis(X, "pediatric", "monitor")',
      'r8 appointment(X, D, Dt, T) \\ appointment(X, D, Dt, T) ==>, appointment(X, D, Dt, add(T, 1))',
      'r9 diagnosis(X, Cond, Sev) \\ diagnosis(X, Cond, Sev) ==>, diagnosis(X, Cond, "mild")',
      'r10 prescription(X, Med, D) | eq(D, 0) \\ prescription(X, Med, D) ==>, true',
      'r11 treatment(X, N, P) | eq(P, "immediate") \\ treatment(X, N, P) ==>, log("Emergency treatment for " + N)',
      'r12 patient(X, N, A, C) \\ patient(X, N, A, C) ==>, patient(X, N, A, "stable")',
      'r13 appointment(X, D, Dt, T) \\ appointment(X, D, Dt, T) ==>, appointment(X, D, Dt, 10)',
      'r14 diagnosis(X, C, S) \\ diagnosis(X, C, S) ==>, diagnosis(X, C, "monitor")',
      'r15 prescription(X, M, D) \\ prescription(X, M, D) ==>, prescription(X, M, 30)',
      'r16 treatment(X, N, P), follow_up(N, true) \\ treatment(X, N, P) ==>, treatment(X, N, "scheduled")',
      'r17 patient(X, N, A, C), urgent(C), appointment(X, D, Dt, T) \\ patient(X, N, A, C), appointment(X, D, Dt, T) ==>, treatment(X, "urgent care", "immediate")',
      'r18 treatment(X, N, P) \\ treatment(X, N, P) ==>, treatment(X, N, "completed")',
      'r19 prescription(X, M, D), refill(M, true) \\ prescription(X, M, D) ==>, prescription(X, M, add(D, 30))',
      'r20 appointment(X, D, Dt, T) \\ appointment(X, D, Dt, T) ==>, appointment(X, D, Dt, T)',
    ],
    asserts: [
      { name: 'patient', args: ['p1', 'Alice', 34, 'fever'] },
      { name: 'appointment', args: ['p1', 'Dr. Smith', '2026-07-25', 10] },
      { name: 'patient', args: ['p2', 'Bob', 72, 'cardiac'] },
      { name: 'prescription', args: ['p2', 'Aspirin', 30] },
    ]
  },
  {
    name: 'ecommerce',
    constraints: ['cart/3', 'product/4', 'order/3', 'user/3', 'discount/2'],
    functions: ['total/2', 'apply_disc/2', 'is_valid/1', 'in_stock/1', 'tax/2'],
    actions: ['log/1'],
    rules: [
      'r1 product(X, Name, Price, Stock) | gte(Stock, 1) \\ product(X, Name, Price, Stock) ==>, product(X, Name, Price, sub(Stock, 1))',
      'r2 cart(X, User, Items) \\ cart(X, User, Items) ==>, cart(X, User, Items), log("Cart updated")',
      'r3 cart(X, User, Items), discount(X, Pct) \\ cart(X, User, Items) ==>, cart(X, User, apply_disc(Items, Pct))',
      'r4 order(X, User, Status) \\ order(X, User, Status) ==>, order(X, User, "processing"), log("Order placed")',
      'r5 user(X, Email, Tier) | eq(Tier, "gold") \\ user(X, Email, Tier) ==>, discount(X, 15)',
      'r6 product(X, N, P, S), lt(S, 5) \\ product(X, N, P, S) ==>, log("Low stock: " + N)',
      'r7 cart(X, User, Items), total(Items, Amt) | gte(Amt, 100) \\ cart(X, User, Items) ==>, discount(X, 10)',
      'r8 order(X, U, "processing") \\ order(X, U, "processing") ==>, order(X, U, "shipped")',
      'r9 user(X, Email, "new") \\ user(X, Email, "new") ==>, discount(X, 5)',
      'r10 product(X, N, P, S) \\ product(X, N, P, S) ==>, tax(P, 0.08)',
      'r11 cart(X, User, Items) \\ cart(X, User, Items) ==>, cart(X, User, Items)',
      'r12 order(X, U, S) | eq(S, "shipped") \\ order(X, U, S) ==>, log("Order shipped")',
      'r13 discount(X, P) \\ discount(X, P) ==>, discount(X, 0), log("Discount expired")',
      'r14 product(X, N, P, S), lt(P, 1) \\ product(X, N, P, S) ==>, log("Free item: " + N)',
      'r15 cart(X, User, Items) | in_stock(Items) \\ cart(X, User, Items) ==>, order(X, User, "ready")',
      'r16 order(X, U, S) \\ order(X, U, S) ==>, order(X, U, "delivered")',
      'r17 user(X, Email, Tier) \\ user(X, Email, Tier) ==>, user(X, Email, "premium")',
      'r18 product(X, N, P, S) | gt(S, 100) \\ product(X, N, P, S) ==>, log("Expensive: " + N)',
      'r19 cart(X, User, Items) \\ cart(X, User, Items) ==>, cart(X, User, Items)',
      'r20 order(X, U, S) \\ order(X, U, S) ==>, order(X, U, S)',
    ],
    asserts: [
      { name: 'user', args: ['u1', 'alice@mail.com', 'standard'] },
      { name: 'product', args: ['p1', 'Laptop', 999, 50] },
      { name: 'user', args: ['u2', 'bob@mail.com', 'gold'] },
      { name: 'cart', args: ['c1', 'u1', ['p1']] },
    ]
  },
  {
    name: 'education',
    constraints: ['student/3', 'course/4', 'enrollment/3', 'grade/3', 'prereq/2'],
    functions: ['gpa/2', 'passes/2', 'eligible/2', 'satisfied/2', 'weighted/2'],
    actions: ['log/1'],
    rules: [
      'r1 student(X, Name, Major) \\ student(X, Name, Major) ==>, student(X, Name, Major)',
      'r2 course(X, Code, Title, Credits) \\ course(X, Code, Title, Credits) ==>, course(X, Code, Title, Credits)',
      'r3 enrollment(X, Course, Status) | eq(Status, "enrolled") \\ enrollment(X, Course, Status) ==>, grade(X, Course, "A")',
      'r4 grade(X, C, G), gpa([G], GPA) \\ grade(X, C, G) ==>, grade(X, C, G)',
      'r5 prereq(A, B), enrollment(X, A, "enrolled") \\ prereq(A, B), enrollment(X, A, "enrolled") ==>, enrollment(X, B, "eligible")',
      'r6 enrollment(X, C, "completed") \\ enrollment(X, C, "completed") ==>, grade(X, C, "passed")',
      'r7 student(X, Name, Major), grade(X, C, "F") \\ student(X, Name, Major), grade(X, C, "F") ==>, log("Failed: " + Name + " in " + C)',
      'r8 course(X, C, T, Cr) | lt(Cr, 1) \\ course(X, C, T, Cr) ==>, true',
      'r9 enrollment(X, C, "dropped") \\ enrollment(X, C, "dropped") <=> enrollment(X, C, "active")',
      'r10 grade(X, C, G) \\ grade(X, C, G) ==>, grade(X, C, "incomplete")',
      'r11 student(X, N, M) | eq(M, "CS") \\ student(X, N, M) ==>, log("CS student: " + N)',
      'r12 course(X, C, T, Cr), prereq(C, P) \\ course(X, C, T, Cr), prereq(C, P) ==>, log("Prereq for " + C)',
      'r13 enrollment(X, C, S) \\ enrollment(X, C, S) ==>, enrollment(X, C, "waitlisted")',
      'r14 grade(X, C, G), eligible(C, X) \\ grade(X, C, G), eligible(C, X) ==>, grade(X, C, "A+")',
      'r15 student(X, N, M) \\ student(X, N, M) ==>, student(X, N, M)',
      'r16 course(X, C, T, Cr) | gt(Cr, 3) \\ course(X, C, T, Cr) ==>, log("Advanced course: " + C)',
      'r17 enrollment(X, C, S), satisfied(C, X) \\ enrollment(X, C, S), satisfied(C, X) ==>, enrollment(X, C, "passed")',
      'r18 grade(X, C, G) | gte(G, 90) \\ grade(X, C, G) ==>, grade(X, C, "A")',
      'r19 prereq(A, B) \\ prereq(A, B) ==>, prereq(A, B)',
      'r20 course(X, C, T, Cr) \\ course(X, C, T, Cr) ==>, course(X, C, T, Cr)',
    ],
    asserts: [
      { name: 'student', args: ['s1', 'Alice', 'CS'] },
      { name: 'course', args: ['c1', 'CS101', 'Intro', 3] },
      { name: 'student', args: ['s2', 'Bob', 'Math'] },
      { name: 'enrollment', args: ['s1', 'CS101', 'enrolled'] },
    ]
  },
  {
    name: 'calendar',
    constraints: ['event/5', 'reminder/3', 'conflict/3', 'meeting/4'],
    functions: ['is_busy/1', 'overlap/2', 'duration/2', 'valid/1', 'notify/1'],
    actions: ['log/1'],
    rules: [
      'r1 event(X, Title, Start, End, Attendees) | gte(End, Start) \\ event(X, Title, Start, End, Attendees) ==>, event(X, Title, Start, End, Attendees)',
      'r2 event(X, Title, Start, End, Att), reminder(X, RTime, "email") \\ event(X, Title, Start, End, Att) ==>, reminder(X, Start, "sent")',
      'r3 meeting(X, Attendees, Start, End), is_busy(Attendees) \\ meeting(X, Attendees, Start, End) ==>, log("Busy attendees")',
      'r4 reminder(X, RTime, "email") \\ reminder(X, RTime, "email") ==>, reminder(X, RTime, "delivered")',
      'r5 event(X, Title, Start, End, Att), conflict(X) \\ event(X, Title, Start, End, Att) ==>, log("Scheduling conflict")',
      'r6 meeting(X, A, S, E) | lt(E, add(S, 1)) \\ meeting(X, A, S, E) ==>, log("Short meeting")',
      'r7 event(X, Title, S, E, Att) \\ event(X, Title, S, E, Att) ==>, event(X, Title, S, E, Att)',
      'r8 reminder(X, R, T) \\ reminder(X, R, T) ==>, reminder(X, R, "ack")',
      'r9 meeting(X, A, S, E), overlap(A, B) \\ meeting(X, A, S, E) ==>, log("Overlapping meetings")',
      'r10 event(X, T, S, E, A) | valid(S) \\ event(X, T, S, E, A) ==>, log("Valid event")',
      'r11 conflict(X), event(X, T, S, E, A) \\ conflict(X), event(X, T, S, E, A) ==>, event(X, T, S, E, A)',
      'r12 meeting(X, A, S, E), duration(S, E, D) | gte(D, 2) \\ meeting(X, A, S, E) ==>, log("Long meeting")',
      'r13 reminder(X, R, T), notify(R) \\ reminder(X, R, T), notify(R) ==>, log("Notification sent")',
      'r14 event(X, T, S, E, A) | lt(E, S) \\ event(X, T, S, E, A) ==>, true',
      'r15 meeting(X, A, S, E) \\ meeting(X, A, S, E) ==>, meeting(X, A, S, E)',
      'r16 reminder(X, R, T) | eq(T, "sms") \\ reminder(X, R, T) ==>, log("SMS reminder")',
      'r17 event(X, T, S, E, A), is_busy(A) \\ event(X, T, S, E, A), is_busy(A) ==>, log("Attendees busy")',
      'r18 conflict(X) \\ conflict(X, true) <=> conflict(X, false)',
      'r19 meeting(X, A, S, E) | eq(S, E) \\ meeting(X, A, S, E) ==>, true',
      'r20 event(X, T, S, E, A), reminder(X, S, "email") \\ event(X, T, S, E, A), reminder(X, S, "email") ==>, log("Event+reminder linked")',
    ],
    asserts: [
      { name: 'event', args: ['e1', 'Conference', '2026-08-01', '2026-08-03', ['alice', 'bob']] },
      { name: 'reminder', args: ['e1', '2026-07-30', 'email'] },
      { name: 'meeting', args: ['m1', ['alice'], '2026-08-01', '2026-08-02'] },
      { name: 'reminder', args: ['m1', '2026-07-31', 'sms'] },
    ]
  },
  {
    name: 'inventory',
    constraints: ['product/5', 'order/3', 'shipment/3', 'supplier/2'],
    functions: ['stock_level/1', 'reorder/2', 'is_urgent/1', 'ship_cost/2', 'priority/1'],
    actions: ['log/1'],
    rules: [
      'r1 product(X, Name, Cat, Qty, Min) | lt(Qty, Min) \\ product(X, Name, Cat, Qty, Min) ==>, order(X, Name, "reorder")',
      'r2 shipment(X, Carrier, Status) | eq(Status, "pending") \\ shipment(X, Carrier, Status) ==>, shipment(X, Carrier, "shipped")',
      'r3 order(X, Item, "reorder") \\ order(X, Item, "reorder") ==>, shipment(X, "standard", "pending"), log("Reorder placed")',
      'r4 product(X, Name, Cat, Qty, Min), reorder(Qty, Min) \\ product(X, Name, Cat, Qty, Min), reorder(Qty, Min) ==>, log("Reorder needed for " + Name)',
      'r5 supplier(X, LeadTime) \\ supplier(X, LeadTime) ==>, supplier(X, LeadTime)',
      'r6 shipment(X, Carrier, "shipped") \\ shipment(X, Carrier, "shipped") ==>, log("Shipped via " + Carrier)',
      'r7 order(X, Item, "urgent") \\ order(X, Item, "urgent") ==>, shipment(X, "express", "pending")',
      'r8 product(X, Name, Cat, Qty, Min) | gt(Qty, 100) \\ product(X, Name, Cat, Qty, Min) ==>, product(X, Name, Cat, sub(Qty, 10), Min)',
      'r9 shipment(X, C, Status) | is_urgent(Status) \\ shipment(X, C, Status) ==>, log("Urgent shipment")',
      'r10 supplier(X, LT) | lt(LT, 3) \\ supplier(X, LT) ==>, supplier(X, "fast")',
      'r11 order(X, Item, Status) \\ order(X, Item, Status) ==>, order(X, Item, "pending")',
      'r12 product(X, N, C, Q, M) | stock_level(Q) \\ product(X, N, C, Q, M) ==>, log("Stock level check")',
      'r13 shipment(X, C, S) \\ shipment(X, C, S) ==>, shipment(X, C, "delivered")',
      'r14 supplier(X, Name) \\ supplier(X, Name) ==>, supplier(X, Name)',
      'r15 order(X, Item, "reorder"), supplier(X, LT) \\ order(X, Item, "reorder"), supplier(X, LT) ==>, shipment(X, "auto", "pending")',
      'r16 product(X, N, C, Q, M) | eq(Q, 0) \\ product(X, N, C, Q, M) ==>, log("Out of stock: " + N)',
      'r17 shipment(X, C, S), ship_cost(C, Cost) \\ shipment(X, C, S), ship_cost(C, Cost) ==>, shipment(X, C, S)',
      'r18 order(X, Item, Status) | eq(Status, "pending") \\ order(X, Item, Status) ==>, order(X, Item, "processing")',
      'r19 product(X, N, C, Q, M), priority(N) \\ product(X, N, C, Q, M), priority(N) ==>, order(X, N, "priority")',
      'r20 product(X, Name, Cat, Qty, Min) \\ product(X, Name, Cat, Qty, Min) ==>, product(X, Name, Cat, Qty, Min)',
    ],
    asserts: [
      { name: 'product', args: ['p1', 'Widget', 'A', 50, 20] },
      { name: 'supplier', args: ['s1', 'FastCo'] },
      { name: 'product', args: ['p2', 'Gadget', 'B', 5, 10] },
      { name: 'shipment', args: ['s1', 'UPS', 'pending'] },
    ]
  },
  {
    name: 'gaming',
    constraints: ['character/5', 'quest/4', 'inventory/3', 'skill/3'],
    functions: ['level/1', 'damage/2', 'heal/2', 'has_item/2', 'cast/3'],
    actions: ['log/1'],
    rules: [
      'r1 character(X, Name, Class, HP, MaxHP) \\ character(X, Name, Class, HP, MaxHP) ==>, character(X, Name, Class, MaxHP, MaxHP)',
      'r2 quest(X, Title, Rewards, Status) | eq(Status, "active") \\ quest(X, Title, Rewards, Status) ==>, log("Quest active: " + Title)',
      'r3 inventory(X, Items), has_item(Items, "potion") \\ inventory(X, Items) ==>, inventory(X, Items), log("Has potion")',
      'r4 skill(X, Name, Level) \\ skill(X, Name, Level) ==>, skill(X, Name, add(Level, 1))',
      'r5 character(X, Name, Class, HP, MaxHP), damage(Name, Dmg) \\ character(X, Name, Class, HP, MaxHP) ==>, character(X, Name, Class, sub(HP, Dmg), MaxHP)',
      'r6 quest(X, Title, Rewards, "completed") \\ quest(X, Title, Rewards, "completed") ==>, log("Quest completed: " + Title)',
      'r7 inventory(X, Items), cast(X, "fireball", 10) \\ inventory(X, Items) ==>, inventory(X, Items)',
      'r8 skill(X, Name, Lv) | gt(Lv, 10) \\ skill(X, Name, Lv) ==>, log("Mastered: " + Name)',
      'r9 character(X, Name, Class, HP, Max), heal(Name, Amount) \\ character(X, Name, Class, HP, Max) ==>, character(X, Name, Class, add(HP, Amount), Max)',
      'r10 quest(X, T, R, S), character(X, Name, C, HP, M) \\ quest(X, T, R, S), character(X, Name, C, HP, M) ==>, log("Hero " + Name + " on quest")',
      'r11 inventory(X, Items) \\ inventory(X, Items) ==>, inventory(X, Items)',
      'r12 skill(X, N, L) \\ skill(X, N, L) ==>, skill(X, N, L)',
      'r13 character(X, Name, Class, HP, Max), level(Name), gt(HP, Max) \\ character(X, Name, Class, HP, Max) ==>, character(X, Name, Class, Max, Max)',
      'r14 quest(X, T, R, S) | eq(S, "failed") \\ quest(X, T, R, S) ==>, log("Quest failed: " + T)',
      'r15 inventory(X, Items), lt(count(Items), 1) \\ inventory(X, Items) ==>, log("Empty inventory")',
      'r16 character(X, N, C, HP, M) | eq(HP, 0) \\ character(X, N, C, HP, M) ==>, log("Defeated: " + N)',
      'r17 skill(X, N, L), cast(X, N, L) \\ skill(X, N, L), cast(X, N, L) ==>, log("Cast " + N + " at level " + L)',
      'r18 quest(X, T, R, S), reward(X, R) \\ quest(X, T, R, S), reward(X, R) ==>, log("Reward claimed")',
      'r19 character(X, N, C, HP, M) \\ character(X, N, C, HP, M) ==>, character(X, N, C, HP, M)',
      'r20 inventory(X, Items), has_item(Items, "key") \\ inventory(X, Items), has_item(Items, "key") ==>, log("Key found")',
    ],
    asserts: [
      { name: 'character', args: ['c1', 'Aragorn', 'Ranger', 100, 100] },
      { name: 'quest', args: ['q1', 'Destroy Ring', ['gold', 'sword'], 'active'] },
      { name: 'inventory', args: ['c1', ['sword', 'shield']] },
      { name: 'skill', args: ['c1', 'Swordsmanship', 5] },
    ]
  },
  {
    name: 'travel',
    constraints: ['flight/5', 'hotel/3', 'booking/4', 'passenger/2'],
    functions: ['duration/2', 'is_available/1', 'price/2', 'bookable/1', 'duration_hours/2'],
    actions: ['log/1'],
    rules: [
      'r1 flight(X, Origin, Dest, Depart, Arrive) | gte(Arrive, Depart) \\ flight(X, Origin, Dest, Depart, Arrive) ==>, flight(X, Origin, Dest, Depart, Arrive)',
      'r2 hotel(X, Name, Available) | gte(Available, 1) \\ hotel(X, Name, Available) ==>, hotel(X, Name, sub(Available, 1))',
      'r3 booking(X, Flight, Hotel, Status) | eq(Status, "confirmed") \\ booking(X, Flight, Hotel, Status) ==>, log("Booking confirmed")',
      'r4 passenger(X, Tier), booking(X, F, H, "confirmed") \\ passenger(X, Tier), booking(X, F, H, "confirmed") ==>, log("Passenger booked")',
      'r5 flight(X, O, D, Dep, Arr), duration(Dep, Arr, Dur) | gte(Dur, 6) \\ flight(X, O, D, Dep, Arr), duration(Dep, Arr, Dur) ==>, log("Long flight")',
      'r6 hotel(X, Name, Avail) | lt(Avail, 5) \\ hotel(X, Name, Avail) ==>, log("Low availability: " + Name)',
      'r7 booking(X, F, H, "confirmed") \\ booking(X, F, H, "confirmed") ==>, booking(X, F, H, "active")',
      'r8 passenger(X, "vip") \\ passenger(X, "vip") ==>, booking(X, "VIP", "Luxury", "confirmed")',
      'r9 flight(X, O, D, Dep, Arr) \\ flight(X, O, D, Dep, Arr) ==>, flight(X, O, D, Dep, Arr)',
      'r10 hotel(X, Name, Avail) \\ hotel(X, Name, Avail) ==>, hotel(X, Name, Avail)',
      'r11 booking(X, F, H, Status) | eq(Status, "cancelled") \\ booking(X, F, H, Status) ==>, log("Booking cancelled")',
      'r12 passenger(X, Tier) | eq(Tier, "economy") \\ passenger(X, Tier) ==>, log("Economy passenger")',
      'r13 booking(X, F, H, S), price(F, P) \\ booking(X, F, H, S), price(F, P) ==>, booking(X, F, H, S)',
      'r14 flight(X, O, D, Dep, Arr) | is_available(Dep) \\ flight(X, O, D, Dep, Arr) ==>, log("Flight available")',
      'r15 hotel(X, Name, Avail), bookable(Avail) \\ hotel(X, Name, Avail), bookable(Avail) ==>, hotel(X, Name, Avail)',
      'r16 booking(X, F, H, S) \\ booking(X, F, H, S) ==>, booking(X, F, H, "paid")',
      'r17 passenger(X, Tier), hotel(X, N, A), booking(X, F, H, "active") \\ passenger(X, Tier), hotel(X, N, A), booking(X, F, H, "active") ==>, log("Trip ready")',
      'r18 flight(X, O, D, Dep, Arr), duration_hours(Dep, Arr, H) | lt(H, 1) \\ flight(X, O, D, Dep, Arr), duration_hours(Dep, Arr, H) ==>, true',
      'r19 booking(X, F, H, S) | eq(S, "active") \\ booking(X, F, H, S) ==>, log("Active booking")',
      'r20 passenger(X, Tier) \\ passenger(X, Tier) ==>, passenger(X, Tier)',
    ],
    asserts: [
      { name: 'flight', args: ['f1', 'NYC', 'LON', 8, 20] },
      { name: 'hotel', args: ['h1', 'Grand', 10] },
      { name: 'booking', args: ['b1', 'f1', 'h1', 'pending'] },
      { name: 'passenger', args: ['p1', 'economy'] },
    ]
  },
  {
    name: 'smarthome',
    constraints: ['device/3', 'sensor/4', 'automation/4', 'alert/2'],
    functions: ['is_on/1', 'temp_c/1', 'motion/1', 'trigger/2', 'status/1'],
    actions: ['log/1'],
    rules: [
      'r1 device(X, Type, State) | eq(State, "on") \\ device(X, Type, State) ==>, log("Device on: " + X)',
      'r2 sensor(X, Type, Value, Threshold) | gt(Value, Threshold) \\ sensor(X, Type, Value, Threshold) ==>, alert(X, "threshold exceeded")',
      'r3 automation(X, Event, Condition, Action) | eq(Event, "motion") \\ automation(X, Event, Condition, Action) ==>, log("Motion automation triggered")',
      'r4 alert(X, Msg) \\ alert(X, Msg) ==>, log("Alert: " + Msg), alert(X, "acknowledged")',
      'r5 device(X, "light", "on"), sensor(X, "motion", V, T) \\ device(X, "light", "on"), sensor(X, "motion", V, T) ==>, device(X, "light", "off")',
      'r6 sensor(X, "temp", C, T) | lt(C, T) \\ sensor(X, "temp", C, T) ==>, automation(X, "cold", true, "heat")',
      'r7 automation(X, Event, Cond, Action) | eq(Action, "notify") \\ automation(X, Event, Cond, Action) ==>, alert(X, "notification")',
      'r8 device(X, Type, State) \\ device(X, Type, State) ==>, device(X, Type, "idle")',
      'r9 sensor(X, Type, Value, Th), trigger(Type, true) \\ sensor(X, Type, Value, Th), trigger(Type, true) ==>, log("Sensor triggered")',
      'r10 alert(X, Msg) | eq(Msg, "urgent") \\ alert(X, Msg) ==>, log("Urgent alert")',
      'r11 automation(X, Event, Cond, Action), sensor(X, Type, V, T) \\ automation(X, Event, Cond, Action), sensor(X, Type, V, T) ==>, automation(X, Event, Cond, "execute")',
      'r12 device(X, "thermostat", Value) | eq(Value, 22) \\ device(X, "thermostat", Value) ==>, log("Comfort temp")',
      'r13 sensor(X, Type, Value, Th), motion(Value) \\ sensor(X, Type, Value, Th), motion(Value) ==>, log("Motion detected")',
      'r14 automation(X, Event, Cond, Action) \\ automation(X, Event, Cond, Action) ==>, automation(X, Event, Cond, "pending")',
      'r15 alert(X, Msg), device(X, Type, State) \\ alert(X, Msg), device(X, Type, State) ==>, log("Device alert: " + X)',
      'r16 sensor(X, Type, Value, Th) \\ sensor(X, Type, Value, Th) ==>, sensor(X, Type, Value, Th)',
      'r17 device(X, "lock", "locked") \\ device(X, "lock", "locked") ==>, log("Door locked")',
      'r18 automation(X, Event, true, Action) \\ automation(X, Event, true, Action) ==>, log("Auto-triggered")',
      'r19 sensor(X, Type, Value, Th), automation(X, Type, Cond, Action) \\ sensor(X, Type, Value, Th), automation(X, Type, Cond, Action) ==>, alert(X, "sensor-auto")',
      'r20 device(X, Type, State), alert(X, Msg) \\ device(X, Type, State), alert(X, Msg) ==>, log("Device+alert: " + X)',
    ],
    asserts: [
      { name: 'device', args: ['d1', 'light', 'on'] },
      { name: 'sensor', args: ['s1', 'temp', 25, 30] },
      { name: 'automation', args: ['a1', 'motion', true, 'turn_on'] },
      { name: 'alert', args: ['d1', 'info'] },
    ]
  },
  {
    name: 'finance',
    constraints: ['portfolio/2', 'asset/4', 'investment/3', 'dividend/3'],
    functions: ['value/2', 'risk/1', 'return_rate/2', 'diversify/1', 'yield_pct/2'],
    actions: ['log/1'],
    rules: [
      'r1 portfolio(X, Owner) \\ portfolio(X, Owner) ==>, portfolio(X, Owner), log("Portfolio loaded")',
      'r2 asset(X, Type, Qty, Price) | gt(Price, 0) \\ asset(X, Type, Qty, Price) ==>, asset(X, Type, Qty, Price)',
      'r3 investment(X, Portfolio, Amount) \\ investment(X, Portfolio, Amount) ==>, investment(X, Portfolio, add(Amount, 100))',
      'r4 dividend(X, Stock, Amount) \\ dividend(X, Stock, Amount) ==>, log("Dividend: " + Amount)',
      'r5 asset(X, Type, Qty, Price), value(Type, Price) \\ asset(X, Type, Qty, Price), value(Type, Price) ==>, log("Asset valued")',
      'r6 portfolio(X, Owner), risk(Owner) \\ portfolio(X, Owner), risk(Owner) ==>, log("Risk assessed")',
      'r7 investment(X, P, Amount) | gt(Amount, 10000) \\ investment(X, P, Amount) ==>, log("Large investment")',
      'r8 asset(X, Type, Qty, Price), diversify(Type) \\ asset(X, Type, Qty, Price), diversify(Type) ==>, log("Diversified asset")',
      'r9 dividend(X, Stock, Amount), return_rate(Stock, Rate) \\ dividend(X, Stock, Amount), return_rate(Stock, Rate) ==>, log("Return rate noted")',
      'r10 portfolio(X, Owner) \\ portfolio(X, Owner) ==>, portfolio(X, Owner)',
      'r11 asset(X, Type, Qty, Price), investment(X, P, Amount) \\ asset(X, Type, Qty, Price), investment(X, P, Amount) ==>, asset(X, Type, Qty, add(Price, 1))',
      'r12 dividend(X, Stock, Amount), yield_pct(Stock, Y) | gt(Y, 3) \\ dividend(X, Stock, Amount), yield_pct(Stock, Y) ==>, log("High yield stock")',
      'r13 investment(X, P, Amount) \\ investment(X, P, Amount) ==>, investment(X, P, Amount)',
      'r14 asset(X, Type, Qty, Price) | lt(Price, 1) \\ asset(X, Type, Qty, Price) ==>, log("Penny stock")',
      'r15 portfolio(X, Owner), investment(X, P, A) \\ portfolio(X, Owner), investment(X, P, A) ==>, log("Portfolio updated")',
      'r16 dividend(X, Stock, Amount) \\ dividend(X, Stock, Amount) ==>, dividend(X, Stock, Amount)',
      'r17 asset(X, Type, Qty, Price), return_rate(Type, R) \\ asset(X, Type, Qty, Price), return_rate(Type, R) ==>, asset(X, Type, Qty, add(Price, R))',
      'r18 portfolio(X, Owner), diversify(Owner) \\ portfolio(X, Owner), diversify(Owner) ==>, log("Diversify strategy")',
      'r19 investment(X, P, Amount) | gte(Amount, 50000) \\ investment(X, P, Amount) ==>, log("Premium investment tier")',
      'r20 asset(X, Type, Qty, Price), yield_pct(Type, Y) | gte(Y, 5) \\ asset(X, Type, Qty, Price), yield_pct(Type, Y) ==>, log("High yield asset")',
    ],
    asserts: [
      { name: 'portfolio', args: ['pf1', 'Alice'] },
      { name: 'asset', args: ['a1', 'stock', 100, 50] },
      { name: 'portfolio', args: ['pf2', 'Bob'] },
      { name: 'investment', args: ['inv1', 'pf1', 5000] },
    ]
  },
  {
    name: 'hr',
    constraints: ['employee/4', 'leave/4', 'review/3', 'department/2'],
    functions: ['tenure/1', 'eligible_for_leave/1', 'score/1', 'budget/1', 'headcount/1'],
    actions: ['log/1'],
    rules: [
      'r1 employee(X, Name, Dept, Role) \\ employee(X, Name, Dept, Role) ==>, employee(X, Name, Dept, Role)',
      'r2 leave(X, Start, End, Type) | eq(Type, "sick") \\ leave(X, Start, End, Type) ==>, leave(X, Start, End, "medical")',
      'r3 review(X, Score, Feedback) | gte(Score, 90) \\ review(X, Score, Feedback) ==>, log("Excellent review")',
      'r4 employee(X, Name, Dept, Role), tenure(Name) \\ employee(X, Name, Dept, Role), tenure(Name) ==>, log("Tenured employee")',
      'r5 leave(X, Start, End, Type), eligible_for_leave(X) \\ leave(X, Start, End, Type), eligible_for_leave(X) ==>, leave(X, Start, End, "approved")',
      'r6 department(X, Budget) | gt(Budget, 100000) \\ department(X, Budget) ==>, log("Large department")',
      'r7 review(X, Score, Feedback) \\ review(X, Score, Feedback) ==>, review(X, Score, "completed")',
      'r8 employee(X, Name, Dept, Role), headcount(Dept) \\ employee(X, Name, Dept, Role), headcount(Dept) ==>, log("Dept count updated")',
      'r9 leave(X, Start, End, Type) | eq(Type, "vacation") \\ leave(X, Start, End, Type) ==>, log("Vacation leave taken")',
      'r10 department(X, Name) \\ department(X, Name) ==>, department(X, Name)',
      'r11 employee(X, Name, Dept, Role), review(X, Score, F) | lt(Score, 60) \\ employee(X, Name, Dept, Role), review(X, Score, F) ==>, log("Performance plan")',
      'r12 leave(X, Start, End, Type) | lt(End, Start) \\ leave(X, Start, End, Type) ==>, true',
      'r13 review(X, Score, Feedback), score(Score) \\ review(X, Score, Feedback), score(Score) ==>, log("Score recorded")',
      'r14 employee(X, Name, Dept, Role), budget(Dept) \\ employee(X, Name, Dept, Role), budget(Dept) ==>, log("Budget reviewed")',
      'r15 leave(X, Start, End, Type), employee(X, Name, Dept, Role) \\ leave(X, Start, End, Type), employee(X, Name, Dept, Role) ==>, log("Leave recorded for " + Name)',
      'r16 employee(X, Name, Dept, Role) | eq(Role, "manager") \\ employee(X, Name, Dept, Role) ==>, log("Manager: " + Name)',
      'r17 review(X, Score, Feedback) | gte(Score, 80), lte(Score, 89) \\ review(X, Score, Feedback) ==>, log("Good review")',
      'r18 leave(X, S, E, T) \\ leave(X, S, E, T) ==>, leave(X, S, E, T)',
      'r19 department(X, B), employee(X, N, D, R) \\ department(X, B), employee(X, N, D, R) ==>, log("Dept-employee linked")',
      'r20 employee(X, Name, Dept, Role) \\ employee(X, Name, Dept, Role) ==>, employee(X, Name, Dept, Role)',
    ],
    asserts: [
      { name: 'employee', args: ['e1', 'Alice', 'Engineering', 'SWE'] },
      { name: 'department', args: ['d1', 'Engineering'] },
      { name: 'leave', args: ['e1', '2026-08-01', '2026-08-05', 'vacation'] },
      { name: 'review', args: ['e1', 95, 'Great work'] },
    ]
  },
  {
    name: 'logistics',
    constraints: ['package/5', 'route/4', 'shipment/3', 'carrier/2'],
    functions: ['distance/2', 'ETA/2', 'is_valid/1', 'cost/2', 'on_time/1'],
    actions: ['log/1'],
    rules: [
      'r1 package(X, Origin, Dest, Weight, Status) \\ package(X, Origin, Dest, Weight, Status) ==>, package(X, Origin, Dest, Weight, "in-transit")',
      'r2 route(X, Start, End, Waypoints) \\ route(X, Start, End, Waypoints) ==>, route(X, Start, End, Waypoints)',
      'r3 shipment(X, Tracking, Status) | eq(Status, "delivered") \\ shipment(X, Tracking, Status) ==>, log("Delivered: " + Tracking)',
      'r4 carrier(X, Service) \\ carrier(X, Service) ==>, carrier(X, Service)',
      'r5 package(X, O, D, W, "in-transit"), route(X, O, D, WPs) \\ package(X, O, D, W, "in-transit"), route(X, O, D, WPs) ==>, log("Package on route")',
      'r6 shipment(X, T, S), carrier(X, C) \\ shipment(X, T, S), carrier(X, C) ==>, shipment(X, T, "dispatched")',
      'r7 route(X, Start, End, WPs), distance(Start, End, D) | gt(D, 1000) \\ route(X, Start, End, WPs), distance(Start, End, D) ==>, log("Long route")',
      'r8 package(X, O, D, W, S) | lt(W, 1) \\ package(X, O, D, W, S) ==>, true',
      'r9 shipment(X, Tracking, "pending") \\ shipment(X, Tracking, "pending") ==>, shipment(X, Tracking, "processing")',
      'r10 carrier(X, Service), on_time(Service) \\ carrier(X, Service), on_time(Service) ==>, log("On-time carrier")',
      'r11 package(X, O, D, W, S), ETA(O, D, ETA) | lt(ETA, 24) \\ package(X, O, D, W, S), ETA(O, D, ETA) ==>, log("Express delivery")',
      'r12 route(X, Start, End, WPs) \\ route(X, Start, End, WPs) ==>, route(X, Start, End, WPs)',
      'r13 shipment(X, T, S), cost(S, C) \\ shipment(X, T, S), cost(S, C) ==>, log("Cost estimated")',
      'r14 carrier(X, Service) \\ carrier(X, Service) ==>, carrier(X, Service)',
      'r15 package(X, O, D, W, "delivered"), shipment(X, T, "delivered") \\ package(X, O, D, W, "delivered"), shipment(X, T, "delivered") ==>, log("Delivery confirmed")',
      'r16 route(X, Start, End, WPs) | is_valid(WPs) \\ route(X, Start, End, WPs) ==>, log("Valid route")',
      'r17 shipment(X, T, S), ETA(T, S, E) | gte(E, 48) \\ shipment(X, T, S), ETA(T, S, E) ==>, log("Slow shipment")',
      'r18 package(X, O, D, W, S) \\ package(X, O, D, W, S) ==>, package(X, O, D, W, S)',
      'r19 carrier(X, Service), shipment(X, T, S) \\ carrier(X, Service), shipment(X, T, S) ==>, log("Carrier assigned")',
      'r20 route(X, Start, End, WPs), package(X, O, D, W, S) | eq(Start, O), eq(End, D) \\ route(X, Start, End, WPs), package(X, O, D, W, S) ==>, log("Route matches")',
    ],
    asserts: [
      { name: 'package', args: ['pkg1', 'WarehouseA', 'StoreB', 10, 'pending'] },
      { name: 'route', args: ['r1', 'WarehouseA', 'StoreB', ['hub1']] },
      { name: 'shipment', args: ['s1', 'TRK001', 'pending'] },
      { name: 'carrier', args: ['c1', 'FastShip'] },
    ]
  },
  {
    name: 'weather',
    constraints: ['station/5', 'alert/3', 'advisory/3', 'forecast/4'],
    functions: ['temp_f/1', 'is_severe/1', 'humidity/1', 'wind_speed/1', 'uv_index/1'],
    actions: ['log/1'],
    rules: [
      'r1 station(X, Name, Lat, Lon, Elev) \\ station(X, Name, Lat, Lon, Elev) ==>, station(X, Name, Lat, Lon, Elev)',
      'r2 alert(X, Type, Level) | eq(Level, "severe") \\ alert(X, Type, Level) ==>, log("Severe alert: " + Type)',
      'r3 advisory(X, Type, Message) | eq(Type, "heat") \\ advisory(X, Type, Message) ==>, log("Heat advisory")',
      'r4 forecast(X, Date, High, Low) | gt(High, 100) \\ forecast(X, Date, High, Low) ==>, alert(X, "extreme heat", "warning")',
      'r5 station(X, Name, Lat, Lon, Elev), temp_f(Temp) | gt(Temp, 105) \\ station(X, Name, Lat, Lon, Elev), temp_f(Temp) ==>, advisory(X, "extreme heat", "stay hydrated")',
      'r6 alert(X, Type, Level), is_severe(Level) \\ alert(X, Type, Level), is_severe(Level) ==>, log("Severe weather alert")',
      'r7 forecast(X, Date, High, Low), humidity(H) | gt(H, 90) \\ forecast(X, Date, High, Low), humidity(H) ==>, advisory(X, "humidity", "high")',
      'r8 advisory(X, Type, Message) \\ advisory(X, Type, Message) ==>, advisory(X, Type, "active")',
      'r9 station(X, Name, Lat, Lon, Elev), wind_speed(WS) | gt(WS, 60) \\ station(X, Name, Lat, Lon, Elev), wind_speed(WS) ==>, alert(X, "high wind", "warning")',
      'r10 forecast(X, Date, High, Low), uv_index(UVI) | gt(UVI, 8) \\ forecast(X, Date, High, Low), uv_index(UVI) ==>, advisory(X, "uv", "use sunscreen")',
      'r11 alert(X, Type, Level) \\ alert(X, Type, Level) ==>, alert(X, Type, "resolved")',
      'r12 forecast(X, Date, High, Low) \\ forecast(X, Date, High, Low) ==>, forecast(X, Date, High, Low)',
      'r13 station(X, Name, Lat, Lon, Elev), alert(X, Type, Level) \\ station(X, Name, Lat, Lon, Elev), alert(X, Type, Level) ==>, log("Station alert")',
      'r14 advisory(X, Type, Message), forecast(X, Date, High, Low) \\ advisory(X, Type, Message), forecast(X, Date, High, Low) ==>, log("Advisory+forecast")',
      'r15 forecast(X, Date, High, Low) | lt(Low, 32) \\ forecast(X, Date, High, Low) ==>, alert(X, "freeze", "warning")',
      'r16 station(X, Name, Lat, Lon, Elev) \\ station(X, Name, Lat, Lon, Elev) ==>, station(X, Name, Lat, Lon, Elev)',
      'r17 alert(X, Type, Level) | eq(Type, "tornado") \\ alert(X, Type, Level) ==>, log("TORNADO WARNING")',
      'r18 advisory(X, Type, Message) \\ advisory(X, Type, Message) ==>, advisory(X, Type, Message)',
      'r19 forecast(X, Date, High, Low), temp_f(T) | lt(T, 0) \\ forecast(X, Date, High, Low), temp_f(T) ==>, advisory(X, "freeze", "pipe burst risk")',
      'r20 station(X, Name, Lat, Lon, Elev), forecast(X, Date, High, Low) \\ station(X, Name, Lat, Lon, Elev), forecast(X, Date, High, Low) ==>, log("Forecast published")',
    ],
    asserts: [
      { name: 'station', args: ['ws1', 'Central', 40.7, -74.0, 10] },
      { name: 'alert', args: ['ws1', 'storm', 'warning'] },
      { name: 'advisory', args: ['ws1', 'heat', 'stay indoors'] },
      { name: 'forecast', args: ['ws1', '2026-07-26', 95, 72] },
    ]
  },
  {
    name: 'restaurant',
    constraints: ['reservation/5', 'table/3', 'order/4', 'menu_item/4'],
    functions: ['available/1', 'prep_time/1', 'total/2', 'rating/1', 'is_ready/1'],
    actions: ['log/1'],
    rules: [
      'r1 reservation(X, Name, Time, PartySize, Status) | eq(Status, "confirmed") \\ reservation(X, Name, Time, PartySize, Status) ==>, log("Reservation confirmed")',
      'r2 table(X, Seats, Status) | gte(Seats, PartySize), available(Status) \\ table(X, Seats, Status) ==>, table(X, Seats, "occupied")',
      'r3 order(X, Items, Total, Status) | eq(Status, "pending") \\ order(X, Items, Total, Status) ==>, log("Order received")',
      'r4 menu_item(X, Name, Price, Category) | lt(Price, 0) \\ menu_item(X, Name, Price, Category) ==>, true',
      'r5 reservation(X, Name, Time, PartySize, Status) \\ reservation(X, Name, Time, PartySize, Status) ==>, reservation(X, Name, Time, PartySize, "seated")',
      'r6 table(X, Seats, Status), prep_time(Seats) \\ table(X, Seats, Status), prep_time(Seats) ==>, table(X, Seats, "ready")',
      'r7 order(X, Items, Total, "preparing") \\ order(X, Items, Total, "preparing") ==>, order(X, Items, Total, "ready")',
      'r8 menu_item(X, Name, Price, Category) \\ menu_item(X, Name, Price, Category) ==>, menu_item(X, Name, Price, Category)',
      'r9 order(X, Items, Total, Status), is_ready(Status) \\ order(X, Items, Total, Status), is_ready(Status) ==>, log("Order ready to serve")',
      'r10 reservation(X, Name, Time, PartySize, Status), table(X, Seats, "occupied") \\ reservation(X, Name, Time, PartySize, Status), table(X, Seats, "occupied") ==>, log("Table assigned")',
      'r11 order(X, Items, Total, Status), total(Items, T) | gt(T, 100) \\ order(X, Items, Total, Status), total(Items, T) ==>, log("Large order")',
      'r12 table(X, Seats, Status) | lt(Seats, 1) \\ table(X, Seats, Status) ==>, true',
      'r13 menu_item(X, Name, Price, Category), rating(Name) \\ menu_item(X, Name, Price, Category), rating(Name) ==>, log("Popular item: " + Name)',
      'r14 reservation(X, Name, Time, PartySize, Status) | lt(PartySize, 1) \\ reservation(X, Name, Time, PartySize, Status) ==>, true',
      'r15 order(X, Items, Total, Status), prep_time(Items) \\ order(X, Items, Total, Status), prep_time(Items) ==>, order(X, Items, Total, "cooking")',
      'r16 table(X, Seats, Status) \\ table(X, Seats, Status) ==>, table(X, Seats, "available")',
      'r17 reservation(X, Name, Time, PartySize, Status) \\ reservation(X, Name, Time, PartySize, Status) ==>, reservation(X, Name, Time, PartySize, Status)',
      'r18 menu_item(X, Name, Price, Category), order(X, Items, Total, Status) \\ menu_item(X, Name, Price, Category), order(X, Items, Total, Status) ==>, log("Item in order")',
      'r19 order(X, Items, Total, Status) | eq(Status, "served") \\ order(X, Items, Total, Status) ==>, log("Order served")',
      'r20 order(X, Items, Total, Status) \\ order(X, Items, Total, Status) ==>, order(X, Items, Total, "completed")',
    ],
    asserts: [
      { name: 'reservation', args: ['r1', 'Alice', '19:00', 4, 'confirmed'] },
      { name: 'table', args: ['t1', 4, 'available'] },
      { name: 'menu_item', args: ['m1', 'Pasta', 18, 'main'] },
      { name: 'order', args: ['o1', ['Pasta'], 18, 'pending'] },
    ]
  },
  {
    name: 'social',
    constraints: ['user/4', 'post/4', 'follow/3', 'notification/3'],
    functions: ['popularity/1', 'is_following/2', 'unread/1', 'engagement/1', 'hashtag/1'],
    actions: ['log/1'],
    rules: [
      'r1 user(X, Name, Handle, Followers) \\ user(X, Name, Handle, Followers) ==>, user(X, Name, Handle, Followers)',
      'r2 post(X, Author, Content, Likes) | gte(Likes, 100) \\ post(X, Author, Content, Likes) ==>, log("Viral post")',
      'r3 follow(X, Target, Since) | eq(Target, "influencer") \\ follow(X, Target, Since) ==>, log("Following influencer")',
      'r4 notification(X, Type, Msg) | eq(Type, "like") \\ notification(X, Type, Msg) ==>, log("New like")',
      'r5 user(X, Name, Handle, Followers), popularity(Followers) \\ user(X, Name, Handle, Followers), popularity(Followers) ==>, log("Popular user: " + Name)',
      'r6 post(X, Author, Content, Likes) \\ post(X, Author, Content, Likes) ==>, post(X, Author, Content, add(Likes, 1))',
      'r7 follow(X, Target, Since), is_following(Target, X) \\ follow(X, Target, Since), is_following(Target, X) ==>, log("Mutual follow")',
      'r8 notification(X, Type, Msg), unread(Msg) \\ notification(X, Type, Msg), unread(Msg) ==>, log("Unread notification")',
      'r9 user(X, Name, Handle, Followers) \\ user(X, Name, Handle, Followers) ==>, user(X, Name, Handle, Followers)',
      'r10 post(X, Author, Content, Likes), engagement(Likes) \\ post(X, Author, Content, Likes), engagement(Likes) ==>, log("Engaging post")',
      'r11 follow(X, Target, Since) \\ follow(X, Target, Since) ==>, follow(X, Target, Since)',
      'r12 notification(X, Type, Msg), hashtag(Msg) \\ notification(X, Type, Msg), hashtag(Msg) ==>, log("Hashtag mention")',
      'r13 user(X, Name, Handle, Followers) | lt(Followers, 10) \\ user(X, Name, Handle, Followers) ==>, log("New user")',
      'r14 post(X, Author, Content, Likes), hashtag(Content) \\ post(X, Author, Content, Likes), hashtag(Content) ==>, log("Trending topic")',
      'r15 notification(X, Type, Msg) | eq(Type, "follow") \\ notification(X, Type, Msg) ==>, log("New follower")',
      'r16 follow(X, Target, Since), user(X, Name, H, F) \\ follow(X, Target, Since), user(X, Name, H, F) ==>, log(X + " follows " + Target)',
      'r17 post(X, Author, Content, Likes) \\ post(X, Author, Content, Likes) ==>, post(X, Author, Content, Likes)',
      'r18 user(X, Name, Handle, Followers) | popularity(Followers), gt(Followers, 10000) \\ user(X, Name, Handle, Followers) ==>, log("Influencer: " + Name)',
      'r19 follow(X, Target, Since), notification(Target, "follow", "new") \\ follow(X, Target, Since), notification(Target, "follow", "new") ==>, log("Follow notification")',
      'r20 notification(X, Type, Msg) \\ notification(X, Type, Msg) ==>, notification(X, Type, "read")',
    ],
    asserts: [
      { name: 'user', args: ['u1', 'Alice', '@alice', 500] },
      { name: 'post', args: ['p1', 'u1', 'Hello world!', 10] },
      { name: 'follow', args: ['u2', 'u1', '2026-01-01'] },
      { name: 'notification', args: ['u1', 'like', 'liked your post'] },
    ]
  },
  {
    name: 'iot',
    constraints: ['device/3', 'reading/3', 'alert/3', 'config/3'],
    functions: ['is_online/1', 'measure/1', 'threshold/2', 'is_critical/1', 'calibrate/1'],
    actions: ['log/1'],
    rules: [
      'r1 device(X, Type, Status) | eq(Status, "online") \\ device(X, Type, Status) ==>, log("Device online: " + X)',
      'r2 reading(X, Metric, Value), threshold(Metric, Th) | gt(Value, Th) \\ reading(X, Metric, Value), threshold(Metric, Th) ==>, alert(X, Metric, "high")',
      'r3 alert(X, Metric, Level) | eq(Level, "critical") \\ alert(X, Metric, Level) ==>, log("Critical alert: " + Metric)',
      'r4 config(X, Parameter, Value) \\ config(X, Parameter, Value) ==>, config(X, Parameter, Value)',
      'r5 device(X, Type, Status), reading(X, Metric, Value) \\ device(X, Type, Status), reading(X, Metric, Value) ==>, log("Reading from " + X)',
      'r6 reading(X, Metric, Value), is_online(X) \\ reading(X, Metric, Value), is_online(X) ==>, log("Online reading")',
      'r7 device(X, Type, Status) | eq(Status, "offline") \\ device(X, Type, Status) ==>, alert(X, "connection", "down")',
      'r8 config(X, Parameter, Value), calibrate(Parameter) \\ config(X, Parameter, Value), calibrate(Parameter) ==>, log("Calibrated: " + Parameter)',
      'r9 alert(X, Metric, "high") \\ alert(X, Metric, "high") ==>, alert(X, Metric, "medium")',
      'r10 device(X, Type, Status) \\ device(X, Type, Status) ==>, device(X, Type, Status)',
      'r11 reading(X, Metric, Value), is_critical(Value) \\ reading(X, Metric, Value), is_critical(Value) ==>, log("Critical reading")',
      'r12 config(X, Parameter, Value), measure(Value) \\ config(X, Parameter, Value), measure(Value) ==>, log("Measure calibrated")',
      'r13 alert(X, Metric, Level), device(X, Type, Status) \\ alert(X, Metric, Level), device(X, Type, Status) ==>, log("Device+alert")',
      'r14 reading(X, Metric, Value) \\ reading(X, Metric, Value) ==>, reading(X, Metric, Value)',
      'r15 device(X, Type, Status), threshold(Type, Th) \\ device(X, Type, Status), threshold(Type, Th) ==>, log("Threshold check")',
      'r16 config(X, Parameter, Value) | lt(Value, 0) \\ config(X, Parameter, Value) ==>, true',
      'r17 alert(X, Metric, Level) \\ alert(X, Metric, Level) ==>, alert(X, Metric, "resolved")',
      'r18 device(X, Type, Status), is_online(X), alert(X, Metric, Level) \\ device(X, Type, Status), is_online(X), alert(X, Metric, Level) ==>, log("Online critical alert")',
      'r19 reading(X, Metric, Value), config(X, Parameter, Value) \\ reading(X, Metric, Value), config(X, Parameter, Value) ==>, log("Reading config sync")',
      'r20 config(X, Parameter, Value), device(X, Type, Status) \\ config(X, Parameter, Value), device(X, Type, Status) ==>, log("Config applied")',
    ],
    asserts: [
      { name: 'device', args: ['d1', 'temp_sensor', 'online'] },
      { name: 'reading', args: ['d1', 'temperature', 37.5] },
      { name: 'config', args: ['d1', 'interval', 60] },
      { name: 'alert', args: ['d1', 'temperature', 'normal'] },
    ]
  },
  {
    name: 'supplychain',
    constraints: ['product/4', 'order/4', 'shipment/3', 'supplier/3'],
    functions: ['inventory_level/1', 'lead_time/1', 'cost/2', 'is_urgent/1', 'quality/1'],
    actions: ['log/1'],
    rules: [
      'r1 product(X, Name, Qty, Location) | lt(Qty, 10) \\ product(X, Name, Qty, Location) ==>, order(X, Name, "reorder", Qty)',
      'r2 order(X, Product, Type, Qty) \\ order(X, Product, Type, Qty) ==>, order(X, Product, Type, add(Qty, 1))',
      'r3 shipment(X, Status) | eq(Status, "delivered") \\ shipment(X, Status) ==>, log("Shipment delivered")',
      'r4 supplier(X, Name, Rating) | gt(Rating, 4) \\ supplier(X, Name, Rating) ==>, supplier(X, Name, "preferred")',
      'r5 product(X, Name, Qty, Location), order(X, Product, Type, Qty) \\ product(X, Name, Qty, Location), order(X, Product, Type, Qty) ==>, shipment(X, "standard")',
      'r6 order(X, Product, Type, Qty) | is_urgent(Type) \\ order(X, Product, Type, Qty) ==>, shipment(X, "express")',
      'r7 supplier(X, Name, Rating) \\ supplier(X, Name, Rating) ==>, supplier(X, Name, Rating)',
      'r8 shipment(X, Status), supplier(X, Name, R) \\ shipment(X, Status), supplier(X, Name, R) ==>, log("Supplier shipment")',
      'r9 product(X, Name, Qty, Location), inventory_level(Qty) \\ product(X, Name, Qty, Location), inventory_level(Qty) ==>, log("Inventory level check")',
      'r10 order(X, Product, Type, Qty), lead_time(Product) \\ order(X, Product, Type, Qty), lead_time(Product) ==>, log("Lead time checked")',
      'r11 shipment(X, Status) \\ shipment(X, Status) ==>, shipment(X, "in-transit")',
      'r12 product(X, Name, Qty, Location), quality(Name) \\ product(X, Name, Qty, Location), quality(Name) ==>, log("Quality checked")',
      'r13 supplier(X, Name, Rating), order(X, Product, Type, Qty) \\ supplier(X, Name, Rating), order(X, Product, Type, Qty) ==>, order(X, Product, "fast", Qty)',
      'r14 order(X, Product, Type, Qty) | eq(Type, "reorder") \\ order(X, Product, Type, Qty) ==>, product(X, Product, 0, "warehouse")',
      'r15 product(X, Name, Qty, Location) \\ product(X, Name, Qty, Location) ==>, product(X, Name, Qty, Location)',
      'r16 shipment(X, Status), cost(Status, C) \\ shipment(X, Status), cost(Status, C) ==>, log("Shipment cost")',
      'r17 order(X, Product, Type, Qty) \\ order(X, Product, Type, Qty) ==>, order(X, Product, "standard", Qty)',
      'r18 supplier(X, Name, Rating) | lt(Rating, 2) \\ supplier(X, Name, Rating) ==>, log("Low quality supplier")',
      'r19 product(X, Name, Qty, Location), cost(Qty, C) | gt(C, 5000) \\ product(X, Name, Qty, Location), cost(Qty, C) ==>, log("Expensive order")',
      'r20 shipment(X, Status), order(X, Product, Type, Qty) \\ shipment(X, Status), order(X, Product, Type, Qty) ==>, log("Shipment linked")',
    ],
    asserts: [
      { name: 'product', args: ['pr1', 'Widget', 5, 'WarehouseA'] },
      { name: 'supplier', args: ['sup1', 'FastParts', 4.5] },
      { name: 'order', args: ['o1', 'pr1', 'reorder', 100] },
      { name: 'shipment', args: ['s1', 'pending'] },
    ]
  },
  {
    name: 'sports',
    constraints: ['team/3', 'match/4', 'player/3', 'score/3'],
    functions: ['is_home/1', 'is_winning/2', 'is_draw/2', 'is_final/1', 'points/1'],
    actions: ['log/1'],
    rules: [
      'r1 team(X, Name, Sport) \\ team(X, Name, Sport) ==>, team(X, Name, Sport)',
      'r2 match(X, Home, Away, Score) \\ match(X, Home, Away, Score) ==>, match(X, Home, Away, [0, 0])',
      'r3 player(X, Team, Position) \\ player(X, Team, Position) ==>, player(X, Team, Position)',
      'r4 score(X, Player, Points) | gt(Points, 100) \\ score(X, Player, Points) ==>, log("High score!")',
      'r5 match(X, Home, Away, S), is_home(Home), is_winning(S, "home") \\ match(X, Home, Away, S), is_home(Home), is_winning(S, "home") ==>, log("Home team winning")',
      'r6 team(X, Name, Sport), player(X, Team, Pos) | eq(Team, Name) \\ team(X, Name, Sport), player(X, Team, Pos) ==>, log("Team-player match")',
      'r7 score(X, Player, P), points(P) \\ score(X, Player, P), points(P) ==>, log("Points recorded")',
      'r8 match(X, Home, Away, S), is_draw(S, "home", "away") \\ match(X, Home, Away, S), is_draw(S, "home", "away") ==>, log("Match tied")',
      'r9 player(X, Team, Position), is_final(Position) \\ player(X, Team, Position), is_final(Position) ==>, log("Finalist: " + X)',
      'r10 match(X, Home, Away, Score) \\ match(X, Home, Away, Score) ==>, match(X, Home, Away, Score)',
      'r11 team(X, Name, Sport) | gte(Name, 1) \\ team(X, Name, Sport) ==>, log("Team exists")',
      'r12 score(X, Player, P) \\ score(X, Player, P) ==>, score(X, Player, add(P, 1))',
      'r13 player(X, Team, Pos), match(X, Home, Away, Score) \\ player(X, Team, Pos), match(X, Home, Away, Score) ==>, log("Player in match")',
      'r14 match(X, Home, Away, Score), is_final(Score) \\ match(X, Home, Away, Score), is_final(Score) ==>, log("Final match")',
      'r15 team(X, Name, Sport), score(X, Player, P) \\ team(X, Name, Sport), score(X, Player, P) ==>, log("Team scored")',
      'r16 player(X, Team, Position) | eq(Position, "captain") \\ player(X, Team, Position) ==>, log("Captain: " + X)',
      'r17 match(X, Home, Away, Score), is_winning(Score, "away") \\ match(X, Home, Away, Score), is_winning(Score, "away") ==>, log("Away team winning")',
      'r18 score(X, Player, P) \\ score(X, Player, P) ==>, score(X, Player, P)',
      'r19 team(X, Name, Sport), match(X, Home, Away, Score) \\ team(X, Name, Sport), match(X, Home, Away, Score) ==>, log("Team played")',
      'r20 player(X, Team, Position) \\ player(X, Team, Position) ==>, player(X, Team, Position)',
    ],
    asserts: [
      { name: 'team', args: ['t1', 'Lakers', 'basketball'] },
      { name: 'match', args: ['m1', 't1', 't2', [0, 0]] },
      { name: 'player', args: ['p1', 't1', 'forward'] },
      { name: 'score', args: ['m1', 'p1', 25] },
    ]
  },
  {
    name: 'music',
    constraints: ['song/4', 'playlist/3', 'rating/3', 'queue/3'],
    functions: ['is_favorite/1', 'duration/1', 'genre/1', 'is_up_next/1', 'repeat/1'],
    actions: ['log/1'],
    rules: [
      'r1 song(X, Title, Artist, Duration) \\ song(X, Title, Artist, Duration) ==>, song(X, Title, Artist, Duration)',
      'r2 playlist(X, Name, Tracks) \\ playlist(X, Name, Tracks) ==>, playlist(X, Name, Tracks)',
      'r3 rating(X, Song, Score) | gt(Score, 4) \\ rating(X, Song, Score) ==>, log("Top rated song")',
      'r4 queue(X, Item, Position) | eq(Position, 1) \\ queue(X, Item, Position) ==>, log("Now playing: " + Item)',
      'r5 song(X, Title, Artist, Duration), is_favorite(Title) \\ song(X, Title, Artist, Duration), is_favorite(Title) ==>, log("Favorite song: " + Title)',
      'r6 playlist(X, Name, Tracks) | gt(Tracks, 50) \\ playlist(X, Name, Tracks) ==>, log("Large playlist")',
      'r7 queue(X, Item, Position) | eq(Position, "next") \\ queue(X, Item, Position) ==>, queue(X, Item, 1)',
      'r8 rating(X, Song, Score), genre(Song, G) \\ rating(X, Song, Score), genre(Song, G) ==>, log("Genre rating: " + G)',
      'r9 song(X, Title, Artist, Duration), repeat(Title) \\ song(X, Title, Artist, Duration), repeat(Title) ==>, queue(X, Title, "repeat")',
      'r10 playlist(X, Name, Tracks) \\ playlist(X, Name, Tracks) ==>, playlist(X, Name, Tracks)',
      'r11 queue(X, Item, Position), is_up_next(Position) \\ queue(X, Item, Position), is_up_next(Position) ==>, log("Up next")',
      'r12 rating(X, Song, Score) \\ rating(X, Song, Score) ==>, rating(X, Song, add(Score, 1))',
      'r13 song(X, Title, Artist, Duration), duration(Duration) | lt(Duration, 120) \\ song(X, Title, Artist, Duration), duration(Duration) ==>, log("Short song")',
      'r14 queue(X, Item, Position) \\ queue(X, Item, Position) ==>, queue(X, Item, add(Position, 1))',
      'r15 song(X, Title, Artist, Duration), playlist(X, Name, Tracks) \\ song(X, Title, Artist, Duration), playlist(X, Name, Tracks) ==>, log("In playlist: " + Name)',
      'r16 rating(X, Song, Score), playlist(X, Name, Tracks) \\ rating(X, Song, Score), playlist(X, Name, Tracks) ==>, log("Playlist rating")',
      'r17 queue(X, Item, Position), song(X, Title, Artist, Duration) \\ queue(X, Item, Position), song(X, Title, Artist, Duration) ==>, log("Queue song")',
      'r18 song(X, Title, Artist, Duration), genre(Title, G) | eq(G, "rock") \\ song(X, Title, Artist, Duration), genre(Title, G) ==>, log("Rock song")',
      'r19 playlist(X, Name, Tracks), repeat(Name) \\ playlist(X, Name, Tracks), repeat(Name) ==>, playlist(X, Name, "repeat")',
      'r20 queue(X, Item, Position) \\ queue(X, Item, Position) ==>, queue(X, Item, Position)',
    ],
    asserts: [
      { name: 'song', args: ['s1', 'Bohemian Rhapsody', 'Queen', 354] },
      { name: 'playlist', args: ['pl1', 'Classics', 50] },
      { name: 'rating', args: ['r1', 's1', 5] },
      { name: 'queue', args: ['q1', 's1', 1] },
    ]
  }
];

allExamples.forEach(ex => {
  fs.mkdirSync(path.join(baseDir, ex.name), { recursive: true });
  fs.writeFileSync(path.join(baseDir, ex.name, 'package.json'), pkgJson(ex.name));
  fs.writeFileSync(path.join(baseDir, ex.name, 'tsconfig.json'), tsconfigJson());
  fs.writeFileSync(path.join(baseDir, ex.name, ex.name + '.chr'), chrFile(ex));
  fs.writeFileSync(path.join(baseDir, ex.name, ex.name + '.ts'), tsRunner(ex));
});

console.log('Generated ' + allExamples.length + ' examples');
