'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../payment-logic.js');
let n = 0; const newId = p => p + '_' + (++n);
const order = () => ({ id: 'o1', status: 'OPEN', cart: [{ name: 'A', unitCents: 1000, quantity: 2 }, { name: 'B', unitCents: 500, quantity: 4 }] }); // 40,00
const NOW = '2026-10-09T12:00:00Z';

test('customer discount in % and €; cash + card mixed', () => {
  let r = P.finalize({ order: order(), payments: [], payload: { discount: { type: 'PERCENT', value: 10 }, paymentLines: [{ method: 'CASH', amountCents: 1600, amountReceivedCents: 2000 }, { method: 'CARD', amountCents: 2000 }] }, employees: [], now: NOW, newId });
  assert.equal(r.completed, true); assert.equal(r.expectedCents, 3600); assert.equal(r.payment.method, 'MIXED'); assert.equal(r.payment.paymentLines[0].changeCents, 400);
  assert.equal(r.order.status, 'COMPLETED');
  r = P.finalize({ order: order(), payments: [], payload: { discount: { type: 'AMOUNT', value: 300 }, paymentLines: [{ method: 'CASH', amountCents: 3700 }] }, employees: [], now: NOW, newId });
  assert.equal(r.expectedCents, 3700);
  assert.throws(() => P.finalize({ order: order(), payments: [], payload: { discount: { type: 'PERCENT', value: 150 }, paymentLines: [{ method: 'CASH', amountCents: 1 }] }, employees: [], now: NOW, newId }), /zwischen/);
  assert.throws(() => P.finalize({ order: order(), payments: [], payload: { paymentLines: [{ method: 'CASH', amountCents: 3000 }] }, employees: [], now: NOW, newId }), /exakt/);
});

test('split bill: 4 friends pay one after another; order completes with the last part; discount fixed on first part', () => {
  let o = order(), payments = [];
  const parts = [1100, 900, 700];
  for (const [i, c] of parts.entries()) {
    const r = P.finalize({ order: o, payments, payload: { partial: true, splitOf: 4, discount: i === 0 ? { type: 'AMOUNT', value: 400 } : { type: 'PERCENT', value: 50 }, paymentLines: [{ method: i % 2 ? 'CARD' : 'CASH', amountCents: c }] }, employees: [], now: NOW, newId });
    assert.equal(r.completed, false); payments.push(r.payment); o = r.order;
    assert.equal(o.status, 'OPEN'); assert.equal(r.payment.split.index, i + 1);
  }
  assert.equal(o.billDiscount.amountCents, 400); // second/third discount ignored
  assert.throws(() => P.finalize({ order: o, payments, payload: { partial: true, paymentLines: [{ method: 'CASH', amountCents: 1000 }] }, employees: [], now: NOW, newId }), /größer/);
  const last = P.finalize({ order: o, payments, payload: { partial: true, splitOf: 4, paymentLines: [{ method: 'CARD', amountCents: 900 }] }, employees: [], now: NOW, newId });
  assert.equal(last.completed, true); assert.equal(last.order.status, 'COMPLETED'); assert.equal(last.order.paymentIds.length, 4); assert.equal(last.order.paidCents, 3600);
});

test('employee meal by code', () => {
  const r = P.finalize({ order: order(), payments: [], payload: { employeeDiscountCode: 'ali7', paymentLines: [{ method: 'CASH', amountCents: 3200 }] }, employees: [{ id: 'e1', name: 'Ali', employeeCode: 'ALI7', employeeDiscountPercent: 20 }], now: NOW, newId });
  assert.equal(r.discount.type, 'EMPLOYEE'); assert.equal(r.expectedCents, 3200);
});
