'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const AH = require('../accounting-health.js');
const A = require('../auth.js');

const pay = (id, iso, cents, extra = {}) => ({ id: 'p' + id, orderId: 'o' + id, createdAt: iso, status: 'COMPLETED', amountCents: cents, method: 'CASH', ...extra });
const ord = (id, extra = {}) => ({ id: 'o' + id, source: 'KASSE', ...extra });
const plat = (id, iso, cents, extra = {}) => ({ id: 'l' + id, platform: 'LIEFERANDO', placedAt: iso, totalCents: cents, status: 'DELIVERED', ...extra });
const base = (over = {}) => ({ settings: { accounting: {} }, orders: [], payments: [], fiscalTransactions: [], receipts: [], dayClosings: [], bankTransactions: [], documents: [], journalEntries: [], accountingPeriods: [], ...over });

test('Kleinunternehmer: Kasse + Plattformen + manuell zusammen, Test/Training/Storno nicht', () => {
  const d = base({
    orders: [ord(1), ord(2, { training: true }), ord(3), plat(9, '2026-03-02T14:00:00Z', 2000), plat(10, '2026-03-02T15:00:00Z', 5000, { status: 'CANCELLED' })],
    payments: [pay(1, '2026-03-01T14:00:00Z', 1500), pay(2, '2026-03-01T15:00:00Z', 999), pay(3, '2026-03-01T16:00:00Z', 700, { isTest: true })],
  });
  d.settings.accounting.manualRevenueCents = { 2026: 100000 };
  const k = AH.kleinunternehmer(d, 2026, '2026-06-30');
  assert.equal(k.ownCents, 1500);
  assert.equal(k.platformCents, 2000);
  assert.equal(k.manualCents, 100000);
  assert.equal(k.ytdCents, 103500);
  assert.equal(k.months[2].ownCents, 1500);
  assert.equal(k.months[2].platformCents, 2000);
  assert.equal(k.status, 'OK');
});

test('Kleinunternehmer: Vorjahr > 25.000 € → OVER; KLEIN + USt auf Bons → Konflikt', () => {
  const d = base(); d.settings.accounting = { vatRegime: 'KLEIN', defaultSalesVatRate: 7, manualRevenueCents: { 2025: 3000000 } };
  const k = AH.kleinunternehmer(d, 2026, '2026-11-21');
  assert.equal(k.prevOver, true); assert.equal(k.status, 'OVER'); assert.equal(k.conflict, true); assert.equal(k.vatOnReceipts, true);
});

test('Kleinunternehmer: Hochrechnung und Datum der Grenze', () => {
  const d = base(); d.settings.accounting = { manualRevenueCents: { 2026: 5000000 } }; // 50.000 € bis Ende Juni
  const k = AH.kleinunternehmer(d, 2026, '2026-06-30');
  assert.ok(k.projectedCents > 9800000 && k.projectedCents < 10200000, String(k.projectedCents));
  assert.match(String(k.crossDate), /^2026-12-/);
  assert.equal(k.status, 'WARN');
  const over = AH.kleinunternehmer({ ...d, settings: { accounting: { manualRevenueCents: { 2026: 10000001 } } } }, 2026, '2026-06-30');
  assert.equal(over.crossDate, 'PASSED'); assert.equal(over.status, 'OVER');
});

test('Monatsabschluss: fehlende Tagesabschlüsse, Bank, Belege, Buchungen, Periode', () => {
  const d = base({
    orders: [ord(1), ord(2)],
    payments: [pay(1, '2026-11-02T14:00:00Z', 1000), pay(2, '2026-11-03T14:00:00Z', 1000)],
    dayClosings: [{ day: '2026-11-02', type: 'CLOSING' }, { day: '2026-11-03', type: 'CLOSING', mode: 'TRAINING' }],
    bankTransactions: [{ date: '2026-11-05', status: 'UNMATCHED' }, { date: '2026-10-05', status: 'UNMATCHED' }, { date: '2026-11-06', status: 'MATCHED' }],
    documents: [{ createdAt: '2026-11-07T10:00:00Z', extractionStatus: 'PENDING_REVIEW' }],
    journalEntries: [{ date: '2026-11-08', status: 'DRAFT' }, { date: '2026-11-08', status: 'POSTED' }],
  });
  const m = AH.monthChecklist(d, 2026, 11, '2026-11-21');
  const it = Object.fromEntries(m.items.map(x => [x.key, x]));
  assert.deepEqual(it.closings.days, ['2026-11-03']);
  assert.equal(it.bank.count, 1); assert.equal(it.belege.count, 1); assert.equal(it.journal.count, 1);
  assert.equal(it.tse.count, 2); // keine TSE-Nummer
  assert.equal(it.period.status, 'wait');
  assert.equal(AH.monthChecklist(d, 2026, 10, '2026-11-21').items.find(x => x.key === 'period').status, 'todo');
  d.accountingPeriods.push({ from: '2026-10-01', to: '2026-10-31', status: 'CLOSED' });
  assert.equal(AH.monthChecklist(d, 2026, 10, '2026-11-21').items.find(x => x.key === 'period').status, 'ok');
});

