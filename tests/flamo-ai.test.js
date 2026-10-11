'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), { spawn } = require('node:child_process');
const F = require('../flamo-ai.js');

// ── Einheit: Tools + Entwurf mit Fake-Adapter und Fake-Preislogik ──
const menu = [
  { id: 1, s: 'burger', g: 'Beef Burger', n: 'Smashed Beef Burger', d: 'Zwei Patties, Cheddar.', p: 899, mc: 1399, md: 'mit Pommes und Getränk', o: [{ g: '__drink', r: true, x: [{ i: 'cola', n: 'Cola', c: 0 }] }] },
  { id: 2, s: 'crispy', g: 'Wings', n: 'Korean Wings', d: 'Scharf, 6 Stück.', p: 1199 },
  { id: 3, s: 'drinks', g: 'Softdrinks', n: 'Cola 0,33 l', d: 'kalt', p: 250 },
];
const W = {
  productFor: id => (id === 3 ? null : { id }), // Cola gerade nicht verfügbar
  priceLine: l => { const m = menu.find(x => x.id === l.id); if (!m) throw Object.assign(new Error('Produkt nicht verfügbar.'), { code: 'UNAVAILABLE', id: l.id });
    if (l.m && !l.o.length) throw Object.assign(new Error('Bitte Auswahl treffen'), { code: 'REQUIRED', group: '__drink', id: l.id });
    const unit = l.m ? m.mc : m.p; return { id: m.id, name: m.n, quantity: l.q, unitCents: unit, totalCents: unit * l.q, options: l.o.map(o => ({ name: o.i })) }; },
};
const fake = script => { let i = 0; return { name: 'fake', init: (s, h, u) => ({ s, h, u, seen: [] }), call: async st => { const r = script[i++]; st.seen.push(r); return { text: r.text || '', calls: r.calls || [], usage: { in: 100, out: 20 } }; }, addResults: (st, c, res) => { st.results = (st.results || []).concat(res); } }; };

test('search only returns available items and honours category / max price', () => {
  const ex = F.makeExec({ menu, W, catalog: [], products: [] });
  assert.deepEqual(ex.run('search_menu', { query: 'cola' }).results, []);
  assert.equal(ex.run('search_menu', { query: 'wings' }).results[0].id, 2);
  assert.equal(ex.run('search_menu', { category: 'burger', max_price_eur: 5 }).results.length, 0);
  assert.equal(ex.run('get_item', { id: 3 }).error, 'unknown or unavailable id');
  assert.equal(ex.run('get_item', { id: 1 }).option_groups[0].group, '__drink');
});

test('price_order: server price, errors surface to the model, draft only after success', () => {
  const ex = F.makeExec({ menu, W, catalog: [], products: [] });
  assert.equal(ex.getDraft(), null);
  assert.equal(ex.run('price_order', { lines: [{ id: 1, qty: 1, menu: true }] }).code, 'REQUIRED');
  assert.equal(ex.getDraft(), null);
  const ok = ex.run('price_order', { lines: [{ id: 1, qty: 2, menu: true, options: [{ group: '__drink', option_id: 'cola' }] }, { id: 2, qty: 1 }] });
  assert.equal(ok.total_eur, '39.97'); // 2*13.99 + 11.99
  const d = ex.getDraft(); assert.equal(d.totalCents, 3997); assert.deepEqual(d.lines[0].o, [{ g: '__drink', i: 'cola' }]); assert.equal(d.lines[0].u, 1399);
  assert.equal(ex.run('price_order', { lines: [{ id: 99, qty: 1 }] }).code, 'UNAVAILABLE');
});

