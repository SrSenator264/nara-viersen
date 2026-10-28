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
