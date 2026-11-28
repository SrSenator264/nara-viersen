'use strict';
// platform-ingest.js — Schritt 2: Plattform-Abrechnungen kommen automatisch an (Sammler oder Upload) und werden erst nach
// Freigabe des Inhabers gebucht.
//   Datei (PDF/Bild/CSV) → Duplikat-Prüfung (sha256 der Datei + gleiche Abrechnung schon gespeichert)
//   → Ablage unter data/documents/platforms/ → Lesen (platform-statement.js) → Vergleich mit Flamo-Bestellungen
//   → Eingang (PENDING_APPROVAL) → Telegram-Zusammenfassung mit ✅/✖ → erst bei ✅ landet sie in data.platformStatements.
// Nur Lesen/Vorschlagen bis zur Freigabe; keine Buchung ohne Klick des Inhabers.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const PS = require('./platform-statement.js');

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const KEYS = ['platform', 'documentKind', 'invoiceNumber', 'documentDate', 'periodFrom', 'periodTo', 'ordersCount', 'grossCents', 'onlinePaidCents', 'cashCollectedCents',
  'commissionNetCents', 'commissionVatCents', 'commissionGrossCents', 'otherFeesCents', 'goodsCents', 'extraRevenueCents', 'refundsCents', 'payoutCents', 'notes'];
const PLATFORM_NAMES = { LIEFERANDO: 'Lieferando', UBER_EATS: 'Uber Eats', WOLT: 'Wolt', LANCH: 'Lanch', SIDES: 'Sides / Loco', JUST_VIRTUAL: 'Just Smashed' };

const str = v => (v == null ? '' : String(v));
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const isCsv = (name, mime) => /\.csv$/i.test(str(name)) || /text\/csv|application\/csv/i.test(str(mime));
const eur = c => (c == null || !Number.isFinite(Number(c)) ? '—' : (Number(c) / 100).toFixed(2).replace('.', ',') + ' €');

// gleiche Regel wie /api/accounting/platform-statement/save: gleiche Plattform und (gleiche Rechnungsnr. oder gleiche Periode+Art)
function sameStatement(a, b) {
  return a && b && a.platform === b.platform
    && ((a.invoiceNumber && b.invoiceNumber && a.invoiceNumber === b.invoiceNumber) || (a.periodFrom === b.periodFrom && a.periodTo === b.periodTo && a.documentKind === b.documentKind));
}
function pick(st) { const base = PS.normalize({}); return { ...base, ...KEYS.reduce((o, k) => (st && st[k] !== undefined && (o[k] = st[k]), o), {}) }; }
function decodeInput(input) {
  if (Buffer.isBuffer(input.buffer)) return input.buffer;
  const raw = str(input.data || input.base64).replace(/^data:[^;]*;base64,/, '');
  return raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
}

