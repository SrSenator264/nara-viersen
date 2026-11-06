'use strict';
// إصلاحات الفحص (2026-11-06): ردود الكاشير المختصرة، منع إلغاء المدفوع جزئياً، الدفع بدون تكرار، سقف خصم الكاشير،
// بقشيش سالب ممنوع، فاتورة A4 بتنلغى تلقائياً، PIN المدير، النسخ الاحتياطي الشهري، وحارس الكتابة المتضاربة.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const PL = require('../payment-logic.js'), SI = require('../sales-invoice.js'), OC = require('../order-correction.js'), G = require('../data-guard.js');

// ───────── وحدات ─────────
const order = (cart = [{ name: 'Burger', unitCents: 1000, quantity: 1 }]) => ({ id: 'o1', status: 'OPEN', cart });
const fin = (payload, role, employees = []) => PL.finalize({ order: order(), payments: [], payload, employees, now: '2026-11-06T12:00:00Z', newId: p => p + '-1', role });

test('خصم الكاشير: لحد 10% / 5 €، أكتر = 403؛ المدير بلا سقف', () => {
  const cash = { paymentLines: [{ method: 'CASH', amountCents: 900 }] };
  assert.equal(fin({ ...cash, discount: { type: 'PERCENT', value: 10 } }, 'CASHIER').payment.amountCents, 900);
  assert.throws(() => fin({ paymentLines: [{ method: 'CASH', amountCents: 800 }], discount: { type: 'PERCENT', value: 20 } }, 'CASHIER'), e => e.code === 'DISCOUNT_LIMIT' && e.status === 403);
  assert.throws(() => fin({ paymentLines: [{ method: 'CASH', amountCents: 400 }], discount: { type: 'AMOUNT', value: 600 } }, 'CASHIER'), e => e.code === 'DISCOUNT_LIMIT');
  assert.throws(() => fin({ paymentLines: [{ method: 'CASH', amountCents: 800 }], discount: { type: 'PERCENT', value: 20 } }, null), e => e.code === 'DISCOUNT_LIMIT');
  assert.equal(fin({ paymentLines: [{ method: 'CASH', amountCents: 0 + 800 }], discount: { type: 'PERCENT', value: 20 } }, 'MANAGER').payment.amountCents, 800);
  assert.equal(fin({ paymentLines: [{ method: 'CASH', amountCents: 400 }], discount: { type: 'AMOUNT', value: 600 } }, 'OWNER').payment.amountCents, 400);
});

test('خصم الموظف بالكود بس، مو بالـid؛ والبقشيش السالب ممنوع', () => {
  const emp = [{ id: 'employee_x1', name: 'Ali', employeeCode: 'ALI7', qrToken: 'qr_secret', employeeDiscountPercent: 20 }];
  assert.equal(fin({ employeeDiscountCode: 'ali7', paymentLines: [{ method: 'CASH', amountCents: 800 }] }, 'CASHIER', emp).payment.amountCents, 800);
  assert.equal(fin({ employeeDiscountCode: 'qr_secret', paymentLines: [{ method: 'CASH', amountCents: 800 }] }, 'CASHIER', emp).payment.amountCents, 800);
  assert.throws(() => fin({ employeeDiscountCode: 'employee_x1', paymentLines: [{ method: 'CASH', amountCents: 800 }] }, 'CASHIER', emp), e => e.code === 'EMPLOYEE_NOT_FOUND');
  assert.throws(() => fin({ paymentLines: [{ method: 'CASH', amountCents: 1000 }], tipCents: -300 }, 'CASHIER'), e => e.code === 'BAD_TIP');
  assert.equal(fin({ paymentLines: [{ method: 'CASH', amountCents: 1000 }], tipCents: 200 }, 'CASHIER').payment.tipCents, 200);
});

test('فاتورة A4: الإلغاء بيعطي رقم Stornorechnung وصفحة بمبالغ سالبة؛ ما في فاتورة لطلب ملغي أو مستورنو', () => {
  const data = { settings: {}, categories: [], products: [], payments: [], salesInvoices: [], auditEvents: [] };
  const cust = { name: 'ACME GmbH', street: 'Hauptstr. 1', zip: '41747', city: 'Viersen' };
  const o = { id: 'o', status: 'COMPLETED', cart: [{ name: 'Burger', unitCents: 899, quantity: 1 }] };
  const inv = SI.build(data, o, cust, { id: 'i1', number: 'RE-2026-0001', now: '2026-11-05T10:00:00Z' });
  assert.throws(() => SI.stornoHtml(inv), e => e.code === 'NOT_CANCELLED');
  SI.cancel(inv, { reason: 'falsche Anschrift', now: '2026-11-06T10:00:00Z' });
  assert.equal(inv.status, 'CANCELLED'); assert.equal(inv.cancellationNumber, 'RE-2026-0001-S');
  const h = SI.stornoHtml(inv);
  for (const s of ['Stornorechnung', 'RE-2026-0001-S', 'zur Rechnung <b>RE-2026-0001</b>', '− 8,99 €', 'falsche Anschrift']) assert.ok(h.includes(s), s);
  assert.throws(() => SI.cancel(inv, { reason: 'x', now: 'n' }), e => e.code === 'ALREADY_CANCELLED');
  assert.throws(() => SI.build(data, { ...o, status: 'CANCELLED' }, cust, {}), e => e.code === 'ORDER_CANCELLED');
  assert.throws(() => SI.build(data, { ...o, status: 'STORNIERT' }, cust, {}), e => e.code === 'ORDER_STORNO');
});

