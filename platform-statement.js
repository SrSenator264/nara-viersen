'use strict';
// platform-statement.js — كشوف المنصات (Lieferando / Uber Eats / Sides-Loco / Lanch): Claude بيقرا الكشف أو فاتورة العمولة،
// وبعدين منقارنو مع طلبات المنصة المسجّلة بـ Flamo لنفس الفترة (عدد الطلبات والمبيعات).
// القراءة = معاينة. الحفظ (data.platformStatements) بس بعد ضغطة عمر.
// ملاحظة Kleinunternehmer: الضريبة على عمولة المنصة ما بترجع ← العمولة الإجمالية كلها مصروف.

const SL = require('./sales-ledger.js');
const str = v => (v == null ? '' : String(v));
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
const c = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));

const N = { type: ['number', 'null'] };
const PLATFORMS = ['LIEFERANDO', 'UBER_EATS', 'WOLT', 'SIDES', 'LANCH'];
const SCHEMA = {
  type: 'object',
  properties: {
    platform: { type: 'string', enum: ['LIEFERANDO', 'UBER_EATS', 'WOLT', 'SIDES', 'LANCH', 'OTHER'], description: 'LANCH = Dokumente der LANCH GmbH (Gutschrift/Rechnung, Nummer 67_…), auch wenn Lieferando darin erwähnt wird' },
    documentKind: { type: 'string', enum: ['SETTLEMENT', 'COMMISSION_INVOICE', 'OTHER'], description: 'Abrechnung/Auszahlungsbericht oder Provisionsrechnung' },
    invoiceNumber: { type: ['string', 'null'] }, documentDate: { type: ['string', 'null'] },
    periodFrom: { type: ['string', 'null'] }, periodTo: { type: ['string', 'null'] },
    ordersCount: N, grossSales: { type: ['number', 'null'], description: 'Bestellwert brutto inkl. Lieferkosten, vor Abzügen' },
    onlinePaid: { type: ['number', 'null'], description: 'online bezahlte Bestellungen' }, cashCollected: { type: ['number', 'null'], description: 'bar beim Kunden kassiert (Restaurant)' },
    commissionNet: { type: ['number', 'null'], description: 'Summe ALLER Gebühren-Positionen netto (Provision, Servicegebühr, Marketinggebühr), ohne Waren' }, commissionVat: { type: ['number', 'null'], description: 'USt auf diese Gebühren' }, commissionGross: { type: ['number', 'null'], description: 'alle Gebühren-Positionen inkl. USt (netto + USt), ohne Waren' },
    goods: { type: ['number', 'null'], description: 'Warenlieferungen (Zutaten, Verpackung laut Lieferschein) inkl. USt, getrennt von Gebühren' },
    otherFees: { type: ['number', 'null'], description: 'sonstige Gebühren (Online-Zahlung, Marketing, Tablet, Stornos…) inkl. USt' },
    refunds: { type: ['number', 'null'], description: 'Erstattungen/Rückbuchungen an Kunden' },
    payout: { type: ['number', 'null'], description: 'Auszahlung an das Restaurant (negativ = Restaurant muss zahlen)' },
    notes: { type: ['string', 'null'] },
  },
  required: ['platform', 'documentKind'],
};
const PROMPT = 'Das ist ein Dokument einer Lieferplattform an ein Restaurant (Abrechnung, Auszahlungsbericht oder Provisionsrechnung von Lieferando/Takeaway, Uber Eats, Wolt oder Sides). Dokumente der LANCH GmbH → platform LANCH. Bei Rechnungen: commission = alle Gebühren zusammen (z. B. Marketinggebühr + Servicegebühr), Zutaten/Verpackung NICHT als Gebühr sondern als goods. Lies nur sichtbare Werte, erfinde nichts, fehlende Werte null. Beträge in EUR als Zahl. Datum YYYY-MM-DD. Rufe save_platform_statement genau einmal auf.';

