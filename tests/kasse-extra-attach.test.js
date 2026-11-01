'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// attachExtra aus kasse.js (Browser-Skript) herausschneiden und mit Stubs ausführen
const src = fs.readFileSync(path.join(__dirname, '..', 'kasse.js'), 'utf8');
const start = src.indexOf('function attachExtra(');
const end = src.indexOf('function add(p,options', start);
assert.ok(start > 0 && end > start, 'attachExtra gefunden');
const code = src.slice(start, end);
const mk = (order, locked = false) => {
  const log = { saved: 0, rendered: 0 };
  const env = { order, locked, log };
  const f = new Function('env', `const cur=()=>env.order,paidLock=()=>env.locked,save=()=>env.log.saved++,render=()=>env.log.rendered++,$=()=>({textContent:''}),t=()=>'ok';${code};return attachExtra;`)(env);
  return { f, log };
};
const extra = { id: 9, n: 'Käse, extra', c: 'Extra', cents: 120 };

test('Extra klebt am letzten Artikel (Option + Preis pro Stück)', () => {
  const o = { cart: [{ name: 'A', unitCents: 700, quantity: 1, options: [] }, { name: 'B', unitCents: 999, quantity: 2, options: [] }], changes: [] };
  const { f } = mk(o);
  assert.strictEqual(f(extra), true);
  assert.strictEqual(o.cart.length, 2);
  assert.strictEqual(o.cart[0].options.length, 0);
  assert.strictEqual(o.cart[1].options[0].name, 'Käse, extra');
  assert.strictEqual(o.cart[1].unitCents, 1119);
});

test('Liefergebühr/Extra-Zeilen werden übersprungen', () => {
  const o = { cart: [{ name: 'A', unitCents: 700, quantity: 1, options: [] }, { kind: 'DELIVERY_FEE', unitCents: 200, quantity: 1 }], changes: [] };
  assert.strictEqual(mk(o).f(extra), true);
  assert.strictEqual(o.cart[0].unitCents, 820);
  assert.strictEqual(o.cart[1].unitCents, 200);
});

test('leerer Warenkorb: nicht kleben (normal als eigene Zeile)', () => {
  assert.strictEqual(mk({ cart: [], changes: [] }).f(extra), false);
});

test('andere Kategorie: unberührt', () => {
  const o = { cart: [{ name: 'A', unitCents: 700, quantity: 1, options: [] }], changes: [] };
  assert.strictEqual(mk(o).f({ ...extra, c: 'Dips' }), false);
  assert.strictEqual(o.cart[0].unitCents, 700);
});

test('bezahlte Bestellung (paidLock): nichts ändern, Klick abgefangen', () => {
  const o = { cart: [{ name: 'A', unitCents: 700, quantity: 1, options: [] }], changes: [] };
  assert.strictEqual(mk(o, true).f(extra), true);
  assert.strictEqual(o.cart[0].unitCents, 700);
});
