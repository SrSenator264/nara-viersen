'use strict';
// accounting-weekly.js — ملخص المحاسبة الأسبوعي على Telegram، كل اثنين الساعة 09:00 (برلين) عن الأسبوع اللي فات (اثنين → أحد).
// قراءة بس. مرة وحدة بالأسبوع، الحالة بملف data/accounting-weekly.json.
const fs = require('fs'), path = require('path');
const SL = require('./sales-ledger.js');
const AH = require('./accounting-health.js');
const AN = require('./accounting-anomalies.js');

const TZ = 'Europe/Berlin', SEND_DOW = 1, SEND_MIN = 9 * 60;
const eur = c => (Math.round(Number(c) || 0) / 100).toFixed(2).replace('.', ',') + ' €';
const fmt = d => d.split('-').reverse().join('.');
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const invCents = i => { for (const k of ['totalAmountCents', 'totalCents', 'grossAmountCents']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k])); for (const k of ['totalAmount', 'grossAmount']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k]) * 100); return 0; };
const PL = { LIEFERANDO: 'Lieferando', UBER_EATS: 'Uber Eats', WOLT: 'Wolt', LANCH: 'Lanch' };
const AN_AR = { DUP_INVOICE: 'فاتورة مكررة', PRICE_JUMP: 'سعر طلع', CASH_DIFF: 'فرق بالصندوق', LOW_SALES_DAY: 'يوم مبيعات واطي', OLD_UNMATCHED: 'بنك بدون مطابقة', NO_DOCUMENT: 'فاتورة بدون مستند', VAT_ON_KLEIN: 'ضريبة على الإيصال وإنت Kleinunternehmer' };
const DL_AR = { minijobReport: 'Minijob: Beitragsnachweis', minijobPay: 'Minijob: الدفع', monthClose: 'إقفال الشهر', gewstPre: 'دفعة Gewerbesteuer', estPre: 'دفعة ضريبة الدخل', ustVa: 'USt-Voranmeldung', annual: 'الإقرارات السنوية', kassenmeldung: 'تسجيل الكاشير بـ ELSTER' };

function berlin(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, minutes: Number(p.hour) * 60 + Number(p.minute), dow: new Date(date + 'T12:00:00Z').getUTCDay() };
}
// آخر أحد خلص أسبوعو ووقت إرسالو فات
function dueWeekEnd(nowMs) {
  const b = berlin(nowMs), back = (b.dow - SEND_DOW + 7) % 7;
  let monday = addDays(b.date, -back);
  if (back === 0 && b.minutes < SEND_MIN) monday = addDays(monday, -7);
  return addDays(monday, -1);
}

function compose(data, weekEnd) {
  const from = addDays(weekEnd, -6), prevFrom = addDays(from, -7), prevTo = addDays(from, -1);
  const l = SL.build(data, from, weekEnd), p = SL.build(data, prevFrom, prevTo);
  const own = l.own.totals.grossCents, plat = l.platform.totals.grossCents, total = own + plat, prev = p.own.totals.grossCents + p.platform.totals.grossCents;
  const pct = prev ? Math.round((total - prev) / prev * 100) : null;
  const inv = (data.invoices || []).filter(i => { const d = String(i.invoiceDate || i.createdAt || '').slice(0, 10); return d >= from && d <= weekEnd; });
  const sup = new Map((data.suppliers || []).map(s => [String(s.id), s.name])), bySup = {};
  for (const i of inv) { const n = i.supplierName || sup.get(String(i.supplierId)) || '?'; bySup[n] = (bySup[n] || 0) + invCents(i); }
  const topSup = Object.entries(bySup).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const today = addDays(weekEnd, 1), h = AH.build(data, { today }), k = h.klein, m = h.month;
  const an = AN.detect(data, { today, lookbackDays: 7 });
  const lines = [`📚 ملخص المحاسبة الأسبوعي ${fmt(from)} – ${fmt(weekEnd)}`, ''];
  lines.push(`💶 المبيعات: ${eur(total)}` + (pct == null ? '' : ` (${pct >= 0 ? '+' : ''}${pct}% عن الأسبوع اللي قبل)`));
  lines.push(`   🏪 المحل والموقع: ${eur(own)} · 🛵 المنصات: ${eur(plat)}`);
  for (const [pf, c] of Object.entries(l.platform.totals.byPlatform || {})) lines.push(`      ${PL[pf] || pf}: ${eur(c)}`);
  lines.push('', `🧾 فواتير المشتريات: ${inv.length} · ${eur(inv.reduce((s, i) => s + invCents(i), 0))}`);
  for (const [n, c] of topSup) lines.push(`   • ${n}: ${eur(c)}`);
  lines.push('', `📏 حد § 19: ${eur(k.ytdCents)} من 100.000 € (${Math.round(k.ytdCents / k.limitCurCents * 100)}%)` + (k.status === 'OVER' ? ' ⛔' : k.status === 'WARN' ? ' ⚠️' : ' ✅'));
  lines.push(`🗓️ إقفال الشهر: ${m.done}/${m.total} خالصين`);
  const todo = m.items.filter(i => i.status === 'warn' || i.status === 'todo');
  if (todo.length) lines.push('   ناقص: ' + todo.map(i => ({ closings: 'تقفيلات', tse: 'TSE', bank: 'البنك', belege: 'فواتير للمراجعة', journal: 'قيود', period: 'قفل الشهر' }[i.key]) + (i.count ? ' (' + i.count + ')' : '')).join('، '));
  if (an.length) { lines.push('', '⚠️ غير طبيعي:'); for (const a of an.slice(0, 6)) lines.push(`   • ${AN_AR[a.type] || a.type}` + (a.date ? ' ' + fmt(a.date) : '') + (a.item ? ' · ' + a.item + ' +' + a.changePct + '%' : '') + (a.differenceCents ? ' · ' + eur(a.differenceCents) : '')); }
  const dl = h.deadlines.filter(d => d.date <= addDays(today, 14));
  if (dl.length) { lines.push('', '⏰ مواعيد الأسبوعين الجايين:'); for (const d of dl) lines.push(`   • ${fmt(d.date)}: ${DL_AR[d.key] || d.key}`); }
  lines.push('', '🤖 لأي تفصيل: صفحة المحاسب الذكي بـ Flamo.');
  return { text: lines.join('\n'), from, to: weekEnd, totalCents: total };
}

function loadState(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { return {}; } }
function saveState(file, st) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(st)); fs.renameSync(file + '.tmp', file); }

async function tick({ readData, alerts, file, now = Date.now() }) {
  const end = dueWeekEnd(now), st = loadState(file);
  if (st.lastWeekEnd && st.lastWeekEnd >= end) return { sent: false, reason: 'done', weekEnd: end };
  if (!st.lastWeekEnd) { saveState(file, { lastWeekEnd: end, at: new Date(now).toISOString(), note: 'first-run-skip' }); return { sent: false, reason: 'first-run', weekEnd: end }; }
  const { text } = compose(readData(), end);
  const r = await alerts.send('accounting-weekly-' + end, text, { force: true, level: 'info' });
  if (r && (r.sent || r.reason === 'not-configured')) { saveState(file, { lastWeekEnd: end, at: new Date(now).toISOString() }); return { sent: !!r.sent, weekEnd: end }; }
  return { sent: false, reason: (r && r.reason) || 'failed', weekEnd: end };
}

module.exports = { compose, tick, dueWeekEnd, berlin };
