'use strict';
// TSE-Anbindung (tse-service.js + tse-sim.js) — Einheitstests + echter Server mit NARA_TSE_MODE=sim.
// Deckt den DoD aus plans/PLAN_TSE_SWISSBIT.md ab, soweit ohne echten USB-Stick möglich.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), { spawn } = require('node:child_process');
const TS = require('../tse-service.js'), SIM = require('../tse-sim.js');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nara-tse-'));
const alertsSpy = () => { const sent = []; return { sent, send: (key, text) => { sent.push({ key, text }); return Promise.resolve({ sent: true }); } }; };

// ── Einheitstests ─────────────────────────────────────────────
test('processData: 7 %/19 % getrennt, Bar + Unbar (DSFinV-K Kassenbeleg-V1)', () => {
  const order = { cart: [{ name: 'Burger', unitCents: 1000, quantity: 2, vatRate: 7 }, { name: 'Cola', unitCents: 300, quantity: 1, vatRate: 19 }] };
  const pd = TS.processDataOf({}, order, { amountCents: 2300, paymentLines: [{ method: 'CASH', amountCents: 1300 }, { method: 'CARD', amountCents: 1000 }] });
  assert.equal(pd, 'Beleg^3.00_20.00_0.00_0.00_0.00^13.00:Bar_10.00:Unbar');
});

test('processData: Rabatt/Teilzahlung wird anteilig auf die Steuersätze verteilt, Summe stimmt exakt', () => {
  const order = { cart: [{ name: 'Burger', unitCents: 1000, quantity: 1, vatRate: 7 }, { name: 'Cola', unitCents: 1000, quantity: 1, vatRate: 19 }] };
  const pd = TS.processDataOf({}, order, { amountCents: 999, paymentLines: [{ method: 'CARD', amountCents: 999 }] });
  const [, vat, pay] = pd.split('^');
  const sum = vat.split('_').reduce((s, x) => s + Math.round(Number(x) * 100), 0);
  assert.equal(sum, 999); assert.equal(pay, '9.99:Unbar');
});

test('processData: Storno hat negative Beträge', () => {
  const order = { cart: [{ name: 'Burger', unitCents: 1000, quantity: 2, vatRate: 7 }] };
  assert.equal(TS.processDataOf({}, order, { amountCents: -2000, paymentLines: [{ method: 'CASH', amountCents: -2000 }] }), 'Beleg^0.00_-20.00_0.00_0.00_0.00^-20.00:Bar');
});

test('Simulator: Signatur ist echt prüfbar (ECDSA P-384) und Zähler laufen hoch', async () => {
  const sim = SIM.create({ file: path.join(tmpDir(), 'tse-sim.json') });
  const info = await sim.info();
  const a = await sim.startTransaction({ clientId: 'K1', processType: 'Kassenbeleg-V1' });
  const f = await sim.finishTransaction({ clientId: 'K1', transactionNumber: a.transactionNumber, processType: 'Kassenbeleg-V1', processData: 'Beleg^...' });
  const key = crypto.createPublicKey({ key: Buffer.from(info.publicKey, 'base64'), format: 'der', type: 'spki' });
  assert.ok(crypto.verify('sha384', Buffer.from(f.signedMessage), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(f.signature, 'base64')));
  assert.equal(f.signatureCounter, 2); assert.equal(a.transactionNumber, 1);
  assert.equal(info.serial.length, 64);
});

test('Modus off: nichts aktiv, sign() liefert ok:false ohne Fehler', async () => {
  const s = TS.create({ env: {}, dataDir: tmpDir() });
  assert.equal(s.active, false);
  assert.equal((await s.sign({ processData: 'x' })).ok, false);
});

test('Neustart: gleiche Seriennummer, Transaktionsnummern laufen weiter', async () => {
  const dir = tmpDir(), env = { NARA_TSE_MODE: 'sim' };
  const a = await TS.create({ env, dataDir: dir }).sign({ processData: 'Beleg^1.00_0.00_0.00_0.00_0.00^1.00:Bar' });
  const b = await TS.create({ env, dataDir: dir }).sign({ processData: 'Beleg^1.00_0.00_0.00_0.00_0.00^1.00:Bar' });
  assert.ok(a.ok && b.ok); assert.equal(a.serial, b.serial); assert.equal(b.transactionNumber, a.transactionNumber + 1);
});