test('Storno تبع الطلب بيلغي فاتورة A4 تلقائياً', () => {
  let n = 0; const newId = p => p + '-' + (++n);
  const data = { orders: [{ id: 'o', status: 'COMPLETED', completedAt: '2026-11-06T12:00:00Z', paymentId: 'p1', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }] }],
    payments: [{ id: 'p1', orderId: 'o', status: 'COMPLETED', method: 'CASH', amountCents: 1000, createdAt: '2026-11-06T12:00:00Z' }], receipts: [], fiscalTransactions: [], auditEvents: [], dayClosings: [],
    salesInvoices: [{ id: 'i1', number: 'RE-2026-0004', status: 'ISSUED', orderId: 'o' }] };
  const r = OC.stornoOrder(data, { orderId: 'o', reason: 'falsches Essen', user: { id: 'm', name: 'Chef', role: 'OWNER' }, now: '2026-11-06T13:00:00Z', newId, suffix: () => 'AB12' });
  assert.deepEqual(r.cancelledInvoices, ['RE-2026-0004']);
  assert.equal(data.salesInvoices[0].status, 'CANCELLED'); assert.equal(data.salesInvoices[0].cancellationNumber, 'RE-2026-0004-S');
  assert.ok(data.auditEvents.some(e => e.type === 'SALES_INVOICE_CANCELLED' && e.details.auto === true));
});

test('النسخ الاحتياطي: أرشيف شهري ما بينمحي + نسخة على مجلد تاني (NAS)', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-bk-')), f = path.join(d, 'nara-admin.json'), b = path.join(d, 'backups'), m = path.join(d, 'backups-monthly'), mir = path.join(d, 'nas');
  fs.writeFileSync(f, JSON.stringify({ orders: [{ id: 1 }] }));
  const day = (mo, n) => new Date(2026, mo, n, 12).getTime();
  for (const [mo, n] of [[9, 30], [9, 31], [10, 1], [10, 2], [10, 3]]) await G.dailyBackup([f], b, { keep: 2, now: day(mo, n), monthlyDir: m, mirrorDir: mir });
  assert.deepEqual(fs.readdirSync(b).sort(), ['2026-11-02', '2026-11-03']);           // اليومي: آخر يومين بس
  assert.deepEqual(fs.readdirSync(m).sort(), ['2026-10', '2026-11']);                 // الشهري: ما بينمحي
  assert.ok(fs.existsSync(path.join(m, '2026-10', 'nara-admin.json.gz')));
  assert.deepEqual(fs.readdirSync(path.join(mir, 'daily')).sort(), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']); // النسخة التانية: كل شي
  assert.deepEqual(fs.readdirSync(path.join(mir, 'monthly')).sort(), ['2026-10', '2026-11']);
  // NAS مو متصل: خطأ بيتسجّل (تنبيه)، بس النسخة المحلية بتنعمل عادي
  const blocked = path.join(d, 'file-not-dir'); fs.writeFileSync(blocked, 'x');
  const r = await G.dailyBackup([f], b, { keep: 2, now: day(10, 4), monthlyDir: m, mirrorDir: blocked });
  assert.deepEqual(r.created, ['nara-admin.json']); assert.ok(r.errors.some(e => e.file === 'mirror'));
  fs.rmSync(d, { recursive: true, force: true });
});

