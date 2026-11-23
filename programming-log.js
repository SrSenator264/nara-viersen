'use strict';
// programming-log.js — Programmierprotokoll (سجل تغييرات برمجة الكاسة) für das Finanzamt / Kassen-Nachschau.
//   • Nur anhängen: data/programming-log-YYYY-MM.jsonl (eine Datei pro Monat). Es gibt keine Funktion zum Ändern oder Löschen.
//   • Jede Zeile: Zeit, Benutzer, Bereich, Objekt, Feld, Wert vorher/nachher. Geheimnisse (PIN, Passwörter, Token, Schlüssel) → "***".
//   • Hash-Kette: hash = sha256(prev + "|" + Zeile ohne hash); die erste Zeile überhaupt hat prev = "0". verify() findet jede Manipulation.
// Nur Server. Kein Ersatz für die Verfahrensdokumentation.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GENESIS = '0';
const MAX_VALUE = 500;
const FILE_RE = /^programming-log-(\d{4}-\d{2})\.jsonl$/;
const SECRET_KEY = /^pin$|pin$|pinhash|password|passwort|secret|token|api_?key|hash|salt/i;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Geheimnisse entfernen (rekursiv) und lange Werte kürzen
function scrub(v, key) {
  if (key != null && SECRET_KEY.test(String(key))) return v == null ? null : '***';
  if (Array.isArray(v)) return v.map(x => scrub(x));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = scrub(x, k); return o; }
  return v === undefined ? null : v;
}
function clip(v) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v == null ? null : v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s.length <= MAX_VALUE) return typeof v === 'string' ? v : JSON.parse(s);
  return s.slice(0, MAX_VALUE) + '…(+' + (s.length - MAX_VALUE) + ')';
}
const val = (v, key) => clip(scrub(v, key));

// Einstellungsobjekte flach vergleichen (eine Ebene tief: platformFees.x, fixedMonthlyExpenses.y …)
function flatten(obj, prefix = '', depth = 0, out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 1) flatten(v, key, depth + 1, out); else out[key] = v;
  }
  return out;
}
function diffFields(before, after) {
  const a = flatten(before), b = flatten(after), out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k], b[k])) out.push({ field: k, before: a[k], after: b[k] });
  return out;
}

function open(dir) {
  const fileOf = ym => path.join(dir, 'programming-log-' + ym + '.jsonl');
  const files = () => { try { return fs.readdirSync(dir).filter(f => FILE_RE.test(f)).sort(); } catch { return []; } };
  const lines = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  const cache = { file: null, size: -1, hash: GENESIS };

  function lastHash() {
    const fs_ = files(), f = fs_[fs_.length - 1];
    if (!f) return GENESIS;
    let size = -1; try { size = fs.statSync(path.join(dir, f)).size; } catch { /* gone */ }
    if (cache.file === f && cache.size === size) return cache.hash;
    const ls = lines(f); let h = GENESIS;
    try { if (ls.length) h = JSON.parse(ls[ls.length - 1]).hash || GENESIS; } catch { /* damaged: verify() reports it */ }
    return h;
  }

  // entries: [{ user, area, entity, field, before, after, note }]; liefert Anzahl geschriebener Zeilen
  function record(entries, now = new Date()) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length) return 0;
    fs.mkdirSync(dir, { recursive: true });
    const ym = now.toISOString().slice(0, 7), f = fileOf(ym);
    let prev = lastHash(), out = '';
    for (const e of list) {
      const line = {
        id: crypto.randomBytes(6).toString('hex'), at: now.toISOString(), user: String(e.user || 'SYSTEM').slice(0, 80), area: String(e.area || '').slice(0, 40),
        entity: String(e.entity || '').slice(0, 160), field: String(e.field || '').slice(0, 120), before: val(e.before, e.field), after: val(e.after, e.field), note: e.note ? String(e.note).slice(0, 200) : null, prev,
      };
      const hash = sha(prev + '|' + JSON.stringify(line));
      out += JSON.stringify({ ...line, hash }) + '\n'; prev = hash;
    }
    fs.appendFileSync(f, out);
    cache.file = path.basename(f); cache.hash = prev; try { cache.size = fs.statSync(f).size; } catch { cache.size = -1; }
    return list.length;
  }

  // Objekt-Vergleich → eine Zeile je geändertem Feld (nichts geändert = nichts geschrieben)
  function recordDiff({ user, area, entity, before, after, note }, now) {
    return record(diffFields(before, after).map(d => ({ user, area, entity, field: d.field, before: d.before, after: d.after, note })), now);
  }

  function read({ from, to } = {}) {
    const out = [];
    for (const f of files()) {
      const ym = f.match(FILE_RE)[1];
      if (from && ym < from.slice(0, 7)) continue; if (to && ym > to.slice(0, 7)) continue;
      for (const l of lines(f)) { try { const e = JSON.parse(l), d = String(e.at || '').slice(0, 10); if ((!from || d >= from) && (!to || d <= to)) out.push(e); } catch { /* damaged: verify() reports it */ } }
    }
    return out;
  }

  // Kette prüfen: { ok, lines, broken: { file, line, reason } | null }
  function verify() {
    let prev = GENESIS, n = 0;
    for (const f of files()) {
      const ls = lines(f);
      for (let i = 0; i < ls.length; i++) {
        let e; try { e = JSON.parse(ls[i]); } catch { return { ok: false, lines: n, broken: { file: f, line: i + 1, reason: 'unreadable' } }; }
        const { hash, ...rest } = e;
        if (e.prev !== prev) return { ok: false, lines: n, broken: { file: f, line: i + 1, reason: 'chain' } };
        if (sha(prev + '|' + JSON.stringify(rest)) !== hash) return { ok: false, lines: n, broken: { file: f, line: i + 1, reason: 'content' } };
        prev = hash; n++;
      }
    }
    return { ok: true, lines: n, broken: null };
  }

  const cell = v => { const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function csv(entries) {
    const head = ['Zeit', 'Benutzer', 'Bereich', 'Objekt', 'Feld', 'Vorher', 'Nachher', 'Hinweis'];
    return '﻿' + [head.join(';'), ...entries.map(e => [e.at, e.user, e.area, e.entity, e.field, e.before, e.after, e.note].map(cell).join(';'))].join('\r\n') + '\r\n';
  }

  return { record, recordDiff, read, verify, csv, dir };
}

// Menü-Änderungen (Produkte, Kategorien, Optionen) aus admin-history.diff → Zeilen
function menuEntries(collection, changes, user) {
  const out = [];
  for (const c of changes) {
    const entity = collection + ':' + (c.itemId || '') + (c.name ? ' ' + c.name : '');
    if (c.op === 'update') for (const k of c.fields || []) out.push({ user, area: 'MENU', entity, field: k, before: (c.absent || []).includes(k) ? null : (c.before || {})[k], after: (c.after || {})[k] });
    else if (c.op === 'create') out.push({ user, area: 'MENU', entity, field: '(angelegt)', before: null, after: c.after });
    else if (c.op === 'delete') out.push({ user, area: 'MENU', entity, field: '(gelöscht)', before: c.before, after: null });
    else if (c.op === 'reorder') out.push({ user, area: 'MENU', entity: collection, field: '(Reihenfolge)', before: c.beforeOrder, after: c.afterOrder });
  }
  return out;
}

module.exports = { open, menuEntries, diffFields, scrub, GENESIS };
