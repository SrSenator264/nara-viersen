'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { kasseStateWindow } = require('../kasse-window.js');

const NOW = Date.parse('2026-10-19T12:00:00Z'), DAY = 864e5;
const iso = d => new Date(NOW - d * DAY).toISOString();
const base = (orders, extra = {}) => ({ orders, payments: [], receipts: [], fiscalTransactions: [], auditEvents: [], ...extra });
const ids = r => r.orders.map(o => o.id).sort();

test('kasseStateWindow: keeps recent orders, cuts closed orders older than N days', () => {
  const d = base([
    { id: 'new', status: 'COMPLETED', createdAt: iso(0.5) },
    { id: 'old-closed', status: 'COMPLETED', createdAt: iso(10) },
    { id: 'old-cancelled', status: 'CANCELLED', createdAt: iso(5) },
  ]);
  const r = kasseStateWindow(d, 2, NOW);
  assert.deepEqual(ids(r), ['new']);
  assert.deepEqual(r.window, { days: 2, totalOrders: 3, returnedOrders: 1 });
});
test('kasseStateWindow: keeps still-open orders even if older than N days (up to 7 days)', () => {
  const d = base([
    { id: 'open-3d', status: 'OPEN', createdAt: iso(3) },
    { id: 'open-stage', status: 'ACCEPTED', liveStage: 'PREPARE', createdAt: iso(4) },
    { id: 'open-ancient', status: 'OPEN', createdAt: iso(30) },       // älter als 7 Tage: Karteileiche, fliegt raus
    { id: 'done-3d', status: 'OPEN', liveStage: 'DONE', createdAt: iso(3) },     // Live-Orders-Stufe DONE = nicht mehr offen
    { id: 'archived-3d', status: 'OPEN', liveArchivedAt: iso(3), createdAt: iso(3) },
    { id: 'completed-3d', status: 'OPEN', completedAt: iso(3), createdAt: iso(3) },
  ]);
  const r = kasseStateWindow(d, 1, NOW);
  assert.deepEqual(ids(r), ['open-3d', 'open-stage']);
});
test('kasseStateWindow: order timestamp = newest of its dates; falls back to the 13-digit id', () => {
  const d = base([
    { id: 'upd', status: 'COMPLETED', createdAt: iso(20), updatedAt: iso(0.1) },
    { id: 'web-' + (NOW - 0.2 * DAY), status: 'COMPLETED' },          // nur Zeitstempel in der ID
    { id: 'no-date', status: 'COMPLETED' },
  ]);
  assert.deepEqual(ids(kasseStateWindow(d, 2, NOW)), ['upd', 'web-' + (NOW - 0.2 * DAY)].sort());
});
test('kasseStateWindow: payments/receipts/fiscal follow kept orders or are recent; audit trimmed to last 500', () => {
  const d = base([{ id: 'o1', status: 'OPEN', createdAt: iso(0.1) }, { id: 'o2', status: 'COMPLETED', createdAt: iso(20) }], {
    payments: [{ id: 'pay1', orderId: 'o1', at: iso(30) }, { id: 'pay2', orderId: 'o2', at: iso(30) }, { id: 'pay3', orderId: 'x', at: iso(0.5) }],
    receipts: [{ id: 'r1', orderId: 'o2', createdAt: iso(40) }],
    fiscalTransactions: [{ id: 'f1', orderId: 'o1', createdAt: iso(40) }],
    auditEvents: Array.from({ length: 700 }, (_, i) => ({ id: 'a' + i, createdAt: iso(0.1) })).concat([{ id: 'old', createdAt: iso(50) }]),
  });
  const r = kasseStateWindow(d, 2, NOW);
  assert.deepEqual(r.payments.map(x => x.id).sort(), ['pay1', 'pay3']); // pay1 hängt an offener Bestellung, pay3 ist neu
  assert.deepEqual(r.receipts, []);
  assert.deepEqual(r.fiscalTransactions.map(x => x.id), ['f1']);
  assert.equal(r.auditEvents.length, 500);
  assert.equal(r.auditEvents.some(x => x.id === 'old'), false);
});
test('kasseStateWindow: does not mutate its input (it is fed the shared read-only admin data)', () => {
  const d = base([{ id: 'a', status: 'OPEN', createdAt: iso(0.1) }, { id: 'b', status: 'COMPLETED', createdAt: iso(9) }]);
  const snap = JSON.stringify(d);
  kasseStateWindow(d, 2, NOW);
  assert.equal(JSON.stringify(d), snap);
});
test('kasseStateWindow: defaults to the real clock when no "now" is given', () => {
  const d = base([{ id: 'fresh', status: 'COMPLETED', createdAt: new Date().toISOString() }]);
  assert.deepEqual(ids(kasseStateWindow(d, 1)), ['fresh']);
});
