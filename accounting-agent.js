'use strict';
// accounting-agent.js — المحاسب الذكي: وكيل مخصص للحسابات بس.
// بيحكي مع عمر، وبيقرا البيانات الحقيقية عن طريق أدوات (فواتير، تقفيلات، مبيعات، بنك، مخزون، موردين، قيود).
// القاعدة: قراءة بس. ولا أداة بتكتب أو بترحّل أو بتقفل شي. أي اقتراح قيد = نص، والتنفيذ بيضل بموافقة عمر من الصفحات.
// المزوّد: Claude (ANTHROPIC_API_KEY) أولاً، وإذا ما في مفتاح → Gemini. الموديل قابل للتبديل بـ NARA_ACCOUNTING_MODEL.

const fs = require('node:fs');
const path = require('node:path');
const SL = require('./sales-ledger.js');
const AH = require('./accounting-health.js');
const bizDay = require('./business-day.js');
const AN = require('./accounting-anomalies.js');
const BM = require('./bank-match.js');
const PS = require('./platform-statement.js');
const EU = require('./euer-draft.js');
const DC = require('./dish-cost.js');
const PC = require('./purchase-categories.js');
const KB = require('./kassenbuch.js');

const str = v => (v == null ? '' : String(v));
const low = v => str(v).toLowerCase();
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
const MAX_RESULT = 12000;

// مبالغ الفواتير محفوظة أحياناً باليورو (totalAmount) وأحياناً بالسنت (totalCents) → دايماً سنت
const centsOf = (x, centKeys, euroKeys) => {
  for (const k of centKeys) if (x && x[k] != null && Number.isFinite(Number(x[k]))) return Math.round(Number(x[k]));
  for (const k of euroKeys) if (x && x[k] != null && Number.isFinite(Number(x[k]))) return Math.round(Number(x[k]) * 100);
  return null;
};
const invTotal = i => centsOf(i, ['totalAmountCents', 'totalCents', 'grossAmountCents'], ['totalAmount', 'grossAmount']);
const invNet = i => centsOf(i, ['netAmountCents', 'netCents'], ['netAmount']);
const invVat = i => centsOf(i, ['vatAmountCents', 'inputVatCents'], ['vatAmount']);
const dayOf = v => (v ? bizDay.dayOf(v) : '');
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

