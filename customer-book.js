'use strict';
// customer-book.js — سجل الزباين (جدول + بطاقة بتتحفظ أوتوماتيك).
// ملف لحالو (data/customer-book.json): تعديلاتك على الزباين + الزباين اللي بتضيفهم بإيدك.
// ما بيلمس قاعدة الزباين المبنية من الطلبات (customer-db.js) ولا صفحة الخريطة: بس بيدمج فوقها عند العرض،
// فلما تتجدد القاعدة من الطلبات (كل 5 دقايق) تعديلاتك بتضل.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITS = { name: 80, phone: 30, street: 80, house: 10, postal: 5, city: 60, floor: 20, bell: 40, note: 500 };
const FIELDS = Object.keys(LIMITS);
const ID_RE = /^[CM]-[0-9a-f]{10}$/;
const str = v => (v == null ? '' : String(v));
const digits = s => str(s).replace(/\D/g, '').replace(/^(0049|49)/, '0');

// ينظّف حقل واحد: نص عادي بسطر واحد، والملاحظة بتحافظ على الأسطر
function cleanField(key, value) {
  let s = str(value).replace(/\r/g, '');
  s = key === 'note' ? s.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  if (key === 'postal') s = s.replace(/\D/g, '');
  return s.trim().slice(0, LIMITS[key]);
}
// ياخد بس الحقول المعروفة اللي انبعتت (حتى لو فاضية = مسح الحقل)
function clean(patch) {
  const out = {};
  if (patch && typeof patch === 'object') for (const k of FIELDS) if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = cleanField(k, patch[k]);
  return out;
}

function emptyBook() { return { version: 1, entries: {}, manual: {} }; }
function normalize(b) {
  const o = b && typeof b === 'object' ? b : {};
  return { version: 1, entries: o.entries && typeof o.entries === 'object' ? o.entries : {}, manual: o.manual && typeof o.manual === 'object' ? o.manual : {} };
}
function load(file) { try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { return emptyBook(); } }
function write(file, book) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(book));
  fs.renameSync(file + '.tmp', file);
}

const stamp = (e, user, now) => Object.assign(e, { updatedAt: new Date(now).toISOString(), updatedBy: str(user).slice(0, 60) });

// تعديل زبون موجود (من الطلبات أو يدوي). بيرجّع { ok, book, error }. الاسم ما بينفع يصير فاضي.
function update(book, id, patch, { user = '', now = Date.now(), knownIds = null } = {}) {
  const b = normalize(book);
  if (!ID_RE.test(str(id))) return { ok: false, error: 'bad-id' };
  const isManual = id.startsWith('M-');
  if (isManual && !b.manual[id]) return { ok: false, error: 'not-found' };
  if (!isManual && knownIds && !knownIds.has(id)) return { ok: false, error: 'not-found' };
  const p = clean(patch);
  if (!Object.keys(p).length) return { ok: false, error: 'empty' };
  if (isManual) {
    const next = Object.assign({}, b.manual[id], p);
    if (!next.name) return { ok: false, error: 'name-required' };
    b.manual[id] = stamp(next, user, now);
  } else {
    const next = Object.assign({}, b.entries[id], p);
    b.entries[id] = stamp(next, user, now);
  }
  return { ok: true, book: b };
}

// زبون جديد باليد. الاسم إجباري.
function create(book, patch, { user = '', now = Date.now(), rand = () => crypto.randomBytes(5).toString('hex') } = {}) {
  const b = normalize(book);
  const p = clean(patch);
  if (!p.name) return { ok: false, error: 'name-required' };
  let id = 'M-' + rand();
  while (b.manual[id]) id = 'M-' + rand();
  b.manual[id] = stamp(Object.assign({ createdAt: new Date(now).toISOString() }, p), user, now);
  return { ok: true, book: b, id };
}

const SHOW = ['name', 'phone', 'street', 'house', 'postal', 'city', 'floor', 'bell'];
// يدمج الزباين المبنيين من الطلبات مع التعديلات + الزباين اليدويين → صفوف الجدول
function merge(dbCustomers, book) {
  const b = normalize(book);
  const rows = [];
  for (const c of dbCustomers || []) {
    const e = b.entries[c.id] || null;
    const r = {
      id: c.id, manual: false, edited: !!e,
      name: c.name || '', phone: c.phone || '', street: c.street || '', house: c.house || '', postal: c.postal || '', city: c.city || '',
      floor: c.floor || '', bell: c.bell || '', note: '',
      orders: c.orders || 0, totalCents: c.totalCents || 0, avgCents: c.avgCents || 0, lastAt: c.lastAt || null,
      mainSource: c.mainSource || '', sources: Object.keys(c.sources || {}).filter(Boolean), segment: c.segment || 'NEW', orderNote: c.notes || '', kitchenNote: c.kitchenNote || '',
      favourites: (c.favourites || []).slice(0, 5).map(f => ({ name: f.name, n: f.n != null ? f.n : f.count })),
    };
    if (e) { for (const k of SHOW.concat('note')) if (e[k] !== undefined) r[k] = e[k]; r.updatedAt = e.updatedAt || null; r.updatedBy = e.updatedBy || ''; }
    rows.push(r);
  }
  for (const [id, m] of Object.entries(b.manual)) {
    const r = { id, manual: true, edited: false, orders: 0, totalCents: 0, avgCents: 0, lastAt: null, mainSource: 'MANUAL', sources: ['MANUAL'], segment: 'NEW', orderNote: '', kitchenNote: '', favourites: [] };
    for (const k of SHOW.concat('note')) r[k] = m[k] || '';
    r.updatedAt = m.updatedAt || null; r.updatedBy = m.updatedBy || ''; r.createdAt = m.createdAt || null;
    rows.push(r);
  }
  return rows;
}

// زباين ثانيين بنفس رقم التلفون (للتحذير). بيرجّع أسماءهم.
function samePhone(rows, id, phone) {
  const d = digits(phone);
  if (d.length < 7) return [];
  return (rows || []).filter(r => r.id !== id && digits(r.phone) === d).map(r => r.name || '—');
}

module.exports = { LIMITS, FIELDS, ID_RE, clean, emptyBook, normalize, load, write, update, create, merge, samePhone };
