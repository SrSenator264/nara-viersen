'use strict';
// order-archive.js — أرشفة أسبوعية: الطلبات القديمة بتنتقل من nara-admin.json لملفات data/archive/YYYY-MM.json (ملف لكل شهر).
// - مش حذف: كل شي بيضل محفوظ (Aufbewahrungspflicht 10 سنين)، والتقارير بتقرا من الأرشيف تلقائياً (withArchive).
// - بينتقل بس الطلب: أقدم من keepDays (افتراضي 90 يوم) + مسكّر (مدفوع/ملغي/مستورنو) + يومو مقفّل (Tagesabschluss)
//   أو يوم ما فيه مبيعات كاشير حقيقية (منصات/تدريب بس).
// - مع الطلب: دفعاته، إيصالاته، سجلات الـTSE، وأحداث السجل (auditEvents) تبعه.
// - الأمان: الأرشيف بينكتب أول وبينقرا من جديد للتأكد، وبعدين بس الملف الأساسي. أي فرق بالعدد = ولا شي بيتغيّر.
//   لو انقطعت الكهرباء بالنص: السجل ممكن يكون بالمكانين، withArchive بتشيل التكرار (الأساسي أولاً).
const fs = require('node:fs'), path = require('node:path');
const bizDay = require('./business-day.js');
const SL = require('./sales-ledger.js');

const COLL = ['orders', 'payments', 'receipts', 'fiscalTransactions', 'auditEvents'];
const CLOSED = /^(COMPLETED|CANCELLED|CANCELED|STORNIERT|DONE|DELIVERED|REFUNDED|VOID)$/i;
const DAY_MS = 864e5;

const dayOfOrder = o => bizDay.dayOf(o.completedAt || o.placedAt || o.createdAt || o.acceptedAt || o.updatedAt || '');
const monthOf = day => String(day || '').slice(0, 7);
const isTraining = o => o && (o.training === true || o.isTest === true);

// أيام فيها مبيعات كاشير حقيقية بدون Tagesabschluss → ما بنأرشف منها شي
function unclosedSalesDays(data) {
  const closed = new Set((data.dayClosings || []).filter(s => s && s.mode !== 'TRAINING' && s.type === 'CLOSING').map(s => s.day));
  const byId = new Map((data.orders || []).map(o => [String(o.id), o]));
  const out = new Set();
  for (const p of data.payments || []) {
    if (p.isTest) continue;
    const o = byId.get(String(p.orderId));
    if (!o || isTraining(o) || SL.platformOf(o)) continue;
    const d = bizDay.dayOf(p.createdAt || '');
    if (d && !closed.has(d)) out.add(d);
  }
  return out;
}

// شو بينتقل؟ (بدون أي تعديل)
function plan(data, { now = Date.now(), keepDays = 90 } = {}) {
  const cutoff = bizDay.day(now - keepDays * DAY_MS);
  const blocked = unclosedSalesDays(data);
  const payDays = new Map(); // كل أيام دفعات الطلب (دفعة مقسومة على يومين)
  for (const p of data.payments || []) { const k = String(p.orderId); (payDays.get(k) || payDays.set(k, new Set()).get(k)).add(bizDay.dayOf(p.createdAt || '')); }
  const ids = new Set(), monthOfId = new Map();
  for (const o of data.orders || []) {
    if (!o || o.id == null || !CLOSED.test(String(o.status || ''))) continue;
    const day = dayOfOrder(o);
    if (!day || day >= cutoff) continue;
    const days = [day, ...(payDays.get(String(o.id)) || [])];
    if (days.some(d => !d || d >= cutoff || (!isTraining(o) && blocked.has(d)))) continue;
    ids.add(String(o.id)); monthOfId.set(String(o.id), monthOf(day));
  }
  return { cutoff, ids, monthOfId };
}