test('chat loop: tool call → priced draft; model cannot invent a draft', async () => {
  const a = fake([{ calls: [{ id: 'a', name: 'price_order', args: { lines: [{ id: 2, qty: 1 }] } }] }, { text: '{"reply":"Gute Wahl! Tippe auf den Knopf.","show_draft":true}' }]);
  const r = await F.chat({ message: 'Wings bitte', lang: 'de' }, { adapter: a, menu, W, catalog: [], products: [] });
  assert.equal(r.ok, true); assert.equal(r.draft.totalCents, 1199); assert.equal(r.rounds, 2); assert.deepEqual(r.usage, { in: 200, out: 40 });
  const b = fake([{ text: '{"reply":"Alles klar.","show_draft":true}' }]); // behauptet Entwurf ohne price_order
  const r2 = await F.chat({ message: 'hi' }, { adapter: b, menu, W, catalog: [], products: [] });
  assert.equal(r2.ok, true); assert.equal(r2.draft, null);
});

test('chat: plain text answers are tolerated, bold kept, endless tool loops stopped', async () => {
  const r = await F.chat({ message: 'x' }, { adapter: fake([{ text: '**Hallo** da!' }]), menu, W, catalog: [], products: [] });
  assert.equal(r.reply, '**Hallo** da!');
  const loop = fake(Array.from({ length: 10 }, () => ({ calls: [{ id: 'x', name: 'search_menu', args: {} }] })));
  const l = await F.chat({ message: 'x' }, { adapter: loop, menu, W, catalog: [], products: [] });
  assert.equal(l.ok, false); assert.equal(l.code, 'LOOP');
});

test('prompt: language, cart and injection rules are present', () => {
  const p = F.systemPrompt({ lang: 'ar', cart: [{ name: 'Wings', qty: 2 }] });
  assert.match(p, /Arabic/); assert.match(p, /Wings/); assert.match(p, /untrusted/); assert.match(p, /show_draft/); assert.match(p, /ASK FIRST/); assert.match(p, /Never pick a drink/);
});

test('provider choice: Gemini first, explicit override, none without keys', () => {
  assert.equal(F.providerFromEnv({ GEMINI_API_KEY: 'k', OPENAI_API_KEY: 'k' }).name.startsWith('gemini:'), true);
  assert.equal(F.providerFromEnv({ GEMINI_API_KEY: 'k', OPENAI_API_KEY: 'k', NARA_AI_PROVIDER: 'openai' }).name.startsWith('openai'), true);
  assert.equal(F.providerFromEnv({ ANTHROPIC_API_KEY: 'k' }).name.startsWith('anthropic:'), true);
  assert.equal(F.providerFromEnv({}), null);
});

test('usage store: monthly counter and cost', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nara-use-')), 'u.json');
  const s = F.usageStore(f, () => new Date('2026-10-11T10:00:00Z'));
  s.add({ in: 1_000_000, out: 100_000 }, 1, 5); const u = s.add({ in: 0, out: 0 }, 1, 5);
  assert.equal(u.calls, 2); assert.equal(u.costEur, 1.5);
  assert.equal(F.usageStore(f, () => new Date('2026-11-01T00:00:00Z')).get().costEur, 0); // neuer Monat
});