test('USB abgezogen: sign() hängt nicht, ok:false + Telegram; danach wieder normal', async () => {
  const dir = tmpDir(), al = alertsSpy(), s = TS.create({ env: { NARA_TSE_MODE: 'sim' }, dataDir: dir, alerts: al });
  assert.ok((await s.sign({ processData: 'a' })).ok);
  fs.writeFileSync(path.join(dir, 'tse-sim.json.offline'), '');
  const t0 = Date.now(), r = await s.sign({ processData: 'b' });
  assert.equal(r.ok, false); assert.ok(Date.now() - t0 < 2000); assert.match(r.error, /nicht verbunden/);
  assert.ok(al.sent.some(m => m.key === 'tse-sign'));
  const h = await s.health(); assert.equal(h.connected, false); assert.ok(al.sent.some(m => m.key === 'tse-offline'));
  fs.rmSync(path.join(dir, 'tse-sim.json.offline'));
  assert.ok((await s.sign({ processData: 'c' })).ok);
});

test('TSE antwortet nicht: Zeitüberschreitung → ok:false (Kasse friert nicht ein)', async () => {
  const slow = { provider: 'X', info: () => new Promise(() => {}), startTransaction: () => new Promise(() => {}), finishTransaction: () => new Promise(() => {}), listStarted: async () => [] };
  const s = TS.create({ env: { NARA_TSE_MODE: 'sim' }, driver: slow, timeoutMs: 200, alerts: alertsSpy() });
  const t0 = Date.now(), r = await s.sign({ processData: 'x' });
  assert.equal(r.ok, false); assert.match(r.error, /Zeitüberschreitung/); assert.ok(Date.now() - t0 < 1500);
});

test('Stromausfall mitten in der Transaktion: offene TSE-Transaktion wird beim Start geschlossen', async () => {
  const dir = tmpDir(), file = path.join(dir, 'tse-sim.json');
  const sim = SIM.create({ file });
  await sim.startTransaction({ clientId: 'FLAMO-KASSE-1', processType: 'Kassenbeleg-V1' }); // kein finish = Strom weg
  const s = TS.create({ env: { NARA_TSE_MODE: 'sim' }, dataDir: dir });
  assert.deepEqual(await s.recover(), { closed: 1 });
  assert.deepEqual(await SIM.create({ file }).listStarted('FLAMO-KASSE-1'), []);
});

test('failPending: hängengebliebene Zahlung → TSE_FAILED, Beleg bekommt den Hinweis', () => {
  const data = { fiscalTransactions: [{ id: 'f1', status: 'PENDING' }, { id: 'f2', status: 'SIGNED' }], receipts: [{ id: 'r1', fiscalTransactionId: 'f1', orderId: 'o1' }] };
  assert.equal(TS.failPending(data), 1);
  assert.equal(data.fiscalTransactions[0].status, 'TSE_FAILED'); assert.equal(data.fiscalTransactions[1].status, 'SIGNED');
  assert.equal(data.receipts[0].tse.status, 'TSE_FAILED');
  assert.equal(TS.receiptsTseOf(data, 'o1').length, 1);
});

test('QR-Code: Aufbau nach DSFinV-K (V0;Kasse;Typ;Daten;TA;Zähler;Start;Ende;Alg;Format;Signatur;Schlüssel)', () => {
  const q = TS.qrOf({ clientId: 'K1', processType: 'Kassenbeleg-V1', processData: 'Beleg^x', transactionNumber: 5, signatureCounter: 9, startTime: 'S', logTime: 'E', signatureAlgorithm: 'ecdsa-plain-SHA384', timeFormat: 'unixTime', signature: 'SIG', publicKey: 'PK' });
  assert.equal(q, 'V0;K1;Kassenbeleg-V1;Beleg^x;5;9;S;E;ecdsa-plain-SHA384;unixTime;SIG;PK');
});

// ── Echter Server mit Simulator ───────────────────────────────
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-tse-srv-'));
const port = 6400 + Math.floor(Math.random() * 300), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
let proc;
async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}
const S = {};
const ev = (action, order, extra = {}) => call('POST', '/api/kasse/events', { action, order, ...extra }, S.owner);
async function sell(id, lines, extra = {}) {
  const o = { id, type: 'pickup', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1, vatRate: 7, options: [] }, { name: 'Cola', unitCents: 1000, quantity: 1, vatRate: 19, options: [] }] };
  const s = await ev('ORDER_SYNC', o, { clientId: 'A', training: extra.training === true }); assert.equal(s.status, 200, JSON.stringify(s.json));
  const p = await ev('FINALIZE_PAYMENT', { ...o, rev: s.json.rev }, { paymentLines: lines, ...(extra.partial ? { partial: true } : {}) });
  assert.equal(p.status, 200, JSON.stringify(p.json)); return p.json;
}
const state = async () => (await call('GET', '/api/kasse-state', null, S.owner)).json;

