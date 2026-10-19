'use strict';
// End-to-end: Start-Migrationen (Optionen-Bibliothek, Double/Triple-Cleanup, Übersetzungs-Entwürfe) + readAdminDataShared bleibt read-only.
// Startet eine Kopie des Servers mit eingefrorenem Shared-Objekt (NARA_FREEZE_SHARED=1): verändert ein Handler es, wirft er → HTTP 500 → Test rot.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-boot-'));
const port = 4900 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const KEY = 'test-manager-key';
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
const dataFile = path.join(tmp, 'data', 'nara-admin.json');
const NOW = Date.now(), iso = d => new Date(NOW - d * 864e5).toISOString();
const tr = require('../menu-translations.json');
const trSourceId = Object.keys(tr.products)[0], trCategory = Object.keys(tr.categories)[0];
let proc, out = '';

const seed = {
  schemaVersion: 8, settings: { currency: 'EUR', defaultVatRate: 7, requireEmployeeShiftForCashier: false },
  categories: [{ id: 'cat1', name: trCategory, active: true, sortOrder: 0 }],
  products: [{
    id: 'p1', sourceId: trSourceId, name: 'Testburger', categoryId: 'cat1', priceCents: 900, active: true, available: true, sortOrder: 0,
    menuData: { dips: [
      { id: 'd1', name: 'BBQ', cents: 80, group: 'Dips' },
      { id: 'extra-double-beef', name: 'Double Beef', cents: 400, group: 'Ihre Extras' },
      { id: 'extra-triple-beef', name: 'Triple Beef', cents: 700, group: 'Ihre Extras' },
      { id: 'e-cheese', name: 'Cheddar', cents: 100, group: 'Ihre Extras' },
    ] },
  }],
  optionGroups: [],
  orders: [
    { id: 'o-open', status: 'OPEN', createdAt: iso(0.2) },
    { id: 'o-done', status: 'COMPLETED', createdAt: iso(0.3), completedAt: iso(0.3) },
    { id: 'o-old', status: 'COMPLETED', createdAt: iso(30), completedAt: iso(30) },
  ],
  customers: [{ id: 'c1', name: 'Ali', phone: '015100000000', updatedAt: iso(1) }],
};

test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(dataFile, JSON.stringify(seed));
  fs.writeFileSync(path.join(tmp, '.env'), '');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: KEY, NARA_FREEZE_SHARED: '1', NARA_GEOCODE: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/health'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start:\n' + out);
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
const get = async u => { const r = await fetch(base + u, { headers: { 'x-nara-manager-key': KEY } }); return { status: r.status, json: await r.json().catch(() => null) }; };

test('boot: option library is migrated, products linked, backup written', () => {
  const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.ok(d.optionGroups.length >= 1, 'optionGroups angelegt');
  assert.ok(d.products[0].optionGroupIds && d.products[0].optionGroupIds.length >= 1, 'Produkt verknüpft');
  assert.ok(fs.existsSync(dataFile + '.pre-options.bak'), 'Sicherung vor der Migration');
});
test('boot: extra-double/-triple items are removed once, other extras stay', () => {
  const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const items = d.optionGroups.flatMap(g => g.items.map(i => i.id));
  assert.equal(items.includes('extra-double-beef'), false);
  assert.equal(items.includes('extra-triple-beef'), false);
  assert.ok(items.includes('d1') && items.includes('e-cheese'));
  assert.equal(d.settings.cleanupNoDoubleTriple, true);
  assert.ok(fs.existsSync(dataFile + '.pre-double-triple.bak'));
});
test('boot: translation drafts (EN/AR) created as "draft" and never approved automatically', () => {
  const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  for (const l of ['ar', 'en']) { assert.equal(d.products[0].translations[l].status, 'draft'); assert.equal(d.categories[0].translations[l].status, 'draft'); }
});
test('GET /api/menu: product/category translation fields (tr/ctr) carry no drafts', async () => {
  const r = await get('/api/menu');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.products[0].tr, {});   // nur 'approved' kommt als tr/ctr raus; frisch importierte Entwürfe nie
  assert.deepEqual(r.json.products[0].ctr, {});
  // HINWEIS (bewusst nicht geändert, ausserhalb des Auftrags): r.json.categories enthält die rohen category.translations inkl. Entwürfen.
});
test('read-only shared data: kasse-state, customers, open-orders work on the frozen object (no handler mutates it)', async () => {
  for (let round = 0; round < 2; round++) { // 2. Runde = Cache-Treffer auf dasselbe (eingefrorene) Objekt
    const full = await get('/api/kasse-state');
    assert.equal(full.status, 200, 'kasse-state: ' + out.slice(-300)); assert.equal(full.json.orders.length, 3);
    const win = await get('/api/kasse-state?days=2');
    assert.equal(win.status, 200, 'kasse-state?days: ' + out.slice(-300));
    assert.deepEqual(win.json.orders.map(o => o.id).sort(), ['o-done', 'o-open']);
    const cu = await get('/api/customers');
    assert.equal(cu.status, 200, 'customers: ' + out.slice(-300)); assert.equal(cu.json.customers[0].id, 'c1');
    const op = await get('/api/kasse/open-orders');
    assert.equal(op.status, 200, 'open-orders: ' + out.slice(-300)); assert.deepEqual(op.json.orders.map(o => o.id), ['o-open']);
  }
  assert.equal(/HANDLER_ERROR/.test(out), false, out.slice(-400));
});
