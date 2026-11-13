'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const SI = require('../sales-invoice.js');
const root = path.resolve(__dirname, '..');
const cust = { name: 'ACME GmbH', street: 'Hauptstr. 1', zip: '41747', city: 'Viersen' };
const base = () => ({ settings: {}, categories: [], products: [], payments: [], salesInvoices: [], auditEvents: [] });

test('two VAT rates: food 7 %, drink 19 %, sums equal the order total', () => {
  const o = { id: 'o1', displayCode: 'A1', cart: [{ name: 'Cheeseburger', unitCents: 899, quantity: 1 }, { name: 'Cola 0,33', unitCents: 301, quantity: 2, category: 'Drinks' }] };
  const inv = SI.build(base(), o, cust, { id: 'i', number: 'RE-2026-0001' });
  assert.equal(inv.grossCents, 899 + 602);
  assert.deepEqual(inv.vat.rows.map(r => [r.rate, r.grossCents]), [[7, 899], [19, 602]]);
  for (const r of inv.vat.rows) assert.equal(r.netCents + r.vatCents, r.grossCents);
  assert.equal(inv.vat.grossCents, inv.grossCents);
});
test('bill discount reduces the total and the rate split still adds up exactly', () => {
  const o = { id: 'o2', cart: [{ name: 'Burger', unitCents: 899, quantity: 1 }, { name: 'Cola', unitCents: 301, quantity: 2, category: 'Drinks' }], billDiscount: { amountCents: 100 } };
  const inv = SI.build(base(), o, cust, { id: 'i', number: 'x' });
  assert.equal(inv.grossCents, 1401); assert.equal(inv.discountCents, 100); assert.equal(inv.vat.grossCents, 1401);
});
test('invoice numbers are unique and sequential per year', () => {
  const d = base(); assert.equal(SI.nextNumber(d, 2026), 'RE-2026-0001');
  d.salesInvoices.push({ number: 'RE-2026-0001' }, { number: 'RE-2026-0007' }); assert.equal(SI.nextNumber(d, 2026), 'RE-2026-0008'); assert.equal(SI.nextNumber(d, 2027), 'RE-2027-0001');
});
test('training orders, empty orders and bad customers are rejected', () => {
  const ok = { id: 'o', cart: [{ name: 'A', unitCents: 500, quantity: 1 }] };
  assert.throws(() => SI.build(base(), { ...ok, training: true }, cust, {}), e => e.code === 'TRAINING_ORDER');
  assert.throws(() => SI.build(base(), { id: 'o', cart: [] }, cust, {}), e => e.code === 'EMPTY_ORDER');
  assert.throws(() => SI.build(base(), ok, { ...cust, name: '' }, {}), e => e.code === 'NAME_REQUIRED');
  assert.throws(() => SI.build(base(), ok, { ...cust, city: '' }, {}), e => e.code === 'ADDRESS_REQUIRED');
  assert.throws(() => SI.build(base(), ok, { ...cust, vatId: '12' }, {}), e => e.code === 'BAD_VATID');
});
test('HTML has the mandatory parts: seller + USt-IdNr, customer, number, dates, rates; escapes input; cancelled marked', () => {
  const o = { id: 'o', cart: [{ name: '<b>Burger</b>', unitCents: 899, quantity: 1 }] };
  const inv = SI.build(base(), o, cust, { id: 'i', number: 'RE-2026-0001', now: '2026-11-05T10:00:00Z' });
  const h = SI.html(inv);
  for (const s of ['IUGENE', 'DE357658231', 'ACME GmbH', 'RE-2026-0001', '05.11.2026', 'Leistungsdatum', '7 %', 'size:A4']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('<b>Burger</b>'));
  assert.ok(SI.html({ ...inv, status: 'CANCELLED' }).includes('STORNIERT'));
});
test('seller can be changed in settings (one place)', () => {
  const d = base(); d.settings.seller = { name: 'Flamo' };
  assert.equal(SI.sellerOf(d).name, 'Flamo'); assert.equal(SI.sellerOf(d).vatId, 'DE357658231');
});

// ── End-to-End mit echtem Server (leeres data/) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-sinv-')), port = 4900 + Math.floor(Math.random() * 300), baseUrl = `http://127.0.0.1:${port}`;
let proc, owner, cashier;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
async function call(method, url, body, cookie) {
  const r = await fetch(baseUrl + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  const sc = r.headers.get('set-cookie'); return { status: r.status, json, text, cookie: sc ? sc.split(';')[0] : null };
}
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data')); fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(baseUrl + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
  owner = (await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' })).cookie;
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

test('API: create from a cashier order, repeat returns the same one, html prints, cancel keeps the record', async () => {
  const mk = (id, extra) => ({ id, type: 'local', table: '2', status: 'OPEN', createdAt: new Date().toISOString(), cart: [{ id: 'x', name: 'Burger', unitCents: 899, quantity: 1, kind: 'ITEM' }], ...extra });
  assert.equal((await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: mk('inv1') }, owner)).status, 200);
  const bad = await call('POST', '/api/sales-invoices', { orderId: 'inv1', customer: { name: '' } }, owner); assert.equal(bad.status, 400);
  const a = await call('POST', '/api/sales-invoices', { orderId: 'inv1', customer: cust }, owner);
  assert.equal(a.status, 200, a.text); assert.equal(a.json.existing, false); assert.match(a.json.invoice.number, /^RE-\d{4}-0001$/);
  const b = await call('POST', '/api/sales-invoices', { orderId: 'inv1', customer: cust }, owner);
  assert.equal(b.json.existing, true); assert.equal(b.json.invoice.id, a.json.invoice.id);
  const h = await call('GET', `/api/sales-invoices/${a.json.invoice.id}/html?print=1`, null, owner);
  assert.equal(h.status, 200); assert.ok(h.text.includes('DE357658231') && h.text.includes('window.print'));
  assert.equal((await call('POST', `/api/sales-invoices/${a.json.invoice.id}/cancel`, {}, owner)).status, 400);
  const c = await call('POST', `/api/sales-invoices/${a.json.invoice.id}/cancel`, { reason: 'falsche Anschrift' }, owner);
  assert.equal(c.status, 200); assert.equal(c.json.invoice.status, 'CANCELLED');
  const list = await call('GET', '/api/sales-invoices?orderId=inv1', null, owner); assert.equal(list.json.invoices.length, 1);
  const n = await call('POST', '/api/sales-invoices', { orderId: 'inv1', customer: cust }, owner); assert.match(n.json.invoice.number, /-0002$/);
});
test('API: training order gets no invoice; unauthenticated is refused', async () => {
  const o = { id: 'trn', type: 'local', table: '3', status: 'OPEN', createdAt: new Date().toISOString(), training: true, cart: [{ id: 'x', name: 'Burger', unitCents: 500, quantity: 1, kind: 'ITEM' }] };
  assert.equal((await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', training: true, order: o }, owner)).status, 200);
  assert.equal((await call('POST', '/api/sales-invoices', { orderId: 'trn', customer: cust }, owner)).status, 422);
  const un = await call('POST', '/api/sales-invoices', { orderId: 'trn', customer: cust }); assert.ok([401, 403].includes(un.status));
});
