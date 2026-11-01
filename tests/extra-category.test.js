'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { applyExtraCategory, doubleIngredientsOption } = require('../extra-category.js');

const mk = () => ({
  settings: {},
  categories: [{ id: 'c1', name: 'Fried Chicken', sortOrder: 1 }, { id: 'c2', name: 'Beef Burger', sortOrder: 2 }, { id: 'c3', name: 'Sandwiches', sortOrder: 3 }],
  optionCatalog: [{ id: 'k1', name: 'Käse, extra', cents: 120 }, { id: 'k2', name: 'Jalapeños', cents: 99 }, { id: 'k3', name: 'Aioli Sauce Extra', cents: 99 }, { id: 'k4', name: 'Cola', cents: 0 }],
  optionGroups: [
    { id: 'g1', name: 'Ihre Extras', items: [{ id: 'a', ref: 'k1', priceMode: 'catalog' }, { id: 'b', ref: 'k2', priceMode: 'catalog' }, { id: 'f', name: 'Gratis', cents: 0 }] },
    { id: 'g2', name: 'Dips', items: [{ id: 'c', ref: 'k3', priceMode: 'catalog' }, { id: 'd', ref: 'k1', priceMode: 'catalog' }] },
    { id: 'g3', name: '__drink', items: [{ id: 'e', ref: 'k4', priceMode: 'catalog' }] },
  ],
  products: [
    { id: 'p1', sourceId: 1, name: 'Crispy', categoryId: 'c1', priceCents: 700 },
    { id: 'p2', sourceId: 2, name: 'Wings', categoryId: 'c1', priceCents: 800 },
    { id: 'p3', sourceId: 3, name: 'Joppie', categoryId: 'c2', priceCents: 749, optionGroupIds: ['g1', 'g2', 'g3'] },
  ],
});
let n = 0;
const newId = () => 'x' + (++n);

test('extra: Kategorie nach Fried Chicken, Name + اكسترا, Katalogpreis, ohne Duplikate/Getränke/0-Preis', () => {
  const d = mk();
  const r = applyExtraCategory(d, newId);
  assert.deepStrictEqual(r, { applied: true, added: 3 });
  const names = d.products.map(p => p.name);
  assert.deepStrictEqual(names.slice(0, 2), ['Crispy', 'Wings']);
  assert.deepStrictEqual(names.slice(2, 5).sort(), ['Aioli Sauce Extra اكسترا', 'Jalapeños اكسترا', 'Käse, extra اكسترا'].sort());
  assert.strictEqual(names[5], 'Joppie', 'Extra steht direkt nach Fried Chicken');
  const kase = d.products.find(p => p.name === 'Käse, extra اكسترا');
  assert.strictEqual(kase.priceCents, 120);
  assert.strictEqual(kase.menuData.c, 'Extra');
  assert.deepStrictEqual(kase.channels, { kasse: true, customer: false });
  assert.ok(!names.some(x => /Cola|Gratis/.test(x)));
});

test('extra: zweiter Lauf ändert nichts', () => {
  const d = mk();
  applyExtraCategory(d, newId);
  const before = JSON.stringify(d);
  assert.deepStrictEqual(applyExtraCategory(d, newId), { applied: false, added: 0 });
  assert.strictEqual(JSON.stringify(d), before);
});

test('doppelte Zutaten: 35 % vom Preis, nur Sandwiches/Hot Dogs', () => {
  assert.strictEqual(doubleIngredientsOption('Sandwiches', 1000).cents, 350);
  assert.strictEqual(doubleIngredientsOption('Hot Dogs', 649).cents, 227);
  assert.strictEqual(doubleIngredientsOption('Beef Burger', 1000), null);
  assert.strictEqual(doubleIngredientsOption('Sandwiches', 0), null);
});
