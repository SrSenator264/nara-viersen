'use strict';
// Kasse-Host (Tunnel): Login-Liste zeigt nach bestandener Access-/Mail-Prüfung (kasseGate ok) alle aktiven Konten,
// sonst über den Tunnel nur Fahrer. setupNeeded wird über den Tunnel nie verraten. End-to-end mit eigener Server-Kopie.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-kasse-list-'));
const port = 4800 + Math.floor(Math.random() * 400);
const KASSE_HOST = 'kasse.flamo.co.de', MAIL = 'me@example.com';
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
let proc;

test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', NARA_KASSE_HOST: KASSE_HOST, NARA_KASSE_EMAILS: MAIL }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await req('GET', '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

// node:http statt fetch, damit der Host-Header frei gesetzt werden kann.
function req(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', ...headers, ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, res => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { let json = null; try { json = JSON.parse(t); } catch { /* not json */ } resolve({ status: res.statusCode, json, text: t, setCookie: res.headers['set-cookie'] }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

const TUNNEL = { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.9' };
const KASSE_OK = { host: KASSE_HOST, ...TUNNEL, 'cf-access-authenticated-user-email': MAIL };

test('Kasse-Host: erlaubte Access-Mail -> alle aktiven Konten; sonst (anderer Host/Tunnel) nur Fahrer; PIN bleibt Pflicht', async () => {
  const b = await req('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' });
  assert.equal(b.status, 200);
  const cookie = String(b.setCookie).split(';')[0];
  for (const [name, role, pin] of [['cashier', 'CASHIER', '4821'], ['driver', 'DRIVER', '2846']]) {
    const r = await req('POST', '/api/auth/staff', { name, role, pin }, { cookie });
    assert.equal(r.status, 200, name + ' ' + r.text);
  }

  // Kasse-Host + erlaubte Access-Mail: alle aktiven Konten (Owner, Kasse, Fahrer), setupNeeded bleibt verborgen
  const ok = await req('GET', '/api/auth/employees', null, KASSE_OK);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.employees.map(e => e.role).sort(), ['CASHIER', 'DRIVER', 'OWNER']);
  assert.equal(ok.json.setupNeeded, false);

  // Anderer Tunnel-Host (kein Kasse-Host): weiterhin nur Fahrer
  const other = await req('GET', '/api/auth/employees', null, { host: 'app.flamo.co.de', ...TUNNEL });
  assert.equal(other.status, 200);
  assert.ok(other.json.employees.length >= 1 && other.json.employees.every(e => e.role === 'DRIVER'), JSON.stringify(other.json));
  assert.equal(other.json.setupNeeded, false);

  // Kasse-Host mit fremder Mail: gesperrt (403), keine Liste
  const bad = await req('GET', '/api/auth/employees', null, { ...KASSE_OK, 'cf-access-authenticated-user-email': 'evil@example.com' });
  assert.equal(bad.status, 403);

  // Login ohne richtige PIN klappt auch auf dem Kasse-Host nicht
  const owner = ok.json.employees.find(e => e.role === 'OWNER');
  const wrong = await req('POST', '/api/auth/login', { employeeId: owner.id, pin: '000000' }, KASSE_OK);
  assert.equal(wrong.status, 401);
});
