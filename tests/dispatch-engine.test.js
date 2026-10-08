'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../dispatch-engine.js');

const NOW = Date.parse('2026-10-08T17:00:00Z');
const at = m => new Date(NOW + m * 60000).toISOString();
const SHOP = { lat: 51.2556, lng: 6.3936 };          // Gereonstraße, Viersen
const NORTH1 = { lat: 51.2870, lng: 6.3810 };        // Süchteln
const NORTH2 = { lat: 51.2905, lng: 6.3790 };        // Süchteln, نفس الاتجاه
const WEST = { lat: 51.2520, lng: 6.3360 };          // Dülken
const SOUTH = { lat: 51.2050, lng: 6.4300 };         // Mönchengladbach Anfang
const NEAR = { lat: 51.2585, lng: 6.3990 };          // قريب من المحل

const order = (id, p, readyMin = 0, dueMin = 40) => ({ id, code: id, ...p, readyAt: at(readyMin), dueAt: at(dueMin), createdAt: at(-5) });
const byOrder = r => Object.fromEntries(r.assignments.map(a => [a.orderId, a]));

test('same direction orders go together in one tour', () => {
  const r = E.plan({ now: NOW, shop: SHOP, drivers: [{ id: 'd1', name: 'Ali' }], orders: [order('a', NORTH1), order('b', NORTH2)] });
  const a = byOrder(r);
  assert.equal(a.a.tour, 1); assert.equal(a.b.tour, 1);
  assert.equal(a.a.stop, 1); assert.equal(a.b.stop, 2); // الأقرب أول
});

test('opposite directions with two free drivers: one each, both leave now', () => {
  const r = E.plan({ now: NOW, shop: SHOP, drivers: [{ id: 'd1', name: 'Ali' }, { id: 'd2', name: 'Sami' }], orders: [order('n', NORTH1), order('s', SOUTH)] });
  const a = byOrder(r);
  assert.notEqual(a.n.driverId, a.s.driverId);
  assert.equal(a.n.departAt, at(0)); assert.equal(a.s.departAt, at(0));
});

test('driver who is back first takes the order, no matter who', () => {
  const drivers = [
    { id: 'far', name: 'Far', position: SOUTH, remainingStops: [] },   // لسا راجع من Mönchengladbach
    { id: 'close', name: 'Close', position: NEAR, remainingStops: [] }, // تقريباً بالمحل
  ];
  const r = E.plan({ now: NOW, shop: SHOP, drivers, orders: [order('x', WEST)] });
  assert.equal(byOrder(r).x.driverId, 'close');
  const far = r.drivers.find(d => d.driverId === 'far');
  assert.ok(Date.parse(far.freeAt) > NOW + 10 * 60000, 'return time is computed from position');
});

test('one driver, many orders: everything planned, tight orders first, nobody waits forever', () => {
  const orders = [order('n1', NORTH1, 0, 35), order('n2', NORTH2, 0, 45), order('w', WEST, 0, 30), order('s', SOUTH, 0, 70), order('c', NEAR, 0, 25)];
  const r = E.plan({ now: NOW, shop: SHOP, drivers: [{ id: 'd1', name: 'Ali' }], orders });
  assert.equal(r.assignments.length, 5);
  const a = byOrder(r);
  assert.equal(a.n1.tour, a.n2.tour, 'north orders share a tour');
  assert.ok(a.c.tour === 1, 'near urgent order goes in the first tour');
  const tours = r.drivers[0].tours;
  for (let i = 1; i < tours.length; i++) assert.ok(Date.parse(tours[i].departAt) >= Date.parse(tours[i - 1].backAt), 'next tour starts after he is back');
});

test('an order that is ready much later does not hold the tour', () => {
  const r = E.plan({ now: NOW, shop: SHOP, drivers: [{ id: 'd1', name: 'Ali' }], orders: [order('now', NORTH1, 0, 30), order('later', NORTH2, 20, 60)] });
  const a = byOrder(r);
  assert.equal(a.now.departAt, at(0));
  assert.notEqual(a.now.tour, a.later.tour);
});

test('waits a few minutes for a nearby order if it is worth it', () => {
  const r = E.plan({ now: NOW, shop: SHOP, drivers: [{ id: 'd1', name: 'Ali' }], orders: [order('a', NORTH1, 0, 40), order('b', NORTH2, 4, 45)] });
  const a = byOrder(r);
  assert.equal(a.a.tour, a.b.tour);
  assert.equal(a.a.departAt, at(4));
  assert.equal(a.a.lateMin + a.b.lateMin, 0);
});

test('orders without location and plans without drivers are reported, not dropped silently', () => {
  let r = E.plan({ now: NOW, shop: SHOP, drivers: [{ id: 'd1' }], orders: [{ id: 'x', readyAt: at(0) }] });
  assert.deepEqual(r.unplaced, [{ id: 'x', reason: 'NO_LOCATION' }]);
  r = E.plan({ now: NOW, shop: SHOP, drivers: [], orders: [order('a', NEAR)] });
  assert.equal(r.ok, false); assert.equal(r.unplaced[0].reason, 'NO_DRIVERS');
});

test('Google Maps link: free directions URL with stops in order', () => {
  const url = E.googleMapsLink(SHOP, [NORTH1, NORTH2]);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  const q = new URL(url).searchParams;
  assert.equal(q.get('origin'), '51.2556,6.3936');
  assert.equal(q.get('destination'), '51.2905,6.379');
  assert.equal(q.get('waypoints'), '51.287,6.381');
});
