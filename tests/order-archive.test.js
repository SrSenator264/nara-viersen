'use strict';
// الأرشفة الأسبوعية: بتنقل بس الطلبات القديمة والمسكّرة واللي يومها مقفّل، وما بتغيّر ولا رقم بالتقارير.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const OA = require('../order-archive.js'), DC = require('../day-closing.js'), SL = require('../sales-ledger.js'), CDB = require('../customer-db.js'), bizDay = require('../business-day.js');
const root = path.resolve(__dirname, '..');

const NOW = Date.parse('2026-11-06T12:00:00Z'), DAY = 864e5;
const iso = daysAgo => new Date(NOW - daysAgo * DAY).toISOString();
const dayAgo = daysAgo => bizDay.day(NOW - daysAgo * DAY);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nara-arc-'));

// بيانات: أيام قديمة (مقفّلة وغير مقفّلة)، طلبات منصات، تدريب، مفتوح، ودفعة مقسومة على يومين
function fixture() {
  const d = { orders: [], payments: [], receipts: [], fiscalTransactions: [], auditEvents: [], dayClosings: [], categories: [], products: [], settings: {}, cashbooks: [], employees: [], salesInvoices: [] };
  let n = 0;
  const sale = (id, daysAgo, { status = 'COMPLETED', pay = true, payDaysAgo = daysAgo, extra = {} } = {}) => {
    const at = iso(daysAgo), pat = iso(payDaysAgo);
    d.orders.push({ id, displayCode: '#' + id, type: 'delivery', status, createdAt: at, completedAt: status === 'COMPLETED' ? pat : undefined, delivery: { phone: '0176' + id.length + '000' + (++n), name: 'Kunde ' + id, street: 'Gereonstr. 1', city: 'Viersen' }, cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }, { name: 'Cola', unitCents: 300, quantity: 1 }], ...extra });
    if (pay) {
      d.payments.push({ id: 'pay-' + id, orderId: id, method: 'CASH', paymentLines: [{ method: 'CASH', amountCents: 1300 }], amountCents: 1300, grossAmountCents: 1300, status: 'COMPLETED', createdAt: pat, ...(extra.isTest ? { isTest: true } : {}) });
      d.receipts.push({ id: 'rc-' + id, orderId: id, paymentId: 'pay-' + id, receiptNumber: 'DEV-' + id, createdAt: pat });
      d.fiscalTransactions.push({ id: 'f-' + id, orderId: id, paymentId: 'pay-' + id, status: 'DEVELOPMENT_NOT_CONFIGURED', createdAt: pat });
    }
    d.auditEvents.push({ id: 'a-' + id, type: 'PAYMENT_FINALIZED', orderId: id, createdAt: pat });
  };
  const close = daysAgo => d.dayClosings.push({ id: 'z' + daysAgo, day: dayAgo(daysAgo), mode: 'REAL', type: 'CLOSING', number: 'Z-2026-' + String(daysAgo).padStart(4, '0'), closedAt: iso(daysAgo - 0.4) });
  sale('old1', 150); sale('old2', 150); close(150);                     // قديم + مقفّل → ينتقل
  sale('nozclose', 140);                                                // قديم بس يومو مش مقفّل → بيضل
  sale('cancelled', 130, { status: 'CANCELLED', pay: false });          // ملغي قديم (ما في مبيعات باليوم) → ينتقل
  sale('openold', 130, { status: 'OPEN', pay: false });                 // مفتوح → بيضل
  sale('platform', 120, { pay: false, extra: { source: 'LIEFERANDO', externalOrderCode: 'L-1', totalCents: 2500 } }); // منصة → ينتقل
  sale('training', 125, { extra: { training: true, isTest: true } });  // تدريب → ينتقل (ما إلو تقفيلة)
  sale('recent', 30); close(30);                                       // جديد → بيضل
  sale('split', 92, { payDaysAgo: 89 }); close(92); close(89);         // دفعة بعد الحد → بيضل كلّو
  d.salesInvoices.push({ id: 'i1', number: 'RE-2026-0001', status: 'ISSUED', orderId: 'old1' }); // الفواتير بتضل بالملف الأساسي
  return d;
}

test('plan: بس القديم + المسكّر + اليوم المقفّل (والمنصات والتدريب)', () => {
  const p = OA.plan(fixture(), { now: NOW });
  assert.deepEqual([...p.ids].sort(), ['cancelled', 'old1', 'old2', 'platform', 'training']);
});

function memStore(data, dir) {
  let cur = JSON.parse(JSON.stringify(data));
  return { readAdminData: () => JSON.parse(JSON.stringify(cur)), writeAdminData: x => { if (x.__archiveView) throw Error('view!'); cur = JSON.parse(JSON.stringify(x)); return cur; }, get: () => cur, dir };
}

