'use strict';
// Storno nach Zahlung + Korrektur (✏️ تصحيح): Logik (order-correction.js), Tagesabschluss-Verträglichkeit, Beleg-Zeile, Sales-Seite.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const OC = require('../order-correction.js');
const DC = require('../day-closing.js');
const bizDay = require('../business-day.js');

const root = path.join(__dirname, '..');
const NOW = new Date().toISOString(), TODAY = bizDay.today();
let n = 0; const newId = p => p + '_' + (++n); const suffix = () => 'ABCD' + (++n);
const clone = x => JSON.parse(JSON.stringify(x));

// kleine Test-Datenbank mit einer bezahlten Kassen-Bestellung (und optional mehr)
function db(extra = {}) {
  const d = { orders: [], payments: [], receipts: [], fiscalTransactions: [], auditEvents: [], dayClosings: [] };
  addSale(d, 'o1', [{ name: 'Burger', unitCents: 1000, quantity: 1 }], extra);
  return d;
}
function addSale(d, id, cart, extra = {}) {
  const cents = cart.reduce((s, i) => s + i.unitCents * i.quantity, 0);
  d.orders.push({ id, displayCode: 'FLAMO-' + id.toUpperCase(), type: 'local', table: '4', status: 'COMPLETED', cart, createdAt: NOW, completedAt: NOW, paymentId: 'pay-' + id, paymentIds: ['pay-' + id], paidCents: cents, kitchenStatus: 'READY', kitchenSent: [1], ...extra });
  d.payments.push({ id: 'pay-' + id, orderId: id, method: 'CASH', paymentLines: [{ method: 'CASH', amountCents: cents }], amountCents: cents, grossAmountCents: cents, tipCents: 0, status: 'COMPLETED', createdAt: NOW, ...(extra.training ? { isTest: true } : {}) });
  d.receipts.push({ id: 'rc-' + id, receiptNumber: 'DEV-' + id.toUpperCase(), orderId: id, paymentId: 'pay-' + id, amountCents: cents });
  d.fiscalTransactions.push({ id: 'fx-' + id, paymentId: 'pay-' + id, orderId: id, status: 'DEVELOPMENT_NOT_CONFIGURED' });
}
const run = (d, o = {}) => OC.stornoOrder(d, { orderId: 'o1', reason: 'Falscher Artikel', user: { id: 'u1', name: 'Omar', role: 'OWNER' }, now: NOW, newId, suffix, correct: true, ...o });
const fails = (fn, status, code) => assert.throws(fn, e => e instanceof OC.CorrectionError && e.status === status && e.code === code, code);

test('Storno braucht einen Grund (Pflicht, auch nur Leerzeichen/zu kurz = abgelehnt) — nichts wird verändert', () => {
  for (const reason of [undefined, '', '   ', 'ab']) { const d = db(), before = clone(d); fails(() => run(d, { reason }), 422, 'REASON_REQUIRED'); assert.deepEqual(d, before); }
});

test('Storno + Korrektur: alte Bestellung STORNIERT, negative Gegenbuchung, neue offene Bestellung mit correctionOf; nichts wird gelöscht', () => {
  const d = db(), before = clone(d), r = run(d);
  const old = d.orders.find(o => o.id === 'o1'), nu = d.orders.find(o => o.id === r.newOrder.id);
  assert.equal(old.status, 'STORNIERT'); assert.equal(old.stornoReason, 'Falscher Artikel'); assert.equal(old.correctedBy, nu.id); assert.equal(old.correctedByCode, nu.displayCode);
  // neue Bestellung: offen, neue ID/Nummer, gleiche Artikel, kein Zahlungs-/Küchenzustand der alten
  assert.equal(nu.status, 'OPEN'); assert.notEqual(nu.id, 'o1'); assert.notEqual(nu.displayCode, 'FLAMO-O1'); assert.match(nu.displayCode, /^FLAMO-[A-Z0-9]{1,6}$/);
  assert.equal(nu.correctionOf, 'o1'); assert.equal(nu.correctionOfCode, 'FLAMO-O1'); assert.deepEqual(nu.cart, before.orders[0].cart); assert.equal(nu.table, '4'); assert.equal(nu.type, 'local');
  for (const k of ['paymentId', 'paymentIds', 'paidCents', 'completedAt', 'kitchenStatus', 'billDiscount', 'training', 'isTest']) assert.equal(nu[k], undefined, k);
  assert.deepEqual(nu.kitchenSent, []);
  // Gegenbuchung: neue Zahlung negativ, status STORNO (nicht COMPLETED), Beleg STORNO-… (kein DEV-), Fiskal-Eintrag, Audit mit POSITIVEM Betrag
  assert.equal(d.payments.length, before.payments.length + 1); assert.equal(d.receipts.length, before.receipts.length + 1); assert.equal(d.fiscalTransactions.length, before.fiscalTransactions.length + 1);
  assert.deepEqual(d.payments[0], before.payments[0]); assert.deepEqual(d.receipts[0], before.receipts[0]);   // Original unberührt
  assert.equal(r.payment.amountCents, -1000); assert.equal(r.payment.status, 'STORNO'); assert.deepEqual(r.payment.paymentLines, [{ method: 'CASH', amountCents: -1000 }]);
  assert.match(r.receipt.receiptNumber, /^STORNO-/); assert.ok(!/DEV/.test(r.receipt.receiptNumber)); assert.equal(r.receipt.amountCents, -1000); assert.deepEqual(r.receipt.originalReceiptNumbers, ['DEV-O1']);
  assert.equal(r.fiscal.amountCents, -1000);
  const ev = d.auditEvents.find(e => e.type === 'STORNO'); assert.equal(ev.orderId, 'o1'); assert.equal(ev.details.amountCents, 1000); assert.equal(ev.details.reason, 'Falscher Artikel'); assert.equal(ev.details.newOrderId, nu.id); assert.equal(ev.details.userName, 'Omar');
});

