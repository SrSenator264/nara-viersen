'use strict';
// index.js — startet den Hub. Alles per .env (nie im Git). Standard = Testmodus (HUB_DRY_RUN=0 schaltet scharf).
const path = require('path');
const env = process.env, dryRun = env.HUB_DRY_RUN !== '0', stateDir = env.HUB_STATE_DIR || path.join(__dirname, 'state');
const hubMod = require('./hub'), apprMod = require('./approvals'), tgMod = require('./telegram');
const send = (text, o) => tg.send(text, o);
const hub = hubMod.create({ stateDir, dryRun, env, notify: async (key, text, o) => { await send(text, o); }, ask: req => approvals.request(req) });
const approvals = apprMod.create({ stateDir, dryRun, send, runAction: (a, act, p) => hub.runAction(a, act, p) });
const tg = tgMod.create({
  env,
  onCallback: async d => { const m = /^ap:([a-z0-9]+):([yn])$/.exec(d); return m ? approvals.resolve(m[1], m[2] === 'y') : { answer: '?' }; },
  onCommand: async (cmd, args) => {
    if (cmd === '/stop') { hub.stop(); return '⛔ وقّفت كل الوكلاء. للتشغيل: /resume'; }
    if (cmd === '/resume') { if (args[0]) { hub.unpause(args[0]); return '▶️ رجّعت ' + args[0]; } hub.resume(); return '▶️ كل الوكلاء رجعوا'; }
    if (cmd === '/status') return hub.status();
    return null;
  },
});
if (env.FLAMO_URL) hub.register(require('./agents/watchdog').create({ url: env.FLAMO_URL }));
hub.register(require('./agents/mail-triage').create({ dir: env.MAIL_INBOX_DIR }));
if (env.NIGHTLY_CWD) hub.register(require('./agents/nightly-tests').create({ cwd: env.NIGHTLY_CWD, cmd: env.NIGHTLY_CMD || 'npm run test:e2e', dailyAt: env.NIGHTLY_AT || '03:00' }));
tg.start();
setInterval(() => hub.tick().catch(e => console.error('[HUB] tick', e.message)), 30000);
send(`${dryRun ? '🧪' : '🚀'} مركز الوكلاء اشتغل\n${hub.status()}`);
console.log('[HUB] up, dryRun=' + dryRun);
