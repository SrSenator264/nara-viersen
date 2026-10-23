'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
global.window = global.window || {};
const { cards, deliveryHold } = require('../kasse-open-orders.js');
const { shouldAutoKitchen } = require('../kasse-payment.js');
const T = { table: 'Tisch', local: 'Im Restaurant', delivery: 'Lieferung', pickup: 'Abholung' };
const item = (c, q = 1) => ({ name: 'x', unitCents: c, quantity: q });

test('cards: open orders with items stay visible, current one is highlighted, totals/counts are right', () => {
  const orders = [
    { id: 'a', type: 'delivery', delivery: { name: 'OMAR' }, cart: [item(799), item(500, 2)] },
    { id: 'b', type: 'local', table: '4', cart: [item(1000)] },
    { id: 'c', type: null, cart: [] }, // leerer Entwurf: keine Karte
  ];
  const r = cards(orders, { a: { kitchen: true } }, 'b', T);
  assert.deepEqual(r.map(x => x.id), ['a', 'b']);
  assert.deepEqual([r[0].title, r[0].items, r[0].cents, r[0].kitchen, r[0].active], ['OMAR', 3, 1799, true, false]);
  assert.deepEqual([r[1].title, r[1].kitchen, r[1].active], ['Tisch 4', false, true]);
});
test('cards: sending to the kitchen does not hide the order; paid/cancelled (local or server) do', () => {
  const orders = [
    { id: 'k', type: 'pickup', delivery: { name: 'Sam' }, cart: [item(500)] },
    { id: 'p', type: 'pickup', status: 'COMPLETED', cart: [item(500)] },
    { id: 's', type: 'pickup', cart: [item(500)] },
    { id: 'x', type: 'pickup', status: 'CANCELLED', cart: [item(500)] },
  ];
  const r = cards(orders, { k: { kitchen: true, status: 'OPEN' }, s: { status: 'COMPLETED' } }, 'k', T);
  assert.deepEqual(r.map(x => x.id), ['k']);
});
test('auto kitchen after payment: dine-in/pickup yes (once), delivery no, already-sent no, empty no', () => {
  const cart = [item(500)];
  assert.equal(shouldAutoKitchen({ type: 'local', cart }, null), true);
  assert.equal(shouldAutoKitchen({ type: 'pickup', cart }, {}), true);
  assert.equal(shouldAutoKitchen({ type: 'delivery', cart }, null), false);
  assert.equal(shouldAutoKitchen({ type: 'local', cart }, { kitchenPrintedAt: '2026-10-23T10:00:00Z' }), false);
  assert.equal(shouldAutoKitchen({ type: 'local', cart }, { kitchenStatus: 'PREPARING' }), false);
  assert.equal(shouldAutoKitchen({ type: 'local', cart: [] }, null), false);
});
test('wiring: script is served (whitelist), loaded by the cashier page, and payment uses the kitchen print hook', () => {
  assert.match(read('auth.js'), /'kasse-open-orders\.js'/);
  assert.match(read('kasse.html'), /kasse-open-orders\.js/);
  assert.match(read('kasse-print-lifecycle.js'), /window\.NARA_PRINT_KITCHEN=\(\)=>print\('kitchen','KITCHEN_PRINT'\)/);
  const p = read('kasse-payment.js');
  assert.ok(p.indexOf("ctx.send('FINALIZE_PAYMENT'") < p.indexOf('NARA_PRINT_KITCHEN()'), 'kitchen only after the payment succeeded');
});
test('delivery: cash/card are replaced by pay-on-delivery until delivered or "pay now"; other types untouched', () => {
  const cart = [item(1600)], d = { id: 'd1', type: 'delivery', cart };
  assert.equal(deliveryHold(d, undefined, ''), true);
  assert.equal(deliveryHold(d, { kitchen: true }, ''), true);          // nach "für Küche" weiter ohne Kassendialog
  assert.equal(deliveryHold(d, { delivered: true }, ''), false);       // geliefert -> Bar/Karte wieder da
  assert.equal(deliveryHold(d, {}, 'd1'), false);                      // "Jetzt kassieren"
  assert.equal(deliveryHold(d, {}, 'other'), true);
  assert.equal(deliveryHold({ id: 'l', type: 'local', cart }, {}, ''), false);
  assert.equal(deliveryHold({ id: 'p', type: 'pickup', cart }, {}, ''), false);
  assert.equal(deliveryHold({ id: 'e', type: 'delivery', cart: [] }, {}, ''), false);
  const c = cards([d], { d1: { delivered: true } }, 'd1', T)[0];
  assert.equal(c.delivered, true);                                     // Karte zeigt "geliefert - kassieren"
});
