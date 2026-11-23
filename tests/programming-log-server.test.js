'use strict';
// End-to-end Sicherheitstests: startet eine Kopie des Servers mit leerem data/-Ordner.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-auth-'));
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


test('Programmierprotokoll (Server): Menü-Preis, Einstellungen, Rollen & PIN werden protokolliert, Geheimnisse nicht; nur Manager lesen', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); const owner = b.cookie;
  const c = await call('POST', '/api/auth/staff', { name: 'Kasse1', role: 'CASHIER', pin: '4821' }, owner); const cashierId = c.json.id;
  // Menü: Preis ändern
  const cur = await call('GET', '/api/admin-data', null, owner); const prods = (cur.json && cur.json.products) || [];
  const items = [...prods.filter(p => p.id !== 'zz1'), { id: 'zz1', name: 'Testburger', priceCents: 1000, vatRate: 7 }];
  assert.equal((await call('POST', '/api/admin-data', { collection: 'products', items }, owner)).status, 200);
  assert.equal((await call('POST', '/api/admin-data', { collection: 'products', items: items.map(p => (p.id === 'zz1' ? { ...p, priceCents: 1200 } : p)) }, owner)).status, 200);
  // Einstellungen + Rolle + PIN
  assert.equal((await call('PUT', '/api/accounting/settings', { vatRegime: 'REGEL' }, owner)).status, 200);
  assert.equal((await call('POST', '/api/auth/staff', { id: cashierId, name: 'Kasse1', role: 'KITCHEN' }, owner)).status, 200);
  assert.equal((await call('POST', '/api/auth/set-pin', { employeeId: cashierId, pin: '5937' }, owner)).status, 200);
  const r = await call('GET', '/api/programming-log', null, owner); assert.equal(r.status, 200); assert.equal(r.json.verify.ok, true);
  const f = (area, field) => r.json.entries.find(e => e.area === area && e.field === field);
  const price = r.json.entries.find(e => e.field === 'priceCents'); assert.deepEqual([price.before, price.after, price.user], [1000, 1200, 'Chef']);
  assert.equal(f('ACCOUNTING_SETTINGS', 'vatRegime').after, 'REGEL');
  assert.deepEqual([f('USERS', 'role').before, f('USERS', 'role').after], ['CASHIER', 'KITCHEN']);
  assert.equal(f('USERS', 'pin').after, '***');
  for (const secret of ['4821', '5937', '739402']) assert.ok(!r.text.includes(secret), secret);
  const csv = await call('GET', '/api/programming-log?format=csv', null, owner); assert.equal(csv.status, 200); assert.match(csv.text, /Zeit;Benutzer/);
  const cs = (await call('POST', '/api/auth/login', { employeeId: cashierId, pin: '5937' })).cookie; // Sitzung wurde bei Rollen-/PIN-Änderung beendet
  assert.equal((await call('GET', '/api/programming-log', null, cs)).status, 403);
  assert.equal((await call('GET', '/api/programming-log')).status, 401);
  assert.equal((await call('GET', '/programming-log.js')).status, 404);
});
