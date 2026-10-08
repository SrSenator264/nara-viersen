'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeCustomers } = require('../customers-sync.js');
const T = (m) => new Date(Date.UTC(2026, 9, 8, 10, m)).toISOString();

test('adds new customers and drops junk', () => {
  const r = mergeCustomers([], {}, [{ id: 'a', name: 'Ali', phone: '02162 1', updatedAt: T(1) }, { id: 'b' }, null, { name: 'no id' }]);
  assert.deepEqual(r.customers.map(c => c.id), ['a']);
});
test('newer record wins, order count takes the max', () => {
  const server = [{ id: 'a', name: 'Ali', phone: '02162 123456', street: 'Alt', orderCount: 5, updatedAt: T(1) }];
  const r = mergeCustomers(server, {}, [{ id: 'a', name: 'Ali', phone: '02162 123456', street: 'Neu', orderCount: 2, updatedAt: T(5) }]);
  assert.equal(r.customers[0].street, 'Neu'); assert.equal(r.customers[0].orderCount, 5);
  const r2 = mergeCustomers(r.customers, {}, [{ id: 'a', name: 'Ali', phone: '02162 123456', street: 'Uralt', updatedAt: T(0) }]);
  assert.equal(r2.customers[0].street, 'Neu');
});
test('same phone on two devices becomes one customer', () => {
  const r = mergeCustomers([{ id: 'x', name: 'Ali', phone: '+49 2162 123456', updatedAt: T(1) }], {}, [{ id: 'y', name: 'Ali K.', phone: '02162123456', updatedAt: T(2) }]);
  assert.equal(r.customers.length, 1); assert.equal(r.customers[0].id, 'x'); assert.equal(r.customers[0].name, 'Ali K.');
});
test('delete is remembered and does not come back from another device', () => {
  const r1 = mergeCustomers([{ id: 'a', name: 'Ali', phone: '02162 1', updatedAt: T(1) }], {}, [], { a: T(5) });
  assert.equal(r1.customers.length, 0);
  const r2 = mergeCustomers(r1.customers, r1.deleted, [{ id: 'a', name: 'Ali', phone: '02162 1', updatedAt: T(2) }]);
  assert.equal(r2.customers.length, 0);
  const r3 = mergeCustomers(r2.customers, r2.deleted, [{ id: 'a', name: 'Ali', phone: '02162 1', updatedAt: T(9) }]);
  assert.equal(r3.customers.length, 1); // edited after deletion: comes back
});
test('fields are whitelisted and capped', () => {
  const r = mergeCustomers([], {}, [{ id: 'a', name: 'x'.repeat(500), phone: '1', evil: '<script>', __proto__: { z: 1 } }]);
  assert.equal(r.customers[0].name.length, 200); assert.equal('evil' in r.customers[0], false);
});

test('records without a timestamp never override the server copy', () => {
  const r = mergeCustomers([{ id: 'a', name: 'Ali', phone: '02162 123456', street: 'Server', updatedAt: T(1) }], {}, [{ id: 'z', name: 'Ali', phone: '02162 123456', street: 'Legacy' }]);
  assert.equal(r.customers.length, 1); assert.equal(r.customers[0].street, 'Server');
});
