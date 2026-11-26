'use strict';
// euer-draft.js — مسودة EÜR (Einnahmenüberschussrechnung) لسنة كاملة، ونفس الحساب لأي فترة (الربح والخسارة الشهري). قراءة بس، تحضير للمراجعة، مو إقرار.
// Kleinunternehmer: الإيرادات = كل المبيعات الإجمالية (المحل + المنصات)، والضريبة المدفوعة على المصاريف ما بترجع ← المصاريف بالإجمالي (brutto).
// Regelbesteuerung: نفس الشي حالياً، مع تنبيه إنو لازم فصل صافي/ضريبة (المرحلة B).

const SL = require('./sales-ledger.js');
const str = v => (v == null ? '' : String(v));
const low = v => str(v).toLowerCase();
const invCents = i => { for (const k of ['totalAmountCents', 'totalCents', 'grossAmountCents']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k])); for (const k of ['totalAmount', 'grossAmount']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k]) * 100); return 0; };

// تصنيف المصاريف: إعداد يدوي لكل مورّد أولاً، بعدين من اسم المورّد، وإلا بضاعة (إذا في بنود) أو متفرقات
const CATS = ['GOODS', 'RENT', 'ENERGY', 'TELECOM', 'INSURANCE', 'PLATFORM_FEES', 'WAGES', 'VEHICLE', 'MARKETING', 'EQUIPMENT_SMALL', 'BANK_FEES', 'OTHER'];
const GUESS = [
  ['RENT', /miete|vermiet|hausverwalt|immobil/],
  ['ENERGY', /strom|energie|ewe|logo ?energie|stadtwerke|gas|wasser/],
  ['TELECOM', /telekom|vodafone|o2|1&1|internet|mobilfunk/],
  ['INSURANCE', /bgn|berufsgenossenschaft|versicherung|allianz|axa|ergo|hdi|ihk|gez|rundfunk/],
  ['PLATFORM_FEES', /lieferando|takeaway|uber|wolt|sides/],
  ['VEHICLE', /tankstelle|aral|shell|esso|total|kfz|autohaus|werkstatt/],
  ['MARKETING', /flyer|druck|werbung|google ads|meta|facebook|instagram|canva/],
  ['BANK_FEES', /wise|qonto|bank|sumup|paypal/],
];
function categorize(name, i, overrides) {
  const o = overrides[str(i.supplierId)] || overrides[low(name)];
  if (o && CATS.includes(o)) return { cat: o, guessed: false };
  if (i.category && CATS.includes(str(i.category).toUpperCase())) return { cat: str(i.category).toUpperCase(), guessed: false };
  const n = low(name); for (const [c, re] of GUESS) if (re.test(n)) return { cat: c, guessed: true };
  return { cat: (i.lineItems || i.lines || []).length ? 'GOODS' : 'OTHER', guessed: true };
}

const DAY = 86400000, dnum = d => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
const daysBetween = (a, b) => dnum(b) - dnum(a) + 1;
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v));

// حصة الكشف اللي بتقع جوّا الفترة (حسب الأيام). كشف بدون بداية = كلو بيوم النهاية.
// skip = أيام (أرقام) مغطاية بملخّص شهري لنفس المنصة → ما بتنحسب من هالكشف.
function overlapShare(st, from, to, skip) {
  const b = isDay(st.periodFrom) ? st.periodFrom : st.periodTo, e = st.periodTo;
  if (!isDay(e) || !isDay(b) || e < from || b > to) return 0;
  const lo = Math.max(dnum(b), dnum(from)), hi = Math.min(dnum(e), dnum(to));
  let n = 0; for (let d = lo; d <= hi; d++) if (!skip || !skip.has(d)) n++;
  return n / daysBetween(b, e);
}
const daySet = (st, from, to) => { const s = new Set(), b = isDay(st.periodFrom) ? st.periodFrom : st.periodTo; if (!isDay(b) || !isDay(st.periodTo)) return s; for (let n = Math.max(dnum(b), dnum(from)); n <= Math.min(dnum(st.periodTo), dnum(to)); n++) s.add(n); return s; };

