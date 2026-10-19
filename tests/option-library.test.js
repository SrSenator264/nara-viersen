'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { migrate, compose, canon } = require('../option-library');

const mk = () => ({
  optionGroups: [], products: [
    { id: 'a', menuData: { dips: [{ id: 'e1', name: 'Beef extra', cents: 450, group: 'Ihre Extras' }, { id: 'e2', name: 'Cheddar', cents: 100, group: 'Ihre Extras', unavailable: true }, { id: 'd1', name: 'BBQ', cents: 80, group: 'Dips' }, { id: 'm', name: 'Mayo', cents: 49 }] } },
    { id: 'b', menuData: { dips: [{ id: 'e1', name: 'Beef extra', cents: 450, group: 'Ihre Extras' }, { id: 'e2', name: 'Cheddar', cents: 100, group: 'Ihre Extras', unavailable: true }, { id: 'd1', name: 'BBQ', cents: 99, group: 'Dips' }] } },
    { id: 'c', menuData: {} }
  ]
});

test('Migration: gleiche Gruppen werden geteilt, abweichende getrennt, nichts geht verloren', () => {
  const d = mk(), orig = JSON.parse(JSON.stringify(d.products));
  const n = migrate(d);
  assert.equal(n, 4, 'Ihre Extras (1×), Dips (2 Varianten), Gruppe ohne Namen');
  assert.equal(d.products[0].optionGroupIds[0], d.products[1].optionGroupIds[0], 'Extras geteilt');
  assert.notEqual(d.products[0].optionGroupIds[1], d.products[1].optionGroupIds[1], 'Dips mit anderem Preis getrennt');
  assert.equal(d.products[2].optionGroupIds, undefined);
  for (let i = 0; i < 2; i++) assert.equal(canon(compose(d.products[i], d.optionGroups)), canon(orig[i].menuData.dips));
  assert.equal(migrate(d), 0, 'läuft nur einmal');
});

test('compose: Ausschluss pro Produkt und „heute aus“ nur am eingetragenen Tag', () => {
  const d = mk(); migrate(d);
  const p = d.products[0]; p.optionExclude = ['e1'];
  assert.ok(!compose(p, d.optionGroups).some(x => x.id === 'e1'));
  const g = d.optionGroups.find(x => x.items.some(i => i.id === 'd1' && i.cents === 80)); g.items[0].soldOutDay = '2026-10-19';
  assert.equal(compose(p, d.optionGroups, '2026-10-19').find(x => x.id === 'd1').unavailable, true);
  assert.equal(compose(p, d.optionGroups, '2026-10-20').find(x => x.id === 'd1').unavailable, undefined, 'am nächsten Tag wieder da');
  assert.ok(!('soldOutDay' in compose(p, d.optionGroups, '2026-10-19').find(x => x.id === 'd1')));
});

// Läuft IMMER: mit data/nara-admin.json (echte Daten), falls vorhanden — sonst mit dem kleinen Fixture tests/fixtures/admin-menu-sample.json (kein skip mehr).
test('Migration verlustfrei für alle Produkte (echte Daten oder Fixture)', () => {
  const real = path.join(__dirname, '..', 'data', 'nara-admin.json'), fixture = path.join(__dirname, 'fixtures', 'admin-menu-sample.json');
  const usingReal = fs.existsSync(real);
  const d = JSON.parse(fs.readFileSync(usingReal ? real : fixture, 'utf8'));
  if (usingReal && (d.optionGroups || []).length) { console.warn('[option-library.test] data/nara-admin.json hat schon optionGroups → Fixture wird genutzt'); Object.assign(d, JSON.parse(fs.readFileSync(fixture, 'utf8'))); }
  const orig = new Map(d.products.map(p => [p.id, JSON.parse(JSON.stringify((p.menuData && p.menuData.dips) || []))]));
  assert.ok([...orig.values()].some(x => x.length), 'Testdaten brauchen mindestens ein Produkt mit dips');
  migrate(d);
  for (const p of d.products) if (orig.get(p.id).length) assert.equal(canon(compose(p, d.optionGroups)), canon(orig.get(p.id)), p.name);
});

test('today(): Format JJJJ-MM-TT (Basis für „heute aus“)', () => {
  const { today } = require('../option-library');
  assert.equal(today(new Date(2026, 9, 19)), '2026-10-19');
  assert.equal(today(new Date(2026, 0, 5)), '2026-01-05');
});
