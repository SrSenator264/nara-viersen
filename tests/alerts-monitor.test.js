'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const { create } = require('../alerts.js');
const { evaluate, LIMITS } = require('../monitor.js');

const mk = (over = {}) => { let t = 1_000_000; const sent = []; const a = create({ env: { TELEGRAM_BOT_TOKEN: 'SECRET:TOKEN', TELEGRAM_CHAT_ID: '42', ...over.env }, now: () => t, log: () => {}, fetchFn: over.fetchFn || (async (url, o) => { sent.push({ url, body: JSON.parse(o.body) }); return { ok: true }; }) }); return { a, sent, tick: ms => { t += ms; } }; };

test('Telegram: Nachricht geht an die richtige Chat-ID, Token nur in der URL', async () => {
  const { a, sent } = mk();
  assert.equal((await a.send('k', 'Hallo')).sent, true);
  assert.equal(sent[0].url, 'https://api.telegram.org/botSECRET:TOKEN/sendMessage'); assert.equal(sent[0].body.chat_id, '42'); assert.equal(sent[0].body.text, 'Hallo');
});

test('gleiche Warnung wird nur alle 30 min gesendet; force umgeht das; Wiederholung nach Ablauf', async () => {
  const { a, sent, tick } = mk();
  await a.send('lag', '1'); assert.equal((await a.send('lag', '2')).reason, 'deduped');
  assert.equal((await a.send('other', '3')).sent, true);
  assert.equal((await a.send('lag', '4', { force: true })).sent, true);
  tick(31 * 60000); assert.equal((await a.send('lag', '5')).sent, true); assert.equal(sent.length, 4);
});

test('ohne Zugangsdaten: kein Netzwerkaufruf, aber Eintrag in der Liste (Statusseite)', async () => {
  let called = false; const { a } = mk({ env: { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' }, fetchFn: async () => { called = true; return { ok: true }; } });
  assert.equal(a.configured(), false); assert.equal((await a.send('x', 'ohne Telegram')).reason, 'not-configured');
  assert.equal(called, false); assert.equal(a.recent()[0].text, 'ohne Telegram'); assert.equal(a.recent()[0].delivered, false);
});

test('Telegram offline/Fehler: wirft nie, Token taucht nicht im Log oder in der Liste auf', async () => {
  const logs = []; let t = 5;
  const a = create({ env: { TELEGRAM_BOT_TOKEN: 'SECRET:TOKEN', TELEGRAM_CHAT_ID: '1' }, now: () => t, log: (...x) => logs.push(x.join(' ')), fetchFn: async () => { throw new Error('connect ECONNREFUSED https://api.telegram.org/botSECRET:TOKEN/sendMessage'); } });
  assert.equal((await a.send('k', 'x')).reason, 'network');
  assert.ok(!logs.join('\n').includes('SECRET:TOKEN') && !JSON.stringify(a.recent()).includes('SECRET:TOKEN'));
  const b = create({ env: { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' }, now: () => t, log: () => {}, fetchFn: async () => ({ ok: false, status: 401 }) });
  assert.equal((await b.send('k', 'x')).reason, 'http-401');
});

test('echter HTTP-Weg gegen einen lokalen Fake-Telegram-Server', async () => {
  let got = null;
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got = { url: req.url, body: JSON.parse(b) }; res.end('{"ok":true}'); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const a = create({ env: { TELEGRAM_BOT_TOKEN: 'TT', TELEGRAM_CHAT_ID: '7', TELEGRAM_API_BASE: `http://127.0.0.1:${srv.address().port}` }, log: () => {} });
    assert.equal((await a.send('k', 'Test 🔥')).sent, true); assert.equal(got.url, '/botTT/sendMessage'); assert.equal(got.body.text, 'Test 🔥');
  } finally { srv.close(); }
});

const snap = (o = {}) => ({ lagMs: 5, rssMb: 200, diskFreeMb: 50000, dataMb: 3, bridges: [], backupError: null, ...o });
const keys = r => r.map(x => x.key);

test('Wächter: gesunder Zustand → keine Warnung', () => assert.deepEqual(evaluate(snap(), {}), []));

test('Wächter: Hänger, Speicher, Platte, Datengröße, Backup-Fehler', () => {
  const r = evaluate(snap({ lagMs: LIMITS.lagMs + 1, rssMb: LIMITS.rssMb + 1, diskFreeMb: 100, dataMb: LIMITS.dataMaxMb + 1, backupError: 'disk full' }), {});
  assert.deepEqual(keys(r).sort(), ['backup', 'datasize', 'disk', 'lag', 'mem']);
  assert.ok(r.find(x => x.key === 'lag').level === 'crit');
});

test('Wächter: Brücke wird erst nach 3 min Ausfall gemeldet, nur einmal, und die Entwarnung kommt', () => {
  const st = {}, t0 = 1_000_000, down = { source: 'LIEFERANDO', state: 'down', lastHeartbeatAt: 'x' }, ok = { ...down, state: 'ok' };
  assert.deepEqual(evaluate(snap({ bridges: [down] }), st, t0), []);
  assert.deepEqual(evaluate(snap({ bridges: [down] }), st, t0 + 2 * 60000), []);
  const r = evaluate(snap({ bridges: [down] }), st, t0 + 3 * 60000); assert.deepEqual(keys(r), ['bridge-LIEFERANDO-down']); assert.match(r[0].text, /Lieferando/);
  assert.deepEqual(evaluate(snap({ bridges: [down] }), st, t0 + 9 * 60000), [], 'nicht erneut');
  const back = evaluate(snap({ bridges: [ok] }), st, t0 + 10 * 60000); assert.deepEqual(keys(back), ['bridge-LIEFERANDO-ok']); assert.equal(back[0].force, true);
  assert.deepEqual(evaluate(snap({ bridges: [ok] }), st, t0 + 11 * 60000), []);
});

test('Wächter: kurzer Aussetzer (<3 min) und nie gestartete Brücke lösen keinen Alarm aus', () => {
  const st = {}, t0 = 1;
  evaluate(snap({ bridges: [{ source: 'UBER_EATS', state: 'down', lastHeartbeatAt: 'x' }] }), st, t0);
  assert.deepEqual(evaluate(snap({ bridges: [{ source: 'UBER_EATS', state: 'ok', lastHeartbeatAt: 'x' }] }), st, t0 + 60000), []);
  assert.deepEqual(evaluate(snap({ bridges: [{ source: 'WOLT', state: 'down', lastHeartbeatAt: null }] }), {}, t0 + 99 * 60000), []);
});

test('Wächter: Login nötig wird als eigener Fall gemeldet', () => {
  const st = {}, b = { source: 'SIDES', state: 'login', lastHeartbeatAt: 'x' };
  evaluate(snap({ bridges: [b] }), st, 0); const r = evaluate(snap({ bridges: [b] }), st, 4 * 60000);
  assert.deepEqual(keys(r), ['bridge-SIDES-login']); assert.match(r[0].text, /تسجيل دخول/);
});
