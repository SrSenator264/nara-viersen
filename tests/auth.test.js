'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

test('PIN rules: length per role, no trivial PINs', () => {
  assert.equal(A.validatePin('CASHIER', '4821'), null);
  assert.match(A.validatePin('MANAGER', '4821'), /mindestens 6/);
  assert.equal(A.validatePin('MANAGER', '482193'), null);
  for (const bad of ['1234', '0000', '4321', '12ab', '123', '1111']) assert.notEqual(A.validatePin('CASHIER', bad), null, bad);
});
test('PIN hash verifies only the right PIN and never stores it', () => {
  const rec = A.hashPin('482193');
  assert.equal(JSON.stringify(rec).includes('482193'), false);
  assert.equal(A.verifyPin('482193', rec), true);
  assert.equal(A.verifyPin('482194', rec), false);
  assert.equal(A.verifyPin('', rec), false);
  assert.equal(A.verifyPin('482193', null), false);
  assert.notEqual(A.hashPin('482193').hash, rec.hash); // random salt
});
test('limiter locks after max failures and unlocks on success/time', () => {
  const L = new A.Limiter({ max: 3, windowMs: 1000, lockMs: 5000 });
  assert.equal(L.check('k', 0).ok, true);
  L.fail('k', 1); L.fail('k', 2); const r = L.fail('k', 3);
  assert.equal(r.ok, false); assert.equal(L.check('k', 4000).ok, false); assert.equal(L.check('k', 6000).ok, true);
  L.fail('x', 0); L.success('x'); L.fail('x', 1); L.fail('x', 2); assert.equal(L.check('x', 3).ok, true);
});
test('cookies and tokens', () => {
  assert.deepEqual(A.parseCookies('a=1; nara_session=abc%20d; x'), { a: '1', nara_session: 'abc d' });
  assert.notEqual(A.newToken(), A.newToken()); assert.equal(A.tokenHash('t').length, 64);
});
test('policy: public, staff and manager-only routes', () => {
  assert.equal(A.policyFor('POST', '/api/delivery/quote'), 'public');
  assert.equal(A.policyFor('GET', '/api/menu'), 'public');
  assert.equal(A.policyFor('POST', '/api/platform-orders/import'), 'service');
  assert.ok(A.allowed(A.policyFor('POST', '/api/kasse/events'), 'CASHIER'));
  assert.ok(A.allowed(A.policyFor('POST', '/api/kasse/events'), 'KITCHEN'));
  assert.equal(A.allowed(A.policyFor('POST', '/api/kasse/events'), 'DRIVER'), false);
  assert.equal(A.allowed(A.policyFor('GET', '/api/customers'), 'KITCHEN'), false);
  assert.ok(A.allowed(A.policyFor('GET', '/api/customers'), 'CASHIER'));
  for (const p of ['/api/delivery/config', '/api/delivery/driver-pay', '/api/delivery/daily-report', '/api/admin-data', '/api/payroll/daily'])
    for (const r of ['CASHIER', 'KITCHEN', 'DRIVER', 'ACCOUNTANT']) assert.equal(A.allowed(A.policyFor('GET', p), r), false, p + ' ' + r);
  assert.ok(A.allowed(A.policyFor('GET', '/api/delivery/config'), 'MANAGER'));
  assert.ok(A.allowed(A.policyFor('GET', '/api/accounting/journal-entries'), 'ACCOUNTANT'));
  assert.equal(A.allowed(A.policyFor('GET', '/api/accounting/journal-entries'), 'CASHIER'), false);
});
test('policy: unknown /api routes are manager-only (deny by default)', () => {
  assert.deepEqual(A.policyFor('GET', '/api/something-new'), A.MANAGERS);
  assert.deepEqual(A.policyFor('DELETE', '/api/delivery/zones'), A.MANAGERS);
});
test('static files: data, secrets and dotfiles are never served', () => {
  for (const bad of ['data/nara-admin.json', 'data/nara-admin.json.bak', '.env', '.git/config', 'logs/x.log', 'node_modules/a/b.js', 'server.js.bak', 'package.json', 'tests/auth.test.js', 'scripts/x.js', 'nara-worker-deploy-archive-backup-20261007/x.js', 'a/../.env', 'secret.pem', 'checkpoint1/a.js'])
    assert.equal(A.staticAllowed(bad), false, bad);
  for (const ok of ['kasse.html', 'kasse-touch.css', 'vendor/qrcode.bundle.js', 'dist/client/assets/burger-1.png', 'dist/client/assets/Brownie.webp', 'nara-receipt-core.mjs'])
    assert.equal(A.staticAllowed(ok), true, ok);
});
test('every page that is gated has a role list', () => {
  assert.ok(A.PAGE_ROLES['kasse.html'].includes('CASHIER')); assert.equal(A.PAGE_ROLES['kasse.html'].includes('KITCHEN'), false);
  assert.equal(A.PAGE_ROLES['staff.html'].includes('CASHIER'), false);
});

