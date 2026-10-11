'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('../qonto-sync.js'), B = require('../bank-pay.js');
const raw = (id, side, cents, ref, status = 'completed') => ({ transaction_id: id, side, amount_cents: cents, label: 'Max Muster', reference: ref, settled_at: '2026-10-11T13:05:00Z', status });

test('mapTx: credit positive, debit negative, reference kept', () => {
  assert.equal(Q.mapTx(raw('a', 'credit', 1598, 'W871D1')).amountCents, 1598);
  assert.equal(Q.mapTx(raw('b', 'debit', 500, 'x')).amountCents, -500);
  assert.equal(Q.mapTx(raw('a', 'credit', 1598, 'W871D1')).reference, 'W871D1');
});
test('fetchRecent: only completed credits; merge dedupes', async () => {
  process.env.QONTO_LOGIN = 'l'; process.env.QONTO_SECRET = 's';
  const f = async url => ({ ok: true, json: async () => url.includes('/organization') ? { organization: { bank_accounts: [{ id: 'acc1', main: true }] } }
    : { transactions: [raw('t1', 'credit', 1598, 'W871D1'), raw('t2', 'debit', 100, 'out'), raw('t3', 'credit', 900, 'pending', 'pending')] } });
  const rows = await Q.fetchRecent(f);
  assert.equal(rows.length, 1);
  const data = {};
  assert.equal(Q.merge(data, rows), 1); assert.equal(Q.merge(data, rows), 0); assert.equal(data.bankTransactions.length, 1);
});
test('end to end: Qonto credit pays a pending transfer order', () => {
  const now = new Date('2026-10-11T13:00:00Z');
  const o = B.markAwaitingTransfer({ id: 'o1', displayCode: 'W871D1', totalCents: 1598, status: 'OPEN', webToken: 'tok' }, now);
  const data = { pendingTransfers: [o], orders: [] };
  Q.merge(data, [Q.mapTx(raw('t1', 'credit', 1598, 'W871D1'))], now);
  const r = B.reconcile(data, new Date(now.getTime() + 120000));
  assert.deepEqual(r.paidIds, ['o1']); assert.equal(data.orders[0].status, 'OPEN'); assert.equal(data.pendingTransfers.length, 0);
});