// حارس: ممنوع مسار يقرا البيانات، يستنى (await)، وبعدين يكتب النسخة القديمة — هيك بتنمحي دفعات صارت بالنص
test('ما في كتابة لنسخة قديمة بعد await (smart-plan, invoice-extract, …)', () => {
  const scan = src => {
    const out = [], assigns = [...src.matchAll(/\b(\w+)=readAdminData\(\)/g)].map(m => ({ v: m[1], i: m.index })), awaits = [...src.matchAll(/\bawait\b/g)].map(m => m.index);
    for (const w of src.matchAll(/writeAdminData\((\w+)\)/g)) {
      const a = assigns.filter(x => x.v === w[1] && x.i < w.index).pop(); if (!a) continue;
      const between = src.slice(a.i, w.index); if (between.split('\n').length > 40 || /\bfunction\b/.test(between)) continue;
      if (awaits.some(x => x > a.i && x < w.index)) out.push(src.slice(0, w.index).split('\n').length);
    }
    return out;
  };
  for (const f of ['server.js', 'day-closing-routes.js', 'sales-invoice-routes.js', 'server-auth.js']) assert.deepEqual(scan(fs.readFileSync(path.join(root, f), 'utf8')), [], f);
  assert.ok(/const done = r => \{ const fresh = readAdminData\(\)/.test(fs.readFileSync(path.join(root, 'day-closing-routes.js'), 'utf8')), 'طباعة التقفيلة بتقرا من جديد بعد الطباعة');
});

// ───────── السيرفر الحقيقي (data/ فاضي) ─────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-fix-')), port = 4600 + Math.floor(Math.random() * 300), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
let proc; const S = {};
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', NARA_GEOCODE: 'off' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const sc = r.headers.get('set-cookie'); return { status: r.status, json, text, cookie: sc ? sc.split(';')[0] : null };
}
const ev = (cookie, action, ord, extra = {}) => call('POST', '/api/kasse/events', { action, order: ord, ...extra }, cookie);
const state = async () => (await call('GET', '/api/kasse-state', null, S.owner)).json;

test('تجهيز: مالك، مديرين، كاشير، مطبخ', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200); S.owner = b.cookie;
  for (const [k, role, pin] of [['m1', 'MANAGER', '581924'], ['m2', 'MANAGER', '692035'], ['cashier', 'CASHIER', '4821'], ['kitchen', 'KITCHEN', '5932']]) {
    const r = await call('POST', '/api/auth/staff', { name: k, role, pin }, S.owner); assert.equal(r.status, 200, r.text); S[k + 'Id'] = r.json.id;
    const l = await call('POST', '/api/auth/login', { employeeId: r.json.id, pin }); assert.equal(l.status, 200); S[k] = l.cookie;
  }
});

test('ردود الكاشير/المطبخ: الطلب بس، بدون موظفين ورواتب ودفعات', async () => {
  const o = { id: 'slim1', type: 'local', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }] };
  assert.equal((await ev(S.cashier, 'ORDER_SYNC', o)).status, 200);
  const k = await ev(S.kitchen, 'KITCHEN_PRINT', { id: 'slim1' });
  assert.equal(k.status, 200); assert.equal(k.json.order.id, 'slim1'); assert.ok(k.json.order.kitchenPrintedAt);
  for (const key of ['employees', 'payments', 'receipts', 'journalEntries', 'settings', 'orders']) assert.equal(k.json[key], undefined, key);
  const p = await ev(S.cashier, 'FINALIZE_PAYMENT', { id: 'slim1' }, { paymentLines: [{ method: 'CASH', amountCents: 1000 }] });
  assert.equal(p.status, 200); assert.equal(p.json.payment.completed, true); assert.match(p.json.receipt.receiptNumber, /^DEV-/);
  assert.equal(p.json.employees, undefined); assert.equal(p.json.payments, undefined);
});

test('الدفع: نفس paymentRequestId = دفعة وحدة؛ إلغاء المدفوع جزئياً ممنوع؛ النسبة بتنثبّت عالسلة', async () => {
  const o = { id: 'split1', type: 'local', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }, { name: 'Coca-Cola 0,33 l', unitCents: 300, quantity: 1, vatRate: 7 }] };
  assert.equal((await ev(S.cashier, 'ORDER_SYNC', o)).status, 200);
  const part = { partial: true, splitOf: 2, paymentLines: [{ method: 'CARD', amountCents: 650 }], paymentRequestId: 'pr_a' };
  const a = await ev(S.cashier, 'FINALIZE_PAYMENT', { id: 'split1' }, part); assert.equal(a.status, 200, a.text); assert.equal(a.json.payment.completed, false);
  const again = await ev(S.cashier, 'FINALIZE_PAYMENT', { id: 'split1' }, part); assert.equal(again.status, 200); assert.equal(again.json.duplicate, true);
  assert.equal(again.json.payment.id, a.json.payment.id); assert.equal(again.json.payment.paidCents, 650);
  assert.equal((await state()).payments.filter(p => p.orderId === 'split1').length, 1);
  const c = await ev(S.cashier, 'CANCEL_ORDER', { id: 'split1' }, { reason: 'weg' }); assert.equal(c.status, 409); assert.equal(c.json.code, 'PARTIALLY_PAID');
  const b = await ev(S.cashier, 'FINALIZE_PAYMENT', { id: 'split1' }, { partial: true, paymentLines: [{ method: 'CASH', amountCents: 650 }], paymentRequestId: 'pr_b' });
  assert.equal(b.status, 200); assert.equal(b.json.payment.completed, true);
  const done = (await state()).orders.find(x => x.id === 'split1');
  assert.equal(done.status, 'COMPLETED'); assert.deepEqual(done.cart.map(i => i.vatRate), [7, 19]); // الكولا 19% حتى لو المتصفح بعت 7
});

