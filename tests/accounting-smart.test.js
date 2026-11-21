'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const AN = require('../accounting-anomalies.js');
const BM = require('../bank-match.js');
const BA = require('../bank-ai.js');
const AW = require('../accounting-weekly.js');

const base = (o = {}) => ({ settings: { accounting: {} }, orders: [], payments: [], invoices: [], suppliers: [], purchasePriceHistory: [], inventoryItems: [], dayClosings: [], bankTransactions: [], documents: [], salesInvoices: [], fiscalTransactions: [], receipts: [], journalEntries: [], accountingPeriods: [], ...o });

test('Auffälligkeiten: doppelte Rechnung, Preissprung, Kassendifferenz, alte Bank, ohne Beleg, Klein+USt', () => {
  const d = base({
    suppliers: [{ id: 's1', name: 'Müller' }],
    invoices: [{ id: 'i1', supplierId: 's1', invoiceNumber: 'R1', invoiceDate: '2026-11-10', totalAmount: 100, status: 'POSTED', documentId: 'd1' }, { id: 'i2', supplierId: 's1', invoiceNumber: 'R1', invoiceDate: '2026-11-11', totalAmount: 100, status: 'DRAFT' }, { id: 'i3', supplierId: 's1', invoiceNumber: 'R2', invoiceDate: '2026-11-12', totalAmount: 50, status: 'POSTED' }],
    documents: [{ id: 'd1' }],
    inventoryItems: [{ id: 'v1', name: 'Hack' }],
    purchasePriceHistory: [{ inventoryItemId: 'v1', unitPrice: 10, createdAt: '2026-10-01T10:00:00Z' }, { inventoryItemId: 'v1', unitPrice: 12.5, createdAt: '2026-11-10T10:00:00Z', supplierId: 's1' }, { inventoryItemId: 'v1', unitPrice: 12.6, createdAt: '2026-11-15T10:00:00Z' }],
    dayClosings: [{ id: 'z1', day: '2026-11-15', type: 'CLOSING', number: 'Z-1', report: { cash: { differenceCents: -1500 } } }, { day: '2026-11-16', type: 'CLOSING', report: { cash: { differenceCents: 0 } } }, { day: '2026-11-16', type: 'CLOSING', mode: 'TRAINING', report: { cash: { differenceCents: 999 } } }],
    bankTransactions: [{ date: '2026-09-01', amountCents: -500, status: 'UNMATCHED' }, { date: '2026-11-20', amountCents: -500, status: 'UNMATCHED' }],
  });
  d.settings.accounting = { vatRegime: 'KLEIN', defaultSalesVatRate: 7 };
  const a = AN.detect(d, { today: '2026-11-21' }), types = a.map(x => x.type);
  assert.equal(a[0].type, 'VAT_ON_KLEIN');
  assert.equal(a.filter(x => x.type === 'DUP_INVOICE').length, 1);
  const pj = a.filter(x => x.type === 'PRICE_JUMP'); assert.equal(pj.length, 1); assert.equal(pj[0].changePct, 25); assert.equal(pj[0].item, 'Hack');
  const cd = a.filter(x => x.type === 'CASH_DIFF'); assert.equal(cd.length, 1); assert.equal(cd[0].level, 'warn');
  assert.equal(a.find(x => x.type === 'OLD_UNMATCHED').count, 1);
  assert.deepEqual(a.filter(x => x.type === 'NO_DOCUMENT').map(x => x.ref), ['i3']);
  assert.ok(!types.includes('LOW_SALES_DAY'));
});

test('Auffälligkeiten: schwacher Umsatztag im Vergleich zu den Vorwochen', () => {
  const orders = [], payments = []; let n = 0;
  const add = (day, cents) => { n++; orders.push({ id: 'o' + n }); payments.push({ id: 'p' + n, orderId: 'o' + n, createdAt: day + 'T14:00:00Z', status: 'COMPLETED', amountCents: cents }); };
  for (const d of ['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13']) add(d, 50000);
  add('2026-11-20', 10000);
  const a = AN.detect(base({ orders, payments }), { today: '2026-11-21' }).filter(x => x.type === 'LOW_SALES_DAY');
  assert.equal(a.length, 1); assert.equal(a[0].date, '2026-11-20'); assert.equal(a[0].usualCents, 50000);
});

