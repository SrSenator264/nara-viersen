'use strict';
// telegram-documents.js — طلب ملفات الفواتير والكشوف من التلغرام ("ابعتلي فواتير Lieferando شهر 11"، "فاتورة MELEDI").
// بيفهم الطلب بقواعد كلمات بسيطة، بيدوّر بأرشيف المستندات (data/documents) وبيبعت الملفات الحقيقية بـ sendDocument.
// الصلاحيات: OWNER = كل شي (موردين + منصات + بنك)؛ PARTNER = فواتير موردين بس؛ غيرهم = ولا شي.
// الشريك بينضاف بـ TELEGRAM_PARTNER_CHAT_ID بملف .env (رقم أو أكتر بفاصلة؛ الرقم بيطلع بأمر /id للبوت).
const path = require('node:path');

const MAX_FILES = 10, MAX_BYTES = 50 * 1024 * 1024; // حد Telegram لـ sendDocument
const NOUN = /فاتور|فواتير|كشف|كشوف|كشوفات|rechnung|abrechnung|invoice|statement|beleg|auszug/i;
const VERB = /ابعت|إبعت|بعت|ابعث|ارسل|أرسل|إرسال|بدي|عطيني|جيبلي|شوفلي|schick|send|gib/i;
const QUESTION = /كم|قديش|شو |ليش|ليه|هل|wie ?viel|warum|how much|why|\?|؟/i;
const PLATFORMS = [
  ['JUST_VIRTUAL', /just ?smash|سماش|سماشد|just ?virtual|جست ?فيرتشوال|ghost ?food/i],
  ['LIEFERANDO', /lieferando|ليفراندو|ليفرندو|takeaway|تيك ?اواي/i],
  ['UBER_EATS', /uber|اوبر|أوبر/i],
  ['WOLT', /wolt|وولت/i],
  ['SIDES', /sides|سايدز|سايدس/i],
  ['LANCH', /lanch|لانش|loco|لوكو/i],
];
const ALIAS = { meledi: ['meledi', 'melkaa'], melkaa: ['meledi', 'melkaa'] }; // MELEDI's invoices are issued as MELKAA GmbH
const PF_NAME = { LIEFERANDO: 'Lieferando', UBER_EATS: 'Uber Eats', WOLT: 'Wolt', SIDES: 'Sides', LANCH: 'Lanch', JUST_VIRTUAL: 'Just Smashed' };
const BANK = /بنك|البنك|bank|wise|qonto|kontoauszug/i;
const MONTHS = [
  [1, /كانون الثاني|كانون التاني|يناير|جانفي|januar|january|\bjan\b/i], [2, /شباط|فبراير|februar|february|\bfeb\b/i],
  [3, /آذار|اذار|مارس|märz|maerz|march/i], [4, /نيسان|أبريل|ابريل|april/i], [5, /أيار|ايار|مايو|\bmai\b|\bmay\b/i],
  [6, /حزيران|يونيو|juni|june/i], [7, /تموز|يوليو|juli|july/i], [8, /آب|اب |أغسطس|اغسطس|august/i],
  [9, /أيلول|ايلول|سبتمبر|september/i], [10, /تشرين الأول|تشرين الاول|أكتوبر|اكتوبر|اكتوبر|oktober|october/i],
  [11, /تشرين الثاني|تشرين التاني|نوفمبر|november/i], [12, /كانون الأول|كانون الاول|ديسمبر|dezember|december/i],
];
// كلمات ما بتنحسب اسم مورّد
const STOP = new Set(['ابعتلي', 'ابعت', 'بعتلي', 'ارسل', 'أرسل', 'بدي', 'فاتورة', 'فواتير', 'كشف', 'كشوف', 'كشوفات', 'شهر', 'لشهر', 'تبع', 'من', 'على', 'كل', 'the', 'for', 'von', 'rechnung', 'rechnungen', 'invoice', 'invoices', 'statement', 'month', 'monat', 'send', 'schick', 'mir', 'me', 'bitte', 'please']);

const str = v => (v == null ? '' : String(v));
const ar2en = s => str(s).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));

function isRequest(text) {
  const t = str(text).trim();
  if (!NOUN.test(t)) return false;
  if (VERB.test(t)) return true;
  return /^(ال)?(فاتور|فواتير|كشف|كشوف|rechnung|abrechnung|invoice|statement)/i.test(t) && !QUESTION.test(t);
}

