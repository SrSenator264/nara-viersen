'use strict';
// Kategorie je Bankbuchung: Vorschlagsregeln, Summen und GuV-Vergleich (Bank vs. manuell); Route mit echtem Server.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const BC = require('../bank-category.js'), EU = require('../euer-draft.js');

const tx = (description, amountCents, o = {}) => ({ id: 'b' + Math.random(), date: '2026-10-10', description, amountCents, status: 'UNMATCHED', ...o });
const sug = (d, a = -100, o) => (BC.suggest(tx(d, a, o)) || {}).category || null;

test('Vorschläge aus dem Oktober-Auszug', () => {
  assert.equal(sug('Kartentransaktion bei Meledi Kaarst Gronau (Karte 2851)'), 'GOODS');
  assert.equal(sug('Jacob Brot Großbäckerei GmbH & Co. KG - RE 123'), 'GOODS');
  assert.equal(sug('Keser Hüseyin - IU GENE Shisha Bar Miete'), 'RENT');
  assert.equal(sug('LogoEnergie GmbH - 784.242.615-1'), 'ENERGY');
  assert.equal(sug('Telekom Deutschland GmbH - 1742618761674'), 'TELECOM');
  assert.equal(sug('Knappschaft-Bahn-See - 2880531695'), 'WAGES');
  assert.equal(sug('Dirar Alkadri - PI-LK323 Versicherung'), 'INSURANCE');
  assert.equal(sug('Kartentransaktion bei Jet-Tankstelle Viersen'), 'VEHICLE');
  assert.equal(sug('Geld überwiesen an Omar Alkadri'), 'PRIVATE');
  assert.equal(sug('Einzahlung von LANCH GmbH - Lanch Abrechnung', 346560), 'PLATFORM_PAYOUT');
  assert.equal(sug('Einzahlung von Ghost Food Consulting UG', 39940), 'PLATFORM_PAYOUT');
  assert.equal(sug('Augenschmaus GmbH Co KG - Webseite Monatsrechnung Monatsmiete Onlineshop'), 'MARKETING'); // nicht Miete
  assert.equal(sug('Erwerb einer Wise-Karte'), 'BANK_FEES');
  assert.equal(sug('Kartentransaktion über 22,61 EUR bei Metro.de Duesseldorf', 1799), 'GOODS'); // Rückerstattung
  assert.equal(sug('Deepak Poudel'), null);
});

test('gespeicherte Kategorie und Abgleich gehen vor der Regel', () => {
  assert.deepEqual(BC.suggest(tx('Meledi', -100, { category: 'PRIVATE' })), { category: 'PRIVATE', source: 'SAVED' });
  assert.equal(BC.suggest(tx('Einzahlung Takeaway', 500, { status: 'MATCHED', matchedEntityType: 'PLATFORM_PAYOUT' })).source, 'MATCH');
  assert.equal(BC.suggest(tx('irgendwas', -100, { status: 'MATCHED', matchedEntityType: 'PAYROLL' })).category, 'WAGES');
  assert.equal(BC.suggest(tx('Meledi', -100, { category: 'KAPUTT' })).category, 'GOODS');
});

test('Summen: nur gespeicherte Kategorien im Zeitraum, Rückerstattung zieht ab', () => {
  const data = { bankTransactions: [
    tx('Meledi', -10000, { category: 'GOODS' }), tx('Metro', 1799, { category: 'GOODS' }),
    tx('Omar', -200000, { category: 'PRIVATE' }), tx('Deepak', -20000),
    tx('Meledi Nov', -5000, { category: 'GOODS', date: '2026-11-02' }),
  ] };
  const r = BC.totals(data, '2026-10-01', '2026-10-31');
  assert.deepEqual(r.byCat, { GOODS: 8201, PRIVATE: 200000 });
  assert.equal(r.uncategorized, 1); assert.equal(r.count, 4);
});

test('GuV: Bank-Vergleich ändert die Ausgaben nicht', () => {
  const data = { settings: { accounting: { vatRegime: 'REGEL', manualExpenses: { '2026-10': { GOODS: { netCents: 50000, vatCents: 0 } } } } }, orders: [], payments: [], invoices: [], suppliers: [], fiscalTransactions: [], receipts: [], platformStatements: [], payrollPayments: [], fixedAssets: [],
    bankTransactions: [tx('Meledi', -30000, { category: 'GOODS' })] };
  const r = EU.buildPeriod(data, '2026-10-01', '2026-10-31');
  assert.equal(r.expenses.GOODS, 50000);
  assert.equal(r.bank.byCat.GOODS, 30000);
});

// Route mit echtem Server (leeres data-Verzeichnis)
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-bankcat-'));
const port = 5300 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
let proc, owner;
async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const sc = r.headers.get('set-cookie'); return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}
test('Route: Kategorie speichern, ungültige ablehnen, Audit', async t => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '' }, stdio: 'ignore' });
  t.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
  owner = (await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' })).cookie;

  assert.equal((await call('POST', '/api/accounting/bank-transactions/category', { items: [] })).status, 401);
  const imp = await call('POST', '/api/accounting/bank-transactions', { transactions: [{ date: '2026-10-05', amountCents: -10000, description: 'Kartentransaktion bei Meledi Kaarst' }, { date: '2026-10-06', amountCents: -20000, description: 'Deepak Poudel' }] }, owner);
  assert.equal(imp.status, 201);
  const g = await call('GET', '/api/accounting/bank-transactions', null, owner);
  assert.ok(g.json.categories.includes('PRIVATE'));
  const [a, b] = g.json.transactions;
  assert.equal(a.suggestedCategory, 'GOODS'); assert.equal(b.suggestedCategory, null);

  assert.equal((await call('POST', '/api/accounting/bank-transactions/category', { items: [{ transactionId: a.id, category: 'KAPUTT' }] }, owner)).status, 422);
  assert.equal((await call('POST', '/api/accounting/bank-transactions/category', { items: [] }, owner)).status, 422);
  const s = await call('POST', '/api/accounting/bank-transactions/category', { items: [{ transactionId: a.id, category: 'GOODS' }, { transactionId: b.id, category: 'WAGES' }, { transactionId: 'nope', category: 'GOODS' }] }, owner);
  assert.equal(s.status, 200); assert.equal(s.json.changed, 2); assert.deepEqual(s.json.missing, ['nope']);
  const g2 = await call('GET', '/api/accounting/bank-transactions', null, owner);
  assert.deepEqual(g2.json.transactions.map(x => x.category), ['GOODS', 'WAGES']);
  const c = await call('POST', '/api/accounting/bank-transactions/category', { items: [{ transactionId: b.id, category: null }] }, owner);
  assert.equal(c.json.changed, 1);
  const data = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'nara-admin.json'), 'utf8'));
  const audits = data.auditEvents.filter(e => e.type === 'BANK_CATEGORY_SET');
  assert.equal(audits.length, 2); assert.deepEqual(audits[1].details.changes[0], { id: b.id, before: 'WAGES', after: null });
});
