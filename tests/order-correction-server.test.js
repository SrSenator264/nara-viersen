'use strict';
// End-to-end: CORRECT_ORDER / STORNO gegen den echten Server (Rollen, Pflicht-Grund, neue offene Bestellung, Training). Startet eine Kopie mit leerem data/-Ordner.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-corr-'));
const port = 4900 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
let proc;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}
const S = {};
const ev = (cookie, action, order, extra = {}) => call('POST', '/api/kasse/events', { action, order, ...extra }, cookie);
async function sellAndPay(cookie, id, extra = {}) {
  const base0 = { id, type: 'local', table: '7', cart: [{ name: 'Burger', unitCents: 1000, quantity: 2, options: [] }], ...extra };
  const s = await ev(cookie, 'ORDER_SYNC', base0, { clientId: 'A', training: extra.training === true }); assert.equal(s.status, 200, JSON.stringify(s.json));
  const p = await ev(cookie, 'FINALIZE_PAYMENT', { ...base0, rev: s.json.rev }, { paymentLines: [{ method: 'CASH', amountCents: 2000 }] }); assert.equal(p.status, 200, JSON.stringify(p.json));
  return base0;
}
const orderOf = async (cookie, id) => ((await call('GET', '/api/kasse-state', null, cookie)).json.orders || []).find(o => o.id === id);

test('setup: owner + cashier', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200); S.owner = b.cookie;
  const c = await call('POST', '/api/auth/staff', { name: 'cashier', role: 'CASHIER', pin: '4821' }, S.owner); assert.equal(c.status, 200);
  const l = await call('POST', '/api/auth/login', { employeeId: c.json.id, pin: '4821' }); assert.equal(l.status, 200); S.cashier = l.cookie;
});

test('Storno nach Zahlung: Kassierer darf nicht (403), Inhaber nur mit Grund (422), dann OK mit neuer offener Bestellung', async () => {
  const id = 'real-' + Date.now(); await sellAndPay(S.owner, id);
  const denied = await ev(S.cashier, 'CORRECT_ORDER', { id }, { reason: 'Fehler' }); assert.equal(denied.status, 403);
  assert.equal((await orderOf(S.owner, id)).status, 'COMPLETED');
  const noReason = await ev(S.owner, 'CORRECT_ORDER', { id }, { reason: '  ' }); assert.equal(noReason.status, 422); assert.equal(noReason.json.code, 'REASON_REQUIRED');
  assert.equal((await orderOf(S.owner, id)).status, 'COMPLETED');
  const ok = await ev(S.owner, 'CORRECT_ORDER', { id }, { reason: 'Falsche Pizza' }); assert.equal(ok.status, 200, JSON.stringify(ok.json).slice(0, 300));
  const c = ok.json.correction; assert.equal(c.mode, 'STORNO'); assert.ok(c.newOrderId && c.newOrderId !== id); assert.match(c.receiptNumber, /^STORNO-/);
  const old = await orderOf(S.owner, id); assert.equal(old.status, 'STORNIERT'); assert.equal(old.correctedBy, c.newOrderId); assert.equal(old.stornoReason, 'Falsche Pizza');
  const nu = await orderOf(S.owner, c.newOrderId); assert.equal(nu.status, 'OPEN'); assert.equal(nu.correctionOf, id); assert.equal(nu.cart[0].quantity, 2);
  // die Kasse holt offene Bestellungen von hier → die Korrektur ist dabei, die stornierte nicht
  const open = (await call('GET', '/api/kasse/open-orders', null, S.cashier)).json.orders.map(o => o.id); assert.ok(open.includes(c.newOrderId)); assert.ok(!open.includes(id));
  // zweites Mal / Korrektur der Korrektur vor Zahlung
  assert.equal((await ev(S.owner, 'CORRECT_ORDER', { id }, { reason: 'nochmal' })).status, 409);
  assert.equal((await ev(S.owner, 'CORRECT_ORDER', { id: c.newOrderId }, { reason: 'noch nicht bezahlt' })).status, 409);
  // die Korrektur lässt sich ganz normal weiterbearbeiten und bezahlen
  const edit = await ev(S.cashier, 'ORDER_SYNC', { ...nu, cart: [{ name: 'Pizza', unitCents: 1200, quantity: 1, options: [] }] }, { clientId: 'A' }); assert.equal(edit.status, 200);
  const pay = await ev(S.cashier, 'FINALIZE_PAYMENT', { ...nu, rev: edit.json.rev, cart: [{ name: 'Pizza', unitCents: 1200, quantity: 1, options: [] }] }, { paymentLines: [{ method: 'CARD', amountCents: 1200 }] }); assert.equal(pay.status, 200, JSON.stringify(pay.json).slice(0, 200));
});

test('Training: Kassierer öffnet bezahlte Trainings-Bestellung frei wieder (ohne Grund), danach normal bearbeitbar', async () => {
  const id = 'train-' + Date.now(); await sellAndPay(S.cashier, id, { training: true });
  assert.equal((await orderOf(S.owner, id)).status, 'COMPLETED');
  const r = await ev(S.cashier, 'CORRECT_ORDER', { id }, {}); assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 200));
  assert.equal(r.json.correction.mode, 'TRAINING_REOPEN'); assert.equal(r.json.correction.newOrderId, id);
  const o = await orderOf(S.owner, id); assert.equal(o.status, 'OPEN'); assert.equal(o.paymentId, undefined); assert.equal(o.correctionOf, undefined);
  const st = (await call('GET', '/api/kasse-state', null, S.owner)).json;
  assert.ok(!st.auditEvents.some(e => e.orderId === id && e.type === 'STORNO')); assert.ok(!st.payments.some(p => p.orderId === id));
  const edit = await ev(S.cashier, 'ORDER_SYNC', { ...o, cart: [{ name: 'Cola', unitCents: 300, quantity: 1, options: [] }] }, { clientId: 'A' }); assert.equal(edit.status, 200);
});

test('nicht bezahlt (OPEN) und Plattform: kein Storno', async () => {
  const id = 'open-' + Date.now(); await ev(S.owner, 'ORDER_SYNC', { id, type: 'local', cart: [{ name: 'X', unitCents: 100, quantity: 1 }] }, { clientId: 'A' });
  const r = await ev(S.owner, 'CORRECT_ORDER', { id }, { reason: 'zu früh' }); assert.equal(r.status, 409); assert.equal(r.json.code, 'NOT_COMPLETED');
  assert.equal((await orderOf(S.owner, id)).status, 'OPEN');
});