// الشهر المطلوب → 'YYYY-MM' أو null. بدون سنة: آخر مرة إجا هالشهر (مو بالمستقبل).
function parseMonth(text, now = new Date()) {
  const t = ar2en(text);
  let y = null, m = null;
  let x = t.match(/\b(20\d{2})[-/.](\d{1,2})\b/); if (x) { y = +x[1]; m = +x[2]; }
  if (!m && (x = t.match(/\b(\d{1,2})[-/.](20\d{2})\b/))) { m = +x[1]; y = +x[2]; }
  if (!m && (x = t.match(/(?:شهر|monat|month)\s*(\d{1,2})\b/i))) m = +x[1];
  if (!m) for (const [n, re] of MONTHS) if (re.test(t)) { m = n; break; }
  if (!m || m < 1 || m > 12) return null;
  if (!y) { const cy = now.getUTCFullYear(), cm = now.getUTCMonth() + 1; y = m > cm ? cy - 1 : cy; if ((x = t.match(/\b(20\d{2})\b/))) y = +x[1]; }
  return y + '-' + String(m).padStart(2, '0');
}

function parseRequest(text, now) {
  const t = str(text);
  const platforms = PLATFORMS.filter(([, re]) => re.test(t)).map(([p]) => p);
  const bank = BANK.test(t);
  const month = parseMonth(t, now);
  const supplierTerms = ar2en(t).toLowerCase().split(/[^a-zäöüß0-9]+/i)
    .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w) && !PLATFORMS.some(([, re]) => re.test(w)) && !BANK.test(w) && !MONTHS.some(([, re]) => re.test(w)));
  return { platforms, bank, month, supplierTerms };
}

