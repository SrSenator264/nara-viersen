'use strict';
// monitor.js — Wächter für den Geschäfts-PC, damit du aus der Ferne siehst, wenn etwas hängt:
//  • Event-Loop-Verzögerung (Server „hängt“), Speicher, freier Plattenplatz, Größe der Datendatei
//  • Plattform-Brücken (Lieferando/Uber/Sides) offline oder ausgeloggt
//  • Absturz-/Stromausfall-Erkennung (run-state.json) → Meldung beim nächsten Start
//  • Tages-Backup + Log-Rotation; optionaler „Totmann“-Ping (HEALTHCHECK_URL, z. B. healthchecks.io) fürs Ausfall des ganzen PCs/Internets
// Alles Entscheidende steckt in evaluate() — reine Funktion, deshalb ohne Timer testbar.
const fs = require('node:fs'), path = require('node:path');

const LIMITS = { lagMs: 3000, rssMb: 1500, diskMinMb: 1024, dataMaxMb: 40, bridgeBadMs: 3 * 60000 };

const fmtMin = ms => Math.max(1, Math.round(ms / 60000)) + ' د';
const SRC_NAME = { LIEFERANDO: 'Lieferando', UBER_EATS: 'Uber Eats', SIDES: 'Loco (Sides)', WOLT: 'Wolt', LANCH: 'Lanch' };

// snap: { lagMs, rssMb, diskFreeMb, dataMb, bridges:[{source,state,lastHeartbeatAt}], backupError }
// st: veränderlicher Zustand zwischen Läufen ({ bridgeBad: {src:{since,state,alerted}} })
function evaluate(snap, st, t = Date.now(), limits = LIMITS) {
  const out = [];
  if (snap.lagMs > limits.lagMs) out.push({ key: 'lag', level: 'crit', text: `🧊 السيرفر عم يهنّق: تأخير ${(snap.lagMs / 1000).toFixed(1)} ثانية. إذا استمر، أعد تشغيل الكمبيوتر.` });
  if (snap.rssMb > limits.rssMb) out.push({ key: 'mem', level: 'warn', text: `🧠 ذاكرة السيرفر عالية (${Math.round(snap.rssMb)} MB). بيستحسن إعادة تشغيل بوقت هادي.` });
  if (snap.diskFreeMb != null && snap.diskFreeMb < limits.diskMinMb) out.push({ key: 'disk', level: 'crit', text: `💽 المساحة عالقرص قربت تخلص (${Math.round(snap.diskFreeMb)} MB فاضيين). النسخ الاحتياطي رح يفشل.` });
  if (snap.dataMb > limits.dataMaxMb) out.push({ key: 'datasize', level: 'warn', text: `🗄️ ملف البيانات كبر (${Math.round(snap.dataMb)} MB). لازم نفعّل الأرشفة قبل ما يبطّأ النظام.` });
  if (snap.backupError) out.push({ key: 'backup', level: 'crit', text: `⚠️ النسخة الاحتياطية اليومية فشلت: ${snap.backupError}` });

  st.bridgeBad = st.bridgeBad || {};
  for (const b of snap.bridges || []) {
    if (!b.lastHeartbeatAt) continue; // جسر ما اشتغل أبداً → ما في إنذار كاذب
    const name = SRC_NAME[b.source] || b.source, bad = b.state === 'down' || b.state === 'login', cur = st.bridgeBad[b.source];
    if (bad) {
      if (!cur || cur.state !== b.state) st.bridgeBad[b.source] = { since: t, state: b.state, alerted: false };
      const c = st.bridgeBad[b.source];
      if (!c.alerted && t - c.since >= limits.bridgeBadMs) {
        c.alerted = true;
        out.push({ key: `bridge-${b.source}-${b.state}`, level: 'crit', text: b.state === 'login' ? `🔑 جسر ${name}: لازم تسجيل دخول من جديد. الطلبات ما عم توصل.` : `🔌 جسر ${name} واقف من ${fmtMin(t - c.since)}. الطلبات ما عم توصل.` });
      }
    } else if (cur) {
      if (cur.alerted) out.push({ key: `bridge-${b.source}-ok`, level: 'info', force: true, text: `✅ جسر ${name} رجع يشتغل (كان واقف ${fmtMin(t - cur.since)}).` });
      delete st.bridgeBad[b.source];
    }
  }
  return out;
}

