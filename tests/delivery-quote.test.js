'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('../delivery-quote.js');

const NOW = Date.parse('2026-10-09T12:00:00Z');
const at = m => new Date(NOW + m * 60000).toISOString();
const cart = n => [{ name: 'Cheese Burger', quantity: n, unitCents: 799 }];
const near = { lat: 51.2556, lng: 6.4236 };  // ~2 km
const lf = (id, extra) => ({ id, platform: 'LIEFERANDO', displayCode: 'LF-' + id, type: 'delivery', status: 'OPEN', cart: cart(1), placedAt: at(-1), confirmedAt: at(-1), delivery: { ...near, postal: '41747' }, ...extra });

test('ASAP order: recommends minutes from size + distance, compares with platform time', () => {
  const o = lf('1', { dueAt: at(29) });
  const q = Q.quote({ orders: [o] }, o, NOW);
  assert.equal(q.scheduled, false);
  assert.ok(q.driveMin > 0 && q.km > 1);
  assert.equal(q.recommendMin % 5, 0);
  assert.equal(q.platformMin, 30);
  assert.equal(q.promisedMin, 60); assert.equal(q.addMin, Math.max(0, q.recommendMin - 60));
  const big = Q.quote({ orders: [] }, lf('2', { cart: cart(20) }), NOW);
  assert.ok(big.recommendMin > q.recommendMin, 'bigger order → more time');
});

test('scheduled (geplant): feasible tells when to start; too soon suggests a later time', () => {
  const ok = Q.quote({ orders: [] }, lf('3', { requestedAt: at(180) }), NOW);
  assert.equal(ok.scheduled, true); assert.equal(ok.feasible, true);
  assert.ok(Date.parse(ok.startAt) > NOW && Date.parse(ok.startAt) < NOW + 180 * 60000);
  const tight = Q.quote({ orders: [] }, lf('4', { requestedAt: at(12), cart: cart(20) }), NOW);
  assert.equal(tight.feasible, false);
  assert.ok(Date.parse(tight.suggestedAt) > Date.parse(tight.requestedAt));
});

test('fresh quotes: only new platform orders not yet started in the kitchen', () => {
  const data = { orders: [lf('5'), lf('6', { kitchenStatus: 'PREPARING' }), lf('7', { placedAt: at(-60) }), { id: 'k', source: 'NARA', cart: cart(1), placedAt: at(-1) }] };
  assert.deepEqual(Q.freshQuotes(data, NOW).map(q => q.orderId), ['5']);
});

test('no platform time: compares with our standard 60 minutes', () => {
  const o = lf('8');
  const q = Q.quote({ orders: [] }, o, NOW);
  assert.equal(q.platformMin, 60); assert.equal(q.addMin, 0); assert.equal(q.setMin, 60);
  const chosen = Q.quote({ orders: [] }, lf('10', { promisedMin: 45 }), NOW);
  assert.equal(chosen.promisedMin, 45); assert.equal(chosen.promisedSet, true);
  const huge = Q.quote({ orders: [], settings: { kitchen: { parallelOrders: 1 } } }, lf('9', { cart: cart(120) }), NOW);
  assert.ok(huge.addMin > 0 && huge.setMin > 60);
});
