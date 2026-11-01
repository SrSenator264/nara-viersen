'use strict';
// extra-category.js — كاتيغوري "Extra / اكسترا" بالكاشير + خيار "دبل مكونات" للساندويشات والهوت دوغ.
//  • applyExtraCategory(data, newId): مرة وحدة (بتتسجّل بـ settings.priceSyncsApplied). بتجمع إضافات البرغر والصوصات (Dips)
//    من مكتبة الخيارات، بنفس أسعارها الحالية، وبتعمل لكل واحد صنف باسم "الاسم اكسترا". الكاتيغوري بتنحط بعد Fried Chicken.
//    أسعار 0 (المضمّنة بالمنيو) والمشروبات والصوص-ضمن-المنيو (__) ما بتنضاف. للكاشير بس (مو للموقع).
//  • renameExtraProducts(data): تصحيح مرة وحدة للأصناف اللي انعملت باسم عربي: الاسم الألماني + Extra، والعربي بالترجمة.
//  • doubleIngredientsOption(categoryName, priceCents): خيار "Doppelte Zutaten" = 35% من سعر الصنف، بس للـ Sandwiches و Hot Dogs.
const optionLibrary = require('./option-library.js');

const TAG = 'extra-category-2026-11-01';
const CAT_NAME = 'Extra';
const AFTER_CAT = 'Fried Chicken';
const AR_SUFFIX = ' اكسترا';
const RENAME_TAG = 'extra-names-2026-11-01';
// الاسم الأساسي بالألماني + Extra (إلا إذا فيه Extra أصلاً)؛ الترجمة العربية: الاسم + اكسترا
const deName = base => (/extra/i.test(base) ? base : base + ' Extra');
const arName = base => base.replace(/[,\s]*extra\s*$/i, '').trim() + AR_SUFFIX;
const arTr = base => ({ status: 'approved', name: arName(base) });
const FIRST_ID = 91001;
const DOUBLE_PERCENT = 35;
const DOUBLE_CATEGORIES = /^(sandwiches|hot dogs)$/i;
const BURGER_CATEGORY = /burger/i;
const SAUCE_OR_EXTRA_GROUP = /extra|dip|sauce|so[sß]e/i;

function doubleIngredientsOption(categoryName, priceCents) {
  const base = Number(priceCents);
  if (!DOUBLE_CATEGORIES.test(String(categoryName || '').trim()) || !Number.isFinite(base) || base <= 0) return null;
  return { id: 'double-ingredients', name: 'Doppelte Zutaten', cents: Math.round(base * DOUBLE_PERCENT / 100), group: 'Extra' };
}

// الاسم بالمكتبة → السعر الأكثر تكراراً (عند التعادل الأقل)
function collectExtras(data) {
  const byId = new Map((data.optionGroups || []).map(g => [g.id, g]));
  const cats = new Map((data.optionCatalog || []).map(c => [c.id, c]));
  const catName = new Map((data.categories || []).map(c => [c.id, c.name]));
  const usedGroups = new Set();
  for (const p of data.products || []) {
    const isBurger = BURGER_CATEGORY.test(String(catName.get(p.categoryId) || p.menuData?.c || ''));
    for (const gid of p.optionGroupIds || []) {
      const g = byId.get(gid);
      if (!g) continue;
      const name = String(g.name || '');
      if (name.startsWith('__') || !SAUCE_OR_EXTRA_GROUP.test(name)) continue;
      if (isBurger || /dip|sauce|so[sß]e/i.test(name)) usedGroups.add(g);
    }
  }
  const prices = new Map(); // name -> [cents]
  for (const g of usedGroups) {
    for (const it of g.items || []) {
      const cat = it.ref ? cats.get(it.ref) : null;
      const name = String((cat && cat.name) || it.name || '').trim();
      const cents = optionLibrary.resolvePrice(it, cat);
      if (!name || !(cents > 0)) continue;
      if (!prices.has(name)) prices.set(name, []);
      prices.get(name).push(cents);
    }
  }
  const out = [];
  for (const [name, list] of prices) {
    const freq = new Map();
    list.forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
    const cents = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    out.push({ name, cents });
  }
  return out;
}

function applyExtraCategory(data, newId) {
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const done = Array.isArray(data.settings.priceSyncsApplied) ? data.settings.priceSyncsApplied : [];
  if (done.includes(TAG)) return { applied: false, added: 0 };
  data.categories = Array.isArray(data.categories) ? data.categories : [];
  data.products = Array.isArray(data.products) ? data.products : [];

  const extras = collectExtras(data);
  const fried = data.categories.find(c => c.name === AFTER_CAT);
  let cat = data.categories.find(c => c.name === CAT_NAME);
  if (!cat) {
    cat = { id: 'cat_extra', name: CAT_NAME, active: true, sortOrder: fried && Number.isFinite(fried.sortOrder) ? fried.sortOrder + 0.5 : data.categories.length };
    data.categories.push(cat);
  }
  const takenIds = new Set(data.products.map(p => String(p.sourceId)));
  const takenNames = new Set(data.products.filter(p => p.categoryId === cat.id).map(p => p.name));
  let nextId = FIRST_ID;
  const created = [];
  for (const e of extras) {
    const name = deName(e.name);
    if (takenNames.has(name)) continue;
    while (takenIds.has(String(nextId))) nextId++;
    const id = nextId++;
    takenIds.add(String(id));
    created.push({
      id: newId(), sourceId: id, name, categoryId: cat.id, priceCents: e.cents, description: '', active: true, available: true,
      sortOrder: created.length, imageRef: null, translations: { de: null, ar: arTr(e.name), en: null }, optionGroupIds: [],
      channels: { kasse: true, customer: false },
      menuData: { id, n: name, c: CAT_NAME, cents: e.cents, p: e.cents / 100, d: '', img: null },
    });
  }
  // الكاشير بيرتّب الكاتيغوريات حسب أول ظهور بالمنتجات: نحطها مباشرة بعد آخر صنف من Fried Chicken
  const friedIds = new Set(data.categories.filter(c => c.name === AFTER_CAT).map(c => c.id));
  let at = -1;
  data.products.forEach((p, i) => { if (friedIds.has(p.categoryId)) at = i; });
  if (at < 0) data.products.push(...created); else data.products.splice(at + 1, 0, ...created);
  data.settings.priceSyncsApplied = [...done, TAG];
  return { applied: true, added: created.length };
}

function renameExtraProducts(data) {
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const done = Array.isArray(data.settings.priceSyncsApplied) ? data.settings.priceSyncsApplied : [];
  if (done.includes(RENAME_TAG)) return { applied: false, renamed: 0 };
  const cat = (data.categories || []).find(c => c.name === CAT_NAME);
  let renamed = 0;
  for (const p of data.products || []) {
    if (!cat || p.categoryId !== cat.id || !String(p.name).endsWith(AR_SUFFIX)) continue;
    const base = String(p.name).slice(0, -AR_SUFFIX.length).trim();
    p.name = deName(base);
    p.translations = { ...(p.translations || {}), ar: arTr(base) };
    if (p.menuData) p.menuData.n = p.name;
    renamed++;
  }
  data.settings.priceSyncsApplied = [...done, RENAME_TAG];
  return { applied: true, renamed };
}

module.exports = { renameExtraProducts, applyExtraCategory, doubleIngredientsOption, collectExtras, TAG, DOUBLE_PERCENT };
