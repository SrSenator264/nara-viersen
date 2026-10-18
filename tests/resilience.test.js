'use strict';
// Ausfall- und Lasttests am echten Server (Kopie mit eigenem data/-Ordner). Läuft ohne Internet und ohne Playwright.
// Große Variante (2 Jahre Betrieb, ~60 MB):  NARA_STRESS=1 node --test tests/resilience.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const DAYS = process.env.NARA_STRESS ? 730 : 180; // 180 Tage × 40 Bestellungen ≈ 7 200 Bestellungen (~15 MB)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-res-'));
const port = 4800 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const dataFile = path.join(tmp, 'data', 'nara-admin.json');
let proc, cookie = '', tg, telegramMsgs = [];
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'android-app', 'tests', 'web-prototype', 'backups']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function up() {
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, stdio: 'ignore', env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', TELEGRAM_BOT_TOKEN: 'TT', TELEGRAM_CHAT_ID: '7', TELEGRAM_API_BASE: `http://127.0.0.1:${tg.address().port}` } });
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/health'); return; } catch { await sleep(150); } }
  throw new Error('server did not start');
}
const down = async () => { if (proc) { proc.kill(); await sleep(300); proc = null; } };
async function api(method, url, body, extra = {}) {
  const t0 = Date.now(), r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, bytes: Buffer.byteLength(text), ms: Date.now() - t0, headers: r.headers };
}
function seed(days) {
  const d = JSON.parse(fs.readFileSync(dataFile, 'utf8')), start = Date.now() - days * 864e5, mkItems = n => Array.from({ length: n }, (_, i) => ({ id: 'menu_' + i, name: 'Smashed Beef Burger ' + i, qty: 1, priceCents: 899 + i * 50, options: [{ name: 'Käse', priceCents: 100 }], note: 'ohne Zwiebeln' }));
  const orders = [], payments = [], receipts = [], fiscal = [], audit = []; let n = 0;
  for (let k = 0; k < days; k++) for (let j = 0; j < 40; j++) {
    n++; const at = new Date(start + k * 864e5 + j * 600000).toISOString(), id = 'ord_' + n.toString(36);
    orders.push({ id, source: ['KASSE', 'LIEFERANDO', 'UBER_EATS', 'WEB'][j % 4], status: 'COMPLETED', createdAt: at, completedAt: at, items: mkItems(4), totalCents: 2499, delivery: { address: 'Gereonstraße ' + j + ', 41747 Viersen', phone: '0152' + n, driverNotes: 'Klingel kaputt' } });
    payments.push({ id: 'pay_' + n, orderId: id, method: 'CASH', amountCents: 2499, at }); receipts.push({ id: 'rc_' + n, orderId: id, at, lines: mkItems(4) });
    fiscal.push({ id: 'ft_' + n, orderId: id, at }); audit.push({ id: 'au_' + n, at, type: 'ORDER_PAID', orderId: id });
  }
  // zwei offene Bestellungen von heute müssen immer im Fenster sein
  for (const id of ['open_1', 'open_2']) orders.push({ id, source: 'LIEFERANDO', status: 'OPEN', createdAt: new Date().toISOString(), items: mkItems(2) });
  Object.assign(d, { orders, payments, receipts, fiscalTransactions: fiscal, auditEvents: audit });
  fs.writeFileSync(dataFile, JSON.stringify(d));
}

