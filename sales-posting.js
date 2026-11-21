'use strict';
// sales-posting.js — ترحيل المبيعات للدفتر بالشكل الصح (بيستعملو POST /api/accounting/auto-post).
//   مبيعات المحل (كل دفعة): نقدي → 1000 Kasse، كارت → 1365 Geldtransit، تحويل/أونلاين → 1200 Bank.
//   طلبات المنصات: قيد واحد لكل منصة باليوم → 1360 Plattform-Verrechnung (المنصة مديونة لنا لحد ما تدفع).
//   الإيراد: Kleinunternehmer → 4100 (إجمالي، بدون ضريبة)؛ غير هيك → 4000 صافي + 1570 ضريبة (متل قبل).
//   ما بيرحّل التجربة/التدريب، وما بيكرر (sourceRef).
const SL = require('./sales-ledger.js');
const bizDay = require('./business-day.js');
const up = v => String(v == null ? '' : v).toUpperCase();

const SYSTEM_ACCOUNTS = [
  ['1365', 'Geldtransit Karte / تحويلات الكارت / Card transit', 'ASSET'],
  ['1360', 'Plattformen / حسابات وسيطة للمنصات', 'ASSET'],
  ['4100', 'Umsatz Kleinunternehmer § 19 / مبيعات Kleinunternehmer / Sales small business', 'REVENUE'],
];

function methodAccount(m) { const x = up(m); return x === 'CASH' || x === 'BAR' ? '1000' : x === 'CARD' || x === 'EC' || x === 'KARTE' ? '1365' : '1200'; }

function build(data, { regime = '', existingRefs = new Set(), accountId }) {
  const klein = up(regime) === 'KLEIN', entries = [], orders = new Map((data.orders || []).map(o => [String(o.id), o]));
  const revenueLines = (gross, tax, memo, dims) => {
    if (klein) return [{ accountId: accountId('4100'), debitCents: 0, creditCents: gross, memo, dimensions: dims }];
    const t = Math.max(0, Math.min(gross, Math.round(tax || 0))), lines = [{ accountId: accountId('4000'), debitCents: 0, creditCents: gross - t, memo, dimensions: dims }];
    if (t) lines.push({ accountId: accountId('1570'), debitCents: 0, creditCents: t, memo: 'Umsatzsteuer' });
    return lines;
  };
  for (const p of data.payments || []) {
    if (p.isTest || p.status !== 'COMPLETED') continue;
    const ref = 'PAYMENT:' + p.id; if (existingRefs.has(ref)) continue;
    const o = orders.get(String(p.orderId)) || {};
    if (o.isTest || o.training || SL.platformOf(o)) continue;
    const gross = Math.round(Number(p.amountCents || 0)); if (!gross) continue;
    const parts = Array.isArray(p.paymentLines) && p.paymentLines.length ? p.paymentLines : [{ method: p.method, amountCents: gross }];
    const deb = new Map(); let sum = 0;
    for (const l of parts) { const a = methodAccount(l.method), c = Math.round(Number(l.amountCents || 0)); if (!c) continue; deb.set(a, (deb.get(a) || 0) + c); sum += c; }
    if (sum !== gross) deb.set(methodAccount(p.method), (deb.get(methodAccount(p.method)) || 0) + (gross - sum));
    const channel = /^WEB/.test(up(o.source)) ? 'WEBSITE' : 'KASSE';
    const lines = [...deb.entries()].filter(([, c]) => c).map(([a, c]) => ({ accountId: accountId(a), debitCents: c, creditCents: 0, memo: a === '1000' ? 'Bar' : a === '1365' ? 'Karte' : 'Überweisung/Online' }))
      .concat(revenueLines(gross, Number(p.vatAmountCents || p.taxCents || 0), 'Umsatz ' + channel, { channel }));
    entries.push({ date: bizDay.dayOf(p.createdAt || p.date), description: 'Umsatz ' + channel + ' ' + (o.displayCode || ''), sourceRef: ref, lines });
  }
  // المنصات: مجموع يومي لكل منصة (من سجل المبيعات، بدون الملغي)
  const days = new Set((data.orders || []).filter(o => SL.platformOf(o) && !o.isTest).map(o => bizDay.dayOf(o.placedAt || o.createdAt || o.acceptedAt)).filter(Boolean));
  if (days.size) {
    const sorted = [...days].sort(), l = SL.build(data, sorted[0], sorted[sorted.length - 1]), agg = new Map();
    for (const r of l.platform.rows) { if (r.status !== 'OK' || !r.grossCents) continue; const k = r.businessDay + '|' + r.platform + '|' + r.brand; agg.set(k, (agg.get(k) || 0) + r.grossCents); }
    for (const [k, gross] of agg) {
      const [day, platform, brand] = k.split('|'), ref = 'PLATFORM_DAY:' + day + ':' + platform + ':' + brand; if (existingRefs.has(ref)) continue;
      entries.push({ date: day, description: 'Plattform-Umsatz ' + platform + ' (' + brand + ')', sourceRef: ref, lines: [{ accountId: accountId('1360'), debitCents: gross, creditCents: 0, memo: platform }].concat(revenueLines(gross, 0, 'Plattform ' + platform, { channel: platform, brand })) });
    }
  }
  for (const e of entries) { const d = e.lines.reduce((s, x) => s + x.debitCents, 0), c = e.lines.reduce((s, x) => s + x.creditCents, 0); if (d !== c) throw new Error('UNBALANCED ' + e.sourceRef); }
  return entries;
}

module.exports = { build, methodAccount, SYSTEM_ACCOUNTS };
