'use strict';
// Bestell-Simulator: Verteilung/Preise offline (seed), und gegen einen echten temporären Server: alles isTest, nichts in TSE/Buchhaltung, clear storniert.
const test = require('node:test'), assert = require('node:assert/strict');
const { stopServer } = require('./helpers/stop-server.js');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process'), { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-sim-'));
const port = 5400 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'nara-worker-deploy-archive-backup-20261007']);
let proc, sim;
process.env.NARA_BASE_URL = base; process.env.NARA_DATA_DIR = path.join(tmp, 'data'); process.env.NARA_MANAGER_KEY = 'simkey-123';
const readData = () => JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'nara-admin.json'), 'utf8'));

test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=x\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: 'simkey-123' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/menu'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
  sim = await import(pathToFileURL(path.join(root, 'scripts', 'simulate-orders.mjs')).href); // Windows: import() braucht eine file://-URL
});
test.after(() => { return stopServer(proc, tmp); });

test('rng: gleicher Seed = gleiche Folge', () => {
  const a = sim.rng(5), b = sim.rng(5), c = sim.rng(6);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]); assert.notEqual(sim.rng(5)(), c());
});

test('Verteilung & Preise: Burger/Taco vorn, Menü aus menuCents, Gesamt = Summe der Zeilen, Liefermindestwert', async () => {
  const m = await (await fetch(base + '/api/menu')).json();
  const menu = m.products.filter(p => !p.hidden && !p.unavailable && !['Extra', 'Shisha'].includes(p.c) && p.cents > 0);
  const r = sim.rng(42), cnt = {}, ch = {}; let menus = 0, fam = 0, notes = 0, dipsLines = 0;
  for (let i = 0; i < 400; i++) {
    const o = sim.buildOrder(r, menu, i, 'T');
    ch[o.channel] = (ch[o.channel] || 0) + 1;
    const lines = o.order.cart.filter(l => l.kind !== 'DELIVERY_FEE');
    assert.ok(lines.length >= 1);
    for (const l of lines) {
      assert.equal(l.totalCents, l.unitCents * l.quantity); assert.ok(l.unitCents > 0 || l.options.length);
      cnt[l.category] = (cnt[l.category] || 0) + l.quantity; if (/\(Menü\)/.test(l.name)) { menus++; const p = menu.find(x => x.id === l.productId); assert.ok(l.unitCents >= p.menuCents, 'Menüpreis ≥ menuCents'); }
      if (l.note) notes++; if (l.options.some(x => x.group === 'Dips')) dipsLines++;
    }
    if (o.family) { fam++; assert.ok(lines.length >= 3); }
    if (o.order.type === 'delivery') { assert.ok(sim.totalOf(lines) >= sim.minOrderCents, 'Mindestbestellwert'); assert.match(o.order.delivery.postalCode, /^(41747|41748|41749|41751|41063)$/); }
    assert.ok(o.order.isTest && o.code.startsWith('SIM'));
    const expect = sim.totalOf(lines) + (o.order.deliveryFeeCents || 0); assert.equal(o.order.totalCents, o.kind === 'kasse' ? sim.totalOf(lines) : expect);
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  assert.ok(top.some(c => /Burger/.test(c)) && top.includes('French Tacos'), 'Top-3: ' + top);
  assert.deepEqual(Object.keys(ch).sort(), ['DINEIN', 'KASSE', 'LIEFERANDO', 'LOCO', 'UBER_EATS', 'WEB']);
  assert.ok(menus > 40 && fam > 30 && notes > 40, `menus ${menus} fam ${fam} notes ${notes}`);
});

test('Server: alles isTest, keine TSE/Buchhaltung, Plattform-Quellen stimmen, Kasse = Training', async () => {
  const { made, stats } = await sim.simulate(60, { seed: 11, log: () => {} });
  assert.equal(stats.failed, 0); assert.equal(made.length, 60); assert.equal(stats.authSkipped, 0);
  const d = readData(), mine = d.orders.filter(o => String(o.displayCode).startsWith('SIM'));
  assert.equal(mine.length, 60); assert.ok(mine.every(o => o.isTest));
  assert.ok(d.payments.every(p => p.isTest), 'Zahlungen = Test');
  assert.ok(d.fiscalTransactions.every(f => f.status === 'TRAINING_NOT_SIGNED'), 'nichts an die TSE');
  assert.ok(d.receipts.every(x => x.receiptNumber.startsWith('UEB-')));
  const kasse = mine.filter(o => !o.externalOrderCode); assert.ok(kasse.length > 5 && kasse.every(o => o.training === true));
  assert.ok(new Set(mine.map(o => String(o.source).toUpperCase())).size >= 4, 'mehrere Quellen: ' + [...new Set(mine.map(o => o.source))]);
  // Buchhaltung: Berichte zählen keine Tests
  const j = await (await fetch(base + '/api/reports/accounting-export', { headers: { 'x-nara-manager-key': 'simkey-123' } })).json();
  assert.equal(j.summary.salesCents, 0, 'Umsatz bleibt 0');
});

test('clear: storniert alle offenen Simulationen (Plattform + Kasse)', async () => {
  const n = await sim.clearSims({ log: () => {} });
  assert.ok(n >= 50, 'storniert: ' + n);
  const mine = readData().orders.filter(o => String(o.displayCode).startsWith('SIM'));
  assert.ok(mine.every(o => ['CANCELLED', 'COMPLETED'].includes(o.status)), 'keine offenen mehr');
  assert.equal(mine.filter(o => o.status !== 'CANCELLED' && !o.training).length, 0);
});
