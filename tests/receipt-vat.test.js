'use strict';
// Kassenbon (Kleinbetragsrechnung, § 33 UStDV): Steuersatz-Buchstaben je Zeile (A = 7 %, B = 19 %), Legende, USt-IdNr.,
// Flamo-QR nur bei Lieferung/Plattform. Plus tse-service.annotateRates (Menü = zwei Sätze).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const TS = require('../tse-service.js');

function load() {
  const win = { addEventListener() {}, NARA_LANG: null, NARA_QR: { svg: () => '<svg data-flamo-qr></svg>' } };
  const ctx = { window: win, localStorage: { getItem: () => null }, document: { getElementById: () => null, addEventListener() {} }, console, fetch: () => Promise.resolve({ ok: false }), setTimeout, import: () => Promise.reject(new Error('n/a')) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'kasse-receipt.js'), 'utf8').replace(/import\('\/nara-receipt-core\.mjs'\)/, 'Promise.reject(new Error("n/a"))'), ctx);
  return win.NARA_RECEIPT;
}
const cart = [{ name: 'Burger', unitCents: 1000, quantity: 1, vatRates: [7] }, { name: 'Cola', unitCents: 300, quantity: 1, vatRates: [19] }];
const own = extra => ({ id: 'o1', type: 'pickup', status: 'COMPLETED', cart, ...extra });

test('annotateRates: Essen 7 %, Getränk 19 %, Trinkgeld bekommt keinen Satz', () => {
  const o = TS.annotateRates({ products: [] }, { type: 'pickup', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1, vatRate: 7 }, { name: 'Cola', unitCents: 300, quantity: 1, vatRate: 19 }, { kind: 'TIP', name: 'Trinkgeld', unitCents: 100, quantity: 1 }] });
  assert.deepEqual(o.cart[0].vatRates, [7]); assert.deepEqual(o.cart[1].vatRates, [19]); assert.equal(o.cart[2].vatRates, undefined);
});

test('annotateRates: Menü (Burger + Getränk zum Menüpreis) hat beide Sätze 7 und 19', () => {
  const data = { products: [{ id: 'cb', name: 'Cheese Burger', priceCents: 700 }, { id: 'menu_cb', name: 'Cheese Burger Menü', description: 'inkl. Getränk', priceCents: 1100 }] };
  const o = TS.annotateRates(data, { type: 'pickup', cart: [{ productId: 'menu_cb', name: 'Cheese Burger Menü', unitCents: 1100, quantity: 1 }] });
  assert.deepEqual(o.cart[0].vatRates, [7, 19]);
});

test('Bon vor Ort: Buchstabe je Zeile, Legende, USt-IdNr., KEIN Flamo-QR', () => {
  const h = load().html(own(), 'customer');
  assert.match(h, /rc-vl">A</); assert.match(h, /rc-vl">B</);
  assert.ok(h.includes('A = 7 % · B = 19 % MwSt inkl.'));
  assert.ok(h.includes('USt-IdNr. DE357658231'));
  assert.ok(!h.includes('data-flamo-qr')); assert.ok(!h.includes('QR-Code scannen'));
});

test('Bon mit nur einem Steuersatz: Legende nennt nur diesen', () => {
  const h = load().html(own({ cart: [cart[0]] }), 'customer');
  assert.ok(h.includes('A = 7 % MwSt inkl.')); assert.ok(!h.includes('B = 19'));
});

test('Menü-Zeile bekommt A/B', () => {
  const h = load().html(own({ cart: [{ name: 'Cheese Burger Menü', unitCents: 1100, quantity: 1, vatRates: [7, 19] }] }), 'customer');
  assert.match(h, /rc-vl">A\/B</);
});

test('Lieferung (eigene): Flamo-QR für den Fahrer bleibt', () => {
  const h = load().html(own({ type: 'delivery', delivery: { street: 'Weg', house: '1' } }), 'customer');
  assert.ok(h.includes('data-flamo-qr'));
});

test('Plattform-Bestellung: kein USt-IdNr., keine Buchstaben, QR bleibt', () => {
  const h = load().html({ id: 'p1', type: 'delivery', platform: 'LIEFERANDO', externalOrderCode: 'ABC123', cart: [{ name: 'Burger', unitCents: 1000, quantity: 1 }], delivery: {} }, 'customer');
  assert.ok(!h.includes('USt-IdNr')); assert.ok(!/rc-vl/.test(h)); assert.ok(h.includes('data-flamo-qr'));
});

test('Fahrer-Zettel: keine Buchstaben, keine Legende, keine USt-IdNr.', () => {
  const h = load().html(own({ type: 'delivery' }), 'driver');
  assert.ok(!/rc-vl/.test(h)); assert.ok(!h.includes('MwSt inkl.')); assert.ok(!h.includes('USt-IdNr'));
});

test('TSE-Block: nur Beleg-Nr. + QR, keine langen Datenzeilen; ausgefallene TSE wird vermerkt', () => {
  const R = load();
  const ok = R.html(own({ tseReceipts: [{ receiptNumber: 'FL-1', status: 'SIGNED', qr: 'V0;K;...' }] }), 'customer');
  assert.ok(ok.includes('Beleg FL-1')); assert.ok(ok.includes('TSE-Daten im QR-Code')); assert.ok(!ok.includes('Signaturzähler')); assert.ok(!ok.includes('Das ist keine Rechnung'));
  const bad = R.html(own({ tseReceipts: [{ receiptNumber: 'FL-2', status: 'TSE_FAILED' }] }), 'customer');
  assert.ok(bad.includes('TSE ausgefallen'));
});

test('Bon zeigt Bestellnummer und Datum/Uhrzeit (Ausstellungsdatum ist Pflicht, § 33 UStDV)', () => {
  const R = load();
  const r = R.toReceiptOrder(own({ displayCode: 'FLAMO-AB12CD', createdAt: '2026-11-10T17:19:00Z' }), 'customer');
  assert.equal(r.displayCode, 'FLAMO-AB12CD'); assert.ok(r.placedAt); assert.equal(r.platform, 'FLAMO');
  const h = R.html(own({ displayCode: 'FLAMO-AB12CD', createdAt: '2026-11-10T17:19:00Z' }), 'customer');
  assert.ok(h.includes('FLAMO-AB12CD')); assert.match(h, /\d{2}\.\d{2}\.2026 · \d{2}:\d{2}/);
});