async function ingest(input, deps) {
  const { readData, updateData, docsDir, readPdf, compareFor, notify = async () => {}, newId, now = () => new Date().toISOString() } = deps;
  const buf = decodeInput(input || {});
  if (!buf.length) return { status: 422, body: { error: 'EMPTY_FILE', code: 'EMPTY_FILE' } };
  if (buf.length > MAX_BYTES) return { status: 413, body: { error: 'FILE_TOO_LARGE', code: 'FILE_TOO_LARGE' } };
  const filename = path.basename(str(input.filename) || 'statement').slice(0, 200), ext = path.extname(filename).toLowerCase();
  const csv = isCsv(filename, input.mime);
  if (!csv && !IMAGE_TYPES[ext]) return { status: 422, body: { error: 'BAD_FILE', code: 'BAD_FILE' } };
  const hash = sha256(buf), data = readData();
  const known = (data.platformInbox || []).find(x => x.sha256 === hash);
  if (known) return { status: 200, body: { ok: true, duplicate: true, id: known.id, status: known.status } };

  let statements = [], error = null;
  try {
    statements = csv ? PS.parseUberCsv(buf.toString('utf8')) : [await readPdf(buf.toString('base64'), IMAGE_TYPES[ext])];
  } catch (e) { error = str((e && e.code) || 'READ_FAILED'); }
  const forced = str(input.platform).toUpperCase().replace(/[^A-Z_]/g, '') || null;
  statements = (statements || []).filter(Boolean).map(s => (forced && !s.platform ? { ...s, platform: forced } : s));
  if (!error && !statements.length) error = 'NOTHING_FOUND';

  const id = newId('pin'), rel = 'platforms/' + id + (csv ? '.csv' : ext);
  fs.mkdirSync(path.join(docsDir, 'platforms'), { recursive: true });
  fs.writeFileSync(path.join(docsDir, rel), buf);
  const saved = data.platformStatements || [];
  const items = statements.map(st => {
    const s = pick(st), dup = saved.find(x => sameStatement(x, s));
    let comparison = null; try { if (s.periodFrom && s.periodTo) comparison = compareFor(s); } catch (e) { comparison = null; }
    return { statement: s, comparison, duplicateOf: dup ? dup.id : null };
  });
  const status = error ? 'NEEDS_REVIEW' : items.every(i => i.duplicateOf) ? 'DUPLICATE' : 'PENDING_APPROVAL';
  const rec = { id, sha256: hash, file: rel, filename, mime: str(input.mime) || null, platform: forced || (items[0] && items[0].statement.platform) || null,
    source: str(input.source).toUpperCase() === 'COLLECTOR' ? 'COLLECTOR' : 'UPLOAD', status, error, items, createdAt: now() };
  updateData(d => {
    (d.platformInbox ??= []).push(rec);
    (d.auditEvents ??= []).push({ id: newId('audit'), type: 'PLATFORM_STATEMENT_INGESTED', entityId: id, createdAt: rec.createdAt, details: { status, source: rec.source, platform: rec.platform, items: items.length, error } });
  });
  if (status !== 'DUPLICATE') { try { await notify(rec); } catch (e) { /* Telegram optional */ } }
  return { status: 201, body: { ok: true, id, status, error, items: items.map(i => ({ platform: i.statement.platform, periodFrom: i.statement.periodFrom, periodTo: i.statement.periodTo, grossCents: i.statement.grossCents, payoutCents: i.statement.payoutCents, duplicateOf: i.duplicateOf, comparisonOk: i.comparison ? !!i.comparison.ok : null })) } };
}

// ✅ / ✖ des Inhabers (Telegram oder Web). Nur PENDING_APPROVAL kann entschieden werden; Doppelte werden nie zweimal gebucht.
function decide(id, decision, who, { updateData, newId, now = () => new Date().toISOString() }) {
  let out = { ok: false, code: 'NOT_FOUND' };
  updateData(d => {
    const rec = (d.platformInbox || []).find(x => x.id === id);
    if (!rec) return;
    if (rec.status !== 'PENDING_APPROVAL') { out = { ok: false, code: 'ALREADY_DECIDED', status: rec.status }; return; }
    const at = now(), by = str(who) || 'OWNER';
    rec.decidedAt = at; rec.decidedBy = by;
    if (decision !== 'approve') {
      rec.status = 'REJECTED';
      (d.auditEvents ??= []).push({ id: newId('audit'), type: 'PLATFORM_STATEMENT_REJECTED', entityId: rec.id, createdAt: at, details: { by } });
      out = { ok: true, status: 'REJECTED' }; return;
    }
    d.platformStatements ??= [];
    const added = [];
    for (const it of rec.items || []) {
      if (it.duplicateOf || d.platformStatements.some(x => sameStatement(x, it.statement))) continue;
      const st = { id: newId('pstmt'), ...it.statement, documentId: rec.id, documentFile: rec.file, sourceSha256: rec.sha256, createdAt: at, approvedBy: by, approvedAt: at };
      d.platformStatements.push(st); added.push(st.id);
      (d.auditEvents ??= []).push({ id: newId('audit'), type: 'PLATFORM_STATEMENT_SAVED', entityId: st.id, createdAt: at, details: { platform: st.platform, periodFrom: st.periodFrom, periodTo: st.periodTo, via: 'INGEST', by } });
    }
    rec.status = 'APPROVED'; rec.savedIds = added;
    out = { ok: true, status: 'APPROVED', saved: added.length };
  });
  return out;
}