test('Server: Start mit NARA_TSE_MODE=sim', async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', NARA_TSE_MODE: 'sim', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200); S.owner = b.cookie;
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

test('Server: Barzahlung wird signiert (Transaktionsnr., Signatur, Beleg FL-…)', async () => {
  const r = await sell('tse-cash', [{ method: 'CASH', amountCents: 2000 }]);
  assert.equal(r.receipt.tse.status, 'SIGNED'); assert.equal(r.receipt.tse.simulated, true);
  assert.ok(r.receipt.tse.transactionNumber >= 1); assert.ok(r.receipt.tse.signature.length > 50);
  assert.match(r.receipt.receiptNumber, /^FL-/);
  const f = (await state()).fiscalTransactions.find(x => x.orderId === 'tse-cash');
  assert.equal(f.status, 'SIGNED'); assert.equal(f.processData, 'Beleg^10.00_10.00_0.00_0.00_0.00^20.00:Bar');
});

test('Server: Kartenzahlung bekommt eine eigene, höhere Transaktionsnummer', async () => {
  const a = (await state()).fiscalTransactions.find(x => x.orderId === 'tse-cash').transactionNumber;
  const r = await sell('tse-card', [{ method: 'CARD', amountCents: 2000 }]);
  assert.equal(r.receipt.tse.status, 'SIGNED'); assert.ok(r.receipt.tse.transactionNumber > a);
});

test('Server: geteilte Rechnung → jeder Teil eigene signierte Transaktion', async () => {
  const p1 = await sell('tse-split', [{ method: 'CASH', amountCents: 1200 }], { partial: true });
  const o = (await state()).orders.find(x => x.id === 'tse-split');
  const p2 = await ev('FINALIZE_PAYMENT', o, { paymentLines: [{ method: 'CARD', amountCents: 800 }], partial: true });
  assert.equal(p2.status, 200, JSON.stringify(p2.json));
  assert.equal(p1.receipt.tse.status, 'SIGNED'); assert.equal(p2.json.receipt.tse.status, 'SIGNED');
  assert.notEqual(p1.receipt.tse.transactionNumber, p2.json.receipt.tse.transactionNumber);
  const print = await call('POST', '/api/print', { orderId: 'tse-split', kind: 'customer' }, S.owner);
  assert.equal(print.status, 200); assert.equal(print.json.tseReceipts.length, 2);
});

test('Server: Trainingsmodus geht NIE an die TSE', async () => {
  const before = (await call('GET', '/api/tse/status', null, S.owner)).json.signatureCounter;
  const r = await sell('tse-train', [{ method: 'CASH', amountCents: 2000 }], { training: true });
  assert.equal(r.receipt.tse, undefined); assert.match(r.receipt.receiptNumber, /^UEB-/);
  assert.equal((await state()).fiscalTransactions.find(x => x.orderId === 'tse-train').status, 'TRAINING_NOT_SIGNED');
  assert.equal((await call('GET', '/api/tse/status', null, S.owner)).json.signatureCounter, before);
});

test('Server: Storno = neue signierte Transaktion mit negativen Beträgen', async () => {
  const r = await ev('STORNO', { id: 'tse-cash' }, { reason: 'Falsche Bestellung' });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.tse.status, 'SIGNED');
  const f = (await state()).fiscalTransactions.filter(x => x.orderId === 'tse-cash');
  assert.equal(f.length, 2); const st = f.find(x => x.type === 'STORNO');
  assert.equal(st.status, 'SIGNED'); assert.equal(st.processData, 'Beleg^-10.00_-10.00_0.00_0.00_0.00^-20.00:Bar');
  assert.equal(f.find(x => x !== st).status, 'SIGNED', 'Original bleibt unverändert');
});

test('Server: USB weg → Verkauf läuft weiter als TSE_FAILED; wieder dran → signiert', async () => {
  const off = path.join(tmp, 'data', 'tse-sim.json.offline');
  fs.writeFileSync(off, '');
  const t0 = Date.now(), r = await sell('tse-off', [{ method: 'CASH', amountCents: 2000 }]);
  assert.ok(Date.now() - t0 < 4000); assert.equal(r.receipt.tse.status, 'TSE_FAILED');
  const st = (await call('GET', '/api/tse/status', null, S.owner)).json;
  assert.equal(st.connected, false); assert.ok(st.failed >= 1);
  fs.rmSync(off);
  assert.equal((await sell('tse-back', [{ method: 'CARD', amountCents: 2000 }])).receipt.tse.status, 'SIGNED');
});

test('Server: /api/print liefert die Steuersätze je Zeile (Essen 7 %, Getränk 19 %) für den Bon', async () => {
  const r = await call('POST', '/api/print', { orderId: 'tse-card', kind: 'customer' }, S.owner);
  assert.equal(r.status, 200);
  const rates = Object.fromEntries(r.json.receiptCart.map(i => [i.name, i.vatRates]));
  assert.deepEqual(rates, { Burger: [7], Cola: [19] });
});
