'use strict';
// End-to-end Sicherheitstests: startet eine Kopie des Servers mit leerem data/-Ordner.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-live-kasse-'));
const port = 4400 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
let proc;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

async function call(method, url, body, cookie, headers = {}) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, text, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
const S = {};

test('Live Orders actions on a cashier order: pay remaining (cash/card) and cancel, exactly as live-orders.html sends them', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200); S.owner = b.cookie;
  const mk = (id, extra) => ({ id, type: 'local', table: '3', status: 'OPEN', createdAt: new Date().toISOString(), cart: [{ id: 'x', name: 'Burger', unitCents: 899, quantity: 2, kind: 'ITEM' }], ...extra });
  for (const id of ['pay1', 'pay2', 'can1']) assert.equal((await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: mk(id) }, S.owner)).status, 200);
  // خلصت كاش: نفس الجسم اللي بتبعته live-orders.html
  const cash = await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', clientId: '', order: { id: 'pay1' }, paymentLines: [{ method: 'CASH', amountCents: 1798, amountReceivedCents: 1798 }] }, S.owner);
  assert.equal(cash.status, 200, JSON.stringify(cash.json)); assert.equal(cash.json.payment.completed, true);
  // خلصت كرت
  const card = await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', clientId: '', order: { id: 'pay2' }, paymentLines: [{ method: 'CARD', amountCents: 1798 }] }, S.owner);
  assert.equal(card.status, 200, JSON.stringify(card.json)); assert.equal(card.json.payment.completed, true);
  // مبلغ غلط مرفوض
  assert.equal((await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', order: { id: 'can1' }, paymentLines: [{ method: 'CARD', amountCents: 100 }] }, S.owner)).status, 422);
  // إلغاء
  assert.equal((await call('POST', '/api/kasse/events', { action: 'CANCEL_ORDER', clientId: '', order: { id: 'can1' }, reason: 'Live Orders' }, S.owner)).status, 200);
  const st = (await call('GET', '/api/kasse-state', null, S.owner)).json;
  const by = id => st.orders.find(o => o.id === id);
  assert.equal(by('pay1').status, 'COMPLETED'); assert.equal(by('pay2').status, 'COMPLETED'); assert.equal(by('can1').status, 'CANCELLED');
  const pays = st.payments.filter(p => ['pay1', 'pay2'].includes(p.orderId));
  assert.equal(pays.length, 2); assert.deepEqual(pays.map(p => p.method).sort(), ['CARD', 'CASH']);
  // طلب منتهي ما بينلغى/ما بينندفع تاني
  assert.equal((await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', order: { id: 'pay1' }, paymentLines: [{ method: 'CASH', amountCents: 1798 }] }, S.owner)).status, 409);
});

test('Training cashier order paid from Live Orders (without training flag) stays training: payment isTest, real order unaffected', async () => {
  const mk = (id, extra) => ({ id, type: 'local', table: '7', status: 'OPEN', createdAt: new Date().toISOString(), cart: [{ id: 'x', name: 'Burger', unitCents: 500, quantity: 1, kind: 'ITEM' }], ...extra });
  assert.equal((await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', training: true, order: mk('trn1', { training: true }) }, S.owner)).status, 200);
  assert.equal((await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: mk('real1') }, S.owner)).status, 200);
  const st0 = (await call('GET', '/api/kasse-state', null, S.owner)).json;
  const t0 = st0.orders.find(o => o.id === 'trn1'); assert.ok(t0 && (t0.isTest || t0.training), 'training order visible in state');
  assert.ok(!st0.orders.find(o => o.id === 'real1').isTest);
  for (const id of ['trn1', 'real1']) {
    const r = await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', clientId: '', order: { id }, paymentLines: [{ method: 'CASH', amountCents: 500, amountReceivedCents: 500 }] }, S.owner);
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const st = (await call('GET', '/api/kasse-state', null, S.owner)).json;
  assert.equal(st.payments.find(p => p.orderId === 'trn1').isTest, true);
  assert.ok(!st.payments.find(p => p.orderId === 'real1').isTest);
});
