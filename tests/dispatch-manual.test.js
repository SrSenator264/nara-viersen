'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../dispatch-service.js');
const E = require('../dispatch-engine.js');

const NOW = Date.parse('2026-10-08T17:00:00Z'), ISO = new Date(NOW).toISOString();
const mk = (id, lat, lng) => ({ id, type: 'delivery', status: 'OPEN', kitchenPrintedAt: '2026-10-08T16:50:00Z', createdAt: '2026-10-08T16:50:00Z', delivery: { lat, lng, street: 'S' + id }, cart: [{ name: 'A', quantity: 1 }] });
const base = () => ({
  settings: {}, attendanceEvents: [], shifts: [], geocodeCache: {}, deliveryRoutes: [],
  employees: [{ id: 'd1', name: 'Ali', role: 'DRIVER', active: true }, { id: 'd2', name: 'Sami', role: 'DRIVER', active: true }],
  orders: [mk('o1', 51.26, 6.39), mk('o2', 51.261, 6.391), mk('o3', 51.27, 6.40), mk('o4', 51.28, 6.41)],
});
const plan = d => S.planFor(d, NOW);
const driverOfOrder = (p, id) => (p.assignments.find(a => String(a.orderId) === id) || {}).driverId;

test('pin: order goes only to the pinned driver', () => {
  const d = base(); S.setOrderPref(d, { orderId: 'o1', pin: 'd2' });
  assert.equal(driverOfOrder(plan(d), 'o1'), 'd2');
  S.setOrderPref(d, { orderId: 'o1', pin: 'd1' });
  assert.equal(driverOfOrder(plan(d), 'o1'), 'd1');
});
test('avoid: order never goes to the avoided driver; avoid-all -> unplaced', () => {
  const d = base(); S.setOrderPref(d, { orderId: 'o1', avoid: ['d1'] });
  assert.equal(driverOfOrder(plan(d), 'o1'), 'd2');
  S.setOrderPref(d, { orderId: 'o1', avoid: ['d1', 'd2'] });
  const p = plan(d); assert.equal(driverOfOrder(p, 'o1'), undefined);
  assert.ok(p.unplaced.some(u => u.id === 'o1' && u.reason === 'NO_ALLOWED_DRIVER'));
});
test('pin and avoid of the same driver is rejected', () => {
  const d = base(); S.setOrderPref(d, { orderId: 'o1', pin: 'd1' });
  assert.throws(() => S.setOrderPref(d, { orderId: 'o1', avoid: ['d1'] }), /نفس السائق/);
});
test('hold: excluded from plan, listed separately; release brings it back', () => {
  const d = base(); S.setOrderPref(d, { orderId: 'o3', hold: true });
  let p = plan(d); assert.equal(driverOfOrder(p, 'o3'), undefined); assert.deepEqual(p.held.map(h => h.orderId), ['o3']);
  S.setOrderPref(d, { orderId: 'o3', hold: false });
  p = plan(d); assert.ok(driverOfOrder(p, 'o3')); assert.equal(p.held.length, 0); assert.equal(d.dispatchPrefs.orders.o3, undefined);
});
test('urgent: due now, planned first (no later than before)', () => {
  const d = base(); S.setOrderPref(d, { orderId: 'o4', urgent: true });
  const inp = S.buildInput(d, NOW); assert.equal(inp.orders.find(o => o.id === 'o4').dueAt, ISO);
});
test('solo: never shares a tour', () => {
  const d = base(); S.setOrderPref(d, { orderId: 'o1', solo: true });
  const p = plan(d);
  for (const dr of p.drivers) for (const t of dr.tours) if (t.stops.some(s => s.orderId === 'o1')) assert.equal(t.stops.length, 1);
});
test('driver paused: gets no new orders but is listed; resume restores', () => {
  const d = base(); S.setDriverPref(d, { driverId: 'd1', paused: true });
  let p = plan(d); assert.deepEqual(p.drivers.map(x => x.driverId), ['d2']); assert.deepEqual(p.pausedDrivers.map(x => x.id), ['d1']);
  assert.equal(p.allDrivers.length, 2);
  S.setDriverPref(d, { driverId: 'd1', paused: false });
  assert.equal(plan(d).drivers.length, 2); assert.equal(d.dispatchPrefs.drivers.d1, undefined);
});
test('driver maxStops respected; invalid rejected', () => {
  const d = base(); d.employees.pop(); // single driver
  S.setDriverPref(d, { driverId: 'd1', maxStops: 2 });
  const p = plan(d); for (const t of p.drivers[0].tours) assert.ok(t.stops.length <= 2);
  assert.throws(() => S.setDriverPref(d, { driverId: 'd1', maxStops: 9 }), /بين 1 و 8/);
  assert.throws(() => S.setDriverPref(d, { driverId: 'zz', paused: true }), /غير موجود/);
});
test('engine: every pinned order to unavailable driver is unplaced', () => {
  const r = E.plan({ now: NOW, shop: { lat: 51.25, lng: 6.39 }, drivers: [{ id: 'a', name: 'A', position: null }], orders: [{ id: 'x', lat: 51.26, lng: 6.39, pin: 'ghost' }] });
  assert.equal(r.unplaced[0].reason, 'PIN_DRIVER_UNAVAILABLE');
});

