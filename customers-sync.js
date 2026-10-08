'use strict';
// customers-sync.js — دمج دفتر الزبائن بين الأجهزة (السيرفر هو المرجع). كل شي بيتخزّن بملف بيانات السيرفر.
// القاعدة: نفس الزبون = نفس الـid أو نفس رقم الهاتف. الأحدث (updatedAt) بيفوز، وعدد الطلبات بياخد الأكبر.
// الحذف بيتسجّل كـ tombstone حتى ما يرجع الزبون من جهاز تاني.
const FIELDS = ['id', 'name', 'phone', 'street', 'house', 'postal', 'city', 'floor', 'bell', 'extra', 'notes', 'lastOrderId', 'lastOrderAt'];
const MAX_CUSTOMERS = 20000, MAX_LEN = 200, TOMBSTONE_DAYS = 90;
const digits = s => String(s || '').replace(/\D/g, '').replace(/^(0049|49)/, '0');
const str = v => String(v ?? '').slice(0, MAX_LEN);

function clean(c, nowIso) {
  if (!c || typeof c !== 'object' || !c.id) return null;
  const o = {};
  for (const f of FIELDS) if (c[f] !== undefined && c[f] !== null) o[f] = str(c[f]);
  o.id = str(c.id);
  o.orderCount = Number.isInteger(c.orderCount) && c.orderCount > 0 ? Math.min(c.orderCount, 1e6) : 0;
  const t = Date.parse(c.updatedAt);
  o.updatedAt = Number.isFinite(t) ? new Date(t).toISOString() : nowIso;
  if (!o.name && !o.phone) return null;
  return o;
}

function mergeCustomers(serverList, serverDeleted, incoming, incomingDeleted, now = new Date()) {
  const nowIso = now.toISOString();
  const deleted = { ...(serverDeleted || {}) };
  for (const [id, ts] of Object.entries(incomingDeleted || {})) {
    const t = Date.parse(ts);
    deleted[str(id)] = Number.isFinite(t) ? new Date(t).toISOString() : nowIso;
  }
  const byId = new Map();
  const byPhone = new Map();
  const put = c => {
    const pd = digits(c.phone);
    let existing = byId.get(c.id) || (pd.length >= 6 ? byPhone.get(pd) : null);
    if (existing) {
      const newer = c.updatedAt >= existing.updatedAt ? c : existing;
      const older = newer === c ? existing : c;
      const merged = { ...older, ...newer, id: existing.id, orderCount: Math.max(existing.orderCount || 0, c.orderCount || 0) };
      byId.set(merged.id, merged);
      existing = merged;
    } else {
      byId.set(c.id, c);
      existing = c;
    }
    if (pd.length >= 6) byPhone.set(pd, existing);
  };
  for (const c of (serverList || [])) { const k = clean(c, nowIso); if (k) put(k); }
  for (const c of (incoming || []).slice(0, MAX_CUSTOMERS)) { const k = clean(c, nowIso); if (k) put(k); }
  for (const [id, ts] of Object.entries(deleted)) {
    const c = byId.get(id);
    if (c && c.updatedAt <= ts) byId.delete(id);
  }
  const cutoff = now.getTime() - TOMBSTONE_DAYS * 86400000;
  for (const [id, ts] of Object.entries(deleted)) if (Date.parse(ts) < cutoff) delete deleted[id];
  return { customers: [...new Set(byId.values())].slice(0, MAX_CUSTOMERS), deleted };
}

module.exports = { mergeCustomers, clean, digits };
