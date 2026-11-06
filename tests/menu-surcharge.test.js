'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { naraMenuSurcharge } = require('../menu-surcharge.js');

test('fester Menü-Aufpreis 3,00 € für alle Artikel, auch mit eigenem Menüpreis (Cheese Burger 6,99 → 9,99)', () => {
  const cheese = { cents: 699, menuCents: 1099 };
  assert.equal(naraMenuSurcharge(cheese, 300), 300);
  assert.equal(cheese.cents + naraMenuSurcharge(cheese, 300), 999);
  assert.equal(naraMenuSurcharge({ cents: 1049, menuCents: 1499 }, 300), 300);
});
test('Artikel ohne eigenen Menüpreis: allgemeine Regel (Einstellung)', () => {
  assert.equal(naraMenuSurcharge({ cents: 650 }, 300), 300);
  assert.equal(naraMenuSurcharge({ cents: 650 }, 500), 500);
});
test('ohne Einstellung: eigener Menüpreis − Einzelpreis, sonst 0', () => {
  assert.equal(naraMenuSurcharge({ cents: 699, menuCents: 1099 }, undefined), 400);
  assert.equal(naraMenuSurcharge({ cents: 650 }, undefined), 0);
});