const sent = () => { const d = base(); S.assignRoute(d, { driverId: 'd1', orderIds: ['o1', 'o2'] }, null, ISO); S.assignRoute(d, { driverId: 'd2', orderIds: ['o3'] }, null, ISO); return d; };
const routeOf = (d, drv) => d.deliveryRoutes.find(r => r.employeeId === drv && r.status !== 'CANCELLED');

test('move: order changes driver, fields rebound, emptied route cancelled', () => {
  const d = sent(); S.moveOrder(d, { orderId: 'o3', toDriverId: 'd1' }, null, ISO);
  const o3 = d.orders.find(o => o.id === 'o3');
  assert.equal(o3.driverId, 'd1'); assert.equal(o3.assignment.driverName, 'Ali'); assert.deepEqual(routeOf(d, 'd1').orderIds, ['o1', 'o2', 'o3']);
  assert.equal(routeOf(d, 'd2'), undefined);
  assert.ok(o3.assignment.etaAt);
});
test('move to driver without route creates a new one; position honoured', () => {
  const d = sent(); S.moveOrder(d, { orderId: 'o2', toDriverId: 'd2', position: 1 }, null, ISO);
  assert.deepEqual(routeOf(d, 'd2').orderIds, ['o2', 'o3']); assert.deepEqual(routeOf(d, 'd1').orderIds, ['o1']);
});
test('move rejects: started route, delivered order, unknown driver/order, same driver', () => {
  let d = sent(); routeOf(d, 'd1').startedAt = ISO;
  assert.throws(() => S.moveOrder(d, { orderId: 'o1', toDriverId: 'd2' }), e => e.status === 409);
  d = sent(); assert.throws(() => S.moveOrder(d, { orderId: 'o1', toDriverId: 'nope' }), e => e.status === 422);
  assert.throws(() => S.moveOrder(d, { orderId: 'zzz', toDriverId: 'd2' }), e => e.status === 404);
  assert.throws(() => S.moveOrder(d, { orderId: 'o1', toDriverId: 'd1' }), e => e.status === 422);
  d.orders.find(o => o.id === 'o3').deliveredAt = ISO;
  assert.throws(() => S.moveOrder(d, { orderId: 'o3', toDriverId: 'd1' }), e => e.status === 409);
  assert.throws(() => S.moveOrder(base(), { orderId: 'o1', toDriverId: 'd1' }), e => e.status === 409); // not sent
});
test('swap: orders trade places between drivers', () => {
  const d = sent(); S.swapOrders(d, { orderA: 'o1', orderB: 'o3' }, null, ISO);
  assert.deepEqual(routeOf(d, 'd1').orderIds, ['o3', 'o2']); assert.deepEqual(routeOf(d, 'd2').orderIds, ['o1']);
  assert.equal(d.orders.find(o => o.id === 'o1').driverId, 'd2'); assert.equal(d.orders.find(o => o.id === 'o3').driverId, 'd1');
});
test('swap rejects same route, same order, started route', () => {
  const d = sent();
  assert.throws(() => S.swapOrders(d, { orderA: 'o1', orderB: 'o2' }), e => e.status === 422);
  assert.throws(() => S.swapOrders(d, { orderA: 'o1', orderB: 'o1' }), e => e.status === 422);
  routeOf(d, 'd2').startedAt = ISO;
  assert.throws(() => S.swapOrders(d, { orderA: 'o1', orderB: 'o3' }), e => e.status === 409);
});
test('reorder: must be a permutation; updates order and ETAs', () => {
  const d = sent(), r = routeOf(d, 'd1');
  S.reorderStops(d, { routeId: r.id, orderIds: ['o2', 'o1'] }, null, ISO);
  assert.deepEqual(r.orderIds, ['o2', 'o1']); assert.ok(r.plannedEtas.o2 < r.plannedEtas.o1);
  for (const bad of [['o1'], ['o1', 'o1'], ['o1', 'o9'], ['o1', 'o2', 'o3']]) assert.throws(() => S.reorderStops(d, { routeId: r.id, orderIds: bad }), e => e.status === 422);
  r.startedAt = ISO; assert.throws(() => S.reorderStops(d, { routeId: r.id, orderIds: ['o1', 'o2'] }), e => e.status === 409);
});
test('plan.active exposes canEdit; manual prefs survive in prefs map only for open orders', () => {
  const d = sent(); S.setOrderPref(d, { orderId: 'o4', urgent: true });
  const p = plan(d); assert.ok(p.active.every(r => r.canEdit === true)); assert.equal(p.prefs.orders.o4.urgent, true);
  d.orders.find(o => o.id === 'o4').deliveredAt = ISO; d.orders.find(o => o.id === 'o4').status = 'COMPLETED';
  assert.equal(plan(d).prefs.orders.o4, undefined);
});
