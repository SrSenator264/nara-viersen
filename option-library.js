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

function compose(p, groups, day = today()) {
  const byId = new Map((groups || []).map(g => [g.id, g]));
  const skip = new Set(p.optionExclude || []);
  const out = [];
  for (const id of p.optionGroupIds || []) {
    const g = byId.get(id); if (!g) continue;
    for (const it of g.items || []) {
      if (skip.has(it.id)) continue;
      const o = { ...it };
      if (it.soldOutDay) { delete o.soldOutDay; if (it.soldOutDay === day) o.unavailable = true; }
      if (hasGroup(g.name)) o.group = g.name;
      out.push(o);
    }
  }
  return out;
}

module.exports = { migrate, compose, canon, today };
