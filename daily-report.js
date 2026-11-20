'use strict';
// daily-report.js — تقرير آخر اليوم على Telegram (قراءة بس، ما بيغيّر أي بيانات).
// الأرقام من نفس حساب التقفيلة (day-closing.build)، والمقارنة مع نفس اليوم الأسبوع الماضي.
// مرة وحدة لكل يوم شغل: الحالة بملف data/daily-report.json. إذا السيرفر كان طافي وقت التقرير بيبعته لما يرجع (آخر يوم بس).
const fs = require('fs'), path = require('path');
const DC = require('./day-closing.js');

const SEND_AT = '23:30';                 // بتوقيت برلين
const TZ = 'Europe/Berlin';
const PLATFORM_LABEL = { LIEFERANDO: 'Lieferando', UBER_EATS: 'Uber Eats', WOLT: 'Wolt', LANCH: 'Lanch', SIDES: 'Sides', LOCO: 'Loco Chicken' };
const up = v => String(v == null ? '' : v).toUpperCase();
const eur = c => (Math.round(Number(c) || 0) / 100).toFixed(2).replace('.', ',') + ' €';

// تاريخ وساعة برلين لهاللحظة
function berlin(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const addDays = (day, n) => { const t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// آخر يوم شغل فات وقت تقريرو
function dueDay(nowMs, sendAt = SEND_AT) {
  const b = berlin(nowMs), [h, m] = sendAt.split(':').map(Number);
  return b.minutes >= h * 60 + m ? b.date : addDays(b.date, -1);
}

// أرقام يوم واحد (من التقفيلة + عدد طلبات الموقع)
function summarize(data, day) {
  const r = DC.build(data, day, { mode: 'REAL' });
  const web = (data.orders || []).filter(o => (up(o.source) === 'WEB' || up(o.platform) === 'WEB') && !o.isTest && !o.training
    && up(o.status) !== 'CANCELLED' && DC_day(o) === day).length;
  const platforms = r.platform.rows.map(x => ({ key: x.key, count: x.count, grossCents: x.grossCents }));
  const ownCount = r.counts.orders, platCount = platforms.reduce((s, x) => s + x.count, 0);
  return {
    day, ownCount, webCount: Math.min(web, ownCount), ownGrossCents: r.net.grossCents,
    cashCents: r.net.cashCents, cardCents: r.net.cardCents, otherCents: r.revenue.otherCents - r.storno.otherCents,
    platforms, platformGrossCents: r.platform.grossCents,
    totalCount: ownCount + platCount, totalCents: r.net.grossCents + r.platform.grossCents,
    cancelled: r.cancelled.count + r.platform.cancelled, storno: r.storno.count,
  };
}
const bizDay = require('./business-day.js');
const DC_day = o => bizDay.dayOf(o.createdAt || o.placedAt);

// شو غير طبيعي (فاضي = ما في شي)
function anomalies(t, w) {
  const out = [];
  if (w.totalCents > 0 && t.totalCents < w.totalCents / 2) out.push(`المبيعات أقل من نص الأسبوع الماضي (${eur(t.totalCents)} مقابل ${eur(w.totalCents)})`);
  for (const p of w.platforms) if (p.count >= 3 && !t.platforms.some(x => x.key === p.key && x.count > 0)) out.push(`ولا طلب من ${PLATFORM_LABEL[p.key] || p.key} (الأسبوع الماضي ${p.count})`);
  const lost = t.cancelled + t.storno;
  if (lost >= 3) out.push(`${lost} طلبات ملغاة أو مرجّعة`);
  return out;
}

function diff(now, before) {
  if (!before) return now ? ' 🆕' : '';
  const p = Math.round((now - before) / before * 100);
  return p === 0 ? ' (=)' : ` (${p > 0 ? '▲' : '▼'}${Math.abs(p)}%)`;
}

function compose(data, day) {
  const t = summarize(data, day), w = summarize(data, addDays(day, -7));
  const [y, m, d] = day.split('-');
  const lines = [`📊 تقرير اليوم ${d}.${m}.${y}`, ''];
  if (!t.totalCount && !t.cancelled && !t.storno) lines.push('ما في طلبات اليوم.');
  else {
    lines.push(`🧾 الطلبات: ${t.totalCount}${diff(t.totalCount, w.totalCount)}`);
    lines.push(`💶 المبيعات: ${eur(t.totalCents)}${diff(t.totalCents, w.totalCents)}`);
    lines.push('');
    lines.push(`🏪 المحل والموقع: ${t.ownCount} طلب · ${eur(t.ownGrossCents)}` + (t.webCount ? ` (منها الموقع ${t.webCount})` : ''));
    lines.push(`   💵 كاش ${eur(t.cashCents)} · 💳 كارت ${eur(t.cardCents)}` + (t.otherCents ? ` · أونلاين/غيره ${eur(t.otherCents)}` : ''));
    for (const p of t.platforms) lines.push(`🛵 ${PLATFORM_LABEL[p.key] || p.key}: ${p.count} طلب · ${eur(p.grossCents)}`);
    if (t.cancelled || t.storno) lines.push(`❌ ملغي: ${t.cancelled}` + (t.storno ? ` · مرجّع (Storno): ${t.storno}` : ''));
  }
  const warn = anomalies(t, w);
  if (warn.length) { lines.push('', '⚠️ غير طبيعي:'); for (const x of warn) lines.push('• ' + x); }
  lines.push('', `مقارنة مع ${addDays(day, -7).split('-').reverse().join('.')}`);
  return { text: lines.join('\n'), today: t, lastWeek: w, warnings: warn };
}

function loadState(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { return {}; } }
function saveState(file, st) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(st)); fs.renameSync(file + '.tmp', file); }

// كل دقيقة: إذا في تقرير مستحق وما انبعت، ابعتو. الحالة بتنحفظ بس إذا الإرسال نجح.
async function tick({ readData, alerts, file, now = Date.now(), sendAt = SEND_AT }) {
  const day = dueDay(now, sendAt), st = loadState(file);
  if (st.lastSentDay && st.lastSentDay >= day) return { sent: false, reason: 'done', day };
  const { text } = compose(readData(), day);
  const r = await alerts.send('daily-report-' + day, text, { force: true, level: 'info' });
  if (r && (r.sent || r.reason === 'not-configured')) { saveState(file, { lastSentDay: day, at: new Date(now).toISOString() }); return { sent: !!r.sent, day }; }
  return { sent: false, reason: (r && r.reason) || 'failed', day };
}

module.exports = { compose, summarize, anomalies, dueDay, tick, berlin, SEND_AT };
