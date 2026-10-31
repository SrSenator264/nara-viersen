'use strict';
// day-closing.js — تقفيلة اليوم (Tagesabschluss). حساب نقي من بيانات الأدمن، بدون I/O (السيرفر بيحفظ).
// - REAL: مبيعات الكاشير والموقع الحقيقية بس (بدون تجربة/تدريب/منصات). TRAINING: عمليات التدريب بس، ما بتتحفظ أبداً.
// - المبلغ المدفوع (payment.amountCents) هو الأساس: بعد الخصم، بدون بقشيش. البقشيش سطر مستقل (Durchlaufposten).
// - الضريبة: بنوزّع المبلغ المدفوع على نسب الضريبة حسب أصناف سلة الطلب (أكبر باقي)، وبعدين صافي/ضريبة لكل نسبة.
//   النسبة لكل صنف: item.vatRate ← product.vatRate ← اسم تصنيف المشروبات (19%) ← الأكل (7%). تقدير، مو استشارة ضريبية.
// - Storno: بيتسجّل بيوم الـStorno (مو يوم البيع الأصلي). الاسترجاع بنفس طريقة الدفع الأصلية (افتراض).
// - بيانات الـTSE بتنعرض كما هي (موقّع/غير موقّع). هالملف ما بيحكم إنو الكاشير مطابق قانونياً.
const bizDay = require('./business-day.js');
const SL = require('./sales-ledger.js');
const SLG = require('./settlement-ledger.js');

class ClosingError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT']);
const up = v => String(v == null ? '' : v).toUpperCase();
const int = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const ms = v => Date.parse(v || '');

// ── نسبة الضريبة ──────────────────────────────────────────────────────────────
// كلمات اللاتيني بحدود كلمة (عشان "Saftiges" و"Schweine" و"Steak" ما يتحسبوا مشروبات)؛ العربي بـ includes.
const DRINK_LATIN = /\b(getr(ä|ae)nke?|drinks?|beverages?|softdrinks?|limo(nade)?|cola|coca-cola|fanta|sprite|wasser|water|saft|säfte|juice|bier|beer|wein|wine|ayran|tee|tea|kaffee|coffee|red ?bull|eistee|smoothies?|shakes?)\b/i;
const DRINK_ARABIC = ['مشروب', 'عصير', 'مياه', 'ماء', 'شاي', 'قهوة', 'عيران', 'كولا', 'بيرة'];
const isDrinkName = s => { const t = String(s || ''); return DRINK_LATIN.test(t) || DRINK_ARABIC.some(w => t.includes(w)); };

function rateResolver(data) {
  const acc = (data.settings && data.settings.accounting) || {};
  const food = finite(acc.defaultSalesVatRate) ? Number(acc.defaultSalesVatRate) : finite(data.settings && data.settings.defaultVatRate) ? Number(data.settings.defaultVatRate) : 7;
  const drink = finite(acc.drinkVatRate) ? Number(acc.drinkVatRate) : 19;
  const cats = new Map((data.categories || []).map(c => [String(c.id), c]));
  const prods = new Map((data.products || []).map(p => [String(p.id), p]));
  const catName = p => {
    const c = cats.get(String(p.categoryId));
    return [p.category, p.categoryName, p.c, c && (c.name || c.nameDe || (c.names && c.names.de))].filter(Boolean).join(' ');
  };
  const productOf = it => prods.get(String(it.productId != null ? it.productId : String(it.id || '').replace(/-\d{10,}$/, '')));
  const rateOf = it => {
    if (finite(it.vatRate)) return Number(it.vatRate);
    const p = productOf(it);
    if (p) { if (finite(p.vatRate)) return Number(p.vatRate); const cn = catName(p); return isDrinkName(cn) || (!cn && isDrinkName(p.name || p.n)) ? drink : food; }
    return isDrinkName(it.name) ? drink : food;
  };
  return { rateOf, food, drink };
}

