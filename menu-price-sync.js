'use strict';
// Einmalige Preis-Angleichung der Menü-Datenbank (data/nara-admin.json) an eine Preisliste.
// Wirkt nur auf bestehende Produkte (Abgleich über sourceId), nur auf den Kassenpreis (priceCents)
// und – bei Burgern – den Menüpreis (menuData.menuCents). Plattformpreise, Namen, Kategorien bleiben.
// Pro Preislisten-Kennung (tag) genau einmal; danach bleiben manuelle Änderungen im Admin erhalten.

// prices: {sourceId: cents}; pairs: Map/Array von [burgerId, menuProductId]
function buildMap(prices, pairs) {
  const map = {};
  for (const [id, cents] of Object.entries(prices || {})) if (Number.isFinite(cents)) map[id] = { cents };
  for (const [burgerId, menuId] of pairs || []) {
    const c = (prices || {})[menuId];
    if (Number.isFinite(c)) map[burgerId] = { ...(map[burgerId] || {}), menuCents: c };
  }
  return map;
}

function applyPriceSync(data, map, tag) {
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const done = Array.isArray(data.settings.priceSyncsApplied) ? data.settings.priceSyncsApplied : [];
  if (done.includes(tag)) return { applied: false, changed: 0, menuChanged: 0 };
  let changed = 0, menuChanged = 0;
  for (const p of data.products || []) {
    const sid = p.sourceId != null ? p.sourceId : p.menuData && p.menuData.id;
    const e = sid != null ? map[sid] : null;
    if (!e) continue;
    if (e.cents != null && p.priceCents !== e.cents) {
      p.priceCents = e.cents;
      if (p.menuData && typeof p.menuData === 'object') p.menuData.cents = e.cents;
      changed++;
    }
    if (e.menuCents != null && p.menuData && typeof p.menuData === 'object' && p.menuData.menuCents !== e.menuCents) {
      p.menuData.menuCents = e.menuCents;
      menuChanged++;
    }
  }
  data.settings.priceSyncsApplied = [...done, tag];
  return { applied: true, changed, menuChanged };
}

// Einmalig: fehlende Produkte anlegen (samt Kategorie) und vorhandene Produkte aktivieren.
// items: Katalog-Einträge (id, n, c, cents, d, ...); enableIds: sourceIds, die sichtbar/verfügbar werden sollen.
function applyAdditions(data, items, enableIds, tag, newId) {
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const done = Array.isArray(data.settings.priceSyncsApplied) ? data.settings.priceSyncsApplied : [];
  if (done.includes(tag)) return { applied: false, added: 0, enabled: 0 };
  data.categories = Array.isArray(data.categories) ? data.categories : [];
  data.products = Array.isArray(data.products) ? data.products : [];
  let added = 0, enabled = 0;
  for (const it of items || []) {
    if (data.products.some(p => String(p.sourceId) === String(it.id))) continue;
    let cat = data.categories.find(c => c.name === it.c);
    if (!cat) {
      cat = { id: 'cat_' + String(it.c).toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: it.c, active: true, sortOrder: data.categories.length };
      data.categories.push(cat);
    }
    const inCat = data.products.filter(p => p.categoryId === cat.id).length;
    data.products.push({
      id: newId(), sourceId: it.id, name: it.n, categoryId: cat.id, priceCents: Number(it.cents) || 0,
      description: it.d || '', active: true, available: true, sortOrder: inCat, imageRef: it.img || null,
      translations: { de: null, ar: null, en: null }, optionGroupIds: [], channels: it.channels && typeof it.channels === 'object' ? { ...it.channels } : { kasse: true, customer: true }, menuData: it,
    });
    added++;
  }
  for (const p of data.products) {
    if ((enableIds || []).some(id => String(id) === String(p.sourceId)) && (p.active === false || p.available === false)) {
      p.active = true; p.available = true; enabled++;
    }
  }
  data.settings.priceSyncsApplied = [...done, tag];
  return { applied: true, added, enabled };
}

module.exports = { buildMap, applyPriceSync, applyAdditions };
