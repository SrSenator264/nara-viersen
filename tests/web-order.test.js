'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = require('../web-order.js'), R = require('../delivery-rules.js');
const root = path.join(__dirname, '..');
const sb = {}; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8') + '\n;globalThis.__catalog=catalog;', sb);
vm.runInContext(fs.readFileSync(path.join(root, 'menu-source.js'), 'utf8') + '\n;globalThis.__catalog=catalog;', sb);
const catalog = sb.__catalog;
const ctx = { catalog, products: [], rules: R, deliveryConfig: R.defaultConfig(), now: new Date('2026-10-10T18:00:00Z') };
const burger = catalog.find(p => !p.hidden && p.menuCents && !p.unavailable);
const groups = W.groupsFor(burger, catalog);
const pick = g => { const x = groups.find(y => y.group === g); return { g, i: String(x.options[0].id || x.options[0].name), c: x.options[0].cents || 0 }; };
const cust = { name: 'Max Muster', phone: '0151 2345678', street: 'Teststraße', house: '1', postalCode: '41747', city: 'Viersen' };

test('web order: server prices the meal itself and ignores client prices', () => {
  const d = pick('__drink'), s = pick('__sauce');
  const o = W.buildOrder({ type: 'delivery', cart: [{ id: burger.id, q: 2, m: 1, o: [{ g: d.g, i: d.i }, { g: s.g, i: s.i }], nt: 'Ohne Zwiebeln', u: 1 }], customer: cust, payment: 'CASH' }, ctx);
  const line = o.cart[0];
  assert.equal(line.unitCents, burger.menuCents + d.c + s.c);
  assert.equal(line.totalCents, line.unitCents * 2);
  assert.equal(o.deliveryFeeCents, 100);
  assert.equal(o.totalCents, line.totalCents + 100);
  assert.equal(o.cashDueCents, o.totalCents);
  assert.equal(o.source, 'WEB'); assert.equal(o.type, 'delivery'); assert.equal(o.liveStage, 'PREPARE');
  assert.equal(o.cart.at(-1).kind, 'DELIVERY_FEE'); assert.equal(line.note, 'Ohne Zwiebeln');
  assert.ok(o.webToken.length >= 12);
});

test('web order: rejects missing required choice, unknown option, bad zone, below minimum', () => {
  assert.throws(() => W.buildOrder({ type: 'pickup', cart: [{ id: burger.id, q: 1, m: 1, o: [] }], customer: cust }, ctx), e => e.code === 'REQUIRED');
  assert.throws(() => W.buildOrder({ type: 'pickup', cart: [{ id: burger.id, q: 1, m: 0, o: [{ g: 'Ihre Extras', i: 'gold' }] }], customer: cust }, ctx), e => e.code === 'OPTION');
  assert.throws(() => W.buildOrder({ type: 'delivery', cart: [{ id: burger.id, q: 3 }], customer: { ...cust, postalCode: '10115' } }, ctx), e => e.code === 'ZONE');
  const cheap = catalog.find(p => !p.hidden && !p.unavailable && (p.cents || 0) > 0 && p.cents < 600 && !(p.requiredGroups || []).length && !p.menuCents);
  assert.throws(() => W.buildOrder({ type: 'delivery', cart: [{ id: cheap.id, q: 1 }], customer: cust }, ctx), e => e.code === 'MINIMUM');
  assert.throws(() => W.buildOrder({ type: 'pickup', cart: [{ id: burger.id, q: 1 }], customer: { name: 'A', phone: '1' } }, ctx), e => e.code === 'NAME');
  assert.throws(() => W.buildOrder({ type: 'pickup', cart: [] , customer: cust }, ctx), e => e.code === 'EMPTY');
});

test('web order: pickup has no fee, card payment has no cash due; public status hides customer data', () => {
  const o = W.buildOrder({ type: 'pickup', cart: [{ id: burger.id, q: 1 }], customer: cust, payment: 'CARD' }, ctx);
  assert.equal(o.deliveryFeeCents, 0); assert.equal(o.cashDueCents, 0); assert.equal(o.promisedMin, 20);
  const s = W.publicStatus(o);
  assert.deepEqual(Object.keys(s).sort(), ['code', 'promisedDueAt', 'step', 'totalCents', 'type']);
  assert.equal(s.step, 'received');
  assert.equal(W.publicStatus({ ...o, liveStage: 'DONE' }).step, 'done');
});