test('Bank-Vorschläge: Rechnung nach Betrag/Name/Nummer, Plattform-Auszahlung, Lohn, bereits genutzte nicht', () => {
  const d = base({
    suppliers: [{ id: 's1', name: 'Fleischerei Müller GmbH' }, { id: 's2', name: 'Bäcker' }],
    invoices: [{ id: 'i1', supplierId: 's1', invoiceNumber: 'RE-100', invoiceDate: '2026-11-08', totalAmount: 250.5 }, { id: 'i2', supplierId: 's2', invoiceNumber: 'X', invoiceDate: '2026-11-09', totalCents: 25050 }, { id: 'i3', supplierId: 's2', invoiceDate: '2026-11-09', totalCents: 9900 }],
    bankTransactions: [
      { id: 'b1', date: '2026-11-12', amountCents: -25050, description: 'FLEISCHEREI MUELLER', reference: 'RE-100', status: 'UNMATCHED' },
      { id: 'b2', date: '2026-11-13', amountCents: 123456, description: 'Takeaway.com Payments', status: 'UNMATCHED' },
      { id: 'b3', date: '2026-11-28', amountCents: -60300, description: 'Minijob-Zentrale Beitrag', status: 'UNMATCHED' },
      { id: 'b4', date: '2026-11-14', amountCents: -9900, description: 'Bäcker', status: 'UNMATCHED' },
      { id: 'b5', date: '2026-11-01', amountCents: -9900, description: 'alt', status: 'MATCHED', matchedEntityType: 'INVOICE', matchedEntityId: 'i3' },
    ],
  });
  const s = new Map(BM.suggest(d).map(x => [x.transactionId, x.candidates]));
  assert.equal(s.get('b1')[0].entityId, 'i1'); assert.equal(s.get('b1')[0].confidence, 'high'); assert.equal(s.get('b1').length, 2);
  assert.equal(s.get('b2')[0].entityType, 'PLATFORM_PAYOUT'); assert.match(s.get('b2')[0].entityId, /^LIEFERANDO:/);
  assert.equal(s.get('b3')[0].entityType, 'PAYROLL');
  assert.ok(!s.has('b4'), 'i3 ist schon abgeglichen');
});

test('Bank-Duplikate: gleiches Datum+Betrag+Text = doppelt, auch innerhalb des Imports', () => {
  const r = BM.markDuplicates([{ date: '2026-11-01', amountCents: -500, description: 'Telekom  Rechnung' }], [{ date: '2026-11-01', amountCents: -500, description: 'telekom rechnung' }, { date: '2026-11-02', amountCents: 100, description: 'a' }, { date: '2026-11-02', amountCents: 100, description: 'a' }]);
  assert.deepEqual(r.map(x => x.duplicate), [true, false, true]);
});

test('Kontoauszug KI: Normalisieren + Saldenprüfung, Claude-Anfrage mit erzwungenem Tool', async () => {
  const n = BA.normalize({ openingBalance: 100, closingBalance: 80.5, ibanLast4: 'DE12 3456', transactions: [{ date: '2026-11-02', amount: -20, description: 'X' }, { date: '2026-11-03', amount: 0.5, description: 'Y' }, { date: 'kaputt', amount: 1, description: 'Z' }] });
  assert.equal(n.balanceCheck, 'OK'); assert.equal(n.transactions.length, 2); assert.equal(n.invalidCount, 1); assert.equal(n.ibanLast4, '3456'); assert.equal(n.transactions[0].amountCents, -2000);
  assert.equal(BA.normalize({ openingBalance: 1, closingBalance: 5, transactions: [] }).balanceCheck, 'MISMATCH');
  let body;
  const r = await BA.extractStatement({ files: ['QQ=='], mimeTypes: ['application/pdf'] }, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async (u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'save_statement', input: { transactions: [{ date: '2026-11-02', amount: 10, description: 'A' }] } }] }) }; } });
  assert.equal(body.tool_choice.name, 'save_statement'); assert.equal(body.messages[0].content[0].type, 'document'); assert.equal(r.transactions[0].amountCents, 1000);
  await assert.rejects(BA.extractStatement({ files: ['x'], mimeTypes: ['image/png'] }, { env: {} }), e => e.code === 'NO_AI_KEY');
});

