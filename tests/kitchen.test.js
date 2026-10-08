'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../kitchen.js');

const NOW = Date.parse('2026-10-08T12:00:00Z');
const kasseOrder = {
  id: 'o1', type: 'delivery', status: 'OPEN', createdAt: '2026-10-08T11:50:00Z', preparationMinutes: 20,
  delivery: { name: 'Ali', phone: '0151 000', street: 'Gereonstr.', house: '1', postal: '41747', notes: 'Klingel 2' },
  cart: [
    { name: 'Smash Burger', quantity: 2, unitCents: 999, note: 'ohne Gurke', options: [{ name: 'Einzel / بدون منيو', cents: 0 }, { name: 'Cheddar', cents: 100, quantity: 1 }] },
    { name: 'Lieferkosten', kind: 'DELIVERY_FEE', unitCents: 100, quantity: 1 },
  ],
  discount: { amountCents: 200 }, payment: { method: 'CASH' },
};
const platformOrder = {
  id: 'p1', platform: 'LIEFERANDO', type: 'delivery', status: 'OPEN', displayCode: 'B68HFC', placedAt: '2026-10-08T11:55:00Z',
  kitchenStartAt: '2026-10-08T11:55:00Z', prepMinutes: 15, remarks: 'Extra scharf', totalCents: 2590, cashDueCents: 2590,
  cart: [{ name: 'Crispy Chicken', quantity: 1, totalCents: 1199, notes: '', options: [{ name: 'Pommes', quantity: 1, totalCents: 250 }] }],
  fees: { delivery: 150 }, payment: { method: 'CASH' },
};

const MONEY_KEYS = /cents|price|total|amount|payment|discount|fee/i;
function assertNoMoney(v, path = '') {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    assert.ok(!MONEY_KEYS.test(k), 'forbidden key in kitchen view: ' + path + k);
    assertNoMoney(x, path + k + '.');
  }
}

test('kitchen view has no amounts or payment, but shows customer info', () => {
  for (const o of [kasseOrder, platformOrder]) {
    const v = K.kitchenView(o, NOW);
    assertNoMoney(v);
    const s = JSON.stringify(v);
    assert.ok(!/999|2590|1199|CASH/.test(s), s);
  }
  const v = K.kitchenView(kasseOrder, NOW);
  assert.equal(v.customerName, 'Ali'); assert.equal(v.phone, '0151 000');
  assert.equal(v.address, 'Gereonstr. 1'); assert.equal(v.city, '41747');
});

test('Loco Chicken orders (own Sides system) never show on our kitchen screen', () => {
  const orders = [{ ...kasseOrder, id: 'l1', brand: 'Loco Chicken' }, { ...kasseOrder, id: 'l2', source: 'SIDES' }, { ...kasseOrder, id: 'n1', brand: 'Just Smashed' }];
  assert.deepEqual(K.listKitchenOrders(orders, NOW).map(o => o.id), ['n1']);
});

test('category is looked up from the menu when the order has none', () => {
  const cat = K.catalogFrom({ categories: [{ id: 'c1', name: 'Beef Burger' }], products: [{ name: 'Smash Burger', categoryId: 'c1' }] });
  assert.equal(K.kitchenView(kasseOrder, NOW, cat).items[0].category, 'Beef Burger');
  assert.equal(K.kitchenView(platformOrder, NOW, cat).items[0].category, '');
});

test('delivery fee line is dropped, single-menu marker removed, notes kept', () => {
  const v = K.kitchenView(kasseOrder, NOW);
  assert.equal(v.items.length, 1);
  assert.deepEqual(v.items[0].options, [{ name: 'Cheddar', quantity: 1 }]);
  assert.equal(v.items[0].note, 'ohne Gurke');
  assert.equal(v.notes, 'Klingel 2');
  assert.equal(v.kitchenStatus, 'NEW');
  assert.equal(v.readyBy, '2026-10-08T12:10:00.000Z');
});

test('platform order: source, code and ready time from platform start + prep', () => {
  const v = K.kitchenView(platformOrder, NOW);
  assert.equal(v.source, 'LIEFERANDO');
  assert.equal(v.displayCode, 'B68HFC');
  assert.equal(v.readyBy, '2026-10-08T12:10:00.000Z');
  assert.equal(v.notes, 'Extra scharf');
});

test('list: closed and empty orders hidden, picked-up hidden after 10 minutes, sorted by state then deadline', () => {
  const orders = [
    { ...kasseOrder, id: 'a', kitchenStatus: 'READY' },
    { ...kasseOrder, id: 'b', status: 'COMPLETED' },
    { ...kasseOrder, id: 'c', cart: [{ name: 'Lieferkosten', kind: 'DELIVERY_FEE', unitCents: 100, quantity: 1 }] },
    { ...kasseOrder, id: 'd', kitchenStatus: 'PICKED_UP', kitchenStatusAt: '2026-10-08T11:40:00Z' },
    { ...kasseOrder, id: 'e', kitchenStatus: 'PICKED_UP', kitchenStatusAt: '2026-10-08T11:55:00Z' },
    { ...platformOrder, id: 'f' },
    { ...kasseOrder, id: 'g', createdAt: '2026-10-08T11:30:00Z' },
  ];
  assert.deepEqual(K.listKitchenOrders(orders, NOW).map(o => o.id), ['g', 'f', 'a', 'e']);
});

test('status change: validates, stamps who/when, syncs live-orders stage', () => {
  const o = { ...kasseOrder, liveStage: 'PREPARE' };
  assert.throws(() => K.applyKitchenStatus(o, 'COOKING', null), /غير صالحة/);
  let c = K.applyKitchenStatus(o, 'PREPARING', { name: 'Koch' }, '2026-10-08T12:01:00Z');
  assert.deepEqual(c, { from: 'NEW', to: 'PREPARING' });
  assert.equal(o.preparingAt, '2026-10-08T12:01:00Z'); assert.equal(o.kitchenStatusBy, 'Koch'); assert.equal(o.liveStage, 'PREPARE');
  K.applyKitchenStatus(o, 'READY', { name: 'Koch' }, '2026-10-08T12:09:00Z');
  assert.equal(o.liveStage, 'HANDOVER'); assert.equal(o.readyAt, '2026-10-08T12:09:00Z');
  K.applyKitchenStatus(o, 'PREPARING', null, '2026-10-08T12:10:00Z');
  assert.equal(o.liveStage, 'PREPARE'); assert.equal(o.preparingAt, '2026-10-08T12:01:00Z');
  assert.throws(() => K.applyKitchenStatus({ ...o, status: 'COMPLETED' }, 'READY', null), /مغلق/);
});

test('kitchen ticket (receipt core) has no prices or payment', async () => {
  const core = await import('../nara-receipt-core.mjs');
  const lines = core.renderKitchenLines({
    displayCode: 'B68HFC', platform: 'LIEFERANDO', orderType: 'DELIVERY', placedAt: platformOrder.placedAt, readyBy: '2026-10-08T12:10:00Z',
    customerName: 'Max', remarks: 'Extra scharf', totalCents: 2590, payment: { method: 'CASH' },
    cart: [{ quantity: 1, name: 'Crispy Chicken', totalCents: 1199, options: [{ name: 'Pommes', quantity: 1, totalCents: 250 }] }],
  }, { lang: 'de' });
  const text = core.toText(lines);
  assert.match(text, /KÜCHE/); assert.match(text, /1x Crispy Chicken/); assert.match(text, /\+ Pommes/); assert.match(text, /Extra scharf/);
  assert.ok(!/EUR|€|11\.99|25\.90|BAR|Gesamt/i.test(text), text);
});