const monthRange = m => { const [y, mo] = m.split('-').map(Number); return [m + '-01', m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')]; };
const overlaps = (a, b, from, to) => (b || a) && (a || b) && (a || b) <= to && (b || a) >= from;
function isoDate(v) {
  const s = str(v).trim(); let x;
  if ((x = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return x[0].slice(0, 10);
  if ((x = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/))) return `${x[3]}-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')}`;
  return '';
}
const kindOf = d => { const t = str(d.type || d.accountingType).toUpperCase(); return t === 'PLATFORM_STATEMENT' ? 'PLATFORM' : t === 'BANK_STATEMENT' ? 'BANK' : 'SUPPLIER'; };

// كل المستندات بشكل موحّد: {doc, kind, date, from, to, label, invoiceNumber, haystack, platform}
function catalog(data) {
  const sup = new Map((data.suppliers || []).map(s => [str(s.id), str(s.name)]));
  const invByDoc = new Map((data.invoices || []).filter(i => i.documentId).map(i => [str(i.documentId), i]));
  const stByDoc = new Map((data.platformStatements || []).filter(s => s.documentId).map(s => [str(s.documentId), s]));
  const out = [];
  for (const d of data.documents || []) {
    const kind = kindOf(d), h = (d.extraction && d.extraction.header) || {};
    if (kind === 'PLATFORM') {
      const st = stByDoc.get(str(d.id)); if (!st) continue;
      out.push({ doc: d, kind, platform: st.platform, from: st.periodFrom || st.periodTo, to: st.periodTo, date: st.periodTo || st.documentDate, invoiceNumber: str(st.invoiceNumber), label: PF_NAME[st.platform] || st.platform, haystack: '' });
    } else if (kind === 'BANK') {
      out.push({ doc: d, kind, from: d.periodFrom, to: d.periodTo, date: d.periodTo, invoiceNumber: '', label: str(d.bankName || 'Bank'), haystack: '' });
    } else {
      const inv = (d.invoiceId && (data.invoices || []).find(i => i.id === d.invoiceId)) || invByDoc.get(str(d.id)) || {};
      const names = [h.supplierName, sup.get(str(d.supplierId)), sup.get(str(inv.supplierId)), inv.supplierName].filter(Boolean);
      const date = isoDate(h.invoiceDate) || isoDate(inv.invoiceDate) || str(d.createdAt).slice(0, 10);
      out.push({ doc: d, kind, from: date, to: date, date, invoiceNumber: str(h.invoiceNumber || inv.invoiceNumber), label: names[0] || str((d.originalFilenames || [])[0]) || d.id, haystack: [...names, ...(d.originalFilenames || []), d.notes].join(' ').toLowerCase() });
    }
  }
  return out;
}

// البحث: النتيجة {items, statementsWithoutFile, needsDetail, denied}
function search(data, req, role) {
  const wantPlatform = req.platforms.length > 0, wantBank = req.bank, wantSupplier = !wantPlatform && !wantBank && req.supplierTerms.length > 0;
  if (role !== 'OWNER' && (wantPlatform || wantBank)) return { denied: wantBank ? 'BANK' : 'PLATFORM', items: [] };
  if (!wantPlatform && !wantBank && !wantSupplier) return { needsDetail: true, items: [] };
  const [from, to] = req.month ? monthRange(req.month) : ['0000-01-01', '9999-12-31'];
  const items = catalog(data).filter(c => {
    if (!overlaps(c.from, c.to, from, to)) return false;
    if (wantPlatform) return c.kind === 'PLATFORM' && req.platforms.includes(c.platform);
    if (wantBank) return c.kind === 'BANK';
    return c.kind === 'SUPPLIER' && req.supplierTerms.some(w => (ALIAS[w] || [w]).some(a => c.haystack.includes(a)));
  }).sort((a, b) => str(b.date).localeCompare(str(a.date)));
  const seen = new Set(), uniq = items.filter(c => !seen.has(c.doc.id) && seen.add(c.doc.id));
  const statementsWithoutFile = wantPlatform ? (data.platformStatements || []).filter(s => req.platforms.includes(s.platform) && !s.documentId && overlaps(s.periodFrom || s.periodTo, s.periodTo, from, to)) : [];
  return { items: uniq, statementsWithoutFile };
}

const caption = c => [c.kind === 'PLATFORM' ? '🛵' : c.kind === 'BANK' ? '🏦' : '🧾', c.label, c.from && c.to && c.from !== c.to ? `${c.from} → ${c.to}` : c.date, c.invoiceNumber ? '#' + c.invoiceNumber : ''].filter(Boolean).join(' · ').slice(0, 1000);

// ملفات المستند على الدسك، بس جوّا مجلد المستندات
function filesOf(doc, docsDir, fsm) {
  const root = path.resolve(docsDir), out = [];
  for (const f of doc.pageFiles || []) {
    const p = path.resolve(root, str(f));
    if (!p.startsWith(root + path.sep)) { out.push({ name: str(f), error: 'BAD_PATH' }); continue; }
    let st = null; try { st = fsm.statSync(p); } catch { /* fehlt */ }
    if (!st || !st.isFile()) out.push({ name: str(f), error: 'MISSING' });
    else if (st.size > MAX_BYTES) out.push({ name: str(f), error: 'TOO_BIG' });
    else out.push({ name: str(f), path: p });
  }
  return out;
}

// الطلب كامل: فهم → صلاحية → بحث → إرسال → audit. بيرجّع نص الرد.
async function handleRequest({ text, role, who, chatId, data, docsDir, sendDocument, audit, fsm = require('node:fs'), now = new Date() }) {
  const req = parseRequest(text, now);
  const actor = { chatId: str(chatId), name: str(who), role };
  const res = search(data, req, role);
  if (res.denied) { audit('TELEGRAM_REQUEST_DENIED', { ...actor, query: str(text).slice(0, 200), kind: res.denied }); return '⛔ هالنوع من الملفات (كشوف المنصات والبنك) للمالك بس. فيك تطلب فواتير الموردين.'; }
  if (res.needsDetail) return '🤔 شو بدك بالزبط؟ اكتب المنصة أو المورّد والشهر، مثلاً: «ابعتلي فواتير Lieferando شهر 11» أو «فاتورة MELEDI».';
  const what = [req.platforms.map(p => PF_NAME[p]).join(', '), req.bank ? 'البنك' : '', req.platforms.length || req.bank ? '' : req.supplierTerms.join(' ')].filter(Boolean).join(' ');
  const when = req.month ? ` بشهر ${req.month}` : '';
  const pick = res.items.slice(0, MAX_FILES), sent = [], skipped = [];
  for (const c of pick) {
    const files = filesOf(c.doc, docsDir, fsm); let ok = false;
    for (const [i, f] of files.entries()) {
      if (f.error) { skipped.push(`${c.label} (${f.error === 'TOO_BIG' ? 'أكبر من 50 MB' : 'الملف مفقود'})`); continue; }
      const cap = caption(c) + (files.length > 1 ? ` · ${i + 1}/${files.length}` : '');
      const r = await sendDocument({ buffer: fsm.readFileSync(f.path), filename: (c.doc.originalFilenames || [])[i] || f.name, caption: cap });
      if (r) ok = true; else skipped.push(`${c.label} (ما انبعت)`);
    }
    if (ok) sent.push(c.doc.id);
  }
  audit('DOCUMENTS_SENT_TELEGRAM', { ...actor, query: str(text).slice(0, 200), documentIds: sent, found: res.items.length });
  const lines = [];
  if (!res.items.length) lines.push(`📭 ما لقيت ملفات لـ ${what}${when}.`);
  else lines.push(`📎 لقيت ${res.items.length}${res.items.length > MAX_FILES ? `، بعتت أحدث ${MAX_FILES} — حدّد الشهر أو المورّد لتضيّق البحث` : ''}، انبعت ${sent.length}.`);
  if (skipped.length) lines.push('⚠️ ما انبعتوا: ' + [...new Set(skipped)].join('، '));
  if (res.statementsWithoutFile.length) lines.push('ℹ️ كشوف محفوظة بلا ملف: ' + res.statementsWithoutFile.map(s => `${PF_NAME[s.platform] || s.platform} ${s.periodFrom || ''}→${s.periodTo || ''}${s.invoiceNumber ? ' #' + s.invoiceNumber : ''}`).join('، '));
  return lines.join('\n');
}

module.exports = { isRequest, parseRequest, parseMonth, search, catalog, filesOf, handleRequest, MAX_FILES };
