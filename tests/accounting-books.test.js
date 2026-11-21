'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const PC = require('../purchase-categories.js');
const SP = require('../sales-posting.js');
const KB = require('../kassenbuch.js');
const AN = require('../accounting-anomalies.js');
const AX = require('../accounting-export.js');

test('Warengruppen: Regeln, manuelle Zuordnung (Artikel > Text), Vormonat, unkategorisiert', () => {
  for (const [t, c] of [['Rinderhackfleisch 80/20', 'MEAT'], ['Brioche Buns 12 Stk', 'BREAD'], ['Eisbergsalat', 'VEG'], ['Cheddar Scheiben', 'CHEESE'], ['Joppie Sauce 1L', 'SAUCE'], ['Pommes Crinkle TK 2,5kg', 'FROZEN'], ['Coca-Cola 0,33 l', 'DRINKS'], ['Frittieröl 10L', 'OIL'], ['Burgerbox Kraft 500 Stk', 'PACKAGING'], ['Spülmittel', 'CLEANING'], ['Mozzarella Sticks TK', 'FROZEN'], ['Irgendwas', null]]) assert.equal(PC.ruleCat(t), c, t);
  const d = {
    settings: { accounting: { purchaseCategoryOverrides: { 'mystery box': 'PACKAGING' } } },
    inventoryItems: [{ id: 'v1', name: 'Spezial', purchaseCategory: 'MEAT' }],
    suppliers: [{ id: 's1', name: 'Metro' }],
    invoices: [
      { supplierId: 's1', invoiceDate: '2026-11-05', status: 'POSTED', lineItems: [{ originalDescription: 'Rinderhack', quantity: 10, unitPrice: 8, lineTotal: 80 }, { originalDescription: 'Spezialware', inventoryItemId: 'v1', lineTotal: 20 }, { originalDescription: 'Mystery Box', lineTotal: 5 }, { originalDescription: 'Unbekannt XY', lineTotal: 3 }] },
      { supplierId: 's1', invoiceDate: '2026-10-05', status: 'POSTED', lineItems: [{ originalDescription: 'Rinderhack', lineTotal: 50 }] },
      { supplierId: 's1', invoiceDate: '2026-11-06', status: 'DRAFT', lineItems: [{ originalDescription: 'Rinderhack', lineTotal: 999 }] },
    ],
  };
  const r = PC.build(d, { year: 2026, month: 11 });
  assert.equal(r.current.totals.MEAT, 10000); assert.equal(r.current.totals.PACKAGING, 500); assert.equal(r.current.totals.OTHER, 300);
  assert.equal(r.changePct.MEAT, 100); assert.equal(r.current.invoices, 1); assert.equal(r.current.uncategorized[0].description, 'Unbekannt XY');
  assert.equal(r.current.top[0].name, 'Rinderhack');
});