function create({ alerts, platformStatus, dataFile, dataDir, backupsDir, guard, logFile, env = process.env, now = () => Date.now(), log = console.error, fetchFn = (...a) => fetch(...a), limits = LIMITS, backupFiles }) {
  const st = { bridgeBad: {} }, timers = [], runFile = path.join(dataDir, 'run-state.json');
  let lastTs = now(), lagWin = [], backupError = null, lastBackup = null, tickN = 0, started = now(), stopped = false;

  function probeLag() { const t = now(); lagWin.push([t, Math.max(0, t - lastTs - 1000)]); lastTs = t; lagWin = lagWin.filter(x => t - x[0] < 60000); }
  const lagMax = () => lagWin.reduce((m, x) => Math.max(m, x[1]), 0);
  const mb = f => { try { return fs.statSync(f).size / 1048576; } catch (e) { return 0; } };

  function snapshot() {
    let diskFreeMb = null; try { const s = fs.statfsSync(dataDir); diskFreeMb = (s.bavail * s.bsize) / 1048576; } catch (e) { /* alte Node-Version */ }
    const mem = process.memoryUsage();
    return {
      at: new Date(now()).toISOString(), uptimeSec: Math.round((now() - started) / 1000), pid: process.pid,
      lagMs: lagMax(), rssMb: mem.rss / 1048576, heapMb: mem.heapUsed / 1048576, diskFreeMb, dataMb: mb(dataFile),
      bridges: platformStatus ? platformStatus.list(now()) : [],
      backups: Object.assign(guard.backupInfo(backupsDir), { lastRunAt: lastBackup, error: backupError }),
      backupError, telegram: alerts.configured(), deadManSwitch: !!env.HEALTHCHECK_URL, alerts: alerts.recent().slice(0, 15), limits,
    };
  }

  function writeRun(clean) {
    try { fs.writeFileSync(runFile, JSON.stringify({ pid: process.pid, startedAt: new Date(started).toISOString(), lastBeatAt: new Date(now()).toISOString(), cleanExit: !!clean })); } catch (e) { /* ignore */ }
  }
  function detectPreviousCrash() {
    try {
      const prev = JSON.parse(fs.readFileSync(runFile, 'utf8'));
      if (prev && prev.cleanExit === false) {
        const down = now() - Date.parse(prev.lastBeatAt || 0);
        alerts.send('restart', `🔄 السيرفر رجع اشتغل بعد توقف مفاجئ (انقطاع كهرباء، تعطّل، أو إعادة تشغيل). كان واقف حوالي ${fmtMin(down)}.`, { level: 'warn', force: true });
      }
    } catch (e) { /* أول تشغيل */ }
  }

  async function runBackup() {
    try {
      const r = await guard.dailyBackup(backupFiles || [dataFile], backupsDir, { keep: 14, now: now() });
      lastBackup = new Date(now()).toISOString();
      backupError = r.errors.length ? r.errors.map(e => `${e.file}: ${e.error}`).join('; ') : null;
      if (r.created.length) log('[NARA][BACKUP]', r.day, r.created.join(', '));
    } catch (e) { backupError = e.message; }
    return backupError;
  }

  async function tick() {
    if (stopped) return;
    tickN++;
    const snap = snapshot();
    for (const a of evaluate(snap, st, now(), limits)) await alerts.send(a.key, a.text, { level: a.level, force: a.force });
    writeRun(false);
    if (env.HEALTHCHECK_URL && tickN % 2 === 0) { try { await fetchFn(env.HEALTHCHECK_URL, { signal: AbortSignal.timeout(8000) }); } catch (e) { /* offline → Totmann schlägt serverseitig an */ } }
  }

  function start() {
    detectPreviousCrash(); writeRun(false);
    const add = (fn, ms) => { const h = setInterval(() => { Promise.resolve().then(fn).catch(e => log('[NARA][MONITOR]', e && e.message)); }, ms); if (h.unref) h.unref(); timers.push(h); };
    add(probeLag, 1000);
    add(tick, 30000);
    add(() => { if (logFile) guard.rotateLog(logFile); }, 3600000);
    add(runBackup, 3600000); // erste Prüfung nach 20 s, danach stündlich (pro Tag wird nur 1 Backup angelegt)
    const first = setTimeout(() => { runBackup(); if (logFile) guard.rotateLog(logFile); }, 20000); if (first.unref) first.unref(); timers.push(first);
    const bye = () => { writeRun(true); };
    process.on('exit', bye);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { bye(); process.exit(0); });
  }
  function stop() { stopped = true; for (const t of timers) { clearInterval(t); clearTimeout(t); } timers.length = 0; }

  return { start, stop, tick, snapshot, runBackup, evaluate: (snap, t) => evaluate(snap, st, t, limits), _st: st, _probeLag: probeLag };
}

module.exports = { create, evaluate, LIMITS };
