// clean-options.mjs (v2) — ترتيب قوائم الإضافات على الهيكل المتفق عليه:
//   Ihre Extras (جوا الصنف: إضافات + كل الصوصات 0.99€)  و  Dips (علبة منفصلة: كل الصوصات 1.49€)
//   + كولا 1 لتر 3.49€ + دمج القوائم المتطابقة + كاتيغوري Extra بالكاشير 0.99€ للصوصات.
// بدون --apply: تقرير فقط، ما بيكتب شي.   مع --apply: نسخة احتياطية ثم كتابة (شغّله والنظام مطفي).
// قاعدة الأمان: لكل صنف بيقارن قائمة الإضافات قبل/بعد. ما بيصير أي حذف أو تغيير غير المتفق عليه، وإلا بيوقف وما بيكتب.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const lib = require(path.join(here, 'option-library.js'));
const APPLY = process.argv.includes('--apply');
const file = path.join(here, 'data', 'nara-admin.json');
if (!fs.existsSync(file)) { console.error('ما لقيت: ' + file); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const original = JSON.parse(JSON.stringify(data));
const clone = o => JSON.parse(JSON.stringify(o));
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const day = lib.today();
const eur = c => (c / 100).toFixed(2);

const OUT = 149, IN = 99; // برا (ديب بالعلبة) / جوا (إضافة بالصنف)
const HANDHELD = /^(beef burger|chicken burger|veggie burger|french tacos|sandwiches|hot dogs)$/i;
const products = data.products || [];
const catName = new Map((data.categories || []).map(c => [c.id, c.name]));
const catOfP = p => String(catName.get(p.categoryId) || p.categoryName || (p.menuData && p.menuData.c) || '');
const catalog = new Map((data.optionCatalog || []).map(c => [c.id, c]));
const nk = s => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').replace(/\b(mit|ohne|extra|sauce|sosse|dip)\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '');
const itemName = it => { const c = it.ref ? catalog.get(it.ref) : null; return c ? c.name : (it.name || ''); };
const itemCents = it => { const c = it.ref ? catalog.get(it.ref) : null; return lib.resolvePrice(it, c); };
const strip = (o, drop) => Array.isArray(o) ? o.map(x => strip(x, drop)) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !drop.includes(k)).map(([k, v]) => [k, strip(v, drop)])) : o;
const itemSig = it => lib.canon(strip(it, ['id']));
const itemSem = it => lib.canon([nk(itemName(it)), itemName(it), itemCents(it), strip(it, ['id', 'platformCents', 'ref', 'priceMode', 'cents', 'name', 'newName'])]);
const gSig = g => lib.canon({ ...strip({ ...g, items: undefined, id: undefined }, ['id']), items: (g.items || []).map(itemSem).sort() });
const gLabel = g => `"${g.label || g.name || g.id}"`;
const log = [];
const P = s => log.push(s);

// ---------- أ) كولا 1 لتر → 3.49€ (الأعلى) ----------
let colaN = 0;
for (const g of data.optionGroups) for (const it of g.items || []) {
  const c = it.ref ? catalog.get(it.ref) : null;
  if (c && /^Coca-Cola 1,0 l/i.test(c.name) && it.priceMode === 'fixed' && Number(it.cents) === 334) { it.cents = 349; it.deposit = null; if (it.detail) it.detail = String(it.detail).replace('3,34','3,49'); colaN++; }
}

// ---------- أ2) صوص الجبنة بقائمة صوص المنيو (Ihre Sauce): 1.49€ ← 0.99€ ----------
let cheeseN = 0;
for (const g of data.optionGroups) if (String(g.name || '').trim() === 'Ihre Sauce') for (const it of g.items || []) {
  const c = it.ref ? catalog.get(it.ref) : null;
  if (c && /cheese\s*sauce/i.test(c.name) && itemCents(it) === OUT) { it.priceMode = 'fixed'; it.cents = IN; cheeseN++; }
}