test('Wochenbericht: Fälligkeit Montag 9 Uhr, Text mit Umsatz, Plattformen, Fristen', async () => {
  assert.equal(AW.dueWeekEnd(Date.parse('2026-11-23T07:30:00Z')), '2026-11-15'); // Mo 08:30 Berlin → noch Vorwoche-davor
  assert.equal(AW.dueWeekEnd(Date.parse('2026-11-23T08:30:00Z')), '2026-11-22'); // Mo 09:30 Berlin
  assert.equal(AW.dueWeekEnd(Date.parse('2026-11-21T12:00:00Z')), '2026-11-15'); // Samstag
  const d = base({ orders: [{ id: 'o1' }, { id: 'l1', platform: 'LIEFERANDO', placedAt: '2026-11-18T15:00:00Z', totalCents: 3000, status: 'DELIVERED' }], payments: [{ id: 'p1', orderId: 'o1', createdAt: '2026-11-17T14:00:00Z', status: 'COMPLETED', amountCents: 2000 }], invoices: [{ invoiceDate: '2026-11-18', supplierName: 'Müller', totalAmount: 40 }] });
  const c = AW.compose(d, '2026-11-22');
  assert.match(c.text, /16\.11\.2026 – 22\.11\.2026/); assert.match(c.text, /50,00 €/); assert.match(c.text, /Lieferando: 30,00 €/); assert.match(c.text, /Müller: 40,00 €/); assert.equal(c.totalCents, 5000);
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path'), file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-')), 's.json');
  const sent = []; const alerts = { send: async (k, t) => { sent.push(k); return { sent: true }; } };
  const now = Date.parse('2026-11-23T08:30:00Z');
  assert.equal((await AW.tick({ readData: () => d, alerts, file, now })).reason, 'first-run');
  assert.equal((await AW.tick({ readData: () => d, alerts, file, now: now + 7 * 86400000 })).sent, true);
  assert.equal((await AW.tick({ readData: () => d, alerts, file, now: now + 7 * 86400000 + 60000 })).reason, 'done');
  assert.equal(sent.length, 1);
});

test('Plattform-Abrechnung: Normalisieren, Vergleich mit Flamo (Loco getrennt), Claude-Anfrage', async () => {
  const PS = require('../platform-statement.js');
  const st = PS.normalize({ platform: 'LIEFERANDO', documentKind: 'SETTLEMENT', periodFrom: '2026-11-01', periodTo: '2026-11-07', ordersCount: 2, grossSales: 55, commissionNet: 10, commissionVat: 1.9, otherFees: 1, payout: 42.1 });
  assert.equal(st.commissionGrossCents, 1190); assert.equal(st.grossCents, 5500);
  const d = { orders: [
    { id: 'a', platform: 'LIEFERANDO', placedAt: '2026-11-02T15:00:00Z', totalCents: 2500, status: 'DELIVERED' },
    { id: 'b', platform: 'LIEFERANDO', placedAt: '2026-11-03T15:00:00Z', totalCents: 3000, status: 'DELIVERED' },
    { id: 'c', platform: 'LIEFERANDO', placedAt: '2026-11-03T16:00:00Z', totalCents: 4000, status: 'DELIVERED', brand: 'Loco Chicken' },
    { id: 'x', platform: 'LIEFERANDO', placedAt: '2026-11-04T16:00:00Z', totalCents: 9000, status: 'CANCELLED' },
  ], payments: [] };
  const c = PS.compare(d, st); assert.equal(c.ok, true); assert.equal(c.flamoCount, 2); assert.equal(c.feeSharePct, 23.5);
  const loco = PS.compare(d, { ...st, platform: 'SIDES', ordersCount: 1, grossCents: 4000 }); assert.equal(loco.ok, true); assert.equal(loco.flamoCount, 1);
  const bad = PS.compare(d, { ...st, ordersCount: 3, grossCents: 8000 }); assert.equal(bad.ok, false); assert.equal(bad.diffCount, 1); assert.equal(bad.diffCents, 2500);
  assert.equal(PS.compare(d, { ...st, periodFrom: null }).possible, false);
  let body; const r = await PS.read({ files: ['QQ=='], mimeTypes: ['application/pdf'] }, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async (u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'save_platform_statement', input: { platform: 'UBER_EATS', documentKind: 'SETTLEMENT', payout: 12 } }] }) }; } });
  assert.equal(body.tool_choice.name, 'save_platform_statement'); assert.equal(r.platform, 'UBER_EATS'); assert.equal(r.payoutCents, 1200);
});

