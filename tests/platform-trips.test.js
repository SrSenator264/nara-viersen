'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../platform-trips.js');

const base = Date.parse('2026-10-10T18:00:00Z');
const at = m => new Date(base + m * 60000).toISOString();
const ord = (id, lat, lng, pu, dl, who = 'Motaz F.') => ({ id, source: 'LIEFERANDO', type: 'delivery', courierName: who, platformPickupAt: at(pu), platformDeliveredAt: dl == null ? null : at(dl), delivery: { lat, lng, postal: '41749' } });

test('only real times are taken from Lieferando JSON', () => {
  assert.deepEqual(T.timesFromLieferando({ status: 'kitchen', delivery_service_pickup_time: '2026-10-10T18:00:00Z', delivery_service_delivery_time: '2026-10-10T18:30:00Z', couriers: [] }), { platformPickupAt: null, platformDeliveredAt: null, courierName: '' });
  const r = T.timesFromLieferando({ status: 'delivered', delivery_service_pickup_time: '2026-10-10T18:00:00Z', delivery_service_delivery_time: '2026-10-10T18:12:00Z', couriers: [{ full_name: 'M O.' }] });
  assert.equal(r.platformDeliveredAt, '2026-10-10T18:12:00.000Z');
  assert.equal(r.courierName, 'M O.');
});

test('a tour of two orders learns shop→first and first→second', () => {
  const data = { orders: [ord('a', 51.27, 6.39, 0, 8), ord('b', 51.28, 6.37, 1, 17)] };
  const r = T.learn(data, base + 3600000);
  assert.equal(r.learned, 2);
  const s = data.dispatchLearning.samples;
  assert.equal(s[0].actualMin, 8);
  assert.equal(s[1].actualMin, 6); // 17 - 8 - 3 Minuten Übergabe
  assert.equal(T.learn(data, base + 3600000).learned, 0, 'nothing learned twice');
});

test('taps pressed together or forgotten are skipped', () => {
  const data = { orders: [ord('x', 51.27, 6.39, 0, 0.1), ord('y', 51.27, 6.39, 20, 90, 'Guest')] };
  const r = T.learn(data, base + 4 * 3600000);
  assert.equal(r.learned, 0);
  assert.equal(r.skipped, 2);
});

test('an unfinished tour waits; orders without position wait for geocoding', () => {
  const data = { orders: [ord('w', 51.27, 6.39, 0, null)] };
  assert.equal(T.learn(data, base + 600000).waiting, 1);
  const d2 = { orders: [{ ...ord('n', null, null, 0, 9), delivery: { address: 'Hauptstraße 5', postal: '41747', city: 'Viersen' } }] };
  assert.equal(T.learn(d2, base + 3600000).missingPos, 1);
  assert.deepEqual(T.missingAddresses(d2), ['Hauptstraße 5, 41747 Viersen, Deutschland']);
});