test('خصم الكاشير فوق 10% بيترفض بالسيرفر، المالك مسموح؛ بقشيش سالب 422', async () => {
  const mk = id => ({ id, type: 'local', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }] });
  await ev(S.cashier, 'ORDER_SYNC', mk('disc1'));
  const no = await ev(S.cashier, 'FINALIZE_PAYMENT', { id: 'disc1' }, { discount: { type: 'PERCENT', value: 50 }, paymentLines: [{ method: 'CASH', amountCents: 500 }] });
  assert.equal(no.status, 403); assert.equal(no.json.code, 'DISCOUNT_LIMIT');
  const tip = await ev(S.cashier, 'FINALIZE_PAYMENT', { id: 'disc1' }, { tipCents: -100, paymentLines: [{ method: 'CASH', amountCents: 1000 }] }); assert.equal(tip.status, 422);
  const ok = await ev(S.owner, 'FINALIZE_PAYMENT', { id: 'disc1' }, { discount: { type: 'PERCENT', value: 50 }, paymentLines: [{ method: 'CASH', amountCents: 500 }] });
  assert.equal(ok.status, 200, ok.text);
  // الكود: الـid تبع الموظف ما بيشتغل كخصم موظف
  const lk = await call('GET', '/api/cashier/employee-lookup?code=' + encodeURIComponent(S.cashierId), null, S.cashier); assert.equal(lk.status, 404);
});

test('فاتورة A4: تغيير السلة بعد الفاتورة بيلغيها تلقائياً (Stornorechnung)، والطلب الملغي ما إلو فاتورة', async () => {
  const cust = { name: 'ACME GmbH', street: 'Hauptstr. 1', zip: '41747', city: 'Viersen' };
  const o = { id: 'inv9', type: 'local', cart: [{ name: 'Burger', unitCents: 899, quantity: 1 }] };
  const s1 = await ev(S.cashier, 'ORDER_SYNC', o); assert.equal(s1.status, 200);
  const a = await call('POST', '/api/sales-invoices', { orderId: 'inv9', customer: cust }, S.cashier); assert.equal(a.status, 200, a.text);
  const s2 = await ev(S.cashier, 'ORDER_SYNC', { ...o, rev: s1.json.rev, cart: [...o.cart, { name: 'Pommes', unitCents: 300, quantity: 1 }] }); assert.equal(s2.status, 200);
  const list = (await call('GET', '/api/sales-invoices?orderId=inv9', null, S.cashier)).json.invoices; assert.equal(list[0].status, 'CANCELLED');
  const h = await call('GET', `/api/sales-invoices/${a.json.invoice.id}/storno-html`, null, S.cashier);
  assert.equal(h.status, 200); assert.ok(h.text.includes('Stornorechnung') && h.text.includes(a.json.invoice.number + '-S'));
  assert.equal((await ev(S.cashier, 'CANCEL_ORDER', { id: 'inv9' }, { reason: 'Kunde weg' })).status, 200);
  const late = await call('POST', '/api/sales-invoices', { orderId: 'inv9', customer: cust }, S.cashier); assert.equal(late.status, 409); assert.equal(late.json.code, 'ORDER_CANCELLED');
});

test('مدير ما بيغيّر PIN أو دور مدير تاني؛ المالك بيقدر؛ المدير بيغيّر حسابه وحساب الكاشير', async () => {
  const deny = await call('POST', '/api/auth/staff', { id: S.m2Id, name: 'm2', role: 'MANAGER', pin: '804716' }, S.m1); assert.equal(deny.status, 403);
  const demote = await call('POST', '/api/auth/staff', { id: S.m2Id, name: 'm2', role: 'CASHIER', pin: '8047' }, S.m1); assert.equal(demote.status, 403);
  assert.equal((await call('POST', '/api/auth/login', { employeeId: S.m2Id, pin: '692035' })).status, 200);
  assert.equal((await call('POST', '/api/auth/staff', { id: S.m1Id, name: 'm1', role: 'MANAGER', pin: '915370' }, S.m1)).status, 200);
  assert.equal((await call('POST', '/api/auth/staff', { id: S.cashierId, name: 'cashier', role: 'CASHIER', pin: '7381' }, S.owner)).status, 200);
  assert.equal((await call('POST', '/api/auth/staff', { id: S.m2Id, name: 'm2', role: 'MANAGER', pin: '804716' }, S.owner)).status, 200);
});
