'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const MA = require('../manager-agent.js');
const PM = require('../project-map.js');
const A = require('../auth.js');
const root = path.join(__dirname, '..');

test('Projektkarte: findet Seiten, Code, APIs; keine Geheimnisse/Daten', () => {
  const m = PM.build(root);
  assert.ok(m.length > 100);
  const srv = m.find(e => e.file === 'server.js'); assert.ok(srv.apis.includes('/api/manager/chat'));
  assert.ok(m.find(e => e.file === 'kasse.html').scripts.includes('kasse.js'));
  assert.ok(!m.some(e => /^data\/|\.env/.test(e.file)));
  assert.match(PM.toMarkdown(m), /## Seiten \(HTML\)/);
});

test('Werkzeuge: Karte, Suche, Datei lesen (gesperrt: data/.env/..), git, Status, Buchhalter, Aufgaben', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgr-')), tasks = MA.taskStore(path.join(dir, 't.json'));
  const T = MA.makeTools({ root, status: () => ({ ok: 1 }), askAccountant: async q => 'A:' + q, tasks, git: () => ({ status: 0, stdout: '@@abc|2026-11-20|kitchen: sound\nkitchen.js\n@@def|2026-11-19|fix\n' }) });
  assert.ok((await T.run('project_map', { query: 'tagesabschluss' })).count >= 1);
  const s = await T.run('search_code', { text: 'function taskPrompt', in: 'manager' }); assert.equal(s.hits[0].file, 'manager-agent.js');
  const r = await T.run('read_file', { file: 'business-day.js', from: 1, to: 5 }); assert.match(r.content, /^1: /);
  for (const bad of ['data/nara-admin.json', '.env', '../etc/passwd', '/etc/passwd', 'tunnel/../.env', 'x.pem']) assert.ok((await T.run('read_file', { file: bad })).error, bad);
  const g = await T.run('git_log', {}); assert.equal(g.commits[0].title, 'kitchen: sound'); assert.deepEqual(g.commits[0].files, ['kitchen.js']);
  assert.deepEqual(await T.run('live_status', {}), { ok: 1 });
  assert.equal((await T.run('ask_accountant', { question: 'Umsatz?' })).answer, 'A:Umsatz?');
  assert.ok((await T.run('create_task', { title: 'x' })).error);
  const c = await T.run('create_task', { title: 'Küchenton', change: 'Ton bei NEW', dod: 'Ton spielt', risk: 'low' }); assert.equal(c.task.status, 'OPEN');
  assert.equal((await T.run('list_tasks', {})).tasks.length, 1);
  assert.equal(tasks.setStatus(c.task.id, 'DONE').status, 'DONE'); assert.equal(tasks.setStatus(c.task.id, 'BAD'), null);
  assert.match(MA.taskPrompt(c.task), /Definition of Done: Ton spielt/);
});

test('chat: Schleife mit Fake-Adapter, Systemprompt Shami + nur-lesen', async () => {
  let sys = null;
  const adapter = { name: 'f', init: (s, h, u) => { sys = s; return { n: 0 }; }, async call(st) { st.n++; return st.n === 1 ? { text: '', calls: [{ id: '1', name: 'live_status', args: {} }], usage: { in: 5, out: 1 } } : { text: 'كلو تمام', calls: [], usage: { in: 5, out: 2 } }; }, addResults() {}, finalNoTools: async () => ({ text: 'x', usage: { in: 0, out: 0 } }) };
  const tools = MA.makeTools({ root, status: () => ({ fine: true }) });
  const r = await MA.chat({ message: 'كيف الشغل؟' }, { adapter, tools, today: '2026-11-21', root });
  assert.equal(r.ok, true); assert.equal(r.reply, 'كلو تمام'); assert.deepEqual(r.toolsUsed, ['live_status']);
  assert.match(sys, /Shami/); assert.match(sys, /cannot change code/); assert.match(sys, /create_task/);
  assert.match(MA.providerFromEnv({ ANTHROPIC_API_KEY: 'k' }).name, /^anthropic:/);
  assert.equal(MA.providerFromEnv({}), null);
});

test('Rechte: manager.html nur Inhaber/Manager, Module nicht öffentlich', () => {
  assert.deepEqual(A.PAGE_ROLES['manager.html'], ['OWNER', 'MANAGER']);
  assert.equal(A.staticAllowed('manager-agent.js'), false); assert.equal(A.staticAllowed('project-map.js'), false);
  assert.deepEqual(A.policyFor ? A.policyFor('POST', '/api/manager/chat') : ['OWNER', 'MANAGER'], ['OWNER', 'MANAGER']);
});
