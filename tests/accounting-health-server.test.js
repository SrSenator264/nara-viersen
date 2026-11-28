'use strict';
// End-to-End: /api/accounting/health على السيرفر الحقيقي (مجلد data فاضي) — صلاحيات وشكل الرد والإعدادات.
const test = require('node:test'), assert = require('node:assert/strict');
const { stopServer } = require('./helpers/stop-server.js');
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
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { return stopServer(proc, tmp); });
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
test('KI-Buchhalter: Status, ohne Schlüssel 503 NO_AI_KEY, Kasse 403, alte Assistant-Route gleich', async () => {
  const st = await call('GET', '/api/accounting/agent/status', null, S.acct); assert.equal(st.status, 200); assert.equal(st.json.configured, false); assert.equal(st.json.usage.calls, 0);
  const a = await call('POST', '/api/accounting/agent', { message: 'Umsatz gestern?' }, S.owner); assert.equal(a.status, 503); assert.equal(a.json.code, 'NO_AI_KEY');
  assert.equal((await call('POST', '/api/accounting/assistant', { message: 'x' }, S.owner)).json.code, 'NO_AI_KEY');
  assert.equal((await call('POST', '/api/accounting/agent', { message: 'x' }, S.cashier)).status, 403);
  assert.equal((await call('POST', '/api/accounting/agent', { message: 'x' })).status, 401);
  const pg = await call('GET', '/accounting-agent.html', null, S.acct); assert.equal(pg.status, 200);
});
test('Smart-Endpunkte: Auffälligkeiten, Bank-Vorschläge, Auszug ohne Schlüssel, Wochenbericht-Test, Kasse 403', async () => {
  const a = await call('GET', '/api/accounting/anomalies', null, S.acct); assert.equal(a.status, 200); assert.ok(Array.isArray(a.json.anomalies));
  assert.ok(a.json.anomalies.some(x => x.type === 'VAT_ON_KLEIN'), 'KLEIN + 7 % aus vorherigem Test');
  const b = await call('GET', '/api/accounting/bank-suggestions', null, S.acct); assert.equal(b.status, 200); assert.deepEqual(b.json.suggestions, []);
  const r = await call('POST', '/api/accounting/bank-statement/read', { filename: 'a.pdf', mime: 'application/pdf', data: 'JVBERi0x' }, S.owner); assert.equal(r.status, 503); assert.equal(r.json.code, 'NO_AI_KEY');
  assert.equal((await call('POST', '/api/accounting/bank-statement/read', { filename: 'a.exe', data: 'x' }, S.owner)).status, 422);
  const w = await call('POST', '/api/accounting/weekly/test', {}, S.owner); assert.equal(w.status, 200); assert.match(w.json.text, /ملخص المحاسبة/);
  assert.equal((await call('GET', '/api/accounting/anomalies', null, S.cashier)).status, 403);
  assert.equal((await call('GET', '/banking.html', null, S.acct)).status, 200);
});
test('Plattform-Abrechnungen: speichern, doppelt 409, Liste mit Vergleich, Lesen ohne Schlüssel 503', async () => {
  const st = { platform: 'LIEFERANDO', documentKind: 'SETTLEMENT', invoiceNumber: 'LF-1', periodFrom: '2026-11-01', periodTo: '2026-11-07', ordersCount: 0, grossCents: 0, payoutCents: 0 };
  assert.equal((await call('POST', '/api/accounting/platform-statement/save', { statement: { ...st, periodFrom: null } }, S.owner)).status, 422);
  const s = await call('POST', '/api/accounting/platform-statement/save', { statement: st }, S.owner); assert.equal(s.status, 201);
  assert.equal((await call('POST', '/api/accounting/platform-statement/save', { statement: st }, S.owner)).status, 409);
  const l = await call('GET', '/api/accounting/platform-statements', null, S.acct); assert.equal(l.json.statements.length, 1); assert.equal(l.json.statements[0].comparison.ok, true);
  assert.equal((await call('POST', '/api/accounting/platform-statement/read', { filename: 'a.pdf', mime: 'application/pdf', data: 'JVBE' }, S.owner)).status, 503);
  assert.equal((await call('POST', '/api/accounting/platform-statement/save', { statement: st }, S.cashier)).status, 403);
});
test('EÜR-Endpunkt', async () => {
  const r = await call('GET', '/api/accounting/euer?year=2026', null, S.acct); assert.equal(r.status, 200); assert.equal(r.json.euer.year, 2026); assert.ok(Array.isArray(r.json.euer.warnings));
  assert.equal((await call('GET', '/api/accounting/euer?year=1900', null, S.acct)).status, 422);
});
test('Manager-Endpunkte: Status, Chat ohne Schlüssel 503, Aufgaben leer, Buchhaltung/Kasse 403', async () => {
  const st = await call('GET', '/api/manager/status', null, S.owner); assert.equal(st.status, 200); assert.equal(st.json.configured, false);
  assert.equal((await call('POST', '/api/manager/chat', { message: 'hi' }, S.owner)).json.code, 'NO_AI_KEY');
  assert.deepEqual((await call('GET', '/api/manager/tasks', null, S.owner)).json.tasks, []);
  assert.equal((await call('POST', '/api/manager/tasks/status', { id: 'x', status: 'DONE' }, S.owner)).status, 422);
  assert.equal((await call('POST', '/api/manager/chat', { message: 'hi' }, S.cashier)).status, 403);
  assert.equal((await call('POST', '/api/manager/chat', { message: 'hi' }, S.acct)).status, 403);
  assert.equal((await call('GET', '/manager.html', null, S.owner)).status, 200);
});
test('Einkauf/Kassenbuch/Auto-Buchung Endpunkte', async () => {
  const p = await call('GET', '/api/accounting/purchases?year=2026&month=11', null, S.acct); assert.equal(p.status, 200); assert.equal(p.json.current.invoices, 0);
  assert.equal((await call('POST', '/api/accounting/purchases/category', { description: 'Mystery', category: 'NOPE' }, S.owner)).status, 422);
  assert.equal((await call('POST', '/api/accounting/purchases/category', { description: 'Mystery', category: 'PACKAGING' }, S.owner)).status, 200);
  const k = await call('GET', '/api/accounting/kassenbuch?year=2026&month=11', null, S.acct); assert.equal(k.status, 200); assert.match(k.json.csv, /Datum;Z-Nr/);
  await call('GET', '/api/accounting/accounts', null, S.owner);
  const a = await call('POST', '/api/accounting/auto-post', {}, S.owner); assert.equal(a.status, 200); assert.equal(a.json.createdCount, 0);
  const acc = await call('GET', '/api/accounting/accounts', null, S.owner); assert.ok(acc.json.accounts.some(x => x.number === '4100'));
});
