'use strict';
// data-guard.js — Datei-Schutz für das Geschäfts-PC-Setup (Strom weg, Platte voll, halb geschriebene Datei):
//  • readJsonRecovering: liest eine JSON-Datei; ist sie kaputt → automatisch aus .bak oder dem neuesten Tages-Backup,
//    die kaputte Datei wandert in „*.corrupt-<Zeit>“ (nie löschen!).
//  • dailyBackup: pro Tag einmal gzip-Kopie der Datendateien in backups/<Tag>/, die letzten N Tage bleiben.
//  • rotateLog: Logdatei wird kopiert + geleert, wenn sie zu groß wird (funktioniert auch, wenn cmd sie mit >> offen hält).
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');

const stamp = (t = Date.now()) => new Date(t).toISOString().replace(/[:.]/g, '-');
const localDay = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

function parseFile(file, validate) {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (validate) validate(obj);
  return obj;
}

// Kandidaten in Reihenfolge: .bak, dann Tages-Backups (neueste zuerst)
function candidates(file, backupsDir) {
  const list = [{ from: path.basename(file) + '.bak', read: v => parseFile(file + '.bak', v) }];
  if (backupsDir && fs.existsSync(backupsDir)) {
    const days = fs.readdirSync(backupsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const d of days) {
      const gz = path.join(backupsDir, d, path.basename(file) + '.gz');
      if (fs.existsSync(gz)) list.push({ from: `backups/${d}`, read: v => { const o = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8')); if (v) v(o); return o; } });
    }
  }
  return list;
}

function atomicWrite(file, text) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

// → { data, source: 'main' | '<bak/backup>' }; wirft nur, wenn weder Datei noch irgendein Backup lesbar ist
function readJsonRecovering(file, { validate, backupsDir, log = console.error, onRecover } = {}) {
  try { return { data: parseFile(file, validate), source: 'main' }; } catch (e) {
    if (e && e.code === 'ENOENT') throw e;
    const firstError = e;
    for (const c of candidates(file, backupsDir)) {
      let data;
      try { data = c.read(validate); } catch (err) { continue; }
      let quarantined = null;
      try { quarantined = file + '.corrupt-' + stamp(); fs.renameSync(file, quarantined); } catch (err) { quarantined = null; }
      try { atomicWrite(file, JSON.stringify(data, null, 2)); } catch (err) { log('[NARA][RECOVER] Wiederherstellung konnte nicht geschrieben werden:', err.message); }
      log(`[NARA][RECOVER] ${path.basename(file)} war beschädigt (${firstError.message}) → wiederhergestellt aus ${c.from}`);
      if (onRecover) { try { onRecover({ file: path.basename(file), from: c.from, error: firstError.message, quarantined }); } catch (err) { /* ignore */ } }
      return { data, source: c.from };
    }
    const fatal = new Error(`${path.basename(file)} ist beschädigt und es gibt kein lesbares Backup: ${firstError.message}`);
    fatal.code = 'NO_BACKUP';
    throw fatal;
  }
}

async function gzipTo(src, dest) {
  const tmp = dest + '.tmp-' + process.pid;
  await pipeline(fs.createReadStream(src), zlib.createGzip({ level: 6 }), fs.createWriteStream(tmp));
  // Prüfung: Archiv muss sich komplett entpacken lassen und genauso groß sein wie die Quelle
  let n = 0;
  await pipeline(fs.createReadStream(tmp), zlib.createGunzip(), async function (stream) { for await (const chunk of stream) n += chunk.length; });
  if (n !== fs.statSync(src).size) { fs.rmSync(tmp, { force: true }); throw new Error('Backup-Prüfung fehlgeschlagen: ' + path.basename(src)); }
  fs.renameSync(tmp, dest);
}

// Einmal pro Tag. Gibt { created, pruned, skipped } zurück; Fehler pro Datei landen in errors (Aufrufer alarmiert).
async function dailyBackup(files, backupsDir, { keep = 14, now = Date.now() } = {}) {
  const day = localDay(now), dir = path.join(backupsDir, day), out = { day, created: [], pruned: [], skipped: [], errors: [] };
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const dest = path.join(dir, path.basename(f) + '.gz');
    if (fs.existsSync(dest)) { out.skipped.push(path.basename(f)); continue; }
    try { await gzipTo(f, dest); out.created.push(path.basename(f)); } catch (e) { out.errors.push({ file: path.basename(f), error: e.message }); }
  }
  const days = fs.readdirSync(backupsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const d of days.slice(0, Math.max(0, days.length - keep))) { fs.rmSync(path.join(backupsDir, d), { recursive: true, force: true }); out.pruned.push(d); }
  return out;
}

function backupInfo(backupsDir) {
  try {
    const days = fs.readdirSync(backupsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    return { count: days.length, last: days[days.length - 1] || null };
  } catch (e) { return { count: 0, last: null }; }
}

function rotateLog(file, { maxBytes = 20 * 1024 * 1024, keep = 3 } = {}) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size <= maxBytes) return false;
    for (let i = keep; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`, to = `${file}.${i}`;
      if (fs.existsSync(from)) { if (i === keep) fs.rmSync(to, { force: true }); fs.copyFileSync(from, to); }
    }
    fs.truncateSync(file, 0);
    return true;
  } catch (e) { return false; }
}

module.exports = { readJsonRecovering, dailyBackup, backupInfo, rotateLog, atomicWrite, localDay };
