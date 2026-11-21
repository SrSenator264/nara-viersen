'use strict';
// End-to-End: /api/accounting/health على السيرفر الحقيقي (مجلد data فاضي) — صلاحيات وشكل الرد والإعدادات.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-acchealth-'));
const port = 5300 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
let proc; const S = {};
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });
async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, text, cookie: sc ? sc.split(';')[0] : null };
}
test('Setup: Inhaber + Kasse + Buchhaltung', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200); S.owner = b.cookie;
  for (const [k, role, pin] of [['cashier', 'CASHIER', '4821'], ['acct', 'ACCOUNTANT', '482916']]) {
    const r = await call('POST', '/api/auth/staff', { name: k, role, pin }, S.owner); assert.equal(r.status, 200);
    const l = await call('POST', '/api/auth/login', { employeeId: r.json.id, pin }); assert.equal(l.status, 200); S[k] = l.cookie;
  }
});
test('Rechte: ohne Login 401, Kasse 403, Buchhaltung/Inhaber 200', async () => {
  assert.equal((await call('GET', '/api/accounting/health')).status, 401);
  assert.equal((await call('GET', '/api/accounting/health', null, S.cashier)).status, 403);
  const a = await call('GET', '/api/accounting/health', null, S.acct); assert.equal(a.status, 200);
  assert.equal(a.json.ok, true); assert.equal(a.json.klein.ytdCents, 0); assert.equal(a.json.month.total, 6); assert.ok(Array.isArray(a.json.deadlines));
  assert.equal((await call('GET', '/api/accounting/health?year=2026&month=13', null, S.owner)).status, 422);
  assert.equal((await call('GET', '/accounting-health.js', null, S.owner)).status === 200, false);
});
test('Einstellungen: Regime + manueller Umsatz wirken auf die Grenze', async () => {
  const p = await call('PUT', '/api/accounting/settings', { vatRegime: 'KLEIN', manualRevenueCents: { 2025: 3000000 } }, S.owner); assert.equal(p.status, 200);
  const r = await call('GET', '/api/accounting/health?year=2026&month=11', null, S.owner);
  assert.equal(r.json.klein.regime, 'KLEIN'); assert.equal(r.json.klein.prevYearCents, 3000000); assert.equal(r.json.klein.status, 'OVER'); assert.equal(r.json.klein.conflict, true);
});
test('Seite: accounting-home.html für Buchhaltung erreichbar', async () => {
  const r = await call('GET', '/accounting-home.html', null, S.acct); assert.equal(r.status, 200); assert.match(r.text, /api\/accounting\/health/);
});