// بيقسم السجلات: {keep: data بدون المؤرشف, months: {'2026-08': {orders:[…], …}}}
function split(data, p) {
  const months = {}, keep = {};
  const bucket = m => (months[m] ||= Object.fromEntries(COLL.map(c => [c, []])));
  for (const c of COLL) {
    keep[c] = [];
    for (const x of data[c] || []) {
      const oid = c === 'orders' ? String(x && x.id) : x && x.orderId != null ? String(x.orderId) : null;
      if (oid && p.ids.has(oid)) bucket(p.monthOfId.get(oid))[c].push(x); else keep[c].push(x);
    }
  }
  return { keep, months };
}

const fileOf = (dir, m) => path.join(dir, m + '.json');
function readMonth(dir, m) {
  try { const j = JSON.parse(fs.readFileSync(fileOf(dir, m), 'utf8')); for (const c of COLL) if (!Array.isArray(j[c])) j[c] = []; return j; }
  catch (e) { if (e.code === 'ENOENT') return Object.fromEntries(COLL.map(c => [c, []])); throw e; }
}
function writeMonth(dir, m, obj) {
  fs.mkdirSync(dir, { recursive: true });
  const f = fileOf(dir, m), tmp = f + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify({ month: m, updatedAt: new Date().toISOString(), ...obj }), 'utf8');
  fs.renameSync(tmp, f);
}
const keyOf = (c, x) => c + ':' + String(x && x.id);
const mergeInto = (target, add) => { for (const c of COLL) { const seen = new Set(target[c].map(x => String(x && x.id))); for (const x of add[c]) if (!seen.has(String(x && x.id))) target[c].push(x); } return target; };

// الأرشفة الفعلية. readAdminData/writeAdminData من السيرفر (الكتابة الأخيرة بخطوة وحدة متزامنة).
// بترجع {moved, months, sizeBefore, sizeAfter} أو بترمي خطأ (code ARCHIVE_MISMATCH) بدون ما تغيّر الملف الأساسي.
function run({ readAdminData, writeAdminData, dir, now = Date.now(), keepDays = 90, dataFile }) {
  const data = readAdminData();
  const p = plan(data, { now, keepDays });
  if (!p.ids.size) return { moved: 0, records: 0, months: [], cutoff: p.cutoff };
  const { keep, months } = split(data, p);
  // Sicherheitskopie des Hauptfiles direkt vor dem Verschieben (immer nur die letzte, die Tages-Backups gibt es zusätzlich)
  if (dataFile) { try { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(dataFile, path.join(dir, 'pre-archive-copy.json.bak')); } catch (e) { const er = new Error('Sicherheitskopie vor der Archivierung fehlgeschlagen: ' + e.message); er.code = 'ARCHIVE_BACKUP'; throw er; } }
  // 1) الأرشيف أولاً (دمج مع الموجود)، وبعدين نقرا من جديد ونتأكد إنو كل سجل منقول موجود حرفياً
  for (const [m, add] of Object.entries(months)) writeMonth(dir, m, mergeInto(readMonth(dir, m), add));
  let records = 0;
  for (const [m, add] of Object.entries(months)) {
    const back = readMonth(dir, m), have = new Map();
    for (const c of COLL) for (const x of back[c]) have.set(keyOf(c, x), JSON.stringify(x));
    for (const c of COLL) for (const x of add[c]) {
      records++;
      if (have.get(keyOf(c, x)) !== JSON.stringify(x)) { const e = new Error('Archiv-Prüfung fehlgeschlagen (' + m + ', ' + c + ' ' + (x && x.id) + ') — nichts verschoben.'); e.code = 'ARCHIVE_MISMATCH'; throw e; }
    }
  }
  // 2) العدد: قبل = بعد (أساسي + منقول)
  for (const c of COLL) {
    const moved = Object.values(months).reduce((s, b) => s + b[c].length, 0);
    if ((data[c] || []).length !== keep[c].length + moved) { const e = new Error('Archiv-Zählung stimmt nicht (' + c + ') — nichts verschoben.'); e.code = 'ARCHIVE_MISMATCH'; throw e; }
  }
  // 3) الملف الأساسي: نقرا من جديد (كتابة بخطوة وحدة متزامنة) ونشيل بس السجلات المنقولة
  const size = () => { try { return fs.statSync(dataFile).size; } catch { return null; } };
  const sizeBefore = dataFile ? size() : null;
  const fresh = readAdminData();
  for (const c of COLL) fresh[c] = (fresh[c] || []).filter(x => { const oid = c === 'orders' ? String(x && x.id) : x && x.orderId != null ? String(x.orderId) : null; return !(oid && p.ids.has(oid)); });
  writeAdminData(fresh);
  clearCache();
  return { moved: p.ids.size, records, months: Object.keys(months).sort(), cutoff: p.cutoff, sizeBefore, sizeAfter: dataFile ? size() : null };
}