test('EÜR-Entwurf: Einnahmen Kasse+Plattform+manuell, Ausgaben kategorisiert, Plattformgebühren aus Abrechnung, AfA, Warnungen', () => {
  const EU = require('../euer-draft.js');
  const d = {
    settings: { accounting: { vatRegime: 'KLEIN', manualRevenueCents: { 2026: 100000 }, supplierCategories: { s3: 'EQUIPMENT_SMALL' } } },
    orders: [{ id: 'o1' }, { id: 'l1', platform: 'UBER', placedAt: '2026-05-01T15:00:00Z', totalCents: 3000, status: 'DELIVERED' }],
    payments: [{ id: 'p1', orderId: 'o1', createdAt: '2026-05-01T14:00:00Z', status: 'COMPLETED', amountCents: 2000 }],
    suppliers: [{ id: 's1', name: 'Fleisch Müller' }, { id: 's2', name: 'EWE Energie' }, { id: 's3', name: 'Metro' }],
    invoices: [
      { supplierId: 's1', invoiceDate: '2026-03-01', totalAmount: 100, status: 'POSTED', lineItems: [{}] },
      { supplierId: 's2', invoiceDate: '2026-03-01', totalCents: 5000, status: 'POSTED' },
      { supplierId: 's3', invoiceDate: '2026-04-01', totalCents: 7000, status: 'POSTED' },
      { supplierId: 's1', invoiceDate: '2026-04-01', totalCents: 99999, status: 'DRAFT' },
      { supplierId: 's1', invoiceDate: '2025-12-31', totalCents: 99999, status: 'POSTED' },
    ],
    platformStatements: [{ platform: 'UBER_EATS', periodTo: '2026-05-31', commissionGrossCents: 900, otherFeesCents: 100 }],
    payrollPayments: [{ date: '2026-05-02', amountCents: 50000 }],
    fixedAssets: [{ status: 'ACTIVE', purchaseDate: '2026-11-01', usefulLifeMonths: 36, monthlyDepreciationCents: 1000 }],
  };
  const r = EU.build(d, 2026);
  assert.equal(r.income.totalCents, 105000); assert.equal(r.income.platformCents, 3000);
  assert.equal(r.expenses.GOODS, 10000); assert.equal(r.expenses.ENERGY, 5000); assert.equal(r.expenses.EQUIPMENT_SMALL, 7000);
  assert.equal(r.expenses.PLATFORM_FEES, 1000); assert.equal(r.expenses.WAGES, 50000); assert.equal(r.expenses.AFA, 2000);
  assert.equal(r.expenses.totalCents, 75000); assert.equal(r.profitCents, 30000);
  assert.ok(r.warnings.includes('CATEGORIES_GUESSED')); assert.ok(r.warnings.includes('NO_RENT')); assert.ok(!r.warnings.includes('NO_PLATFORM_FEES'));
});

test('Wareneinsatz pro Gericht: Rezept × letzter Preis, Marge, fehlende Preise markiert', () => {
  const DC = require('../dish-cost.js');
  const d = { inventoryItems: [{ id: 'v1', name: 'Hack', baseUnit: 'g' }, { id: 'v2', name: 'Brot', baseUnit: 'Stk' }, { id: 'v3', name: 'Käse', baseUnit: 'g' }],
    purchasePriceHistory: [{ inventoryItemId: 'v1', unitPrice: 0.01, createdAt: '2026-10-01' }, { inventoryItemId: 'v1', unitPrice: 0.012, createdAt: '2026-11-01' }, { inventoryItemId: 'v2', unitPrice: 0.5, createdAt: '2026-11-01' }],
    products: [{ id: 'm1', name: 'Burger', priceCents: 990 }],
    recipes: [{ productId: 'm1', status: 'ACTIVE', ingredientLines: [{ inventoryItemId: 'v1', quantity: 150 }, { inventoryItemId: 'v2', quantity: 1 }, { inventoryItemId: 'v3', quantity: 20 }] }] };
  const r = DC.build(d); const b = r.dishes[0];
  assert.equal(b.costCents, 230); assert.equal(b.marginCents, 760); assert.equal(b.costSharePct, 23.2); assert.equal(b.complete, false); assert.deepEqual(b.missing, ['Käse']);
  assert.equal(DC.build(d, { query: 'pizza' }).count, 0);
});
