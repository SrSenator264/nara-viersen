'use strict';
// bank-match.js — اقتراحات مطابقة البنك (قراءة بس). عمر بيضغط ✅ والمطابقة بتنحفظ عن طريق /api/accounting/bank-transactions/match.
//   حركة طالعة (−)  ↔ فاتورة مورّد بنفس المبلغ (±1 سنت)، قريبة بالتاريخ، واسم المورّد/رقم الفاتورة بالوصف بيرفع الثقة
//   حركة داخلة (+) ↔ دفعة منصة (Lieferando/Takeaway/Uber/Sides…) أو فاتورة بيع A4 بنفس المبلغ
// ومنع التكرار عند الاستيراد: نفس التاريخ + نفس المبلغ + نفس الوصف = مكرر.

const str = v => (v == null ? '' : String(v));
const low = v => str(v).toLowerCase();
const DAY = 86400000;
const days = (a, b) => Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / DAY;
const invCents = i => { for (const k of ['totalAmountCents', 'totalCents', 'grossAmountCents']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k])); for (const k of ['totalAmount', 'grossAmount']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k]) * 100); return null; };
const tokens = s => low(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9äöüß]+/).filter(w => w.length >= 4 && !['gmbh', 'gbr', 'und', 'ohg', 'rechnung', 'invoice', 'kundennummer', 'lastschrift', 'ueberweisung', 'sepa'].includes(w));

const PLATFORMS = [
  { id: 'LIEFERANDO', re: /lieferando|takeaway|just eat|yd\.? ?yourdelivery|scoober/i },
  { id: 'UBER_EATS', re: /uber/i },
  { id: 'WOLT', re: /wolt/i },
  { id: 'SIDES', re: /sides|loco chicken/i },
];
const PAYROLL = /minijob|knappschaft|lohn|gehalt/i;

function suggest(data, { maxPerTx = 3, windowDays = 45 } = {}) {
  const sup = new Map((data.suppliers || []).map(s => [str(s.id), s.name]));
  const invoices = (data.invoices || []).filter(i => !['CANCELLED', 'ARCHIVED_DUPLICATE'].includes(str(i.status).toUpperCase()));
  const used = new Set((data.bankTransactions || []).filter(x => x.status === 'MATCHED' && x.matchedEntityId).map(x => str(x.matchedEntityType) + ':' + str(x.matchedEntityId)));
  const sales = data.salesInvoices || [];
  const out = [];
  for (const tx of data.bankTransactions || []) {
    if (tx.status !== 'UNMATCHED') continue;
    const amt = Number(tx.amountCents || 0), text = str(tx.description) + ' ' + str(tx.reference), cands = [];
    if (amt < 0) {
      for (const i of invoices) {
        const c = invCents(i); if (c == null || Math.abs(c + amt) > 1) continue;
        if (used.has('INVOICE:' + i.id)) continue;
        const d = str(i.invoiceDate || i.createdAt).slice(0, 10), gap = d ? days(d, tx.date) : 999;
        if (gap > windowDays) continue;
        const name = str(i.supplierName || sup.get(str(i.supplierId)));
        let score = 50 - Math.min(30, gap);
        if (i.invoiceNumber && low(text).includes(low(i.invoiceNumber))) score += 40;
        if (tokens(name).some(w => low(text).includes(w))) score += 25;
        cands.push({ entityType: 'INVOICE', entityId: i.id, label: [name, i.invoiceNumber].filter(Boolean).join(' · '), date: d, amountCents: c, score });
      }
      if (PAYROLL.test(text)) cands.push({ entityType: 'PAYROLL', entityId: 'PAYROLL:' + str(tx.date).slice(0, 7), label: 'Minijob / Lohn ' + str(tx.date).slice(0, 7), date: tx.date, amountCents: -amt, score: 45 });
    } else if (amt > 0) {
      const p = PLATFORMS.find(x => x.re.test(text));
      if (p) cands.push({ entityType: 'PLATFORM_PAYOUT', entityId: p.id + ':' + tx.date, label: p.id + ' Auszahlung', date: tx.date, amountCents: amt, score: 70 });
      for (const s of sales) {
        const c = Number(s.totalCents ?? s.grossCents ?? 0); if (!c || Math.abs(c - amt) > 1 || used.has('SALES_INVOICE:' + s.id)) continue;
        const d = str(s.issuedAt || s.createdAt).slice(0, 10), gap = d ? days(d, tx.date) : 999; if (gap > windowDays) continue;
        let score = 45 - Math.min(30, gap); if (s.number && low(text).includes(low(s.number))) score += 40;
        cands.push({ entityType: 'SALES_INVOICE', entityId: s.id, label: 'Rechnung ' + str(s.number || s.id), date: d, amountCents: c, score });
      }
    }
    if (cands.length) out.push({ transactionId: tx.id, date: tx.date, amountCents: amt, description: tx.description || '', candidates: cands.sort((a, b) => b.score - a.score).slice(0, maxPerTx).map(c => ({ ...c, confidence: c.score >= 80 ? 'high' : c.score >= 55 ? 'medium' : 'low' })) });
  }
  return out;
}

const txKey = x => [str(x.date).slice(0, 10), Math.round(Number(x.amountCents || 0)), low(x.description).replace(/\s+/g, ' ').trim()].join('|');
function markDuplicates(existing, incoming) {
  const have = new Set((existing || []).map(txKey)), seen = new Set();
  return (incoming || []).map(x => { const k = txKey(x), dup = have.has(k) || seen.has(k); seen.add(k); return { ...x, duplicate: dup }; });
}

module.exports = { suggest, markDuplicates, txKey };
