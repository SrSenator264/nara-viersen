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
