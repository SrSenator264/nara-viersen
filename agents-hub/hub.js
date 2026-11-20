'use strict';
// hub.js — Kern vom Agents-Hub: Zeitplan, Not-Aus, Fehler-Pause, Tageslimit, Protokoll. Keine Abhängigkeiten.
// Ein Agent = { name, title, everyMs | dailyAt:'HH:MM', maxRunsPerDay?, run(ctx), actions?:{ name(payload) } }
const fs = require('fs'), path = require('path');

function create({ stateDir, notify = async () => {}, ask = null, now = () => Date.now(), log = console.log, dryRun = true, env = process.env, maxFailures = 3 } = {}) {
  if (!stateDir) throw new Error('stateDir fehlt');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'agents.json'), runsFile = path.join(stateDir, 'runs.jsonl'), stopFile = path.join(stateDir, 'STOP');
  const agents = new Map();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (_) {}
  const save = () => { try { fs.writeFileSync(stateFile, JSON.stringify(state, null, 1)); } catch (e) { log('[HUB] state save', e.message); } };
  const st = n => (state[n] = state[n] || { paused: false, failures: 0, lastRun: 0, day: '', runsToday: 0 });
  const dayKey = t => new Date(t).toISOString().slice(0, 10);
  const record = o => { try { fs.appendFileSync(runsFile, JSON.stringify(Object.assign({ at: new Date(now()).toISOString() }, o)) + '\n'); } catch (_) {} };

  const isStopped = () => fs.existsSync(stopFile);
  const stop = () => { fs.writeFileSync(stopFile, new Date(now()).toISOString()); };
  const resume = () => { try { fs.unlinkSync(stopFile); } catch (_) {} };
  const register = a => { if (!a || !a.name || typeof a.run !== 'function') throw new Error('Agent ungültig'); agents.set(a.name, a); st(a.name); return a; };

  function isDue(a) {
    const s = st(a.name), t = now();
    if (s.paused) return false;
    if (a.everyMs) return t - s.lastRun >= a.everyMs;
    if (a.dailyAt) {
      const [h, m] = a.dailyAt.split(':').map(Number), d = new Date(t); d.setHours(h, m, 0, 0);
      return t >= d.getTime() && s.lastRun < d.getTime();
    }
    return false;
  }

  async function runAgent(name, { force = false } = {}) {
    const a = agents.get(name); if (!a) return { ok: false, error: 'unbekannt' };
    if (isStopped()) return { ok: false, skipped: 'stopped' };
    const s = st(name), t = now();
    if (s.paused && !force) return { ok: false, skipped: 'paused' };
    if (s.day !== dayKey(t)) { s.day = dayKey(t); s.runsToday = 0; }
    if (a.maxRunsPerDay && s.runsToday >= a.maxRunsPerDay && !force) return { ok: false, skipped: 'daily-limit' };
    s.runsToday++; s.lastRun = t;
    const ctx = {
      dryRun, env, now, log: (...x) => log('[' + name + ']', ...x),
      notify: (key, text, o) => notify(name + ':' + key, (dryRun ? '🧪 ' : '') + text, o),
      ask: (req) => (ask ? ask(Object.assign({ agent: name }, req)) : null),
    };
    try {
      const res = await a.run(ctx);
      s.failures = 0; save(); record({ agent: name, ok: true, dryRun, res: res && res.summary });
      return { ok: true, res };
    } catch (e) {
      s.failures++; record({ agent: name, ok: false, error: String(e && e.message || e) });
      if (s.failures >= maxFailures) { s.paused = true; await notify(name + ':paused', `⛔ الوكيل «${a.title || name}» وقف بعد ${s.failures} أخطاء متتالية: ${String(e && e.message || e).slice(0, 200)}\nللتشغيل: /resume ${name}`, { force: true }); }
      save(); return { ok: false, error: String(e && e.message || e) };
    }
  }

  async function tick() {
    if (isStopped()) return [];
    const out = [];
    for (const a of agents.values()) if (isDue(a)) out.push([a.name, await runAgent(a.name)]);
    return out;
  }
  const unpause = name => { const s = st(name); s.paused = false; s.failures = 0; save(); };
  const runAction = (agentName, action, payload) => { const a = agents.get(agentName); if (!a || !a.actions || !a.actions[action]) throw new Error('Aktion unbekannt'); return a.actions[action](payload, { dryRun, env, now }); };
  function status() {
    const lines = [isStopped() ? '⛔ المركز موقوف (/resume)' : '✅ المركز شغّال', dryRun ? '🧪 وضع التجربة (dry-run)' : '🚀 وضع حقيقي'];
    for (const a of agents.values()) { const s = st(a.name); lines.push(`${s.paused ? '⏸️' : '🟢'} ${a.title || a.name}` + (s.lastRun ? ' · آخر تشغيل ' + new Date(s.lastRun).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ' · ما اشتغل بعد')); }
    return lines.join('\n');
  }
  return { register, runAgent, tick, stop, resume, isStopped, unpause, runAction, status, isDue, _state: () => state };
}
module.exports = { create };
