'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const S = require('../dispatch-service.js');
const E = require('../dispatch-engine.js');

const NOW = '2026-11-04T17:00:00.000Z';
const SCOOBER = 'https://mca.scoober.com/qr/?ref=ABC123XY&id=0123456789abcdef0123456789abcdef';
const mk = (id, lat, lng, extra = {}) => ({ id, type: 'delivery', status: 'OPEN', createdAt: '2026-11-04T16:50:00Z', displayCode: 'C' + id, delivery: { lat, lng, street: 'S' + id }, cart: [], ...extra });
const base = () => ({
  settings: {}, attendanceEvents: [], shifts: [], geocodeCache: {}, deliveryRoutes: [],
  employees: [{ id: 'd1', name: 'Ali', role: 'DRIVER', active: true }, { id: 'd2', name: 'Sami', role: 'DRIVER', active: true }, { id: 'boss', name: 'Omar', role: 'OWNER', active: true }],
  orders: [
    mk('o1', 51.26, 6.39, { deliveryQrToken: 'delivery-qr_AAA', ownDeliveryQrUrl: 'https://app.flamo.co.de/delivery.html?token=delivery-qr_AAA' }),
    mk('o2', 51.30, 6.45, { deliveryQrUrl: SCOOBER, platform: 'LIEFERANDO', externalOrderCode: 'ABC123XY', displayCode: 'ABC123XY' }),
    mk('o3', 51.262, 6.392, { platform: 'UBER_EATS', displayCode: 'UB77' }),
    mk('o4', 51.27, 6.40, { type: 'pickup' }),
    mk('o5', 51.28, 6.41, { deliveredAt: '2026-11-04T16:55:00Z' }),
  ],
});
const d1 = { id: 'd1', name: 'Ali', role: 'DRIVER' }, d2 = { id: 'd2', name: 'Sami', role: 'DRIVER' };
const fails = (fn, code) => assert.throws(fn, e => e.code === code, code);

test('scan matching: our own link, Scoober URL (url + ref), FLAMO|platform|code, exact stored text', () => {
  const d = base();
  assert.equal(S.findOrderByScan(d, 'https://app.flamo.co.de/delivery.html?token=delivery-qr_AAA').id, 'o1');
  assert.equal(S.findOrderByScan(d, 'https://other.host/x?token=delivery-qr_AAA').id, 'o1'); // Host egal, Token zaehlt
  assert.equal(S.findOrderByScan(d, SCOOBER).id, 'o2');
  assert.equal(S.findOrderByScan(d, 'https://mca.scoober.com/qr/?ref=abc123xy&amp;id=0123456789ABCDEF0123456789abcdef').id, 'o2');
  assert.equal(S.findOrderByScan(d, 'https://mca.scoober.com/qr/?ref=ABC123XY&id=ffffffffffffffffffffffffffffffff').id, 'o2'); // ref als Ersatz
  assert.equal(S.findOrderByScan(d, 'FLAMO|UBER_EATS|UB77').id, 'o3');
  assert.equal(S.findOrderByScan(d, 'FLAMO||UB77').id, 'o3');
  assert.equal(S.findOrderByScan(d, 'FLAMO|LIEFERANDO|UB77'), null); // falsche Plattform
  assert.equal(S.findOrderByScan(d, 'hello'), null);
  assert.equal(S.findOrderByScan(d, ''), null);
  assert.equal(S.findOrderByScan(d, 'https://x/?token=nope'), null);
});

test('claim: creates a route for the driver, binds the order, answers with position/total', () => {
  const d = base();
  const r = S.claimByScan(d, { code: SCOOBER }, d1, NOW);
  assert.equal(r.already, false); assert.equal(r.code, 'ABC123XY'); assert.equal(r.stops, 1); assert.equal(r.order, 1);
  const o = d.orders.find(x => x.id === 'o2');
  assert.equal(o.driverId, 'd1'); assert.equal(o.assignmentStatus, 'ASSIGNED'); assert.ok(o.deliveryRouteId);
  assert.equal(d.deliveryRoutes.length, 1); assert.equal(d.deliveryRoutes[0].source, 'SCAN'); assert.equal(d.deliveryRoutes[0].startedAt, null);
  assert.equal(S.driverRoutes(d, 'd1')[0].stops.length, 1);
});

test('claim: scanning the same order again is "already" and changes nothing', () => {
  const d = base(); S.claimByScan(d, { code: SCOOBER }, d1, NOW);
  const before = JSON.stringify(d);
  const r = S.claimByScan(d, { code: SCOOBER }, d1, NOW);
  assert.equal(r.already, true); assert.equal(JSON.stringify(d), before);
});

