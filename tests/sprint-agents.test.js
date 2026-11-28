'use strict';
// Sprint 2026-11-28: Agenten — Projekt-Check blockiert den Server nicht mehr, Manager kennt die Küche und rechnet nie selbst,
// Buchhalter-Werkzeuge liefern echte Zahlen (gleiche Rechnung wie die Module), Manager-Seite ohne Schlüssel gesperrt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('Projekt-Check: sofortige Antwort (kein spawnSync-Stau), Ergebnis async und 10 min im Cache', async () => {
  const PT = require('../project-agent-tools.js');
  const t0 = Date.now(); const first = PT.projectHealth();
  assert.ok(Date.now() - t0 < 1500, 'projectHealth() darf den Server nicht blockieren');
  assert.ok(first.pending || typeof first.score === 'number');
  const h = await PT.projectHealthAsync();
  assert.equal(typeof h.score, 'number'); assert.ok(h.files > 50); assert.ok(Array.isArray(h.issues));
  const t1 = Date.now(); assert.equal(await PT.projectHealthAsync(), h); assert.ok(Date.now() - t1 < 50, 'aus dem Cache');
  const src = read('server.js');
  assert.doesNotMatch(src, /agentTools\.projectHealth\(\)/, 'server.js nutzt nur noch projectHealthAsync');
  assert.equal((src.match(/agentTools\.projectHealthAsync\(/g) || []).length, 4);
  assert.doesNotMatch(read('project-agent-tools.js'), /spawnSync\(process\.execPath,\['--check'/);
});

test('Küche für den Manager: offen, zu spät, längste Wartezeit, was jetzt zu kochen ist', () => {
  const K = require('../kitchen.js'), now = Date.parse('2026-11-28T12:00:00Z');
  const mk = (id, min, st, type, items) => ({ id, status: 'OPEN', type, createdAt: new Date(now - min * 60000).toISOString(), preparationMinutes: 20, kitchenStatus: st, kitchenPrintedAt: new Date(now - min * 60000).toISOString(), cart: items.map(([name, quantity]) => ({ name, quantity })) });
  const s = K.kitchenSummary([mk('a', 30, 'NEW', 'delivery', [['Burger', 2]]), mk('b', 5, 'PREPARING', 'pickup', [['Burger', 1], ['Taco', 1]]), mk('c', 2, 'READY', 'local', [['Cola', 1]])], now);
  assert.deepEqual(s.counts, { NEW: 1, PREPARING: 1, READY: 1 });
  assert.equal(s.open, 2); assert.equal(s.late, 1); assert.equal(s.oldestWaitingMin, 30);
  assert.deepEqual(s.toPrepare, [{ name: 'Burger', qty: 3 }, { name: 'Taco', qty: 1 }]);
  assert.deepEqual(s.byType, { delivery: 1, pickup: 1, local: 0 });
});

test('Manager: Werkzeug kitchen_queue, Geld nur über den Buchhalter (nie selbst rechnen)', async () => {
  const MA = require('../manager-agent.js');
  assert.ok(MA.TOOLS.some(t => t.name === 'kitchen_queue'));
  let asked = '';
  const tools = MA.makeTools({ root, kitchen: () => ({ open: 4, late: 1 }), askAccountant: async q => { asked = q; return '1.234,50 €'; } });
  assert.deepEqual(await tools.run('kitchen_queue', {}), { open: 4, late: 1 });
  assert.deepEqual(await tools.run('ask_accountant', { question: 'Umsatz gestern?' }), { answer: '1.234,50 €' });
  assert.equal(asked, 'Umsatz gestern?');
  const p = MA.systemPrompt({ lang: 'ar', today: '2026-11-28' });
  assert.match(p, /ALWAYS call ask_accountant/); assert.match(p, /Never calculate, estimate or invent money amounts/); assert.match(p, /kitchen_queue/);
  assert.match(p, /Levantine\/Shami/);
  // Server reicht die Küchen-Zusammenfassung durch
  assert.match(read('server.js'), /kitchen:\(\)=>\{const d=readAdminData\(\);return kitchenLib\.kitchenSummary\(d\.orders,Date\.now\(\),kitchenLib\.catalogFrom\(d\)\)\}/);
});

test('Buchhalter: Abrechnungen, Bank-Treffer, EÜR, Einkauf, Kassenbuch = echte Zahlen aus denselben Modulen', () => {
  const AA = require('../accounting-agent.js'), EU = require('../euer-draft.js');
  const d = {
    settings: { accounting: { vatRegime: 'REGEL' } }, orders: [], payments: [], fiscalTransactions: [], receipts: [],
    dayClosings: [{ day: '2026-11-20', type: 'CLOSING', number: 'Z-0007', report: { cash: { openingCents: 10000, salesCents: 3000, withdrawalsCents: 500, expectedCents: 12500, countedCents: 12450, differenceCents: -50 } } }],
    suppliers: [{ id: 's1', name: 'Fleisch Müller' }],
    invoices: [{ id: 'i1', supplierId: 's1', invoiceNumber: 'RE-100', invoiceDate: '2026-11-10', totalAmountCents: 10700, vatAmountCents: 700, status: 'APPROVED', createdAt: '2026-11-10T09:00:00Z', lineItems: [{ originalDescription: 'Rinderhack 5kg', quantity: 1, lineTotal: 100, vatRate: 7 }] }],
    platformStatements: [{ id: 'ps1', platform: 'LIEFERANDO', documentKind: 'SETTLEMENT', periodFrom: '2026-11-16', periodTo: '2026-11-22', grossCents: 107000, commissionGrossCents: 11900, payoutCents: 95100 }],
    bankTransactions: [{ id: 'b1', date: '2026-11-25', amountCents: 95100, description: 'Takeaway.com Payments', status: 'UNMATCHED' }],
    inventoryItems: [], purchasePriceHistory: [], chartOfAccounts: [], journalEntries: [], documents: [], cashbooks: [], accountingPeriods: [],
  };
  const T = AA.makeTools(d, { today: '2026-11-26' });
  const ps = T.run('platform_statements', {}); assert.equal(ps.count, 1); assert.equal(ps.statements[0].payoutCents, 95100);
  const bs = T.run('bank_suggestions', {}); assert.equal(bs.suggestions[0].candidates[0].entityId, 'ps1'); assert.equal(bs.suggestions[0].candidates[0].confidence, 'high');
  const eu = T.run('euer_draft', { year: 2026 }), ref = EU.build(d, 2026);
  assert.equal(eu.profitCents, ref.profitCents); assert.equal(eu.income.totalCents, ref.income.totalCents); assert.equal(eu.vat.payableCents, ref.vat.payableCents);
  assert.equal(eu.income.totalCents, 100000); assert.equal(eu.profitCents, 100000 - 10000 - 10000);
  const pu = T.run('purchases', { month: '2026-11' }); assert.equal(pu.current.totals.MEAT, 10000); assert.equal(pu.current.invoices, 1);
  const kb = T.run('kassenbuch', { month: '2026-11' });
  assert.equal(kb.rows[0].salesCents, 3000); assert.equal(kb.rows[0].differenceCents, -50); assert.equal(kb.totals.withdrawalsCents, 500);
  assert.ok(Array.isArray(T.run('anomalies', {}).items));
  assert.equal(T.run('dish_costs', {}).count, 0);
  const p = AA.systemPrompt({ lang: 'ar', today: '2026-11-26', regime: 'REGEL' });
  assert.match(p, /never round, estimate or extrapolate/); assert.match(p, /Call the restaurant Flamo/); assert.match(p, /Levantine\/Shami/);
});

test('Manager-Seite: ohne KI-Schlüssel sind Eingabe und Vorschläge gesperrt, Budget sichtbar', () => {
  const h = read('manager.html');
  assert.match(h, /const noKey=!!\(status&&!status\.configured\);/);
  assert.match(h, /\$\('q'\)\.disabled=noKey;\$\('send'\)\.disabled=noKey\|\|busy;/);
  assert.match(h, /status\.budgetEur\?' \/ '\+Number\(status\.budgetEur\)\.toFixed\(2\)\+' €'/);
});
