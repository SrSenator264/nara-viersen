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

module.exports = { buildMap, applyPriceSync };
