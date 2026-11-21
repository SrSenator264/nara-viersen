'use strict';
// Burger-Builder: Basis-Zutaten aus der Beschreibung, Warenkorb-Zeile, und dass der Server die Zeile annimmt (gleiche Optionen wie das Produktfenster).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const B = require('../web-prototype/builder/builder.js');
const W = require('../web-order.js'), R = require('../delivery-rules.js');
const MENU = require('../web-prototype/menu.json');
const root = path.join(__dirname, '..');

test('Basis-Zutaten: Joppie, XXXL, Surf & Turf (Garnelen ≠ 3 Patties), Veggie', () => {
  const types = id => B.parseBase(MENU.find(p => p.id === id)).map(l => l.type);
  assert.deepEqual(types(10), ['bunBottom', 'tomato', 'patty', 'cheese', 'pickles', 'onion', 'sauce']);
  assert.equal(types(14).filter(t => t === 'patty').length, 3);
  assert.equal(types(22).filter(t => t === 'patty').length, 1);
  assert.ok(types(22).includes('shrimp'));
  assert.ok(types(23).includes('veggie'));
  assert.equal(types(1).filter(t => t === 'sauce').length, 1, 'Champignon-Burgersoße = eine Sauce');
});

test('Baubar: nur echte Burger mit Extras, keine Angebote/Minis', () => {
  const ok = MENU.filter(B.isBuildable).map(p => p.id);
  assert.ok(ok.includes(10) && ok.includes(14));
  assert.ok(!ok.includes(24) && !ok.includes(53) && !ok.includes(54));
});

test('Warenkorb-Zeile: Extras, Menü mit Getränk/Sauce, "ohne X", Preis', () => {
  const p = MENU.find(x => x.id === 10);
  const st = { extras: ['extra-bacon', 'extra-sauce'], removed: ['Gurken', 'bun', 'Gurken'], menu: true, drink: 'menu-drink-cola-1', msauce: 'menu-sauce-mayo' };
  const l = B.buildLine(p, st);
  assert.equal(l.m, 1); assert.equal(l.nt, 'ohne Gurken');
  assert.deepEqual(l.o.map(o => o.i), ['extra-bacon', 'extra-sauce', 'menu-drink-cola-1', 'menu-sauce-mayo']);
  assert.equal(l.u, p.mc + 120 + 99 + 149);
  assert.equal(B.menuReady(p, { menu: true, drink: 'x' }), false);
  assert.equal(B.menuReady(p, { menu: false }), true);
  assert.equal(B.buildLine(p, { extras: ['gibts-nicht'], removed: [] }).o.length, 0);
});

test('Server nimmt die Builder-Zeile an (Optionen gültig, Notiz bleibt, Server rechnet Preis)', () => {
  const sb = {}; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8') + '\n;globalThis.__catalog=catalog;', sb);
  vm.runInContext(fs.readFileSync(path.join(root, 'menu-source.js'), 'utf8') + '\n;globalThis.__catalog=catalog;', sb);
  const catalog = sb.__catalog, ctx = { catalog, products: [], rules: R, deliveryConfig: R.defaultConfig(), now: new Date('2026-10-10T18:00:00Z') };
  const p = MENU.find(x => x.id === 10), groups = W.groupsFor(W.productFor(10, catalog, []), catalog);
  const extras = (groups.find(g => g.group === 'Ihre Extras') || { options: [] }).options.map(o => String(o.id || o.name));
  const want = ['extra-bacon', 'extra-cheese'].filter(i => extras.includes(i));
  assert.ok(want.length, 'Server kennt die Extras: ' + extras.slice(0, 5).join(','));
  const l = B.buildLine(p, { extras: want, removed: ['Gurken'], menu: false });
  const o = W.buildOrder({ type: 'pickup', cart: [{ id: l.id, q: 1, m: l.m, o: l.o.map(x => ({ g: x.g, i: x.i })), nt: l.nt, u: 1 }], customer: { name: 'Max Muster', phone: '0151 2345678' }, payment: 'CASH' }, ctx);
  const line = o.cart[0];
  assert.equal(line.note, 'ohne Gurken');
  assert.equal(line.options.length, want.length);
  assert.ok(line.unitCents > 1, 'Server-Preis statt Client-Preis');
});