// ───────── الأدوات (كلها قراءة بس) ─────────
const TOOLS = [
  { name: 'overview', description: 'Gesamtbild: Umsatzgrenze §19 UStG (Jahr), Monatsabschluss-Checkliste, nächste Fristen. Für "wie stehen wir", "was fehlt", "Fristen".',
    parameters: { type: 'object', properties: { year: { type: 'integer' }, month: { type: 'integer' } } } },
  { name: 'sales', description: 'Umsätze in einem Zeitraum (Geschäftstage YYYY-MM-DD): Kasse/Website (mit TSE) getrennt von Plattformen (Lieferando, Uber, Loco), bar/Karte, pro Tag, Top-Artikel.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'day_closing', description: 'Tagesabschluss (Z-Bon / تقفيلة) eines Geschäftstages mit allen Zahlen: Umsatz, bar, Karte, Kassendifferenz, Storno, Nachträge.',
    parameters: { type: 'object', properties: { day: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['day'] } },
  { name: 'find_invoices', description: 'Eingangsrechnungen/Belege suchen (Lieferant, Nummer, Text, Zeitraum). Liefert Liste mit IDs, Beträgen, Status.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, supplier: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, limit: { type: 'integer' } } } },
  { name: 'invoice_detail', description: 'Eine Eingangsrechnung komplett: Kopf, alle Positionen (Menge, Einzelpreis, Summe, USt), Lieferant, Beleg, Buchungsstatus.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, invoiceNumber: { type: 'string' } } } },
  { name: 'suppliers', description: 'Lieferanten mit Anzahl Rechnungen, Summe und letzter Rechnung (optional Zeitraum/Suche).',
    parameters: { type: 'object', properties: { query: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } } },
  { name: 'stock', description: 'Lagerbestand: Artikel mit aktuellem Bestand, Mindestbestand, Einheit, letztem Einkaufspreis. lowOnly=true nur unter Mindestbestand.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, lowOnly: { type: 'boolean' } } } },
  { name: 'price_history', description: 'Einkaufspreis-Verlauf eines Lagerartikels (wer, wann, wie viel).',
    parameters: { type: 'object', properties: { item: { type: 'string' } }, required: ['item'] } },
  { name: 'bank', description: 'Bankbewegungen (Wise/Qonto Import) im Zeitraum, optional Status UNMATCHED/MATCHED und Textsuche.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, status: { type: 'string' }, query: { type: 'string' } } } },
  { name: 'journal', description: 'Buchungsjournal (Soll/Haben) im Zeitraum, optional nur ein Konto (Nummer).',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, account: { type: 'string' } } } },
  { name: 'order', description: 'Eine Bestellung/Bon nach Code (Bestellcode, Plattform-Nr. oder ID) mit Zahlung, TSE und Positionen.',
    parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'anomalies', description: 'Auffälligkeiten der letzten Wochen: doppelte Rechnungen, Preissprünge beim Einkauf, Kassendifferenzen, ungewöhnlich schwache Umsatztage, alte offene Bankbuchungen, Rechnungen ohne Beleg, USt-Konflikt Kleinunternehmer.',
    parameters: { type: 'object', properties: { days: { type: 'integer' } } } },
  { name: 'bank_suggestions', description: 'Vorschläge, welche offene Bankbuchung zu welcher Rechnung / Plattform-Auszahlung / Lohnzahlung passt (mit Sicherheit high/medium/low).',
    parameters: { type: 'object', properties: {} } },
  { name: 'platform_statements', description: 'Gespeicherte Plattform-Abrechnungen (Lieferando, Uber Eats, Sides/Loco): Bruttoumsatz, Provision, Gebühren, Auszahlung und Abgleich mit den Bestellungen in Flamo (Differenz Anzahl/Betrag).',
    parameters: { type: 'object', properties: { platform: { type: 'string' } } } },
  { name: 'euer_draft', description: 'Entwurf der EÜR (Einnahmenüberschussrechnung) für ein Jahr: Einnahmen (Kasse, Plattformen), Ausgaben nach Kategorie (Wareneinkauf, Miete, Energie, Telefon, Versicherung/BGN, Plattformgebühren, Löhne, AfA…), Gewinn, Warnungen was fehlt.',
    parameters: { type: 'object', properties: { year: { type: 'integer' } } } },
  { name: 'dish_costs', description: 'Wareneinsatz pro Gericht aus Rezept × letztem Einkaufspreis, Verkaufspreis, Marge und Kostenanteil in %. Optional Suche nach Gericht.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'purchases', description: 'Einkäufe nach Warengruppe (Fleisch, Brot, Gemüse, Käse, Saucen, TK/Pommes, Getränke, Öl, Verpackung, Reinigung) für einen Monat, Vergleich mit Vormonat, Top-5-Artikel, unkategorisierte Positionen.',
    parameters: { type: 'object', properties: { year: { type: 'integer' }, month: { type: 'integer' } } } },
  { name: 'kassenbuch', description: 'Kassenbuch eines Monats aus den Tagesabschlüssen: Anfangsbestand, Bareinnahmen, Entnahmen, Differenzen, fehlende Abschlüsse.',
    parameters: { type: 'object', properties: { year: { type: 'integer' }, month: { type: 'integer' } } } },
  { name: 'cashbook', description: 'Kassenbuch-Einträge (Anfangsbestand, Einlagen, Entnahmen, Abschluss) im Zeitraum.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
];

function makeTools(data, { today } = {}) {
  const suppliers = data.suppliers || [], supById = new Map(suppliers.map(s => [String(s.id), s]));
  const supName = i => str(i.supplierName || (supById.get(String(i.supplierId)) || {}).name);
  const items = data.inventoryItems || [], itemById = new Map(items.map(x => [String(x.id), x]));
  const accById = new Map((data.chartOfAccounts || []).map(a => [String(a.id), a]));
  const docs = data.documents || [];
  const invDay = i => dayOf(i.invoiceDate || i.createdAt);
  const brief = i => ({ id: i.id, invoiceNumber: i.invoiceNumber || null, supplier: supName(i) || null, date: invDay(i), totalCents: invTotal(i), netCents: invNet(i), vatCents: invVat(i), status: i.status || null, documentId: i.documentId || null, lines: (i.lineItems || i.lines || []).length });
  const lastPrice = id => (data.purchasePriceHistory || []).filter(p => String(p.inventoryItemId) === String(id)).sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)))[0];

  const run = {
    overview: a => { const r = AH.build(data, { today, year: a.year, month: a.month }); const k = r.klein; return { today: r.today, vatRegime: k.regime || 'NICHT_FESTGELEGT', limit: { ytdCents: k.ytdCents, ownCents: k.ownCents, platformCents: k.platformCents, manualCents: k.manualCents, prevYearCents: k.prevYearCents, projectedCents: k.projectedCents, crossDate: k.crossDate, status: k.status, conflict: k.conflict, vatOnReceipts: k.vatOnReceipts }, month: r.month, deadlines: r.deadlines.slice(0, 8) }; },
    sales: a => {
      if (!isDay(a.from) || !isDay(a.to)) return { error: 'from/to als YYYY-MM-DD' };
      const l = SL.build(data, a.from, a.to), s = SL.summary(data, l);
      return { from: a.from, to: a.to, totals: s.totals, payment: s.payment, byPlatform: s.byPlatform, byBrand: s.byBrand, byDay: s.byDay.slice(-62).map(d => ({ day: d.day, ownCents: d.ownCents, platformCents: d.platformCents, count: d.count })), topItems: s.topItems.slice(0, 10), own: { count: l.own.totals.count, tseMissing: l.own.totals.tseMissing } };
    },
    day_closing: a => {
      if (!isDay(a.day)) return { error: 'day als YYYY-MM-DD' };
      const recs = (data.dayClosings || []).filter(s => s && s.day === a.day && s.mode !== 'TRAINING');
      if (!recs.length) return { day: a.day, found: false, hint: 'Kein Tagesabschluss gespeichert. Umsatz des Tages über sales abrufbar.' };
      return { day: a.day, found: true, records: recs.map(r => ({ ...r, lines: undefined })) };
    },
    find_invoices: a => {
      const q = low(a.query), sq = low(a.supplier), lim = Math.max(1, Math.min(50, num(a.limit) || 20));
      const rows = (data.invoices || []).filter(i => inRange(invDay(i), a.from, a.to) && (!sq || low(supName(i)).includes(sq)) && (!q || [i.invoiceNumber, supName(i), i.id, i.notes].some(v => low(v).includes(q)) || (i.lineItems || i.lines || []).some(l => low(l.originalDescription || l.description || l.name).includes(q))))
        .sort((x, y) => invDay(y).localeCompare(invDay(x)));
      const pendingDocs = docs.filter(d => /PENDING/.test(str(d.extractionStatus || d.status).toUpperCase()) && inRange(dayOf(d.documentDate || d.createdAt), a.from, a.to)).slice(0, 10).map(d => ({ id: d.id, title: d.title || (d.originalFilenames || []).join(', '), date: dayOf(d.documentDate || d.createdAt), type: d.accountingType || d.type, status: d.extractionStatus || d.status }));
      return { count: rows.length, sumCents: rows.reduce((s, i) => s + (invTotal(i) || 0), 0), invoices: rows.slice(0, lim).map(brief), documentsWaitingForReview: pendingDocs };
    },
    invoice_detail: a => {
      const all = data.invoices || [], id = str(a.id), nr = low(a.invoiceNumber);
      const i = all.find(x => str(x.id) === id) || (nr && all.find(x => low(x.invoiceNumber) === nr)) || (nr && all.find(x => low(x.invoiceNumber).includes(nr)));
      if (!i) return { found: false };
      const doc = docs.find(d => str(d.id) === str(i.documentId));
      const lines = (i.lineItems || i.lines || []).slice(0, 80).map(l => ({ code: l.supplierArticleCode || l.code || null, description: l.originalDescription || l.description || l.name || null, inventoryItem: (itemById.get(String(l.inventoryItemId)) || {}).name || l.suggestedInventoryName || null, quantity: l.quantity ?? null, unit: l.packageUnit || l.unit || null, unitPrice: l.unitPrice ?? null, lineTotal: l.lineTotal ?? null, vatRate: l.vatRate ?? null }));
      const journal = (data.journalEntries || []).filter(e => str(e.sourceRef).includes(str(i.id))).map(e => ({ number: e.number, date: e.date, status: e.status }));
      return { found: true, ...brief(i), deliveryDate: i.deliveryDate || null, customerNumber: i.customerNumber || null, currency: i.currency || 'EUR', postedAt: i.postedAt || null, lines, document: doc ? { id: doc.id, files: doc.originalFilenames || [], status: doc.extractionStatus || doc.status || null } : null, journal };
    },
    suppliers: a => {
      const q = low(a.query), invs = (data.invoices || []).filter(i => inRange(invDay(i), a.from, a.to));
      const map = new Map();
      for (const s of suppliers) map.set(String(s.id), { id: s.id, name: s.name, customerNumber: s.customerNumber || null, invoices: 0, sumCents: 0, last: null });
      for (const i of invs) { const k = String(i.supplierId || supName(i) || '?'); const e = map.get(k) || { id: i.supplierId || null, name: supName(i) || '?', invoices: 0, sumCents: 0, last: null }; e.invoices++; e.sumCents += invTotal(i) || 0; if (!e.last || invDay(i) > e.last) e.last = invDay(i); map.set(k, e); }
      return { suppliers: [...map.values()].filter(s => !q || low(s.name).includes(q)).sort((x, y) => y.sumCents - x.sumCents).slice(0, 60) };
    },
    stock: a => {
      const q = low(a.query);
      const rows = items.filter(x => x.active !== false && (!q || low(x.name).includes(q))).map(x => { const p = lastPrice(x.id); return { id: x.id, name: x.name, unit: x.baseUnit || x.unit || null, currentStock: num(x.currentStock), minimumStock: num(x.minimumStock), low: num(x.minimumStock) > 0 && num(x.currentStock) < num(x.minimumStock), lastUnitPrice: p ? p.unitPrice : null, lastPriceDate: p ? dayOf(p.createdAt) : null }; });
      const out = a.lowOnly ? rows.filter(r => r.low) : rows;
      return { count: out.length, items: out.slice(0, 80), note: items.length ? undefined : 'Noch keine Lagerartikel angelegt.' };
    },
    price_history: a => {
      const q = low(a.item), it = items.find(x => low(x.name) === q) || items.find(x => low(x.name).includes(q));
      if (!it) return { found: false };
      const rows = (data.purchasePriceHistory || []).filter(p => String(p.inventoryItemId) === String(it.id)).sort((x, y) => str(x.createdAt).localeCompare(str(y.createdAt)))
        .map(p => ({ date: dayOf(p.createdAt), unitPrice: p.unitPrice, supplier: (supById.get(String(p.supplierId)) || {}).name || null, invoiceId: p.invoiceId || null }));
      return { found: true, item: it.name, unit: it.baseUnit || it.unit || null, history: rows.slice(-40) };
    },
    bank: a => {
      const q = low(a.query), st = str(a.status).toUpperCase();
      const rows = (data.bankTransactions || []).filter(x => inRange(str(x.date), a.from, a.to) && (!st || x.status === st) && (!q || low(x.description).includes(q) || low(x.reference).includes(q))).sort((x, y) => str(y.date).localeCompare(str(x.date)));
      return { count: rows.length, inCents: rows.filter(x => x.amountCents > 0).reduce((s, x) => s + x.amountCents, 0), outCents: rows.filter(x => x.amountCents < 0).reduce((s, x) => s + x.amountCents, 0), rows: rows.slice(0, 60).map(x => ({ id: x.id, date: x.date, amountCents: x.amountCents, description: x.description, reference: x.reference, status: x.status, matched: x.matchedEntityType ? x.matchedEntityType + ':' + x.matchedEntityId : null })) };
    },
    journal: a => {
      const acc = str(a.account);
      const rows = (data.journalEntries || []).filter(e => inRange(str(e.date), a.from, a.to)).map(e => ({ number: e.number, date: e.date, description: e.description, status: e.status, source: e.sourceRef || null, lines: (e.lines || []).map(l => { const ac = accById.get(String(l.accountId)) || {}; return { account: ac.number || null, name: ac.name || null, debitCents: num(l.debitCents), creditCents: num(l.creditCents), memo: l.memo || '' }; }) }))
        .filter(e => !acc || e.lines.some(l => str(l.account) === acc)).sort((x, y) => str(y.date).localeCompare(str(x.date)));
      return { count: rows.length, entries: rows.slice(0, 40) };
    },
    order: a => {
      const c = low(a.code).replace(/^#/, ''); if (!c) return { found: false };
      const o = (data.orders || []).find(x => [x.displayCode, x.externalOrderCode, x.id].some(v => low(v) === c)) || (data.orders || []).find(x => [x.displayCode, x.externalOrderCode].some(v => v && low(v).includes(c)));
      if (!o) return { found: false };
      const pays = (data.payments || []).filter(p => String(p.orderId) === String(o.id)).map(p => ({ id: p.id, at: p.createdAt, status: p.status, method: p.method, amountCents: p.amountCents, lines: p.paymentLines || null, isTest: !!p.isTest }));
      const fisc = (data.fiscalTransactions || []).filter(f => pays.some(p => p.id === f.paymentId)).map(f => ({ status: f.status, transactionNumber: f.transactionNumber || null, simulated: !!f.simulated, signedAt: f.signedAt || null }));
      return { found: true, code: o.displayCode || null, platform: SL.platformOf(o), brand: SL.brandOf(o), externalCode: o.externalOrderCode || null, status: o.status, businessDay: dayOf(o.placedAt || o.createdAt), totalCents: o.totalCents ?? null, training: !!(o.training || o.isTest), items: (o.cart || []).slice(0, 40).map(i => ({ name: i.name, qty: i.quantity || 1, cents: i.totalCents ?? i.cents ?? null })), payments: pays, tse: fisc };
    },
    anomalies: a => ({ items: AN.detect(data, { today, lookbackDays: Math.max(7, Math.min(365, num(a.days) || 60)) }).slice(0, 40) }),
    bank_suggestions: () => { const s = BM.suggest(data); return { count: s.length, suggestions: s.slice(0, 30) }; },
    platform_statements: a => { const pf = str(a.platform).toUpperCase(); const rows = (data.platformStatements || []).filter(s => !pf || s.platform === pf).sort((x, y) => str(y.periodTo).localeCompare(str(x.periodTo))).slice(0, 24); return { count: rows.length, statements: rows.map(s => ({ ...s, comparison: PS.compare(data, s) })), note: rows.length ? undefined : 'Noch keine Plattform-Abrechnung hochgeladen (Buchhaltung → Plattform-Abrechnungen).' }; },
    euer_draft: a => EU.build(data, Number(a.year) || Number(str(today || bizDay.today()).slice(0, 4))),
    dish_costs: a => DC.build(data, { query: a.query }),
    purchases: a => { const t = str(today || bizDay.today()); return PC.build(data, { year: Number(a.year) || Number(t.slice(0, 4)), month: Number(a.month) || Number(t.slice(5, 7)) }); },
    kassenbuch: a => { const t = str(today || bizDay.today()); return KB.build(data, { year: Number(a.year) || Number(t.slice(0, 4)), month: Number(a.month) || Number(t.slice(5, 7)) }); },
    cashbook: a => {
      const rows = (data.cashbooks || []).filter(x => inRange(str(x.date), a.from, a.to)).sort((x, y) => str(x.date).localeCompare(str(y.date)));
      return { count: rows.length, balanceCents: rows.reduce((s, x) => s + num(x.inCents) - num(x.outCents), 0), rows: rows.slice(-80) };
    },
  };
  return {
    run(name, args) {
      const f = run[name]; if (!f) return { error: 'unknown tool' };
      try { const out = f(args || {}); const s = JSON.stringify(out); return s.length > MAX_RESULT ? { truncated: true, data: s.slice(0, MAX_RESULT) } : out; } catch (e) { return { error: str(e && e.message).slice(0, 200) }; }
    },
  };
}

// ───────── System-Prompt ─────────
function systemPrompt({ lang, today, regime }) {
  let base = '';
  try { base = fs.readFileSync(path.join(__dirname, 'ACCOUNTING_AGENT_SYSTEM.md'), 'utf8'); } catch { /* optional */ }
  const L = { ar: 'Arabic in Levantine/Shami dialect (e.g. "هلق", "مو", "شو"); German accounting terms (Beleg, Kassenbuch, Vorsteuer) may stay in Latin letters', de: 'German', en: 'plain English' }[lang] || 'German';
  return [
    'You are "Flamo Buchhalter", the dedicated accounting agent of the owner Omar (restaurant IU GENE / Flamo, Viersen, Germany; Einzelunternehmen; payment platforms Lieferando, Uber Eats, Loco Chicken via Sides).',
    `Today (business day): ${today}. Business days start in the early morning: orders after midnight belong to the previous day. VAT status in settings: ${regime || 'not set'}.`,
    `Answer ONLY in ${L}. Never mix languages.`,
    'Scope: ONLY accounting, taxes, invoices, suppliers, stock/purchasing, sales figures, daily closings (تقفيلة/Z-Bon), bank, cash book, payroll costs. For anything else, say in one short sentence that you are only the accounting agent.',
    'Always use the tools to look up real data before answering a question about numbers. Never invent invoices, amounts, suppliers or VAT. If data is missing, say exactly what is missing. Amounts from tools are in cents: show them as euros with comma decimals (e.g. 12,50 €).',
    'Answer in detail when asked about a specific invoice, closing or order: list the relevant lines and figures clearly (short bullet points are fine, no big tables, no headings).',
    'You are read-only. You cannot post, change, delete or send anything. If something should be booked or fixed, propose it (e.g. a journal entry with Soll/Haben) and tell Omar which page to use; he approves it there.',
    'Kleinunternehmer (§19 UStG) note: the Gesamtumsatz includes ALL sales, including Lieferando/Uber/Loco platform orders (the restaurant is the seller), not only the shop till. Limits: previous year 25.000 €, current year 100.000 € (exceeding 100.000 € ends the rule immediately). Point out risks clearly but you are not a tax adviser; for binding decisions recommend a Steuerberater once.',
    'Keep it practical: start with the direct answer, then details, then at most one next step.',
    base ? '\nAdditional house rules (written earlier in Arabic):\n' + base : '',
  ].join('\n');
}

// ───────── Adapter (Claude / Gemini) ─────────
function anthropicAdapter({ key, model, base, fetchImpl = fetch, maxTokens = 1500, toolDefs = TOOLS }) {
  const url = (base || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages';
  const tools = toolDefs.map((t, i) => ({ name: t.name, description: t.description, input_schema: t.parameters, ...(i === toolDefs.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}) }));
  return {
    name: 'anthropic:' + model,
    init: (system, history, user) => ({ system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [...history, { role: 'user', content: user }] }),
    async call(st, noTools) {
      const body = { model, max_tokens: maxTokens, system: st.system, messages: st.messages, ...(noTools ? {} : { tools }) };
      let r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
      if ((r.status === 429 || r.status === 529 || r.status >= 500) && !st.retried) { st.retried = true; await new Promise(z => setTimeout(z, 2000)); r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) }); }
      if (!r.ok) { let m = ''; try { const e = await r.json(); m = (e.error && e.error.message) || ''; } catch { /* no body */ } throw Object.assign(new Error('Claude ' + r.status + ' ' + str(m).slice(0, 200)), { status: r.status }); }
      const j = await r.json(), blocks = Array.isArray(j.content) ? j.content : [];
      st.messages.push({ role: 'assistant', content: blocks });
      const u = j.usage || {};
      return { text: blocks.filter(b => b.type === 'text').map(b => b.text).join('').trim(), calls: blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
        usage: { in: num(u.input_tokens) + num(u.cache_creation_input_tokens) + Math.round(num(u.cache_read_input_tokens) * 0.1), out: num(u.output_tokens) } };
    },
    addResults: (st, calls, results) => st.messages.push({ role: 'user', content: calls.map((c, i) => ({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(results[i]) })) }),
    finalNoTools(st, nudge) { st.messages.push({ role: 'user', content: nudge }); return this.call(st, true); },
  };
}