// الربح والخسارة لأي فترة (يوم أو شهر أو سنة). from/to = YYYY-MM-DD (يوم شغل).
function buildPeriod(data, from, to) {
  const inP = d => d >= from && d <= to;
  const acc = (data.settings && data.settings.accounting) || {}, regime = str(acc.vatRegime).toUpperCase() || 'REGEL';
  const l = SL.build(data, from, to);
  const ownCents = l.own.totals.grossCents, platformCents = l.platform.totals.grossCents;
  const byPlatform = { ...(l.platform.totals.byPlatform || {}) };
  // مبيعات يدوية سنوية: بتنحسب بس إذا الفترة مغطية السنة كلها
  let manual = 0, manualSkipped = false;
  for (const [y, v] of Object.entries(acc.manualRevenueCents || {})) {
    const cents = Math.max(0, Math.round(Number(v || 0))); if (!cents) continue;
    if (from <= y + '-01-01' && to >= y + '-12-31') manual += cents; else if (!(to < y + '-01-01' || from > y + '-12-31')) manualSkipped = true;
  }
  const sup = new Map((data.suppliers || []).map(s => [str(s.id), s.name]));
  const overrides = acc.supplierCategories || {};
  const exp = Object.fromEntries(CATS.map(c => [c, 0])), guessed = {}, platformFeeInvoices = [];
  let invoiceCount = 0;
  for (const i of data.invoices || []) {
    if (['CANCELLED', 'DRAFT'].includes(str(i.status).toUpperCase())) continue;
    const d = str(i.invoiceDate || i.createdAt).slice(0, 10); if (!inP(d)) continue;
    const name = str(i.supplierName || sup.get(str(i.supplierId))), { cat, guessed: g } = categorize(name, i, overrides), c = invCents(i);
    exp[cat] += c; invoiceCount++;
    if (g) guessed[name || '?'] = cat;
    if (cat === 'PLATFORM_FEES') platformFeeInvoices.push(i.id);
  }
  // عمولات المنصات من الكشوف المحفوظة (إذا ما في فواتير عمولة مرفوعة كفواتير)، بس حصة الأيام اللي جوّا الفترة
  // الملخّص الشهري (MONTHLY_SUMMARY) هو المرجع للأيام اللي بيغطّيها؛ الكشوف الأسبوعية لنفس المنصة بتنحسب بس على الأيام الباقية
  const all = data.platformStatements || [], monthly = {};
  for (const x of all) if (x.documentKind === 'MONTHLY_SUMMARY') for (const n of daySet(x, from, to)) (monthly[x.platform] ??= new Set()).add(n);
  const stmts = [], covered = {};
  let stmtFees = 0, stmtGoods = 0;
  for (const x of all) {
    const sh = overlapShare(x, from, to, x.documentKind === 'MONTHLY_SUMMARY' ? null : monthly[x.platform]); if (!sh) continue;
    stmts.push(x);
    stmtFees += Math.round(((x.commissionGrossCents || 0) + (x.otherFeesCents || 0)) * sh);
    stmtGoods += Math.round((x.goodsCents || 0) * sh); // بضاعة من فواتير المنصة (Lanch: مكوّنات وتغليف) ← مصروف بضاعة مو عمولة
    if (['SETTLEMENT', 'COMMISSION_INVOICE', 'MONTHLY_SUMMARY'].includes(x.documentKind)) { const set = (covered[x.platform] ??= new Set()); for (const n of daySet(x, from, to)) set.add(n); }
  }
  if (!platformFeeInvoices.length) { exp.PLATFORM_FEES += stmtFees; exp.GOODS += stmtGoods; }
  // Platform revenue per day: manual monthly figure (settings.accounting.manualIncome['YYYY-MM'][PF], e.g. from Partner Hub) wins for
  // its whole month; otherwise the best statement with grossCents covering that day (MONTHLY_SUMMARY > SETTLEMENT > COMMISSION_INVOICE),
  // spread evenly over its days; days without any statement fall back to Flamo orders (Flamo misses orders when a bridge is down).
  const RANK = { MONTHLY_SUMMARY: 3, SETTLEMENT: 2, COMMISSION_INVOICE: 1 };
  const manualInc = monthlyIncome(acc.manualIncome, from, to);
  const incSt = all.filter(x => RANK[x.documentKind] && x.grossCents != null && isDay(x.periodTo));
  const pfs = new Set([...Object.keys(byPlatform), ...incSt.map(x => x.platform), ...Object.keys(manualInc.byPf)]);
  const flamoDay = {};
  for (const r of l.platform.rows) { const k = r.platform + '|' + dnum(r.businessDay); flamoDay[k] = (flamoDay[k] || 0) + r.grossCents; }
  const incomeSource = {};
  let platformCentsAdj = 0;
  for (const pf of pfs) {
    const sts = incSt.filter(x => x.platform === pf), used = new Map(), skip = manualInc.days[pf] || new Set();
    let flamo = 0, stDays = 0;
    for (let n = dnum(from); n <= dnum(to); n++) {
      if (skip.has(n)) continue;
      let best = null;
      for (const x of sts) { const bb = isDay(x.periodFrom) ? x.periodFrom : x.periodTo; if (n < dnum(bb) || n > dnum(x.periodTo)) continue; if (!best || RANK[x.documentKind] > RANK[best.documentKind]) best = x; }
      if (best) { used.set(best, (used.get(best) || 0) + 1); stDays++; } else flamo += flamoDay[pf + '|' + n] || 0;
    }
    let stCents = 0;
    for (const [x, k] of used) stCents += Math.round(x.grossCents * k / daysBetween(isDay(x.periodFrom) ? x.periodFrom : x.periodTo, x.periodTo));
    const man = manualInc.byPf[pf] || 0, v = man + stCents + flamo;
    incomeSource[pf] = { manualCents: man, statementCents: stCents, statementDays: stDays, flamoCents: flamo, flamoOrdersCents: byPlatform[pf] || 0 };
    if (v || byPlatform[pf] != null) byPlatform[pf] = v;
    platformCentsAdj += v;
  }
  const pay = (data.payrollPayments || []).filter(p => inP(str(p.date)));
  exp.WAGES += pay.reduce((s, p) => s + Number(p.amountCents || 0), 0);
  // AfA: خطي شهري للأصول الفعّالة، كل شهر جوّا الفترة (الشهر الناقص بينحسب كامل)
  const fm = from.slice(0, 7), tm = to.slice(0, 7);
  let afa = 0;
  for (const a of data.fixedAssets || []) {
    if (a.status && a.status !== 'ACTIVE') continue;
    const start = str(a.purchaseDate).slice(0, 7); if (!start) continue;
    const [sy, sm] = start.split('-').map(Number), life = Number(a.usefulLifeMonths || 0), m = Number(a.monthlyDepreciationCents || 0);
    for (let k = 0; k < life; k++) {
      const mi = sm - 1 + k, key = (sy + Math.floor(mi / 12)) + '-' + String(mi % 12 + 1).padStart(2, '0');
      if (key > tm) break; if (key >= fm) afa += m;
    }
  }
  // Manual monthly expenses (settings.accounting.manualExpenses['YYYY-MM'][CAT] = {netCents, vatCents, note}); only months fully inside the period
  const manualExp = monthlyManual(acc.manualExpenses, from, to);
  for (const [c, v] of Object.entries(manualExp.byCat)) exp[c] += v;
  const incomeCents = ownCents + platformCentsAdj + manual;
  const expenseCents = Object.values(exp).reduce((a, b) => a + b, 0) + afa;
  // تغطية الكشوف: منصة إلها مبيعات بالفترة بس أيام ناقصة بالكشوف
  const days = daysBetween(from, to), coverage = {};
  for (const [pf, cents] of Object.entries(byPlatform)) if (cents > 0) coverage[pf] = { days: covered[pf] ? covered[pf].size : 0, of: days };
  const uncovered = platformFeeInvoices.length ? [] : Object.keys(coverage).filter(pf => coverage[pf].days < days);
  const warnings = [];
  if (regime === 'REGEL') warnings.push('REGEL_NET_SPLIT_NEEDED');
  if (!invoiceCount && !manualExp.total) warnings.push('NO_PURCHASE_INVOICES');
  if (manualExp.total) warnings.push(invoiceCount ? 'MANUAL_EXPENSES_WITH_INVOICES' : 'MANUAL_EXPENSES');
  if (!stmts.length && !platformFeeInvoices.length && platformCents) warnings.push('NO_PLATFORM_FEES');
  else if (uncovered.length) warnings.push('PLATFORM_STATEMENT_GAPS');
  if (!pay.length && !manualExp.byCat.WAGES) warnings.push('NO_PAYROLL');
  if (Object.keys(guessed).length) warnings.push('CATEGORIES_GUESSED');
  if (!exp.RENT) warnings.push('NO_RENT');
  if (manualSkipped) warnings.push('MANUAL_REVENUE_YEARLY_ONLY');
  return {
    from, to, regime, income: { ownCents, platformCents: platformCentsAdj, byPlatform, incomeSource, manualCents: manual, totalCents: incomeCents },
    expenses: { ...exp, AFA: afa, totalCents: expenseCents }, manualExpenses: manualExp, bank: require('./bank-category.js').totals(data, from, to), profitCents: incomeCents - expenseCents,
    counts: { invoices: invoiceCount, platformStatements: stmts.length, ownSales: l.own.totals.count, platformOrders: l.platform.totals.count },
    statementCoverage: coverage, uncoveredPlatforms: uncovered, guessedCategories: guessed, warnings, reviewRequired: true,
  };
}

