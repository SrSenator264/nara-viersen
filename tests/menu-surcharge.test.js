'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { naraMenuSurcharge } = require('../menu-surcharge.js');

test('Artikel mit eigenem Menüpreis: Aufpreis = Menüpreis − Einzelpreis (Cheese Burger 6,99 → Menü 10,99)', () => {
  const cheese = { cents: 699, menuCents: 1099 };
  assert.equal(naraMenuSurcharge(cheese, 450), 400);
  assert.equal(cheese.cents + naraMenuSurcharge(cheese, 450), 1099);
  const smashed = { cents: 799, menuCents: 1099 };
  assert.equal(smashed.cents + naraMenuSurcharge(smashed, 450), 1099);
});
test('Artikel ohne eigenen Menüpreis: allgemeine Regel (Einstellung)', () => {
  assert.equal(naraMenuSurcharge({ cents: 650 }, 450), 450);
  assert.equal(naraMenuSurcharge({ cents: 650 }, 500), 500);
});
test('ungültiger Menüpreis (≤ Einzelpreis) fällt auf die allgemeine Regel zurück', () => {
  assert.equal(naraMenuSurcharge({ cents: 800, menuCents: 800 }, 450), 450);
  assert.equal(naraMenuSurcharge({ cents: 800, menuCents: 700 }, 450), 450);
});
test('unveränderte Artikel (Menü = Einzel + 4,50) bleiben bei 4,50', () => {
  assert.equal(naraMenuSurcharge({ cents: 1049, menuCents: 1499 }, 450), 450);
});
test('ohne Einstellung und ohne Menüpreis: 0', () => {
  assert.equal(naraMenuSurcharge({ cents: 650 }, undefined), 0);
});
