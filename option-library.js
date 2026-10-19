'use strict';
// option-library.js — Optionen/Extras als gemeinsame Bibliothek (data.optionGroups) statt Kopien pro Produkt.
//  • migrate(data): einmalig – bildet aus den vorhandenen menuData.dips aller Produkte Gruppen und verknüpft die Produkte (optionGroupIds). Verlustfrei: compose() ergibt wieder exakt die alten dips.
//  • compose(product, groups, today): baut die dips-Liste, die Kasse/Website erwarten (Reihenfolge der Gruppen = optionGroupIds, ausgeschlossene Einträge fehlen, „heute aus“ wirkt nur am eingetragenen Tag).
const crypto = require('node:crypto');
const sortKeys = o => Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])])) : o;
const canon = o => JSON.stringify(sortKeys(o));
const hasGroup = g => g != null && g !== '';
const today = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function migrate(data) {
  if (Array.isArray(data.optionGroups) && data.optionGroups.length) return 0;
  const groups = new Map();
  for (const p of data.products || []) {
    const dips = p.menuData && Array.isArray(p.menuData.dips) ? p.menuData.dips : [];
    if (!dips.length || (p.optionGroupIds && p.optionGroupIds.length)) continue;
    const order = [];
    for (const d of dips) { const g = hasGroup(d.group) ? d.group : null; if (!order.includes(g)) order.push(g); }
    p.optionGroupIds = order.map(name => {
      const items = dips.filter(d => (hasGroup(d.group) ? d.group : null) === name).map(({ group, ...rest }) => rest);
      const id = 'og_' + crypto.createHash('sha1').update(canon([name, items])).digest('hex').slice(0, 10);
      if (!groups.has(id)) groups.set(id, { id, name, items, createdBy: 'migration' });
      return id;
    });
  }
  data.optionGroups = [...groups.values()];
  return data.optionGroups.length;
}

// Katalog (v2): jeder Eintrag (Sauce, Getränk, Dessert …) existiert einmal — Name, Direktpreis, Plattformpreis (Referenz, z. B. Lieferando), „nicht verfügbar“.
// Ein Gruppen-Eintrag verweist per ref darauf und hat einen Preis-Modus: 'catalog' (= Katalogpreis), 'free' (0, z. B. im Menü inklusive) oder 'fixed' (eigener Preis in dieser Gruppe).
const catId = name => 'oc_' + crypto.createHash('sha1').update(String(name)).digest('hex').slice(0, 10);
const resolvePrice = (it, cat) => it.priceMode === 'free' ? 0 : it.priceMode === 'fixed' ? (Number(it.cents) || 0) : (Number(cat && cat.cents) || 0);

function migrateCatalog(data) {
  if (Array.isArray(data.optionCatalog) && data.optionCatalog.length) return 0;
  const occ = new Map(); // name -> [cents,…]
  for (const g of data.optionGroups || []) for (const it of g.items || []) { if (it.ref) continue; if (!occ.has(it.name)) occ.set(it.name, []); occ.get(it.name).push(Number(it.cents) || 0); }
  const catalog = [];
  const byName = new Map();
  for (const [name, list] of occ) {
    const nz = list.filter(c => c > 0), freq = new Map(); nz.forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
    const cents = nz.length ? [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : 0;
    const c = { id: catId(name), name, cents, platformCents: cents };
    catalog.push(c); byName.set(name, c);
  }
  for (const g of data.optionGroups || []) g.items = (g.items || []).map(it => {
    if (it.ref) return it;
    const { name, cents, ...rest } = it, cat = byName.get(name), c0 = Number(cents) || 0;
    const mode = c0 === cat.cents ? 'catalog' : c0 === 0 ? 'free' : 'fixed';
    return { ...rest, ref: cat.id, priceMode: mode, platformCents: c0, ...(mode === 'fixed' ? { cents: c0 } : {}) };
  });
  data.optionCatalog = catalog;
  // Plattformpreis (Lieferando-Referenz) der Produkte festhalten, bevor Direktpreise geändert werden
  for (const p of data.products || []) {
    if (p.platformPriceCents === undefined) { const base = p.menuData && Number.isFinite(Number(p.menuData.cents)) ? Number(p.menuData.cents) : Number(p.priceCents); if (Number.isFinite(base)) p.platformPriceCents = base; }
    if (p.platformMenuCents === undefined && p.menuData && Number.isFinite(Number(p.menuData.menuCents))) p.platformMenuCents = Number(p.menuData.menuCents);
  }
  return catalog.length;
}

function compose(p, groups, day = today(), catalog = []) {
  const byId = new Map((groups || []).map(g => [g.id, g]));
  const cats = new Map((catalog || []).map(c => [c.id, c]));
  const skip = new Set(p.optionExclude || []);
  const out = [];
  for (const id of p.optionGroupIds || []) {
    const g = byId.get(id); if (!g) continue;
    for (const it of g.items || []) {
      if (skip.has(it.id)) continue;
      const cat = it.ref ? cats.get(it.ref) : null;
      const { ref, priceMode, platformCents, soldOutDay, ...o } = it;
      if (cat) {
        o.name = cat.name; o.cents = resolvePrice(it, cat);
        if (cat.unavailable || cat.soldOutDay === day) o.unavailable = true;
      }
      if (soldOutDay === day) o.unavailable = true;
      if (hasGroup(g.name)) o.group = g.name;
      out.push(o);
    }
  }
  return out;
}

// Repair: Gruppen-Einträge verweisen (ref) auf Katalog-Einträge, die fehlen → aus der Sicherung (pre-catalog) wiederherstellen.
function orphanRefs(data) {
  const have = new Set((data.optionCatalog || []).map(c => c.id)), out = new Set();
  for (const g of data.optionGroups || []) for (const it of g.items || []) if (it.ref && !have.has(it.ref)) out.add(it.ref);
  return out;
}
function repairCatalog(data, bakData) {
  const orph = orphanRefs(data); if (!orph.size || !bakData) return 0;
  const tmp = JSON.parse(JSON.stringify({ optionGroups: bakData.optionGroups || [], products: [], optionCatalog: [] }));
  migrateCatalog(tmp);
  const add = tmp.optionCatalog.filter(c => orph.has(c.id));
  data.optionCatalog = [...(data.optionCatalog || []), ...add];
  return add.length;
}
module.exports = { orphanRefs, repairCatalog, migrate, migrateCatalog, compose, resolvePrice, catId, canon, today };
