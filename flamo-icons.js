'use strict';
/* flamo-icons.js — رموز وألوان موحّدة لكل شغلة بالنظام (كاش، كارت، ضريبة، منصات…). نفس الأيقونة واللون بكل صفحة. */
(function (root) {
  const ICONS = {
    cash: { icon: '💵', color: '#16a34a' }, card: { icon: '💳', color: '#2563eb' }, tip: { icon: '🎁', color: '#db2777' },
    tax: { icon: '🧾', color: '#7c3aed' }, food: { icon: '🍔', color: '#16a34a' }, drink: { icon: '🥤', color: '#2563eb' },
    platform: { icon: '🛵', color: '#ea580c' }, storno: { icon: '↩️', color: '#dc2626' }, cancel: { icon: '🚫', color: '#dc2626' },
    discount: { icon: '🏷️', color: '#d97706' }, orders: { icon: '🧾', color: '#475569' }, avg: { icon: '📊', color: '#0891b2' },
  };
  const get = k => ICONS[k] || { icon: '•', color: '#64748b' };
  const html = k => { const i = get(k); return '<i class="ic" style="--c:' + i.color + '">' + i.icon + '</i>'; };
  const api = { ICONS, get, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FLAMO_ICONS = api;
})(typeof window !== 'undefined' ? window : globalThis);
