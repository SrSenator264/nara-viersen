'use strict';
// Schritt 2: Plattform-Abrechnungen automatisch annehmen — Duplikate, Ablage, Vergleich, Telegram ✅/✖, gebucht erst nach Freigabe.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const { stopServer } = require('./helpers/stop-server.js');
const PI = require('../platform-ingest.js');
const CSV = fs.readFileSync(path.join(__dirname, 'fixtures', 'uber-payments-sample.csv'));

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-ingest-'));
  let data = { platformStatements: [], platformInbox: [], auditEvents: [] }, n = 0;
  const sent = [];
  const deps = {
    readData: () => JSON.parse(JSON.stringify(data)), updateData: fn => { fn(data); }, docsDir: dir, newId: p => `${p}_${++n}`,
    readPdf: async () => { const e = new Error('NO_AI_KEY'); e.code = 'NO_AI_KEY'; throw e; },
    compareFor: st => ({ ok: st.grossCents > 0, flamoCount: 3, diffCents: 0 }), notify: async rec => { sent.push({ text: PI.summaryText(rec), buttons: PI.buttons(rec) }); },
  };
  return { dir, deps, sent, get data() { return data; } };
}

test('CSV: Eingang PENDING_APPROVAL, Datei unter platforms/, Telegram mit ✅/✖, noch nichts gebucht', async () => {
  const h = harness();
  const r = await PI.ingest({ filename: 'uber.csv', mime: 'text/csv', data: CSV.toString('base64'), source: 'collector' }, h.deps);
  assert.equal(r.status, 201); assert.equal(r.body.status, 'PENDING_APPROVAL'); assert.equal(r.body.items.length, 4);
  const rec = h.data.platformInbox[0];
  assert.equal(rec.source, 'COLLECTOR'); assert.match(rec.file, /^platforms\/pin_\d+\.csv$/);
  assert.ok(fs.existsSync(path.join(h.dir, rec.file)));
  assert.equal(h.data.platformStatements.length, 0, 'ohne Freigabe nichts gebucht');
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0].buttons[0].map(b => b.callback_data), [`pst:ok:${rec.id}`, `pst:no:${rec.id}`]);
  assert.match(h.sent[0].text, /Uber Eats · 2026-09-28 → 2026-10-04/); assert.match(h.sent[0].text, /بدك نحفظو بالحسابات؟/);
  assert.ok(h.data.auditEvents.some(e => e.type === 'PLATFORM_STATEMENT_INGESTED'));
});

test('Duplikate: gleiche Datei = sofort erkannt; gleiche Abrechnung in neuer Datei = nicht nochmal buchbar', async () => {
  const h = harness();
  const a = await PI.ingest({ filename: 'uber.csv', data: CSV.toString('base64') }, h.deps);
  const b = await PI.ingest({ filename: 'uber-again.csv', data: CSV.toString('base64') }, h.deps);
  assert.equal(b.body.duplicate, true); assert.equal(b.body.id, a.body.id); assert.equal(h.data.platformInbox.length, 1); assert.equal(h.sent.length, 1);
  assert.deepEqual(PI.decide(a.body.id, 'approve', 'Omar', h.deps), { ok: true, status: 'APPROVED', saved: 4 });
  assert.equal(h.data.platformStatements.length, 4); assert.equal(h.data.platformStatements[0].documentId, a.body.id); assert.equal(h.data.platformStatements[0].approvedBy, 'Omar');
  assert.equal(PI.decide(a.body.id, 'approve', 'Omar', h.deps).code, 'ALREADY_DECIDED');
  // gleicher Inhalt, andere Bytes (z. B. neu heruntergeladen) → alle Positionen schon gebucht → DUPLICATE, kein Telegram
  const c = await PI.ingest({ filename: 'uber-v2.csv', data: Buffer.concat([CSV, Buffer.from('\n')]).toString('base64') }, h.deps);
  assert.equal(c.body.status, 'DUPLICATE'); assert.ok(c.body.items.every(i => i.duplicateOf)); assert.equal(h.sent.length, 1);
  assert.equal(h.data.platformStatements.length, 4);
});

