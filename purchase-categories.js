'use strict';
// purchase-categories.js — المشتريات حسب النوع (لحمة، خبز، خضرة…) من بنود الفواتير. قراءة بس.
// ترتيب التصنيف: (1) تصنيف يدوي على مادة المخزن (inventoryItems[].purchaseCategory)
//               (2) تصنيف يدوي لوصف البند (settings.accounting.purchaseCategoryOverrides)
//               (3) قواعد بالكلمات (ألماني/إنجليزي)  (4) OTHER
const str = v => (v == null ? '' : String(v));
const low = v => str(v).toLowerCase();
const CATS = ['MEAT', 'BREAD', 'VEG', 'CHEESE', 'SAUCE', 'FROZEN', 'DRINKS', 'OIL', 'PACKAGING', 'CLEANING', 'OTHER'];
const RULES = [
  ['PACKAGING', /verpack|karton|box\b|becher|deckel|tüte|tuete|serviette|alufolie|folie|beutel|papier|strohhalm|besteck|schale|menübox|menuebox|tray|sackerl|pizzakarton|einweg/],
  ['CLEANING', /reinig|spül|spuel|desinf|handschuh|müllbeutel|muellbeutel|tücher|tuecher|seife|clean|wisch|schwamm|entkalk/],
  ['OIL', /frittier|\böl\b|\boel\b|speiseöl|rapsöl|fett\b|palmin|frying oil/],
  ['FROZEN', /pommes|fries|curly|wedges|\btk\b|tiefkühl|tiefkuehl|frozen|onion ?rings?|zwiebelringe|nuggets?|mozzarella ?sticks|kroketten|röstzwiebel/],
  ['CHEESE', /käse|kaese|cheddar|gouda|mozzarella|feta|halloumi|cheese|emmentaler|scheiblett/],
  ['MEAT', /rind|hack|beef|hähnchen|haehnchen|chicken|hühn|huehn|pute|turkey|bacon|fleisch|filet|wings|kebab|döner|doener|sucuk|patty|patties|lamm|kalb|veal|schenkel|brust/],
  ['BREAD', /brot|\bbuns?\b|brötchen|broetchen|tortilla|wrap|fladen|baguette|toast|pita|brioche|bäck|baeck|teig/],
  ['SAUCE', /sauce|soße|sosse|mayo|ketchup|senf|dressing|aioli|bbq|\bdip\b|monin|sirup|syrup|essig|gewürz|gewuerz|salz|pfeffer|paprikapulver/],
  ['DRINKS', /cola|fanta|sprite|wasser|saft|\btee\b|fuze|mezzo|getränk|getraenk|limo|red ?bull|ayran|milch|kaffee|coffee|capri|pfand|0[,.]33|0[,.]5 ?l|1[,.]0 ?l|1 ?l\b/],
  ['VEG', /salat|tomate|gurke|zwiebel|eisberg|kartoffel|paprika|jalap|kohl|lauch|zitrone|limette|petersilie|knoblauch|champignon|pilz|avocado|minze|rucola|möhre|moehre|karotte|kräuter|kraeuter|gemüse|gemuese|mais/],
];
function ruleCat(text) { const t = low(text); for (const [c, re] of RULES) if (re.test(t)) return c; return null; }

const lineCents = l => {
  if (l.lineTotalCents != null && Number.isFinite(Number(l.lineTotalCents))) return Math.round(Number(l.lineTotalCents));
  if (l.lineTotal != null && Number.isFinite(Number(l.lineTotal))) return Math.round(Number(l.lineTotal) * 100);
  const q = Number(l.quantity), p = Number(l.unitPrice);
  return Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) : 0;
};
const invCents = i => { for (const k of ['totalAmountCents', 'totalCents', 'grossAmountCents']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k])); for (const k of ['totalAmount', 'grossAmount']) if (i[k] != null && Number.isFinite(Number(i[k]))) return Math.round(Number(i[k]) * 100); return 0; };
const pad = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function classify(data) {
  const items = new Map((data.inventoryItems || []).map(x => [str(x.id), x]));
  const over = (data.settings && data.settings.accounting && data.settings.accounting.purchaseCategoryOverrides) || {};
  return (line, supplierName) => {
    const it = items.get(str(line.inventoryItemId));
    if (it && CATS.includes(it.purchaseCategory)) return { cat: it.purchaseCategory, how: 'item' };
    const desc = str(line.originalDescription || line.description || line.name || (it && it.name) || line.suggestedInventoryName);
    const o = over[low(desc).trim()]; if (CATS.includes(o)) return { cat: o, how: 'manual' };
    const r = ruleCat(desc + ' ' + str(line.suggestedInventoryName) + ' ' + str(it && it.name)); if (r) return { cat: r, how: 'rule' };
    const s = ruleCat(supplierName); if (s) return { cat: s, how: 'supplier' };
    return { cat: 'OTHER', how: 'none' };
  };
}

function month(data, y, m, cls) {
  const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
  const sup = new Map((data.suppliers || []).map(s => [str(s.id), s.name]));
  const totals = Object.fromEntries(CATS.map(c => [c, 0])), byItem = new Map(), unknown = [];
  let invoices = 0, totalCents = 0;
  for (const i of data.invoices || []) {
    if (['CANCELLED', 'DRAFT'].includes(str(i.status).toUpperCase())) continue;
    const d = str(i.invoiceDate || i.createdAt).slice(0, 10); if (d < from || d > to) continue;
    invoices++;
    const sn = str(i.supplierName || sup.get(str(i.supplierId))), lines = i.lineItems || i.lines || [];
    if (!lines.length) { const c = invCents(i), k = ruleCat(sn) || 'OTHER'; totals[k] += c; totalCents += c; if (k === 'OTHER') unknown.push({ description: sn + ' (ohne Positionen)', cents: c, invoiceId: i.id }); continue; }
    for (const l of lines) {
      const c = lineCents(l); if (!c) continue;
      const { cat } = cls(l, sn), name = str(l.originalDescription || l.description || l.name || l.suggestedInventoryName || '?').slice(0, 80);
      totals[cat] += c; totalCents += c;
      const k = low(name), e = byItem.get(k) || { name, cents: 0, qty: 0, category: cat }; e.cents += c; e.qty += Number(l.quantity) || 0; byItem.set(k, e);
      if (cat === 'OTHER' && unknown.length < 30) unknown.push({ description: name, cents: c, invoiceId: i.id, inventoryItemId: l.inventoryItemId || null });
    }
  }
  return { year: y, month: m, from, to, invoices, totalCents, totals, top: [...byItem.values()].sort((a, b) => b.cents - a.cents).slice(0, 5), uncategorized: unknown };
}

function build(data, { year, month: m } = {}) {
  const cls = classify(data), cur = month(data, year, m, cls);
  const py = m === 1 ? year - 1 : year, pm = m === 1 ? 12 : m - 1, prev = month(data, py, pm, cls);
  const change = Object.fromEntries(CATS.map(c => [c, prev.totals[c] ? Math.round((cur.totals[c] - prev.totals[c]) / prev.totals[c] * 100) : null]));
  return { current: cur, previous: { year: py, month: pm, totalCents: prev.totalCents, totals: prev.totals }, changePct: change, categories: CATS };
}

module.exports = { build, ruleCat, classify, CATS };
