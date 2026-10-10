// business-day.js — "يوم الشغل": المحل بيسكّر بعد نص الليل، فأي شي قبل ساعة البداية (افتراضياً 5 الصبح)
// بينحسب لليوم اللي قبلو. طلب الساعة 00:30 ليلة السبت = يوم الجمعة. بالتوقيت الألماني دايماً.
// بيشتغل بالسيرفر (require) وبالمتصفح (window.NARA_DAY).
(function (root) {
  'use strict';
  let startHour = 5;
  const TZ = 'Europe/Berlin';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const setStartHour = h => { const n = Number(h); if (Number.isFinite(n) && n >= 0 && n <= 12) startHour = n; return startHour; };
  // اليوم (YYYY-MM-DD) اللي بينتمي إلو هالوقت
  const day = (t, h = startHour) => { const ms = typeof t === 'number' ? t : Date.parse(t); return Number.isFinite(ms) ? fmt.format(new Date(ms - h * 3600000)) : ''; };
  // تاريخ محفوظ: إذا تاريخ بس (فاتورة مثلاً) بيضل متل ما هو، وإذا وقت كامل بينحسب ليوم الشغل
  const dayOf = v => { const s = String(v == null ? '' : v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; return day(s) || s.slice(0, 10); };
  const today = () => day(Date.now());
  const api = { day, dayOf, today, setStartHour, get startHour() { return startHour; } };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NARA_DAY = api;
})(typeof window !== 'undefined' ? window : globalThis);