test('claim: clear errors (not found / pickup / delivered / other driver / full / not a driver)', () => {
  const d = base();
  fails(() => S.claimByScan(d, { code: 'zzz' }, d1, NOW), 'NOT_FOUND');
  d.orders.push(mk('o9', 51.3, 6.4, { displayCode: 'PK1', platform: 'X', type: 'pickup' }));
  fails(() => S.claimByScan(d, { code: 'FLAMO|X|PK1' }, d1, NOW), 'NOT_DELIVERY');
  d.orders.push(mk('o10', 51.3, 6.4, { displayCode: 'DL1', platform: 'X', deliveredAt: '2026-11-04T16:00:00Z' }));
  fails(() => S.claimByScan(d, { code: 'FLAMO|X|DL1' }, d1, NOW), 'DELIVERED');
  S.claimByScan(d, { code: 'https://a/?token=delivery-qr_AAA' }, d2, NOW);
  assert.throws(() => S.claimByScan(d, { code: 'https://a/?token=delivery-qr_AAA' }, d1, NOW), e => e.code === 'TAKEN' && e.driverName === 'Sami' && e.status === 409);
  fails(() => S.claimByScan(d, { code: SCOOBER }, { id: 'boss', name: 'Omar', role: 'OWNER' }, NOW), 'DRIVERS_ONLY');
  const f = base(); f.deliveryRoutes.push({ id: 'r', employeeId: 'd1', employeeName: 'Ali', orderIds: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'], status: 'ASSIGNED', createdAt: NOW });
  fails(() => S.claimByScan(f, { code: SCOOBER }, d1, NOW), 'FULL');
});

test('claim: the remaining stops are re-ordered nearest-first from the shop (route not started)', () => {
  const d = base(); const shop = S.shopOf(d);
  const far = mk('far', shop.lat + 0.08, shop.lng + 0.08, { displayCode: 'FAR' }), near = mk('near', shop.lat + 0.005, shop.lng + 0.005, { displayCode: 'NEAR' }), mid = mk('mid', shop.lat + 0.03, shop.lng + 0.03, { displayCode: 'MID' });
  d.orders.push(far, near, mid);
  S.claimByScan(d, { code: 'FLAMO||FAR' }, d1, NOW); S.claimByScan(d, { code: 'FLAMO||MID' }, d1, NOW); S.claimByScan(d, { code: 'FLAMO||NEAR' }, d1, NOW);
  assert.deepEqual(d.deliveryRoutes[0].orderIds, ['near', 'mid', 'far']);
  assert.ok(d.orders.find(o => o.id === 'near').assignment.etaAt);
});

test('claim while the route is already out: delivered stop stays first, rest re-ordered from the DRIVER position, order leaves with him', () => {
  const d = base(); const shop = S.shopOf(d);
  const a = mk('a', shop.lat + 0.01, shop.lng, { displayCode: 'A' }), b = mk('b', shop.lat + 0.05, shop.lng, { displayCode: 'B' }), c = mk('c', shop.lat + 0.09, shop.lng, { displayCode: 'C9' });
  d.orders.push(a, b, c);
  S.claimByScan(d, { code: 'FLAMO||A' }, d1, NOW); S.claimByScan(d, { code: 'FLAMO||B' }, d1, NOW);
  S.startRoute(d, d.deliveryRoutes[0].id, d1, NOW);
  S.deliverStop(d, 'a', d1, { lat: a.delivery.lat, lng: a.delivery.lng }, '2026-11-04T17:05:00.000Z');
  // السائق صار قرب c (بعيد عن المحل): c لازم يجي قبل b
  const pos = { lat: shop.lat + 0.085, lng: shop.lng };
  const r = S.claimByScan(d, { code: 'FLAMO||C9', pos }, d1, '2026-11-04T17:06:00.000Z');
  assert.equal(r.started, true);
  assert.deepEqual(d.deliveryRoutes[0].orderIds, ['a', 'c', 'b']);
  const oc = d.orders.find(o => o.id === 'c'); assert.equal(oc.liveStage, 'HANDOVER'); assert.ok(oc.outAt);
});

test('claim after the previous round is fully delivered opens a NEW route (old one can still be finished)', () => {
  const d = base(); S.claimByScan(d, { code: SCOOBER }, d1, NOW);
  const rid = d.deliveryRoutes[0].id; S.startRoute(d, rid, d1, NOW); S.deliverStop(d, 'o2', d1, null, '2026-11-04T17:10:00.000Z');
  assert.ok(d.deliveryRoutes[0].allDeliveredAt);
  const r = S.claimByScan(d, { code: 'FLAMO||UB77' }, d1, '2026-11-04T17:20:00.000Z');
  assert.equal(d.deliveryRoutes.length, 2); assert.notEqual(r.routeId, rid); assert.equal(r.started, false);
});

test('maps link: not started = from the shop; out = no origin (Google uses the driver position)', () => {
  const shop = { lat: 51.25, lng: 6.39 }, stops = [{ lat: 51.26, lng: 6.4 }, { lat: 51.27, lng: 6.41 }];
  assert.match(E.googleMapsLink(shop, stops), /origin=51\.25%2C6\.39/);
  const u = E.googleMapsLink(shop, stops, { fromHere: true });
  assert.ok(!/origin=/.test(u)); assert.match(u, /destination=51\.27%2C6\.41/); assert.match(u, /waypoints=51\.26%2C6\.4/);
  const d = base(); S.claimByScan(d, { code: SCOOBER }, d1, NOW);
  assert.match(S.driverRoutes(d, 'd1')[0].googleMapsUrl, /origin=/);
  S.startRoute(d, d.deliveryRoutes[0].id, d1, NOW);
  assert.ok(!/origin=/.test(S.driverRoutes(d, 'd1')[0].googleMapsUrl));
});

test('server exposes POST /api/driver/claim and driver.html has the scan button with all error codes', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), h = fs.readFileSync(path.join(__dirname, '..', 'driver.html'), 'utf8');
  assert.match(s, /\/api\/driver\/claim/); assert.match(s, /dispatchService\.claimByScan/);
  assert.match(h, /id="scanbtn"/); assert.match(h, /\/api\/driver\/claim/); assert.match(h, /capPlug\('BarcodeScanner'\)/);
  for (const k of ['NOT_FOUND', 'NOT_DELIVERY', 'DELIVERED', 'TAKEN', 'FULL', 'DRIVERS_ONLY']) assert.ok(h.includes(k + ':'), k);
});

test('driver.html: unknown server errors (e.g. old server answering 404 "Not found") are NOT shown as "no order for this QR"', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'driver.html'), 'utf8');
  assert.match(h, /X\[j\.code\]\|\|\(X\.srv/); assert.ok(!/X\.NOT_FOUND\}\)/.test(h)); assert.ok(h.includes('srv:'));
});