test.before(async () => {
  tg = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { telegramMsgs.push(JSON.parse(b)); } catch { /* */ } res.end('{"ok":true}'); }); });
  await new Promise(r => tg.listen(0, '127.0.0.1', r));
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) || s === root });
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'web-prototype'), { recursive: true });
  try { fs.copyFileSync(path.join(root, 'web-prototype', 'menu.json'), path.join(tmp, 'web-prototype', 'menu.json')); } catch { /* */ }
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=x\n');
  await up();
  const b = await fetch(base + '/api/auth/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Chef', pin: '739402' }) });
  cookie = b.headers.get('set-cookie').split(';')[0];
  await api('GET', '/api/kasse-state?days=1'); // erzeugt die Datendatei
  await down(); seed(DAYS); await up();
});
test.after(async () => { await down(); tg && tg.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('Health: /api/health ist öffentlich und schnell; Details nur für Manager', async () => {
  const pub = await api('GET', '/api/health', null, { cookie: '' }); assert.equal(pub.status, 200); assert.equal(pub.json.ok, true); assert.ok(pub.ms < 500);
  const anon = await fetch(base + '/api/health/details'); assert.equal(anon.status, 401);
  const det = await api('GET', '/api/health/details'); assert.equal(det.status, 200);
  for (const k of ['uptimeSec', 'lagMs', 'rssMb', 'diskFreeMb', 'dataMb', 'bridges', 'backups', 'telegram', 'alerts']) assert.ok(k in det.json, 'fehlt: ' + k);
  assert.equal(det.json.telegram, true); assert.ok(det.json.dataMb > 5, 'Testdaten sind wirklich groß: ' + det.json.dataMb);
});

test('Fenster: ?days=2 liefert nur Aktuelles + Offenes (klein), ohne Parameter bleibt alles kompatibel', async () => {
  await api('GET', '/api/kasse-state?days=2');
  const w = await api('GET', '/api/kasse-state?days=2');
  assert.ok(w.json.orders.length < 200, 'Orders im Fenster: ' + w.json.orders.length); assert.ok(w.json.orders.some(o => o.id === 'open_1') && w.json.orders.some(o => o.id === 'open_2'));
  assert.ok(w.bytes < 600 * 1024, 'Antwort ' + w.bytes + ' Byte');
  assert.ok(w.json.payments.every(p => w.json.orders.some(o => o.id === p.orderId) || Date.parse(p.at) > Date.now() - 2 * 864e5));
  assert.equal(w.json.window.totalOrders, DAYS * 40 + 2);
  const all = await api('GET', '/api/kasse-state'); assert.equal(all.json.orders.length, DAYS * 40 + 2, 'ohne days: komplette Historie wie früher');
});

test('Last: 200 Abfragen hintereinander + 30 gleichzeitig bleiben flott, Server antwortet dabei weiter', async () => {
  const t0 = Date.now(); for (let i = 0; i < 200; i++) assert.equal((await api('GET', '/api/kasse-state?days=2')).status, 200);
  assert.ok(Date.now() - t0 < 20000, '200 Abfragen: ' + (Date.now() - t0) + ' ms');
  const t1 = Date.now(), burst = Array.from({ length: 30 }, () => api('GET', '/api/kasse-state?days=2')), ping = api('GET', '/api/health');
  const [h, ...rs] = [await ping, ...await Promise.all(burst)]; assert.ok(rs.every(r => r.status === 200)); assert.equal(h.status, 200);
  assert.ok(Date.now() - t1 < 8000, '30 parallel: ' + (Date.now() - t1) + ' ms');
});

test('Last: 40 gleichzeitige Kundenabfragen + offene Bestellungen (alle 20 s pro Kasse)', async () => {
  const t0 = Date.now(), r = await Promise.all([...Array.from({ length: 20 }, () => api('GET', '/api/customers')), ...Array.from({ length: 20 }, () => api('GET', '/api/kasse/open-orders'))]);
  assert.ok(r.every(x => x.status === 200)); assert.ok(Date.now() - t0 < 8000, 'Dauer ' + (Date.now() - t0) + ' ms');
});

test('Schreiben unter Last: 10 gleichzeitige Speichervorgänge → keine 5xx, Datei bleibt gültiges JSON, keine Temp-Reste', async () => {
  const before = (await api('GET', '/api/admin-data')).json; assert.ok(before, 'admin-data lesbar');
  const writes = await Promise.all(Array.from({ length: 10 }, (_, i) => api('POST', '/api/customer-note', { customerId: 'c' + i, note: 'Test ' + i }).catch(e => ({ status: 0, err: e }))));
  assert.ok(writes.every(w => w.status > 0 && w.status < 500), 'Statuscodes: ' + writes.map(w => w.status));
  JSON.parse(fs.readFileSync(dataFile, 'utf8')); // Hauptdatei bleibt gültiges JSON
  assert.ok(!fs.readdirSync(path.join(tmp, 'data')).some(n => n.includes('.tmp-')), 'keine liegengebliebene Temp-Datei');
});

test('Kaputte/riesige Anfragen: 4xx statt Absturz, Server bleibt erreichbar', async () => {
  const bad = await api('POST', '/api/web-orders', '{"items":[', { cookie: '' }); assert.ok(bad.status >= 400 && bad.status < 500, 'kaputtes JSON → ' + bad.status);
  const huge = await api('POST', '/api/web-orders', JSON.stringify({ note: 'x'.repeat(400000) }), { cookie: '' }).catch(() => ({ status: 'dropped' })); // zu große Body: 4xx ODER Verbindung wird gekappt — beides ist ok, Hauptsache kein Absturz
  assert.ok(huge.status === 'dropped' || (huge.status >= 400 && huge.status < 500), 'zu groß → ' + huge.status);
  const nul = await api('POST', '/api/web-orders', 'null', { cookie: '' }); assert.ok(nul.status >= 400 && nul.status < 500, 'null → ' + nul.status);
  for (const u of ['/api/nope', '/%00', '/..%2f..%2fserver.js', '/api/kasse-state?days=abc', '/api/kasse-state?days=-5', '/api/kasse-state?days=99999999']) { const r = await api('GET', u); assert.ok(r.status < 500, u + ' → ' + r.status); }
  assert.equal((await api('GET', '/api/health')).status, 200);
});

test('Datei beschädigt (halb geschrieben): Server stellt aus .bak her, läuft weiter, meldet es per Telegram', async () => {
  const good = fs.readFileSync(dataFile, 'utf8'); fs.writeFileSync(dataFile + '.bak', good);
  fs.writeFileSync(dataFile, good.slice(0, Math.floor(good.length / 2))); // abgeschnitten wie bei Stromausfall
  telegramMsgs.length = 0;
  const r = await api('POST', '/api/customer-note', { customerId: 'cx', note: 'nach dem Absturz' }); // Schreibzugriff braucht Lesen
  assert.ok(r.status < 500, 'Antwort ' + r.status);
  const s = await api('GET', '/api/kasse-state?days=2'); assert.equal(s.status, 200); assert.ok(s.json.orders.length > 0, 'Daten sind wieder da');
  JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.ok(fs.readdirSync(path.join(tmp, 'data')).some(n => n.startsWith('nara-admin.json.corrupt-')), 'kaputte Datei aufgehoben');
  for (let i = 0; i < 20 && !telegramMsgs.length; i++) await sleep(100);
  assert.ok(telegramMsgs.some(m => m.chat_id === '7' && /تالف/.test(m.text)), 'Telegram-Meldung kam an');
  const det = (await api('GET', '/api/health/details')).json; assert.ok(det.alerts.some(a => a.key === 'data-recovered'));
});

test('0-Byte-Datei (Platte voll / Strom weg): ebenfalls Wiederherstellung statt Absturzschleife', async () => {
  fs.copyFileSync(dataFile, dataFile + '.bak'); fs.writeFileSync(dataFile, '');
  const s = await api('GET', '/api/kasse-state?days=2'); assert.equal(s.status, 200); assert.ok(s.json.orders.length > 0);
  assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).orders.length, DAYS * 40 + 2);
});

test('Absturz-Erkennung: unsauberes Ende (run-state) → beim Neustart kommt eine Telegram-Meldung', async () => {
  await down(); telegramMsgs.length = 0;
  fs.writeFileSync(path.join(tmp, 'data', 'run-state.json'), JSON.stringify({ pid: 1, startedAt: new Date(Date.now() - 3600000).toISOString(), lastBeatAt: new Date(Date.now() - 600000).toISOString(), cleanExit: false }));
  await up(); for (let i = 0; i < 30 && !telegramMsgs.length; i++) await sleep(100);
  assert.ok(telegramMsgs.some(m => /رجع اشتغل/.test(m.text)), 'Neustart-Meldung: ' + JSON.stringify(telegramMsgs));
});

test('Statusseite ist erreichbar und im Menü', async () => {
  const r = await fetch(base + '/status.html', { headers: { cookie } }); assert.equal(r.status, 200); assert.match(await r.text(), /api\/health\/details/);
});