// ---------- ب) أسماء القوائم: كل ديب بالعلبة = "Dips"، وكل إضافة جوا الصنف = "Ihre Extras" ----------
const RENAMES = [
  { test: g => /^Zusätzliche Dips · kostenpflichtig$/.test(String(g.name || '').trim()), to: 'Dips' },
  { test: g => !String(g.name || '').trim() && (g.items || []).length > 5 && (g.items || []).every(it => itemCents(it) > 0), to: 'Dips' },
  { test: g => String(g.name || '').trim() === 'Extras', to: 'Ihre Extras' }
];
const renamed = [], renameSkipped = [];
// الأسماء بتنفحص كنص كامل ("..." بالضبط) وبس بالأماكن اللي مو سجل قديم. بإعدادات الأصناف بيتغيّر الاسم كمان. الطلبات والفواتير القديمة ما بتنلمس.
const HISTORY = new Set(['orders', 'receipts', 'payments', 'fiscalTransactions', 'auditEvents', 'dayClosings', 'dailySettlements', 'pendingTransfers', 'journalEntries', 'invoices', 'invoiceLines', 'documents', 'stockMovements']);
const refHits = old => { const nd = JSON.stringify(old), hits = []; for (const k of Object.keys(data)) { if (k === 'optionGroups' || k === 'optionCatalog' || k === 'products' || k === 'categories' || HISTORY.has(k)) continue; if ((JSON.stringify(data[k]) || '').includes(nd)) hits.push(k); } return hits; };
const renameInProducts = (old, nw) => {
  let n = 0;
  const fix = v => {
    if (typeof v === 'string') { if (v === old) { n++; return nw; } return v; }
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => { if (k === old) n++; return [k === old ? nw : k, fix(x)]; }));
    return v;
  };
  const walk = o => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if (k === 'optionGroupIds' || k === 'optionExclude') continue; if (/Groups?$/i.test(k)) o[k] = fix(o[k]); else walk(o[k]); } };
  for (const p of products) walk(p);
  return n;
};
for (const g of data.optionGroups) for (const r of RENAMES) if (r.test(g)) {
  const old = String(g.name || '').trim();
  const hits = old ? refHits(old) : [];
  if (hits.length) { renameSkipped.push(`${gLabel(g)} مذكورة بـ ${hits.join(', ')}`); break; }
  const n = old ? renameInProducts(old, r.to) : 0;
  g.name = r.to; if (g.label && /Zusätzliche|^Extras$/.test(g.label)) delete g.label;
  renamed.push(`${g.id}: ${old || '(بدون اسم)'} ← ${r.to}` + (n ? ` (+ ${n} إعداد بالأصناف)` : '')); break;
}
const R = clone(data); // مرجع المقارنة: الداتا بعد الكولا وتغيير الأسماء فقط

// ---------- ج) دمج القوائم المتطابقة (الترتيب داخل القائمة ما بيفرق) ----------
const seen = new Map(), remapG = new Map(), remapI = new Map(), mergedList = [];
for (const g of data.optionGroups) {
  const s = gSig(g);
  if (!seen.has(s)) { seen.set(s, g); continue; }
  const keep = seen.get(s);
  const pool = (keep.items || []).map(it => ({ it, sig: itemSem(it), used: false }));
  const m = new Map();
  for (const it of g.items || []) { const f = pool.find(x => !x.used && x.sig === itemSem(it)); f.used = true; m.set(it.id, f.it.id); }
  remapG.set(g.id, keep.id); remapI.set(g.id, m); mergedList.push({ removed: g, keep });
}
{
  const removedIds = [...remapG.keys()], elsewhere = [];
  for (const k of Object.keys(data)) { if (k === 'optionGroups' || k === 'products') continue; const t = JSON.stringify(data[k]) || ''; for (const id of removedIds) if (t.includes(id)) elsewhere.push(k + ': ' + id); }
  for (const p of products) for (const k of Object.keys(p)) { if (k === 'optionGroupIds' || k === 'optionExclude') continue; const t = JSON.stringify(p[k]) || ''; for (const id of removedIds) if (t.includes(id)) elsewhere.push('product ' + p.id + '.' + k); }
  if (elsewhere.length) { console.error('وقف: معرّفات قوائم محذوفة مذكورة بأماكن تانية:\n' + elsewhere.slice(0, 20).join('\n')); process.exit(2); }
}
for (const p of products) {
  const ids = p.optionGroupIds || [];
  if (!ids.some(id => remapG.has(id))) continue;
  const ex = new Set(p.optionExclude || []), nex = new Set(ex);
  const out = [];
  for (const id of ids) {
    const to = remapG.get(id) || id;
    if (remapG.has(id)) for (const [o, n] of remapI.get(id)) if (ex.has(o)) { nex.delete(o); nex.add(n); }
    if (!out.includes(to)) out.push(to);
  }
  p.optionGroupIds = out; if (p.optionExclude) p.optionExclude = [...nex];
}
data.optionGroups = data.optionGroups.filter(g => !remapG.has(g.id));

