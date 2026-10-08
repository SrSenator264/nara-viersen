'use strict';
const test = require('node:test'), assert = require('node:assert/strict');

// نفس شكل رد Sides الحقيقي (showSingleOrderdata)، بأسماء وهمية
const detail = { status: 1, response: {
  orderDataset: { id: '3891433', amount: '18.97', billingnumber: '539L1512', billingdate: '2026-10-08 18:33:04', createdate: '2026-10-08 18:33:04', expectedDeliveryDate: '2026-10-08 19:18:04', orderportal_name: 'Lieferando', ordertype_constantname: 'getdelivered', orderstatetype_constantname: 'deliveredToStore', isCanceled: '0', comment: 'Bitte klingeln' },
  customerDataset: { user_name: 'Max', user_surname: 'Muster', customer_telephone: '0151 000', customer_street: 'Gerberstraße', customer_streetnumber: '28', customer_zip: '41748', customer_city: 'Viersen', geocoding_lat: '51.25', geocoding_lng: '6.39', customer_doorbell: 'Muster' },
  billposList: [
    { article_name: 'All in One Combo', amount: 1, value: 19.99, totalPrice: 24.97, isMenue: 1, isVoucher: 0, isTip: false, menuParts: [
      { article_name: 'Big Cheese Burger', amount: 1, value: 2.99, totalPrice: 2.99 },
      { article_name: 'Regular Filets (7x)', amount: 1, value: 1.99, totalPrice: 1.99 },
      { article_name: 'Crunchy Fries', amount: 1, value: 0, totalPrice: 0 }] },
    { article_name: 'Rabatt (7% MwSt.)', amount: 1, value: 6, totalPrice: 6, isVoucher: 1, isTip: false },
  ],
  paymentsList: [{ paymenttype_constantname: 'takeaway.com', paymenttypecategory_isCash: 0, paymenttypecategory_isOnline: 1 }],
  deliveryPortalInfo: { referenceId: 'VMB9JY' },
} };

test('Sides order → NARA order (Loco, Lieferando code, menu parts, discount, online)', async () => {
  const { normalizeSides, berlinToIso } = await import('../sides-normalize.mjs');
  const o = normalizeSides(detail, { id: 3891433 });
  assert.equal(o.externalOrderCode, 'SIDES-3891433');
  assert.equal(o.displayCode, 'VMB9JY');
  assert.equal(o.platform, 'LIEFERANDO');
  assert.equal(o.brand, 'Loco Chicken');
  assert.equal(o.type, 'delivery');
  assert.equal(o.totalCents, 1897); assert.equal(o.discountCents, 600);
  assert.equal(o.parseStatus, 'OK', o.warnings.join());
  assert.equal(o.payment.method, 'ONLINE'); assert.equal(o.cashDueCents, 0);
  assert.equal(o.cart.length, 1);
  assert.deepEqual(o.cart[0].options.map(x => x.name), ['Big Cheese Burger', 'Regular Filets (7x)', 'Crunchy Fries']);
  assert.equal(o.delivery.street, 'Gerberstraße'); assert.equal(o.delivery.house, '28'); assert.equal(o.delivery.postal, '41748');
  assert.match(o.delivery.notes, /Klingel: Muster/);
  assert.equal(o.createdAt, '2026-10-08T16:33:04.000Z'); // Sommerzeit
  assert.equal(berlinToIso('2026-12-01 12:00:00'), '2026-12-01T11:00:00.000Z'); // Winterzeit
  assert.equal(o.liveStage, 'PREPARE');
  assert.equal(normalizeSides({ response: { ...detail.response, orderDataset: { ...detail.response.orderDataset, isCanceled: '1' } } }).liveStage, 'CANCELLED');
});

test('Loco/Sides orders are recorded but never on our kitchen tablet', async () => {
  const { normalizeSides } = await import('../sides-normalize.mjs');
  const K = require('../kitchen.js');
  const o = { ...normalizeSides(detail), id: 'x', source: 'SIDES', status: 'OPEN' };
  assert.equal(K.listKitchenOrders([o], Date.parse('2026-10-08T16:40:00Z')).length, 0);
});

test('Loco delivery goes to our dispatch (same drivers) with Sides ready time', async () => {
  const { normalizeSides } = await import('../sides-normalize.mjs');
  const S = require('../dispatch-service.js');
  const o = { ...normalizeSides(detail, { id: 1, routing: { expectedTourStart: '2026-10-08 18:48:00' } }), id: 'loco1', source: 'SIDES', status: 'OPEN' };
  assert.equal(o.readyAt, '2026-10-08T16:48:00.000Z');
  const inp = S.buildInput({ settings: {}, employees: [], orders: [o] }, Date.parse('2026-10-08T16:40:00Z'));
  assert.equal(inp.orders.length, 1);
  assert.equal(inp.orders[0].readyAt, '2026-10-08T16:48:00.000Z');
});
