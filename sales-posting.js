'use strict';
// sales-posting.js — ترحيل المبيعات للدفتر بالشكل الصح (بيستعملو POST /api/accounting/auto-post).
//   مبيعات المحل (كل دفعة): نقدي → 1000 Kasse، كارت → 1365 Geldtransit، تحويل/أونلاين → 1200 Bank.
//   طلبات المنصات: قيد واحد لكل منصة باليوم → 1360 Plattform-Verrechnung (المنصة مديونة لنا لحد ما تدفع).
//   الإيراد: Kleinunternehmer → 4100 (إجمالي، بدون ضريبة)؛ Regelbesteuerung (الافتراضي) → صافي + ضريبة لكل نسبة:
//     7% → 4000 + 1571، 19% → 4010 + 1572، نسبة تانية → 4000 + 1570. التوزيع على النسب من أصناف الطلب (نفس منطق التقفيلة).
//     Trinkgeld مو داخل الإيراد (مبلغ الدفعة بدونو). المنصات: نفس التوزيع من أصناف طلب المنصة. الأرقام تقدير للمحاسب.
//   ما بيرحّل التجربة/التدريب، وما بيكرر (sourceRef).
const SL = require('./sales-ledger.js');
const bizDay = require('./business-day.js');
const DC = require('./day-closing.js');
const up = v => String(v == null ? '' : v).toUpperCase();

const SYSTEM_ACCOUNTS = [
  ['1365', 'Geldtransit Karte / تحويلات الكارت / Card transit', 'ASSET'],
  ['1360', 'Plattformen / حسابات وسيطة للمنصات', 'ASSET'],
  ['4010', 'Umsatz 19% / مبيعات 19% / Sales 19%', 'REVENUE'],
  ['1570', 'Umsatzsteuer / ضريبة المبيعات / Output VAT', 'LIABILITY'],
  ['1571', 'Umsatzsteuer 7% / ضريبة المبيعات 7%', 'LIABILITY'],
  ['1572', 'Umsatzsteuer 19% / ضريبة المبيعات 19%', 'LIABILITY'],
  ['4100', 'Umsatz Kleinunternehmer § 19 / مبيعات Kleinunternehmer / Sales small business', 'REVENUE'],
];

function methodAccount(m) { const x = up(m); return x === 'CASH' || x === 'BAR' ? '1000' : x === 'CARD' || x === 'EC' || x === 'KARTE' ? '1365' : '1200'; }

const REV = { 7: '4000', 19: '4010' }, VATACC = { 7: '1571', 19: '1572' };
const sumMap = m => [...m.values()].reduce((a, b) => a + b, 0);

// توزيع مبلغ طلب على نسب الضريبة (أكبر باقي)، سالب = تصحيح/Storno
function ratesOf(rr, order, gross) {
  const sign = gross < 0 ? -1 : 1, out = new Map();
  for (const [r, c] of DC.allocate(Math.abs(gross), DC.weightsOf(order, rr.rateOf, rr.splitOf), rr.food)) if (c) out.set(Number(r), sign * c);
  return out;
}
const split = (gross, rate) => { const net = rate > 0 ? Math.round(gross / (1 + rate / 100)) : gross; return { net, vat: gross - net }; };