// توزيع مبلغ على مفاتيح حسب أوزان (أكبر باقي) — المجموع دايماً = total بالضبط
function allocate(total, weights, fallbackKey) {
  const out = new Map();
  total = int(total);
  if (total <= 0) return out;
  const keys = [...weights.keys()].filter(k => weights.get(k) > 0), wsum = sum(keys, k => weights.get(k));
  if (!wsum) { out.set(fallbackKey, total); return out; }
  let given = 0; const rem = [];
  for (const k of keys) { const exact = total * weights.get(k) / wsum, fl = Math.floor(exact); out.set(k, fl); given += fl; rem.push([k, exact - fl]); }
  rem.sort((a, b) => b[1] - a[1]);
  for (let i = 0; given < total; i++, given++) { const k = rem[i % rem.length][0]; out.set(k, out.get(k) + 1); }
  return out;
}

const weightsOf = (order, rateOf) => {
  const w = new Map();
  for (const it of (order && order.cart) || []) {
    if (/TIP/.test(up(it.kind))) continue;
    const c = int(it.unitCents) * (finite(it.quantity) ? int(it.quantity) : 1);
    if (c > 0) { const r = rateOf(it); w.set(r, (w.get(r) || 0) + c); }
  }
  return w;
};
const linesOf = p => (Array.isArray(p.paymentLines) && p.paymentLines.length ? p.paymentLines : [{ method: p.method, amountCents: p.amountCents }]);
const methodSplit = ps => {
  let cash = 0, card = 0, total = 0;
  for (const p of ps) { const ls = linesOf(p); cash += sum(ls.filter(l => up(l.method) === 'CASH'), l => int(l.amountCents)); card += sum(ls.filter(l => up(l.method) === 'CARD'), l => int(l.amountCents)); total += int(p.amountCents); }
  return { cash, card, other: total - cash - card };
};

const settlementsOf = (data, day) => (data.dailySettlements || []).filter(s => s && s.mode !== 'TRAINING' && s.day === day).sort((a, b) => ms(a.closedAt) - ms(b.closedAt));

