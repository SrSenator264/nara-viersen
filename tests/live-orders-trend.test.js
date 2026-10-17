'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { compute, html, L, dow } = require('../live-orders-trend.js');
const mk = o => Object.entries(o).map(([day, totalCents]) => ({ day, totalCents }));

test('Wochentag: Sonntag 2026-10-18 = Index 6', () => assert.equal(dow('2026-10-18'), 6));

test('Heute vs. gleicher Wochentag letzte Woche + Schnitt der letzten 4', () => {
  const c = compute(mk({ '2026-10-18': 30000, '2026-10-11': 40000, '2026-10-04': 50000, '2026-09-27': 30000, '2026-09-20': 0 }), '2026-10-18');
  assert.equal(c.day.cur, 30000); assert.equal(c.day.prev, 40000); assert.equal(c.day.pct, -25);
  assert.equal(c.day.avg, 40000); assert.equal(c.day.remaining, 10000); assert.equal(c.day.above, false);
});
test('Heute über dem Schnitt', () => {
  const c = compute(mk({ '2026-10-18': 60000, '2026-10-11': 40000 }), '2026-10-18');
  assert.equal(c.day.above, true); assert.equal(c.day.remaining, 0);
});
test('Woche: Montag..gestern vs. Vorwoche gleiche Tage', () => {
  const c = compute(mk({ '2026-10-12': 100, '2026-10-13': 100, '2026-10-17': 100, '2026-10-18': 99999, '2026-10-05': 100, '2026-10-06': 100, '2026-10-10': 50, '2026-10-11': 99999 }), '2026-10-18');
  assert.equal(c.week.cur, 300); assert.equal(c.week.prev, 250); assert.equal(c.week.pct, 20); assert.equal(c.week.days, 6);
});
test('Woche am Montag: keine abgeschlossenen Tage -> null', () => assert.equal(compute([], '2026-10-12').week, null));
test('Monat: 1..gestern vs. Vormonat 1..gleicher Tag', () => {
  const c = compute(mk({ '2026-10-01': 1000, '2026-10-17': 1000, '2026-10-18': 77777, '2026-09-01': 500, '2026-09-17': 500, '2026-09-18': 77777 }), '2026-10-18');
  assert.equal(c.month.cur, 2000); assert.equal(c.month.prev, 1000); assert.equal(c.month.pct, 100); assert.equal(c.month.days, 17);
});
test('Monat am 1.: null', () => assert.equal(compute([], '2026-10-01').month, null));
test('Monatsende: Vormonat kürzer (31.3. vs Feb 28 Tage) wird begrenzt', () => {
  const c = compute(mk({ '2026-03-30': 100, '2026-02-28': 100 }), '2026-03-31');
  assert.equal(c.month.cur, 100); assert.equal(c.month.prev, 100);
});
test('Januar: Vormonat Dezember Vorjahr', () => {
  const c = compute(mk({ '2027-01-02': 200, '2026-12-02': 100 }), '2027-01-03');
  assert.equal(c.month.prev, 100); assert.equal(c.month.pct, 100);
});
test('Vergleichswert 0 -> pct null (keine Division durch 0)', () => {
  const c = compute(mk({ '2026-10-17': 500 }), '2026-10-18');
  assert.equal(c.month.pct, null); assert.equal(c.day.pct, null);
});
test('Stärkster Wochentag', () => {
  const c = compute(mk({ '2026-10-16': 900, '2026-10-17': 300, '2026-10-09': 900 }), '2026-10-18');
  assert.equal(c.best.dow, 4); assert.equal(c.best.avg, 900);
});
test('HTML in allen 3 Sprachen ohne Mischung der Titel, keine NaN', () => {
  const c = compute(mk({ '2026-10-17': 500, '2026-10-11': 400 }), '2026-10-18');
  for (const l of ['de', 'ar', 'en']) { const h = html(c, L[l]); assert.ok(h.includes(L[l].title)); assert.ok(!/NaN|undefined/.test(h), l); }
});

const { keys, rangeStats, prevRange, presets, rangeHtml } = require('../live-orders-trend.js');
const mp = (day, o) => ({ day, totalCents: Object.values(o).reduce((s, v) => s + v, 0), count: Object.keys(o).length, byPlat: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { cents: v, count: 1 }])) });