function build(data, { regime = '', existingRefs = new Set(), accountId }) {
  const klein = up(regime) === 'KLEIN', entries = [], orders = new Map((data.orders || []).map(o => [String(o.id), o])), rr = DC.rateResolver(data);
  // rates: Map(rate → إجمالي بالسنت)
  const revenueLines = (rates, memo, dims) => {
    if (klein) return [{ accountId: accountId('4100'), debitCents: 0, creditCents: sumMap(rates), memo, dimensions: dims }];
    const lines = [];
    for (const [rate, g] of [...rates.entries()].sort((a, b) => a[0] - b[0])) {
      if (!g) continue;
      const { net, vat } = split(g, rate);
      lines.push({ accountId: accountId(REV[rate] || '4000'), debitCents: net < 0 ? -net : 0, creditCents: net > 0 ? net : 0, memo: memo + ' ' + rate + '%', dimensions: dims });
      if (vat) lines.push({ accountId: accountId(VATACC[rate] || '1570'), debitCents: vat < 0 ? -vat : 0, creditCents: vat > 0 ? vat : 0, memo: 'Umsatzsteuer ' + rate + '%' });
    }
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
      .concat(revenueLines(ratesOf(rr, o, gross), 'Umsatz ' + channel, { channel }));
    entries.push({ date: bizDay.dayOf(p.createdAt || p.date), description: 'Umsatz ' + channel + ' ' + (o.displayCode || ''), sourceRef: ref, lines });
  }
  // المنصات: مجموع يومي لكل منصة (من سجل المبيعات، بدون الملغي)
  const days = new Set((data.orders || []).filter(o => SL.platformOf(o) && !o.isTest).map(o => bizDay.dayOf(o.placedAt || o.createdAt || o.acceptedAt)).filter(Boolean));
  if (days.size) {
    const sorted = [...days].sort(), l = SL.build(data, sorted[0], sorted[sorted.length - 1]), agg = new Map(), byCode = new Map((data.orders || []).filter(o => o.displayCode).map(o => [String(o.displayCode), o]));
    for (const r of l.platform.rows) {
      if (r.status !== 'OK' || !r.grossCents) continue;
      const k = r.businessDay + '|' + r.platform + '|' + r.brand, m = agg.get(k) || new Map();
      for (const [rate, c] of ratesOf(rr, byCode.get(String(r.orderCode)), r.grossCents)) m.set(rate, (m.get(rate) || 0) + c);
      agg.set(k, m);
    }
    for (const [k, rates] of agg) {
      const gross = sumMap(rates), [day, platform, brand] = k.split('|'), ref = 'PLATFORM_DAY:' + day + ':' + platform + ':' + brand; if (existingRefs.has(ref)) continue;
      entries.push({ date: day, description: 'Plattform-Umsatz ' + platform + ' (' + brand + ')', sourceRef: ref, lines: [{ accountId: accountId('1360'), debitCents: gross, creditCents: 0, memo: platform }].concat(revenueLines(rates, 'Plattform ' + platform, { channel: platform, brand })) });
    }
  }
  for (const e of entries) { const d = e.lines.reduce((s, x) => s + x.debitCents, 0), c = e.lines.reduce((s, x) => s + x.creditCents, 0); if (d !== c) throw new Error('UNBALANCED ' + e.sourceRef); }
  return entries;
}

// ملخص الضريبة لفترة: إجمالي/صافي/ضريبة لكل نسبة (محل + منصات)، بنفس توزيع الترحيل.
function vatSummary(data, from, to) {
  const rr = DC.rateResolver(data), orders = new Map((data.orders || []).map(o => [String(o.id), o])), byCode = new Map((data.orders || []).filter(o => o.displayCode).map(o => [String(o.displayCode), o]));
  const own = new Map(), plat = new Map(), add = (m, rates) => { for (const [r, c] of rates) m.set(r, (m.get(r) || 0) + c); };
  for (const p of data.payments || []) {
    if (p.isTest || p.status !== 'COMPLETED') continue;
    const d = bizDay.dayOf(p.createdAt || p.date); if (d < from || d > to) continue;
    const o = orders.get(String(p.orderId)) || {}; if (o.isTest || o.training || SL.platformOf(o)) continue;
    const gross = Math.round(Number(p.amountCents || 0)); if (gross) add(own, ratesOf(rr, o, gross));
  }
  for (const r of SL.build(data, from, to).platform.rows) if (r.status === 'OK' && r.grossCents) add(plat, ratesOf(rr, byCode.get(String(r.orderCode)), r.grossCents));
  const rows = m => [...m.entries()].filter(([, g]) => g).sort((a, b) => a[0] - b[0]).map(([rate, g]) => { const x = split(g, rate); return { rate, grossCents: g, netCents: x.net, vatCents: x.vat }; });
  const all = new Map(); add(all, own); add(all, plat);
  const tot = rs => ({ grossCents: rs.reduce((s, r) => s + r.grossCents, 0), netCents: rs.reduce((s, r) => s + r.netCents, 0), vatCents: rs.reduce((s, r) => s + r.vatCents, 0) });
  const rowsAll = rows(all);
  return { rows: rowsAll, own: rows(own), platform: rows(plat), totals: tot(rowsAll) };
}

module.exports = { build, vatSummary, methodAccount, SYSTEM_ACCOUNTS };
