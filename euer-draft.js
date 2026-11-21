'use strict';
// euer-draft.js — مسودة EÜR (Einnahmenüberschussrechnung) لسنة كاملة. قراءة بس، تحضير للمراجعة، مو إقرار.
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

function build(data, year) {
  const from = year + '-01-01', to = year + '-12-31', inY = d => d >= from && d <= to;
  const acc = (data.settings && data.settings.accounting) || {}, regime = str(acc.vatRegime).toUpperCase() || null;
  const l = SL.build(data, from, to);
  const ownCents = l.own.totals.grossCents, platformCents = l.platform.totals.grossCents;
  const manual = Math.max(0, Math.round(Number((acc.manualRevenueCents || {})[year] || 0)));
  const sup = new Map((data.suppliers || []).map(s => [str(s.id), s.name]));
  const overrides = acc.supplierCategories || {};
  const exp = Object.fromEntries(CATS.map(c => [c, 0])), guessed = {}, platformFeeInvoices = [];
  let invoiceCount = 0;
  for (const i of data.invoices || []) {
    if (['CANCELLED', 'DRAFT'].includes(str(i.status).toUpperCase())) continue;
    const d = str(i.invoiceDate || i.createdAt).slice(0, 10); if (!inY(d)) continue;
    const name = str(i.supplierName || sup.get(str(i.supplierId))), { cat, guessed: g } = categorize(name, i, overrides), c = invCents(i);
    exp[cat] += c; invoiceCount++;
    if (g) guessed[name || '?'] = cat;
    if (cat === 'PLATFORM_FEES') platformFeeInvoices.push(i.id);
  }
  // عمولات المنصات من الكشوف المحفوظة (إذا ما في فواتير عمولة مرفوعة كفواتير)
  const stmts = (data.platformStatements || []).filter(s => s.periodTo && inY(s.periodTo));
  const stmtFees = stmts.reduce((s, x) => s + (x.commissionGrossCents || 0) + (x.otherFeesCents || 0), 0);
  if (!platformFeeInvoices.length) exp.PLATFORM_FEES += stmtFees;
  exp.WAGES += (data.payrollPayments || []).filter(p => inY(str(p.date))).reduce((s, p) => s + Number(p.amountCents || 0), 0);
  // AfA: خطي شهري للأصول الفعّالة، بس الأشهر اللي جوّا السنة
  let afa = 0;
  for (const a of data.fixedAssets || []) {
    if (a.status && a.status !== 'ACTIVE') continue;
    const start = str(a.purchaseDate).slice(0, 7); if (!start) continue;
    const [sy, sm] = start.split('-').map(Number), life = Number(a.usefulLifeMonths || 0), m = Number(a.monthlyDepreciationCents || 0);
    for (let k = 0; k < life; k++) { const yy = sy + Math.floor((sm - 1 + k) / 12); if (yy === year) afa += m; if (yy > year) break; }
  }
  const incomeCents = ownCents + platformCents + manual;
  const expenseCents = Object.values(exp).reduce((a, b) => a + b, 0) + afa;
  const warnings = [];
  if (!regime) warnings.push('VAT_REGIME_NOT_SET');
  if (regime === 'REGEL') warnings.push('REGEL_NET_SPLIT_NEEDED');
  if (!invoiceCount) warnings.push('NO_PURCHASE_INVOICES');
  if (!stmts.length && !platformFeeInvoices.length && platformCents) warnings.push('NO_PLATFORM_FEES');
  if (!(data.payrollPayments || []).some(p => inY(str(p.date)))) warnings.push('NO_PAYROLL');
  if (Object.keys(guessed).length) warnings.push('CATEGORIES_GUESSED');
  if (!exp.RENT) warnings.push('NO_RENT');
  return {
    year, regime, income: { ownCents, platformCents, manualCents: manual, totalCents: incomeCents },
    expenses: { ...exp, AFA: afa, totalCents: expenseCents }, profitCents: incomeCents - expenseCents,
    counts: { invoices: invoiceCount, platformStatements: stmts.length, ownSales: l.own.totals.count, platformOrders: l.platform.totals.count },
    guessedCategories: guessed, warnings, reviewRequired: true,
  };
}

module.exports = { build, categorize, CATS };
