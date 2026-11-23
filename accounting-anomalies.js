'use strict';
// accounting-anomalies.js — "شي مو طبيعي" بالحسابات. قراءة بس، كل نتيجة = تنبيه مع سبب، والقرار عند عمر.
//   DUP_INVOICE      نفس المورّد + نفس رقم الفاتورة (أو نفس المبلغ ونفس اليوم) أكتر من مرة
//   PRICE_JUMP       سعر شراء مادة طلع ≥ 20% عن المرة اللي قبلها
//   CASH_DIFF        تقفيلة فيها فرق بالصندوق
//   LOW_SALES_DAY    يوم مبيعات (المحل + المنصات) أقل من 40% من معدّل نفس اليوم بالأسابيع الـ 4 اللي قبل
//   OLD_UNMATCHED    حركة بنك بدون مطابقة أقدم من 30 يوم
//   NO_DOCUMENT      فاتورة منرحّلة بدون Beleg مرفق
//   VAT_ON_KLEIN     Kleinunternehmer وفاتورة البيع/الإيصال فيها ضريبة (من الإعدادات)
//   FIXED_COST_MISSING  مصروف ثابت (إيجار، كهربا…) ما إلو فاتورة ولا حركة بنك هالشهر بعد موعدو بـ 5 أيام

const SL = require('./sales-ledger.js');
const bizDay = require('./business-day.js');

const str = v => (v == null ? '' : String(v));
const low = v => str(v).trim().toLowerCase();
const DAY = 86400000;
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const invCents = i => { for (const k of ['totalAmountCents', 'totalCents', 'grossAmountCents']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k])); for (const k of ['totalAmount', 'grossAmount']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k]) * 100); return null; };
const invDay = i => bizDay.dayOf(i.invoiceDate || i.createdAt || '');

