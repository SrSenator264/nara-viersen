'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const AA = require('../accounting-agent.js');
const IP = require('../invoice-extraction-provider.js');
const A = require('../auth.js');

const data = () => ({
  settings: { accounting: { vatRegime: 'KLEIN' } },
  orders: [{ id: 'o1', displayCode: 'K-7', source: 'KASSE', cart: [{ name: 'Burger', quantity: 2, totalCents: 1800 }] }, { id: 'o2', platform: 'LIEFERANDO', placedAt: '2026-11-20T15:00:00Z', totalCents: 2500, externalOrderCode: 'LF123', status: 'DELIVERED' }],
  payments: [{ id: 'p1', orderId: 'o1', createdAt: '2026-11-20T14:00:00Z', status: 'COMPLETED', amountCents: 1800, method: 'CASH' }],
  fiscalTransactions: [{ paymentId: 'p1', status: 'SIGNED', transactionNumber: 42 }], receipts: [],
  dayClosings: [{ day: '2026-11-20', type: 'CLOSING', number: 'Z-0007', revenue: { grossCents: 4300 } }, { day: '2026-11-20', type: 'CLOSING', mode: 'TRAINING' }],
  suppliers: [{ id: 's1', name: 'Fleisch Müller' }, { id: 's2', name: 'Bäckerei Yildiz' }],
  invoices: [
    { id: 'i1', supplierId: 's1', invoiceNumber: 'RE-100', invoiceDate: '2026-11-10', totalAmount: 250.5, netAmount: 234.11, vatAmount: 16.39, status: 'POSTED', lineItems: [{ originalDescription: 'Rinderhack', quantity: 10, unitPrice: 23.41, lineTotal: 234.1, vatRate: 7 }] },
    { id: 'i2', supplierId: 's2', invoiceNumber: 'B-9', invoiceDate: '2026-11-18', totalCents: 4000, status: 'DRAFT' },
  ],
  inventoryItems: [{ id: 'v1', name: 'Rinderhack', baseUnit: 'g', currentStock: 500, minimumStock: 2000 }, { id: 'v2', name: 'Brot', baseUnit: 'Stk', currentStock: 80, minimumStock: 20 }],
  purchasePriceHistory: [{ inventoryItemId: 'v1', supplierId: 's1', unitPrice: 23.41, createdAt: '2026-11-10T10:00:00Z', invoiceId: 'i1' }],
  bankTransactions: [{ id: 'b1', date: '2026-11-12', amountCents: -25050, description: 'Fleisch Müller RE-100', status: 'UNMATCHED' }, { id: 'b2', date: '2026-11-13', amountCents: 90000, description: 'Lieferando Auszahlung', status: 'MATCHED' }],
  chartOfAccounts: [{ id: 'a1', number: '1000', name: 'Kasse' }, { id: 'a2', number: '4000', name: 'Umsatz' }],
  journalEntries: [{ number: 'JE-1', date: '2026-11-20', status: 'POSTED', lines: [{ accountId: 'a1', debitCents: 1800 }, { accountId: 'a2', creditCents: 1800 }] }],
  documents: [{ id: 'd1', createdAt: '2026-11-19T10:00:00Z', extractionStatus: 'PENDING_REVIEW', originalFilenames: ['scan.pdf'] }],
  cashbooks: [{ date: '2026-11-20', type: 'OPENING', inCents: 10000, outCents: 0 }], accountingPeriods: [],
});

