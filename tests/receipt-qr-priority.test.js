const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

// kasse-receipt.js is a browser IIFE: load it with a minimal fake window
function load() {
  const win = { addEventListener() {}, NARA_LANG: null };
  const ctx = { window: win, localStorage: { getItem: () => null }, document: { getElementById: () => null, addEventListener() {} }, console, fetch: () => Promise.resolve({ ok: false }), import: () => Promise.reject(new Error('n/a')), setTimeout, clearTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('kasse-receipt.js', 'utf8').replace(/import\('\/nara-receipt-core\.mjs'\)/, 'Promise.reject(new Error("n/a"))'), ctx);
  return win.NARA_RECEIPT;
}

const SCOOBER = 'https://mca.scoober.com/qr/?ref=YQHT3W&id=3a89d8c58efa7d0fed5bdb252a325dbc';
const OWN = 'https://app.flamo.co.de/delivery.html?token=delivery-qr_abc';
const base = { type: 'delivery', platform: 'LIEFERANDO', externalOrderCode: 'YQHT3W', cart: [], delivery: {} };

test('Lieferando-Bestellung mit Scoober-QR: Beleg druckt den Scoober-QR', () => {
  const R = load();
  assert.strictEqual(R.toReceiptOrder({ ...base, deliveryQrUrl: SCOOBER, ownDeliveryQrUrl: OWN }, 'customer').deliveryQrUrl, SCOOBER);
});

test('ohne Scoober-QR: Fallback auf eigenen QR', () => {
  const R = load();
  assert.strictEqual(R.toReceiptOrder({ ...base, ownDeliveryQrUrl: OWN }, 'customer').deliveryQrUrl, OWN);
});

test('weder noch: leer (Beleg nutzt dann den internen FLAMO-Payload)', () => {
  const R = load();
  assert.strictEqual(R.toReceiptOrder({ ...base }, 'customer').deliveryQrUrl, '');
});
