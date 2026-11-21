'use strict';
// accounting-health.js — "مركز المحاسبة": صورة واحدة بسيطة عن وضع الدفاتر.
//   1) حدّ الـ Kleinunternehmer (§19 UStG): مجموع مبيعات السنة (محل + منصات) مقابل 25.000 € (السنة الماضية) و100.000 € (السنة الحالية).
//   2) قائمة إقفال الشهر: أيام فيها بيع بدون تقفيلة، حركات بنك بدون مطابقة، Belege بانتظار مراجعة، قيود مو منشورة، الفترة مقفلة أو لا.
//   3) المواعيد الجاية (تقريبية، السبت/الأحد بينزاح للاثنين، العطل الرسمية مو محسوبة).
// قراءة بس: ما بيكتب ولا بيرحّل شي. مو استشارة ضريبية؛ الأرقام تحضير والقرار عند عمر/المحاسب.

const SL = require('./sales-ledger.js');
const bizDay = require('./business-day.js');

const LIMIT_PREV = 2500000;   // 25.000 € Vorjahr (cents)
const LIMIT_CUR = 10000000;   // 100.000 € laufendes Jahr (cents)
const WARN_SHARE = 0.8;       // ابتداءً من 80% بيصير التنبيه برتقالي

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const isWeekend = d => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const up = v => String(v == null ? '' : v).toUpperCase();

// موعد بيوقع سبت/أحد → الاثنين (§108 Abs. 3 AO). العطل الرسمية مو داخلة.
function shiftWeekend(d) { let x = d; while (isWeekend(x)) x = addDays(x, 1); return x; }
// تالت آخر يوم عمل بالشهر (موعد استحقاق اشتراكات الـ Minijob-Zentrale)
function thirdLastWorkday(y, m) {
  let d = utc(y, m, lastDayOfMonth(y, m)), n = 0;
  for (;;) { if (!isWeekend(d)) { n++; if (n === 3) return d; } d = addDays(d, -1); }
}
function minusWorkdays(d, n) { let x = d; while (n > 0) { x = addDays(x, -1); if (!isWeekend(x)) n--; } return x; }
function addMonth(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number), ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return ymd(utc(ny, nm, Math.min(d, lastDayOfMonth(ny, nm))));
}

// ── 1) مجموع المبيعات لكل شهر بسنة معيّنة ─────────────────────────
function yearRevenue(data, year) {
  const l = SL.build(data, year + '-01-01', year + '-12-31');
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ownCents: 0, platformCents: 0 }));
  for (const r of l.own.rows) { const m = Number(String(r.businessDay).slice(5, 7)); if (m >= 1 && m <= 12) months[m - 1].ownCents += r.grossCents; }
  for (const r of l.platform.rows) { if (r.status !== 'OK') continue; const m = Number(String(r.businessDay).slice(5, 7)); if (m >= 1 && m <= 12) months[m - 1].platformCents += r.grossCents; }
  for (const x of months) x.totalCents = x.ownCents + x.platformCents;
  return { ownCents: l.own.totals.grossCents, platformCents: l.platform.totals.grossCents, totalCents: l.own.totals.grossCents + l.platform.totals.grossCents, months };
}

function kleinunternehmer(data, year, today) {
  const acc = (data.settings && data.settings.accounting) || {};
  const manual = acc.manualRevenueCents || {}; // مبيعات قبل Flamo (مثلاً من الـ Steuerberater) لكل سنة
  const cur = yearRevenue(data, year), prev = yearRevenue(data, year - 1);
  const curManual = Math.max(0, Math.round(Number(manual[year] || 0))), prevManual = Math.max(0, Math.round(Number(manual[year - 1] || 0)));
  const ytdCents = cur.totalCents + curManual, prevYearCents = prev.totalCents + prevManual;
  // توقّع بسيط: معدّل الأيام الماضية من السنة × أيام السنة
  const start = Date.UTC(year, 0, 1), now = Date.parse(today + 'T12:00:00Z');
  const daysGone = Math.max(1, Math.min(366, Math.floor((now - start) / 86400000) + 1));
  const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  const perDay = ytdCents / daysGone, projectedCents = Math.round(perDay * daysInYear);
  let crossDate = null;
  if (ytdCents > LIMIT_CUR) crossDate = 'PASSED';
  else if (perDay > 0) { const d = Math.ceil((LIMIT_CUR - ytdCents) / perDay); const x = addDays(new Date(now), d); if (x.getUTCFullYear() === year) crossDate = ymd(x); }
  const regime = up(acc.vatRegime); // '' (مو محدد) | KLEIN | REGEL
  const prevOver = prevYearCents > LIMIT_PREV, curOver = ytdCents > LIMIT_CUR;
  let status = 'OK';
  if (prevOver || curOver) status = 'OVER';
  else if (ytdCents >= LIMIT_CUR * WARN_SHARE || prevYearCents >= LIMIT_PREV * WARN_SHARE || projectedCents > LIMIT_CUR) status = 'WARN';
  // تعارض: مسجّل Kleinunternehmer والكاشير عم يطبع ضريبة، أو العكس
  const vatOnReceipts = Number(acc.defaultSalesVatRate || 0) > 0;
  const conflict = regime === 'KLEIN' && (vatOnReceipts || status === 'OVER');
  return {
    regime, year, limitPrevCents: LIMIT_PREV, limitCurCents: LIMIT_CUR,
    ytdCents, ownCents: cur.ownCents, platformCents: cur.platformCents, manualCents: curManual,
    prevYearCents, prevYearInSystemCents: prev.totalCents, prevManualCents: prevManual,
    projectedCents, crossDate, status, prevOver, curOver, vatOnReceipts, conflict,
    months: cur.months,
  };
}

