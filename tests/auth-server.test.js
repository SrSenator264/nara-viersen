'use strict';
// End-to-end Sicherheitstests: startet eine Kopie des Servers mit leerem data/-Ordner.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-auth-'));
const port = 4400 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
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

async function call(method, url, body, cookie, headers = {}) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, text, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
const S = {};

test('before setup: protected API is denied, data files not downloadable', async () => {
  for (const u of ['/api/kasse-state', '/api/customers', '/api/employees', '/api/delivery/config', '/api/accounting/accounts', '/api/delivery/driver-pay'])
    assert.equal((await call('GET', u)).status, 401, u);
  for (const u of ['/data/nara-admin.json', '/data/nara-auth.json', '/.env', '/server.js', '/auth.js', '/package.json', '/tests/auth.test.js', '/kitchen.js'])
    assert.equal((await call('GET', u)).status, 404, u);
  assert.equal((await call('GET', '/api/delivery/zones')).status, 200);
});

test('bootstrap creates owner once, weak PIN rejected', async () => {
  assert.equal((await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '1234' })).status, 422);
  const r = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' });
  assert.equal(r.status, 200); assert.equal(r.json.user.role, 'OWNER');
  assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Strict/);
  S.owner = r.cookie; S.ownerId = r.json.user.id;
  assert.equal((await call('POST', '/api/auth/bootstrap', { name: 'X', pin: '739402' })).status, 409);
});

test('owner creates cashier, kitchen, driver, accountant', async () => {
  for (const [k, role, pin] of [['cashier', 'CASHIER', '4821'], ['kitchen', 'KITCHEN', '5937'], ['driver', 'DRIVER', '2846'], ['acct', 'ACCOUNTANT', '482916']]) {
    const r = await call('POST', '/api/auth/staff', { name: k, role, pin }, S.owner); assert.equal(r.status, 200, k + JSON.stringify(r.json)); S[k + 'Id'] = r.json.id;
  }
  assert.equal((await call('POST', '/api/auth/staff', { name: 'bad', role: 'ACCOUNTANT', pin: '4821' }, S.owner)).status, 422);
  const list = await call('GET', '/api/auth/employees');
  assert.equal(list.json.employees.length, 5);
  assert.ok(!JSON.stringify(list.json).includes('hash') && !JSON.stringify(list.json).includes('pin'));
});

async function login(id, pin) { return call('POST', '/api/auth/login', { employeeId: id, pin }); }

test('role matrix', async () => {
  for (const k of ['cashier', 'kitchen', 'driver', 'acct']) { const r = await login(S[k + 'Id'], { cashier: '4821', kitchen: '5937', driver: '2846', acct: '482916' }[k]); assert.equal(r.status, 200, k); S[k] = r.cookie; }
  const exp = (c, m, u, st, body) => call(m, u, body, c).then(r => assert.equal(r.status === st || (st === 200 && r.status < 300), true, `${m} ${u} got ${r.status} want ${st}`));
  await exp(S.cashier, 'GET', '/api/kasse-state', 200);
  await exp(S.cashier, 'GET', '/api/customers', 200);
  await exp(S.cashier, 'GET', '/api/delivery/config', 403);
  await exp(S.cashier, 'POST', '/api/delivery/driver-pay', 403, {});
  await exp(S.cashier, 'GET', '/api/employees', 403);
  await exp(S.cashier, 'POST', '/api/auth/staff', 403, { name: 'x', role: 'CASHIER', pin: '4821' });
  await exp(S.kitchen, 'GET', '/api/kasse-state', 200);
  await exp(S.kitchen, 'GET', '/api/customers', 403);
  await exp(S.driver, 'GET', '/api/kasse-state', 403);
  await exp(S.driver, 'GET', '/api/customers', 403);
  await exp(S.driver, 'GET', '/api/delivery/config', 403);
  await exp(S.driver, 'GET', '/api/accounting/accounts', 403);
  await exp(S.acct, 'GET', '/api/accounting/accounts', 200);
  await exp(S.acct, 'GET', '/api/kasse-state', 403);
  await exp(S.owner, 'GET', '/api/delivery/config', 200);
  await exp(S.owner, 'GET', '/api/auth/team', 200);
});

test('pay data never reaches non-managers', async () => {
  const pay = await call('POST', '/api/delivery/driver-pay', { employeeId: S.driverId, zoneCents: { 'viersen-core': 777 }, factor: 1.3 }, S.owner); assert.equal(pay.status, 200);
  const cfg = await call('GET', '/api/delivery/config', null, S.owner); assert.equal(cfg.status, 200);
  for (const k of ['cashier', 'kitchen', 'driver']) for (const u of ['/api/kasse-state', '/api/kasse/open-orders', '/api/delivery/zones']) {
    const r = await call('GET', u, null, S[k]);
    assert.ok(!/driverPay|hourlyRate|payRecord|monthlySalary|"zoneCents"|777/i.test(r.text), `${k} ${u} leaks pay data`);
  }
});

