'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const SLG = require('../settlement-ledger.js');
const SL = require('../sales-ledger.js');
const bd = [{ day: '2026-10-18', totalCents: 95379 + 21665 + 27713 + 1000, byPlat: { LIEFERANDO: { cents: 95379, count: 29 }, UBER_EATS: { cents: 21665, count: 6 }, LOCO: { cents: 27713, count: 9 }, KASSE: { cents: 1000, count: 1 } } }];

test('Zeilen je Quelle, Provision 25% extern, 0% Kasse', () => {
  const r = SLG.rows(bd, '2026-10-18');
  assert.equal(r.rows.LIEFERANDO.count, 29); assert.equal(r.rows.LIEFERANDO.commission, Math.round(95379 * .25));
  assert.equal(r.rows.KASSE.commission, 0); assert.equal(r.rows.SIDES, undefined);
  assert.equal(r.gross, 95379 + 21665 + 27713 + 1000);
  assert.equal(r.fee, r.rows.LIEFERANDO.commission + r.rows.UBER_EATS.commission + r.rows.LOCO.commission);
});
test('Anderer Tag / leer -> keine Zeilen; eigene Provisionssätze überschreibbar', () => {
  assert.deepEqual(SLG.rows(bd, '2026-10-19').rows, {}); assert.equal(SLG.rows([], 'x').gross, 0);
  assert.equal(SLG.rows(bd, '2026-10-18', { LIEFERANDO: 10 }).rows.LIEFERANDO.rate, 10);
});
test('Tagesabschluss-Summe = Live-Orders-Vergleich (gleiche Quelle byDay)', () => {
  const { compute } = require('../live-orders-trend.js');
  const total = SLG.rows(bd, '2026-10-18').gross;
  assert.equal(compute(bd, '2026-10-18', 'ALL').day.cur, total);
  const sum = ['LIEFERANDO', 'UBER_EATS', 'LOCO', 'KASSE'].reduce((s, k) => s + compute(bd, '2026-10-18', k).day.cur, 0);
  assert.equal(sum, total);
});

const multi = [
  { day: '2026-10-17', byPlat: { LIEFERANDO: { cents: 10000, count: 2 }, KASSE: { cents: 500, count: 1 } } },
  { day: '2026-10-18', byPlat: { LIEFERANDO: { cents: 20000, count: 3 }, UBER_EATS: { cents: 4000, count: 1 } } },
  { day: '2026-10-20', byPlat: { KASSE: { cents: 1000, count: 1 } } }
];
test('rowsRange summiert mehrere Tage je Quelle (inklusive Grenzen)', () => {
  const r = SLG.rowsRange(multi, '2026-10-17', '2026-10-18');
  assert.equal(r.days, 2);
  assert.equal(r.rows.LIEFERANDO.amount, 30000); assert.equal(r.rows.LIEFERANDO.count, 5);
  assert.equal(r.rows.LIEFERANDO.commission, 7500); assert.equal(r.rows.KASSE.commission, 0);
  assert.equal(r.gross, 34500); assert.equal(r.fee, 7500 + 1000);
});
test('rowsRange: ein Tag = rows(); ausserhalb leer; von > bis oder ungültig -> leer', () => {
  const a = SLG.rowsRange(multi, '2026-10-18', '2026-10-18'), b = SLG.rows(multi, '2026-10-18');
  assert.equal(a.gross, b.gross); assert.equal(a.fee, b.fee); assert.deepEqual(a.rows, b.rows);
  assert.equal(SLG.rowsRange(multi, '2026-10-01', '2026-10-05').gross, 0);
  assert.equal(SLG.rowsRange(multi, '2026-10-20', '2026-10-17').gross, 0);
  assert.equal(SLG.rowsRange(multi, '', '2026-10-17').gross, 0);
  assert.equal(SLG.rowsRange(null, '2026-10-17', '2026-10-18').gross, 0);
});
test('rowsRange: eigene Provisionssätze überschreibbar', () => {
  assert.equal(SLG.rowsRange(multi, '2026-10-17', '2026-10-18', { LIEFERANDO: 10 }).rows.LIEFERANDO.commission, 3000);
});
test('preset: heute / gestern / Woche (ab Montag) / Monat', () => {
  assert.deepEqual(SLG.preset('today', '2026-10-20'), { from: '2026-10-20', to: '2026-10-20' });
  assert.deepEqual(SLG.preset('yesterday', '2026-10-20'), { from: '2026-10-19', to: '2026-10-19' });
  assert.deepEqual(SLG.preset('yesterday', '2026-11-01'), { from: '2026-10-31', to: '2026-10-31' });
  assert.deepEqual(SLG.preset('week', '2026-10-20'), { from: '2026-10-19', to: '2026-10-20' }); // Dienstag
  assert.deepEqual(SLG.preset('week', '2026-10-18'), { from: '2026-10-12', to: '2026-10-18' }); // Sonntag
  assert.deepEqual(SLG.preset('week', '2026-10-19'), { from: '2026-10-19', to: '2026-10-19' }); // Montag
  assert.deepEqual(SLG.preset('month', '2026-10-20'), { from: '2026-10-01', to: '2026-10-20' });
  assert.equal(SLG.preset('nope', '2026-10-20'), null); assert.equal(SLG.preset('today', ''), null);
});
