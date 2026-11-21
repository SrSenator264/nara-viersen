'use strict';
// dish-cost.js — تكلفة كل وجبة من الوصفة + آخر سعر شراء لكل مادة، والهامش مقابل سعر البيع. قراءة بس.
// نفس افتراض auto-post-cogs: سعر الشراء محفوظ لكل وحدة أساسية (g / ml / Stk) للمادة.
const str = v => (v == null ? '' : String(v));
function build(data, { query = '' } = {}) {
  const q = str(query).toLowerCase();
  const items = new Map((data.inventoryItems || []).map(x => [str(x.id), x]));
  const last = new Map();
  for (const p of [...(data.purchasePriceHistory || [])].sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt)))) if (Number.isFinite(Number(p.unitPrice))) last.set(str(p.inventoryItemId), { price: Number(p.unitPrice), date: str(p.createdAt).slice(0, 10) });
  const products = new Map((data.products || []).map(p => [str(p.id), p]));
  const out = [];
  for (const r of data.recipes || []) {
    if (!Array.isArray(r.ingredientLines) || !r.ingredientLines.length) continue;
    const p = products.get(str(r.productId)) || [...products.values()].find(x => str(x.sourceId) === str(r.productId)) || {};
    const name = str(p.name || r.name || r.productId); if (q && !name.toLowerCase().includes(q)) continue;
    let costCents = 0; const missing = [], lines = [];
    for (const l of r.ingredientLines) {
      const it = items.get(str(l.inventoryItemId)), qty = Number(l.quantity ?? l.amount ?? l.quantityPerProduct), lp = last.get(str(l.inventoryItemId));
      if (!it || !Number.isFinite(qty) || !lp) { missing.push(it ? it.name : str(l.inventoryItemId)); continue; }
      const c = Math.round(qty * lp.price * 100); costCents += c; lines.push({ item: it.name, qty, unit: it.baseUnit || it.unit || null, unitPrice: lp.price, costCents: c });
    }
    const priceCents = Number.isFinite(Number(p.priceCents)) ? Number(p.priceCents) : null;
    out.push({ product: name, status: r.status || null, priceCents, costCents, marginCents: priceCents == null ? null : priceCents - costCents, costSharePct: priceCents ? Math.round(costCents / priceCents * 1000) / 10 : null, complete: !missing.length, missing, lines });
  }
  return { count: out.length, dishes: out.sort((a, b) => (b.costSharePct || 0) - (a.costSharePct || 0)).slice(0, 60), note: out.length ? 'unitPrice = Preis pro Basiseinheit (wie COGS-Buchung) — bitte Einheiten prüfen.' : 'Noch keine Rezepte mit Zutaten angelegt.' };
}
module.exports = { build };
