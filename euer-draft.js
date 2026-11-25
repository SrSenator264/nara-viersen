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
function overlapShare(st, from, to) {
  const b = isDay(st.periodFrom) ? st.periodFrom : st.periodTo, e = st.periodTo;
  if (!isDay(e) || !isDay(b) || e < from || b > to) return 0;
  const lo = b > from ? b : from, hi = e < to ? e : to;
  return daysBetween(lo, hi) / daysBetween(b, e);
}

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
  const stmts = [], covered = {};
  let stmtFees = 0, stmtGoods = 0;
  for (const x of data.platformStatements || []) {
    const sh = overlapShare(x, from, to); if (!sh) continue;
    stmts.push(x);
    stmtFees += Math.round(((x.commissionGrossCents || 0) + (x.otherFeesCents || 0)) * sh);
    stmtGoods += Math.round((x.goodsCents || 0) * sh); // بضاعة من فواتير المنصة (Lanch: مكوّنات وتغليف) ← مصروف بضاعة مو عمولة
    if (x.documentKind === 'SETTLEMENT' || x.documentKind === 'COMMISSION_INVOICE') {
      const b = isDay(x.periodFrom) ? x.periodFrom : x.periodTo, set = (covered[x.platform] ??= new Set());
      for (let n = Math.max(dnum(b), dnum(from)); n <= Math.min(dnum(x.periodTo), dnum(to)); n++) set.add(n);
    }
  }
  if (!platformFeeInvoices.length) { exp.PLATFORM_FEES += stmtFees; exp.GOODS += stmtGoods; }
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
  const incomeCents = ownCents + platformCents + manual;
  const expenseCents = Object.values(exp).reduce((a, b) => a + b, 0) + afa;
  // تغطية الكشوف: منصة إلها مبيعات بالفترة بس أيام ناقصة بالكشوف
  const days = daysBetween(from, to), coverage = {};
  for (const [pf, cents] of Object.entries(byPlatform)) if (cents > 0) coverage[pf] = { days: covered[pf] ? covered[pf].size : 0, of: days };
  const uncovered = platformFeeInvoices.length ? [] : Object.keys(coverage).filter(pf => coverage[pf].days < days);
  const warnings = [];
  if (regime === 'REGEL') warnings.push('REGEL_NET_SPLIT_NEEDED');
  if (!invoiceCount) warnings.push('NO_PURCHASE_INVOICES');
  if (!stmts.length && !platformFeeInvoices.length && platformCents) warnings.push('NO_PLATFORM_FEES');
  else if (uncovered.length) warnings.push('PLATFORM_STATEMENT_GAPS');
  if (!pay.length) warnings.push('NO_PAYROLL');
  if (Object.keys(guessed).length) warnings.push('CATEGORIES_GUESSED');
  if (!exp.RENT) warnings.push('NO_RENT');
  if (manualSkipped) warnings.push('MANUAL_REVENUE_YEARLY_ONLY');
  return {
    from, to, regime, income: { ownCents, platformCents, byPlatform, manualCents: manual, totalCents: incomeCents },
    expenses: { ...exp, AFA: afa, totalCents: expenseCents }, profitCents: incomeCents - expenseCents,
    counts: { invoices: invoiceCount, platformStatements: stmts.length, ownSales: l.own.totals.count, platformOrders: l.platform.totals.count },
    statementCoverage: coverage, uncoveredPlatforms: uncovered, guessedCategories: guessed, warnings, reviewRequired: true,
  };
}

// EÜR لسنة كاملة = نفس الحساب على 01.01–31.12
function build(data, year) {
  return { year, ...buildPeriod(data, year + '-01-01', year + '-12-31') };
}

module.exports = { build, buildPeriod, overlapShare, categorize, CATS };