function detect(data, { today = bizDay.today(), lookbackDays = 60, priceJump = 0.2, lowShare = 0.4 } = {}) {
  const out = [], from = addDays(today, -lookbackDays);
  const sup = new Map((data.suppliers || []).map(s => [str(s.id), s.name]));
  const supName = i => str(i.supplierName || sup.get(str(i.supplierId)) || '');
  const invoices = (data.invoices || []).filter(i => str(i.status).toUpperCase() !== 'CANCELLED');

  // 1) فواتير مكررة
  const seen = new Map();
  for (const i of invoices) {
    const nr = low(i.invoiceNumber), s = low(i.supplierId || supName(i));
    const keys = [];
    if (nr && s) keys.push('n|' + s + '|' + nr);
    const c = invCents(i), d = invDay(i);
    if (s && c && d) keys.push('a|' + s + '|' + c + '|' + d);
    for (const k of keys) { const prev = seen.get(k); if (prev && prev.id !== i.id) { out.push({ type: 'DUP_INVOICE', level: 'warn', date: d, ref: i.id, otherRef: prev.id, supplier: supName(i), invoiceNumber: i.invoiceNumber || null, amountCents: c, why: k[0] === 'n' ? 'same_number' : 'same_amount_day' }); break; } seen.set(k, i); }
  }

  // 2) قفزة سعر
  const hist = [...(data.purchasePriceHistory || [])].sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt)));
  const lastBy = new Map(), items = new Map((data.inventoryItems || []).map(x => [str(x.id), x.name]));
  for (const p of hist) {
    const k = str(p.inventoryItemId), price = Number(p.unitPrice), prev = lastBy.get(k);
    if (prev && Number.isFinite(price) && prev.price > 0 && price >= prev.price * (1 + priceJump) && bizDay.dayOf(p.createdAt) >= from)
      out.push({ type: 'PRICE_JUMP', level: 'info', date: bizDay.dayOf(p.createdAt), ref: p.invoiceId || null, item: items.get(k) || k, oldPrice: prev.price, newPrice: price, changePct: Math.round((price / prev.price - 1) * 100), supplier: sup.get(str(p.supplierId)) || null });
    if (Number.isFinite(price)) lastBy.set(k, { price });
  }

  // 3) فرق صندوق بالتقفيلة
  for (const s of data.dayClosings || []) {
    if (!s || s.mode === 'TRAINING' || s.type !== 'CLOSING' || s.day < from) continue;
    const df = s.report && s.report.cash ? Number(s.report.cash.differenceCents || 0) : 0;
    if (df) out.push({ type: 'CASH_DIFF', level: Math.abs(df) >= 1000 ? 'warn' : 'info', date: s.day, ref: s.id, number: s.number || null, differenceCents: df });
  }

  // 4) يوم مبيعات واطي (آخر 14 يوم مقابل نفس اليوم بالـ 4 أسابيع قبلو)
  const salesFrom = addDays(today, -14 - 28), l = SL.build(data, salesFrom, addDays(today, -1)), byDay = new Map();
  for (const r of l.own.rows) byDay.set(r.businessDay, (byDay.get(r.businessDay) || 0) + r.grossCents);
  for (const r of l.platform.rows) if (r.status === 'OK') byDay.set(r.businessDay, (byDay.get(r.businessDay) || 0) + r.grossCents);
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, -i), ref = [7, 14, 21, 28].map(n => byDay.get(addDays(d, -n)) || 0).filter(x => x > 0);
    if (ref.length < 2) continue;
    const avg = ref.reduce((a, b) => a + b, 0) / ref.length, v = byDay.get(d) || 0;
    if (v < avg * lowShare) out.push({ type: 'LOW_SALES_DAY', level: v === 0 ? 'warn' : 'info', date: d, salesCents: v, usualCents: Math.round(avg) });
  }

  // 5) بنك بدون مطابقة أقدم من 30 يوم
  const old = (data.bankTransactions || []).filter(x => x.status === 'UNMATCHED' && str(x.date) && str(x.date) < addDays(today, -30));
  if (old.length) out.push({ type: 'OLD_UNMATCHED', level: 'warn', date: old.map(x => x.date).sort()[0], count: old.length, sumCents: old.reduce((s, x) => s + Number(x.amountCents || 0), 0) });

  // 6) فاتورة منرحّلة بدون مستند
  const docIds = new Set((data.documents || []).map(d => str(d.id)));
  for (const i of invoices) if (['POSTED', 'PAID'].includes(str(i.status).toUpperCase()) && invDay(i) >= from && !(i.documentId && docIds.has(str(i.documentId))))
    out.push({ type: 'NO_DOCUMENT', level: 'info', date: invDay(i), ref: i.id, supplier: supName(i), invoiceNumber: i.invoiceNumber || null });

  // 7) Kleinunternehmer + ضريبة
  const acc = (data.settings && data.settings.accounting) || {};
  if ((str(acc.vatRegime).toUpperCase() || 'KLEIN') === 'KLEIN' && Number(acc.defaultSalesVatRate || 0) > 0) out.push({ type: 'VAT_ON_KLEIN', level: 'crit', date: today, rate: Number(acc.defaultSalesVatRate) });

  // 8) مصاريف ثابتة ناقصة (settings.accounting.fixedCosts: [{ name, match, amountCents, day }])
  for (const f of acc.fixedCosts || []) {
    const match = low(f.match || f.name); if (!match) continue;
    for (const back of [0, 1]) {
      const t = new Date(Date.parse(today + 'T12:00:00Z')); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() - back);
      const ym = t.toISOString().slice(0, 7), day = Math.min(28, Math.max(1, Number(f.day) || 1)), due = ym + '-' + String(day).padStart(2, '0');
      if (addDays(due, 5) > today) continue;
      const inv = invoices.some(i => str(i.invoiceDate || i.createdAt).slice(0, 7) === ym && (low(supName(i)).includes(match) || low(i.invoiceNumber).includes(match)));
      const bank = (data.bankTransactions || []).some(x => str(x.date).slice(0, 7) === ym && Number(x.amountCents) < 0 && (low(x.description).includes(match) || low(x.reference).includes(match)));
      if (!inv && !bank) out.push({ type: 'FIXED_COST_MISSING', level: 'warn', date: due, name: str(f.name || f.match), month: ym, amountCents: Number(f.amountCents) || null });
    }
  }

  const rank = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || str(b.date).localeCompare(str(a.date)));
}

module.exports = { detect };