test('nur Storno (ohne neue Bestellung): correct:false legt keine neue Bestellung an', () => {
  const d = db(), r = run(d, { correct: false });
  assert.equal(r.newOrder, null); assert.equal(d.orders.length, 1); assert.equal(d.orders[0].status, 'STORNIERT'); assert.equal(d.orders[0].correctedBy, undefined);
});

test('Tagesabschluss: Storno wird einmal abgezogen (Umsatz 10,00 − Storno 10,00 = 0), die negative Zahlung zählt nicht doppelt', () => {
  const d = db(); d.settings = {}; d.categories = []; d.products = [];
  run(d);
  const rep = DC.build(d, TODAY);
  assert.equal(rep.revenue.grossCents, 1000); assert.equal(rep.storno.count, 1); assert.equal(rep.storno.amountCents, 1000); assert.equal(rep.net.grossCents, 0);
});

test('nicht doppelt korrigieren: STORNIERTE Bestellung und Bestellung mit Storno-Event werden abgelehnt', () => {
  const d = db(); run(d);
  fails(() => run(d), 409, 'ALREADY_STORNO');
  const d2 = db(); d2.auditEvents.push({ type: 'STORNO', orderId: 'o1' });
  fails(() => run(d2), 409, 'ALREADY_STORNO');
});

test('vor der Zahlung kein Storno: OPEN / CANCELLED werden abgelehnt (Ändern/Abbrechen vor Zahlung bleibt normal und ohne Storno)', () => {
  for (const status of ['OPEN', 'CANCELLED']) { const d = db({ status }); fails(() => run(d), 409, 'NOT_COMPLETED'); assert.equal(d.auditEvents.length, 0); assert.equal(d.payments.length, 1); }
});

test('Plattform-Bestellungen (Lieferando, Uber Eats, Loco, …) werden nicht korrigiert', () => {
  for (const x of [{ platform: 'LIEFERANDO' }, { source: 'UBER_EATS' }, { source: 'WOLT' }, { externalOrderCode: 'ABC123' }]) { const d = db(x); fails(() => run(d), 409, 'PLATFORM_ORDER'); }
});

test('Tag schon abgeschlossen (Tagesabschluss): Korrektur gesperrt; Trainings-Abschluss sperrt nicht', () => {
  const d = db(); d.dayClosings.push({ id: 'z1', day: TODAY, mode: 'REAL', type: 'CLOSING' });
  fails(() => run(d), 409, 'DAY_CLOSED'); assert.equal(OC.blocker(d, d.orders[0]).code, 'DAY_CLOSED');
  const d2 = db(); d2.dayClosings.push({ id: 'z2', day: TODAY, mode: 'TRAINING' });
  assert.equal(OC.blocker(d2, d2.orders[0]), null); assert.equal(run(d2).mode, 'STORNO');
});

test('geteilte Zahlung (Bar + Karte): Storno summiert alle Teile, beide Methoden negativ', () => {
  const d = db(); d.payments = [
    { id: 'pa', orderId: 'o1', method: 'CASH', paymentLines: [{ method: 'CASH', amountCents: 400 }], amountCents: 400, status: 'COMPLETED', createdAt: NOW },
    { id: 'pb', orderId: 'o1', method: 'CARD', paymentLines: [{ method: 'CARD', amountCents: 600 }], amountCents: 600, status: 'COMPLETED', createdAt: NOW }];
  d.orders[0].paymentIds = ['pa', 'pb'];
  const r = run(d); assert.equal(r.payment.amountCents, -1000); assert.equal(r.payment.method, 'MIXED');
  assert.deepEqual(r.payment.paymentLines, [{ method: 'CASH', amountCents: -400 }, { method: 'CARD', amountCents: -600 }]);
  assert.equal(d.auditEvents[0].details.amountCents, 1000); assert.deepEqual(d.auditEvents[0].details.originalPaymentIds, ['pa', 'pb']);
});

