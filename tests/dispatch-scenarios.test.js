'use strict';
// سيناريوهات حقيقية بسائقين (الحالة العادية بالمحل)
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../dispatch-engine.js');

const NOW = Date.parse('2026-10-08T18:00:00Z');
const at = m => new Date(NOW + m * 60000).toISOString();
const SHOP = { lat: 51.2556, lng: 6.3936 };
const P = {
  near: { lat: 51.2585, lng: 6.3990 }, near2: { lat: 51.2530, lng: 6.4010 },
  north1: { lat: 51.2870, lng: 6.3810 }, north2: { lat: 51.2905, lng: 6.3790 }, north3: { lat: 51.2850, lng: 6.3700 },
  west1: { lat: 51.2520, lng: 6.3360 }, west2: { lat: 51.2490, lng: 6.3300 },
  south: { lat: 51.2050, lng: 6.4300 }, east: { lat: 51.2600, lng: 6.4300 },
};
const o = (id, p, ready = 0, due = 40) => ({ id, code: id, ...P[p], readyAt: at(ready), dueAt: at(due), createdAt: at(-5) });
const two = (extra = {}) => [{ id: 'A', name: 'Ali', ...extra.A }, { id: 'B', name: 'Sami', ...extra.B }];
const run = (orders, drivers = two()) => { const r = E.plan({ now: NOW, shop: SHOP, drivers, orders }); return { r, by: Object.fromEntries(r.assignments.map(a => [a.orderId, a])) }; };
const late = r => r.assignments.filter(a => a.lateMin > 0).length;

test('1) north group + one south: north together with one driver, south with the other', () => {
  const { r, by } = run([o('n1', 'north1'), o('n2', 'north2'), o('n3', 'north3'), o('s', 'south', 0, 45)]);
  assert.equal(by.n1.driverId, by.n2.driverId); assert.equal(by.n2.driverId, by.n3.driverId);
  assert.notEqual(by.s.driverId, by.n1.driverId);
  assert.equal(late(r), 0);
});

test('2) one driver almost back, other at shop: the free one leaves now', () => {
  const { by } = run([o('x', 'east')], two({ A: { position: P.west1 } }));
  assert.equal(by.x.driverId, 'B'); assert.equal(by.x.departAt, at(0));
});

test('3) both out: the one who comes back first takes the order', () => {
  const { by } = run([o('x', 'north1')], two({ A: { position: P.south }, B: { position: P.near } }));
  assert.equal(by.x.driverId, 'B');
});

test('4) one driver still has stops, order on his way back is NOT forced on him — earliest delivery wins', () => {
  const { by } = run([o('x', 'west2')], two({ A: { position: P.west1, remainingStops: [P.west2] } }));
  assert.equal(by.x.driverId, 'B', 'A must first come back to the shop to pick the food');
});

test('5) local orders and a far Mönchengladbach order: far one does not delay the locals', () => {
  const { r, by } = run([o('far', 'south', 0, 50), o('l1', 'near', 0, 25), o('l2', 'near2', 0, 25), o('l3', 'east', 0, 30)]);
  const farDriver = by.far.driverId;
  for (const id of ['l1', 'l2']) assert.equal(by[id].lateMin, 0, id + ' on time');
  assert.ok(['l1', 'l2', 'l3'].some(id => by[id].driverId !== farDriver));
  assert.equal(late(r), 0);
});

test('6) kitchen still cooking one order (ready in 15 min): ready orders leave now', () => {
  const { by } = run([o('ready1', 'north1'), o('ready2', 'west1'), o('later', 'north2', 15, 55)]);
  assert.equal(by.ready1.departAt, at(0)); assert.equal(by.ready2.departAt, at(0));
  assert.ok(Date.parse(by.later.departAt) >= NOW + 15 * 60000);
});

test('7) rush hour: 12 orders, 2 drivers — all planned, max 5 per tour, tours in sequence, fast enough', () => {
  const names = Object.keys(P), orders = [];
  for (let i = 0; i < 12; i++) orders.push(o('r' + i, names[i % names.length], i % 3 * 3, 30 + i * 4));
  const t0 = Date.now();
  const { r } = run(orders);
  assert.ok(Date.now() - t0 < 3000, 'computed in under 3 s');
  assert.equal(r.assignments.length, 12);
  for (const d of r.drivers) {
    d.tours.forEach((t, i) => {
      assert.ok(t.stops.length <= 5);
      if (i) assert.ok(Date.parse(t.departAt) >= Date.parse(d.tours[i - 1].backAt));
    });
  }
  // كل سائق عنده شغل (ما في واحد قاعد والتاني عم يتأخر)
  assert.ok(r.drivers.every(d => d.tours.length > 0));
});

test('8) same direction but one is urgent: urgent stop comes first in the tour', () => {
  const { by } = run([o('far', 'north2', 0, 60), o('urgent', 'north3', 0, 15)], [{ id: 'A', name: 'Ali' }]);
  assert.equal(by.urgent.stop, 1);
});