// ── الحساب الأساسي ─────────────────────────────────────────────────────────────
// opts: { mode:'REAL'|'TRAINING', sinceIso (للـNachtrag), openingCents, countedCents, leaveCents }
function build(data, day, opts = {}) {
  if (!ISO.test(day || '')) throw new ClosingError(422, 'Ungültiger Tag.', 'BAD_DAY');
  const training = opts.mode === 'TRAINING', mode = training ? 'TRAINING' : 'REAL', since = opts.sinceIso ? ms(opts.sinceIso) : 0;
  const orders = data.orders || [], byId = new Map(orders.map(o => [String(o.id), o]));
  const inRange = iso => bizDay.dayOf(iso) === day && (!since || ms(iso) > since);
  const own = o => !SL.platformOf(o) && (training ? o.training === true : !o.isTest && !o.training);
  const { rateOf, food } = rateResolver(data);

  const pays = (data.payments || []).filter(p => {
    if (p.status !== 'COMPLETED' || !inRange(p.createdAt)) return false;
    const o = byId.get(String(p.orderId));
    return training ? !!o && own(o) : !p.isTest && own(o || {});
  });

  // المبيعات
  const gByRate = new Map();
  const addRate = (order, cents, sign) => { for (const [r, c] of allocate(cents, weightsOf(order, rateOf), food)) gByRate.set(r, (gByRate.get(r) || 0) + sign * c); };
  let grossC = 0, discC = 0, tipC = 0, tipCashC = 0;
  for (const p of pays) {
    grossC += int(p.amountCents); discC += int(p.discount && p.discount.amountCents); tipC += int(p.tipCents);
    if (up(p.method) === 'CASH') tipCashC += int(p.tipCents);
    addRate(byId.get(String(p.orderId)), int(p.amountCents), 1);
  }
  const ms0 = methodSplit(pays);
  const revenue = { grossCents: grossC, grossBeforeDiscountCents: grossC + discC, discountCents: discC, cashCents: ms0.cash, cardCents: ms0.card, otherCents: ms0.other, tipCents: tipC, tipCashCents: tipCashC };

  // Storno
  const payById = new Map((data.payments || []).map(p => [p.id, p]));
  const stRows = []; let stC = 0, stCash = 0, stCard = 0, stOther = 0;
  for (const e of data.auditEvents || []) {
    if (e.type !== 'STORNO' || !inRange(e.createdAt)) continue;
    const o = byId.get(String(e.orderId));
    if (training ? !(o && own(o)) : !own(o || {})) continue;
    const d = e.details || {}, amount = int(d.amountCents != null ? d.amountCents : e.amountCents);
    const orig = (d.originalPaymentIds || []).map(id => payById.get(id)).filter(Boolean), m = methodSplit(orig);
    stC += amount; stCash += m.cash; stCard += m.card; stOther += orig.length ? m.other : amount;
    addRate(o, amount, -1);
    stRows.push({ orderCode: (o && o.displayCode) || '', amountCents: amount, createdAt: e.createdAt, reason: String(d.reason || '') });
  }
  const storno = { count: stRows.length, amountCents: stC, cashCents: stCash, cardCents: stCard, otherCents: stOther, rows: stRows };

  // ضريبة لكل نسبة
  const vatRows = [...gByRate.entries()].filter(([, g]) => g !== 0).sort((a, b) => a[0] - b[0]).map(([rate, g]) => {
    const net = Math.round(g / (1 + rate / 100)); return { rate, grossCents: g, netCents: net, vatCents: g - net };
  });
  const vat = { rows: vatRows, grossCents: sum(vatRows, r => r.grossCents), netCents: sum(vatRows, r => r.netCents), vatCents: sum(vatRows, r => r.vatCents) };

  // طلبات ملغاة (قبل الدفع) + مفتوحة غير مدفوعة
  const cancelled = orders.filter(o => up(o.status) === 'CANCELLED' && (training ? o.training === true && own(o) : own(o)) && inRange(o.cancelledAt || o.updatedAt || o.createdAt));
  const open = orders.filter(o => !CLOSED.has(up(o.status)) && (training ? o.training === true && own(o) : own(o)) && bizDay.dayOf(o.createdAt || o.placedAt) === day);
  const orderTotal = o => sum(o.cart || [], i => int(i.unitCents) * (finite(i.quantity) ? int(i.quantity) : 1));

  // منصات (REAL بس)
  const platform = { rows: [], grossCents: 0, commissionCents: 0, cashDueCents: 0, cancelled: 0 };
  if (!training) {
    const l = SL.build(data, day, day), fees = Object.assign({}, SLG.FEES);
    const pf = data.settings && data.settings.accounting && data.settings.accounting.platformFees;
    if (pf && typeof pf === 'object') for (const [k, v] of Object.entries(pf)) if (finite(v) && Number(v) >= 0 && Number(v) <= 100) fees[k] = Number(v);
    const g = {};
    for (const r of l.platform.rows) {
      if (since && !(ms(r.date) > since)) continue;
      if (r.status !== 'OK') { platform.cancelled++; continue; }
      const k = r.brand === 'Loco Chicken' ? 'LOCO' : r.platform, x = g[k] || (g[k] = { key: k, count: 0, grossCents: 0, cashDueCents: 0 });
      x.count++; x.grossCents += r.grossCents; x.cashDueCents += r.cashDueCents;
    }
    platform.rows = Object.values(g).sort((a, b) => b.grossCents - a.grossCents).map(x => { const rate = fees[x.key] != null ? fees[x.key] : 0; return { ...x, rate, commissionCents: Math.round(x.grossCents * rate / 100) }; });
    platform.grossCents = sum(platform.rows, r => r.grossCents); platform.commissionCents = sum(platform.rows, r => r.commissionCents); platform.cashDueCents = sum(platform.rows, r => r.cashDueCents);
  }

  // الصندوق
  const cb = training ? [] : (data.cashbooks || []).filter(x => x.date === day);
  const book = t => cb.filter(x => x.type === t), deposits = sum(book('DEPOSIT'), x => int(x.inCents)), withdrawals = sum(book('WITHDRAWAL'), x => int(x.outCents));
  let opening = 0, source = 'NONE';
  if (finite(opts.openingCents)) { opening = int(opts.openingCents); source = 'INPUT'; }
  else if (!training && book('OPENING').length) { opening = sum(book('OPENING'), x => int(x.inCents)); source = 'CASHBOOK'; }
  else if (!training) {
    const prev = (data.dailySettlements || []).filter(s => s && s.mode !== 'TRAINING' && s.type === 'CLOSING' && s.day < day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
    if (prev && prev.count) { opening = int(prev.count.leaveCents != null ? prev.count.leaveCents : prev.count.countedCents); source = 'PREVIOUS'; }
  }
  const cash = { openingCents: opening, openingSource: source, salesCents: revenue.cashCents, tipCents: tipCashC, refundsCents: stCash, depositsCents: deposits, withdrawalsCents: withdrawals };
  cash.expectedCents = opening + cash.salesCents + tipCashC - stCash + deposits - withdrawals;
  if (finite(opts.countedCents)) {
    cash.countedCents = int(opts.countedCents); cash.differenceCents = cash.countedCents - cash.expectedCents;
    cash.state = cash.differenceCents === 0 ? 'OK' : cash.differenceCents > 0 ? 'OVER' : 'SHORT';
    cash.leaveCents = finite(opts.leaveCents) ? int(opts.leaveCents) : cash.countedCents; cash.takeOutCents = cash.countedCents - cash.leaveCents;
  }

  // TSE + أرقام الوصولات (REAL بس) — بتنعرض كما هي
  let tse = null, receipts = null;
  if (!training) {
    const fisc = new Map((data.fiscalTransactions || []).filter(f => f.paymentId).map(f => [f.paymentId, f]));
    const rec = new Map((data.receipts || []).filter(r => r.paymentId).map(r => [r.paymentId, r]));
    const sorted = pays.slice().sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    const signed = sorted.filter(p => { const f = fisc.get(p.id); return f && (f.transactionNumber || f.tseTransactionNumber); }).length;
    const nums = sorted.map(p => (rec.get(p.id) || {}).receiptNumber).filter(Boolean);
    const ser = sorted.map(p => fisc.get(p.id)).filter(f => f && (f.tseSerialNumber || f.serialNumber)).map(f => f.tseSerialNumber || f.serialNumber)[0] || '';
    tse = { signed, unsigned: sorted.length - signed, serial: ser };
    receipts = { first: nums[0] || '', last: nums[nums.length - 1] || '' };
  }

  const cnt = new Set(pays.map(p => String(p.orderId))).size;
  return {
    version: 1, day, mode, sinceIso: opts.sinceIso || null,
    counts: { orders: cnt, payments: pays.length, avgCents: cnt ? Math.round(grossC / cnt) : 0 },
    revenue, storno, net: { grossCents: grossC - stC, cashCents: revenue.cashCents - stCash, cardCents: revenue.cardCents - stCard },
    vat, cancelled: { count: cancelled.length, cartCents: sum(cancelled, orderTotal) },
    open: { count: open.length, rows: open.map(o => ({ id: String(o.id), code: o.displayCode || '', totalCents: orderTotal(o) })) },
    platform, cash, tse, receipts,
  };
}

// ── الترقيم والحالة ────────────────────────────────────────────────────────────
function nextNumber(data, day) {
  const year = String(day).slice(0, 4), re = new RegExp('^Z-' + year + '-(\\d{4})$');
  const max = Math.max(0, ...(data.dailySettlements || []).filter(s => s && s.mode !== 'TRAINING' && s.type === 'CLOSING').map(s => { const m = re.exec(String(s.number || '')); return m ? Number(m[1]) : 0; }));
  return 'Z-' + year + '-' + String(max + 1).padStart(4, '0');
}

// حالة اليوم: مقفول؟ مبيعات بعد التقفيلة؟ أيام فاتت بدون تقفيلة؟
function status(data, day, opts = {}) {
  const list = settlementsOf(data, day), closing = list.find(s => s.type === 'CLOSING') || null;
  let late = null;
  if (closing) {
    const r = build(data, day, { mode: 'REAL', sinceIso: list[list.length - 1].closedAt });
    if (r.counts.payments || r.storno.count) late = { count: r.counts.payments, grossCents: r.net.grossCents, stornoCount: r.storno.count };
  }
  const missed = [];
  for (let i = 1; i <= (opts.lookbackDays || 7); i++) {
    const d = SLG.addDays(day, -i);
    if (!settlementsOf(data, d).some(s => s.type === 'CLOSING') && build(data, d, { mode: 'REAL' }).counts.payments > 0) missed.push(d);
  }
  return { day, closed: !!closing, closing: closing ? { id: closing.id, number: closing.number, closedAt: closing.closedAt } : null, lateSales: late, missedDays: missed, nextNumber: nextNumber(data, day) };
}

// ── إنشاء سجل ثابت (السيرفر بيدفعو لـ dailySettlements) ─────────────────────────
// input: { countedCents, leaveCents, openingCents, denominations:{"2000":3}, note, nachtrag:true, mode }
function makeRecord(data, { day, input = {}, user = null, now, newId }) {
  if (!ISO.test(day || '')) throw new ClosingError(422, 'Ungültiger Tag.', 'BAD_DAY');
  if (input.mode === 'TRAINING') throw new ClosingError(422, 'Übungsabschluss wird nicht gespeichert.', 'TRAINING_NOT_SAVED');
  if (day > bizDay.day(now)) throw new ClosingError(422, 'Der Geschäftstag liegt in der Zukunft.', 'FUTURE_DAY');
  const list = settlementsOf(data, day), closing = list.find(s => s.type === 'CLOSING') || null;
  const note = String(input.note || '').slice(0, 500), by = user ? { id: user.id || null, name: user.name || user.username || '', role: user.role || '' } : null;
  const base = { id: newId('settlement'), day, mode: 'REAL', closedAt: now, closedBy: by };

  if (input.nachtrag === true) {
    if (!closing) throw new ClosingError(409, 'Für diesen Tag gibt es noch keinen Abschluss.', 'NO_CLOSING');
    const report = build(data, day, { mode: 'REAL', sinceIso: list[list.length - 1].closedAt });
    if (!report.counts.payments && !report.storno.count) throw new ClosingError(409, 'Keine neuen Umsätze seit dem Abschluss.', 'NOTHING_NEW');
    const k = list.filter(s => s.type === 'NACHTRAG').length + 1;
    return { ...base, type: 'NACHTRAG', number: closing.number + '-N' + k, refId: closing.id, report, count: { note } };
  }
  if (closing) throw new ClosingError(409, 'Dieser Tag ist bereits abgeschlossen (' + closing.number + ').', 'ALREADY_CLOSED');
  if (!Number.isInteger(input.countedCents) || input.countedCents < 0) throw new ClosingError(422, 'Gezählter Kassenbestand fehlt.', 'COUNT_REQUIRED');
  if (input.leaveCents != null && (!Number.isInteger(input.leaveCents) || input.leaveCents < 0 || input.leaveCents > input.countedCents)) throw new ClosingError(422, 'Ungültiger Betrag für „Kasse lassen“.', 'BAD_LEAVE');
  if (input.openingCents != null && (!Number.isInteger(input.openingCents) || input.openingCents < 0)) throw new ClosingError(422, 'Ungültiger Anfangsbestand.', 'BAD_OPENING');
  let denominations = null;
  if (input.denominations != null) {
    const d = input.denominations; denominations = {};
    if (typeof d !== 'object' || Array.isArray(d)) throw new ClosingError(422, 'Ungültige Stückelung.', 'BAD_DENOMINATIONS');
    for (const [k, v] of Object.entries(d)) { if (!/^\d+$/.test(k) || !Number.isInteger(v) || v < 0) throw new ClosingError(422, 'Ungültige Stückelung.', 'BAD_DENOMINATIONS'); if (v) denominations[k] = v; }
    if (sum(Object.entries(denominations), ([k, v]) => Number(k) * v) !== input.countedCents) throw new ClosingError(422, 'Stückelung passt nicht zum gezählten Betrag.', 'DENOMINATIONS_MISMATCH');
  }
  const report = build(data, day, { mode: 'REAL', openingCents: input.openingCents, countedCents: input.countedCents, leaveCents: input.leaveCents });
  return { ...base, type: 'CLOSING', number: nextNumber(data, day), report, count: { countedCents: report.cash.countedCents, leaveCents: report.cash.leaveCents, denominations, note } };
}

// إعادة طباعة = حدث تدقيق (السجل نفسو ما بيتعدّل). copyNumber = رقم النسخة.
function reprintAudit(data, settlement, user, now, newId) {
  const prior = (data.auditEvents || []).filter(e => e.type === 'CLOSING_REPRINT' && e.details && e.details.settlementId === settlement.id).length;
  return { id: newId('audit'), type: 'CLOSING_REPRINT', createdAt: now, details: { settlementId: settlement.id, number: settlement.number, copyNumber: prior + 1, by: user ? (user.name || user.username || user.id || '') : '' } };
}

module.exports = { build, status, makeRecord, nextNumber, reprintAudit, rateResolver, allocate, isDrinkName, ClosingError };