// Telegram-Text (für den Inhaber, Schami) + Knöpfe
function summaryText(rec) {
  const src = rec.source === 'COLLECTOR' ? 'من الجامع التلقائي' : 'مرفوع';
  if (rec.status === 'NEEDS_REVIEW') {
    const why = rec.error === 'NO_AI_KEY' ? 'ما في مفتاح ذكاء اصطناعي لقراءة الـ PDF' : rec.error === 'NOTHING_FOUND' ? 'ما لقينا أرقام بالملف' : 'ما قدرنا نقراه (' + rec.error + ')';
    return `🧾 وصل كشف منصة (${src}): ${rec.filename}\n⚠️ ${why}.\nالملف محفوظ — افتح المحاسبة وراجعه يدوي.`;
  }
  const lines = [`🧾 كشف منصة جديد (${src})`];
  for (const it of rec.items || []) {
    const s = it.statement, c = it.comparison;
    lines.push('', `${PLATFORM_NAMES[s.platform] || s.platform || '?'} · ${s.periodFrom || '?'} → ${s.periodTo || '?'}`);
    lines.push(`الطلبات: ${s.ordersCount ?? '—'} · المبيعات: ${eur(s.grossCents)}`);
    lines.push(`العمولة: ${eur(s.commissionGrossCents)} · الدفعة: ${eur(s.payoutCents)}`);
    if (it.duplicateOf) lines.push('↩️ هالكشف محفوظ من قبل — ما رح ينحفظ مرتين.');
    else if (c) lines.push(c.ok ? `✅ مطابق لطلبات Flamo (${c.flamoCount} طلب)` : `⚠️ في فرق مع Flamo: ${c.flamoCount} طلب، فرق ${eur(c.diffCents)}`);
  }
  lines.push('', 'بدك نحفظو بالحسابات؟');
  return lines.join('\n');
}
const buttons = rec => (rec.status === 'PENDING_APPROVAL' ? [[{ text: '✅ احفظ بالحسابات', callback_data: `pst:ok:${rec.id}` }, { text: '✖ لا', callback_data: `pst:no:${rec.id}` }]] : null);

// Telegram-Knopf: nur der Inhaber darf freigeben
function handleCallback(data, who, role, deps) {
  const m = /^pst:(ok|no):([\w-]+)$/.exec(str(data));
  if (!m) return null;
  if (role && role !== 'OWNER') return { answer: 'بس المالك بيقدر يوافق' };
  const r = decide(m[2], m[1] === 'ok' ? 'approve' : 'reject', who, deps);
  if (r.ok && r.status === 'APPROVED') return { answer: 'انحفظ ✅', edit: `✅ انحفظ بالحسابات${who ? ' — ' + who : ''} (${r.saved})` };
  if (r.ok) return { answer: 'تمام', edit: `✖ ما انحفظ${who ? ' — ' + who : ''}` };
  if (r.code === 'ALREADY_DECIDED') return { answer: 'انحسم من قبل', edit: `ℹ️ انحسم من قبل (${r.status})` };
  return { answer: 'ما لقيناه' };
}

// Schritt 3: Hinweise des Sammlers (Sitzung abgelaufen, 2FA, keine Sitzung, Fehler) — eigener Kanal, berührt die Live-Brücken nicht
const COLLECTOR_TYPES = ['SESSION_EXPIRED', 'TWO_FACTOR', 'NO_SESSION', 'ERROR'];
function collectorAlertText(platform, type) {
  const name = PLATFORM_NAMES[platform] || platform || '?';
  if (type === 'SESSION_EXPIRED') return `🔑 جامع كشوف ${name}: الجلسة المحفوظة انتهت. سجّل دخول مرة بإيدك واحفظ جلسة الجامع (مش جلسة الجسر الحي)، وبعدين بيكمّل لحالو.`;
  if (type === 'TWO_FACTOR') return `🔐 جامع كشوف ${name}: المنصة طالبة رمز تحقق (2FA). وقّفنا بهدوء — فوت مرة بإيدك واحفظ الجلسة.`;
  if (type === 'NO_SESSION') return `🗂️ جامع كشوف ${name}: لسا ما في جلسة محفوظة للجامع. سجّل دخول مرة واحفظ الجلسة.`;
  return `⚠️ جامع كشوف ${name}: صار خطأ وما كمّلنا. الطلبات الحية ما تأثّرت.`;
}

module.exports = { ingest, decide, summaryText, buttons, handleCallback, sameStatement, collectorAlertText, COLLECTOR_TYPES, MAX_BYTES };
