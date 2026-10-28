'use strict';
// Annahme-Tablet: Zustandsmaschine (PENDING → ACCEPTING → ACCEPTED/FAILED), Bridge-Befehle, Küche/Prognose-Ausblendung
// und ein End-to-End-Lauf gegen eine echte Server-Kopie.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const A = require('../platform-accept.js');
const kitchen = require('../kitchen.js');
const prep = require('../prep-learning.js');

const NOW = Date.parse('2026-10-28T12:00:00Z');
const mk = (over = {}) => ({ id: 'o1', source: 'LIEFERANDO', platform: 'LIEFERANDO', externalOrderCode: '111', displayCode: 'ABC123', status: 'OPEN', liveStage: 'PREPARE', needsAccept: true, type: 'delivery',
  cart: [{ name: 'Smashed Burger', quantity: 1, unitCents: 899, totalCents: 899, options: [] }], placedAt: new Date(NOW - 60000).toISOString(), ...over });
const pendingOrder = (over = {}) => { const o = mk(over); A.onImport(o, true, NOW); return o; };
test.beforeEach(() => A.reset());

test('lieferandoNeedsAccept: nur neue, unbestätigte Bestellungen in der Zubereitungsphase', () => {
  assert.equal(A.lieferandoNeedsAccept('PREPARE', 'new', null), true);
  assert.equal(A.lieferandoNeedsAccept('PREPARE', 'placed', null), true);
  assert.equal(A.lieferandoNeedsAccept('PREPARE', 'new', '2026-10-28T12:00:00Z'), false); // schon bestätigt
  assert.equal(A.lieferandoNeedsAccept('PREPARE', 'kitchen', null), false);               // unbekannter/anderer Status → altes Verhalten
  assert.equal(A.lieferandoNeedsAccept('DONE', 'new', null), false);
});

test('Import: neue wartende Bestellung → PENDING (HOLD); ohne needsAccept oder storniert → altes Verhalten', () => {
  const a = mk(); assert.equal(A.onImport(a, true, NOW), 'HOLD'); assert.equal(a.acceptState, 'PENDING');
  const b = mk({ needsAccept: false }); assert.equal(A.onImport(b, true, NOW), 'NONE'); assert.equal(b.acceptState, undefined);
  const c = mk({ needsAccept: undefined }); assert.equal(A.onImport(c, true, NOW), 'NONE');
  const d = mk({ status: 'CANCELLED' }); assert.equal(A.onImport(d, true, NOW), 'NONE'); assert.equal(d.acceptState, undefined);
});

test('Import-Update: bestätigt die Plattform die Bestellung (auch am Lieferando-Gerät) → ACCEPTED + drucken, nie doppelt', () => {
  const o = pendingOrder(); o.needsAccept = false;
  assert.equal(A.onImport(o, false, NOW), 'PRINT'); assert.equal(o.acceptState, 'ACCEPTED'); assert.equal(o.acceptedVia, 'PLATFORM');
  assert.equal(A.onImport(o, false, NOW), 'NONE');
  const p = pendingOrder({ id: 'o2' }); A.requestAccept({ orders: [p] }, 'o2', 20, { name: 'Ali' }, NOW); p.needsAccept = false;
  assert.equal(A.onImport(p, false, NOW), 'PRINT'); assert.equal(p.acceptedVia, 'NARA');
  const q = pendingOrder({ id: 'o3' }); q.needsAccept = undefined; assert.equal(A.onImport(q, false, NOW), 'NONE'); assert.equal(q.acceptState, 'PENDING');
});

