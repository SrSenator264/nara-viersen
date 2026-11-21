'use strict';
// platform-statement.js — كشوف المنصات (Lieferando / Uber Eats / Sides-Loco): Claude بيقرا الكشف أو فاتورة العمولة،
// وبعدين منقارنو مع طلبات المنصة المسجّلة بـ Flamo لنفس الفترة (عدد الطلبات والمبيعات).
// القراءة = معاينة. الحفظ (data.platformStatements) بس بعد ضغطة عمر.
// ملاحظة Kleinunternehmer: الضريبة على عمولة المنصة ما بترجع ← العمولة الإجمالية كلها مصروف.

const SL = require('./sales-ledger.js');
const str = v => (v == null ? '' : String(v));
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
const c = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));

const N = { type: ['number', 'null'] };
const SCHEMA = {
  type: 'object',
  properties: {
    platform: { type: 'string', enum: ['LIEFERANDO', 'UBER_EATS', 'WOLT', 'SIDES', 'OTHER'] },
    documentKind: { type: 'string', enum: ['SETTLEMENT', 'COMMISSION_INVOICE', 'OTHER'], description: 'Abrechnung/Auszahlungsbericht oder Provisionsrechnung' },
    invoiceNumber: { type: ['string', 'null'] }, documentDate: { type: ['string', 'null'] },
    periodFrom: { type: ['string', 'null'] }, periodTo: { type: ['string', 'null'] },
    ordersCount: N, grossSales: { type: ['number', 'null'], description: 'Bestellwert brutto inkl. Lieferkosten, vor Abzügen' },
    onlinePaid: { type: ['number', 'null'], description: 'online bezahlte Bestellungen' }, cashCollected: { type: ['number', 'null'], description: 'bar beim Kunden kassiert (Restaurant)' },
    commissionNet: N, commissionVat: N, commissionGross: { type: ['number', 'null'], description: 'Provision/Servicegebühr inkl. USt' },
    otherFees: { type: ['number', 'null'], description: 'sonstige Gebühren (Online-Zahlung, Marketing, Tablet, Stornos…) inkl. USt' },
    refunds: { type: ['number', 'null'], description: 'Erstattungen/Rückbuchungen an Kunden' },
    payout: { type: ['number', 'null'], description: 'Auszahlung an das Restaurant (negativ = Restaurant muss zahlen)' },
    notes: { type: ['string', 'null'] },
  },
  required: ['platform', 'documentKind'],
};
const PROMPT = 'Das ist ein Dokument einer Lieferplattform an ein Restaurant (Abrechnung, Auszahlungsbericht oder Provisionsrechnung von Lieferando/Takeaway, Uber Eats, Wolt oder Sides). Lies nur sichtbare Werte, erfinde nichts, fehlende Werte null. Beträge in EUR als Zahl. Datum YYYY-MM-DD. Rufe save_platform_statement genau einmal auf.';

function normalize(raw) {
  const r = raw || {};
  return {
    platform: ['LIEFERANDO', 'UBER_EATS', 'WOLT', 'SIDES'].includes(r.platform) ? r.platform : 'OTHER', documentKind: r.documentKind || 'OTHER',
    invoiceNumber: r.invoiceNumber ? str(r.invoiceNumber).slice(0, 80) : null, documentDate: isDay(r.documentDate) ? r.documentDate : null,
    periodFrom: isDay(r.periodFrom) ? r.periodFrom : null, periodTo: isDay(r.periodTo) ? r.periodTo : null,
    ordersCount: Number.isFinite(Number(r.ordersCount)) && r.ordersCount != null ? Math.round(Number(r.ordersCount)) : null,
    grossCents: c(r.grossSales), onlinePaidCents: c(r.onlinePaid), cashCollectedCents: c(r.cashCollected),
    commissionNetCents: c(r.commissionNet), commissionVatCents: c(r.commissionVat), commissionGrossCents: c(r.commissionGross) ?? (c(r.commissionNet) != null ? c(r.commissionNet) + (c(r.commissionVat) || 0) : null),
    otherFeesCents: c(r.otherFees), refundsCents: c(r.refunds), payoutCents: c(r.payout), notes: r.notes ? str(r.notes).slice(0, 300) : null,
  };
}

// مقارنة مع Flamo: SIDES = طلبات Loco (العلامة Loco Chicken) مهما كانت المنصة
function compare(data, st) {
  if (!st.periodFrom || !st.periodTo) return { possible: false };
  const rows = SL.build(data, st.periodFrom, st.periodTo).platform.rows.filter(r => r.status === 'OK' && (st.platform === 'SIDES' ? r.brand === 'Loco Chicken' : r.platform === st.platform && r.brand !== 'Loco Chicken'));
  const flamoCount = rows.length, flamoGross = rows.reduce((s, r) => s + r.grossCents, 0);
  const diffCount = st.ordersCount != null ? st.ordersCount - flamoCount : null, diffCents = st.grossCents != null ? st.grossCents - flamoGross : null;
  const ok = (diffCount == null || diffCount === 0) && (diffCents == null || Math.abs(diffCents) <= Math.max(100, Math.round(flamoGross * 0.01)));
  const feeShare = st.grossCents && st.commissionGrossCents != null ? Math.round(((st.commissionGrossCents || 0) + (st.otherFeesCents || 0)) / st.grossCents * 1000) / 10 : null;
  return { possible: true, flamoCount, flamoGrossCents: flamoGross, diffCount, diffCents, ok, feeSharePct: feeShare };
}

async function read({ files = [], mimeTypes = [] }, { env = process.env, fetchImpl = fetch } = {}) {
  const key = str(env.ANTHROPIC_API_KEY).trim();
  if (!key) throw Object.assign(new Error('NO_AI_KEY'), { code: 'NO_AI_KEY' });
  const model = str(env.NARA_INVOICE_MODEL) || 'claude-sonnet-5-5';
  const content = [...files.map((data, i) => mimeTypes[i] === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } : { type: 'image', source: { type: 'base64', media_type: mimeTypes[i] || 'image/jpeg', data } }), { type: 'text', text: PROMPT }];
  const body = { model, max_tokens: 4000, tools: [{ name: 'save_platform_statement', description: 'Speichert die Zahlen der Plattform-Abrechnung.', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'save_platform_statement' }, messages: [{ role: 'user', content }] };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body), signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch { /* no body */ }
    if (!r.ok) throw Object.assign(new Error('Claude ' + r.status), { code: 'AI_ERROR', status: r.status });
    const b = ((j && j.content) || []).find(x => x.type === 'tool_use' && x.name === 'save_platform_statement');
    if (!b) throw Object.assign(new Error('EMPTY'), { code: 'AI_EMPTY' });
    return normalize(b.input);
  } catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { code: 'AI_TIMEOUT' }); throw e; }
  finally { clearTimeout(timer); }
}

module.exports = { read, normalize, compare, SCHEMA };
