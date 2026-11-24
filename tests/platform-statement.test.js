'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const PS = require('../platform-statement.js');
const SL = require('../sales-ledger.js');
const EU = require('../euer-draft.js');

const base = (o = {}) => ({ settings: { accounting: { vatRegime: 'KLEIN' } }, orders: [], payments: [], invoices: [], suppliers: [], fiscalTransactions: [], receipts: [], platformStatements: [], ...o });
const order = (id, platform, source, total, at = '2026-10-10T12:00:00Z') => ({ id, platform, source, status: 'DELIVERED', totalCents: total, placedAt: at, brand: 'IU GENE' });

test('normalize: LANCH bleibt LANCH, unbekannt → OTHER, Waren getrennt', () => {
  const s = PS.normalize({ platform: 'LANCH', documentKind: 'COMMISSION_INVOICE', commissionNet: 605.6, commissionVat: 115.06, goods: 547.72 });
  assert.equal(s.platform, 'LANCH');
  assert.equal(s.commissionGrossCents, 72066);
  assert.equal(s.goodsCents, 54772);
  assert.equal(PS.normalize({ platform: 'FOO' }).platform, 'OTHER');
  assert.equal(PS.normalize({}).goodsCents, null);
  assert.ok(PS.SCHEMA.properties.platform.enum.includes('LANCH'));
});

test('sales-ledger: source LANCH zählt als LANCH, auch mit platform NARA', () => {
  const d = base({ orders: [order('a', 'NARA', 'LANCH', 1000), order('b', 'Lanch', 'LANCH', 2000), order('c', 'LIEFERANDO', 'LIEFERANDO', 3000)] });
  const r = SL.build(d, '2026-10-01', '2026-10-31').platform;
  assert.deepEqual(r.rows.map(x => x.platform).sort(), ['LANCH', 'LANCH', 'LIEFERANDO']);
  assert.equal(r.totals.grossCents, 6000);
});

test('compare: LANCH-Kasse vergleicht nur mit Lanch-Bestellungen, Lieferando nur mit Lieferando', () => {
  const d = base({ orders: [order('a', 'NARA', 'LANCH', 1000), order('c', 'LIEFERANDO', 'LIEFERANDO', 3000)] });
  const st = { platform: 'LANCH', periodFrom: '2026-10-01', periodTo: '2026-10-15', ordersCount: 1, grossCents: 1000 };
  const c = PS.compare(d, st);
  assert.equal(c.flamoCount, 1); assert.equal(c.flamoGrossCents, 1000); assert.equal(c.ok, true);
  assert.equal(PS.compare(d, { ...st, platform: 'LIEFERANDO', grossCents: 3000 }).flamoGrossCents, 3000);
});

test('EÜR: Waren aus Plattform-Rechnung → GOODS, Gebühren einmal → PLATFORM_FEES', () => {
  const d = base({ platformStatements: [
    { platform: 'LANCH', documentKind: 'SETTLEMENT', periodTo: '2026-10-15', commissionGrossCents: 38896, otherFeesCents: 3840 },
    { platform: 'LANCH', documentKind: 'COMMISSION_INVOICE', periodTo: '2026-10-15', commissionGrossCents: 50739 },
    { platform: 'LANCH', documentKind: 'COMMISSION_INVOICE', periodTo: '2026-10-31', commissionGrossCents: 72066, goodsCents: 54772 },
  ] });
  const r = EU.build(d, 2026);
  assert.equal(r.expenses.PLATFORM_FEES, 38896 + 3840 + 50739 + 72066);
  assert.equal(r.expenses.GOODS, 54772);
});
