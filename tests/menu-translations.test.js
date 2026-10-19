'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importMenuTranslationDrafts, menuTrOf } = require('../menu-translations-lib.js');

const SRC = {
  products: { p1: { name: { ar: 'برغر', en: 'Burger' }, description: { ar: 'لحم', en: 'Beef' } } },
  categories: { Burger: { ar: 'برغر', en: 'Burgers' } },
};
const mk = () => ({ products: [{ id: 'a', sourceId: 'p1', name: 'Burger DE', description: 'Rind' }], categories: [{ id: 'c1', name: 'Burger' }] });

test('importMenuTranslationDrafts: fills missing languages as status "draft" (products + categories)', () => {
  const d = mk();
  const n = importMenuTranslationDrafts(d, SRC);
  assert.equal(n, 4); // 2 Sprachen × (1 Produkt + 1 Kategorie)
  assert.deepEqual(d.products[0].translations.ar, { name: 'برغر', description: 'لحم', status: 'draft' });
  assert.deepEqual(d.products[0].translations.en, { name: 'Burger', description: 'Beef', status: 'draft' });
  assert.deepEqual(d.categories[0].translations.en, { name: 'Burgers', status: 'draft' });
});
test('importMenuTranslationDrafts: never overwrites existing text, only fills the missing language', () => {
  const d = mk();
  d.products[0].translations = { ar: { name: 'اسمي', description: 'وصفي', status: 'approved' } };
  const n = importMenuTranslationDrafts(d, SRC);
  assert.equal(n, 3); // ar des Produkts bleibt, en des Produkts + ar/en der Kategorie neu
  assert.deepEqual(d.products[0].translations.ar, { name: 'اسمي', description: 'وصفي', status: 'approved' });
  assert.equal(d.products[0].translations.en.status, 'draft');
});
test('importMenuTranslationDrafts: idempotent, ignores unknown products, no source = no-op', () => {
  const d = mk(); d.products.push({ id: 'z', sourceId: 'unknown', name: 'X' });
  assert.equal(importMenuTranslationDrafts(d, SRC), 4);
  assert.equal(importMenuTranslationDrafts(d, SRC), 0, 'zweiter Lauf ändert nichts');
  assert.equal(d.products[1].translations, undefined);
  assert.equal(importMenuTranslationDrafts(mk(), null), 0);
});
test('importMenuTranslationDrafts: replaces a broken translations field (array/non-object) without throwing', () => {
  const d = mk(); d.products[0].translations = [];
  assert.equal(importMenuTranslationDrafts(d, SRC), 4);
  assert.equal(Array.isArray(d.products[0].translations), false);
});
test('menuTrOf: returns only status === "approved" translations (drafts never reach customers/kasse)', () => {
  const F = { n: 'name', d: 'description' };
  const o = { translations: {
    ar: { name: 'برغر', description: 'لحم', status: 'approved' },
    en: { name: 'Burger', description: 'Beef', status: 'draft' } } };
  assert.deepEqual(menuTrOf(o, F), { ar: { n: 'برغر', d: 'لحم' } });
  o.translations.en.status = 'approved';
  assert.deepEqual(Object.keys(menuTrOf(o, F)).sort(), ['ar', 'en']);
  assert.deepEqual(menuTrOf({ translations: { ar: { name: 'x' } } }, F), {}); // ohne Status nie
  assert.deepEqual(menuTrOf({ translations: { ar: null, en: 'x' } }, F), {});
  assert.deepEqual(menuTrOf(null, F), {});
  assert.deepEqual(menuTrOf({}, F), {});
});
test('menuTrOf: skips empty fields', () => {
  assert.deepEqual(menuTrOf({ translations: { ar: { name: 'برغر', description: '', status: 'approved' } } }, { n: 'name', d: 'description' }), { ar: { n: 'برغر' } });
  assert.deepEqual(menuTrOf({ translations: { ar: { name: '', status: 'approved' } } }, { n: 'name' }), {});
});
