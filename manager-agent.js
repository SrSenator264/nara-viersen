'use strict';
// manager-agent.js — المدير الذكي ("عقل المشروع"): عمر بيحكي معو بس.
// بيعرف كل المشروع: خريطة الملفات، البحث بالكود، قراءة الملفات، آخر التعديلات (git)، حالة الشغل الحية،
// وبيحوّل أسئلة الحسابات للمحاسب الذكي. ما بيعدّل كود أبداً: أي تعديل = "بطاقة مهمة" بتتنفّذ بجلسة Claude Code بعد موافقة عمر.
// ممنوع يقرا: data/ و .env وأي ملف مفاتيح.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const PM = require('./project-map.js');
const AA = require('./accounting-agent.js');

const str = v => (v == null ? '' : String(v));
const low = v => str(v).toLowerCase();
const MAX_RESULT = 14000;
const FORBIDDEN = /(^|\/)(data|logs|node_modules|checkpoints?|\.git)(\/|$)|(^|\/)\.env|\.(pem|key|pfx|p12)$|credential|secret|token/i;

const TOOLS = [
  { name: 'project_map', description: 'Projektkarte: Dateien mit Kurzbeschreibung, APIs und wer sie benutzt. Filter: query (Text in Name/Beschreibung/API), kind (page, code, site, script, test, doc, data).',
    parameters: { type: 'object', properties: { query: { type: 'string' }, kind: { type: 'string' } } } },
  { name: 'search_code', description: 'Text im Code suchen (ohne Groß/Klein). Liefert Datei:Zeile und die Zeile (gekürzt). Optional nur Dateien, deren Pfad "in" enthält.',
    parameters: { type: 'object', properties: { text: { type: 'string' }, in: { type: 'string' } }, required: ['text'] } },
  { name: 'read_file', description: 'Eine Projektdatei lesen (Zeilen from–to, max. 300 Zeilen). Gesperrt: data/, .env, Schlüssel.',
    parameters: { type: 'object', properties: { file: { type: 'string' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['file'] } },
  { name: 'git_log', description: 'Letzte Änderungen am Code (Commits mit Datum, Titel, geänderte Dateien). Optional nur für eine Datei.',
    parameters: { type: 'object', properties: { limit: { type: 'integer' }, file: { type: 'string' } } } },
  { name: 'live_status', description: 'Aktueller Betriebszustand: Server-Laufzeit, Bestellungen heute pro Kanal, offene Küchen-Bestellungen, Plattform-Brücken (Lieferando/Uber/Sides), TSE-Modus, letzte Ereignisse.',
    parameters: { type: 'object', properties: {} } },
  { name: 'kitchen_queue', description: 'Küche jetzt: Bestellungen je Status (neu / in Arbeit / fertig), wie viele zu spät sind, längste Wartezeit in Minuten, Liefern/Abholen/Tisch, und welche Gerichte gerade zubereitet werden müssen.',
    parameters: { type: 'object', properties: {} } },
  { name: 'ask_accountant', description: 'Frage an den KI-Buchhalter weitergeben (Umsätze, Rechnungen, Tagesabschluss, Bank, Lager, Steuern). Liefert seine Antwort.',
    parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
  { name: 'create_task', description: 'Aufgabenkarte für eine Code-Änderung anlegen (wird NICHT ausgeführt; Omar gibt sie an Claude Code). Nur wenn Omar eine Änderung will.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, change: { type: 'string', description: 'Was genau geändert werden soll' }, dod: { type: 'string', description: 'Definition of Done: was funktionieren muss, Tests, Grenzfälle, was nicht nötig ist' }, risk: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['title', 'change', 'dod'] } },
  { name: 'list_tasks', description: 'Vorhandene Aufgabenkarten (offen/erledigt).', parameters: { type: 'object', properties: {} } },
];

function safeRel(root, file) {
  const rel = str(file).replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel) || FORBIDDEN.test(rel)) return null;
  const abs = path.join(root, rel);
  if (!abs.startsWith(path.resolve(root))) return null;
  return { rel, abs };
}

function makeTools({ root = __dirname, data = {}, status = () => ({}), kitchen = () => ({}), askAccountant = async () => 'nicht verfügbar', tasks = { list: () => [], add: t => t }, git = null } = {}) {
  let mapCache = null; const map = () => (mapCache ||= PM.build(root));
  const run = {
    project_map: a => {
      const q = low(a.query), k = low(a.kind);
      const rows = map().filter(e => (!k || e.kind === k) && (!q || low(e.file).includes(q) || low(e.about).includes(q) || e.apis.some(x => low(x).includes(q))));
      return { count: rows.length, files: rows.slice(0, 80).map(e => ({ file: e.file, kind: e.kind, about: e.about, apis: e.apis.slice(0, 12), usedBy: e.usedBy.slice(0, 6) })) };
    },
    search_code: a => {
      const t = low(a.text).trim(); if (t.length < 2) return { error: 'text zu kurz' };
      const scope = low(a.in), hits = [];
      for (const e of map()) {
        if (e.kind === 'data' || (scope && !low(e.file).includes(scope))) continue;
        const s = safeRel(root, e.file); if (!s) continue;
        let text; try { text = fs.readFileSync(s.abs, 'utf8'); } catch { continue; }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length && hits.length < 40; i++) {
          const L = lines[i], idx = low(L).indexOf(t); if (idx < 0) continue;
          const from = Math.max(0, idx - 120);
          hits.push({ file: e.file, line: i + 1, text: (from ? '…' : '') + L.slice(from, idx + t.length + 160) + (L.length > idx + t.length + 160 ? '…' : '') });
        }
        if (hits.length >= 40) break;
      }
      return { count: hits.length, hits, note: hits.length >= 40 ? 'gekürzt (40 Treffer)' : undefined };
    },
    read_file: a => {
      const s = safeRel(root, a.file); if (!s) return { error: 'Datei gesperrt oder ungültig' };
      let text; try { text = fs.readFileSync(s.abs, 'utf8'); } catch { return { error: 'Datei nicht gefunden' }; }
      const lines = text.split(/\r?\n/), from = Math.max(1, Number(a.from) || 1), to = Math.min(lines.length, Number(a.to) || from + 199, from + 299);
      const body = lines.slice(from - 1, to).map((l, i) => (from + i) + ': ' + (l.length > 700 ? l.slice(0, 700) + ' …[Zeile gekürzt]' : l)).join('\n');
      return { file: s.rel, totalLines: lines.length, from, to, content: body };
    },
    git_log: a => {
      const n = Math.max(1, Math.min(40, Number(a.limit) || 12));
      const args = ['log', '-n', String(n), '--date=short', '--pretty=format:@@%h|%ad|%s', '--name-only'];
      if (a.file) { const s = safeRel(root, a.file); if (!s) return { error: 'Datei gesperrt' }; args.push('--', s.rel); }
      const r = git ? git(args) : spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 8000 });
      if (!r || r.status !== 0) return { error: 'git nicht verfügbar' };
      const commits = str(r.stdout).split('@@').filter(Boolean).map(b => { const [head, ...files] = b.trim().split('\n'); const [hash, date, ...t] = head.split('|'); return { hash, date, title: t.join('|'), files: files.filter(Boolean).slice(0, 15) }; });
      return { commits };
    },
    live_status: () => { try { return status() || {}; } catch (e) { return { error: str(e && e.message) }; } },
    kitchen_queue: () => { try { return kitchen() || {}; } catch (e) { return { error: str(e && e.message) }; } },
    ask_accountant: async a => ({ answer: await askAccountant(str(a.question).slice(0, 2000)) }),
    create_task: a => {
      const t = { title: str(a.title).slice(0, 160), why: str(a.why).slice(0, 1000), files: (Array.isArray(a.files) ? a.files : []).map(str).slice(0, 20), change: str(a.change).slice(0, 4000), dod: str(a.dod).slice(0, 3000), risk: ['low', 'medium', 'high'].includes(a.risk) ? a.risk : 'medium' };
      if (!t.title || !t.change || !t.dod) return { error: 'title, change, dod nötig' };
      return { ok: true, task: tasks.add(t) };
    },
    list_tasks: () => ({ tasks: tasks.list().slice(-30) }),
  };
  return {
    async run(name, args) {
      const f = run[name]; if (!f) return { error: 'unknown tool' };
      try { const out = await f(args || {}); const s = JSON.stringify(out); return s.length > MAX_RESULT ? { truncated: true, data: s.slice(0, MAX_RESULT) } : out; } catch (e) { return { error: str(e && e.message).slice(0, 200) }; }
    },
  };
}

