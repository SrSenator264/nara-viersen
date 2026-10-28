'use strict';
// accounting-export.js — Export der gebuchten Journal-Einträge für den Steuerberater.
// Ein Kern (Zeilen aus dem Journal), zwei Formate:
//   datev   = DATEV-Buchungsstapel (EXTF, Format 700/Kategorie 21, Version 13), Windows-1252, ';' getrennt.
//   lexware = schlichte, dokumentierte CSV (ENTWURF): Lexware-Importformat NICHT bestätigt, vor Gebrauch mit dem Berater prüfen.
// Kontenzuordnung (Flamo-Nr -> SKR-Nr) und BU-Schlüssel sind pro Profil editierbar. Rein & testbar. Keine Rechtsberatung.

const bizDay = require('./business-day.js');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = ['datev', 'lexware'];

const DEFAULT_PROFILE = {
  id: 'default', name: 'Steuerberater', email: '', format: 'datev', skr: 'SKR03',
  beraterNr: '', mandantNr: '', wjBeginn: '01-01', kontenlaenge: 4,
  accountMap: {}, buKeys: {},
};

function normalizeProfile(p) {
  const x = Object.assign({}, DEFAULT_PROFILE, p || {});
  x.format = FORMATS.includes(x.format) ? x.format : 'datev';
  x.skr = x.skr === 'SKR04' ? 'SKR04' : 'SKR03';
  x.kontenlaenge = Math.min(8, Math.max(4, parseInt(x.kontenlaenge, 10) || 4));
  x.accountMap = x.accountMap && typeof x.accountMap === 'object' ? x.accountMap : {};
  x.buKeys = x.buKeys && typeof x.buKeys === 'object' ? x.buKeys : {};
  x.beraterNr = String(x.beraterNr || '').replace(/\D/g, '');
  x.mandantNr = String(x.mandantNr || '').replace(/\D/g, '');
  return x;
}

// Profil aus den Einstellungen holen (settings.accounting.exportProfiles / activeExportProfileId)
function pickProfile(settings, profileId) {
  const list = (settings && Array.isArray(settings.exportProfiles)) ? settings.exportProfiles : [];
  const id = profileId || (settings && settings.activeExportProfileId) || (list[0] && list[0].id);
  return normalizeProfile(list.find(p => p && p.id === id) || list[0] || null);
}

// "01-01" / "0101" / "2026-01-01" -> Monat/Tag; Beginn des Wirtschaftsjahres, das den Stichtag enthält
function wjStart(wj, refIso) {
  const s = String(wj || '01-01').replace(/\D/g, '');
  const mm = s.length >= 4 ? s.slice(-4, -2) : '01', dd = s.length >= 4 ? s.slice(-2) : '01';
  const y = Number(refIso.slice(0, 4)), cand = `${y}-${mm}-${dd}`;
  return (cand <= refIso ? cand : `${y - 1}-${mm}-${dd}`).replace(/-/g, '');
}

// Gebuchte Einträge im Zeitraum (Tag nach Geschäftstag-Regel)
function collect(data, from, to) {
  return (data.journalEntries || [])
    .filter(e => e && e.status === 'POSTED' && ISO.test(String(e.date || '').slice(0, 10)))
    .filter(e => { const d = String(e.date).slice(0, 10); return d >= from && d <= to; })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.number).localeCompare(String(b.number)));
}

// Jeder Eintrag -> Zeilen (Konto = Soll, Gegenkonto = Haben). Mehrzeilige Einträge werden
// betragsweise aufgeteilt, so bleibt Soll = Haben pro Zeile erhalten.
function toRows(entries, accountsById, profile) {
  const map = profile.accountMap, rows = [], unmapped = new Set();
  const nr = id => { const a = accountsById.get(id); if (!a) return null; const n = String(a.number); if (map[n]) return String(map[n]); if (Object.keys(map).length) unmapped.add(n); return n; };
  let missingAccount = 0;
  for (const e of entries) {
    const deb = [], cre = [];
    for (const l of e.lines || []) {
      const n = nr(l.accountId);
      if (n == null) { missingAccount++; continue; }
      if (Number(l.debitCents) > 0) deb.push({ n, c: Number(l.debitCents), raw: String((accountsById.get(l.accountId) || {}).number) });
      if (Number(l.creditCents) > 0) cre.push({ n, c: Number(l.creditCents), raw: String((accountsById.get(l.accountId) || {}).number) });
    }
    let i = 0, j = 0;
    while (i < deb.length && j < cre.length) {
      const take = Math.min(deb[i].c, cre[j].c);
      rows.push({ date: String(e.date).slice(0, 10), belegNr: String(e.number || e.id || ''), text: String(e.description || ''), konto: deb[i].n, gegen: cre[j].n, cents: take, bu: String(profile.buKeys[deb[i].raw] || profile.buKeys[cre[j].raw] || ''), sourceRef: e.sourceRef || '' });
      deb[i].c -= take; cre[j].c -= take;
      if (!deb[i].c) i++;
      if (!cre[j].c) j++;
    }
  }
  return { rows, unmapped: [...unmapped], missingAccount };
}

