'use strict';
// reminders.js — تذكيرات يومية (خبز + Loco) على تلغرام وبوب-أب بالكاشير.
// ملف لحالو: data/reminders.json (بالنسخ الاحتياطي). المنطق كله دوال صافية → بيتجرّب بدون مؤقتات.
//  • الخبز: تذكير كل يوم بالوقت المحدد (14:00) لحد ما حدا يضغط "انطلب"؛ العدّاد من 3 طلبيات بالأسبوع (الأسبوع من الاثنين).
//  • Loco: بعد "انطلب" بيسكت locoDays (3) أيام، وبعدين بيرجع يذكّر كل يوم لحد ما تضغط "انطلب" مرة ثانية.
//  • تلغرام مرة وحدة باليوم لكل تذكير؛ إذا فشل الإرسال بيعيد المحاولة بالدقيقة الجاية.
const fs = require('fs');
const path = require('path');

const IDS = ['bread', 'loco', 'meat'];
const DEFAULTS = { time: '14:00', locoDays: 3, breadWeekly: 3, meatTime: '15:00', meatDays: 1 };
const LOG_KEEP = 60;
const pad = n => String(n).padStart(2, '0');
const ymd = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const weekStart = ms => { const d = new Date(ms); const back = (d.getDay() + 6) % 7; return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime()); };
const str = v => (v == null ? '' : String(v));

function emptyState() { return { version: 1, settings: { ...DEFAULTS }, log: { bread: [], loco: [], meat: [] }, sent: {} }; }
function cleanSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const hm = (v, def) => { const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(str(v).trim()); return m ? `${pad(Number(m[1]))}:${m[2]}` : def; };
  const int = (v, lo, hi, def) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : def; };
  return { time: hm(o.time, DEFAULTS.time), locoDays: int(o.locoDays, 1, 14, DEFAULTS.locoDays), breadWeekly: int(o.breadWeekly, 1, 7, DEFAULTS.breadWeekly), meatTime: hm(o.meatTime, DEFAULTS.meatTime), meatDays: int(o.meatDays, 1, 14, DEFAULTS.meatDays) };
}
function normalize(st) {
  const o = st && typeof st === 'object' ? st : {};
  const lg = o.log && typeof o.log === 'object' ? o.log : {};
  const clean = a => (Array.isArray(a) ? a.filter(x => x && Number.isFinite(Date.parse(x.at))).map(x => ({ at: new Date(x.at).toISOString(), by: str(x.by).slice(0, 60) })).slice(-LOG_KEEP) : []);
  return { version: 1, settings: cleanSettings(o.settings), log: { bread: clean(lg.bread), loco: clean(lg.loco), meat: clean(lg.meat) }, sent: o.sent && typeof o.sent === 'object' ? o.sent : {} };
}
function load(file) { try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { return emptyState(); } }
function write(file, st) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(st));
  fs.renameSync(file + '.tmp', file);
}

// حالة كل تذكير بهاللحظة
function status(state, now = Date.now()) {
  const st = normalize(state), s = st.settings, today = ymd(now);
  const d = new Date(now), minNow = d.getHours() * 60 + d.getMinutes();
  const after = t => { const [hh, mm] = t.split(':').map(Number); return minNow >= hh * 60 + mm; };
  const afterTime = after(s.time), afterMeat = after(s.meatTime);
  const last = id => st.log[id][st.log[id].length - 1] || null;
  const lastDay = id => (last(id) ? ymd(Date.parse(last(id).at)) : null);

  const wk = weekStart(now);
  const weekCount = st.log.bread.filter(x => weekStart(Date.parse(x.at)) === wk).length;
  const bread = { id: 'bread', orderedToday: lastDay('bread') === today, weekCount, weekTarget: s.breadWeekly, last: last('bread') };
  bread.due = afterTime && !bread.orderedToday;

  const lastL = lastDay('loco');
  const loco = { id: 'loco', orderedToday: lastL === today, last: last('loco'), intervalDays: s.locoDays };
  loco.daysSince = lastL ? dayNum(today) - dayNum(lastL) : null;
  loco.eligible = lastL == null || loco.daysSince >= s.locoDays; // انتهت فترة السكوت
  loco.due = afterTime && !loco.orderedToday && loco.eligible;
  loco.nextEligibleIn = loco.eligible ? 0 : s.locoDays - loco.daysSince;
  const lastM = lastDay('meat');
  const meat = { id: 'meat', orderedToday: lastM === today, last: last('meat'), intervalDays: s.meatDays, time: s.meatTime };
  meat.daysSince = lastM ? dayNum(today) - dayNum(lastM) : null;
  meat.eligible = lastM == null || meat.daysSince >= s.meatDays;
  meat.due = afterMeat && !meat.orderedToday && meat.eligible;
  meat.nextEligibleIn = meat.eligible ? 0 : s.meatDays - meat.daysSince;
  return { today, time: s.time, afterTime, bread, loco, meat, settings: s };
}