// ── 2) قائمة إقفال الشهر ─────────────────────────────────────────
function monthChecklist(data, year, month, today) {
  const from = year + '-' + pad(month) + '-01', to = year + '-' + pad(month) + '-' + pad(lastDayOfMonth(year, month));
  const inRange = v => { const d = bizDay.dayOf(v); return d >= from && d <= to; };
  const l = SL.build(data, from, to);
  const salesDays = new Set([...l.own.rows.map(r => r.businessDay)]);
  const closedDays = new Set((data.dayClosings || []).filter(s => s && s.mode !== 'TRAINING' && s.type === 'CLOSING' && s.day >= from && s.day <= to).map(s => s.day));
  const missingClosings = [...salesDays].filter(d => !closedDays.has(d) && d < today).sort();
  const bankUnmatched = (data.bankTransactions || []).filter(x => x.status === 'UNMATCHED' && inRange(x.date)).length;
  const belegePending = (data.documents || []).filter(x => (/PENDING/.test(up(x.extractionStatus || x.status)) || (up(x.type) === 'SUPPLIER_INVOICE' && !x.invoiceId && up(x.extractionStatus) === 'NOT_RUN')) && inRange(x.documentDate || x.createdAt)).length;
  const journalOpen = (data.journalEntries || []).filter(x => x.status !== 'POSTED' && inRange(x.date)).length;
  const tseMissing = l.own.totals.tseMissing || 0;
  const periodClosed = (data.accountingPeriods || []).some(p => p.status === 'CLOSED' && p.from <= from && p.to >= to);
  const monthOver = to < today;
  const items = [
    { key: 'closings', status: missingClosings.length ? 'warn' : 'ok', count: missingClosings.length, days: missingClosings.slice(0, 31) },
    { key: 'tse', status: tseMissing ? 'warn' : 'ok', count: tseMissing },
    { key: 'bank', status: bankUnmatched ? 'warn' : 'ok', count: bankUnmatched },
    { key: 'belege', status: belegePending ? 'warn' : 'ok', count: belegePending },
    { key: 'journal', status: journalOpen ? 'warn' : 'ok', count: journalOpen },
    { key: 'period', status: periodClosed ? 'ok' : (monthOver ? 'todo' : 'wait'), count: 0 },
  ];
  const done = items.filter(x => x.status === 'ok').length;
  return { from, to, year, month, salesDays: salesDays.size, closedDays: closedDays.size, ownCents: l.own.totals.grossCents, platformCents: l.platform.totals.grossCents, items, done, total: items.length, periodClosed };
}

// ── 3) المواعيد ─────────────────────────────────────────────────
function kasseInUseSince(data) {
  const acc = (data.settings && data.settings.accounting) || {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(acc.kasseInUseSince || ''))) return acc.kasseInUseSince;
  const real = (data.fiscalTransactions || []).filter(f => f && f.status === 'SIGNED' && !f.simulated).map(f => String(f.signedAt || f.createdAt || '').slice(0, 10)).filter(Boolean).sort();
  return real[0] || null;
}

function deadlines(data, today, horizonDays = 100) {
  const acc = (data.settings && data.settings.accounting) || {};
  const regime = up(acc.vatRegime), hasStaff = acc.minijob !== false;
  const t = Date.parse(today + 'T00:00:00Z'), end = t + horizonDays * 86400000;
  const y0 = Number(today.slice(0, 4)), out = [];
  const push = (d, key, extra) => { const ms = d.getTime(); if (ms >= t && ms <= end) out.push({ date: ymd(d), key, ...(extra || {}) }); };
  for (let y = y0; y <= y0 + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      if (hasStaff) { const due = thirdLastWorkday(y, m); push(minusWorkdays(due, 2), 'minijobReport', { month: m }); push(due, 'minijobPay', { month: m }); }
      push(shiftWeekend(utc(y, m, 10)), 'monthClose', { month: m === 1 ? 12 : m - 1 });
    }
    for (const m of [2, 5, 8, 11]) push(shiftWeekend(utc(y, m, 15)), 'gewstPre');
    for (const m of [3, 6, 9, 12]) push(shiftWeekend(utc(y, m, 10)), 'estPre');
    if (regime === 'REGEL') for (const m of [1, 4, 7, 10]) push(shiftWeekend(utc(y, m, 10)), 'ustVa', { quarter: m === 1 ? 4 : (m - 1) / 3 });
    push(shiftWeekend(utc(y, 7, 31)), 'annual', { forYear: y - 1 });
  }
  // Kassenmeldung (§146a Abs. 4 AO): خلال شهر من بدء استعمال الكاشير مع TSE
  const since = kasseInUseSince(data);
  if (since && !acc.kassenmeldungDone) { const due = addMonth(since); out.push({ date: due, key: 'kassenmeldung', since, overdue: due < today }); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

function build(data, opts = {}) {
  const today = opts.today || bizDay.today();
  const year = Number(opts.year) || Number(today.slice(0, 4));
  const month = Number(opts.month) || Number(today.slice(5, 7));
  return { ok: true, today, klein: kleinunternehmer(data, year, today), month: monthChecklist(data, year, month, today), deadlines: deadlines(data, today), reviewRequired: true };
}

module.exports = { build, kleinunternehmer, monthChecklist, deadlines, thirdLastWorkday, shiftWeekend, addMonth, LIMIT_PREV, LIMIT_CUR };