// ── Server E2E mit gefälschtem Gemini ──
const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-flamo-'));
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007', 'flamo-source']);
const port = 5300 + Math.floor(Math.random() * 300), fport = port + 400, base = `http://127.0.0.1:${port}`;
let proc, fakeSrv, calls = [];
async function startServer(env) {
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_GEOCODE: 'off', GEMINI_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', ANTHROPIC_API_KEY: '', NARA_AI_PROVIDER: '', ...env }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
}
const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data')); fs.writeFileSync(path.join(tmp, '.env'), 'X=1\n');
  fakeSrv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = JSON.parse(b || '{}'); calls.push({ url: req.url, key: req.headers['x-goog-api-key'], body });
    const last = body.contents[body.contents.length - 1], hasResult = last.parts.some(p => p.functionResponse);
    const parts = hasResult ? [{ text: '{"reply":"Probier die Wings, sie sind scharf! Mit Cola?","show_draft":false}' }] : [{ functionCall: { name: 'search_menu', args: { query: 'Wings' } } }];
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }], usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 100 } }));
  }); }).listen(fport);
  await startServer({ GEMINI_API_KEY: 'test-key', NARA_AI_BASE_URL: `http://127.0.0.1:${fport}`, NARA_AI_MONTHLY_CAP_EUR: '0.01', NARA_AI_PRICE_IN_EUR_PER_M: '1', NARA_AI_PRICE_OUT_EUR_PER_M: '5' });
});
test.after(() => { proc && proc.kill(); fakeSrv && fakeSrv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('server: public chat uses Gemini with tools, key stays server-side, monthly cap pauses the AI', async () => {
  assert.equal((await fetch(base + '/api/flamo/status').then(r => r.json())).ai, true);
  const r = await post('/api/flamo/chat', { message: 'Ich will scharfe Wings', lang: 'de', history: [], cart: [] });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(r.json.reply, /Wings/); assert.equal(r.json.draft, null);
  assert.equal(calls.length, 2); assert.equal(calls[0].key, 'test-key'); assert.ok(calls[0].body.tools[0].functionDeclarations.length === 3);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /Flamo/);
  const toolResult = calls[1].body.contents.at(-1).parts[0].functionResponse.response; assert.ok(toolResult.results.length >= 1); // echtes Menü
  // 2 Aufrufe × 4000 Tokens = 0,008 € + Ausgabe → Limit 0,01 € erreicht nach dem nächsten Chat
  await post('/api/flamo/chat', { message: 'noch eine Frage', lang: 'de' });
  const capped = await post('/api/flamo/chat', { message: 'und noch eine', lang: 'de' });
  assert.equal(capped.status, 503); assert.equal(capped.json.code, 'CAP');
  assert.equal((await fetch(base + '/api/flamo/status').then(r => r.json())).ai, false);
});

test('server: AI off without any key', async () => {
  proc.kill(); await new Promise(r => setTimeout(r, 300)); await startServer({});
  assert.equal((await fetch(base + '/api/flamo/status').then(r => r.json())).ai, false);
  const r = await post('/api/flamo/chat', { message: 'hallo' }); assert.equal(r.status, 503); assert.equal(r.json.code, 'AI_OFF');
});

test('price_order: missing choice returns options + stop instruction; exhausted loop gets a final tool-less answer', async () => {
  const ex = F.makeExec({ menu, W, catalog: [], products: [] });
  const e = ex.run('price_order', { lines: [{ id: 1, qty: 1, menu: true }] });
  assert.equal(e.missing_group, '__drink'); assert.match(e.instruction, /Ask the customer/); assert.ok(e.options.length >= 1);
  const loop = fake(Array.from({ length: 10 }, () => ({ calls: [{ id: 'x', name: 'search_menu', args: {} }] })));
  loop.finalNoTools = async () => ({ text: '{"reply":"Welches Getränk?","show_draft":false}', calls: [], usage: { in: 1, out: 1 } });
  const r = await F.chat({ message: 'x' }, { adapter: loop, menu, W, catalog: [], products: [] });
  assert.equal(r.ok, true); assert.equal(r.reply, 'Welches Getränk?');
});

test('chat: glued bold names are restored to the menu name; draft shown when the reply points at the button', async () => {
  const ex = [{ calls: [{ id: 'a', name: 'price_order', args: { lines: [{ id: 2, qty: 1 }] } }] }, { text: '{"reply":"Hier: **KoreanWings** ist bereit, tippe auf den Button.","show_draft":false}' }];
  const r = await F.chat({ message: 'x' }, { adapter: fake(ex), menu, W, catalog: [], products: [] });
  assert.equal(r.reply, 'Hier: **Korean Wings** ist bereit, tippe auf den Button.');
  assert.ok(r.draft && r.draft.totalCents === 1199);
});
