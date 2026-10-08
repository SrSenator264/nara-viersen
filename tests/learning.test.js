'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../prep-learning.js');
const D = require('../dispatch-learning.js');
const S = require('../dispatch-service.js');

const NOW = Date.parse('2026-10-08T17:00:00Z');
const iso = m => new Date(NOW + m * 60000).toISOString();

function cooked(data, cart, minutes, at = -60) {
  const o = { cart, preparingAt: iso(at), readyAt: iso(at + minutes) };
  return P.recordReady(data, o);
}

test('kitchen learns per menu item: Crunchy menu slow, Cheese Burger fast', () => {
  const data = {};
  for (const m of [14, 15, 16]) cooked(data, [{ name: 'Crunchy Menü', quantity: 1 }, { name: 'Cola', quantity: 1 }], m);
  for (const m of [7, 8, 8]) cooked(data, [{ name: 'Cheese Burger', quantity: 1 }], m);
  const m = P.model(data);
  assert.equal(m.items['crunchy menü'], 15);
  assert.equal(m.items['cheese burger'], 8);
  assert.equal(m.items['cola'], undefined, 'drinks are not cooked');
  assert.equal(P.prepMinutes(m, [{ name: 'Cheese Burger', quantity: 1 }]), 8);
  // أبطأ صنف + شوي لكل قطعة زيادة
  assert.equal(P.prepMinutes(m, [{ name: 'Cheese Burger', quantity: 2 }, { name: 'Crunchy Menü', quantity: 1 }]), 16.2);
});

test('ignores forgotten buttons (too short / too long)', () => {
  const data = {};
  assert.equal(cooked(data, [{ name: 'X', quantity: 1 }], 0.5), null);
  assert.equal(cooked(data, [{ name: 'X', quantity: 1 }], 200), null);
  assert.equal(P.model(data).samples, 0);
});

test('queue: with 2 kitchen slots the 3rd order waits for a free slot', () => {
  const data = { settings: { kitchen: { parallelOrders: 2 } }, orders: [] };
  for (const m of [10, 10, 10]) cooked(data, [{ name: 'Burger', quantity: 1 }], m);
  data.orders = [
    { id: 'a', status: 'OPEN', kitchenStatus: 'PREPARING', preparingAt: iso(-4), cart: [{ name: 'Burger', quantity: 1 }] },
    { id: 'b', status: 'OPEN', kitchenStatus: 'NEW', createdAt: iso(-2), cart: [{ name: 'Burger', quantity: 1 }] },
    { id: 'c', status: 'OPEN', kitchenStatus: 'NEW', createdAt: iso(-1), cart: [{ name: 'Burger', quantity: 1 }] },
    { id: 'l', status: 'OPEN', brand: 'Loco Chicken', createdAt: iso(-3), cart: [{ name: 'Bucket', quantity: 1 }] },
  ];
  const f = P.forecast(data, NOW, [{ name: 'Burger', quantity: 1 }]);
  assert.equal(f.orders.a.readyAt, iso(6));   // بلّش من 4 دقايق
  assert.equal(f.orders.b.readyAt, iso(10));  // المكان التاني فاضي
  assert.equal(f.orders.c.readyAt, iso(16));  // بيستنى "a" يخلص
  assert.equal(f.orders.l, undefined, 'Loco is cooked elsewhere');
  assert.equal(f.extra.readyAt, iso(20));     // طلب جديد بالكاشير
  assert.equal(f.queue, 3);
});

test('driving: learns that a zone is slower than the estimate', () => {
  const data = {};
  for (const r of [1.3, 1.4, 1.3, 1.5, 1.3]) D.record(data, { zone: '41749', estMin: 10, actualMin: 10 * r });
  for (const r of [0.9, 1, 1, 0.95, 1]) D.record(data, { zone: '41747', estMin: 5, actualMin: 5 * r });
  const m = D.model(data);
  assert.equal(m.zones['41749'], 1.3);
  assert.equal(m.zones['41747'], 1);
  assert.equal(D.factorFor(m, '41751'), m.global, 'unknown zone uses the overall factor');
  D.record(data, { zone: '41749', estMin: 10, actualMin: 300 });
  assert.equal(data.dispatchLearning.samples.at(-1).ratio, 3, 'crazy trips are capped');
});