function systemPrompt({ lang, today, context }) {
  const L = { ar: 'Arabic in Levantine/Shami dialect (e.g. "هلق", "مو", "شو"); file names, code and technical terms stay in Latin letters', de: 'German', en: 'plain English' }[lang] || 'Arabic in Levantine/Shami dialect';
  return [
    'You are "Flamo Manager", the AI manager and brain of the Flamo restaurant system (repo nara-viersen: cashier/Kasse with TSE, kitchen, Live Orders, platform hub for Lieferando/Uber/Sides, drivers & dispatch, customer website with AI seller Flamo, accounting). The owner Omar talks only to you.',
    `Today: ${today}. Answer ONLY in ${L}. Short and practical: direct answer first, then details, then at most one next step.`,
    'Explain the code in simple words for a non-programmer owner: what a page/file does, why something happens, what changed recently. Always look things up with your tools (project_map, search_code, read_file, git_log, live_status) before answering; never guess file contents. Mention the file names you looked at in one short line at the end.',
    'For accounting questions (sales in euros, invoices, closings, bank, stock, purchases, platform statements, taxes, profit) ALWAYS call ask_accountant and pass on its numbers exactly as given. Never calculate, estimate or invent money amounts yourself; if the accountant cannot answer, say so plainly. For "what is going on right now" use live_status; for the kitchen (open, late, what to cook) use kitchen_queue.',
    'You cannot change code, data or settings. If Omar wants a change, first explain what would change and the risk, then create a task card with create_task (clear change + Definition of Done: what must work, tests, edge cases, what is not needed). Tell him to give the card to Claude Code. Never claim you changed anything.',
    'Never reveal secrets (.env, keys, tokens); you cannot read data/ or .env. Never touch the TSE or receipt logic in suggestions without marking risk high.',
    context ? '\nProject context (summary):\n' + context : '',
  ].join('\n');
}

