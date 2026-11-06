'use strict';
// الضريبة على المنيو الحقيقي: كل صنف بتصنيف مشروبات = 19% (إلا الفرابيه بالتوصيل/الاستلام = 7%)، والأكل = 7%.
// السلة بالكاشير فيها id متل "<sourceId>-<وقت>" بينما المنتج محفوظ "menu_<sourceId>" — لازم ينلاقى المنتج مش يرجع للاسم.
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const DC = require('../day-closing.js');

function loadCatalog() {
  const s = {}; vm.createContext(s);
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8') + ';globalThis.__c=catalog;', s);
  vm.runInContext(fs.readFileSync(path.join(root, 'menu-source.js'), 'utf8') + ';globalThis.__c=catalog;', s);
  return s.__c.filter(p => !p.hidden);
}
// نفس شكل البيانات اللي بيعمله server.js (readAdminDataRaw) أول مرة
function adminFrom(src) {
  const categories = [...new Map(src.filter(p => p.c).map((p, i) => [p.c, { id: 'cat_' + i, name: p.c }])).values()];
  const products = src.map(p => ({ id: 'menu_' + p.id, sourceId: p.id, name: p.n, categoryId: (categories.find(c => c.name === p.c) || {}).id || null, priceCents: p.cents, description: p.d || '', menuData: p }));
  return { categories, products, settings: {} };
}
const DRINK_CAT = /getr(ä|ae)nk|drink|frapp|coffee|kaffee|\btea\b|\btee\b/i;
const cartItem = p => ({ id: p.id + '-1762440000000', name: p.n, unitCents: p.cents, quantity: 1 });

test('كل مشروبات المنيو 19% جوّا المحل (Mezzo Mix, Krombacher, Moloko …)', () => {
  const src = loadCatalog(), data = adminFrom(src), { rateOf, splitOf } = DC.rateResolver(data);
  const drinks = src.filter(p => DRINK_CAT.test(String(p.c || '')));
  assert.ok(drinks.length > 20, 'المنيو فيه مشروبات');
  const wrong = drinks.filter(p => { const it = cartItem(p); return !splitOf(it) && rateOf(it, { type: 'local' }) !== 19; }).map(p => p.n + ' [' + p.c + ']');
  assert.equal(wrong.join(' | '), '');
});

test('الفرابيه بالتوصيل والاستلام 7%، وباقي المشروبات 19%', () => {
  const src = loadCatalog(), data = adminFrom(src), { rateOf } = DC.rateResolver(data);
  const frappe = src.find(p => /frapp/i.test(String(p.c || '')));
  assert.ok(frappe, 'في فرابيه بالمنيو');
  assert.equal(rateOf(cartItem(frappe), { type: 'delivery' }), 7);
  assert.equal(rateOf(cartItem(frappe), { type: 'pickup' }), 7);
  assert.equal(rateOf(cartItem(frappe), { type: 'local' }), 19);
  const mezzo = src.find(p => /mezzo mix/i.test(p.n));
  if (mezzo) assert.equal(rateOf(cartItem(mezzo), { type: 'delivery' }), 19);
});

test('الأكل بالمنيو ما بيطلع 19% (إلا أصناف المنيو اللي فيها مشروب)', () => {
  const src = loadCatalog(), data = adminFrom(src), { rateOf, splitOf } = DC.rateResolver(data);
  const food = src.filter(p => !DRINK_CAT.test(String(p.c || '')));
  const wrong = food.filter(p => { const it = cartItem(p); return !splitOf(it) && rateOf(it, { type: 'local' }) !== 7; }).map(p => p.n + ' [' + p.c + ']');
  assert.equal(wrong.join(' | '), '');
});

test('التقفيلة: Mezzo Mix بيطلع 19% مش 7%', () => {
  const src = loadCatalog(), base = adminFrom(src), mezzo = src.find(p => /mezzo mix/i.test(p.n));
  assert.ok(mezzo);
  const at = '2026-10-31T12:00:00.000Z', cart = [cartItem(mezzo)];
  const d = { ...base, orders: [{ id: 'o1', status: 'COMPLETED', type: 'local', createdAt: at, cart }], payments: [{ id: 'p1', orderId: 'o1', method: 'CASH', paymentLines: [{ method: 'CASH', amountCents: mezzo.cents }], amountCents: mezzo.cents, status: 'COMPLETED', createdAt: at }], receipts: [], fiscalTransactions: [], auditEvents: [], cashbooks: [], dayClosings: [] };
  const r = DC.build(d, '2026-10-31');
  assert.deepEqual(r.vat.rows.map(x => x.rate), [19]);
});

test('stampVat: السيرفر بيثبّت النسبة وبيتجاهل vatRate جاي من المتصفح؛ أصناف المنيو المختلطة بتضل بدون نسبة وحدة', () => {
  const data = { products: [{ id: 'menu_1', sourceId: 1, name: 'Cola', category: 'Getränke' }, { id: 'menu_2', sourceId: 2, name: 'Burger', category: 'Burger' }], categories: [], settings: {} };
  const order = { type: 'local', cart: [{ id: '1-1762440000000', name: 'Cola', unitCents: 300, quantity: 1, vatRate: 7 }, { id: '2-1762440000000', name: 'Burger', unitCents: 900, quantity: 1 }, { id: 'tip', name: 'Trinkgeld', kind: 'TIP', unitCents: 100, quantity: 1, vatRate: 0 }] };
  DC.stampVat(data, order);
  assert.equal(order.cart[0].vatRate, 19);
  assert.equal(order.cart[1].vatRate, 7);
  assert.equal(order.cart[2].vatRate, undefined);
  const real = loadCatalog(), admin = adminFrom(real), { splitOf } = DC.rateResolver(admin);
  const menu = real.find(p => splitOf(cartItem(p)));
  if (menu) { const o = { type: 'local', cart: [{ ...cartItem(menu), vatRate: 7 }] }; DC.stampVat(admin, o); assert.equal(o.cart[0].vatRate, undefined); }
});