function geminiAdapter({ key, model, fetchImpl = fetch, maxTokens = 2000, toolDefs = TOOLS }) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const decl = [{ functionDeclarations: toolDefs.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  return {
    name: 'gemini:' + model,
    init: (system, history, user) => ({ system, contents: [...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })), { role: 'user', parts: [{ text: user }] }] }),
    async call(st, noTools) {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: st.system }] }, contents: st.contents, tools: decl, toolConfig: { functionCallingConfig: { mode: noTools ? 'NONE' : 'AUTO' } }, generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens } }) });
      if (!r.ok) throw Object.assign(new Error('Gemini ' + r.status), { status: r.status });
      const j = await r.json(), parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      if (parts.length) st.contents.push({ role: 'model', parts });
      const u = j.usageMetadata || {};
      return { text: parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim(), calls: parts.filter(p => p.functionCall).map((p, i) => ({ id: 'g' + i, name: p.functionCall.name, args: p.functionCall.args || {} })), usage: { in: num(u.promptTokenCount), out: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount) } };
    },
    addResults: (st, calls, results) => st.contents.push({ role: 'user', parts: calls.map((c, i) => ({ functionResponse: { name: c.name, response: results[i] } })) }),
    finalNoTools(st, nudge) { st.contents.push({ role: 'user', parts: [{ text: nudge }] }); return this.call(st, true); },
  };
}

