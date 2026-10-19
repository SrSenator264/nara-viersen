'use strict';
// Kasse über Tunnel: nur mit Cloudflare-Access-Mail aus der Liste (Handy), sonst 403. Unit + End-to-end.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), { spawn } = require('node:child_process');
const { kasseGate } = require('../kasse-gate.js');
const ENV = { NARA_KASSE_HOST: 'kasse.flamo.co.de', NARA_KASSE_EMAILS: 'Me@Example.com, other@example.com' };
const rq = (host, headers = {}, sock = '127.0.0.1') => ({ headers: { host, ...headers }, socket: { remoteAddress: sock } });
const GOOD = { 'cf-connecting-ip': '1.2.3.4', 'cf-access-authenticated-user-email': 'me@example.com' };

test('ohne NARA_KASSE_HOST: nichts gesperrt', () => assert.equal(kasseGate(rq('kasse.flamo.co.de'), {}).gated, false));
test('anderer Host (app.flamo.co.de, localhost): nicht betroffen', () => {
  assert.equal(kasseGate(rq('app.flamo.co.de'), ENV).gated, false);
  assert.equal(kasseGate(rq('localhost:4185'), ENV).gated, false);
});
test('Kasse-Host mit erlaubter Access-Mail über Loopback + Tunnel-Header: ok (Groß/Klein egal)', () => {
  const g = kasseGate(rq('kasse.flamo.co.de', GOOD), ENV);
  assert.deepEqual([g.gated, g.ok, g.email], [true, true, 'me@example.com']);
  assert.equal(kasseGate(rq('KASSE.flamo.co.de:443', { ...GOOD, 'cf-access-authenticated-user-email': 'OTHER@example.com' }), ENV).ok, true);
});
test('Kasse-Host: fremde/keine Mail, fehlender Tunnel-Header oder Nicht-Loopback -> gesperrt', () => {
  const bad = [
    rq('kasse.flamo.co.de'),
    rq('kasse.flamo.co.de', { ...GOOD, 'cf-access-authenticated-user-email': 'evil@example.com' }),
    rq('kasse.flamo.co.de', { 'cf-access-authenticated-user-email': 'me@example.com' }),
    rq('kasse.flamo.co.de', GOOD, '192.168.1.50'),
    rq('kasse.flamo.co.de', GOOD, '::ffff:192.168.1.50'),
  ];
  for (const r of bad) { const g = kasseGate(r, ENV); assert.deepEqual([g.gated, g.ok], [true, false]); }
  assert.equal(kasseGate(rq('kasse.flamo.co.de', GOOD), { NARA_KASSE_HOST: 'kasse.flamo.co.de' }).ok, false, 'leere Liste = alles zu');
});

const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-kg-'));
const port = 4900 + Math.floor(Math.random() * 300);
let proc;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, ...ENV, PORT: String(port), HOST: '127.0.0.1', NARA_NO_MONITOR: '1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await get('app.flamo.co.de', '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
const get = (host, p, headers = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, headers: { host, ...headers } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); });
  r.on('error', rej); r.end();
});

test('Server: kasse-Host ohne Access-Mail -> 403 (Seite und API), mit Mail -> normal (Login-Seite/401)', async () => {
  for (const p of ['/kasse.html', '/kasse.js', '/api/kasse-state', '/api/auth/me', '/icons/kasse.webmanifest']) assert.equal((await get('kasse.flamo.co.de', p, { 'cf-connecting-ip': '1.2.3.4' })).status, 403, p);
  assert.equal((await get('kasse.flamo.co.de', '/kasse.html', { 'cf-connecting-ip': '1.2.3.4', 'cf-access-authenticated-user-email': 'evil@example.com' })).status, 403);
  const ok = await get('kasse.flamo.co.de', '/api/kasse-state', GOOD);
  assert.notEqual(ok.status, 403); // weiter durch das normale Login (401/200), die Sperre ist nur die erste Schicht
});
test('Server: app-Host und lokale Nutzung bleiben unberührt', async () => {
  assert.notEqual((await get('app.flamo.co.de', '/driver.html', { 'cf-connecting-ip': '1.2.3.4' })).status, 403);
  assert.notEqual((await get('127.0.0.1:' + port, '/kasse.html')).status, 403);
});
test('kasse.html: Manifest + Icon für Startbildschirm', () => {
  const h = fs.readFileSync(path.join(root, 'kasse.html'), 'utf8');
  assert.ok(/rel="manifest" href="icons\/kasse\.webmanifest"/.test(h));
  const m = JSON.parse(fs.readFileSync(path.join(root, 'icons', 'kasse.webmanifest'), 'utf8'));
  assert.equal(m.start_url, '/kasse.html'); assert.equal(m.display, 'standalone');
});
test('Tunnel-Beispiel: kasse-Host vor dem 404-Catch-all', () => {
  const y = fs.readFileSync(path.join(root, 'tunnel', 'config.example.yml'), 'utf8');
  assert.ok(y.indexOf('hostname: kasse.flamo.co.de') > 0 && y.indexOf('hostname: kasse.flamo.co.de') < y.lastIndexOf('http_status:404'));
});
