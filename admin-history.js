'use strict';
// Änderungsverlauf für Menü-Daten (Produkte, Kategorien, Optionen) mit Rückgängig. Nur Server.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const COLS = ['products', 'categories', 'optionGroups', 'optionCatalog'];
const MAX = 300;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = it => String((it && (it.name || it.label || it.id)) || '');

function fieldDiff(a, b) {
  const before = {}, after = {}, absent = [], fields = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (same(a && a[k], b && b[k])) continue;
    fields.push(k);
    if (a && k in a) before[k] = a[k]; else absent.push(k);
    if (b && k in b) after[k] = b[k];
  }
  return { fields, before, after, absent };
}

function diff(collection, oldItems, newItems) {
  if (!COLS.includes(collection)) return [];
  oldItems = Array.isArray(oldItems) ? oldItems : []; newItems = Array.isArray(newItems) ? newItems : [];
  const om = new Map(oldItems.map(i => [i.id, i])), nm = new Map(newItems.map(i => [i.id, i]));
  const out = [];
  for (const it of newItems) {
    const o = om.get(it.id);
    if (!o) out.push({ op: 'create', itemId: it.id, name: nameOf(it), before: null, after: it });
    else if (!same(o, it)) { const d = fieldDiff(o, it); out.push({ op: 'update', itemId: it.id, name: nameOf(it), ...d }); }
  }
  for (const it of oldItems) if (!nm.has(it.id)) out.push({ op: 'delete', itemId: it.id, name: nameOf(it), before: it, after: null });
  const common = new Set(oldItems.filter(i => nm.has(i.id)).map(i => i.id));
  const ao = oldItems.map(i => i.id).filter(id => common.has(id)), bo = newItems.map(i => i.id).filter(id => common.has(id));
  if (!same(ao, bo)) out.push({ op: 'reorder', name: '', beforeOrder: oldItems.map(i => i.id), afterOrder: newItems.map(i => i.id) });
  return out;
}

function file(dir) { return path.join(dir, 'admin-history.json'); }
function read(dir) { try { const j = JSON.parse(fs.readFileSync(file(dir), 'utf8')); return Array.isArray(j.entries) ? j : { entries: [] }; } catch (e) { return { entries: [] }; } }
function write(dir, h) { fs.mkdirSync(dir, { recursive: true }); const f = file(dir), t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(h)); fs.renameSync(t, f); }

// Eintrag(e) protokollieren. Mehr als 8 Änderungen auf einmal (z. B. Sammel-Preis) = ein Sammel-Eintrag.
function record(dir, collection, oldItems, newItems, user) {
  const ch = diff(collection, oldItems, newItems); if (!ch.length) return 0;
  const h = read(dir), ts = new Date().toISOString(), by = String(user || '');
  const base = { ts, by, collection };
  const mk = e => ({ id: crypto.randomBytes(6).toString('hex'), ...base, ...e });
  const ups = ch.filter(c => c.op === 'update'), rest = ch.filter(c => c.op !== 'update');
  if (ups.length > 8) h.entries.push(mk({ op: 'bulk', name: '', count: ups.length, items: ups.map(c => ({ itemId: c.itemId, name: c.name, fields: c.fields, before: c.before, after: c.after, absent: c.absent })) }));
  else for (const c of ups) h.entries.push(mk(c));
  for (const c of rest) h.entries.push(mk(c));
  if (h.entries.length > MAX) h.entries = h.entries.slice(-MAX);
  write(dir, h); return ch.length;
}

function applyUpdate(item, u) { for (const k of u.fields || []) { if ((u.absent || []).includes(k)) delete item[k]; else item[k] = u.before[k]; } }

// Rückgängig: verändert data in-place, liefert {ok,error?}
function undo(dir, id, data) {
  const h = read(dir), e = h.entries.find(x => x.id === id);
  if (!e) return { ok: false, error: 'not found' };
  if (e.undone) return { ok: false, error: 'already undone' };
  const arr = data[e.collection]; if (!Array.isArray(arr)) return { ok: false, error: 'collection missing' };
  if (e.op === 'update') { const it = arr.find(i => i.id === e.itemId); if (!it) return { ok: false, error: 'item missing' }; applyUpdate(it, e); }
  else if (e.op === 'bulk') { for (const u of e.items) { const it = arr.find(i => i.id === u.itemId); if (it) applyUpdate(it, u); } }
  else if (e.op === 'create') { const i = arr.findIndex(x => x.id === e.itemId); if (i < 0) return { ok: false, error: 'item missing' }; arr.splice(i, 1); }
  else if (e.op === 'delete') { if (arr.some(x => x.id === e.itemId)) return { ok: false, error: 'exists' }; arr.push(e.before); }
  else if (e.op === 'reorder') { const pos = new Map(e.beforeOrder.map((x, i) => [x, i])); arr.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9)); }
  else return { ok: false, error: 'unsupported' };
  e.undone = new Date().toISOString(); write(dir, h);
  return { ok: true };
}

function list(dir, n = 100) { return read(dir).entries.slice(-n).reverse().map(e => ({ id: e.id, ts: e.ts, by: e.by, collection: e.collection, op: e.op, name: e.name, fields: e.fields || (e.items ? [...new Set(e.items.flatMap(i => i.fields))] : []), count: e.count || 1, undone: e.undone || null, before: e.before && e.op === 'update' ? e.before : undefined, after: e.after && e.op === 'update' ? e.after : undefined })); }

module.exports = { diff, record, undo, list, read, COLS };