function providerFromEnv(env = process.env, fetchImpl = fetch, { toolDefs = TOOLS, prefix = 'NARA_ACCOUNTING', maxTokens } = {}) {
  const pick = low(env[prefix + '_PROVIDER']) || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.GEMINI_API_KEY ? 'gemini' : '');
  if (pick === 'anthropic' && env.ANTHROPIC_API_KEY) return anthropicAdapter({ key: str(env.ANTHROPIC_API_KEY).trim(), model: str(env[prefix + '_MODEL']) || 'claude-sonnet-5-5', base: env.NARA_AI_BASE_URL, fetchImpl, toolDefs, ...(maxTokens ? { maxTokens } : {}) });
  if (pick === 'gemini' && env.GEMINI_API_KEY) return geminiAdapter({ key: str(env.GEMINI_API_KEY).trim(), model: str(env[prefix + '_MODEL']) || str(env.GEMINI_MODEL) || 'gemini-flash-latest', fetchImpl, toolDefs, ...(maxTokens ? { maxTokens } : {}) });
  return null;
}

function cleanHistory(raw) {
  const history = (Array.isArray(raw) ? raw : []).slice(-10)
    .map(t => (t && typeof t.text !== 'string' && typeof t.content === 'string' ? { role: t.role, text: t.content } : t))
    .filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text.trim())
    .map(t => ({ role: t.role, content: t.text.slice(0, 2500) }));
  // Claude braucht abwechselnde Rollen, beginnend mit user
  while (history.length && history[0].role !== 'user') history.shift();
  const merged = []; for (const h of history) { const last = merged[merged.length - 1]; if (last && last.role === h.role) last.content += '\n' + h.content; else merged.push({ ...h }); }
  if (merged.length && merged[merged.length - 1].role === 'user') merged.pop();
  return merged;
}

