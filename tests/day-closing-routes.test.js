'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = require('../auth.js');
const bizDay = require('../business-day.js');
const R = require('../day-closing-routes.js');

const clone = x => JSON.parse(JSON.stringify(x));
function mk(extra = {}) {
  const store = { data: { orders: [], payments: [], receipts: [], fiscalTransactions: [], auditEvents: [], cashbooks: [], dayClosings: [], dailySettlements: [{ id: 'pay-roll', employeeId: 'e1', date: '2026-01-01' }], categories: [], settings: {}, products: [], ...extra } };
  let n = 0;
  const ctx = { readAdminData: () => clone(store.data), writeAdminData: d => { store.data = clone(d); return store.data; }, adminId: p => p + '-' + (++n),
    reply: (res, status, body) => { res.status = status; res.body = body; }, bizDay,
    naraJsonBody: (req, res, limit, h) => { try { h(req.body || {}); } catch (e) { res.status = 400; res.body = { error: e.message }; } } };
  const call = (method, p, { user = { id: 'u1', name: 'Omar', role: 'OWNER' }, body } = {}) => {
    const req = { method, naraUser: user, body }, res = {}, handled = R.handle(req, res, new URL('http://x' + p), ctx);
    return { handled, status: res.status, body: res.body };
  };
  return { store, call };
}
const TODAY = () => bizDay.today(), nowIso = () => new Date().toISOString();
function addSale(store, id, cents, at = nowIso()) {
  store.data.orders.push({ id, displayCode: '#' + id, status: 'COMPLETED', createdAt: at, cart: [{ id: 'p1-1730000000000', name: 'Burger', unitCents: cents, quantity: 1 }] });
  store.data.payments.push({ id: 'pay-' + id, orderId: id, method: 'CASH', paymentLines: [{ method: 'CASH', amountCents: cents }], amountCents: cents, grossAmountCents: cents, tipCents: 0, status: 'COMPLETED', createdAt: at });
}

test('مسار مو إلنا = false؛ مسار مجهول تحت /api/day-closing = 404', () => {
  const { call } = mk();
  assert.equal(call('GET', '/api/other').handled, false);
  const r = call('GET', '/api/day-closing/nope'); assert.equal(r.handled, true); assert.equal(r.status, 404);
});

test('preview: REAL بيرجّع التقرير والحالة؛ يوم غلط 400؛ التدريب للمالك/المدير بس', () => {
  const { store, call } = mk(); addSale(store, 'a', 1000);
  const r = call('GET', '/api/day-closing/preview?day=' + TODAY());
  assert.equal(r.status, 200); assert.equal(r.body.mode, 'REAL'); assert.equal(r.body.report.revenue.grossCents, 1000); assert.equal(r.body.status.closed, false);
  assert.equal(call('GET', '/api/day-closing/preview?day=oops').status, 400);
  assert.equal(call('GET', '/api/day-closing/preview?mode=TRAINING', { user: { role: 'ACCOUNTANT' } }).status, 403);
  const t = call('GET', '/api/day-closing/preview?mode=TRAINING&day=' + TODAY(), { user: { role: 'MANAGER' } });
  assert.equal(t.status, 200); assert.equal(t.body.mode, 'TRAINING'); assert.equal(t.body.status, null); assert.equal(t.body.report.revenue.grossCents, 0);
  const c = call('GET', '/api/day-closing/preview?day=' + TODAY() + '&opening=5000&counted=5900');
  assert.equal(c.body.report.cash.expectedCents, 6000); assert.equal(c.body.report.cash.state, 'SHORT');
});

test('close: بيحفظ بـ dayClosings (مو dailySettlements)، تدقيق، و409 للتقفيلة التانية', () => {
  const { store, call } = mk(); addSale(store, 'a', 2000);
  const r = call('POST', '/api/day-closing/close', { body: { day: TODAY(), countedCents: 2000 } });
  assert.equal(r.status, 200); assert.match(r.body.record.number, /^Z-\d{4}-0001$/);
  assert.equal(store.data.dayClosings.length, 1); assert.deepEqual(store.data.dailySettlements, [{ id: 'pay-roll', employeeId: 'e1', date: '2026-01-01' }]);
  assert.equal(store.data.auditEvents.filter(e => e.type === 'DAY_CLOSING').length, 1);
  const again = call('POST', '/api/day-closing/close', { body: { day: TODAY(), countedCents: 2000 } });
  assert.equal(again.status, 409); assert.equal(again.body.code, 'ALREADY_CLOSED'); assert.equal(store.data.dayClosings.length, 1);
  assert.equal(call('POST', '/api/day-closing/close', { body: { day: 'bad', countedCents: 0 } }).status, 422);
  assert.equal(call('POST', '/api/day-closing/close', { body: { day: TODAY(), mode: 'TRAINING', countedCents: 0 } }).body.code, 'TRAINING_NOT_SAVED');
});

