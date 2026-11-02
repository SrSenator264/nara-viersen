'use strict';
// Adds NEW items from the code catalog (menu-source.js) to the stored menu.
// Never touches existing products; never re-adds items the owner deleted.
function syncNewSourceItems(data, sourceCatalog) {
  data.settings = data.settings || {};
  const hasSeen = Array.isArray(data.settings.menuSyncedSourceIds);
  const existing = new Set(data.products.map(p => p.sourceId).filter(v => v != null).map(String));
  let seen;
  let candidates;
  if (hasSeen) {
    seen = new Set(data.settings.menuSyncedSourceIds.map(String));
    candidates = sourceCatalog.filter(it => !seen.has(String(it.id)) && !existing.has(String(it.id)));
  } else {
    // first run: only items newer than everything stored (deleted old items stay deleted)
    const nums = data.products.map(p => Number(p.sourceId)).filter(Number.isFinite);
    const max = nums.length ? Math.max(...nums) : -Infinity;
    seen = new Set(existing);
    for (const it of sourceCatalog) if (Number(it.id) <= max) seen.add(String(it.id));
    candidates = sourceCatalog.filter(it => !seen.has(String(it.id)) && !existing.has(String(it.id)));
  }
  let changed = !hasSeen;
  let order = data.products.reduce((m, p) => Math.max(m, Number(p.sortOrder) || 0), 0);
  let catOrder = data.categories.reduce((m, c) => Math.max(m, Number(c.sortOrder) || 0), 0);
  for (const p of candidates) {
    let cat = data.categories.find(c => c.name === p.c);
    if (!cat && p.c) {
      cat = { id: 'cat_' + (++catOrder) + '_' + String(p.c).toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: p.c, active: true, sortOrder: catOrder };
      data.categories.push(cat);
    }
    data.products.push({
      id: 'menu_' + p.id, sourceId: p.id, name: p.n, categoryId: cat ? cat.id : null,
      priceCents: Number(p.cents) || 0, description: p.d || '', active: p.active !== false,
      available: p.unavailable !== true, sortOrder: ++order, imageRef: p.img || null,
      translations: { de: null, ar: null, en: null }, optionGroupIds: [], menuData: p
    });
    seen.add(String(p.id));
    changed = true;
  }
  data.settings.menuSyncedSourceIds = [...seen];
  return { changed, added: candidates.length };
}
module.exports = { syncNewSourceItems };
