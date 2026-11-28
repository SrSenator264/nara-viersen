'use strict';
// Schritt 3: Abrechnungs-Sammler gegen ein nachgebautes Partnerportal (kein echtes Konto):
// neue Dateien → /ingest (einmal), abgelaufene Sitzung / 2FA / keine Sitzung → ruhig stoppen + Hinweis, nie selbst einloggen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { pathToFileURL } = require('node:url');

const PDF = Buffer.from('%PDF-1.4\n% Lieferando KW47 test\n'), CSV = Buffer.from('a,b\n1,2\n');
let portal, ingest, base, ingestBase, browser, C, tmp;
const uploads = [], alerts = [];
const cookieOf = req => (/sess=(\w+)/.exec(req.headers.cookie || '') || [])[1];

test.before(async () => {
  C = await import(pathToFileURL(path.join(__dirname, '..', 'platform-statements-collector.mjs')).href);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-collector-'));
  portal = http.createServer((req, res) => {
    const s = cookieOf(req), html = b => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body>' + b + '</body>'); };
    if (req.url === '/statements') {
      if (s === 'ok') return html('<h1>Rechnungen</h1><a href="/files/kw47.pdf">KW 47</a> <a href="/files/kw48.csv">KW 48</a>');
      if (s === 'twofa') return html('<h1>Bestätigen</h1><input autocomplete="one-time-code">');
      res.writeHead(302, { location: '/login' }); return res.end();
    }
    if (req.url === '/login') return html('<form><input name="user"><input type="password"></form>');
    if (req.url.startsWith('/files/')) {
      if (s !== 'ok') { res.writeHead(302, { location: '/login' }); return res.end(); }
      const pdf = req.url.endsWith('.pdf');
      res.writeHead(200, { 'content-type': pdf ? 'application/pdf' : 'text/csv', 'content-disposition': `attachment; filename="${pdf ? 'Lieferando_KW47.pdf' : 'Abrechnung_KW48.csv'}"` });
      return res.end(pdf ? PDF : CSV);
    }
    res.writeHead(404); res.end();
  }).listen(0);
  ingest = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const j = JSON.parse(b || '{}');
      if (req.url.endsWith('/ingest')) uploads.push({ ...j, key: req.headers['x-nara-service-key'] });
      else alerts.push(j);
      res.writeHead(req.url.endsWith('/ingest') ? 201 : 200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
  }).listen(0);
  base = `http://127.0.0.1:${portal.address().port}`; ingestBase = `http://127.0.0.1:${ingest.address().port}`;
  const { chromium } = require('playwright');
  try { browser = await chromium.launch({ headless: true, ...(process.env.FLAMO_PW_CHANNEL ? { channel: process.env.FLAMO_PW_CHANNEL } : {}) }); } catch { browser = null; }
});
test.after(async () => { if (browser) await browser.close(); portal && portal.close(); ingest && ingest.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const session = (name, value) => { const f = path.join(tmp, name + '.json'); fs.writeFileSync(f, JSON.stringify({ cookies: value ? [{ name: 'sess', value, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }] : [], origins: [] })); return f; };
const cfg = (sess, extra = {}) => ({ server: ingestBase, baseDir: tmp, stateFile: 'state.json', platforms: [{ id: 'LIEFERANDO', enabled: true, session: sess, statementsUrl: base + '/statements', loginUrlPattern: 'login', loginSelector: 'input[type=password]', twoFactorSelector: 'input[autocomplete=one-time-code]', linkSelector: 'a[href*="/files/"]', ...extra }] });

test('gültige Sitzung: neue Abrechnungen einmal an /ingest (COLLECTOR), beim nächsten Lauf nichts doppelt', async t => {
  if (!browser) return t.skip('kein Playwright-Browser (FLAMO_PW_CHANNEL=msedge setzen)');
  uploads.length = 0; alerts.length = 0;
  const sessFile = session('ok', 'ok'), before = fs.readFileSync(sessFile, 'utf8');
  const r = await C.runCollector(cfg(sessFile), { browser, log: () => {}, serviceKey: 'svc' });
  assert.equal(r[0].status, 'OK'); assert.equal(r[0].sent, 2);
  assert.deepEqual(uploads.map(u => u.filename).sort(), ['Abrechnung_KW48.csv', 'Lieferando_KW47.pdf']);
  const pdf = uploads.find(u => u.filename.endsWith('.pdf'));
  assert.equal(pdf.source, 'COLLECTOR'); assert.equal(pdf.platform, 'LIEFERANDO'); assert.equal(pdf.key, 'svc'); assert.equal(pdf.mime, 'application/pdf');
  assert.equal(Buffer.from(pdf.data, 'base64').toString(), PDF.toString());
  const again = await C.runCollector(cfg(sessFile), { browser, log: () => {}, serviceKey: 'svc' });
  assert.equal(again[0].sent, 0); assert.equal(uploads.length, 2); assert.equal(alerts.length, 0);
  assert.equal(fs.readFileSync(sessFile, 'utf8'), before, 'Sitzungsdatei wird nie überschrieben');
});

test('abgelaufene Sitzung → ruhig stoppen, Hinweis SESSION_EXPIRED, nichts hochgeladen, kein Login-Versuch', async t => {
  if (!browser) return t.skip('kein Playwright-Browser');
  uploads.length = 0; alerts.length = 0;
  const r = await C.runCollector({ ...cfg(session('old', 'expired')), stateFile: 'state-2.json' }, { browser, log: () => {} });
  assert.equal(r[0].status, 'SESSION_EXPIRED'); assert.equal(uploads.length, 0);
  assert.deepEqual(alerts, [{ platform: 'LIEFERANDO', type: 'SESSION_EXPIRED' }]);
});

test('2FA verlangt → Hinweis TWO_FACTOR; keine Sitzungsdatei → NO_SESSION (ohne Browser)', async t => {
  if (!browser) return t.skip('kein Playwright-Browser');
  uploads.length = 0; alerts.length = 0;
  const r = await C.runCollector({ ...cfg(session('twofa', 'twofa')), stateFile: 'state-3.json' }, { browser, log: () => {} });
  assert.equal(r[0].status, 'TWO_FACTOR'); assert.equal(uploads.length, 0);
  const n = await C.runCollector({ ...cfg(path.join(tmp, 'fehlt.json')), stateFile: 'state-4.json' }, { browser, log: () => {} });
  assert.equal(n[0].status, 'NO_SESSION');
  assert.deepEqual(alerts.map(a => a.type), ['TWO_FACTOR', 'NO_SESSION']);
});

test('Sammler ist getrennt von den Live-Brücken und speichert nie eine Sitzung', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'platform-statements-collector.mjs'), 'utf8');
  assert.doesNotMatch(src, /storageState\(\s*\{\s*path/, 'keine Sitzung zurückschreiben');
  assert.doesNotMatch(src, /launchPersistentContext/, 'kein Profil der Live-Brücken');
  assert.doesNotMatch(src, /\/api\/platform-orders\//, 'kein Status der Live-Brücken setzen');
  assert.doesNotMatch(src, /\.fill\(|type\(\s*['"]password/i, 'kein automatisches Einloggen');
  const PI = require('../platform-ingest.js');
  for (const t of PI.COLLECTOR_TYPES) assert.ok(PI.collectorAlertText('LIEFERANDO', t).length > 20);
  const A = require('../auth.js');
  assert.equal(A.policyFor('POST', '/api/accounting/platform-statements/ingest'), 'service');
  assert.equal(A.policyFor('POST', '/api/accounting/platform-statements/collector-alert'), 'service');
  assert.ok(Array.isArray(A.policyFor('POST', '/api/accounting/platform-statements/inbox/decide')), 'Freigabe nur mit Rolle');
});