// فرق القوائم بنفس الاسم اللي ما اندمجت (للمراجعة)
const diffLines = [];
{
  const byName = new Map();
  for (const g of data.optionGroups) { const n = String(g.name || '').trim(); if (!n || n === 'Dips' || n === 'Ihre Extras') continue; if (!byName.has(n)) byName.set(n, []); byName.get(n).push(g); }
  const view = g => new Map((g.items || []).map(it => [nk(itemName(it)), { name: itemName(it), cents: itemCents(it) }]));
  const lim = a => a.slice(0, 6).join(', ') + (a.length > 6 ? ' …' : '');
  for (const [n, arr] of byName) if (arr.length > 1) {
    diffLines.push(`• ${n}: ${arr.length} قوائم`);
    const A = view(arr[0]);
    for (let k = 1; k < arr.length; k++) {
      const B = view(arr[k]);
      const onlyA = [...A].filter(([x]) => !B.has(x)).map(([, v]) => v.name), onlyB = [...B].filter(([x]) => !A.has(x)).map(([, v]) => v.name);
      const price = [...A].filter(([x, v]) => B.has(x) && B.get(x).cents !== v.cents).map(([x, v]) => `${v.name} ${eur(v.cents)}←${eur(B.get(x).cents)}`);
      const parts = [onlyA.length ? 'فقط بالأولى [' + lim(onlyA) + ']' : '', onlyB.length ? 'فقط بالتانية [' + lim(onlyB) + ']' : '', price.length ? 'أسعار [' + lim(price) + ']' : ''].filter(Boolean);
      if (!parts.length) {
        // نفس العناصر والأسعار: دوّر على الفرق الداخلي
        const gp = Object.keys({ ...arr[0], ...arr[k] }).filter(x => x !== 'id' && x !== 'items' && lib.canon(arr[0][x]) !== lib.canon(arr[k][x])).map(x => `${x}: ${JSON.stringify(arr[0][x])} ≠ ${JSON.stringify(arr[k][x])}`);
        const IA = new Map((arr[0].items || []).map(it => [nk(itemName(it)), it])), ip = new Set(), ex = [];
        for (const it of arr[k].items || []) { const o = IA.get(nk(itemName(it))); if (!o) continue; for (const x of new Set([...Object.keys(o), ...Object.keys(it)])) { if (['id', 'platformCents', 'ref', 'priceMode', 'cents', 'name', 'newName'].includes(x)) continue; if (lib.canon(o[x]) !== lib.canon(it[x]) && !ip.has(x)) { ip.add(x); ex.push(`${x}: ${JSON.stringify(o[x])} ≠ ${JSON.stringify(it[x])} (${itemName(it)})`); } } }
        const cnt = (arr[0].items || []).length + ' عنصر مقابل ' + (arr[k].items || []).length;
        parts.push('نفس العناصر والأسعار (' + cnt + '). فرق داخلي: ' + ([...gp.map(x => 'قائمة ' + x), ...ex.map(x => 'عنصر ' + x)].join(' ; ') || 'ما لقيت فرق ظاهر بالخصائص (ممكن ترتيب أو تكرار)'));
      }
      diffLines.push(`    ${arr[k].id} مقابل ${arr[0].id}: ` + parts.join(' | '));
    }
  }
}

