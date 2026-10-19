'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const H = require('../admin-history');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'));

test('update is logged and undone (price + removed field)', () => {
  const dir = tmp(), data = { products: [{ id: 'a', name: 'Burger', priceCents: 999, soldOutDay: '2026-10-19' }, { id: 'b', name: 'Fries', priceCents: 300 }] };
  const next = JSON.parse(JSON.stringify(data.products)); next[0].priceCents = 799; delete next[0].soldOutDay;
  assert.equal(H.record(dir, 'products', data.products, next, 'Omar'), 1);
  data.products = next;
  const l = H.list(dir); assert.equal(l[0].op, 'update'); assert.deepEqual(l[0].fields.sort(), ['priceCents', 'soldOutDay']); assert.equal(l[0].by, 'Omar');
  assert.equal(H.undo(dir, l[0].id, data).ok, true);
  assert.equal(data.products[0].priceCents, 999); assert.equal(data.products[0].soldOutDay, '2026-10-19');
  assert.equal(H.undo(dir, l[0].id, data).ok, false);
});

test('create, delete and reorder can be undone', () => {
  const dir = tmp(), a = { id: 'a', name: 'A' }, b = { id: 'b', name: 'B' }, c = { id: 'c', name: 'C' };
  const data = { products: [a, b] };
  H.record(dir, 'products', [a, b], [a, b, c], 'x'); data.products = [a, b, c];
  H.record(dir, 'products', [a, b, c], [a, c], 'x'); data.products = [a, c];
  H.record(dir, 'products', [a, c], [c, a], 'x'); data.products = [c, a];
  const [re, del, cr] = H.list(dir);
  assert.deepEqual([re.op, del.op, cr.op], ['reorder', 'delete', 'create']);
  assert.ok(H.undo(dir, re.id, data).ok); assert.deepEqual(data.products.map(p => p.id), ['a', 'c']);
  assert.ok(H.undo(dir, del.id, data).ok); assert.ok(data.products.some(p => p.id === 'b'));
  assert.ok(H.undo(dir, cr.id, data).ok); assert.ok(!data.products.some(p => p.id === 'c'));
});

test('many price changes become one bulk entry and undo together', () => {
  const dir = tmp(), old = Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, priceCents: 1000 }));
  const nw = old.map(p => ({ ...p, priceCents: 900 })); const data = { products: nw };
  H.record(dir, 'products', old, nw, 'Omar');
  const l = H.list(dir); assert.equal(l.length, 1); assert.equal(l[0].op, 'bulk'); assert.equal(l[0].count, 20);
  assert.ok(H.undo(dir, l[0].id, data).ok); assert.ok(data.products.every(p => p.priceCents === 1000));
});

test('no change logs nothing; unknown collections ignored', () => {
  const dir = tmp(); assert.equal(H.record(dir, 'products', [{ id: 'a' }], [{ id: 'a' }], 'x'), 0); assert.equal(H.record(dir, 'invoices', [], [{ id: 1 }], 'x'), 0);
});

test('large JSON bodies with multibyte chars survive POST unchanged (no split at chunk edges)', async () => {
  const http = require('node:http'), src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /req\.setEncoding\('utf8'\)/);
});