test('Werkzeuge: Rechnungen, Details, Lieferanten, Lager, Preise, Bank, Journal, Bestellung, Abschluss', () => {
  const T = AA.makeTools(data(), { today: '2026-11-21' });
  const f = T.run('find_invoices', { supplier: 'fleisch' }); assert.equal(f.count, 1); assert.equal(f.invoices[0].totalCents, 25050); assert.equal(f.documentsWaitingForReview.length, 1);
  assert.equal(T.run('find_invoices', { query: 'rinderhack' }).count, 1);
  const d = T.run('invoice_detail', { invoiceNumber: 're-100' }); assert.equal(d.found, true); assert.equal(d.supplier, 'Fleisch Müller'); assert.equal(d.lines[0].quantity, 10);
  assert.equal(T.run('invoice_detail', { id: 'nope' }).found, false);
  const s = T.run('suppliers', {}); assert.equal(s.suppliers[0].name, 'Fleisch Müller'); assert.equal(s.suppliers[1].sumCents, 4000);
  const st = T.run('stock', { lowOnly: true }); assert.deepEqual(st.items.map(x => x.name), ['Rinderhack']); assert.equal(st.items[0].lastUnitPrice, 23.41);
  assert.equal(T.run('price_history', { item: 'rinder' }).history.length, 1);
  const b = T.run('bank', { status: 'UNMATCHED' }); assert.equal(b.count, 1); assert.equal(b.outCents, -25050);
  assert.equal(T.run('journal', { account: '4000' }).entries[0].lines[1].name, 'Umsatz');
  const o = T.run('order', { code: 'k-7' }); assert.equal(o.found, true); assert.equal(o.tse[0].transactionNumber, 42);
  assert.equal(T.run('order', { code: 'LF123' }).platform, 'LIEFERANDO');
  const z = T.run('day_closing', { day: '2026-11-20' }); assert.equal(z.records.length, 1); assert.equal(z.records[0].number, 'Z-0007');
  assert.equal(T.run('day_closing', { day: '2026-11-19' }).found, false);
  const sa = T.run('sales', { from: '2026-11-20', to: '2026-11-20' }); assert.equal(sa.totals.ownCents, 1800); assert.equal(sa.totals.platformCents, 2500);
  assert.equal(T.run('overview', {}).vatRegime, 'KLEIN');
  assert.equal(T.run('cashbook', {}).balanceCents, 10000);
  assert.ok(T.run('nope', {}).error); assert.ok(T.run('sales', { from: 'x' }).error);
});

test('Werkzeuge: nur lesen — Daten bleiben unverändert', () => {
  const d = data(), before = JSON.stringify(d), T = AA.makeTools(d, { today: '2026-11-21' });
  for (const t of AA.TOOLS) T.run(t.name, { from: '2026-11-01', to: '2026-11-30', day: '2026-11-20', code: 'K-7', item: 'Brot', id: 'i1' });
  assert.equal(JSON.stringify(d), before);
});

test('chat: Werkzeug-Schleife mit Fake-Adapter, Verlauf bereinigt (abwechselnd, beginnt mit user)', async () => {
  let seen = null; const calls = [];
  const adapter = {
    name: 'fake:x',
    init: (system, history, user) => { seen = { system, history, user }; return { n: 0 }; },
    async call(st) { st.n++; return st.n === 1 ? { text: '', calls: [{ id: 'c1', name: 'find_invoices', args: { supplier: 'müller' } }], usage: { in: 100, out: 10 } } : { text: 'Die Rechnung RE-100 über 250,50 €.', calls: [], usage: { in: 200, out: 20 } }; },
    addResults: (st, c, r) => calls.push(r[0]),
    finalNoTools: async () => ({ text: 'x', usage: { in: 0, out: 0 } }),
  };
  const r = await AA.chat({ message: 'letzte Rechnung Müller?', lang: 'de', history: [{ role: 'assistant', text: 'hallo' }, { role: 'user', text: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', text: 'c' }, { role: 'user', text: 'offen' }] }, { data: data(), adapter, today: '2026-11-21' });
  assert.equal(r.ok, true); assert.match(r.reply, /RE-100/); assert.deepEqual(r.toolsUsed, ['find_invoices']); assert.deepEqual(r.usage, { in: 300, out: 30 });
  assert.equal(calls[0].count, 1);
  assert.deepEqual(seen.history.map(h => h.role), ['user', 'assistant']); assert.equal(seen.history[0].content, 'a\nb');
  assert.match(seen.system, /Answer ONLY in German/); assert.match(seen.system, /KLEIN/); assert.match(seen.system, /read-only/i);
  assert.equal((await AA.chat({ message: '  ' }, { data: data(), adapter })).ok, false);
});

test('chat: hört nach maxRounds auf und antwortet ohne Werkzeuge', async () => {
  let final = false;
  const adapter = { name: 'f', init: () => ({}), call: async () => ({ text: '', calls: [{ id: 'x', name: 'overview', args: {} }], usage: { in: 1, out: 1 } }), addResults() {}, finalNoTools: async () => { final = true; return { text: 'fertig', usage: { in: 1, out: 1 } }; } };
  const r = await AA.chat({ message: 'hi', lang: 'ar' }, { data: data(), adapter, maxRounds: 2 });
  assert.equal(final, true); assert.equal(r.reply, 'fertig'); assert.equal(r.rounds, 2);
});

test('Claude-Adapter: richtige Anfrage (Header, Tools, Cache), Tool-Ergebnisse als tool_result', async () => {
  let req = null;
  const fetchImpl = async (url, o) => { req = { url, o, body: JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'sales', input: { from: '2026-11-01', to: '2026-11-02' } }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } }) }; };
  const ad = AA.anthropicAdapter({ key: 'k', model: 'claude-sonnet-5-5', fetchImpl });
  const st = ad.init('SYS', [], 'frage'); const r = await ad.call(st);
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages'); assert.equal(req.o.headers['x-api-key'], 'k'); assert.equal(req.o.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.body.model, 'claude-sonnet-5-5'); assert.equal(req.body.tools.length, AA.TOOLS.length); assert.ok(req.body.tools.at(-1).cache_control); assert.ok(req.body.system[0].cache_control);
  assert.equal(r.calls[0].name, 'sales'); assert.deepEqual(r.usage, { in: 20, out: 5 });
  ad.addResults(st, r.calls, [{ ok: 1 }]); assert.equal(st.messages.at(-1).content[0].type, 'tool_result');
});

