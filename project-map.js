'use strict';
// project-map.js — خريطة المشروع: كل ملف شو بيعمل (من أول تعليق فيه)، شو API بيعرّف، ومين بيستعملو.
// بيستعملها المدير الذكي (manager-agent.js) و scripts/project-map.mjs بيكتب منها PROJECT_MAP.md.
const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'logs', 'dist', 'checkpoints', 'vendor', 'fonts', 'icons', 'brand', 'tse-sdk', 'test-results', 'playwright-report']);
const EXT = /\.(js|mjs|cjs|html|md|cmd|ps1|py|json)$/i;
const OVERRIDES = { 'server.js': 'Hauptserver: alle /api-Routen, Daten (data/nara-admin.json), Zeitpläne (Berichte, Telegram, Backups)', 'kasse.js': 'Kasse: Warenkorb, Produkte, Zahlung, Druck (Hauptlogik der Kassen-Seite)', 'auth.js': 'Rechte: PIN, Sitzungen, welche Rolle welche Seite/API darf, erlaubte Dateien' };
const SECRET = /(^|\/)(\.env|.*\.pem|.*\.key|.*credentials.*|.*secret.*)$/i;

function kindOf(rel) {
  if (/^tests\//.test(rel)) return 'test';
  if (/^scripts\//.test(rel) || /\.(cmd|ps1)$/i.test(rel)) return 'script';
  if (/^plans\//.test(rel) || /\.md$/i.test(rel)) return 'doc';
  if (/\.html$/i.test(rel)) return 'page';
  if (/^web-prototype\//.test(rel)) return 'site';
  if (/\.json$/i.test(rel)) return 'data';
  return 'code';
}

function describe(text, rel) {
  if (/\.html$/i.test(rel)) { const t = text.match(/<title>([^<]{1,120})<\/title>/i); if (t) return t[1].trim(); }
  if (/\.md$/i.test(rel)) { const h = text.match(/^#\s+(.{1,160})/m); if (h) return h[1].trim(); }
  const lines = text.split(/\r?\n/).slice(0, 12);
  for (const l of lines) {
    const m = l.match(/^\s*(?:\/\/|#|rem|::|<!--)\s*(.{6,220}?)\s*(?:-->)?\s*$/i);
    if (m && !/^(use strict|eslint|@ts-|!\/usr)/i.test(m[1]) && !/^[-=─]+$/.test(m[1])) return m[1].replace(/^[\w.-]+\.(js|mjs|html)\s*[—-]\s*/i, '').trim();
  }
  return '';
}

function apisOf(text) {
  const out = new Set();
  for (const m of text.matchAll(/pathname(?:===|\.startsWith\()\s*'(\/api\/[^']+)'/g)) out.add(m[1]);
  return [...out];
}
const scriptsOf = text => [...text.matchAll(/<script[^>]+src="\/?([^"?]+)/g)].map(m => m[1]);
const requiresOf = text => [...text.matchAll(/require\('\.\/([^']+)'\)/g)].map(m => m[1].replace(/\.js$/, '') + '.js');

function walk(root, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !/^checkpoint|^local-ocr-output|backup/i.test(e.name) && r.split('/').length <= 3) walk(root, r, out); }
    else if (EXT.test(e.name) && !SECRET.test(r)) out.push(r);
  }
  return out;
}

function build(root = __dirname) {
  const files = walk(root).filter(r => !/^web-prototype\/(t|c)\//.test(r) && !/menu\.json$|optnames\.json$|translations\.json$|i18n-todo\.json$|package-lock\.json$/.test(r));
  const entries = files.map(rel => {
    let text = ''; try { const st = fs.statSync(path.join(root, rel)); if (st.size < 3e6) text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { /* unreadable */ }
    return { file: rel, kind: kindOf(rel), about: OVERRIDES[rel] || (kindOf(rel) === 'test' ? '' : describe(text, rel)), apis: apisOf(text), scripts: /\.html$/i.test(rel) ? scriptsOf(text) : [], requires: /\.(js|mjs|cjs)$/i.test(rel) ? requiresOf(text) : [], bytes: Buffer.byteLength(text) };
  });
  const usedBy = {};
  for (const e of entries) for (const d of [...e.scripts, ...e.requires]) (usedBy[d] ||= []).push(e.file);
  for (const e of entries) e.usedBy = [...new Set(usedBy[e.file] || [])].slice(0, 12);
  return entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));
}

function toMarkdown(entries, when = new Date().toISOString().slice(0, 10)) {
  const L = ['# PROJECT_MAP — Flamo (automatisch erzeugt)', '', `Stand: ${when}. Neu erzeugen: \`node scripts/project-map.mjs\`. Nicht von Hand bearbeiten.`, ''];
  const title = { page: 'Seiten (HTML)', code: 'Code (Server & Frontend)', site: 'Kundenseite', script: 'Skripte & Startdateien', test: 'Tests', doc: 'Dokumente & Pläne', data: 'Daten/Konfiguration' };
  for (const k of ['page', 'code', 'site', 'script', 'doc', 'test', 'data']) {
    const list = entries.filter(e => e.kind === k); if (!list.length) continue;
    L.push(`## ${title[k]} (${list.length})`, '');
    for (const e of list) {
      let line = `- \`${e.file}\`` + (e.about ? ` — ${e.about}` : '');
      if (e.apis.length) line += ` · API: ${e.apis.slice(0, 8).join(', ')}${e.apis.length > 8 ? ' …' : ''}`;
      if (e.usedBy.length && k !== 'test') line += ` · benutzt von: ${e.usedBy.slice(0, 5).join(', ')}`;
      L.push(line);
    }
    L.push('');
  }
  return L.join('\n');
}

module.exports = { build, toMarkdown, describe, apisOf };