test('requestAccept: ACCEPTING + Befehl in der Warteschlange; Doppelklick = 409; ACCEPTED = idempotent; ungültige Minuten/Zustände', () => {
  const o = pendingOrder(), data = { orders: [o] };
  const r = A.requestAccept(data, 'o1', 25, { name: 'Ali' }, NOW);
  assert.equal(r.state, 'ACCEPTING'); assert.equal(o.acceptMinutes, 25); assert.equal(o.acceptBy, 'Ali');
  assert.throws(() => A.requestAccept(data, 'o1', 25, null, NOW + 1000), e => e.status === 409);
  for (const bad of [4, 241, 'x', null]) assert.throws(() => A.requestAccept({ orders: [pendingOrder({ id: 'x' + bad })] }, 'x' + bad, bad, null, NOW), e => e.status === 422);
  assert.throws(() => A.requestAccept(data, 'nope', 20, null, NOW), e => e.status === 404);
  const free = mk({ id: 'o9', needsAccept: false }); A.onImport(free, true, NOW);
  assert.throws(() => A.requestAccept({ orders: [free] }, 'o9', 20, null, NOW), e => e.status === 422);
  o.acceptState = 'ACCEPTED'; assert.equal(A.requestAccept(data, 'o1', 25, null, NOW).already, true);
});

test('claim: Befehl geht genau einmal an die richtige Bridge (Quelle + Marke)', () => {
  const o = pendingOrder(), data = { orders: [o] };
  A.requestAccept(data, 'o1', 30, null, NOW);
  assert.deepEqual(A.claim('UBER_EATS', '', NOW), []);
  assert.deepEqual(A.claim('LIEFERANDO', 'Just Smashed', NOW), []);
  const c = A.claim('lieferando', '', NOW);
  assert.equal(c.length, 1); assert.equal(c[0].minutes, 30); assert.equal(c[0].externalOrderCode, '111'); assert.equal(c[0].orderId, 'o1');
  assert.deepEqual(A.claim('LIEFERANDO', '', NOW + 1000), []);
  const s = pendingOrder({ id: 'o5', brand: 'Just Smashed' }); A.requestAccept({ orders: [s] }, 'o5', 15, null, NOW);
  assert.equal(A.claim('LIEFERANDO', '', NOW).length, 0); assert.equal(A.claim('LIEFERANDO', 'just smashed', NOW).length, 1);
});

