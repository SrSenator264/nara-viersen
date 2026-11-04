'use strict';
// End-to-end gegen einen echten Server (Kopie mit leerem data/-Ordner): iPhone-Fahrer meldet Position per Traccar-Token.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-track-'));
const port = 5900 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
let proc;
async function call(method, url, body, ck) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, text, cookie: sc && /nara/i.test(sc) ? sc.split(';')[0] : null };
}
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data')); fs.writeFileSync(path.join(tmp, '.env'), 'X=1\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', NARA_GEOCODE: 'off', QONTO_LOGIN: '', QONTO_SECRET: '' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('Traccar-Token: Verwaltung nur für Chef, Meldung per Token landet in auto-plan, falsche Tokens/Koordinaten werden abgelehnt', async () => {
  // ohne Login: Token-Verwaltung gesperrt, Meldung ohne/mit falschem Token = 401 (nicht 404)
  assert.equal((await call('GET', '/api/driver/track-tokens')).status, 401);
  assert.equal((await call('GET', '/api/driver/track?id=nope&lat=51.25&lon=6.39')).status, 401);

  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200, b.text); const chef = b.cookie;
  const inv = await call('POST', '/api/auth/invite', {}, chef); assert.equal(inv.status, 200, inv.text);
  const t = new URL(inv.json.url).searchParams.get('t');
  const j = await call('POST', '/api/auth/join', { token: t, name: 'Ehab', pin: '5821' }, null); assert.equal(j.status, 200, j.text);
  const drv = j.cookie;
  const driverId = (await call('GET', '/api/auth/me', null, drv)).json.user.id;

  // Fahrer selbst darf keine Tokens verwalten
  assert.equal((await call('GET', '/api/driver/track-tokens', null, drv)).status, 403);

  // Chef: Fahrer-Liste, Token erzeugen, stabil, neu erzeugen
  const list = await call('GET', '/api/driver/track-tokens', null, chef);
  assert.equal(list.status, 200, list.text);
  assert.ok(list.json.serverUrl.endsWith('/api/driver/track'));
  assert.ok(list.json.drivers.some(d => d.id === driverId && d.token === null));
  const c1 = await call('POST', '/api/driver/track-tokens', { employeeId: driverId }, chef); assert.equal(c1.status, 200, c1.text);
  const tok = c1.json.token; assert.match(tok, /^trk_/);
  assert.equal((await call('POST', '/api/driver/track-tokens', { employeeId: driverId }, chef)).json.token, tok);
  assert.equal((await call('POST', '/api/driver/track-tokens', { employeeId: 'gibts-nicht' }, chef)).status, 404);
  assert.equal((await call('POST', '/api/driver/track-tokens', { employeeId: driverId }, drv)).status, 403);

  // gültige Meldung (GET-Query im OsmAnd-Format)
  const ok = await call('GET', `/api/driver/track?id=${tok}&lat=51.2556&lon=6.3936&accuracy=9&timestamp=${Math.floor(Date.now() / 1000)}`);
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.ok, true);
  const plan = await call('GET', '/api/delivery/auto-plan', null, chef);
  assert.equal(plan.status, 200, plan.text);
  const pos = (plan.json.positions || []).find(p => p.name === 'Ehab');
  assert.ok(pos, 'Position des iPhone-Fahrers fehlt in positions: ' + JSON.stringify(plan.json.positions));
  assert.equal(pos.lat, 51.2556); assert.equal(pos.lng, 6.3936);

  // ungültige Koordinaten -> 422, Position bleibt
  await new Promise(r => setTimeout(r, 2100));
  assert.equal((await call('GET', `/api/driver/track?id=${tok}&lat=999&lon=6.39`)).status, 422);

  // JSON-Body (neuer Traccar-Client) nach Ablauf der Mindest-Pause
  await new Promise(r => setTimeout(r, 2100));
  const js = await call('POST', '/api/driver/track', { device_id: tok, location: { timestamp: new Date().toISOString(), coords: { latitude: 51.26, longitude: 6.4, accuracy: 5 } } });
  assert.equal(js.status, 200, js.text);
  const pos2 = ((await call('GET', '/api/delivery/auto-plan', null, chef)).json.positions || []).find(p => p.name === 'Ehab');
  assert.equal(pos2.lat, 51.26);

  // Token neu erzeugen: alter Token tot
  const c2 = await call('POST', '/api/driver/track-tokens', { employeeId: driverId, regenerate: true }, chef);
  assert.notEqual(c2.json.token, tok);
  assert.equal((await call('GET', `/api/driver/track?id=${tok}&lat=51.25&lon=6.39`)).status, 401);
});