test('Nachtrag: مبيعات بعد التقفيلة بتنحفظ كسجل جديد مربوط، والأصل ما بيتغير', () => {
  const { store, call } = mk(); addSale(store, 'a', 1000);
  call('POST', '/api/day-closing/close', { body: { day: TODAY(), countedCents: 1000 } });
  const orig = clone(store.data.dayClosings[0]);
  addSale(store, 'late', 400, new Date(Date.now() + 5000).toISOString());
  assert.deepEqual(call('GET', '/api/day-closing/preview?day=' + TODAY()).body.status.lateSales, { count: 1, grossCents: 400, stornoCount: 0 });
  const n = call('POST', '/api/day-closing/close', { body: { day: TODAY(), nachtrag: true } });
  assert.equal(n.status, 200); assert.match(n.body.record.number, /-N1$/); assert.equal(n.body.record.report.revenue.grossCents, 400);
  assert.deepEqual(store.data.dayClosings[0], orig); assert.equal(store.data.dayClosings.length, 2);
  assert.equal(store.data.auditEvents.filter(e => e.type === 'DAY_CLOSING_NACHTRAG').length, 1);
});

test('list/record/reprint: ملخص مرتّب، نسخة بتزيد بالتدقيق، السجل ثابت', () => {
  const { store, call } = mk(); addSale(store, 'a', 1000);
  const id = call('POST', '/api/day-closing/close', { body: { day: TODAY(), countedCents: 1000 } }).body.record.id;
  const list = call('GET', '/api/day-closing/list');
  assert.equal(list.body.rows.length, 1); assert.equal(list.body.rows[0].id, id); assert.equal(list.body.rows[0].grossCents, 1000); assert.equal(list.body.rows[0].closedBy, 'Omar');
  const before = clone(store.data.dayClosings[0]);
  assert.equal(call('POST', '/api/day-closing/reprint', { body: { id } }).body.copyNumber, 1);
  assert.equal(call('POST', '/api/day-closing/reprint', { body: { id } }).body.copyNumber, 2);
  assert.deepEqual(store.data.dayClosings[0], before);
  assert.equal(call('GET', '/api/day-closing/record?id=' + id).body.copies, 2);
  assert.equal(call('GET', '/api/day-closing/record?id=zz').status, 404); assert.equal(call('POST', '/api/day-closing/reprint', { body: { id: 'zz' } }).status, 404);
});

test('الصلاحيات: عرض = المالك/المدير/المحاسب، إنشاء وطباعة = المالك/المدير بس', () => {
  const get = A.policyFor('GET', '/api/day-closing/preview'), post = A.policyFor('POST', '/api/day-closing/close'), re = A.policyFor('POST', '/api/day-closing/reprint');
  for (const role of ['OWNER', 'MANAGER', 'ACCOUNTANT']) assert.equal(A.allowed(get, role), true, role);
  assert.equal(A.allowed(get, 'CASHIER'), false);
  for (const acc of [post, re]) { assert.equal(A.allowed(acc, 'OWNER'), true); assert.equal(A.allowed(acc, 'MANAGER'), true); assert.equal(A.allowed(acc, 'ACCOUNTANT'), false); assert.equal(A.allowed(acc, 'CASHIER'), false); }
});

test('التوصيل: الموديول سيرفر بس، والسيرفر بيستدعيه، والمجموعة الجديدة بالسكيما', () => {
  assert.equal(A.staticAllowed('day-closing.js'), false); assert.equal(A.staticAllowed('day-closing-routes.js'), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes("require('./day-closing-routes.js').handle(req,res,url,{readAdminData,writeAdminData,adminId,reply,naraJsonBody,bizDay,printService:require('./print-service.js')})"));
  assert.ok(src.includes('dailySettlements:[],dayClosings:[]') && src.includes("'dailySettlements','dayClosings'"));
});