test('Training: frei wieder öffnen — ohne Grund, ohne Storno/Korrekturnummer, auch an geschlossenem Tag; echte Bücher bleiben unberührt', () => {
  const d = db({ training: true, isTest: true }); addSale(d, 'real', [{ name: 'Pizza', unitCents: 700, quantity: 1 }]);
  d.dayClosings.push({ id: 'z1', day: TODAY, mode: 'REAL', type: 'CLOSING' });
  const realBefore = clone({ o: d.orders[1], p: d.payments[1], r: d.receipts[1], f: d.fiscalTransactions[1] });
  const r = run(d, { reason: '', user: { id: 'c1', role: 'CASHIER' } });
  assert.equal(r.mode, 'TRAINING_REOPEN'); const o = d.orders.find(x => x.id === 'o1');
  assert.equal(o.status, 'OPEN'); assert.equal(o.id, 'o1'); assert.equal(o.correctionOf, undefined); assert.equal(o.paymentId, undefined); assert.equal(o.paidCents, undefined); assert.equal(o.training, true); assert.ok(o.rev >= 1);
  assert.equal(d.auditEvents.length, 0); assert.ok(!d.payments.some(p => p.orderId === 'o1')); assert.ok(!d.receipts.some(p => p.orderId === 'o1')); assert.ok(!d.fiscalTransactions.some(p => p.orderId === 'o1'));
  assert.deepEqual(clone({ o: d.orders[1], p: d.payments[0], r: d.receipts[0], f: d.fiscalTransactions[0] }), realBefore);
  assert.equal(d.orders.length, 2);   // keine neue Bestellung, keine Korrekturnummer
});

test('unbekannte Bestellung → 404', () => { fails(() => run(db(), { orderId: 'nope' }), 404, 'NOT_FOUND'); });

test('Beleg: Korrekturbestellung druckt die Zeile „Korrektur zu FLAMO-xxxxx“ (normale Bestellung nicht)', () => {
  // kasse-receipt.js ist ein Browser-IIFE: mit minimalem window laden (wie receipt-qr-priority.test.js)
  const win = { addEventListener() {}, NARA_LANG: null };
  const ctx = { window: win, localStorage: { getItem: () => null }, document: { getElementById: () => null, addEventListener() {} }, console, fetch: () => Promise.resolve({ ok: false }), setTimeout() {}, clearTimeout() {} };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'kasse-receipt.js'), 'utf8').replace(/import\('\/nara-receipt-core\.mjs'\)/, 'Promise.reject(new Error("n/a"))'), ctx);
  const R = win.NARA_RECEIPT; assert.equal(typeof R.html, 'function');
  const base = { id: 'x1', displayCode: 'FLAMO-X1', type: 'local', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }], createdAt: NOW, status: 'OPEN' };
  assert.ok(!R.html(base, 'customer').includes('Korrektur zu'));
  const h = R.html({ ...base, correctionOf: 'o1', correctionOfCode: 'FLAMO-O1' }, 'customer');
  assert.ok(h.includes('Korrektur zu FLAMO-O1'), 'Zeile fehlt');
  assert.ok(h.indexOf('FLAMO-X1') < h.indexOf('Korrektur zu FLAMO-O1'));   // direkt unter der Bestellnummer
});

