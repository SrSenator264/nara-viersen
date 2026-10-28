'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildMap, applyPriceSync } = require('../menu-price-sync.js');

const mk = () => ({
  settings: {},
  products: [
    { sourceId: 2, name: 'Cheese Burger', priceCents: 799, platformPriceCents: 899, menuData: { id: 2, cents: 799, menuCents: 1249 } },
    { sourceId: 105, name: 'Cheese Burger (Menü)', priceCents: 1249, menuData: { id: 105, cents: 1249 } },
    { sourceId: 99, name: 'Anderes', priceCents: 500, menuData: { id: 99, cents: 500 } },
  ],
});
const map = buildMap({ 2: 699, 105: 1099 }, new Map([[2, 105]]));

test('price sync: Kassen- und Menüpreis werden gesetzt, Rest bleibt', () => {
  const d = mk();
  const r = applyPriceSync(d, map, 't1');
  assert.deepStrictEqual(r, { applied: true, changed: 2, menuChanged: 1 });
  assert.strictEqual(d.products[0].priceCents, 699);
  assert.strictEqual(d.products[0].menuData.menuCents, 1099);
  assert.strictEqual(d.products[0].platformPriceCents, 899, 'Plattformpreis unverändert');
  assert.strictEqual(d.products[0].name, 'Cheese Burger');
  assert.strictEqual(d.products[1].priceCents, 1099);
  assert.strictEqual(d.products[2].priceCents, 500, 'Produkt ohne Eintrag unverändert');
});

test('price sync: läuft pro Kennung nur einmal, manuelle Änderungen bleiben', () => {
  const d = mk();
  applyPriceSync(d, map, 't1');
  d.products[0].priceCents = 750; // Inhaber ändert im Admin
  const r = applyPriceSync(d, map, 't1');
  assert.strictEqual(r.applied, false);
  assert.strictEqual(d.products[0].priceCents, 750);
  assert.deepStrictEqual(d.settings.priceSyncsApplied, ['t1']);
});

test('price sync: leere/fehlende Daten brechen nicht ab', () => {
  const d = { products: [{ name: 'ohne sourceId' }] };
  assert.doesNotThrow(() => applyPriceSync(d, map, 't2'));
  assert.deepStrictEqual(d.settings.priceSyncsApplied, ['t2']);
});

const { applyAdditions } = require('../menu-price-sync.js');
test('additions: Produkt + Kategorie werden einmalig angelegt, Hummus aktiviert', () => {
  const d = { settings: {}, categories: [{ id: 'cat_a', name: 'Falafel', sortOrder: 0 }], products: [{ sourceId: 202, name: 'Hummus', categoryId: 'cat_a', active: true, available: false }] };
  const shisha = { id: 520, n: 'Shisha (Wasserpfeife)', c: 'Shisha', cents: 1500, d: 'Wasserpfeife.', channels: { kasse: true, customer: false } };
  const r = applyAdditions(d, [shisha], [202], 'x1', () => 'menu_test');
  assert.deepStrictEqual(r, { applied: true, added: 1, enabled: 1 });
  const p = d.products.find(x => x.sourceId === 520);
  assert.strictEqual(p.priceCents, 1500);
  assert.strictEqual(p.active, true);
  assert.deepStrictEqual(p.channels, { kasse: true, customer: false }, 'nur Kasse, nicht Kunden/Website');
  assert.strictEqual(d.categories.find(c => c.id === p.categoryId).name, 'Shisha');
  assert.strictEqual(d.products[0].available, true);
  const again = applyAdditions(d, [shisha], [202], 'x1', () => 'menu_test2');
  assert.strictEqual(again.applied, false);
  assert.strictEqual(d.products.filter(x => x.sourceId === 520).length, 1);
});
test('additions: vorhandenes Produkt wird nicht doppelt angelegt', () => {
  const d = { settings: {}, categories: [], products: [{ sourceId: 520, name: 'Shisha', priceCents: 1400, categoryId: 'c', active: true }] };
  const r = applyAdditions(d, [{ id: 520, n: 'Shisha', c: 'Shisha', cents: 1500 }], [], 'x2', () => 'm');
  assert.strictEqual(r.added, 0);
  assert.strictEqual(d.products.length, 1);
  assert.strictEqual(d.products[0].priceCents, 1400, 'bestehender Preis bleibt');
});