function normalize(raw) {
  const r = raw || {};
  return {
    platform: PLATFORMS.includes(r.platform) ? r.platform : 'OTHER', documentKind: r.documentKind || 'OTHER',
    invoiceNumber: r.invoiceNumber ? str(r.invoiceNumber).slice(0, 80) : null, documentDate: isDay(r.documentDate) ? r.documentDate : null,
    periodFrom: isDay(r.periodFrom) ? r.periodFrom : null, periodTo: isDay(r.periodTo) ? r.periodTo : null,
    ordersCount: Number.isFinite(Number(r.ordersCount)) && r.ordersCount != null ? Math.round(Number(r.ordersCount)) : null,
    grossCents: c(r.grossSales), onlinePaidCents: c(r.onlinePaid), cashCollectedCents: c(r.cashCollected),
    commissionNetCents: c(r.commissionNet), commissionVatCents: c(r.commissionVat), commissionGrossCents: c(r.commissionGross) ?? (c(r.commissionNet) != null ? c(r.commissionNet) + (c(r.commissionVat) || 0) : null),
    otherFeesCents: c(r.otherFees), goodsCents: c(r.goods), refundsCents: c(r.refunds), payoutCents: c(r.payout), notes: r.notes ? str(r.notes).slice(0, 300) : null,
  };
}

// مقارنة مع Flamo: SIDES = طلبات Loco (العلامة Loco Chicken) مهما كانت المنصة
function compare(data, st) {
  if (!st.periodFrom || !st.periodTo) return { possible: false };
  const rows = SL.build(data, st.periodFrom, st.periodTo).platform.rows.filter(r => r.status === 'OK' && (st.platform === 'SIDES' ? r.brand === 'Loco Chicken' : r.platform === st.platform && r.brand !== 'Loco Chicken'));
  const flamoCount = rows.length, flamoGross = rows.reduce((s, r) => s + r.grossCents, 0);
  const diffCount = st.ordersCount != null ? st.ordersCount - flamoCount : null, diffCents = st.grossCents != null ? st.grossCents - flamoGross : null;
  const nothing = diffCount == null && diffCents == null; // الكشف ما فيه عدد ولا مبلغ → ما في شي نقارنو (مو "تمام")
  const ok = nothing ? null : (diffCount == null || diffCount === 0) && (diffCents == null || Math.abs(diffCents) <= Math.max(100, Math.round(flamoGross * 0.01)));
  const missingPct = diffCents != null && st.grossCents ? Math.round(diffCents / st.grossCents * 1000) / 10 : null; // نسبة الناقص بـ Flamo من مبلغ الكشف
  const missingCountPct = diffCount != null && st.ordersCount ? Math.round(diffCount / st.ordersCount * 1000) / 10 : null;
  const feeShare = st.grossCents && st.commissionGrossCents != null ? Math.round(((st.commissionGrossCents || 0) + (st.otherFeesCents || 0)) / st.grossCents * 1000) / 10 : null;
  return { possible: true, flamoCount, flamoGrossCents: flamoGross, diffCount, diffCents, ok, missingPct, missingCountPct, feeSharePct: feeShare };
}

async function read({ files = [], mimeTypes = [] }, { env = process.env, fetchImpl = fetch } = {}) {
  const key = str(env.ANTHROPIC_API_KEY).trim();
  if (!key) throw Object.assign(new Error('NO_AI_KEY'), { code: 'NO_AI_KEY' });
  const model = str(env.NARA_INVOICE_MODEL) || 'claude-sonnet-5-5';
  const content = [...files.map((data, i) => mimeTypes[i] === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } : { type: 'image', source: { type: 'base64', media_type: mimeTypes[i] || 'image/jpeg', data } }), { type: 'text', text: PROMPT }];
  const body = { model, max_tokens: 4000, tools: [{ name: 'save_platform_statement', description: 'Speichert die Zahlen der Plattform-Abrechnung.', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'save_platform_statement' }, messages: [{ role: 'user', content }] };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
  try {
    const call = b => fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(b), signal: ctl.signal });
    let r = await call(body);
    let j = null; try { j = await r.json(); } catch { /* no body */ }
    if (r.status === 400 && /tool_choice/.test(str(j && j.error && j.error.message))) { r = await call({ ...body, tool_choice: { type: 'auto' } }); j = null; try { j = await r.json(); } catch { /* no body */ } } // بعض الموديلات ما بتقبل tool_choice إجباري
    if (!r.ok) throw Object.assign(new Error('Claude ' + r.status), { code: 'AI_ERROR', status: r.status, detail: str(j && j.error && j.error.message).slice(0, 200) });
    const b = ((j && j.content) || []).find(x => x.type === 'tool_use' && x.name === 'save_platform_statement');
    if (!b) throw Object.assign(new Error('EMPTY'), { code: 'AI_EMPTY' });
    return normalize(b.input);
  } catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { code: 'AI_TIMEOUT' }); throw e; }
  finally { clearTimeout(timer); }
}


