'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../bank-pay.js');
const IBAN = 'DE89370400440532013000';
const cfg = { payee: 'IU GENE', iban: IBAN, bic: 'COBADEFFXXX' };
const base = { id: 'o1', displayCode: 'W1A2B', totalCents: 1850, status: 'OPEN', paymentMethod: 'CASH' };
const now = new Date('2026-10-11T12:00:00Z');
const wait = () => B.markAwaitingTransfer(base, now);

test('IBAN: valid, invalid, normalized', () => {
  assert.ok(B.isValidIban('DE89 3704 0044 0532 0130 00'));
  assert.ok(!B.isValidIban('DE89370400440532013001'));
  assert.ok(!B.isValidIban('xx'));
});
test('awaiting transfer: not paid, not for kitchen, 15 minute window', () => {
  const o = wait();
  assert.equal(o.paymentStatus, 'AWAITING_TRANSFER'); assert.equal(o.status, 'AWAITING_PAYMENT');
  assert.equal(new Date(o.payUntil) - now, 15 * 60000); assert.equal(o.cashDueCents, 0);
});
test('girocode: EPC format, amount with 2 decimals', () => {
  const g = B.girocode({ payee: 'IU GENE', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', amountCents: 1850, ref: 'W1A2B' }).split('\n');
  assert.deepEqual(g.slice(0, 3), ['BCD', '002', '1']); assert.equal(g[6], IBAN); assert.equal(g[7], 'EUR18.50'); assert.equal(g[9], 'W1A2B');
});
test('payInfo: waiting, countdown, then expired', () => {
  const o = wait();
  const a = B.payInfo(o, cfg, new Date(now.getTime() + 60000));
  assert.equal(a.state, 'WAITING'); assert.equal(a.remainingSec, 840); assert.equal(a.reference, 'W1A2B');
  assert.equal(B.payInfo(o, cfg, new Date(now.getTime() + 16 * 60000)).state, 'EXPIRED');
  assert.equal(B.payInfo({ ...o, paymentStatus: 'PAID' }, cfg, now).state, 'PAID');
});
test('match: exact amount + code in reference, tolerant to spaces/dashes/case', () => {
  const o = wait();
  for (const ref of ['W1A2B', 'w1a2b', 'Bestellung W-1A 2B danke'])
    assert.deepEqual(B.matchTransaction({ amountCents: 1850, reference: ref }, [o], now), { result: 'MATCHED', orderId: 'o1' });
});
test('match: wrong amount, no code, outgoing, ambiguous, already paid', () => {
  const o = wait(), o2 = { ...wait(), id: 'o2', displayCode: 'W1A2' };
  assert.equal(B.matchTransaction({ amountCents: 1800, reference: 'W1A2B' }, [o], now).result, 'AMOUNT_MISMATCH');
  assert.equal(B.matchTransaction({ amountCents: 1850, reference: 'hallo' }, [o], now).result, 'NO_ORDER');
  assert.equal(B.matchTransaction({ amountCents: -1850, reference: 'W1A2B' }, [o], now).result, 'NOT_INCOMING');
  assert.equal(B.matchTransaction({ amountCents: 1850, reference: 'W1A2B' }, [o, o2], now).result, 'AMBIGUOUS');
  assert.equal(B.matchTransaction({ amountCents: 1850, reference: 'W1A2B' }, [B.applyPaid(o, {}, now)], now).result, 'NO_ORDER');
});
test('expire: unpaid transfers cancel after window; paid and cash untouched; late payment flagged', () => {
  const o = wait(), paid = B.applyPaid({ ...wait(), id: 'p' }, { id: 'b1' }, now), cash = { ...base, id: 'c' };
  const later = new Date(now.getTime() + 16 * 60000);
  const r = B.expireUnpaid([o, paid, cash], later);
  assert.deepEqual(r.expiredIds, ['o1']);
  assert.equal(r.orders[0].status, 'CANCELLED'); assert.equal(r.orders[1].paymentStatus, 'PAID'); assert.equal(r.orders[2].status, 'OPEN');
  assert.equal(B.matchTransaction({ amountCents: 1850, reference: 'W1A2B' }, [r.orders[0]], later).result, 'LATE_PAID');
});
test('applyPaid: goes to kitchen, records bank transaction', () => {
  const p = B.applyPaid(wait(), { id: 'bank1' }, now);
  assert.equal(p.status, 'OPEN'); assert.equal(p.payment.paid, true); assert.equal(p.payment.bankTransactionId, 'bank1'); assert.equal(p.liveStage, 'PREPARE');
});
