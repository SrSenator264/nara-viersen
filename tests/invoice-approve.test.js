'use strict';
// Rechnung für die Buchhaltung freigeben (DRAFT → APPROVED) ohne Lagerbuchung; zählt dann in der GuV, Wareneingang geht danach weiter.
const test = require('node:test'), assert = require('node:assert/strict');
const { stopServer } = require('./helpers/stop-server.js');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const EU = require('../euer-draft.js');

const inv = (id, o = {}) => ({ id, supplierId: 'sup_m', invoiceNumber: 'R-' + id, invoiceDate: '2026-11-10', totalAmount: 119, netAmount: 100, vatAmount: 19, status: 'DRAFT', createdAt: '2026-11-10T10:00:00Z', lineItems: [], ...o });

test('GuV: APPROVED und POSTED zählen, DRAFT nicht', () => {
  const base = { settings: { accounting: { vatRegime: 'KLEIN' } }, orders: [], payments: [], suppliers: [{ id: 'sup_m', name: 'MELEDI' }], fiscalTransactions: [], receipts: [], platformStatements: [], payrollPayments: [], fixedAssets: [] };
  const r = EU.buildPeriod({ ...base, invoices: [inv('a', { status: 'APPROVED' }), inv('b', { status: 'POSTED' }), inv('c')] }, '2026-11-01', '2026-11-30');
  assert.equal(r.counts.invoices, 2); assert.equal(r.expenses.totalCents, 23800);
  const reg = EU.buildPeriod({ ...base, settings: { accounting: { vatRegime: 'REGEL' } }, invoices: [inv('a', { status: 'APPROVED' })] }, '2026-11-01', '2026-11-30');
  assert.equal(reg.expenses.totalCents, 10000); assert.equal(reg.vat.inputCents, 1900); // Vorsteuer aus der Rechnung
});

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-invappr-'));
const port = 5300 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
let proc;
async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const sc = r.headers.get('set-cookie'); return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}
const readData = () => JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'nara-admin.json'), 'utf8'));

test('Route: freigeben, Fehlerfälle, Audit, Wareneingang danach', async t => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  fs.writeFileSync(path.join(tmp, 'data', 'nara-admin.json'), JSON.stringify({
    suppliers: [{ id: 'sup_m', name: 'MELEDI' }], inventoryItems: [{ id: 'i1', name: 'Mehl', unit: 'kg', baseUnit: 'kg', currentStock: 0 }], stockMovements: [], purchasePriceHistory: [], auditEvents: [],
    invoices: [
      inv('ok', { lineItems: [{ inventoryItemId: 'i1', quantity: 2, inventoryQuantityPerPackage: 5, inventoryBaseUnit: 'kg', unitPrice: 10 }] }),
      inv('nodate', { invoiceDate: '' }), inv('zero', { totalAmount: 0 }), inv('mismatch', { netAmount: 100, vatAmount: 7 }),
      inv('nonet', { netAmount: null, vatAmount: null }), inv('cancel', { status: 'CANCELLED' }), inv('nosup', { supplierId: null }),
    ],
  }));
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', NARA_NO_MONITOR: '1' }, stdio: 'ignore' });
  t.after(() => { return stopServer(proc, tmp); });
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/auth/me'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
  const bs = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(bs.status, 200, JSON.stringify(bs.json)); const owner = bs.cookie;
  const ap = (id, c = owner) => call('POST', '/api/accounting/invoices/approve', { invoiceId: id }, c);

  assert.equal((await ap('ok', null)).status, 401);
  const ok = await ap('ok'); assert.equal(ok.status, 200); assert.equal(ok.json.invoice.status, 'APPROVED');
  assert.equal((await ap('ok')).status, 409);
  assert.equal((await ap('nope')).status, 404);
  const nd = await ap('nodate'); assert.equal(nd.status, 422); assert.deepEqual(nd.json.fields, ['invoiceDate']);
  assert.deepEqual((await ap('zero')).json.fields, ['totalAmount']);
  assert.deepEqual((await ap('nosup')).json.fields, ['supplier']);
  assert.equal((await ap('mismatch')).json.error, 'NET_VAT_MISMATCH');
  assert.equal((await ap('cancel')).json.error, 'BAD_STATUS');
  assert.equal((await ap('nonet')).status, 200); // netto/USt optional

  const d = readData();
  assert.equal(d.invoices.find(x => x.id === 'ok').approvedBy, 'Chef');
  assert.equal(d.inventoryItems[0].currentStock, 0); // keine Lagerbuchung beim Freigeben
  assert.equal(d.auditEvents.filter(e => e.type === 'INVOICE_APPROVED').length, 2);

  const gr = await call('POST', '/api/goods-receipt', { invoiceId: 'ok' }, owner);
  assert.equal(gr.status, 200);
  const d2 = readData(); assert.equal(d2.invoices.find(x => x.id === 'ok').status, 'POSTED'); assert.equal(d2.inventoryItems[0].currentStock, 10);
});