test('Umsatz-Buchung: bar/Karte/online getrennt, Plattform als Tagessumme, Klein = 4100 ohne USt, keine Doppelten, kein Test', () => {
  const ids = n => 'acc' + n;
  const d = {
    orders: [{ id: 'o1', source: 'KASSE' }, { id: 'o2', source: 'WEB' }, { id: 'o3', training: true }, { id: 'l1', platform: 'LIEFERANDO', placedAt: '2026-11-20T15:00:00Z', totalCents: 2500, status: 'DELIVERED' }, { id: 'l2', platform: 'LIEFERANDO', placedAt: '2026-11-20T16:00:00Z', totalCents: 1500, status: 'DELIVERED' }, { id: 'l3', platform: 'LIEFERANDO', placedAt: '2026-11-20T17:00:00Z', totalCents: 900, status: 'CANCELLED' }],
    payments: [
      { id: 'p1', orderId: 'o1', createdAt: '2026-11-20T14:00:00Z', status: 'COMPLETED', amountCents: 2000, paymentLines: [{ method: 'CASH', amountCents: 1200 }, { method: 'CARD', amountCents: 800 }] },
      { id: 'p2', orderId: 'o2', createdAt: '2026-11-20T14:30:00Z', status: 'COMPLETED', amountCents: 1500, method: 'TRANSFER' },
      { id: 'p3', orderId: 'o3', createdAt: '2026-11-20T15:00:00Z', status: 'COMPLETED', amountCents: 999, method: 'CASH' },
      { id: 'p4', orderId: 'o1', createdAt: '2026-11-20T15:00:00Z', status: 'COMPLETED', amountCents: 500, method: 'CASH', isTest: true },
    ],
  };
  const e = SP.build(d, { regime: 'KLEIN', accountId: ids });
  assert.equal(e.length, 3);
  const p1 = e.find(x => x.sourceRef === 'PAYMENT:p1');
  assert.deepEqual(p1.lines.map(l => [l.accountId, l.debitCents, l.creditCents]), [['acc1000', 1200, 0], ['acc1365', 800, 0], ['acc4100', 0, 2000]]);
  assert.equal(e.find(x => x.sourceRef === 'PAYMENT:p2').lines[0].accountId, 'acc1200');
  const pl = e.find(x => x.sourceRef.startsWith('PLATFORM_DAY:2026-11-20:LIEFERANDO')); assert.equal(pl.lines[0].debitCents, 4000); assert.equal(pl.lines[0].accountId, 'acc1360');
  assert.equal(SP.build(d, { regime: 'KLEIN', accountId: ids, existingRefs: new Set(e.map(x => x.sourceRef)) }).length, 0);
  const r = SP.build({ ...d, payments: [{ id: 'p9', orderId: 'o1', createdAt: '2026-11-20T14:00:00Z', status: 'COMPLETED', amountCents: 1070, method: 'CARD', vatAmountCents: 70 }], orders: [{ id: 'o1' }] }, { regime: 'REGEL', accountId: ids });
  assert.deepEqual(r[0].lines.map(l => [l.accountId, l.debitCents, l.creditCents]), [['acc1365', 1070, 0], ['acc4000', 0, 1000], ['acc1570', 0, 70]]);
});

test('Kassenbuch: aus Tagesabschlüssen, fehlende Tage, CSV', () => {
  const d = { dayClosings: [{ day: '2026-11-02', type: 'CLOSING', number: 'Z-1', report: { cash: { openingCents: 10000, salesCents: 30000, expectedCents: 40000, countedCents: 39900, differenceCents: -100, takeOutCents: 29900, leaveCents: 10000 } } }, { day: '2026-11-03', type: 'CLOSING', mode: 'TRAINING', report: { cash: {} } }],
    orders: [{ id: 'o1' }, { id: 'o2' }], payments: [{ id: 'p1', orderId: 'o1', createdAt: '2026-11-02T14:00:00Z', status: 'COMPLETED' }, { id: 'p2', orderId: 'o2', createdAt: '2026-11-03T14:00:00Z', status: 'COMPLETED' }] };
  const k = KB.build(d, { year: 2026, month: 11 });
  assert.equal(k.rows.length, 1); assert.equal(k.totals.differenceCents, -100); assert.deepEqual(k.missingDays, ['2026-11-03']); assert.equal(k.closingCents, 10000);
  const c = KB.csv(k); assert.match(c, /^﻿Datum;Z-Nr;/); assert.match(c, /2026-11-02;Z-1;100,00;300,00/);
});

test('Feste Kosten: Warnung wenn nach Fälligkeit+5 Tage weder Rechnung noch Abbuchung', () => {
  const d = { settings: { accounting: { fixedCosts: [{ name: 'Miete', match: 'vermieter', day: 1 }, { name: 'Telekom', match: 'telekom', day: 3 }, { name: 'Strom', match: 'logo', day: 25 }] } },
    invoices: [{ supplierName: 'Telekom Deutschland', invoiceDate: '2026-11-04', totalCents: 4990 }, { supplierName: 'Telekom Deutschland', invoiceDate: '2026-10-04', totalCents: 4990 }],
    bankTransactions: [{ date: '2026-10-01', amountCents: -90000, description: 'Vermieter Müller Miete', status: 'MATCHED' }, { date: '2026-10-26', amountCents: -12000, description: 'LOGO Energie', status: 'MATCHED' }] };
  const a = AN.detect(d, { today: '2026-11-21' }).filter(x => x.type === 'FIXED_COST_MISSING');
  assert.deepEqual(a.map(x => x.name + ':' + x.month), ['Miete:2026-11']);
});

test('DATEV-Standardprofil: SKR03-Vorschlag, eigene Profile unverändert', () => {
  assert.equal(AX.normalizeProfile(null).accountMap['4100'], '8195');
  assert.equal(AX.normalizeProfile(null).accountMap['1000'], '1000');
  assert.deepEqual(AX.normalizeProfile({ accountMap: {} }).accountMap, {});
});
