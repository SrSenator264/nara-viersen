// audit-groups.mjs — لكل مجموعة إضافات: أي كاتيغوريات/أصناف بتستخدمها وبأي أسعار. قراءة فقط.
// التشغيل: node audit-groups.mjs   (من مجلد المشروع) — النتيجة: options-groups.txt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, 'data', 'nara-admin.json');
if (!fs.existsSync(file)) { console.error('ما لقيت الملف: ' + file); process.exit(1); }
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const eur = c => (Number(c || 0) / 100).toFixed(2);
const cats = new Map((d.optionCatalog || []).map(c => [c.id, c]));
const catName = new Map((d.categories || []).map(c => [c.id, c.name]));
const price = it => { const c = it.ref ? cats.get(it.ref) : null; return it.priceMode === 'free' ? 0 : it.priceMode === 'fixed' ? Number(it.cents) || 0 : c ? Number(c.cents) || 0 : Number(it.cents) || 0; };
const nameOf = it => (it.ref && cats.get(it.ref) ? cats.get(it.ref).name : it.name || '?');

const out = [];
out.push('=== الكاتيغوريات وعدد الأصناف ===');
const cc = new Map();
for (const p of d.products || []) { const n = catName.get(p.categoryId) || p.categoryName || p.menuData?.c || '?'; cc.set(n, (cc.get(n) || 0) + 1); }
out.push([...cc].map(([n, k]) => `${n} (${k})`).join(' | '));

out.push('', '=== كل مجموعة ===');
for (const g of d.optionGroups || []) {
  const users = (d.products || []).filter(p => (p.optionGroupIds || []).includes(g.id));
  const byCat = new Map();
  for (const p of users) { const n = catName.get(p.categoryId) || p.categoryName || p.menuData?.c || '?'; byCat.set(n, (byCat.get(n) || 0) + 1); }
  const items = g.items || [];
  const paid = items.filter(i => price(i) > 0);
  const prices = new Map();
  for (const i of paid) { const k = eur(price(i)); prices.set(k, (prices.get(k) || 0) + 1); }
  out.push('', `[${g.id}] "${g.label || g.name || ''}"  اسم داخلي: "${g.name || ''}"  | عناصر: ${items.length} | مدفوعة: ${paid.length}`);
  out.push(`  كاتيغوريات: ${[...byCat].map(([n, k]) => `${n}(${k})`).join(', ') || 'لا أحد'}`);
  out.push(`  أصناف (أول 4): ${users.slice(0, 4).map(p => p.name || p.menuData?.n).join(', ')}${users.length > 4 ? ' …' : ''}`);
  out.push(`  أسعار المدفوع: ${[...prices].map(([p, k]) => `${p}€×${k}`).join(', ') || '—'}`);
  out.push(`  عناصر: ${items.slice(0, 6).map(i => nameOf(i) + ' ' + eur(price(i))).join(' | ')}${items.length > 6 ? ' …' : ''}`);
}
const target = path.join(path.dirname(file), '..', 'options-groups.txt');
fs.writeFileSync(target, out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
console.log('\nانحفظ بـ: ' + path.resolve(target));