const fmtWhen = a => (a ? `${a.by ? a.by + ' · ' : ''}${ymd(Date.parse(a.at))}` : 'ما تسجلت طلبية قبل');
function message(id, stt) {
  if (id === 'bread') {
    const b = stt.bread;
    return `🍞 تذكير الخبز: لسا ما انطلب خبز اليوم.\nطلبيات هالأسبوع: ${b.weekCount} من ${b.weekTarget}\nلما تطلبوا اضغطوا "انطلب ✅" بالكاشير أو بصفحة التنبيهات.`;
  }
  if (id === 'meat') {
    const m = stt.meat;
    return `🥩 تذكير اللحم: شيّكوا إذا بدنا لحم.\n${m.daysSince == null ? 'ما تسجلت طلبية قبل' : `مرّ ${m.daysSince} أيام على آخر طلبية`}\nآخر طلبية: ${fmtWhen(m.last)}\nلما تطلبوا اضغطوا "انطلب ✅".`;
  }
  const l = stt.loco;
  return `🧊 تذكير Loco: ${l.daysSince == null ? 'ما تسجلت طلبية قبل' : `مرّ ${l.daysSince} أيام على آخر طلبية`}.\nشيّكوا البرادات واعملوا جرد، وبعدين اطلبوا.\nآخر طلبية: ${fmtWhen(l.last)}\nلما تطلبوا اضغطوا "انطلب ✅".`;
}

// أزرار تلغرام تحت كل تذكير: انطلب / لسا
const buttons = id => [[{ text: 'انطلب ✅', callback_data: `rem:done:${id}` }, { text: 'لسا ⏳', callback_data: `rem:later:${id}` }]];
// ضغطة زر من تلغرام. بيرجّع { state?, answer, edit? } — state جديد بس إذا انسجل "انطلب"
function handleCallback(state, data, who = '', now = Date.now()) {
  if (/^rem:test:(done|later)$/.test(str(data))) return { answer: 'الزر شغال ✅ (تجربة، ما تسجل شي)', edit: '✅ الزر شغال (تجربة)' };
  const m = /^rem:(done|later):(\w+)$/.exec(str(data));
  if (!m || !IDS.includes(m[2])) return null;
  if (m[1] === 'later') return { answer: 'تمام، بنذكّركم 👍' };
  const cur = status(state, now)[m[2]];
  if (cur.orderedToday) return { answer: 'تسجلت قبل ✅', edit: `✅ انطلب${cur.last && cur.last.by ? ' — ' + cur.last.by : ''}` }; // شخص ثاني ضغط قبلك: ما بنسجّل مرتين
  const r = markDone(state, m[2], who, now);
  if (!r.ok) return null;
  return { state: r.state, answer: 'تم ✅', edit: `✅ انطلب${who ? ' — ' + who : ''}` };
}

// تسجيل "انطلب". بيرجّع { ok, state, error }
function markDone(state, id, user = '', now = Date.now()) {
  if (!IDS.includes(id)) return { ok: false, error: 'bad-id' };
  const st = normalize(state);
  st.log[id].push({ at: new Date(now).toISOString(), by: str(user).slice(0, 60) });
  st.log[id] = st.log[id].slice(-LOG_KEEP);
  return { ok: true, state: st };
}
function setSettings(state, patch) {
  const st = normalize(state);
  st.settings = cleanSettings({ ...st.settings, ...(patch && typeof patch === 'object' ? patch : {}) });
  return st;
}

// كل دقيقة: إذا فات الوقت وفي تذكير مستحق ما انبعت اليوم → ابعته. بيرجّع الحالة الجديدة وهل تغيّر شي.
async function tick({ state, alerts, now = Date.now() }) {
  const st = normalize(state), stt = status(st, now);
  let changed = false;
  for (const id of IDS) {
    if (!stt[id].due || st.sent[id] === stt.today) continue;
    const r = await alerts.send(`reminder-${id}-${stt.today}`, message(id, stt), { level: 'warn', force: true, buttons: buttons(id) });
    // not-configured = ما في تلغرام: الكاشير بيعرض البوب-أب، فما في داعي نعيد كل دقيقة
    if (r && (r.sent || r.reason === 'not-configured')) { st.sent[id] = stt.today; changed = true; }
  }
  return { state: st, changed };
}

const testButtons = () => [[{ text: 'انطلب ✅', callback_data: 'rem:test:done' }, { text: 'لسا ⏳', callback_data: 'rem:test:later' }]];
module.exports = { testButtons, buttons, handleCallback, IDS, DEFAULTS, emptyState, normalize, load, write, status, message, markDone, setSettings, tick, ymd, weekStart };