// تدفق كامل: خطة ← إرسال ← طلوع ← تسليم (تعلّم) ← رجعة
test('full flow: plan, send to driver, start, deliver, learn, come back', () => {
  const data = {
    settings: {}, attendanceEvents: [], shifts: [], deliveryRoutes: [],
    employees: [{ id: 'd1', name: 'Ali', role: 'DRIVER', active: true }, { id: 'd2', name: 'Sami', role: 'DRIVER', active: true }],
    orders: [
      { id: 'n1', type: 'delivery', status: 'OPEN', kitchenStatus: 'READY', createdAt: iso(-10), delivery: { lat: 51.287, lng: 6.381, postal: '41749', name: 'Max', phone: '0151', street: 'A' }, cart: [{ name: 'Burger', quantity: 1, unitCents: 999 }], payment: { method: 'CASH' } },
      { id: 'n2', type: 'delivery', status: 'OPEN', kitchenStatus: 'READY', createdAt: iso(-9), delivery: { lat: 51.2905, lng: 6.379, postal: '41749' }, cart: [{ name: 'Burger', quantity: 1 }], platform: 'LIEFERANDO', payment: { method: 'ONLINE' } },
      { id: 's1', type: 'delivery', status: 'OPEN', kitchenStatus: 'READY', createdAt: iso(-8), delivery: { lat: 51.205, lng: 6.43, postal: '41063' }, cart: [{ name: 'Burger', quantity: 1 }] },
    ],
  };
  const plan = S.planFor(data, NOW);
  const north = plan.drivers.find(d => d.tours[0] && d.tours[0].stops.some(s => s.orderId === 'n1'));
  assert.ok(north.tours[0].stops.some(s => s.orderId === 'n2'), 'north orders together');
  const t = north.tours[0];
  const route = S.assignRoute(data, { driverId: north.driverId, orderIds: t.stops.map(s => s.orderId) }, { name: 'Kasse' }, iso(0));
  assert.equal(data.orders.find(o => o.id === 'n1').assignment.driverName, north.name);
  assert.throws(() => S.assignRoute(data, { driverId: 'd2', orderIds: ['n1'] }, null), /سائق تاني/);
  // الخطة الجديدة ما بتعيد توزيع المرسَل
  const plan2 = S.planFor(data, NOW);
  assert.ok(!plan2.assignments.some(a => a.orderId === 'n1'));
  assert.equal(plan2.active.length, 1);
  // السائق التاني ما بيقدر يلمس جولة غيره
  assert.throws(() => S.startRoute(data, route.id, { id: 'other', role: 'DRIVER' }), /مش إلك/);
  const me = { id: north.driverId, role: 'DRIVER', name: north.name };
  // صفحة السائق: بدون أي مبلغ
  const mine = S.driverRoutes(data, north.driverId);
  assert.ok(!/999|Cents|amount|total/i.test(JSON.stringify(mine)), 'no money for the driver');
  assert.equal(mine[0].stops.find(s => s.orderId === 'n1').cash, true);
  assert.equal(mine[0].stops.find(s => s.orderId === 'n2').cash, false);
  S.startRoute(data, route.id, me, iso(1));
  const first = route.orderIds[0];
  const r1 = S.deliverStop(data, first, me, null, iso(16));
  assert.ok(r1.learned && r1.learned.actualMin > 10, 'learned from the real trip');
  S.deliverStop(data, route.orderIds[1], me, null, iso(20));
  assert.ok(route.allDeliveredAt);
  S.finishRoute(data, route.id, me, iso(33));
  assert.equal(route.status, 'COMPLETED');
  assert.equal(data.dispatchLearning.samples.length, 3); // مشوارين + الرجعة
  // جولة مرسلة لسا ما طلعت بتنلغى، والطلب برجع للخطة
  const r2 = S.assignRoute(data, { driverId: 'd2', orderIds: ['s1'] }, null, iso(2));
  S.cancelRoute(data, r2.id, { role: 'CASHIER' }, iso(3));
  assert.equal(data.orders.find(o => o.id === 's1').assignment, undefined);
  assert.ok(S.planFor(data, NOW).assignments.some(a => a.orderId === 's1'));
});