// ───────── Ein Gesprächsschritt ─────────
async function chat(input, { data, adapter, today, maxRounds = 8 }) {
  const lang = ['de', 'en', 'ar'].includes(input.lang) ? input.lang : 'ar';
  today = today || bizDay.today();
  const merged = cleanHistory(input.history);
  const message = str(input.message).trim().slice(0, 3000);
  if (!message) return { ok: false, code: 'EMPTY_MESSAGE' };
  const regime = (data.settings && data.settings.accounting && data.settings.accounting.vatRegime) || 'KLEIN';
  const tools = makeTools(data, { today });
  const st = adapter.init(systemPrompt({ lang, today, regime }), merged, message);
  const usage = { in: 0, out: 0 }, used = []; let text = '', rounds = 0, done = false;
  try {
    while (rounds < maxRounds) {
      rounds++;
      const r = await adapter.call(st);
      usage.in += r.usage.in; usage.out += r.usage.out;
      if (!r.calls.length) { text = r.text; done = true; break; }
      const results = r.calls.map(c => { used.push(c.name); return tools.run(c.name, c.args); });
      adapter.addResults(st, r.calls, results);
    }
    if (!done) { const r = await adapter.finalNoTools(st, 'Answer now with what you have. Do not call tools.'); usage.in += r.usage.in; usage.out += r.usage.out; text = r.text; }
  } catch (e) { if (e && typeof e === 'object') e.usage = usage; throw e; } // الجولات اللي انصرفت قبل الخطأ لازم تنحسب بالسقف
  if (!text) return { ok: false, code: 'EMPTY', usage, rounds };
  return { ok: true, reply: text.slice(0, 8000), toolsUsed: [...new Set(used)], usage, rounds, provider: adapter.name };
}

// Kostenlimit pro Monat (eigene Datei, getrennt vom Kunden-Flamo)
function usageStore(file, now = () => new Date()) {
  const month = () => now().toISOString().slice(0, 7);
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j.month === month() ? j : null; } catch { return null; } };
  const fresh = () => ({ month: month(), calls: 0, inTokens: 0, outTokens: 0, costEur: 0 });
  return {
    get: () => read() || fresh(),
    add(u, priceIn, priceOut) {
      const cur = read() || fresh();
      cur.calls += 1; cur.inTokens += u.in; cur.outTokens += u.out;
      cur.costEur = Math.round((cur.costEur + (u.in * priceIn + u.out * priceOut) / 1e6) * 10000) / 10000;
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(cur)); } catch { /* best effort */ }
      return cur;
    },
  };
}

module.exports = { TOOLS, makeTools, systemPrompt, anthropicAdapter, geminiAdapter, providerFromEnv, chat, usageStore, cleanHistory };
