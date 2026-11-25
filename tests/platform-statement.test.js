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

test('Loco Chicken über Lieferando/Uber/Sides zählt als LANCH, Loco an der Kasse nicht', () => {
  const SL = require('../sales-ledger.js');
  assert.equal(SL.platformOf({ platform: 'LIEFERANDO', brand: 'Loco Chicken' }), 'LANCH');
  assert.equal(SL.platformOf({ platform: 'UBER_EATS', station: 'LOCO' }), 'LANCH');
  assert.equal(SL.platformOf({ platform: 'SIDES', channel: 'LIEFERANDO', brandName: 'Loco Chicken' }), 'LANCH');
  assert.equal(SL.platformOf({ platform: 'NARA', brand: 'Loco Chicken' }), null);
  assert.equal(SL.platformOf({ platform: 'LIEFERANDO', brand: 'IU GENE' }), 'LIEFERANDO');
});

test('GuV: Lanch-Umsatz aus Gutschrift (anteilig), Flamo-Bestellungen nur an ungedeckten Tagen', () => {
  const EU = require('../euer-draft.js');
  const o = (id, day, c, extra) => ({ id, platform: 'LIEFERANDO', brand: 'Loco Chicken', placedAt: day + 'T12:00:00Z', totalCents: c, status: 'DELIVERED', ...extra });
  const d = { settings: { accounting: {} }, payments: [], invoices: [], suppliers: [], payrollPayments: [], fixedAssets: [],
    orders: [o('a', '2026-10-05', 1000), o('b', '2026-10-20', 2000), { id: 'l', platform: 'LIEFERANDO', placedAt: '2026-10-06T12:00:00Z', totalCents: 500, status: 'DELIVERED' }],
    platformStatements: [
      { platform: 'LANCH', documentKind: 'SETTLEMENT', periodFrom: '2026-10-01', periodTo: '2026-10-15', grossCents: 150000, commissionGrossCents: 100 },
      { platform: 'LANCH', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-10-01', periodTo: '2026-10-15', commissionGrossCents: 200 },
    ] };
  const r = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.equal(r.income.byPlatform.LANCH, 150000 + 2000); // Gutschrift + Bestellung am 20.10 (nicht gedeckt), 05.10 nicht doppelt
  assert.equal(r.income.byPlatform.LIEFERANDO, 500);
  assert.equal(r.income.platformCents, 152500); assert.equal(r.income.totalCents, 152500);
  assert.deepEqual(r.statementCoverage.LANCH, { days: 15, of: 31 });
  // Gutschrift über Monatsgrenze → anteilig
  d.platformStatements[0] = { ...d.platformStatements[0], periodFrom: '2026-10-25', periodTo: '2026-11-03' };
  const oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31').income.byPlatform.LANCH, nov = EU.buildPeriod(d, '2026-11-01', '2026-11-30').income.byPlatform.LANCH;
  assert.equal(oct, 105000 + 1000 + 2000); assert.equal(nov, 45000);
});

test('Just Virtual (Just Smashed): Abrechnung KW46 → JUST_VIRTUAL, Umsatz aus Abrechnung, Gebühren voll, nicht bei Lieferando', () => {
  const PS = require('../platform-statement.js'), EU = require('../euer-draft.js'), SL = require('../sales-ledger.js');
  const st = PS.normalize({ platform: 'JUST_VIRTUAL', documentKind: 'SETTLEMENT', invoiceNumber: '750292170', periodFrom: '2026-11-08', periodTo: '2026-11-14',
    grossSales: 166.65, cashCollected: 55.32, onlinePaid: 111.33, commissionNet: 72.08, commissionVat: 13.70, commissionGross: 85.79, payout: 25.54 });
  assert.equal(st.platform, 'JUST_VIRTUAL'); assert.equal(st.grossCents, 16665); assert.equal(st.commissionGrossCents, 8579); assert.equal(st.cashCollectedCents, 5532); assert.equal(st.payoutCents, 2554);
  assert.equal(SL.platformOf({ platform: 'LIEFERANDO', brand: 'Just Smashed' }), 'JUST_VIRTUAL');
  const d = { settings: { accounting: {} }, payments: [], invoices: [], suppliers: [], payrollPayments: [], fixedAssets: [],
    orders: [{ id: 'l', platform: 'LIEFERANDO', placedAt: '2026-11-10T12:00:00Z', totalCents: 500, status: 'DELIVERED' }], platformStatements: [st] };
  const r = EU.buildPeriod(d, '2026-11-01', '2026-11-30');
  assert.equal(r.income.byPlatform.JUST_VIRTUAL, 16665); assert.equal(r.income.byPlatform.LIEFERANDO, 500);
  assert.equal(r.income.totalCents, 16665 + 500); assert.equal(r.expenses.PLATFORM_FEES, 8579);
  assert.deepEqual(r.statementCoverage.JUST_VIRTUAL, { days: 7, of: 30 });
});