const money = c => (c / 100).toFixed(2).replace('.', ',');
const clean = (s, max) => String(s == null ? '' : s).replace(/[\r\n\t;"]+/g, ' ').replace(/[^\x20-\xFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const belegId = s => String(s || '').replace(/[^A-Za-z0-9$&%*+\-/.]/g, '').slice(0, 36);
const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const ts = d => { const p = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${String(d.getUTCMilliseconds()).padStart(3, '0')}`; };

function datevText(rows, profile, from, to, now) {
  const head = ['"EXTF"', 700, 21, '"Buchungsstapel"', 13, ts(now || new Date()), '', '"RE"', '"Flamo"', '""',
    profile.beraterNr || 1, profile.mandantNr || 1, wjStart(profile.wjBeginn, from), profile.kontenlaenge,
    from.replace(/-/g, ''), to.replace(/-/g, ''), '"Flamo Export"', '"FL"', 1, 0, 0, '"EUR"', '', '""', '', '', q(profile.skr.slice(3)), '', '', '""', '""'];
  const cols = ['Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs', 'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext'];
  const lines = [head.join(';'), cols.join(';')];
  for (const r of rows) {
    lines.push([money(r.cents), '"S"', '"EUR"', '', '', '', r.konto, r.gegen, r.bu ? q(r.bu) : '', r.date.slice(8, 10) + r.date.slice(5, 7), q(belegId(r.belegNr)), '""', '', q(clean(r.text, 60))].join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}

function lexwareText(rows) {
  const lines = ['Datum;Belegnummer;Buchungstext;Sollkonto;Habenkonto;Betrag EUR;Steuerschluessel'];
  for (const r of rows) lines.push([r.date.slice(8, 10) + '.' + r.date.slice(5, 7) + '.' + r.date.slice(0, 4), q(belegId(r.belegNr)), q(clean(r.text, 60)), r.konto, r.gegen, money(r.cents), r.bu].join(';'));
  return lines.join('\r\n') + '\r\n';
}

// Windows-1252 (Latin-1-Bereich reicht für ä ö ü ß; alles andere wurde in clean() entfernt)
const encode = s => Buffer.from(s, 'latin1');

// build(data, {from,to,profileId,format}) -> { ok, error? , filename, mime, buffer, preview }
function build(data, opt, now) {
  const o = opt || {}, from = o.from, to = o.to;
  if (!ISO.test(from || '') || !ISO.test(to || '') || from > to) return { ok: false, error: 'Zeitraum ungültig / نطاق الفترة غير صالح' };
  const settings = (data.settings && data.settings.accounting) || {};
  const profile = pickProfile(settings, o.profileId);
  const format = FORMATS.includes(o.format) ? o.format : profile.format;
  const accountsById = new Map((data.chartOfAccounts || []).map(a => [a.id, a]));
  const entries = collect(data, from, to);
  if (!entries.length) return { ok: false, error: 'Keine gebuchten Einträge im Zeitraum / ما في قيود منشورة بالفترة' };
  const { rows, unmapped, missingAccount } = toRows(entries, accountsById, profile);
  // Soll/Haben aus den Journalzeilen selbst (nicht aus den erzeugten Zeilen), damit Unausgeglichenes auffällt
  let debitCents = 0, creditCents = 0;
  for (const e of entries) for (const l of e.lines || []) { debitCents += Number(l.debitCents) || 0; creditCents += Number(l.creditCents) || 0; }
  const rowsCents = rows.reduce((s, r) => s + r.cents, 0);
  const warnings = [];
  const closed = (data.accountingPeriods || []).some(p => p.status === 'CLOSED' && p.from <= from && p.to >= to);
  if (!closed) warnings.push('PERIOD_OPEN');
  const noRef = entries.filter(e => !e.sourceRef).length;
  if (noRef) warnings.push('NO_BELEG:' + noRef);
  if (unmapped.length) warnings.push('UNMAPPED:' + unmapped.join(','));
  if (missingAccount) warnings.push('MISSING_ACCOUNT:' + missingAccount);
  if (format === 'datev' && (!profile.beraterNr || !profile.mandantNr)) warnings.push('NO_BERATER');
  const badLen = [...new Set(rows.flatMap(r => [r.konto, r.gegen]))].filter(n => n.length !== profile.kontenlaenge);
  if (badLen.length) warnings.push('ACCOUNT_LENGTH:' + badLen.join(','));
  if (rows.some(r => !r.bu) && rows.some(r => /^(1400|1570|1576|1776|1571|3806|3801)$/.test(r.konto) || /^(1400|1570)$/.test(r.gegen))) warnings.push('VAT_LINES');
  if (format === 'lexware') warnings.push('LEXWARE_DRAFT');
  const text = format === 'datev' ? datevText(rows, profile, from, to, now) : lexwareText(rows);
  return {
    ok: true, format, profileId: profile.id, accountantEmail: profile.email,
    filename: `flamo-${format}-${from}-${to}.csv`, mime: 'text/csv', buffer: encode(text),
    preview: { entries: entries.length, rows: rows.length, debitCents, creditCents, balanced: debitCents === creditCents && rowsCents === debitCents, periodClosed: closed, warnings },
  };
}

module.exports = { build, collect, toRows, datevText, lexwareText, normalizeProfile, pickProfile, wjStart, clean, DEFAULT_PROFILE, FORMATS };