test('parseCookies: ungueltige Prozent-Codierung wirft nicht', () => {
  for (const h of ['a=%', 'a=%E0%A4%A', 'a=%%', 'a=', '', 'a=%; b=2', undefined])
    assert.doesNotThrow(() => A.parseCookies(h), String(h));
  assert.deepEqual(A.parseCookies('a=%; b=2'), { a: '%', b: '2' });
  assert.deepEqual(A.parseCookies('big=' + 'x'.repeat(5000)).big.length, 5000);
});

// ───────── staticAllowed: Server-Module dürfen nie ausgeliefert werden, Frontend-Skripte immer ─────────
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
const htmlFiles = rootFiles.filter(f => f.endsWith('.html'));
const normRef = s => s.replace(/[?#].*$/, '').replace(/^\.?\//, '');
// Skripte, die eine Seite lädt: <script src>, plus dynamisch (createElement/.src=, import(), document.write, serviceWorker.register) in den Frontend-Skripten
function frontendLoaded() {
  const out = new Set();
  for (const h of htmlFiles) for (const m of fs.readFileSync(path.join(ROOT, h), 'utf8').matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) if (!/^(https?:)?\/\//.test(m[1])) out.add(normRef(m[1]));
  const serverish = new Set(['server.js', 'server-auth.js']);
  // dynamisch geladen: in den Frontend-Skripten UND in Inline-Skripten der .html-Seiten (z. B. serviceWorker.register('sw.js'))
  for (const f of rootFiles.filter(x => (/\.m?js$/.test(x) && !serverish.has(x)) || x.endsWith('.html'))) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const re of [/\.src\s*=\s*['"]([^'"?]+\.m?js)/g, /import\(\s*['"]\/?([^'"?]+\.m?js)/g, /<script src=\\?["']([^"'\\?]+\.m?js)/g, /register\(\s*['"]([^'"?]+\.js)/g])
      for (const m of t.matchAll(re)) out.add(normRef(m[1]));
  }
  // server-injizierte Skripte (server-auth.js inject): nara-auth.js, flamo-nav.js
  const inj = fs.readFileSync(path.join(ROOT, 'server-auth.js'), 'utf8');
  for (const m of inj.matchAll(/<script src="\/([^"?]+\.js)/g)) out.add(m[1]);
  return out;
}
// Alle lokalen Module, die server.js / server-auth.js (transitiv) per require() laden
function serverGraph() {
  const seen = new Set(), q = ['server.js', 'server-auth.js'];
  const res = (from, r) => { const b = path.join(path.dirname(from), r); for (const c of [b, b + '.js', b + '.mjs']) { const full = path.join(ROOT, c); if (fs.existsSync(full) && fs.statSync(full).isFile()) return path.relative(ROOT, full).split(path.sep).join('/'); } return null; };
  while (q.length) {
    const f = q.pop(); if (seen.has(f)) continue; seen.add(f);
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of t.matchAll(/(?:require|import)\(\s*['"](\.[^'"]+)['"]/g)) { const r = res(f, m[1]); if (r && !seen.has(r)) q.push(r); }
  }
  return seen;
}
test('staticAllowed: every server-required module is blocked unless a page loads it', () => {
  const loaded = frontendLoaded();
  const leaked = [...serverGraph()].filter(f => !loaded.has(f) && A.staticAllowed(f));
  assert.deepEqual(leaked, [], 'Server-Module werden öffentlich ausgeliefert: ' + leaked.join(', '));
});
test('staticAllowed: concrete server files are blocked (alerts, monitor, data-guard, delivery-rules, local-invoice-hybrid, sales-ledger …)', () => {
  for (const f of ['server.js', 'server-auth.js', 'auth.js', 'alerts.js', 'monitor.js', 'data-guard.js', 'delivery-rules.js', 'local-invoice-hybrid.js', 'option-library.js', 'sales-ledger.js', 'customers-sync.js', 'web-order.js'])
    assert.equal(A.staticAllowed(f), false, f);
});
test('staticAllowed: unknown new .js/.mjs in the root is denied by default (whitelist)', () => {
  assert.equal(A.staticAllowed('brand-new-server-module.js'), false);
  assert.equal(A.staticAllowed('brand-new-tool.mjs'), false);
  assert.equal(A.staticAllowed('sub/dir/x.js'), false);
});
test('staticAllowed: every script loaded by an html page stays allowed (frontend must not break)', () => {
  const missing = [...frontendLoaded()].filter(f => /\.m?js$/.test(f) && fs.existsSync(path.join(ROOT, f)) && !A.staticAllowed(f));
  assert.deepEqual(missing, [], 'Frontend-Skripte fehlen in FRONTEND_JS (auth.js): ' + missing.join(', '));
});
test('staticAllowed: whitelist has no stale or server-only entries', () => {
  const server = serverGraph(), loaded = frontendLoaded();
  for (const f of A.FRONTEND_JS) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), 'FRONTEND_JS verweist auf fehlende Datei: ' + f);
    assert.ok(!server.has(f) || loaded.has(f), 'Server-Modul in FRONTEND_JS: ' + f);
  }
});
test('staticAllowed: other static assets and dist/client are still served, dist/server is not', () => {
  for (const f of ['index.html', 'kasse.css', 'brand/flamo-icon.svg', 'dist/client/kasse.js', 'dist/client/admin.html']) assert.equal(A.staticAllowed(f), true, f);
  assert.equal(A.staticAllowed('dist/server/index.js'), false);
  assert.equal(A.staticAllowed('data/nara-admin.json'), false);
  assert.equal(A.staticAllowed('.env'), false);
});

// ───────── Speicher-Hygiene: Limiter.prune / pruneHits / server-auth prune ─────────
test('Limiter.prune removes expired entries and keeps active ones', () => {
  const L = new A.Limiter({ max: 3, windowMs: 1000, lockMs: 5000 });
  L.fail('old', 0);                                   // Fenster 0..1000, nicht gesperrt
  L.fail('fresh', 9500);                              // Fenster noch offen bei now=10000
  L.fail('locked', 0); L.fail('locked', 1); L.fail('locked', 2); // gesperrt bis 5002
  L.fail('lockedLong', 9000); L.fail('lockedLong', 9001); L.fail('lockedLong', 9002); // gesperrt bis 14002
  const removed = L.prune(10000);
  assert.equal(removed, 2);                           // 'old' + 'locked' (Sperre abgelaufen, Fenster zu)
  assert.equal(L.m.has('old'), false);
  assert.equal(L.m.has('locked'), false);
  assert.equal(L.m.has('fresh'), true);
  assert.equal(L.m.has('lockedLong'), true);
  assert.equal(L.check('lockedLong', 10000).ok, false); // aktive Sperre bleibt wirksam
});
test('Limiter.prune: still-locked entry is never removed even if its window is over', () => {
  const L = new A.Limiter({ max: 2, windowMs: 100, lockMs: 10000 });
  L.fail('k', 0); L.fail('k', 1);
  assert.equal(L.prune(5000), 0);
  assert.equal(L.m.size, 1);
  assert.equal(L.prune(20000), 1);
  assert.equal(L.m.size, 0);
});
test('pruneHits drops keys whose timestamps are all older than the window', () => {
  const now = 1_000_000, hits = new Map([['stale', [now - 700000, now - 650000]], ['mixed', [now - 700000, now - 1000]], ['fresh', [now - 5]], ['empty', []]]);
  const n = A.pruneHits(hits, 600000, now);
  assert.equal(n, 2);
  assert.deepEqual([...hits.keys()].sort(), ['fresh', 'mixed']);
});
test('server-auth create() exposes prune() and server.js schedules it unref\'d every 10 min', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-prune-'));
  try {
    const auth = require('../server-auth.js').create({ readAdminData: () => ({ employees: [] }), writeAdminData() {}, reply() {}, adminId: p => p + '-1', dir });
    assert.equal(typeof auth.prune, 'function');
    assert.equal(auth.prune(), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(src, /setInterval\(\(\)=>\{try\{naraAuthLib\.pruneHits\(webOrderHits,600000\);naraAuthLib\.pruneHits\(flamoHits,86400000\);naraAuth\.prune\(\)\}[^]*?\},10\*60000\)\.unref\(\)/);
});

// ───────── Berechtigungstabelle der neueren Endpoints ─────────
test('policyFor: /api/health is public, /api/health/details is managers only', () => {
  assert.equal(A.policyFor('GET', '/api/health'), 'public');
  assert.deepEqual(A.policyFor('GET', '/api/health/details'), A.MANAGERS);
});
test('policyFor: health test-alert and menu-translation drafts are managers only', () => {
  assert.deepEqual(A.policyFor('POST', '/api/health/test-alert'), A.MANAGERS);
  assert.deepEqual(A.policyFor('POST', '/api/menu/translations/drafts'), A.MANAGERS);
  assert.equal(A.allowed(A.policyFor('POST', '/api/menu/translations/drafts'), 'CASHIER'), false);
  assert.equal(A.allowed(A.policyFor('POST', '/api/health/test-alert'), 'KITCHEN'), false);
  assert.equal(A.allowed(A.policyFor('POST', '/api/health/test-alert'), 'MANAGER'), true);
});