function monthEnd(m) { return m + '-' + String(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()).padStart(2, '0'); }
// Manual monthly platform revenue: only months fully inside the period; returns cents per platform and the covered day numbers
function monthlyIncome(store, from, to) {
  const byPf = {}, days = {};
  for (const [m, pfs] of Object.entries(store || {})) {
    if (!/^\d{4}-\d{2}$/.test(m) || !pfs || typeof pfs !== 'object' || m + '-01' < from || monthEnd(m) > to) continue;
    for (const [pf, v] of Object.entries(pfs)) {
      const c = Math.round(Number(v && typeof v === 'object' ? v.cents : v)); if (!Number.isFinite(c) || c < 0) continue;
      byPf[pf] = (byPf[pf] || 0) + c; const set = (days[pf] ??= new Set()); for (let n = dnum(m + '-01'); n <= dnum(monthEnd(m)); n++) set.add(n);
    }
  }
  return { byPf, days };
}
function monthlyManual(store, from, to) {
  const byCat = {}, months = []; let total = 0, vat = 0;
  for (const [m, cats] of Object.entries(store || {})) {
    if (!/^\d{4}-\d{2}$/.test(m) || !cats || typeof cats !== 'object') continue;
    const last = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    if (m + '-01' < from || m + '-' + String(last).padStart(2, '0') > to) continue;
    let used = false;
    for (const [c, v] of Object.entries(cats)) {
      if (!CATS.includes(c) || !v) continue;
      const n = Math.max(0, Math.round(Number(v.netCents) || 0)), t = Math.max(0, Math.round(Number(v.vatCents) || 0)); if (!n && !t) continue;
      byCat[c] = (byCat[c] || 0) + n + t; total += n + t; vat += t; used = true;
    }
    if (used) months.push(m);
  }
  return { byCat, total, vatCents: vat, months };
}

// EÜR لسنة كاملة = نفس الحساب على 01.01–31.12
function build(data, year) {
  return { year, ...buildPeriod(data, year + '-01-01', year + '-12-31') };
}

module.exports = { build, buildPeriod, overlapShare, categorize, monthlyManual, monthlyIncome, CATS };
