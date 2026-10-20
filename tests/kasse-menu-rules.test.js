'use strict';
// Regeln für den Menü-Button auf Warenkorb-Zeilen (kasse-quick-extras.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { naraMenuAction } = require('../kasse-quick-extras.js');

const ok = p => !!p && (!!p.menuCents || p.c === 'Burger');
const burger = { id: 'b', n: 'Cheese Burger', c: 'Burger', cents: 799, menuCents: 1249 };      // Menü steckt im Produkt-Dialog
const sandwich = { id: 's', n: 'Sandwich', c: 'Burger', cents: 650 };                           // kein eigenes Menü, aber menüfähig
const drink = { id: 'd', n: 'Cola', c: 'Getränke', cents: 250 };

test('Burger mit eigenem Menü: kein Button (Dialog fragt Einzeln/Menü)', () => {
  assert.equal(naraMenuAction({ name: 'Cheese Burger', options: [] }, burger, ok), 'none');
  assert.equal(naraMenuAction({ name: 'Cheese Burger', options: [{ id: '__menu', group: '__order' }] }, burger, ok), 'none');
});
test('menüfähiger Artikel ohne eigenes Menü: "Menü hinzufügen", danach "✓ bearbeiten"', () => {
  assert.equal(naraMenuAction({ name: 'Sandwich', options: [] }, sandwich, ok), 'add');
  assert.equal(naraMenuAction({ name: 'Sandwich', options: [{ id: '__menu', group: '__order' }] }, sandwich, ok), 'edit');
});
test('Getränke, Extras, Liefergebühr, unbekannte Artikel: nie ein Button', () => {
  assert.equal(naraMenuAction({ name: 'Cola', options: [] }, drink, ok), 'none');
  assert.equal(naraMenuAction({ name: 'Extra', kind: 'EXTRA' }, null, ok), 'none');
  assert.equal(naraMenuAction({ name: 'Lieferung', kind: 'DELIVERY_FEE' }, null, ok), 'none');
  assert.equal(naraMenuAction({ name: 'Foo', options: [] }, null, ok), 'none');
});
test('Artikel, der selbst ein Menü ist, bekommt keinen Button', () => {
  assert.equal(naraMenuAction({ name: 'Burger Menü', options: [] }, sandwich, ok), 'none');
});
test('alte gespeicherte Zeile mit __quickmenu wird über den Dialog bearbeitbar', () => {
  assert.equal(naraMenuAction({ name: 'Sandwich', options: [{ id: '__quickmenu' }] }, sandwich, ok), 'edit');
  assert.equal(naraMenuAction({ name: 'Cheese Burger', options: [{ id: '__quickmenu' }] }, burger, ok), 'edit');
});