test('Anbieter: Claude vor Gemini, ohne Schlüssel null', () => {
  assert.equal(AA.providerFromEnv({}), null);
  assert.match(AA.providerFromEnv({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).name, /^anthropic:claude-sonnet-5-5$/);
  assert.match(AA.providerFromEnv({ GEMINI_API_KEY: 'g' }).name, /^gemini:/);
  assert.match(AA.providerFromEnv({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', NARA_ACCOUNTING_PROVIDER: 'gemini' }).name, /^gemini:/);
  assert.match(AA.providerFromEnv({ ANTHROPIC_API_KEY: 'a', NARA_ACCOUNTING_MODEL: 'claude-haiku-5-5' }).name, /haiku/);
});

test('Kostenzähler: summiert pro Monat', () => {
  const os = require('node:os'), path = require('node:path'), fs = require('node:fs'), f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acu-')), 'u.json');
  const s = AA.usageStore(f, () => new Date('2026-11-21T00:00:00Z'));
  s.add({ in: 1e6, out: 0 }, 3, 15); const u = s.add({ in: 0, out: 1e5 }, 3, 15);
  assert.equal(u.calls, 2); assert.equal(u.costEur, 4.5);
});

test('Rechnungsleser Claude: PDF als document, erzwungenes Tool, Ergebnis validiert', async () => {
  const old = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'k';
  let body = null;
  const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 'save_invoice', input: { supplierName: 'Müller', invoiceNumber: 'RE-1', grossAmount: 10.7, netAmount: 10, vatAmount: 0.7, lines: [{ originalDescription: 'Hack', quantity: 2, unitPrice: 5, lineTotal: 10, vatRate: 7 }] } }] }) }; };
  try {
    const r = await IP.extractClaude({ files: ['QUJD', 'REVG'], mimeTypes: ['application/pdf', 'image/png'] }, fetchImpl);
    assert.equal(body.tool_choice.name, 'save_invoice'); assert.equal(body.messages[0].content[0].type, 'document'); assert.equal(body.messages[0].content[1].type, 'image');
    assert.deepEqual(body.tools[0].input_schema.properties.supplierName.type, ['string', 'null']);
    assert.equal(r.invoiceNumber, 'RE-1'); assert.equal(r.lines.length, 1); assert.ok(r.__validation);
  } finally { if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old; }
  await assert.rejects(IP.extractClaude({ files: [], mimeTypes: [] }, async () => ({})), /nicht konfiguriert/);
});

test('Rechte: Seite nur Buchhaltung, Modul nicht öffentlich', () => {
  assert.ok(A.PAGE_ROLES['accounting-agent.html']); assert.equal(A.staticAllowed('accounting-agent.js'), false);
});
