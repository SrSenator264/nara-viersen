'use strict';
// Sprint 2026-11-28: Küche zeigt Extras/Allergie direkt, gleiche Auftragsart wie Live-Orders, Flamo-Code; Kasse ohne Doppel-Elemente.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const K = require('../kitchen.js');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const NOW = Date.parse('2026-11-28T12:00:00Z');
const base = { status: 'OPEN', createdAt: '2026-11-28T11:50:00Z', cart: [{ name: 'Smash Burger', quantity: 1 }] };

test('Auftragsart: TAKEAWAY = Abholung (nicht Lieferung), DINE_IN = Tisch, unbekannt nach Adresse', () => {
  assert.equal(K.kitchenView({ ...base, id: 'a', orderType: 'TAKEAWAY' }, NOW).type, 'pickup');
  assert.equal(K.kitchenView({ ...base, id: 'b', orderType: 'DINE_IN' }, NOW).type, 'local');
  assert.equal(K.kitchenView({ ...base, id: 'c', type: 'delivery' }, NOW).type, 'delivery');
  assert.equal(K.kitchenView({ ...base, id: 'd', orderType: 'DELIVERY' }, NOW).type, 'delivery');
  assert.equal(K.kitchenView({ ...base, id: 'e', delivery: { street: 'Gereonstr. 1' } }, NOW).type, 'delivery');
  assert.equal(K.kitchenView({ ...base, id: 'f' }, NOW).type, 'pickup');
});

test('Live-Orders benutzt dieselbe Regel wie die Küche (gleiche Muster)', () => {
  const kj = read('kitchen.js'), lo = read('live-orders.html');
  for (const pat of ['(deliv|lieferung)', '(pickup|pick-up|takeaway|take-away|take_away|collection|abholung)', '(local|dine[_-]?in|table|tisch)'])
    assert.ok(kj.includes(pat) && lo.includes(pat), 'Muster fehlt: ' + pat);
  assert.match(lo, /const isDel=o=>kindOf\(o\)==='delivery'/);
});

test('Notizen: Küchen-Hinweis getrennt von Tür-/Lieferhinweis; Code mit FLAMO-Präfix', () => {
  const v = K.kitchenView({ ...base, id: 'xyz-123456', remarks: 'Allergie: Erdnüsse', delivery: { street: 'A 1', notes: 'Klingel kaputt' } }, NOW);
  assert.equal(v.kitchenNotes, 'Allergie: Erdnüsse');
  assert.equal(v.deliveryNotes, 'Klingel kaputt');
  assert.match(v.notes, /Erdnüsse/); // alte Gesamtnotiz bleibt für bestehende Nutzer
  assert.equal(v.displayCode, 'FLAMO-123456');
});

test('Küchenkarte: Extras und Allergie direkt sichtbar (nicht erst nach Aufklappen)', () => {
  const h = read('kitchen.html');
  assert.match(h, /const ALLERGY=\/allerg/);
  assert.match(h, /'<div class="op">'\+i\.options\.map\(opt\)/);
  assert.doesNotMatch(h, /\.card\.open \.brief\{display:none\}/);
  assert.match(h, /allergy:'Allergie'/); assert.match(h, /allergy:'Allergy'/); assert.match(h, /allergy:'حساسية'/);
  // keine Trainings-Markierung in der Küche
  assert.doesNotMatch(h, /training|isTest|Übung/i);
});

test('Kasse: Handy-Elemente sind auf Tablet/Desktop versteckt (kein doppeltes «Neuer Auftrag», keine «0Warenkorb»-Leiste)', () => {
  assert.match(read('kasse-phone.css'), /@media screen and \(min-width:641px\)\{\s*#phone-cart-bar,#phone-strip-toggle,\.cart-panel>\.pcb-close\{display:none!important\}/);
});

test('Kasse: Quelle zeigt Lieferando nur einmal und heißt Flamo statt NARA', () => {
  const s = read('kasse-order-hub.js');
  const list = s.match(/const sources=\[(.*?)\];/)[1];
  assert.equal((list.match(/'Lieferando'/g) || []).length, 1);
  assert.doesNotMatch(list, /TAKEAWAY/);
  assert.match(s, /srcKey=s=>s==='TAKEAWAY'\?'LIEFERANDO'/);
  assert.match(s, /web:'Flamo Website\/App'/);
  assert.doesNotMatch(s, /'NARA Website|NARA موقع|NARA website/);
});

test('An Küche: Übergabe wird abgewartet, der Druckdialog nicht (Bon/TSE-Code unverändert)', () => {
  const s = read('kasse-print-lifecycle.js');
  assert.match(s, /if\(kitchenBusy\)return;kitchenBusy=true;/);
  assert.match(s, /await log\(o,action,kind\)\}finally\{kitchenBusy=false\}/);
  assert.match(s, /const job=new Promise\(r=>setTimeout\(r,0\)\)\.then\(\(\)=>window\.NARA_RECEIPT\.print\(o,kind\)\);\s*pending\(job\);/);
  assert.match(s, /inKitchen:'🔥 In der Küche ✅'/);
});