test('Pro Plattform: compute nutzt nur diese Plattform', () => {
  const bd = [mp('2026-10-18', { LIEFERANDO: 300, UBER_EATS: 100 }), mp('2026-10-11', { LIEFERANDO: 200, UBER_EATS: 400 })];
  assert.equal(compute(bd, '2026-10-18', 'LIEFERANDO').day.cur, 300);
  assert.equal(compute(bd, '2026-10-18', 'LIEFERANDO').day.pct, 50);
  assert.equal(compute(bd, '2026-10-18', 'UBER_EATS').day.pct, -75);
  assert.equal(compute(bd, '2026-10-18', 'ALL').day.cur, 400);
  assert.equal(compute(bd, '2026-10-18').day.prev, 600);
});
test('Plattform ohne Daten in Vorperiode -> pct null', () => {
  const bd = [mp('2026-10-18', { WOLT: 100 })];
  assert.equal(compute(bd, '2026-10-18', 'WOLT').day.pct, null);
});
test('keys: nach Umsatz sortiert', () => {
  assert.deepEqual(keys([mp('2026-10-18', { A: 1, B: 5, C: 3 })]), ['B', 'C', 'A']);
});
test('rangeStats: Summe, Anzahl, Ø, Plattformen, Tage; Grenzen inklusiv', () => {
  const bd = [mp('2026-10-01', { L: 100, U: 300 }), mp('2026-10-02', { L: 200 }), mp('2026-10-03', { L: 999 })];
  const r = rangeStats(bd, '2026-10-01', '2026-10-02');
  assert.equal(r.cents, 600); assert.equal(r.count, 3); assert.equal(r.avg, 200); assert.equal(r.plats.L.cents, 300); assert.equal(r.days.length, 2);
  assert.equal(rangeStats([], '2026-10-01', '2026-10-02').avg, 0);
});
test('prevRange: gleiche Länge direkt davor', () => {
  assert.deepEqual(prevRange('2026-10-08', '2026-10-14'), { from: '2026-10-01', to: '2026-10-07', days: 7 });
  assert.deepEqual(prevRange('2026-10-01', '2026-10-01'), { from: '2026-09-30', to: '2026-09-30', days: 1 });
});
test('presets: Woche/Monat/Vormonat korrekt', () => {
  const p = presets('2026-10-18');
  assert.deepEqual(p.week, ['2026-10-12', '2026-10-18']); assert.deepEqual(p.lastweek, ['2026-10-05', '2026-10-11']);
  assert.deepEqual(p.month, ['2026-10-01', '2026-10-18']); assert.deepEqual(p.lastmonth, ['2026-09-01', '2026-09-30']);
  assert.deepEqual(presets('2027-01-05').lastmonth, ['2026-12-01', '2026-12-31']);
});
test('rangeHtml mit/ohne Vergleich, 3 Sprachen, kein NaN', () => {
  const bd = [mp('2026-10-02', { LIEFERANDO: 200 }), mp('2026-10-01', { LIEFERANDO: 100 })];
  const a = rangeStats(bd, '2026-10-02', '2026-10-02'), b = rangeStats(bd, '2026-10-01', '2026-10-01');
  for (const l of ['de', 'ar', 'en']) for (const bb of [null, b]) { const h = rangeHtml(a, bb, L[l]); assert.ok(!/NaN|undefined/.test(h)); assert.ok(h.includes('Lieferando')); }
  assert.ok(rangeHtml(a, b, L.de).includes('+100%'));
});
test('html mit Tabs', () => {
  const h = html(compute([mp('2026-10-18', { LIEFERANDO: 1, UBER_EATS: 1 })], '2026-10-18'), L.de, ['ALL', 'LIEFERANDO', 'UBER_EATS'], 'UBER_EATS');
  assert.ok(h.includes('data-k="UBER_EATS" class="on"')); assert.ok(h.includes('nt-rng'));
});
test('Server: summary.byDay hat byPlat je Plattform/Kasse/Website', () => {
  const SL = require('../sales-ledger.js');
  const l = { own: { rows: [{ businessDay: '2026-10-18', grossCents: 100, channel: 'Kasse' }, { businessDay: '2026-10-18', grossCents: 50, channel: 'Website' }], totals: { count: 2, grossCents: 150, cashCents: 0, cardCents: 0, tseMissing: 0 } }, platform: { rows: [{ businessDay: '2026-10-18', grossCents: 700, platform: 'LIEFERANDO', status: 'OK', cashDueCents: 0, brand: 'x' }], totals: { count: 1, cancelled: 0, grossCents: 700, byPlatform: { LIEFERANDO: 700 }, byBrand: { x: 700 } } } };
  const d = SL.summary({ orders: [] }, l).byDay[0];
  assert.equal(d.byPlat.KASSE.cents, 100); assert.equal(d.byPlat.WEBSITE.cents, 50); assert.equal(d.byPlat.LIEFERANDO.cents, 700); assert.equal(d.totalCents, 850);
});