// ---------- د) الهيكل: Ihre Extras (جوا) + Dips (علبة) للأصناف المحمولة ----------
const dipsGroups = data.optionGroups.filter(g => String(g.name || '').trim() === 'Dips' && (g.items || []).length > 5);
const master = dipsGroups.sort((a, b) => (b.items.length - a.items.length))[0];
const sauces = master ? (master.items || []).filter(it => it.ref && itemCents(it) > 0) : [];
const sauceKeys = new Set(sauces.map(it => nk(itemName(it))));
const sauceOut = new Map(sauces.map(it => [nk(itemName(it)), itemCents(it)])), sauceIn = new Map(sauces.map(it => [nk(itemName(it)), itemCents(it) === OUT ? IN : itemCents(it)]));
const inCents = it => { const c = itemCents(it); return c === OUT ? IN : c; };
const mkItem = (salt, it) => {
  const cat = catalog.get(it.ref), cc = Number(cat && cat.cents) || 0, ic = inCents(it);
  const mode = ic === cc ? 'catalog' : ic === 0 ? 'free' : 'fixed';
  return { id: 'oi_' + sha(salt + '|' + it.ref), ref: it.ref, priceMode: mode, platformCents: it.platformCents ?? cc, ...(mode === 'fixed' ? { cents: ic } : {}) };
};
const gById = () => new Map(data.optionGroups.map(g => [g.id, g]));
let addedItems = 0; const newGroups = [], gained = new Map(); // category -> {extras, dips}
const bump = (cat, k) => { if (!gained.has(cat)) gained.set(cat, { extras: 0, dips: 0 }); gained.get(cat)[k]++; };
if (master) {
  const gm = gById(), extrasUsed = new Set();
  let SX = null; // قائمة صوصات فقط للساندويش/الهوت دوغ (أو أي صنف ما عنده Ihre Extras)
  for (const p of products) {
    const cat = catOfP(p); if (!HANDHELD.test(cat)) continue;
    let ids = (p.optionGroupIds || []).slice();
    const gs = ids.map(id => gm.get(id));
    const ext = gs.find(g => g && String(g.name || '').trim() === 'Ihre Extras');
    if (ext) extrasUsed.add(ext.id);
    else {
      if (!SX) { SX = { id: 'og_' + sha('sauces-extras'), name: 'Ihre Extras', items: sauces.map(it => mkItem('sx', it)), createdBy: 'cleanup' }; data.optionGroups.push(SX); newGroups.push(SX); gm.set(SX.id, SX); }
      const dg = gs.find(g => g && String(g.name || '').trim() === 'Dips'), di = dg ? ids.indexOf(dg.id) : -1;
      if (di >= 0) ids.splice(di, 0, SX.id); else ids.push(SX.id);
      bump(cat, 'extras');
    }
    if (!gs.some(g => g && String(g.name || '').trim() === 'Dips')) { ids.push(master.id); bump(cat, 'dips'); }
    p.optionGroupIds = ids;
  }
  for (const id of extrasUsed) {
    const E = gm.get(id), have = new Set((E.items || []).map(it => nk(itemName(it))));
    for (const it of sauces) if (!have.has(nk(itemName(it)))) { E.items.push(mkItem(E.id, it)); addedItems++; }
  }
}

// ---------- هـ) كاتيغوري Extra بالكاشير: صوصات 1.49€ ← 0.99€ ----------
const deName = b => (/extra/i.test(b) ? b : b + ' Extra');
const sauceExtraNames = new Set(sauces.filter(it => itemCents(it) === OUT).map(it => deName(itemName(it))));
const extraCat = (data.categories || []).find(c => c.name === 'Extra');
const extraChanged = [], extraKept = [];
for (const p of products) {
  if (!extraCat || p.categoryId !== extraCat.id || Number(p.priceCents) !== OUT) continue;
  if (sauceExtraNames.has(p.name) || /cheese\s*sauce/i.test(p.name)) { p.priceCents = IN; if (p.menuData) { p.menuData.cents = IN; p.menuData.p = IN / 100; } extraChanged.push(p.name); } else extraKept.push(p.name);
}

// ---------- التحقق لكل صنف: R (قبل) مقابل النتيجة ----------
const key = o => [o.group || '', o.name, o.cents, o.unavailable ? 1 : 0].join('|');
const seqOf = l => { const s = []; for (const o of l) if (s[s.length - 1] !== (o.group || '')) s.push(o.group || ''); return s; };
const isSub = (a, b) => { let i = 0; for (const x of b) if (x === a[i]) i++; return i === a.length; };
const gname = (g) => String(g || '');
let bad = 0; const badNames = [];
for (let i = 0; i < products.length; i++) {
  const L0 = lib.compose(R.products[i], R.optionGroups, day, R.optionCatalog), L1 = lib.compose(products[i], data.optionGroups, day, data.optionCatalog);
  const cnt = new Map(); for (const o of L1) cnt.set(key(o), (cnt.get(key(o)) || 0) + 1);
  let ok = true;
  for (const o of L0) { const k = key(o); if (!(cnt.get(k) > 0)) { ok = false; break; } cnt.set(k, cnt.get(k) - 1); }
  if (ok) for (const o of L1) {
    const k = key(o); if (!(cnt.get(k) > 0)) continue; // موجود بالمرجع
    const grp = gname(o.group), kk = nk(o.name);
    if (!(sauceKeys.has(kk) && (grp === 'Dips' || grp === 'Ihre Extras'))) { ok = false; break; }
    if (o.cents !== (grp === 'Dips' ? sauceOut.get(kk) : sauceIn.get(kk))) { ok = false; break; }
    cnt.set(k, cnt.get(k) - 1);
  }
  if (ok && !isSub(seqOf(L0), seqOf(L1))) ok = false;
  if (!ok) { bad++; if (badNames.length < 6) badNames.push(products[i].name || products[i].id); }
}

