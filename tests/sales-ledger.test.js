'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../sales-ledger.js');
const day = '2026-10-12T12:00:00.000Z';
const data = {
  orders: [
    { id: 'o1', displayCode: 'AAA11', source: 'NARA', type: 'local' },
    { id: 'o2', displayCode: 'TRN22', source: 'NARA', isTest: true, training: true },
    { id: 'o3', displayCode: 'W3CXY6', platform: 'LIEFERANDO', source: 'LIEFERANDO', externalOrderCode: '184', totalCents: 2873, fees: { delivery: 300 }, externalPaymentStatus: 'PAID_ON_PLATFORM', placedAt: day, payment: { method: 'ONLINE' } },
    { id: 'o4', displayCode: '4A850', platform: 'UBER_EATS', source: 'SIDES', brand: 'Loco Chicken', totalCents: 1898, placedAt: day },
    { id: 'o5', displayCode: 'CAN55', platform: 'UBER_EATS', source: 'UBER_EATS', status: 'CANCELLED', totalCents: 1000, placedAt: day },
  ],
  payments: [
    { id: 'p1', orderId: 'o1', status: 'COMPLETED', amountCents: 2000, paymentLines: [{ method: 'CASH', amountCents: 700 }, { method: 'CARD', amountCents: 1300 }], createdAt: day },
    { id: 'p2', orderId: 'o2', status: 'COMPLETED', isTest: true, amountCents: 999, createdAt: day },
    { id: 'p3', orderId: 'o3', status: 'COMPLETED', amountCents: 2873, createdAt: day },
  ],
  fiscalTransactions: [{ id: 'f1', paymentId: 'p1', status: 'TSE_SIGNED', transactionNumber: '77' }],
  receipts: [{ id: 'r1', paymentId: 'p1', receiptNumber: 'R-1' }],
};
test('two separate ledgers: own sales with TSE, platform sales without', () => {
  const l = L.build(data, '2026-10-12', '2026-10-12');
  assert.equal(l.own.rows.length, 1); assert.equal(l.own.rows[0].cashCents, 700); assert.equal(l.own.rows[0].cardCents, 1300); assert.equal(l.own.rows[0].tseTransaction, '77');
  assert.equal(l.own.totals.grossCents, 2000); assert.equal(l.own.totals.tseMissing, 0);
  assert.equal(l.platform.rows.length, 3); assert.equal(l.platform.totals.count, 2); assert.equal(l.platform.totals.cancelled, 1);
  assert.equal(l.platform.totals.grossCents, 2873 + 1898); assert.equal(l.platform.totals.byBrand['Loco Chicken'], 1898); assert.equal(l.platform.totals.byPlatform.UBER_EATS, 1898);
  assert.ok(!l.own.rows.some(r => r.orderCode === 'W3CXY6')); // طلب منصة ما بيدخل بالسجل المحلي حتى لو إلو دفعة
});
test('csv uses ; and decimal comma', () => {
  const l = L.build(data, '2026-10-12', '2026-10-12');
  assert.match(L.csvOwn(l), /20,00;7,00;13,00/); assert.match(L.csvPlatform(l), /28,73/);
});
