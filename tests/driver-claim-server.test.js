'use strict';
// End-to-end: POST /api/driver/claim gegen einen echten Server (Kopie mit leerem data/-Ordner).
// Beweist, dass die Route wirklich erreichbar ist (nicht 404) und mit Fahrer-Login + QR-Text funktioniert.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-claim-'));
const port = 5400 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
const SCOOBER = 'https://mca.scoober.com/qr/?ref=ABC123XY&id=0123456789abcdef0123456789abcdef';
let proc, cookie;
async function call(method, url, body, ck = cookie) {
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

test('claim over HTTP: login required, owner refused, driver adds order by our link / Scoober URL, route shows up in /api/driver/routes', async () => {
  // ohne Login: 401 (nicht 404)
  assert.equal((await call('POST', '/api/driver/claim', { code: 'x' }, null)).status, 401);
  // Chef + Einladung + Fahrer
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200, b.text); const chef = b.cookie || cookie;
  const boss = await call('POST', '/api/driver/claim', { code: 'x' }, chef);
  assert.equal(boss.status, 403); assert.equal(boss.json.code, 'DRIVERS_ONLY');
  const inv = await call('POST', '/api/auth/invite', {}, chef); assert.equal(inv.status, 200, inv.text);
  const t = new URL(inv.json.url).searchParams.get('t');
  const j = await call('POST', '/api/auth/join', { token: t, name: 'Ehab', pin: '5821' }, null); assert.equal(j.status, 200, j.text);
  const drv = j.cookie; assert.ok(drv);
  // Bestellungen direkt in die Daten schreiben (Server liest bei jedem Aufruf neu)
  const f = path.join(tmp, 'data', 'nara-admin.json'), d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const mk = (id, extra) => ({ id, displayCode: id.toUpperCase(), source: 'NARA', type: 'DELIVERY', status: 'OPEN', createdAt: new Date().toISOString(), totalCents: 1500, paymentMethod: 'CASH', cart: [], delivery: { lat: 51.26, lng: 6.39, street: 'Teststr. 1' }, ...extra });
  d.orders.push(mk('own1', { deliveryQrToken: 'delivery-qr_TEST', ownDeliveryQrUrl: 'https://app.flamo.co.de/delivery.html?token=delivery-qr_TEST' }), mk('lief1', { source: 'LIEFERANDO', platform: 'LIEFERANDO', externalOrderCode: 'ABC123XY', displayCode: 'ABC123XY', deliveryQrUrl: SCOOBER, delivery: { lat: 51.30, lng: 6.45, street: 'Weit 9' } }));
  fs.writeFileSync(f, JSON.stringify(d));
  // 1) unser Link
  const r1 = await call('POST', '/api/driver/claim', { code: 'https://app.flamo.co.de/delivery.html?token=delivery-qr_TEST' }, drv);
  assert.equal(r1.status, 200, r1.text); assert.equal(r1.json.ok, true); assert.equal(r1.json.already, false); assert.equal(r1.json.stops, 1);
  // 2) dasselbe nochmal = already
  const r1b = await call('POST', '/api/driver/claim', { code: 'https://app.flamo.co.de/delivery.html?token=delivery-qr_TEST' }, drv);
  assert.equal(r1b.status, 200); assert.equal(r1b.json.already, true);
  // 3) Lieferando/Scoober-QR, Fahrer ist schon unterwegs-fähig: zweite Station
  const r2 = await call('POST', '/api/driver/claim', { code: SCOOBER, lat: 51.255, lng: 6.39 }, drv);
  assert.equal(r2.status, 200, r2.text); assert.equal(r2.json.stops, 2); assert.equal(r2.json.code, 'ABC123XY');
  // 4) Fehlerfälle mit Code
  const nf = await call('POST', '/api/driver/claim', { code: 'https://mca.scoober.com/qr/?ref=NOPE&id=ffffffffffffffffffffffffffffffff' }, drv);
  assert.equal(nf.status, 404); assert.equal(nf.json.code, 'NOT_FOUND');
  // 5) Fahrer sieht beide Stopps in seiner Tour
  const rt = await call('GET', '/api/driver/routes', null, drv);
  assert.equal(rt.status, 200); assert.equal(rt.json.routes.length, 1); assert.equal(rt.json.routes[0].stops.length, 2);
  assert.deepEqual(rt.json.routes[0].stops.map(s => s.code).sort(), ['ABC123XY', 'OWN1']);
});
