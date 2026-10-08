'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../dispatch-service.js');

const NOW = Date.parse('2026-10-08T17:00:00Z');
const base = () => ({
  settings: {},
  employees: [
    { id: 'd1', name: 'Ali', role: 'DRIVER', active: true },
    { id: 'd2', name: 'Sami', role: 'DRIVER', active: true },
    { id: 'c1', name: 'Kasse', role: 'CASHIER', active: true },
  ],
  attendanceEvents: [], shifts: [],
  geocodeCache: { [S.addressKey('Hauptstr. 5, 41747, Deutschland')]: { lat: 51.26, lng: 6.39 } },
  deliveryRoutes: [],
  orders: [
    { id: 'p1', platform: 'LIEFERANDO', type: 'delivery', status: 'OPEN', createdAt: '2026-10-08T16:50:00Z', delivery: { lat: 51.287, lng: 6.381, street: 'X' }, cart: [{ name: 'A', quantity: 1 }] },
    { id: 'k1', type: 'delivery', status: 'OPEN', createdAt: '2026-10-08T16:55:00Z', delivery: { street: 'Hauptstr.', house: '5', postal: '41747' }, cart: [{ name: 'B', quantity: 1 }] },
    { id: 'k2', type: 'delivery', status: 'OPEN', createdAt: '2026-10-08T16:55:00Z', delivery: { street: 'Unbekannt', house: '1', postal: '41747' }, cart: [{ name: 'B', quantity: 1 }] },
    { id: 'l1', brand: 'Loco Chicken', type: 'delivery', status: 'OPEN', createdAt: '2026-10-08T16:58:00Z', delivery: { lat: 51.25, lng: 6.33 }, cart: [{ name: 'Bucket', quantity: 1 }] },
    { id: 'pk', type: 'pickup', status: 'OPEN', cart: [{ name: 'C', quantity: 1 }] },
    { id: 'done', type: 'delivery', status: 'COMPLETED', delivery: { lat: 51.2, lng: 6.4 }, cart: [] },
  ],
});

test('input: only open delivery orders (Loco too — our drivers deliver it), coords from order or address cache', () => {
  const inp = S.buildInput(base(), NOW);
  assert.deepEqual(inp.orders.map(o => o.id).sort(), ['k1', 'k2', 'l1', 'p1']);
  const k1 = inp.orders.find(o => o.id === 'k1');
  assert.equal(k1.lat, 51.26);
  assert.ok(Number.isNaN(inp.orders.find(o => o.id === 'k2').lat));
  assert.deepEqual(S.missingAddresses(base()), ['Unbekannt 1, 41747, Deutschland']);
});

test('drivers: clocked-in drivers only; if nobody clocked in, all active drivers (flagged)', () => {
  let inp = S.buildInput(base(), NOW);
  assert.deepEqual(inp.drivers.map(d => d.id), ['d1', 'd2']); assert.equal(inp.assumedDrivers, true);
  const data = base(); data.attendanceEvents.push({ employeeId: 'd2', action: 'CLOCK_IN', at: '2026-10-08T15:00:00Z' });
  inp = S.buildInput(data, NOW);
  assert.deepEqual(inp.drivers.map(d => d.id), ['d2']); assert.equal(inp.assumedDrivers, false);
});

test('orders already out on a tour are not re-planned; they make the driver busy', () => {
  const data = base();
  data.deliveryRoutes.push({ id: 'r1', employeeId: 'd1', orderIds: ['p1'], startedAt: '2026-10-08T16:59:00Z' });
  data.driverPositions = { d1: { lat: 51.27, lng: 6.385, at: '2026-10-08T16:59:30Z' } };
  const inp = S.buildInput(data, NOW);
  assert.ok(!inp.orders.some(o => o.id === 'p1'));
  const d1 = inp.drivers.find(d => d.id === 'd1');
  assert.deepEqual(d1.position, { lat: 51.27, lng: 6.385 });
  assert.equal(d1.remainingStops.length, 1);
  const r = S.planFor(data, NOW);
  assert.equal(r.ok, true);
  assert.ok(r.drivers.every(d => d.tours.every(t => /google\.com\/maps\/dir/.test(t.googleMapsUrl))));
  assert.deepEqual(r.unplaced.map(u => u.id), ['k2']);
});

test('geocode uses Nominatim with a clear user agent and returns lat/lng', async () => {
  let seen;
  const fake = async (url, opt) => { seen = { url, opt }; return { ok: true, json: async () => [{ lat: '51.25', lon: '6.39' }] }; };
  assert.deepEqual(await S.geocode('Hauptstr. 5, 41747 Viersen', fake), { lat: 51.25, lng: 6.39 });
  assert.match(seen.url, /nominatim\.openstreetmap\.org\/search/);
  assert.match(seen.opt.headers['User-Agent'], /NARA/);
});