// CSV تبع Uber Eats (تقرير الطلبات، عناوين عربية بسطرين): قراءة محلية بدون ذكاء اصطناعي، كشف لكل تاريخ تحويل (أسبوع)
function csvRows(text) {
  const out = []; let row = [], cur = '', q = false; const t = str(text).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) out.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x !== '')) out.push(row);
  return out;
}
const I = { date: 6, vat: 18, refund: 23, ads: 64, fee: 58, payout: 66, transfer: 67, status: 68, fulfil: 9 };
// ملخص المدفوعات (Payments summary): سطر لكل تحويل أسبوعي (الاثنين) وبيغطي الأسبوع اللي قبلو (اثنين–أحد)
function parseUberPaymentsCsv(rows) {
  const n = v => { const x = Number(str(v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const shift = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  const data = rows.slice(1).filter(r => isDay(r[52]));
  if (!data.length) throw Object.assign(new Error('NO_ROWS'), { code: 'NO_ROWS' });
  return data.map(r => normalize({
    platform: 'UBER_EATS', documentKind: 'SETTLEMENT', invoiceNumber: str(r[53]).trim() || null, documentDate: r[52], periodFrom: shift(r[52], -7), periodTo: shift(r[52], -1),
    ordersCount: n(r[3]), grossSales: n(r[10]), commissionGross: Math.abs(n(r[45])), otherFees: Math.abs(n(r[49])) + Math.abs(n(r[19]) + n(r[20])),
    refunds: Math.abs(n(r[13])), payout: n(r[51]), notes: 'CSV Zahlungsübersicht, Auszahlung ' + r[52],
  }));
}
function parseUberCsv(text) {
  const rows = csvRows(text);
  if (rows.length >= 2 && rows[0].length >= 50 && rows[0].length < 69 && /\u0639\u062f\u062f \u0627\u0644\u0637\u0644\u0628\u0627\u062a/.test(str(rows[0][3])) && isDay(str(rows[1] && rows[1][52]))) return parseUberPaymentsCsv(rows);
  if (rows.length < 2 || rows[0].length < 69) throw Object.assign(new Error('NOT_UBER_CSV'), { code: 'NOT_UBER_CSV' });
  const data = rows.filter(r => isDay(r[I.date]));
  if (!data.length) throw Object.assign(new Error('NO_ROWS'), { code: 'NO_ROWS' });
  const n = v => { const x = Number(str(v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const groups = new Map();
  for (const r of data) { const k = isDay(r[I.transfer]) ? r[I.transfer] : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([transfer, g]) => {
    const orders = g.filter(r => str(r[I.status]).trim() !== '' && !/ملغ|إلغ/.test(r[I.status]) && !/مسترد|مُستَرَد/.test(r[I.status]));
    const dates = g.map(r => r[I.date]).sort();
    const sum = (rs, i) => rs.reduce((a, r) => a + n(r[i]), 0);
    return normalize({
      platform: 'UBER_EATS', documentKind: 'SETTLEMENT', documentDate: transfer || null, periodFrom: dates[0], periodTo: dates[dates.length - 1],
      ordersCount: orders.length, grossSales: sum(orders, I.vat), commissionGross: Math.abs(sum(g, I.fee)), otherFees: Math.abs(sum(g, I.ads)),
      refunds: sum(g, I.refund), payout: sum(g, I.payout),
      notes: 'CSV: ' + g.length + ' Zeilen, ' + (g.length - orders.length) + ' ohne abgeschlossene Bestellung (storniert/erstattet/Werbung)',
    });
  });
}

module.exports = { read, normalize, compare, parseUberCsv, SCHEMA, PLATFORMS };