// ── القراءة: التقارير بتشوف الأرشيف ──────────────────────────────────────────
const cache = new Map(); // file → {mtimeMs, size, data}
function clearCache() { cache.clear(); }
function cachedMonth(dir, m) {
  const f = fileOf(dir, m); let st;
  try { st = fs.statSync(f); } catch { return null; }
  const c = cache.get(f);
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.data;
  const d = readMonth(dir, m); cache.set(f, { mtimeMs: st.mtimeMs, size: st.size, data: d }); return d;
}
function listMonths(dir) {
  try { return fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 7)).sort(); } catch { return []; }
}
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number), t = new Date(Date.UTC(y, mo - 1 + n, 1)); return t.toISOString().slice(0, 7); };

// نسخة من data فيها كمان السجلات المؤرشفة للفترة [from..to] (شهر زيادة من كل جهة: دفعة بيوم تاني)، أو كل الأرشيف لو from/to فاضيين.
// ما بتغيّر data الأصلي (للقراءة بس — ما تنكتب أبداً بـwriteAdminData).
function withArchive(data, dir, from, to) {
  const all = listMonths(dir); if (!all.length) return data;
  const lo = from ? addMonths(monthOf(from), -1) : '0000-00', hi = to ? addMonths(monthOf(to), 1) : '9999-99';
  const pick = all.filter(m => m >= lo && m <= hi); if (!pick.length) return data;
  const out = { ...data };
  Object.defineProperty(out, '__archiveView', { value: true }); // Schutz: writeAdminData lehnt diese Ansicht ab
  for (const c of COLL) {
    const seen = new Set((data[c] || []).map(x => String(x && x.id))), arr = (data[c] || []).slice();
    for (const m of pick) { const d = cachedMonth(dir, m); if (!d) continue; for (const x of d[c]) { const k = String(x && x.id); if (!seen.has(k)) { seen.add(k); arr.push(x); } } }
    out[c] = arr;
  }
  return out;
}
function files(dir) { return listMonths(dir).map(m => fileOf(dir, m)); }

// حالة للصفحة: آخر تشغيل + عدد ملفات الأرشيف
const stateFile = dir => path.join(dir, 'archive-state.json');
function readState(dir) { try { return JSON.parse(fs.readFileSync(stateFile(dir), 'utf8')); } catch { return {}; } }
function writeState(dir, s) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stateFile(dir), JSON.stringify(s), 'utf8'); }

// الجدول: الاثنين بعد الساعة 4 الصبح (توقيت برلين)، مرة بالأسبوع
const berlin = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
function due(lastRunAt, now = Date.now()) {
  const parts = Object.fromEntries(berlin.formatToParts(new Date(now)).map(x => [x.type, x.value]));
  if (parts.weekday !== 'Mon' || Number(parts.hour) < 4) return false;
  const last = Date.parse(lastRunAt || '');
  return !(Number.isFinite(last) && now - last < 6 * DAY_MS);
}

module.exports = { plan, split, run, withArchive, files, listMonths, readState, writeState, due, clearCache, COLL };
