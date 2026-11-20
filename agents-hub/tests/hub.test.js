'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const hubMod = require('../hub'), apprMod = require('../approvals'), tgMod = require('../telegram');
const mail = require('../agents/mail-triage'), wd = require('../agents/watchdog'), nt = require('../agents/nightly-tests');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));

test('Zeitplan: everyMs wird fällig, Not-Aus stoppt alles', async () => {
  let t = 1e12, runs = 0; const h = hubMod.create({ stateDir: tmp(), now: () => t, log: () => {} });
  h.register({ name: 'a', everyMs: 1000, run: async () => { runs++; } });
  await h.tick(); assert.equal(runs, 1); await h.tick(); assert.equal(runs, 1);
  t += 1500; h.stop(); await h.tick(); assert.equal(runs, 1);
  h.resume(); await h.tick(); assert.equal(runs, 2);
});
test('dailyAt läuft einmal pro Tag', async () => {
  const d = new Date(); d.setHours(12, 0, 0, 0); let t = d.getTime() + 60000, runs = 0;
  const h = hubMod.create({ stateDir: tmp(), now: () => t, log: () => {} });
  h.register({ name: 'n', dailyAt: '03:00', run: async () => { runs++; } });
  await h.tick(); await h.tick(); assert.equal(runs, 1);
});
test('3 Fehler in Folge pausieren den Agenten und melden', async () => {
  const msgs = []; let t = 1e12; const h = hubMod.create({ stateDir: tmp(), now: () => t, notify: async (k, x) => msgs.push(x), log: () => {} });
  h.register({ name: 'bad', title: 'سيء', everyMs: 1, run: async () => { throw new Error('boom'); } });
  for (let i = 0; i < 4; i++) { t += 10; await h.tick(); }
  assert.equal(h._state().bad.paused, true); assert.equal(h._state().bad.failures, 3); assert.ok(msgs.some(m => /وقف/.test(m)));
  h.unpause('bad'); assert.equal(h._state().bad.paused, false);
});
test('Tageslimit', async () => {
  let t = 1e12, runs = 0; const h = hubMod.create({ stateDir: tmp(), now: () => t, log: () => {} });
  h.register({ name: 'l', everyMs: 1, maxRunsPerDay: 2, run: async () => { runs++; } });
  for (let i = 0; i < 5; i++) { t += 10; await h.tick(); } assert.equal(runs, 2);
});
test('Freigabe: Test-Modus führt nichts aus, scharf führt aus, Ablauf, Doppelklick', async () => {
  const dir = tmp(), sent = []; let t = 1e12, did = [];
  const mk = dry => apprMod.create({ stateDir: dir, dryRun: dry, now: () => t, send: async (x, o) => sent.push([x, o]), runAction: async (a, act, p) => did.push([a, act, p]) });
  let ap = mk(true); const id = await ap.request({ agent: 'x', action: 'go', payload: { n: 1 }, title: 'T' });
  assert.match(sent[0][1].buttons[0][0].callback_data, /^ap:/);
  assert.match((await ap.resolve(id, true)).answer, /تجربة/); assert.equal(did.length, 0);
  ap = mk(false); const id2 = await ap.request({ agent: 'x', action: 'go', payload: { n: 2 }, title: 'T2' });
  await ap.resolve(id2, true); await ap.resolve(id2, true); assert.equal(did.length, 1);
  const id3 = await ap.request({ agent: 'x', action: 'go', title: 'T3' }); t += 25 * 3600e3;
  assert.match((await ap.resolve(id3, true)).answer, /انتهت/); assert.equal(did.length, 1);
  const id4 = await ap.request({ agent: 'x', action: 'go', title: 'T4' }); await ap.resolve(id4, false); assert.equal(did.length, 1);
});
test('Telegram: Fremde Chats werden ignoriert, Befehl und Knopf funktionieren', async () => {
  const calls = [], cmds = []; const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '5' };
  const tg = tgMod.create({ env, fetchFn: async (u, o) => { calls.push(u); return { ok: true, json: async () => ({ result: [] }) }; }, onCommand: async c => { cmds.push(c); return 'ok'; }, onCallback: async d => ({ answer: d }), log: () => {} });
  await tg.handle({ message: { chat: { id: 9 }, text: '/stop' } }); assert.equal(cmds.length, 0);
  await tg.handle({ message: { chat: { id: 5 }, text: '/stop@bot' } }); assert.deepEqual(cmds, ['/stop']);
  await tg.handle({ callback_query: { id: 'c', data: 'ap:x:y', message: { chat: { id: 5 } } } });
  assert.ok(calls.some(u => /answerCallbackQuery/.test(u)));
});
test('Mails: wichtig erkannt, Test-Modus lässt Dateien liegen', async () => {
  assert.deepEqual(mail.classify({ from: 'service@telekom.de', subject: 'Ihre Rechnung' }).tags, ['Telekom']);
  assert.equal(mail.classify({ from: 'x@spam.com', subject: 'Angebot' }).important, false);
  assert.ok(mail.classify({ from: 'a@b.de', subject: 'Mahnung Nr. 3' }).tags.includes('عاجل'));
  const dir = tmp(), msgs = []; fs.writeFileSync(path.join(dir, '1.json'), JSON.stringify({ id: '1', from: 'noreply@finanzamt.de', subject: 'Bescheid' }));
  const a = mail.create({ dir }); await a.run({ dryRun: true, notify: async (k, x) => msgs.push(x) });
  assert.equal(msgs.length, 1); assert.ok(fs.existsSync(path.join(dir, '1.json')));
  await a.run({ dryRun: false, notify: async () => {} }); assert.ok(fs.existsSync(path.join(dir, 'processed', '1.json')));
});
test('Watchdog: erst nach 2 Fehlern, dann Entwarnung', async () => {
  let ok = false; const msgs = []; const a = wd.create({ url: 'http://x', fetchFn: async () => { if (!ok) throw new Error('down'); return { ok: true, status: 200 }; } });
  const ctx = { notify: async (k, x) => msgs.push(k) };
  await a.run(ctx); assert.equal(msgs.length, 0); await a.run(ctx); await a.run(ctx); assert.deepEqual(msgs, ['down']);
  ok = true; await a.run(ctx); assert.deepEqual(msgs, ['down', 'up']);
});
test('Nachttests: Erfolg und Fehler melden', async () => {
  const msgs = []; const ctx = { notify: async (k, x) => msgs.push([k, x]) };
  await nt.create({ run: async () => ({ code: 0, out: 'ok' }) }).run(ctx);
  await nt.create({ run: async () => ({ code: 1, out: 'l1\nFAILED login' }) }).run(ctx);
  assert.equal(msgs[0][0], 'ok'); assert.equal(msgs[1][0], 'fail'); assert.match(msgs[1][1], /FAILED login/);
  const r = await nt.runCmd('node', ['-e', 'console.log(42)'], process.cwd(), 5000); assert.equal(r.code, 0); assert.match(r.out, /42/);
});