// ── Sales-Seite (sales.html) im vm: Button-Sichtbarkeit, Statusanzeige, Summen ──
function loadSales(user) {
  const html = fs.readFileSync(path.join(root, 'sales.html'), 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const el = () => new Proxy({ style: {}, dataset: {}, addEventListener() {}, showModal() {}, close() {}, focus() {}, value: '', textContent: '', innerHTML: '' }, { get: (t, k) => k in t ? t[k] : undefined, set: (t, k, v) => { t[k] = v; return true; } });
  const FT = { t: (k, p) => k + (p ? JSON.stringify(p) : ''), init() {}, locale: () => 'de' };
  const ctx = { console, FT, window: { NARA_DAY: bizDay }, NARA_DAY: bizDay, fetch: () => new Promise(() => {}), location: {}, document: { querySelector: () => el(), querySelectorAll: () => [] } };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;globalThis.__api={state,buildRows,corrBlock,lineCents,rs};', ctx);
  ctx.__api.state.user = user; return ctx.__api;
}
const rowsFor = (S, d) => { S.state.data = d; S.state.rows = S.buildRows(d); return S.state.rows; };
const blockFor = (S, d, id) => S.corrBlock(S.state.rows.find(r => r.order && r.order.id === id));

test('sales.html: Button „Korrigieren“ nur für abgeschlossene Kassen-Bestellungen und nur für Inhaber/Manager', () => {
  const d = db(); addSale(d, 'lf', [{ name: 'X', unitCents: 500, quantity: 1 }], { platform: 'LIEFERANDO' });
  for (const [role, expected] of [['OWNER', true], ['MANAGER', true], ['CASHIER', false], ['ACCOUNTANT', false], [null, false]]) {
    const S = loadSales(role ? { role } : null); rowsFor(S, d);
    assert.equal(blockFor(S, d, 'o1').includes('id="corr-open"'), expected, String(role));
    assert.ok(!blockFor(S, d, 'lf').includes('corr-open'), 'Plattform: kein Button (' + role + ')');
  }
  const S = loadSales({ role: 'OWNER' }); rowsFor(S, d); const html = blockFor(S, d, 'o1');
  assert.ok(html.includes('id="corr-reason"') && html.includes('id="corr-go"'));   // Grund-Feld vorhanden
});

test('sales.html: geschlossener Tag zeigt Warnung statt Button; Training-Bestellung zeigt „Zum Bearbeiten öffnen“ für jede Rolle', () => {
  const d = db(); d.dayClosings = [{ day: TODAY, mode: 'REAL' }];
  const S = loadSales({ role: 'OWNER' }); rowsFor(S, d); const h = blockFor(S, d, 'o1');
  assert.ok(h.includes('corrClosed') && !h.includes('corr-open'));
  const t = db({ training: true, isTest: true }); const S2 = loadSales({ role: 'CASHIER' }); rowsFor(S2, t);
  const h2 = blockFor(S2, t, 'o1'); assert.ok(h2.includes('data-training="1"') && h2.includes('trainBtn'));
});

test('sales.html: stornierte Bestellung bleibt in der Liste (korrigiert + Link zur neuen), zählt nicht in die Summe; Artikelpreis aus unitCents', () => {
  const d = db(); const r = run(d); addSale(d, 'o2', [{ name: 'Cola', unitCents: 300, quantity: 2 }]);
  const S = loadSales({ role: 'OWNER' }); const rows = rowsFor(S, d);
  const old = rows.find(x => x.order && x.order.id === 'o1');
  assert.ok(old && old.voided === true); assert.equal(S.rs(old.status), 'stCorrected'); assert.equal(rows.filter(x => x.payment && x.payment.id === 'pay-o1').length, 1);   // kein Doppelt-Eintrag der Zahlung
  assert.ok(!rows.some(x => x.key === 'payment:' + r.payment.id));                                                                                    // negative Storno-Zahlung nicht als Verkauf
  const blk = blockFor(S, d, 'o1'); assert.ok(blk.includes('stStorno') && blk.includes('Falscher Artikel') && blk.includes('kasse.html?open=' + encodeURIComponent(r.newOrder.id)));
  assert.equal(rows.filter(x => !x.voided).reduce((s, x) => s + x.cents, 0), 0 + (rows.find(x => x.order && x.order.id === 'o2').cents));
  assert.equal(S.lineCents({ name: 'Cola', unitCents: 300, quantity: 2 }), 600);
  // wurde die Korrektur bezahlt, führt der Link in die Verkaufsdetails
  const paid = { ...d.orders.find(o => o.id === r.newOrder.id), status: 'COMPLETED', completedAt: NOW, paymentId: 'px' }; d.orders = d.orders.map(o => o.id === paid.id ? paid : o);
  rowsFor(S, d); assert.ok(blockFor(S, d, 'o1').includes('id="corr-view"')); assert.ok(blockFor(S, d, paid.id).includes('corrOf'));
});

test('server.js: STORNO/CORRECT_ORDER laufen über order-correction.js (Manager-Pflicht außer Training), kein DEV-STORNO mehr', () => {
  const s = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.ok(/action==='STORNO'\|\|action==='CORRECT_ORDER'/.test(s)); assert.ok(/require\('\.\/order-correction\.js'\)/.test(s));
  assert.ok(/if\(!OC\.isTraining\(stored\)\)\{if\(req\.naraUser\)\{if\(!\['OWNER','MANAGER'\]\.includes\(req\.naraUser\.role\)\)return reply\(res,403/.test(s)); assert.ok(!/DEV-STORNO/.test(s));
});

test('Kasse: ?open=<id> öffnet die Korrekturbestellung; reopened Training-Bestellung wird lokal wieder geladen', () => {
  const s = fs.readFileSync(path.join(root, 'kasse-sync.js'), 'utf8');
  assert.ok(/function openFromUrl\(L\)/.test(s) && /get\('open'\)/.test(s) && /openFromUrl\(L\);/.test(s));
  assert.ok(/s\.training===true&&closed\(local\.status\)&&!closed\(s\.status\)/.test(s));
});