// ---------- التقرير ----------
const typeOf = g => /^dips$/i.test(String(g.name || '').trim()) ? 'Dips' : /^ihre extras$/i.test(String(g.name || '').trim()) ? 'Extras' : /getr/i.test(g.name || '') ? 'مشروب' : /sauce|dip/i.test(g.name || '') ? 'صوص بالمنيو' : /dessert|donut|sahne|bestellung/i.test(g.name || '') ? 'حلوى/فرابتشينو' : 'غيرها';
const count = gs => { const m = new Map(); for (const g of gs) m.set(typeOf(g), (m.get(typeOf(g)) || 0) + 1); return [...m].map(([k, v]) => `${k}: ${v}`).join(' | '); };
console.log(`قوائم قبل: ${original.optionGroups.length}  ← بعد: ${data.optionGroups.length}`);
console.log('قبل: ' + count(original.optionGroups));
console.log('بعد: ' + count(data.optionGroups));
console.log('\n=== تغيير الأسماء ===');
console.log(renamed.length ? renamed.join('\n') : 'ما في');
if (renameSkipped.length) console.log('انتخطيت (الاسم مذكور بمكان تاني): ' + renameSkipped.join(' ; '));
console.log('\n=== دمج المتطابق (' + mergedList.length + ') ===');
for (const { removed, keep } of mergedList) console.log(`  ${removed.id} → ${keep.id}  ${gLabel(keep)} (${(keep.items || []).length} عنصر)`);
console.log('\n=== قوائم بنفس الاسم ما اندمجت: الفرق ===');
console.log(diffLines.length ? diffLines.join('\n') : 'ما في');
console.log('\n=== Ihre Extras و Dips ===');
console.log(master ? `Dips الرئيسية: ${master.id} (${master.items.length} صوص)` : '⚠️ ما لقيت قائمة Dips رئيسية، ما انضاف شي');
console.log(`صوصات انضافت لقوائم Ihre Extras الموجودة: ${addedItems}`);
console.log(`قوائم Ihre Extras جديدة (صوصات بس): ${newGroups.length}`);
for (const [c, v] of gained) console.log(`  ${c}: أصناف أخدت Extras ${v.extras} | أخدت Dips ${v.dips}`);
console.log(`\nكولا 1 لتر 3.34€+Pfand ← 3.49€ شامل (بدون Pfand منفصل): ${colaN} عنصر`);
console.log(`صوص الجبنة بقائمة صوص المنيو 1.49€ ← 0.99€: ${cheeseN} عنصر`);
console.log(`كاتيغوري Extra بالكاشير 1.49€ ← 0.99€: ${extraChanged.length}` + (extraChanged.length ? ' (' + extraChanged.join(', ') + ')' : ''));
if (extraKept.length) console.log('بقيت 1.49€ بكاتيغوري Extra (مو صوص من القائمة): ' + extraKept.join(', '));
console.log(`\nفحص ${products.length} صنف (ما انحذف أو تغيّر شي غير المتفق عليه): ` + (bad ? `❌ ${bad} فرق (${badNames.join(', ')})` : '✅'));

console.log('\n=== الخريطة بعد الترتيب: كل قائمة وين مستخدمة ===');
const usersOf = new Map();
for (const p of products) for (const id of p.optionGroupIds || []) { if (!usersOf.has(id)) usersOf.set(id, new Map()); const m = usersOf.get(id), c = catOfP(p); m.set(c, (m.get(c) || 0) + 1); }
for (const g of data.optionGroups) {
  const m = usersOf.get(g.id) || new Map();
  console.log(`• ${g.label || g.name || '(بدون اسم)'} [${typeOf(g)}] ${(g.items || []).length} عنصر ← ` + ([...m].map(([c, n]) => `${c}(${n})`).join(', ') || 'لا أحد'));
}

if (bad) { console.error('\nوقف. ما كتبت شي.'); process.exit(3); }
const changed = JSON.stringify(data) !== JSON.stringify(original);
if (!changed) { console.log('\nما في شي للتنفيذ.'); process.exit(0); }
if (!APPLY) { console.log('\n(تقرير فقط، ما انكتب شي. للتنفيذ: node clean-options.mjs --apply)'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bak = file + '.pre-options-cleanup.' + stamp + '.bak';
fs.copyFileSync(file, bak);
const tmp = file + '.tmp-' + process.pid;
fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
fs.renameSync(tmp, file);
console.log('\n✅ تم. النسخة الاحتياطية: ' + bak);
