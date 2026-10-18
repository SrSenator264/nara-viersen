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
