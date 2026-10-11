'use strict';
// End-to-end: Türzahlung. Kopie des Servers mit leerem data/-Ordner und Test-IBAN.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-door-'));
const port = 4900 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
let proc, cookie;
const env = off => ({ ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', NARA_GEOCODE: 'off', QONTO_LOGIN: '', QONTO_SECRET: '', ...(off ? { NARA_PAY_IBAN: '', NARA_PAY_PAYEE: '' } : { NARA_PAY_IBAN: 'DE89370400440532013000', NARA_PAY_PAYEE: 'IU GENE' }) });
async function start(off) {
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: env(off), stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
}
async function call(method, url, body) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const sc = r.headers.get('set-cookie'); if (sc && /nara/i.test(sc)) cookie = sc.split(';')[0];
  return { status: r.status, json, text };
}
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data')); fs.writeFileSync(path.join(tmp, '.env'), 'X=1\n');
  await start(false);
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200);
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function seed() {
  // Bestellung + Tour direkt in die Daten schreiben (Server liest bei jedem Aufruf neu)
  const f = path.join(tmp, 'data', 'nara-admin.json'); const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.orders.push({ id: 'ord-door', displayCode: 'W7K2P', source: 'NARA', type: 'DELIVERY', totalCents: 2650, cashDueCents: 2650, paymentMethod: 'CASH', paymentStatus: 'UNPAID', status: 'OPEN', deliveryRouteId: 'rt1', items: [], createdAt: new Date().toISOString(), delivery: { name: 'Test', address: 'Hauptstr. 1', phone: '1' } });
  d.deliveryRoutes = [{ id: 'rt1', employeeId: 'someone', orderIds: ['ord-door'], status: 'STARTED', startedAt: new Date().toISOString() }];
  fs.writeFileSync(f, JSON.stringify(d));
}

test('door pay end to end: start → public page info → bank transfer → paid in place', async () => {
  await seed();
  const s = await call('POST', '/api/driver/door-pay', { orderId: 'ord-door', action: 'start' });
  assert.equal(s.status, 200, s.text); assert.equal(s.json.state, 'WAITING'); assert.equal(s.json.amountCents, 2650); assert.equal(s.json.code, 'W7K2P');
  const saved = cookie; cookie = null; // Kunde: ohne Login
  const pub = await call('GET', '/api/pay/door?d=' + s.json.token);
  assert.equal(pub.status, 200); assert.equal(pub.json.pay.state, 'WAITING'); assert.equal(pub.json.pay.iban, 'DE89370400440532013000'); assert.match(pub.json.pay.giro, /EUR26\.50/);
  assert.equal((await call('GET', '/api/pay/door?d=nonexistenttoken123456')).status, 404);
  assert.equal((await call('GET', '/pay.html')).status, 200);
  cookie = saved;
  assert.equal((await call('POST', '/api/driver/door-pay', { orderId: 'ord-door', action: 'status' })).json.state, 'WAITING');
  // falscher Betrag → Prüfung, bleibt offen
  await call('POST', '/api/accounting/bank-transactions', { transactions: [{ date: '2026-10-11', amountCents: 2500, reference: 'W7K2P', description: 'x' }] });
  assert.equal((await call('POST', '/api/driver/door-pay', { orderId: 'ord-door', action: 'status' })).json.state, 'WAITING');
  // richtiger Betrag → bezahlt
  const imp = await call('POST', '/api/accounting/bank-transactions', { transactions: [{ date: '2026-10-11', amountCents: 2650, reference: 'W 7K2P', description: 'Max Muster' }] });
  assert.equal(imp.status, 201, imp.text);
  assert.equal((await call('POST', '/api/driver/door-pay', { orderId: 'ord-door', action: 'status' })).json.state, 'PAID');
  cookie = null; assert.equal((await call('GET', '/api/pay/door?d=' + s.json.token)).json.pay.state, 'PAID'); cookie = saved;
  const st = await call('GET', '/api/kasse-state'); const o = st.json.orders.find(x => x.id === 'ord-door');
  assert.equal(o.paymentStatus, 'PAID'); assert.equal(o.cashDueCents, 0); assert.equal(st.json.orders.filter(x => x.id === 'ord-door').length, 1);
  assert.equal((await call('POST', '/api/driver/door-pay', { orderId: 'ord-door', action: 'start' })).status, 409);
});

test('door pay: needs login; transfer off → 503', async () => {
  const saved = cookie; cookie = null;
  assert.equal((await call('POST', '/api/driver/door-pay', { orderId: 'x' })).status, 401);
  cookie = saved; proc.kill(); await new Promise(r => setTimeout(r, 300)); await start(true);
  const d = await call('GET', '/api/driver/routes'); assert.equal(d.json.doorOk, false);
  const o2 = path.join(tmp, 'data', 'nara-admin.json'); const j = JSON.parse(fs.readFileSync(o2, 'utf8')); j.orders.push({ ...j.orders[0], id: 'ord-2', displayCode: 'W3333', paymentStatus: 'UNPAID', paymentMethod: 'CASH', cashDueCents: 900, totalCents: 900, payment: undefined, doorPay: undefined }); fs.writeFileSync(o2, JSON.stringify(j));
  assert.equal((await call('POST', '/api/driver/door-pay', { orderId: 'ord-2', action: 'start' })).status, 503);
});
