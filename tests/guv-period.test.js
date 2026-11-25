'use strict';
// GuV pro Monat/Zeitraum = gleiche Logik wie die EÜR (euer-draft.buildPeriod).
const test = require('node:test'), assert = require('node:assert/strict');
const EU = require('../euer-draft.js');

const base = (o = {}) => ({ settings: { accounting: { vatRegime: 'KLEIN' } }, orders: [], payments: [], invoices: [], suppliers: [], fiscalTransactions: [], receipts: [], platformStatements: [], payrollPayments: [], fixedAssets: [], ...o });

const month = () => base({
  orders: [{ id: 'o1' }, { id: 'l1', platform: 'LIEFERANDO', placedAt: '2026-10-10T12:00:00Z', totalCents: 10000, status: 'DELIVERED' }, { id: 'l2', platform: 'LIEFERANDO', placedAt: '2026-11-02T12:00:00Z', totalCents: 9999, status: 'DELIVERED' }],
  payments: [{ id: 'p1', orderId: 'o1', createdAt: '2026-10-05T14:00:00Z', status: 'COMPLETED', amountCents: 2000 }],
  suppliers: [{ id: 's1', name: 'Fleisch Müller' }, { id: 's2', name: 'Hausverwaltung Meier' }],
  invoices: [
    { supplierId: 's1', invoiceDate: '2026-10-03', totalCents: 3000, status: 'POSTED', lineItems: [{}] },
    { supplierId: 's2', invoiceDate: '2026-10-01', totalCents: 80000, status: 'POSTED' },
    { supplierId: 's1', invoiceDate: '2026-11-01', totalCents: 99999, status: 'POSTED' },
  ],
  // Woche 27.09–03.10: 3 von 7 Tagen im Oktober → 3/7 der Gebühren
  platformStatements: [
    { platform: 'LIEFERANDO', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-09-27', periodTo: '2026-10-03', commissionGrossCents: 700, otherFeesCents: 0 },
    { platform: 'LIEFERANDO', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-10-04', periodTo: '2026-10-31', commissionGrossCents: 2800, goodsCents: 0 },
  ],
  payrollPayments: [{ date: '2026-10-02', amountCents: 5000 }, { date: '2026-11-02', amountCents: 7777 }],
  fixedAssets: [{ status: 'ACTIVE', purchaseDate: '2026-09-15', usefulLifeMonths: 12, monthlyDepreciationCents: 1000 }],
});

test('GuV Oktober: Einnahmen Kasse + Plattform, Ausgaben je Kategorie, AfA 1 Monat, Ergebnis', () => {
  const r = EU.buildPeriod(month(), '2026-10-01', '2026-10-31');
  assert.equal(r.income.ownCents, 2000); assert.equal(r.income.platformCents, 10000);
  assert.deepEqual(r.income.byPlatform, { LIEFERANDO: 10000 });
  assert.equal(r.expenses.GOODS, 3000); assert.equal(r.expenses.RENT, 80000); assert.equal(r.expenses.WAGES, 5000);
  assert.equal(r.expenses.PLATFORM_FEES, 300 + 2800); assert.equal(r.expenses.AFA, 1000);
  assert.equal(r.expenses.totalCents, 3000 + 80000 + 5000 + 3100 + 1000);
  assert.equal(r.profitCents, 12000 - r.expenses.totalCents);
  assert.deepEqual(r.statementCoverage, { LIEFERANDO: { days: 31, of: 31 } });
  assert.ok(!r.warnings.includes('PLATFORM_STATEMENT_GAPS')); assert.ok(!r.warnings.includes('NO_RENT'));
});

test('Abrechnung über Monatsgrenze: Anteil nach Tagen, beide Monate zusammen = ganzer Betrag', () => {
  const st = { periodFrom: '2026-09-27', periodTo: '2026-10-03' };
  assert.equal(EU.overlapShare(st, '2026-10-01', '2026-10-31'), 3 / 7);
  assert.equal(EU.overlapShare(st, '2026-09-01', '2026-09-30'), 4 / 7);
  assert.equal(EU.overlapShare(st, '2026-11-01', '2026-11-30'), 0);
  assert.equal(EU.overlapShare({ periodTo: '2026-10-03' }, '2026-10-01', '2026-10-31'), 1);
  const d = month();
  const sep = EU.buildPeriod(d, '2026-09-01', '2026-09-30').expenses.PLATFORM_FEES, oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31').expenses.PLATFORM_FEES;
  assert.equal(sep + oct, 700 + 2800);
});

test('Lücke in den Abrechnungen → PLATFORM_STATEMENT_GAPS mit Plattform', () => {
  const d = month(); d.platformStatements.pop();
  const r = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.ok(r.warnings.includes('PLATFORM_STATEMENT_GAPS')); assert.deepEqual(r.uncoveredPlatforms, ['LIEFERANDO']);
  assert.deepEqual(r.statementCoverage.LIEFERANDO, { days: 3, of: 31 });
});

test('Leerer Monat: alles 0, Warnungen, kein Absturz', () => {
  const r = EU.buildPeriod(base(), '2026-02-01', '2026-02-28');
  assert.equal(r.income.totalCents, 0); assert.equal(r.expenses.totalCents, 0); assert.equal(r.profitCents, 0);
  assert.ok(r.warnings.includes('NO_PURCHASE_INVOICES')); assert.ok(r.warnings.includes('NO_PAYROLL'));
});

test('Manueller Jahresumsatz nur bei ganzem Jahr; Jahr = Summe der Monate', () => {
  const d = month(); d.settings.accounting.manualRevenueCents = { 2026: 50000 };
  const oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.equal(oct.income.manualCents, 0); assert.ok(oct.warnings.includes('MANUAL_REVENUE_YEARLY_ONLY'));
  const y = EU.build(d, 2026);
  assert.equal(y.year, 2026); assert.equal(y.income.manualCents, 50000);
  let sum = 0; for (let m = 1; m <= 12; m++) { const last = new Date(Date.UTC(2026, m, 0)).getUTCDate(), mm = String(m).padStart(2, '0'); sum += EU.buildPeriod(d, `2026-${mm}-01`, `2026-${mm}-${last}`).profitCents; }
  assert.equal(sum + 50000, y.profitCents);
});

test('Monatsbericht: ersetzt Wochen-Abrechnungen derselben Plattform an seinen Tagen, Woche über Monatsgrenze nur mit Vormonats-Tagen', () => {
  const PS = require('../platform-statement.js');
  const m = PS.normalize({ platform: 'UBER_EATS', documentKind: 'MONTHLY_SUMMARY', periodFrom: '2026-10-01', periodTo: '2026-10-31', grossSales: 5954.14, extraRevenue: 259.53, commissionGross: 760.22, otherFees: 1682.58, payout: 2699.89 });
  assert.equal(m.documentKind, 'MONTHLY_SUMMARY'); assert.equal(m.extraRevenueCents, 25953);
  const d = base({ platformStatements: [
    { ...m },
    { platform: 'UBER_EATS', documentKind: 'SETTLEMENT', periodFrom: '2026-09-28', periodTo: '2026-10-04', commissionGrossCents: 700 }, // 3 Tage Sept + 4 Tage Okt
    { platform: 'UBER_EATS', documentKind: 'SETTLEMENT', periodFrom: '2026-10-05', periodTo: '2026-10-11', commissionGrossCents: 9999 },
    { platform: 'LIEFERANDO', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-10-05', periodTo: '2026-10-11', commissionGrossCents: 500 },
  ] });
  const oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.equal(oct.expenses.PLATFORM_FEES, 76022 + 168258 + 500);
  const sep = EU.buildPeriod(d, '2026-09-01', '2026-09-30');
  assert.equal(sep.expenses.PLATFORM_FEES, 300);
  assert.equal(EU.overlapShare({ periodFrom: '2026-09-28', periodTo: '2026-10-04' }, '2026-09-01', '2026-10-31', new Set()), 1);
});

test('Monatsbericht deckt alle Tage ab → keine PLATFORM_STATEMENT_GAPS', () => {
  const d = base({
    orders: [{ id: 'u1', platform: 'UBER_EATS', placedAt: '2026-10-10T12:00:00Z', totalCents: 1000, status: 'DELIVERED' }],
    platformStatements: [{ platform: 'UBER_EATS', documentKind: 'MONTHLY_SUMMARY', periodFrom: '2026-10-01', periodTo: '2026-10-31', commissionGrossCents: 100 }],
  });
  const r = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.deepEqual(r.statementCoverage.UBER_EATS, { days: 31, of: 31 }); assert.ok(!r.warnings.includes('PLATFORM_STATEMENT_GAPS'));
});

test('Manuelle Monatsausgaben: zählen im Monat (netto+USt), nicht im Folgemonat, im Jahr genau einmal', () => {
  const d = base({ settings: { accounting: { manualExpenses: {
    '2026-10': { RENT: { netCents: 100000, vatCents: 0 }, GOODS: { netCents: 50000, vatCents: 3500 }, WAGES: { netCents: 20000, vatCents: 0 }, BAD: { netCents: 999 }, OTHER: { netCents: -5, vatCents: 0 } },
    'x': { RENT: { netCents: 1 } },
  } } } });
  const oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.equal(oct.expenses.RENT, 100000); assert.equal(oct.expenses.GOODS, 53500); assert.equal(oct.expenses.WAGES, 20000); assert.equal(oct.expenses.OTHER, 0);
  assert.equal(oct.expenses.totalCents, 173500); assert.equal(oct.manualExpenses.vatCents, 3500); assert.deepEqual(oct.manualExpenses.months, ['2026-10']);
  assert.ok(oct.warnings.includes('MANUAL_EXPENSES')); assert.ok(!oct.warnings.includes('NO_PURCHASE_INVOICES')); assert.ok(!oct.warnings.includes('NO_RENT')); assert.ok(!oct.warnings.includes('NO_PAYROLL'));
  assert.equal(EU.buildPeriod(d, '2026-11-01', '2026-11-30').expenses.totalCents, 0);
  assert.equal(EU.buildPeriod(d, '2026-10-15', '2026-10-31').expenses.totalCents, 0); // halber Monat → nicht anteilig, nicht doppelt
  assert.equal(EU.build(d, 2026).expenses.totalCents, 173500);
});

test('Manuelle Ausgaben + Rechnungen im selben Monat → Summe und Hinweis auf Doppelerfassung', () => {
  const d = month(); d.settings.accounting.manualExpenses = { '2026-10': { ENERGY: { netCents: 10000, vatCents: 1900 } } };
  const r = EU.buildPeriod(d, '2026-10-01', '2026-10-31');
  assert.equal(r.expenses.ENERGY, 11900); assert.ok(r.warnings.includes('MANUAL_EXPENSES_WITH_INVOICES'));
});

test('Plattform-Umsatz aus Abrechnungen je Tag: Woche über Monatsgrenze geteilt, Monatsbericht vor Woche, Flamo nur ohne Abrechnung', () => {
  const ord = (pf, day, c) => ({ id: pf + day, platform: pf, placedAt: day + 'T12:00:00Z', totalCents: c, status: 'DELIVERED' });
  const d = base({
    orders: [ord('LIEFERANDO', '2026-10-02', 111), ord('WOLT', '2026-10-05', 777), ord('UBER_EATS', '2026-10-06', 50)],
    platformStatements: [
      { platform: 'LIEFERANDO', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-09-27', periodTo: '2026-10-03', grossCents: 7000 },
      { platform: 'LIEFERANDO', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-10-04', periodTo: '2026-10-31', grossCents: 28000 },
      { platform: 'UBER_EATS', documentKind: 'SETTLEMENT', periodFrom: '2026-10-05', periodTo: '2026-10-11', grossCents: 9999 },
      { platform: 'UBER_EATS', documentKind: 'MONTHLY_SUMMARY', periodFrom: '2026-10-01', periodTo: '2026-10-31', grossCents: 50000 },
    ] });
  const oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31'), sep = EU.buildPeriod(d, '2026-09-01', '2026-09-30');
  assert.equal(oct.income.byPlatform.LIEFERANDO, 3000 + 28000); assert.equal(sep.income.byPlatform.LIEFERANDO, 4000); // 3/7 + 4/7 = ganze Woche
  assert.equal(oct.income.byPlatform.UBER_EATS, 50000); // Monatsbericht schlägt Woche, Flamo-Bestellung nicht doppelt
  assert.equal(oct.income.byPlatform.WOLT, 777); // keine Abrechnung → Flamo
  assert.equal(oct.income.platformCents, 31000 + 50000 + 777); assert.equal(oct.income.incomeSource.LIEFERANDO.statementDays, 31);
});

test('Manueller Monatsumsatz je Plattform ersetzt Abrechnungen nur für seinen ganzen Monat', () => {
  const d = base({ settings: { accounting: { manualIncome: { '2026-10': { LIEFERANDO: 2824197 } } } },
    platformStatements: [{ platform: 'LIEFERANDO', documentKind: 'COMMISSION_INVOICE', periodFrom: '2026-10-25', periodTo: '2026-11-07', grossCents: 14000 }] });
  const oct = EU.buildPeriod(d, '2026-10-01', '2026-10-31'), nov = EU.buildPeriod(d, '2026-11-01', '2026-11-30');
  assert.equal(oct.income.byPlatform.LIEFERANDO, 2824197); assert.equal(oct.income.incomeSource.LIEFERANDO.manualCents, 2824197);
  assert.equal(nov.income.byPlatform.LIEFERANDO, 7000); // nur die Nov-Tage der Abrechnung
  assert.equal(EU.buildPeriod(d, '2026-10-15', '2026-10-31').income.byPlatform.LIEFERANDO, 7000); // halber Monat → kein manueller Wert
  assert.equal(EU.build(d, 2026).income.byPlatform.LIEFERANDO, 2824197 + 7000);
});