test('kitchen cannot pay, event employeeId comes from session', async () => {
  const order = { id: 'o1', cart: [{ unitCents: 500, quantity: 1, name: 'x' }], total: 5 };
  const k = await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', order, payload: {} }, S.kitchen); assert.equal(k.status, 403);
  const c = await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', employeeId: 'spoofed', order }, S.cashier);
  assert.notEqual(c.status, 401); assert.notEqual(c.status, 403);
  const d = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'nara-admin.json'), 'utf8'));
  const stored = (d.orders || []).find(x => x.id === 'o1');
  if (stored && stored.employeeId) assert.notEqual(stored.employeeId, 'spoofed');
});

test('lockout after repeated wrong PINs, correct PIN also locked', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login(S.cashierId, '0001')).status, 401);
  const r = await login(S.cashierId, '4821'); assert.equal(r.status, 429);
});

test('logout invalidates session; set-pin revokes sessions', async () => {
  const o2 = await login(S.ownerId, '739402'); assert.equal(o2.status, 200);
  await call('POST', '/api/auth/logout', {}, o2.cookie);
  assert.equal((await call('GET', '/api/auth/team', null, o2.cookie)).status, 401);
  assert.equal((await call('POST', '/api/auth/set-pin', { employeeId: S.driverId, pin: '9283' }, S.owner)).status, 200);
  assert.equal((await call('GET', '/api/kasse-state', null, S.driver)).status, 401);
});

test('last manager cannot be deactivated; platform import needs service access', async () => {
  const r = await call('POST', '/api/auth/staff', { id: S.ownerId, name: 'Chef', role: 'OWNER', active: false }, S.owner); assert.equal(r.status, 409);
  const imp = await call('POST', '/api/platform-orders/import', { orders: [] });
  assert.notEqual(imp.status, 401); // loopback = service access
  const imp2 = await call('POST', '/api/platform-orders/import', { orders: [] }, null, { 'x-forwarded-for': '8.8.8.8' });
  assert.equal(imp2.status, 401);
});

test('cross-origin writes blocked; protected pages carry the login script', async () => {
  const r = await call('POST', '/api/auth/logout', {}, S.owner, { origin: 'http://evil.example' }); assert.equal(r.status, 403);
  const page = await call('GET', '/kasse.html'); assert.equal(page.status, 200); assert.match(page.text, /nara-auth\.js/);
  assert.doesNotMatch((await call('GET', '/index.html')).text, /nara-auth\.js/);
});

test('two devices: an older version of an order cannot overwrite a newer one, server-owned fields are kept', async () => {
  const id = 'sync-' + Date.now();
  const base = { id, type: 'pickup', cart: [{ name: 'Burger', unitCents: 899, quantity: 1, options: [] }] };
  const a = await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: base }, S.cashier);
  assert.equal(a.status, 200); assert.equal(a.json.rev, 1);
  const b = await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: { ...base, rev: 1, cart: [{ ...base.cart[0], quantity: 3 }] } }, S.cashier);
  assert.equal(b.status, 200); assert.equal(b.json.rev, 2);
  const stale = await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: { ...base, rev: 1, cart: [{ ...base.cart[0], quantity: 5 }] } }, S.cashier);
  assert.equal(stale.status, 409); assert.equal(stale.json.code, 'ORDER_CONFLICT'); assert.equal(stale.json.order.cart[0].quantity, 3);
  // المطبخ غيّر الحالة؛ الكاشير بنسخة فيها حالة قديمة ما بيكتب فوقها
  assert.equal((await call('POST', '/api/kitchen/orders', { orderId: id, kitchenStatus: 'READY' }, S.kitchen)).status, 200);
  const again = await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order: { ...base, rev: 2, kitchenStatus: 'NEW', cart: [{ ...base.cart[0], quantity: 3 }] } }, S.cashier);
  assert.equal(again.status, 200); assert.equal(again.json.order.kitchenStatus, 'READY');
});

test('Lieferando bridge: heartbeat/alert from this PC, status for cashier, old Chrome extension rejected', async () => {
  assert.equal((await call('GET', '/api/platform-orders/status')).status, 401);
  let r = await call('GET', '/api/platform-orders/status', null, S.cashier);
  assert.equal(r.status, 200); assert.equal(r.json.platforms[0].state, 'down');
  assert.equal((await call('POST', '/api/platform-orders/heartbeat', { source: 'LIEFERANDO', bridge: 'playwright', lastOkAt: new Date().toISOString(), loggedOut: false })).status, 200);
  r = await call('GET', '/api/platform-orders/status', null, S.kitchen);
  assert.equal(r.json.platforms[0].state, 'ok');
  assert.equal((await call('POST', '/api/platform-orders/alert', { source: 'LIEFERANDO', type: 'SESSION_EXPIRED' })).status, 200);
  r = await call('GET', '/api/platform-orders/status', null, S.cashier);
  assert.equal(r.json.platforms[0].state, 'login');
  assert.ok([401, 403].includes((await call('GET', '/api/platform-orders/status', null, S.driver)).status));
  r = await call('POST', '/api/platform-orders/import', { source: 'LIEFERANDO', order: { externalOrderCode: 'ABC', rawText: 'x', cart: [{ name: 'Lieferando order', quantity: 1, unitCents: 1000 }] } });
  assert.equal(r.status, 422); assert.equal(r.json.code, 'LEGACY_BRIDGE');
});
