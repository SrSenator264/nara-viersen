'use strict';
// Sprint 2026-11-28: einfache Buchhaltung — Kategorien raten, Bank-Treffer mit Plattform-Abrechnung, GuV-Gleichung geht auf.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const E = require('../euer-draft.js'), BM = require('../bank-match.js'), BC = require('../bank-category.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cat = n => E.categorize(n, {}, {}).cat;

test('Kategorien raten: Lebensmittel-Lieferanten = Waren, «Gastro»/«Brewery» nicht mehr Energie', () => {
  for (const n of ['MELEDI GmbH', 'Bäckerei Schmitz', 'Baeckerei Schmitz', 'Gastro-Großhandel Müller', 'Getränke Hoffmann', 'Metro Cash & Carry', 'Metzgerei Krüger']) assert.equal(cat(n), 'GOODS', n);
  assert.equal(cat('Stadtwerke Viersen'), 'ENERGY'); assert.equal(cat('Erdgas Nord'), 'ENERGY');
  assert.notEqual(cat('Brewery Pils'), 'ENERGY'); assert.notEqual(cat('Mineralwasser Kontor'), 'ENERGY');
  assert.equal(cat('Hausverwaltung Klein'), 'RENT'); assert.equal(cat('Unbekannt GmbH'), 'OTHER');
  // Bank-Kategorie nutzt dieselbe Idee
  assert.equal(BC.suggest({ id: 'x', date: '2026-11-15', amountCents: -8640, description: 'Bäckerei Schmitz', status: 'UNMATCHED' }).category, 'GOODS');
});

test('Bank: Plattform-Auszahlung trifft die gespeicherte Abrechnung (sicher), allgemeiner Vorschlag nur noch Reserve', () => {
  const data = {
    platformStatements: [{ id: 'ps1', platform: 'LIEFERANDO', documentKind: 'SETTLEMENT', periodFrom: '2026-11-16', periodTo: '2026-11-22', payoutCents: 106167 }],
    bankTransactions: [{ id: 'b1', date: '2026-11-25', amountCents: 106167, description: 'Takeaway.com Payments B.V.', status: 'UNMATCHED' },
      { id: 'b2', date: '2026-11-26', amountCents: 5000, description: 'Takeaway.com Payments B.V.', status: 'UNMATCHED' }],
  };
  const s = new Map(BM.suggest(data).map(x => [x.transactionId, x.candidates]));
  assert.equal(s.get('b1')[0].entityType, 'PLATFORM_STATEMENT'); assert.equal(s.get('b1')[0].entityId, 'ps1'); assert.equal(s.get('b1')[0].confidence, 'high');
  assert.equal(s.get('b2')[0].entityType, 'PLATFORM_PAYOUT'); // anderer Betrag → keine Abrechnung, wie bisher
  // schon verbundene Abrechnung wird nicht nochmal vorgeschlagen
  data.bankTransactions.push({ id: 'b0', date: '2026-11-24', amountCents: 106167, description: 'x', status: 'MATCHED', matchedEntityType: 'PLATFORM_STATEMENT', matchedEntityId: 'ps1' });
  assert.notEqual(new Map(BM.suggest(data).map(x => [x.transactionId, x.candidates])).get('b1')[0].entityType, 'PLATFORM_STATEMENT');
  // verbunden mit Abrechnung → Kategorie Plattform-Auszahlung
  assert.equal(BC.suggest({ id: 'b9', amountCents: 1, description: '', status: 'MATCHED', matchedEntityType: 'PLATFORM_STATEMENT' }).category, 'PLATFORM_PAYOUT');
});

test('Bank: zwei fast gleich gute Vorschläge = nicht «sicher» (kein Massen-Bestätigen bei Gleichstand)', () => {
  const data = {
    suppliers: [{ id: 's1', name: 'Meledi GmbH' }],
    invoices: [{ id: 'i1', supplierId: 's1', invoiceDate: '2026-11-10', totalCents: 5000, invoiceNumber: 'A-1' }, { id: 'i2', supplierId: 's1', invoiceDate: '2026-11-10', totalCents: 5000, invoiceNumber: 'A-2' }],
    bankTransactions: [{ id: 'b1', date: '2026-11-11', amountCents: -5000, description: 'MELEDI GMBH', status: 'UNMATCHED' }],
  };
  const c = BM.suggest(data)[0].candidates;
  assert.equal(c.length, 2); assert.notEqual(c[0].confidence, 'high');
});

test('GuV-Gleichung: Einnahmen − Waren − Personal − Sonstiges − AfA = Gewinn (aus den Einzelposten)', () => {
  const data = {
    settings: { accounting: { vatRegime: 'REGEL' } }, orders: [], suppliers: [{ id: 's1', name: 'MELEDI GmbH' }],
    invoices: [{ id: 'i1', supplierId: 's1', invoiceDate: '2026-11-10', status: 'APPROVED', createdAt: '2026-11-10T09:00:00Z', totalAmountCents: 10700, vatAmountCents: 700 }],
    platformStatements: [{ id: 'p1', platform: 'LIEFERANDO', documentKind: 'SETTLEMENT', periodFrom: '2026-11-01', periodTo: '2026-11-30', grossCents: 107000, commissionGrossCents: 11900, payoutCents: 95100 }],
  };
  const r = E.buildPeriod(data, '2026-11-01', '2026-11-30'), ex = r.expenses;
  const other = E.CATS.filter(c => !['GOODS', 'WAGES'].includes(c)).reduce((s, c) => s + (ex[c] || 0), 0);
  assert.equal(r.income.totalCents - ex.GOODS - ex.WAGES - other - ex.AFA, r.profitCents);
  assert.equal(ex.GOODS, 10000, 'Rechnung netto als Ware');
  assert.equal(r.income.totalCents, 100000, '1.070 € brutto / 1,07');
  // reports.js zeigt dieselbe Gleichung und prüft sie sichtbar
  const js = read('reports.js');
  assert.match(js, /function simpleModel\(r\)/); assert.match(js, /eqCheck:\{de:'Rechnung geht auf ✓'/);
});

test('Buchhaltung-Start: 3 Schritte sichtbar und nur lesend (keine POST-Aufrufe)', () => {
  const h = read('accounting-home.html');
  assert.match(h, /id="c-steps"/);
  const steps = h.slice(h.indexOf('/* 3 Schritte (Sprint'), h.indexOf('flamo-home.js'));
  assert.ok(steps.length > 500);
  assert.doesNotMatch(steps, /method:\s*'POST'/);
  for (const k of ["s1:'Wie stehen wir?'", "s1:'شو وضعنا؟'", "s1:'Where do we stand?'"]) assert.ok(h.includes(k), k);
});
