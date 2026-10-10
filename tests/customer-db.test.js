'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../customer-db.js');

const DAY = 86400000, now = Date.parse('2026-10-10T20:00:00Z');
const at = d => new Date(now - d * DAY).toISOString();
const order = (id, daysAgo, extra = {}) => ({ id, source: 'LIEFERANDO', type: 'delivery', status: 'COMPLETED', createdAt: at(daysAgo), totalCents: 2000,
  delivery: { name: 'Anna Muster', street: 'Hauptstraße', house: '5', postal: '41747', city: 'Viersen', phone: '+4915735984469' },
  cart: [{ name: 'Cheese Burger', quantity: 2, unitCents: 799 }], ...extra });

test('same address = same customer, with stats and favourites', () => {
  const db = C.build({ orders: [order('a', 20), order('b', 13), order('c', 6, { totalCents: 4000, delivery: { name: 'A. Muster', address: 'Hauptstr. 5', postalCode: '41747', city: 'Viersen' } })] }, now);
  assert.equal(db.customers.length, 1);
  const c = db.customers[0];
  assert.equal(c.orders, 3);
  assert.equal(c.visits, 3);
  assert.equal(c.segment, 'REGULAR');
  assert.equal(c.avgCents, Math.round(8000 / 3));
  assert.equal(c.gapDays, 7);
  assert.equal(c.favourites[0].name, 'Cheese Burger');
  assert.equal(c.favourites[0].count, 6);
  assert.equal(c.contactOk, false);
});

test('platform proxy phone shared by many addresses is not used as identity or phone', () => {
  const orders = ['Ring 1', 'Weg 2', 'Platz 3'].map((s, i) => order('p' + i, 1, { delivery: { name: 'X' + i, address: s, postal: '41747', city: 'Viersen', phone: '+4915735984469' } }));
  const db = C.build({ orders }, now);
  assert.equal(db.customers.length, 3);
  assert.ok(db.customers.every(c => c.phone === ''));
});

test('test, demo and cancelled orders', () => {
  const db = C.build({ orders: [order('t', 1, { isTest: true }), order('d', 1, { displayCode: 'DEMO03' }), order('x', 2, { status: 'CANCELLED' })] }, now);
  assert.equal(db.customers.length, 1);
  assert.equal(db.customers[0].segment, 'CANCELLED_ONLY');
  assert.equal(db.stats.customers, 0);
});

test('old Lieferando orders get their address from the page text', () => {
  const raw = '53 min 41749 Viersen, Friedrich-Ebert-Straße 19 Glantis Hölter ASAP #BWFM9C 59 min 41749 Viersen, Beckstraße 42 Alexander Götzer ASAP #K8MG4W';
  const db = C.build({ orders: [{ id: '1', source: 'LIEFERANDO', externalOrderCode: 'K8MG4W', status: 'OPEN', createdAt: at(1), externalTotalCents: 3100, rawText: raw, cart: [{ name: 'Lieferando order', quantity: 1, unitCents: 3100 }] }] }, now);
  const c = db.customers[0];
  assert.equal(c.name, 'Alexander Götzer');
  assert.equal(c.street + ' ' + c.house, 'Beckstraße 42');
  assert.equal(c.postal, '41749');
  assert.equal(c.totalCents, 3100);
  assert.deepEqual(c.favourites, []);
  assert.equal(c.fromRawText, true);
});

test('own channel customers may be contacted; sleeping after a long pause', () => {
  const db = C.build({ orders: [order('k', 60, { source: undefined, totalCents: undefined, cart: [{ name: 'Falafel', quantity: 1, unitCents: 500, options: [{ id: '__menu', group: '__order', name: 'Menü', cents: 450 }] }] })] }, now);
  const c = db.customers[0];
  assert.equal(c.contactOk, true);
  assert.equal(c.segment, 'SLEEPING');
  assert.equal(c.totalCents, 950);
  assert.equal(c.favourites[0].name, 'Falafel (Menü)');
});