test('PDF ohne KI-Schlüssel: Datei bleibt gespeichert, Status NEEDS_REVIEW, Hinweis ohne Knöpfe; falsche/leere Dateien abgelehnt', async () => {
  const h = harness();
  const r = await PI.ingest({ filename: 'lieferando-kw47.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 test').toString('base64'), platform: 'LIEFERANDO' }, h.deps);
  assert.equal(r.body.status, 'NEEDS_REVIEW'); assert.equal(r.body.error, 'NO_AI_KEY');
  assert.ok(fs.existsSync(path.join(h.dir, h.data.platformInbox[0].file)));
  assert.equal(h.sent[0].buttons, null); assert.match(h.sent[0].text, /ما في مفتاح/);
  assert.equal((await PI.ingest({ filename: 'x.exe', data: 'AAAA' }, h.deps)).status, 422);
  assert.equal((await PI.ingest({ filename: 'x.pdf', data: '' }, h.deps)).status, 422);
  assert.equal(PI.decide(h.data.platformInbox[0].id, 'approve', 'Omar', h.deps).code, 'ALREADY_DECIDED', 'NEEDS_REVIEW kann nicht blind gebucht werden');
});

test('Telegram-Knopf: nur der Inhaber; ✖ bucht nichts', async () => {
  const h = harness();
  const { body } = await PI.ingest({ filename: 'uber.csv', data: CSV.toString('base64') }, h.deps);
  assert.equal(PI.handleCallback('rem:done:x', 'Omar', 'OWNER', h.deps), null);
  assert.match(PI.handleCallback(`pst:ok:${body.id}`, 'Partner', 'PARTNER', h.deps).answer, /بس المالك/);
  assert.equal(h.data.platformStatements.length, 0);
  const no = PI.handleCallback(`pst:no:${body.id}`, 'Omar', 'OWNER', h.deps);
  assert.match(no.edit, /ما انحفظ/); assert.equal(h.data.platformInbox[0].status, 'REJECTED'); assert.equal(h.data.platformStatements.length, 0);
  assert.match(PI.handleCallback(`pst:ok:${body.id}`, 'Omar', 'OWNER', h.deps).edit, /انحسم من قبل/);
});

test('Server: /ingest nur mit Service-Schlüssel, Eingang + Freigabe über die API', async t => {
  const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-ingest-srv-'));
  const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'tse-sdk', 'web-prototype', 'android-app', 'tests', 'nara-worker-deploy-archive-backup-20261007']);
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data')); fs.writeFileSync(path.join(tmp, '.env'), 'X=1\n');
  const port = 5800 + Math.floor(Math.random() * 300), base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: 'svc-test-key', NARA_MANAGER_KEY: 'mgr-test-key', NARA_NO_MONITOR: '1', NARA_GEOCODE: 'off', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', TELEGRAM_BOT_TOKEN: '' }, stdio: 'ignore' });
  t.after(() => stopServer(proc, tmp));
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/health'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }
  const post = (u, body, h = {}) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });
  const file = { filename: 'uber.csv', mime: 'text/csv', data: CSV.toString('base64'), source: 'COLLECTOR' };
  assert.equal((await post('/api/accounting/platform-statements/ingest', file)).status, 401, 'ohne Service-Schlüssel');
  const r = await post('/api/accounting/platform-statements/ingest', file, { 'x-nara-service-key': 'svc-test-key' });
  assert.equal(r.status, 201); const j = await r.json(); assert.equal(j.status, 'PENDING_APPROVAL');
  assert.ok(fs.existsSync(path.join(tmp, 'data', 'documents', 'platforms', j.id + '.csv')));
  assert.equal((await fetch(base + '/api/accounting/platform-statements/inbox')).status, 401, 'Eingang nur für Manager');
  const inbox = await (await fetch(base + '/api/accounting/platform-statements/inbox', { headers: { 'x-nara-manager-key': 'mgr-test-key' } })).json();
  assert.equal(inbox.pending, 1);
  assert.equal((await post('/api/accounting/platform-statements/inbox/decide', { id: j.id, decision: 'approve' }, { 'x-nara-service-key': 'svc-test-key' })).status, 401, 'Service darf nicht freigeben');
  const ok = await post('/api/accounting/platform-statements/inbox/decide', { id: j.id, decision: 'approve' }, { 'x-nara-manager-key': 'mgr-test-key' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).saved, 4);
  const again = await post('/api/accounting/platform-statements/ingest', file, { 'x-nara-service-key': 'svc-test-key' });
  assert.equal((await again.json()).duplicate, true);
  const data = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'nara-admin.json'), 'utf8'));
  assert.equal(data.platformStatements.length, 4); assert.equal(data.platformInbox[0].status, 'APPROVED');
});