test('Fristen: Wochenende → Montag, drittletzter Bankarbeitstag, USt-VA nur bei Regelbesteuerung', () => {
  assert.equal(AH.thirdLastWorkday(2026, 11).toISOString().slice(0, 10), '2026-11-26'); // 30.11. Mo, 27. Fr, 26. Do
  assert.equal(AH.shiftWeekend(new Date(Date.UTC(2027, 1, 15))).toISOString().slice(0, 10), '2027-02-15');
  assert.equal(AH.shiftWeekend(new Date(Date.UTC(2026, 10, 15))).toISOString().slice(0, 10), '2026-11-16'); // So → Mo
  assert.equal(AH.addMonth('2026-11-13'), '2026-12-13'); assert.equal(AH.addMonth('2027-01-31'), '2027-02-28');
  const klein = AH.deadlines(base({ settings: { accounting: { vatRegime: 'KLEIN' } } }), '2026-11-21');
  assert.ok(!klein.some(x => x.key === 'ustVa'));
  assert.ok(klein.some(x => x.key === 'minijobPay' && x.date === '2026-11-26'));
  const regel = AH.deadlines(base({ settings: { accounting: { vatRegime: 'REGEL', minijob: false } } }), '2026-11-21');
  assert.ok(regel.some(x => x.key === 'ustVa' && x.date === '2027-01-11')); // 10.1.2027 = Sonntag
  assert.ok(!regel.some(x => /^minijob/.test(x.key)));
  for (let i = 1; i < regel.length; i++) assert.ok(regel[i - 1].date <= regel[i].date);
});

test('Fristen: Kassenmeldung einen Monat nach erster echter TSE-Signatur, weg wenn erledigt', () => {
  const d = base({ fiscalTransactions: [{ status: 'SIGNED', simulated: true, createdAt: '2026-11-01T10:00:00Z' }, { status: 'SIGNED', createdAt: '2026-11-13T18:00:00Z' }] });
  const k = AH.deadlines(d, '2026-11-21').find(x => x.key === 'kassenmeldung');
  assert.equal(k.date, '2026-12-13'); assert.equal(k.since, '2026-11-13'); assert.equal(k.overdue, false);
  d.settings.accounting.kassenmeldungDone = true;
  assert.ok(!AH.deadlines(d, '2026-11-21').some(x => x.key === 'kassenmeldung'));
});

test('build: liefert alle drei Teile, nur lesen (Daten unverändert)', () => {
  const d = base({ orders: [ord(1)], payments: [pay(1, '2026-11-02T14:00:00Z', 1000)] }), before = JSON.stringify(d);
  const r = AH.build(d, { today: '2026-11-21' });
  assert.equal(r.ok, true); assert.ok(r.klein && r.month && Array.isArray(r.deadlines));
  assert.equal(r.month.month, 11); assert.equal(JSON.stringify(d), before);
});

test('Rechte und Auslieferung: Seite für Buchhaltung, Modul nicht öffentlich, Route im Server', () => {
  assert.ok(A.PAGE_ROLES['accounting-home.html']);
  assert.equal(A.staticAllowed('accounting-health.js'), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /'\/api\/accounting\/health'/);
});

test('وضع الضريبة غير محدد = Regelbesteuerung افتراضياً: ما في تعارض Klein، وUSt-VA بالمواعيد', () => {
  const d = base({ settings: { accounting: { defaultSalesVatRate: 7 } } });
  const k = AH.kleinunternehmer(d, 2026, '2026-11-23');
  assert.equal(k.regime, 'REGEL'); assert.equal(k.conflict, false);
  assert.equal(AH.deadlines(d, '2026-11-23').some(x => x.key === 'ustVa'), true);
  const kl = AH.kleinunternehmer(base({ settings: { accounting: { vatRegime: 'KLEIN', defaultSalesVatRate: 7 } } }), 2026, '2026-11-23');
  assert.equal(kl.conflict, true);
});