test('run: التقفيلة، سجل المبيعات، الضريبة والزباين نفس الأرقام قبل وبعد', () => {
  const dir = tmp(), before = fixture(), s = memStore(before, dir);
  const r = OA.run({ readAdminData: s.readAdminData, writeAdminData: s.writeAdminData, dir, now: NOW });
  assert.equal(r.moved, 5); assert.equal(r.records, 5 + 3 * 3 + 5);
  const after = s.get();
  assert.deepEqual(after.orders.map(o => o.id).sort(), ['nozclose', 'openold', 'recent', 'split']);
  assert.ok(!after.payments.some(p => p.orderId === 'old1')); assert.ok(!after.receipts.some(x => x.orderId === 'old1')); assert.ok(!after.auditEvents.some(x => x.orderId === 'old1'));
  assert.equal(after.salesInvoices.length, 1);
  for (const daysAgo of [150, 140, 130, 125, 120, 92]) {
    const day = dayAgo(daysAgo);
    assert.deepEqual(DC.build(OA.withArchive(after, dir, day, day), day), DC.build(before, day), 'Tagesabschluss ' + day);
  }
  const from = dayAgo(200), to = dayAgo(0);
  const a = SL.build(OA.withArchive(after, dir, from, to), from, to), b = SL.build(before, from, to);
  assert.deepEqual(a.own.totals, b.own.totals); assert.deepEqual(a.platform.totals, b.platform.totals);
  const ca = CDB.build(OA.withArchive(after, dir), NOW), cb = CDB.build(before, NOW);
  assert.equal(ca.customers.length, cb.customers.length);
  // مرة تانية: ما في شي جديد، والأرشيف ما بيتكرر
  assert.equal(OA.run({ readAdminData: s.readAdminData, writeAdminData: s.writeAdminData, dir, now: NOW }).moved, 0);
  const all = OA.withArchive(s.get(), dir);
  assert.equal(all.orders.length, before.orders.length); assert.equal(all.payments.length, before.payments.length);
  assert.equal(all.__archiveView, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('انقطاع كهرباء بعد كتابة الأرشيف وقبل الملف الأساسي: ما في تكرار ولا ضياع', () => {
  const dir = tmp(), before = fixture();
  let writes = 0; const store = memStore(before, dir);
  assert.throws(() => OA.run({ readAdminData: store.readAdminData, writeAdminData: () => { writes++; throw new Error('Strom weg'); }, dir, now: NOW }));
  assert.equal(writes, 1); assert.equal(store.get().orders.length, before.orders.length); // الأساسي ما تغيّر
  const view = OA.withArchive(store.get(), dir);
  assert.equal(view.orders.length, before.orders.length); assert.equal(view.payments.length, before.payments.length); // بدون تكرار
  OA.clearCache();
  const r = OA.run({ readAdminData: store.readAdminData, writeAdminData: store.writeAdminData, dir, now: NOW }); assert.equal(r.moved, 5);
  assert.equal(OA.withArchive(store.get(), dir).orders.length, before.orders.length);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('الجدول: الاثنين بعد 4 الصبح (برلين)، مرة بالأسبوع', () => {
  const mon5 = Date.parse('2026-11-09T04:30:00Z') /* 05:30 Berlin */, mon3 = Date.parse('2026-11-09T01:30:00Z'), tue = Date.parse('2026-11-10T09:00:00Z');
  assert.equal(OA.due(null, mon5), true); assert.equal(OA.due(null, mon3), false); assert.equal(OA.due(null, tue), false);
  assert.equal(OA.due(new Date(mon5 - 3600e3).toISOString(), mon5), false);
  assert.equal(OA.due(new Date(mon5 - 7 * DAY).toISOString(), mon5), true);
});

// ───────── السيرفر الحقيقي: التقرير القديم نفسه بعد الأرشفة، والمسار للمدير بس ─────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-arc-srv-')), port = 4300 + Math.floor(Math.random() * 300), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
let proc; const S = {};
test.before(async () => {
  fs.cpSync(root, dir, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(dir, 'data'));
  // نفس البيانات بس نسبةً لليوم الحقيقي
  const f = fixture(), shift = Date.now() - NOW, mv = v => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(Date.parse(v) + shift).toISOString() : v);
  const walk = o => { if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(mv(v))])); return mv(o); };
  const data = walk(f); for (const z of data.dayClosings) z.day = bizDay.day(Date.now() - Number(z.id.slice(1)) * DAY);
  fs.writeFileSync(path.join(dir, 'data', 'nara-admin.json'), JSON.stringify(data));
  proc = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', NARA_GEOCODE: 'off' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  const sc = r.headers.get('set-cookie'); return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}

test('API: تجربة بدون تغيير، كاشير ممنوع، الأرشفة، والتقارير القديمة نفسها', async () => {
  S.owner = (await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' })).cookie;
  const c = await call('POST', '/api/auth/staff', { name: 'k', role: 'CASHIER', pin: '4821' }, S.owner);
  S.cashier = (await call('POST', '/api/auth/login', { employeeId: c.json.id, pin: '4821' })).cookie;
  assert.equal((await call('POST', '/api/system/archive', { dryRun: true }, S.cashier)).status, 403);
  const dry = await call('POST', '/api/system/archive', { dryRun: true }, S.owner); assert.equal(dry.status, 200); assert.equal(dry.json.orders, 5);
  const from = bizDay.day(Date.now() - 200 * DAY), to = bizDay.today(), q = `/api/reports/sales-ledger?from=${from}&to=${to}`;
  const before = (await call('GET', q, null, S.owner)).json;
  const r = await call('POST', '/api/system/archive', {}, S.owner); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.moved, 5);
  const after = (await call('GET', q, null, S.owner)).json;
  assert.deepEqual(after.summary.totals, before.summary.totals); assert.deepEqual(after.own, before.own);
  const ids = (await call('GET', '/api/kasse-state', null, S.owner)).json.orders.map(o => o.id);
  assert.ok(!ids.includes('old1')); assert.ok(ids.includes('recent'));
  const h = (await call('GET', '/api/health/details', null, S.owner)).json; assert.equal(h.archive.moved, 5); assert.ok(h.archive.months.length >= 1);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'archive', 'pre-archive-copy.json.bak')));
});
