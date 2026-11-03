// audit-options.mjs — تدقيق الإضافات (قراءة فقط). ما بيعدّل ولا بيحذف أي شي.
// التشغيل: node audit-options.mjs   (من مجلد المشروع، بيقرأ data/nara-admin.json)
// النتيجة: ملف options-audit.txt (أسماء وأسعار وأعداد فقط، بدون زبائن أو طلبات)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, 'data', 'nara-admin.json');
if (!fs.existsSync(file)) { console.error('ما لقيت الملف: ' + file); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const groups = data.optionGroups || [];
const catalog = data.optionCatalog || [];
const products = data.products || [];
const cats = new Map(catalog.map(c => [c.id, c]));
const eur = c => (Number(c || 0) / 100).toFixed(2) + '€';

const STOP = ['sosse', 'sauce', 'dip', 'extra', 'mit', 'ohne'];
const norm = s => {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss');
  t = t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = t.split(' ').filter(w => w && !STOP.includes(w));
  return words.join('');
};
const resolve = it => {
  const c = it.ref ? cats.get(it.ref) : null;
  const name = c ? c.name : (it.name || '?');
  const cents = it.priceMode === 'free' ? 0 : it.priceMode === 'fixed' ? Number(it.cents) || 0 : c ? Number(c.cents) || 0 : Number(it.cents) || 0;
  return { name, cents, catCents: c ? Number(c.cents) || 0 : null, mode: it.priceMode || (c ? 'catalog' : 'direct'), ref: it.ref || null };
};

const usage = new Map(groups.map(g => [g.id, 0]));
for (const p of products) for (const id of p.optionGroupIds || []) if (usage.has(id)) usage.set(id, usage.get(id) + 1);
const gName = g => (g.label || g.name || g.id) + ' [' + usage.get(g.id) + ' أصناف]';

const out = [];
const H = t => out.push('', '=== ' + t + ' ===');

H('1. الأرقام العامة');
out.push(`مجموعات: ${groups.length} | عناصر كتالوج: ${catalog.length} | أصناف: ${products.length}`);
out.push(`أصناف مربوطة بمجموعات: ${products.filter(p => (p.optionGroupIds || []).length).length}`);
const unused = groups.filter(g => !usage.get(g.id));
out.push(`مجموعات بدون أي صنف: ${unused.length}` + (unused.length ? ' → ' + unused.map(g => g.label || g.name || g.id).join(' | ') : ''));

H('2. مجموعات مكررة تماماً (نفس العناصر بنفس الأسعار)');
const sig = g => (g.items || []).map(i => { const r = resolve(i); return norm(r.name) + ':' + r.cents; }).sort().join(',');
const bySig = new Map();
for (const g of groups) { const s = sig(g); if (!bySig.has(s)) bySig.set(s, []); bySig.get(s).push(g); }
let n2 = 0;
for (const list of bySig.values()) if (list.length > 1) { n2++; out.push('• ' + list.map(gName).join('  =  ') + `  (${list[0].items.length} عنصر)`); }
if (!n2) out.push('ما في.');

H('3. مجموعات متشابهة (70% أو أكتر نفس العناصر، بس مش مطابقة)');
let n3 = 0;
const sets = groups.map(g => new Set((g.items || []).map(i => norm(resolve(i).name))));
for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
  if (sig(groups[a]) === sig(groups[b])) continue;
  const inter = [...sets[a]].filter(x => sets[b].has(x)).length, uni = new Set([...sets[a], ...sets[b]]).size;
  if (uni && inter / uni >= 0.7) {
    n3++;
    const onlyA = (groups[a].items || []).map(i => resolve(i).name).filter(x => !sets[b].has(norm(x)));
    const onlyB = (groups[b].items || []).map(i => resolve(i).name).filter(x => !sets[a].has(norm(x)));
    out.push(`• ${gName(groups[a])}  ~  ${gName(groups[b])}  (${Math.round(inter / uni * 100)}%)` +
      (onlyA.length ? `\n    فقط بالأولى: ${onlyA.join(', ')}` : '') + (onlyB.length ? `\n    فقط بالتانية: ${onlyB.join(', ')}` : ''));
  }
}
if (!n3) out.push('ما في.');

H('4. عناصر كتالوج بأسماء متقاربة (غالباً نفس الصوص)');
const byNorm = new Map();
for (const c of catalog) { const k = norm(c.name); if (!k) continue; if (!byNorm.has(k)) byNorm.set(k, []); byNorm.get(k).push(c); }
let n4 = 0;
for (const list of byNorm.values()) if (list.length > 1) { n4++; out.push('• ' + list.map(c => `"${c.name}" ${eur(c.cents)}`).join('  |  ')); }
if (!n4) out.push('ما في تطابق بعد التنظيف من (Soße/Sauce/Dip/Extra).');

H('5. نفس العنصر بأسعار مختلفة حسب المجموعة');
const priceMap = new Map();
for (const g of groups) for (const it of g.items || []) {
  const r = resolve(it); if (!it.ref) continue;
  if (!priceMap.has(it.ref)) priceMap.set(it.ref, { name: r.name, catCents: r.catCents, v: new Map() });
  const e = priceMap.get(it.ref); const k = r.cents + '|' + r.mode;
  if (!e.v.has(k)) e.v.set(k, []); e.v.get(k).push(g.label || g.name || g.id);
}
let n5 = 0;
for (const e of priceMap.values()) {
  const prices = new Set([...e.v.keys()].map(k => k.split('|')[0]));
  if (prices.size > 1) {
    n5++;
    out.push(`• ${e.name} (سعر الكتالوج ${eur(e.catCents)}):`);
    for (const [k, gl] of e.v) { const [c, m] = k.split('|'); out.push(`    ${eur(c)} [${m}] ← ${gl.length} مجموعة: ${gl.slice(0, 6).join(', ')}${gl.length > 6 ? ' …' : ''}`); }
  }
}
if (!n5) out.push('ما في.');

H('6. ملخص');
out.push(`مجموعات مكررة: ${n2} | متشابهة: ${n3} | أسماء كتالوج متقاربة: ${n4} | عناصر بأسعار متضاربة: ${n5} | مجموعات فارغة الاستخدام: ${unused.length}`);

const target = path.join(path.dirname(file), '..', 'options-audit.txt');
fs.writeFileSync(target, out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
console.log('\nانحفظ التقرير بـ: ' + path.resolve(target));
