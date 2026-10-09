// demo-orders.mjs — طلبات وهمية لتجربة شاشة المطبخ / Live Orders / التوزيع.
//   node scripts/demo-orders.mjs        → بيعمل 10 طلبات تجربة (DEMO-…)
//   node scripts/demo-orders.mjs clear  → بيلغي كل طلبات التجربة (بتختفي من المطبخ والتوزيع)
// كل الطلبات معلّمة isTest، وما بتنحسب بالتقرير اليومي.
import fs from 'node:fs';
import path from 'node:path';
const CODES = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'data', 'demo-codes.json');
const BASE = process.env.NARA_BASE_URL || 'http://127.0.0.1:' + (process.env.PORT || 4185);
const now = Date.now(), iso = m => new Date(now + m * 60000).toISOString();
const it = (name, category, qty = 1, cents = 999, options = [], note = '') => ({ name, category, quantity: qty, unitCents: cents, totalCents: cents * qty, options: options.map(n => ({ name: n, quantity: 1 })), note });
const addr = [['Gereonstraße', '12', '41747', 'Viersen', 51.2560, 6.3920], ['Hauptstraße', '88', '41747', 'Viersen', 51.2531, 6.3889], ['Kleiststraße', '4', '41747', 'Viersen', 51.2589, 6.3812], ['Hardter Straße', '144', '41748', 'Viersen', 51.2404, 6.3770], ['Rintgerstraße', '13', '41747', 'Viersen', 51.2610, 6.3990], ['Sittarder Straße', '89', '41748', 'Viersen', 51.2441, 6.4012], ['Dülkener Straße', '20', '41747', 'Viersen', 51.2601, 6.3753], ['Gerberstraße', '28', '41748', 'Viersen', 51.2478, 6.3960]];
const names = ['Max Muster', 'Lea Schmidt', 'Paul Weber', 'Sara Yilmaz', 'Jonas Becker', 'Mia Hoffmann', 'Ali Kaya', 'Nina Wolf'];
const ORDERS = [
  ['LIEFERANDO', -2, [it('Joppie Beef burger', 'Beef Burger', 2, 849, ['Cheddar extra'], 'ohne Gurke'), it('Crunchy Fries', 'Beilagen')], 'Bitte klingeln, 2. Etage'],
  ['LIEFERANDO', -5, [it("Crunchy Chik'n Burger", 'Chicken Burger', 1, 1149, ['Menü', 'Coca-Cola Zero 0,33l'], 'OHNE KÄSE'), it('Chili-Scharf Sauce', 'Dips', 1, 99)], ''],
  ['UBER_EATS', -7, [it('Wings 16 Stück', 'Korean & Fusion Wings', 1, 1299), it('Cheese Burger', 'Beef Burger', 3, 799)], ''],
  ['LIEFERANDO', -9, [it("Chick'n Loaded Fries", 'Specials', 1, 899), it('Buffalo Chicken Wings (6 Stück, sehr scharf)', 'Specials', 1, 699)], 'Hund im Garten, bitte vorne warten'],
  ['NARA', -11, [it('Smashed Beef Burger', 'Beef Burger', 2, 899, ['Bacon'], 'medium'), it('Coca-Cola 0,33l', 'Getränke', 2, 250)], ''],
  ['UBER_EATS', -13, [it('Guacamole Beef Burger', 'Beef Burger', 1, 999), it('Crunchy Fries', 'Beilagen', 2, 399)], ''],
  ['LIEFERANDO', -15, [it('XXXL Beef Burger', 'Beef Burger', 1, 1599, ['Jalapeños']), it('Original Hamburger', 'Beef Burger', 1, 649)], 'Allergie: Sesam!'],
  ['LIEFERANDO', -18, [it('Joppie Chicken Taco', 'French Tacos', 2, 899)], ''],
  ['SIDES', -4, [it('All in One Combo', 'Menü', 1, 2497, ['Big Cheese Burger', 'Regular Filets (7x)'])], ''],
  ['LIEFERANDO', -1, [it('BBQ Burger', 'Beef Burger', 1, 949), it('Fanta 0,33l', 'Getränke', 1, 250)], ''],
];
async function post(body) {
  const r = await fetch(BASE + '/api/platform-orders/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.status;
}
const clear = process.argv.includes('clear');
let saved = [];
try { saved = JSON.parse(fs.readFileSync(CODES, 'utf8')); } catch { /* أول مرة */ }
// كل تشغيلة إلها أكواد جديدة (D + الساعة + رقم)، لأن الطلب الملغي ما بيرجع ينفتح بنفس الكود
const stamp = (Math.floor(Date.now() / 1000) % 46656).toString(36).toUpperCase().padStart(3, '0');
// "clear": كل طلبات التجربة المفتوحة (isTest) من ملف البيانات، مو بس آخر تشغيلة
let openTests = [];
if (clear) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(path.dirname(CODES), 'nara-admin.json'), 'utf8'));
    openTests = (data.orders || []).filter(o => o.isTest && !['CANCELLED', 'STORNIERT'].includes(String(o.status || '').toUpperCase()))
      .map(o => ({ code: String(o.externalOrderCode), source: String(o.source || '').toUpperCase() }));
  } catch { /* بنستعمل الأكواد المحفوظة */ }
}
const list = clear ? (openTests.length ? openTests.map(x => x.code) : saved) : ORDERS.map((_, i) => 'D' + stamp + '-' + String(i + 1).padStart(2, '0'));
let n = 0;
for (const [i, code] of list.entries()) {
  const [src, ago, cart, remarks] = ORDERS[i % ORDERS.length];
  const source = (clear && openTests[i] && openTests[i].source) || (src === 'NARA' ? 'LANCH' : src);
  const a = addr[i % addr.length], name = names[i % names.length];
  const total = cart.reduce((s, x) => s + x.totalCents, 0);
  const order = clear ? { externalOrderCode: code, liveStage: 'CANCELLED', isTest: true } : {
    externalOrderCode: code, displayCode: code, isTest: true,
    platform: src === 'NARA' ? 'NARA' : src, channel: src === 'SIDES' ? 'LIEFERANDO' : undefined,
    brand: src === 'SIDES' ? 'Loco Chicken' : 'NARA', type: 'delivery', orderType: 'DELIVERY', liveStage: 'PREPARE',
    placedAt: iso(ago), createdAt: iso(ago), kitchenStartAt: iso(ago), prepMinutes: 15, dueAt: iso(ago + 40),
    customerName: name, customerPhone: '+49 151 0000' + String(i).padStart(3, '0'),
    delivery: { name, phone: '+49 151 0000' + String(i).padStart(3, '0'), street: a[0], house: a[1], houseNumber: a[1], address: a[0] + ' ' + a[1], postal: a[2], postalCode: a[2], city: a[3], lat: a[4], lng: a[5], notes: remarks },
    payment: { method: i % 3 === 0 ? 'CASH' : 'ONLINE' }, cashDueCents: i % 3 === 0 ? total : 0, totalCents: total, cart,
  };
  const st = await post({ source, order });
  if (st < 300) n++; else console.log(code, 'HTTP', st);
}
try { fs.writeFileSync(CODES, JSON.stringify(clear ? [] : [...saved, ...list])); } catch (e) { console.log('(Codes nicht gespeichert: ' + e.message + ')'); }
console.log(clear ? `✓ ${n} Demo-Bestellungen storniert.` : `✓ ${n} Demo-Bestellungen angelegt (${list[0]} …). Küche: http://localhost:${process.env.PORT || 4185}/kitchen.html`);