function readContext(root) {
  try { return fs.readFileSync(path.join(root, 'PROJECT_CONTEXT.md'), 'utf8').slice(0, 3500); } catch { return ''; }
}

function taskStore(file, now = () => new Date().toISOString()) {
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; } };
  const write = list => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(list, null, 2)); fs.renameSync(file + '.tmp', file); };
  return {
    list: read,
    add(t) { const list = read(); const task = { id: 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), status: 'OPEN', createdAt: now(), ...t }; list.push(task); write(list); return task; },
    setStatus(id, status) { if (!['OPEN', 'DONE', 'DISMISSED'].includes(status)) return null; const list = read(), t = list.find(x => x.id === id); if (!t) return null; t.status = status; t.updatedAt = now(); write(list); return t; },
  };
}

// Text für Claude Code aus einer Aufgabenkarte
function taskPrompt(t) {
  return [`Aufgabe für Flamo (Repo SrSenator264/nara-viersen, nur main): ${t.title}`, t.why ? `Warum: ${t.why}` : '', t.files && t.files.length ? `Dateien: ${t.files.join(', ')}` : '', `Änderung: ${t.change}`, `Definition of Done: ${t.dod}`, `Risiko: ${t.risk}`, 'Regeln: erst DoD zeigen, npm test muss grün sein, TSE/Kassenbon nicht anfassen, danach commit + push auf main.'].filter(Boolean).join('\n');
}

async function chat(input, { adapter, tools, today, root = __dirname, maxRounds = 10 }) {
  const lang = ['de', 'en', 'ar'].includes(input.lang) ? input.lang : 'ar';
  const message = str(input.message).trim().slice(0, 4000);
  if (!message) return { ok: false, code: 'EMPTY_MESSAGE' };
  const st = adapter.init(systemPrompt({ lang, today, context: readContext(root) }), AA.cleanHistory(input.history), message);
  const usage = { in: 0, out: 0 }, used = []; let text = '', rounds = 0, done = false;
  while (rounds < maxRounds) {
    rounds++;
    const r = await adapter.call(st);
    usage.in += r.usage.in; usage.out += r.usage.out;
    if (!r.calls.length) { text = r.text; done = true; break; }
    const results = [];
    for (const c of r.calls) { used.push(c.name); results.push(await tools.run(c.name, c.args)); }
    adapter.addResults(st, r.calls, results);
  }
  if (!done) { const r = await adapter.finalNoTools(st, 'Answer now with what you have. Do not call tools.'); usage.in += r.usage.in; usage.out += r.usage.out; text = r.text; }
  if (!text) return { ok: false, code: 'EMPTY', usage };
  return { ok: true, reply: text.slice(0, 9000), toolsUsed: [...new Set(used)], usage, rounds, provider: adapter.name };
}

const providerFromEnv = (env = process.env, fetchImpl = fetch) => AA.providerFromEnv(env, fetchImpl, { toolDefs: TOOLS, prefix: 'NARA_MANAGER', maxTokens: 2000 });

module.exports = { TOOLS, makeTools, systemPrompt, taskStore, taskPrompt, chat, providerFromEnv, safeRel, FORBIDDEN };