test('complete: Erfolg → ACCEPTED + drucken (QR nur von Scoober); schon ACCEPTED → kein zweiter Druck; Fehler → FAILED, Wiederholung möglich', () => {
  const o = pendingOrder(), data = { orders: [o] };
  A.requestAccept(data, 'o1', 25, null, NOW);
  const bad = A.complete(data, { orderId: 'o1', ok: true, qrUrl: 'https://evil.example/qr/?ref=A' }, NOW);
  assert.equal(bad.printNow, true); assert.equal(o.deliveryQrUrl, undefined);
  const o2 = pendingOrder({ id: 'o2' }); data.orders.push(o2); A.requestAccept(data, 'o2', 25, null, NOW);
  A.complete(data, { orderId: 'o2', ok: true, qrUrl: 'https://mca.scoober.com/qr/?ref=ABC123&id=0123456789abcdef0123' }, NOW);
  assert.match(o2.deliveryQrUrl, /^https:\/\/mca\.scoober\.com\/qr\//);
  assert.equal(A.complete(data, { orderId: 'o2', ok: true }, NOW).printNow, false);
  const o3 = pendingOrder({ id: 'o3' }); data.orders.push(o3); A.requestAccept(data, 'o3', 20, null, NOW);
  const f = A.complete(data, { orderId: 'o3', ok: false, error: 'Accept-Button nicht gefunden' }, NOW);
  assert.equal(f.printNow, false); assert.equal(o3.acceptState, 'FAILED'); assert.match(o3.acceptError, /Accept-Button/);
  assert.equal(A.requestAccept(data, 'o3', 20, null, NOW + 5000).state, 'ACCEPTING');
});

test('sweep: Bridge antwortet nicht → nach der Frist FAILED (rot, Wiederholung möglich)', () => {
  const o = pendingOrder(), data = { orders: [o] };
  A.requestAccept(data, 'o1', 25, null, NOW);
  assert.equal(A.sweep(data, NOW + A.TIMEOUT_MS - 1000), false);
  assert.equal(A.sweep(data, NOW + A.TIMEOUT_MS + 1000), true);
  assert.equal(o.acceptState, 'FAILED'); assert.match(o.acceptError, /Zeitüberschreitung/);
  assert.deepEqual(A.claim('LIEFERANDO', '', NOW + A.TIMEOUT_MS + 1000), []);
});

test('pending: Zähler, Reihenfolge, Vorschlag auf 5 Min gerundet (10–240), stornierte fehlen', () => {
  const ready = min => ({ forecast: (d, now) => ({ extra: { readyAt: new Date(now + min * 60000).toISOString() }, queue: 3 }), view: o => ({ displayCode: o.displayCode, type: 'delivery', customerName: 'X', city: 'Viersen', notes: '', items: [] }) });
  const a = pendingOrder({ id: 'a' }), b = pendingOrder({ id: 'b' });
  a.pendingSince = new Date(NOW - 120000).toISOString(); b.pendingSince = new Date(NOW - 300000).toISOString();
  const c = pendingOrder({ id: 'c' }); c.status = 'CANCELLED';
  const data = { orders: [a, b, c] };
  const r = A.pending(data, NOW, ready(23));
  assert.deepEqual(r.orders.map(x => x.id), ['b', 'a']); assert.equal(r.count, 2); assert.equal(r.needAction, 2);
  assert.equal(r.orders[0].suggestedMinutes, 25); assert.equal(r.orders[0].queue, 3);
  assert.equal(A.pending(data, NOW, ready(2)).orders[0].suggestedMinutes, 10);
  assert.equal(A.pending(data, NOW, ready(500)).orders[0].suggestedMinutes, 240);
  A.requestAccept(data, 'a', 20, null, NOW);
  const r2 = A.pending(data, NOW, ready(23)); assert.equal(r2.count, 2); assert.equal(r2.needAction, 1);
});

test('printJobs: beim Annehmen Küche + Beleg, vorher nichts; nie doppelt', () => {
  const cfg = { auto: { kitchenOnPlatformOrder: false, receiptOnPlatformOrder: false, webOrder: true, kitchenOnAccept: true, receiptOnAccept: true } };
  const o = mk();
  assert.deepEqual(A.printJobs(o, cfg, {}), []);
  assert.deepEqual(A.printJobs(o, cfg, { onAccept: true }).map(j => j[0]), ['kitchen', 'customer']);
  assert.deepEqual(A.printJobs({ ...o, autoKitchenPrintedAt: 'x' }, cfg, { onAccept: true }).map(j => j[0]), ['customer']);
  assert.deepEqual(A.printJobs(o, { auto: { ...cfg.auto, kitchenOnAccept: false, receiptOnAccept: false } }, { onAccept: true }), []);
});

test('Küche, Prognose und Fahrer-Plan sehen wartende Bestellungen nicht – erst nach der Annahme', () => {
  const o = pendingOrder({ id: 'k1', placedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
  const now = Date.now();
  assert.equal(kitchen.isDraft(o), true); assert.equal(kitchen.awaitingAccept(o), true);
  assert.deepEqual(kitchen.listKitchenOrders([o], now).map(x => x.id), []);
  assert.equal(prep.forecast({ orders: [o], settings: {} }, now).queue, 0);
  o.acceptState = 'ACCEPTED';
  assert.deepEqual(kitchen.listKitchenOrders([o], now).map(x => x.id), ['k1']);
  assert.equal(prep.forecast({ orders: [o], settings: {} }, now).queue, 1);
});

test('Verdrahtung: Regeln für die API, Seite und Navigation vorhanden', () => {
  const auth = require('../auth.js');
  assert.equal(auth.policyFor('GET', '/api/platform-orders/pending'), auth.KITCH);
  assert.equal(auth.policyFor('POST', '/api/platform-orders/accept'), auth.KITCH);
  assert.equal(auth.policyFor('GET', '/api/platform-orders/commands'), 'service');
  assert.equal(auth.policyFor('POST', '/api/platform-orders/command-result'), 'service');
  assert.equal(auth.PAGE_ROLES['reception.html'], auth.KITCH);
  assert.ok(auth.SERVER_FILES.has('platform-accept.js'));
  assert.equal(auth.staticAllowed('platform-accept.js'), false);
  assert.equal(auth.staticAllowed('reception.html'), true);
});

// ───────── End-to-End gegen eine echte Server-Kopie ─────────
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-accept-'));
const port = 4900 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
let proc, cookie;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
async function call(method, url, body, ck) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* kein JSON */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}
const imp = (code, over = {}) => call('POST', '/api/platform-orders/import', { source: 'LIEFERANDO', order: {
  externalOrderCode: code, displayCode: 'T' + code, platform: 'LIEFERANDO', liveStage: 'PREPARE', needsAccept: true, type: 'delivery', paymentMethod: 'ONLINE',
  cart: [{ name: 'Smashed Burger', quantity: 1, unitCents: 899, totalCents: 899, options: [] }], totalCents: 899, placedAt: new Date().toISOString(),
  delivery: { street: 'Gereonstraße', houseNumber: '1', postalCode: '41747', city: 'Viersen', name: 'Max' }, ...over } });
const pend = () => call('GET', '/api/platform-orders/pending', null, cookie);

test.describe('End-to-End', () => {
  test.before(async () => {
    fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
    fs.mkdirSync(path.join(tmp, 'data'));
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
    proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
    const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' });
    assert.equal(b.status, 200); cookie = b.cookie;
  });
  test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

  test('ohne Anmeldung: Tablet-API gesperrt', async () => {
    assert.equal((await call('GET', '/api/platform-orders/pending')).status, 401);
    assert.equal((await call('POST', '/api/platform-orders/accept', { orderId: 'x', minutes: 20 })).status, 401);
  });

  test('neue Bestellung → wartet, Küche sieht sie nicht; Annahme → Bridge-Befehl → Ergebnis → Küche sieht sie', async () => {
    assert.equal((await imp('9001')).status, 201);
    let p = (await pend()).json; assert.equal(p.count, 1); assert.equal(p.orders[0].state, 'PENDING'); assert.ok(p.orders[0].suggestedMinutes >= 10);
    const id = p.orders[0].id;
    assert.deepEqual((await call('GET', '/api/kitchen/orders', null, cookie)).json.orders.map(o => o.id), []);
    const acc = await call('POST', '/api/platform-orders/accept', { orderId: id, minutes: 25 }, cookie);
    assert.equal(acc.status, 200); assert.equal(acc.json.state, 'ACCEPTING');
    assert.equal((await call('POST', '/api/platform-orders/accept', { orderId: id, minutes: 25 }, cookie)).status, 409);
    const cmds = (await call('GET', '/api/platform-orders/commands?source=LIEFERANDO')).json.commands;
    assert.equal(cmds.length, 1); assert.equal(cmds[0].minutes, 25); assert.equal(cmds[0].externalOrderCode, '9001');
    assert.equal((await call('GET', '/api/platform-orders/commands?source=LIEFERANDO')).json.commands.length, 0);
    assert.equal((await call('POST', '/api/platform-orders/command-result', { id: cmds[0].id, orderId: id, ok: true })).status, 200);
    p = (await pend()).json; assert.equal(p.count, 0);
    assert.deepEqual((await call('GET', '/api/kitchen/orders', null, cookie)).json.orders.map(o => o.id), [id]);
    // spätes Platform-Update (needsAccept false) ändert nichts am Ergebnis
    assert.equal((await imp('9001', { needsAccept: false, remarks: 'ohne Zwiebeln' })).status, 200);
    assert.equal((await pend()).json.count, 0);
  });

  test('Fehler → rote Karte mit Meldung, Wiederholung klappt', async () => {
    await imp('9002');
    const id = (await pend()).json.orders[0].id;
    await call('POST', '/api/platform-orders/accept', { orderId: id, minutes: 20 }, cookie);
    const cmd = (await call('GET', '/api/platform-orders/commands?source=LIEFERANDO')).json.commands[0];
    await call('POST', '/api/platform-orders/command-result', { id: cmd.id, orderId: id, ok: false, error: 'Accept-Button nicht gefunden' });
    const f = (await pend()).json.orders[0]; assert.equal(f.state, 'FAILED'); assert.match(f.error, /Accept-Button/);
    assert.deepEqual((await call('GET', '/api/kitchen/orders', null, cookie)).json.orders.map(o => o.id).includes(id), false);
    assert.equal((await call('POST', '/api/platform-orders/accept', { orderId: id, minutes: 20 }, cookie)).json.state, 'ACCEPTING');
  });

  test('Annahme direkt auf der Plattform → Bestellung verschwindet vom Tablet und erscheint in der Küche', async () => {
    await imp('9003');
    const row = (await pend()).json.orders.find(o => o.displayCode === 'T9003'); assert.ok(row);
    assert.equal((await imp('9003', { needsAccept: false })).status, 200);
    assert.equal((await pend()).json.orders.some(o => o.displayCode === 'T9003'), false);
    assert.ok((await call('GET', '/api/kitchen/orders', null, cookie)).json.orders.some(o => o.id === row.id));
  });

  test('Reiter-Board: Zubereitung → Handover (Befehl an die Bridge) → Fertig; Zeiten ändern verschiebt die Fälligkeit', async () => {
    await imp('9101'); const id = (await pend()).json.orders.find(o => o.displayCode === 'T9101').id;
    await call('POST', '/api/platform-orders/accept', { orderId: id, minutes: 25, deliveryMinutes: 15 }, cookie);
    const cmd = (await call('GET', '/api/platform-orders/commands?source=LIEFERANDO')).json.commands.find(c => c.orderId === id);
    assert.equal(cmd.type, 'ACCEPT'); assert.equal(cmd.deliveryMinutes, 15);
    await call('POST', '/api/platform-orders/command-result', { id: cmd.id, orderId: id, ok: true });
    let b = (await call('GET', '/api/platform-orders/board', null, cookie)).json; let row = b.orders.find(o => o.id === id);
    assert.equal(row.stage, 'PREPARE'); assert.equal(row.prepMinutes, 25); assert.equal(row.deliveryMinutes, 15); assert.ok(row.minutesLeft >= 38 && row.minutesLeft <= 40, 'left ' + row.minutesLeft);
    assert.ok(b.counts.PREPARE >= 1);
    // Zeiten ändern
    assert.equal((await call('POST', '/api/platform-orders/times', { orderId: id, prepMinutes: 35, deliveryMinutes: 10 }, cookie)).status, 200);
    row = (await call('GET', '/api/platform-orders/board', null, cookie)).json.orders.find(o => o.id === id); assert.equal(row.prepMinutes, 35); assert.ok(row.minutesLeft >= 43 && row.minutesLeft <= 45);
    assert.equal((await call('POST', '/api/platform-orders/times', { orderId: id, prepMinutes: 1, deliveryMinutes: 10 }, cookie)).status, 422);
    // Handover: lokal sofort + Befehl für Lieferando
    assert.equal((await call('POST', '/api/platform-orders/stage', { orderId: id, stage: 'HANDOVER' }, cookie)).json.pushed, true);
    assert.equal((await call('GET', '/api/platform-orders/board', null, cookie)).json.orders.find(o => o.id === id).stage, 'HANDOVER');
    const st = (await call('GET', '/api/platform-orders/commands?source=LIEFERANDO')).json.commands.find(c => c.type === 'STAGE');
    assert.deepEqual([st.orderId, st.status], [id, 'in_delivery']);
    await call('POST', '/api/platform-orders/command-result', { id: st.id, orderId: id, type: 'STAGE', stage: 'HANDOVER', ok: false, error: 'HTTP 401' });
    assert.deepEqual((await call('GET', '/api/platform-orders/board', null, cookie)).json.orders.find(o => o.id === id).sync, { state: 'FAILED', error: 'HTTP 401' });
    // Fertig
    assert.equal((await call('POST', '/api/platform-orders/stage', { orderId: id, stage: 'DONE' }, cookie)).status, 200);
    assert.equal((await call('GET', '/api/platform-orders/board', null, cookie)).json.orders.find(o => o.id === id).stage, 'DONE');
    assert.equal((await call('POST', '/api/platform-orders/times', { orderId: id, prepMinutes: 30, deliveryMinutes: 10 }, cookie)).status, 409, 'erledigt: keine Zeitänderung');
    assert.equal((await call('POST', '/api/platform-orders/stage', { orderId: 'nope', stage: 'DONE' }, cookie)).status, 404);
    assert.equal((await call('POST', '/api/platform-orders/stage', { orderId: id, stage: 'XX' }, cookie)).status, 422);
  });
});

test('Uber/Loco: neue frische Bestellung wird gehalten; Annahme ist intern (kein Bridge-Befehl) und druckt sofort; alte/späte werden nicht gehalten', () => {
  const u = mk({ id: 'u1', source: 'UBER_EATS', platform: 'UBER_EATS', needsAccept: undefined, platformStatus: 'CREATED' });
  assert.equal(A.onImport(u, true, NOW), 'HOLD'); assert.equal(u.acceptState, 'PENDING');
  const s = mk({ id: 's1', source: 'SIDES', platform: 'SIDES', brand: 'Loco Chicken', needsAccept: undefined, platformStatus: '1' });
  assert.equal(A.onImport(s, true, NOW), 'HOLD');
  const old = mk({ id: 'u2', source: 'UBER_EATS', needsAccept: undefined, placedAt: new Date(NOW - 3600000).toISOString() });
  assert.equal(A.onImport(old, true, NOW), 'NONE'); assert.equal(old.acceptState, undefined);
  const late = mk({ id: 'u3', source: 'UBER_EATS', needsAccept: undefined, platformStatus: 'READY_SOON' });
  assert.equal(A.onImport(late, true, NOW), 'NONE');
  const data = { orders: [u, s] };
  const r = A.requestAccept(data, 'u1', 20, { name: 'K' }, NOW);
  assert.equal(r.state, 'ACCEPTED'); assert.equal(r.printNow, true); assert.equal(u.acceptState, 'ACCEPTED');
  assert.deepEqual(A.claim('UBER_EATS', '', NOW), [], 'kein Befehl an die Bridge');
  assert.equal(A.requestAccept(data, 'u1', 20, { name: 'K' }, NOW).already, true);
});

test('Board/Zeiten/Stufe: Wartende zuerst, Uber intern, Abholung ohne Lieferzeit, wartende Bestellung nicht per Stufe änderbar', () => {
  const view = o => ({ displayCode: o.displayCode, type: o.type || 'delivery', customerName: '', city: '', notes: '', items: [] });
  const w = pendingOrder({ id: 'w1', displayCode: 'W1' });
  const p = mk({ id: 'p1', displayCode: 'P1', source: 'UBER_EATS', platform: 'UBER_EATS', needsAccept: undefined, type: 'pickup' });
  const data = { orders: [w, p] };
  A.requestAccept({ orders: [pendingOrder({ id: 'zz' })] }, 'zz', 20, null, NOW);
  p.acceptState = 'ACCEPTED'; p.acceptedAt = new Date(NOW - 5 * 60000).toISOString();
  const r = A.setTimes(data, 'p1', 20, 15, { name: 'K' }, NOW);
  assert.equal(r.deliveryMinutes, 0, 'Abholung hat keine Lieferzeit'); assert.equal(Date.parse(r.promisedDueAt), NOW - 5 * 60000 + 20 * 60000);
  const b = A.board(data, NOW, { forecast: () => ({ extra: { readyAt: new Date(NOW + 20 * 60000).toISOString() }, queue: 2 }), view });
  assert.deepEqual(b.orders.map(o => [o.id, o.stage]), [['w1', 'WAIT'], ['p1', 'PREPARE']]); assert.deepEqual(b.counts, { WAIT: 1, PREPARE: 1, HANDOVER: 0, DONE: 0 });
  assert.throws(() => A.requestStage(data, 'w1', 'HANDOVER', null, NOW), e => e.status === 409);
  const s1 = A.requestStage(data, 'p1', 'HANDOVER', null, NOW); assert.deepEqual([s1.from, s1.stage, s1.pushed], ['PREPARE', 'HANDOVER', false], 'Nicht-Lieferando: nur intern');
  assert.equal(A.requestStage(data, 'p1', 'HANDOVER', null, NOW).already, true);
});
