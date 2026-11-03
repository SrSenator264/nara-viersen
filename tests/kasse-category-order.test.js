'use strict';
// Kasse: Reihenfolge der Kategorien folgt dem sortOrder aus der Menü-Verwaltung (/api/menu -> categories).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'kasse.js'), 'utf8');
const start = src.indexOf('function orderedCats(');
const end = src.indexOf('async function loadSharedMenu(', start);
assert.ok(start > 0 && end > start, 'orderedCats gefunden');
const code = src.slice(start, end);

const mk = (products, ranks) => new Function('products', 'catRank', `${code};return orderedCats();`)(products, ranks);
const P = names => names.map((c, i) => ({ id: i, c }));

test('ohne Rangliste: Reihenfolge des ersten Auftretens (Fallback)', () => {
  assert.deepEqual(mk(P(['A', 'B', 'A', 'C']), null), ['A', 'B', 'C']);
});

test('Kategorie nach oben/unten verschoben: Kasse folgt dem sortOrder', () => {
  const ranks = new Map([['Hot Dogs', 1], ['Kindergerichte', 2], ['Sandwiches', 3]]);
  assert.deepEqual(mk(P(['Sandwiches', 'Hot Dogs', 'Kindergerichte']), ranks), ['Hot Dogs', 'Kindergerichte', 'Sandwiches']);
});

test('Kategorie ohne sortOrder (neu/unbekannt) kommt ans Ende, Reste behalten ihre Reihenfolge', () => {
  const ranks = new Map([['B', 1], ['A', 2]]);
  assert.deepEqual(mk(P(['X', 'A', 'Y', 'B']), ranks), ['B', 'A', 'X', 'Y']);
});

test('gleicher sortOrder: stabil nach erstem Auftreten', () => {
  const ranks = new Map([['A', 5], ['B', 5], ['C', 5]]);
  assert.deepEqual(mk(P(['C', 'A', 'B']), ranks), ['C', 'A', 'B']);
});

test('loadSharedMenu übernimmt categories[].sortOrder in die Rangliste', () => {
  assert.match(src, /catRank=new Map\(\(Array\.isArray\(data\.categories\)/);
  assert.match(src, /cats=orderedCats\(\)/);
});
