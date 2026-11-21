// simulate-orders.mjs — محاكي طلبات واقعية لتجربة المطبخ / Live Orders / التوزيع / الشاشات.
//   node scripts/simulate-orders.mjs [عدد] [seed=N]   → بيعمل N طلب (افتراضي 40) من منيو السيرفر الحقيقي
//   node scripts/simulate-orders.mjs clear            → بيلغي كل طلبات المحاكاة (SIM-…)
// القنوات: كاشير (تدريب)، أكل بالمحل (تدريب)، موقع، Lieferando، Uber، Loco.
// كل الطلبات isTest: ما بتروح للـ TSE ولا بتدخل بالحسابات ولا بالتقفيلة. طلبات الكاشير training:true.
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NARA_BASE_URL || 'http://127.0.0.1:' + (process.env.PORT || 4185);
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DATA_DIR = process.env.NARA_DATA_DIR || path.join(HERE, '..', 'data');
const CODES = path.join(DATA_DIR, 'sim-codes.json');
const PREFIX = 'SIM';

// ── عشوائي ثابت (seed) حتى تنعاد نفس التشغيلة بالاختبار ──
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
function weighted(r, items) { const t = items.reduce((s, x) => s + x[1], 0); let v = r() * t; for (const [x, w] of items) { v -= w; if (v <= 0) return x; } return items[0][0]; }

// ── توزيع الفئات: برغر وتاكو أكتر شي ──
export const CAT_WEIGHTS = [
  ['Beef Burger', 22], ['Chicken Burger', 15], ['French Tacos', 16], ['Specials', 9], ['Korean & Fusion Wings', 5],
  ['Sandwiches', 4], ['Hot Dogs', 3], ['Falafel', 3], ['Fried Chicken', 3], ['Chicken Buckets & Deals (New)', 3], ['Crispyburger Bundels', 2],
  ['Salate', 2], ['Kindergerichte', 1], ['Veggie Burger', 2], ['Angebot', 2],
];
const SIDE_CATS = [['Alkoholfreie Getränke', 5], ['Desserts', 2], ['Dips', 3], ['Iced Tea', 1], ['Iced Coffee', 1], ['Specials', 3]];
const NOTES_DE = ['ohne Zwiebeln', 'extra scharf', 'ohne Gurken', 'ohne Tomaten', 'bitte gut durchbraten', 'Sauce extra separat', 'ohne Salat', 'ohne Käse', 'bitte in Stücke schneiden', 'nicht zu scharf', 'ohne Sauce'];
const DELIVERY_NOTES = ['Bitte klingeln, 2. Etage', 'Bitte anrufen, Klingel kaputt', 'Hinterhaus, 3. Stock', 'Bitte vorne warten', 'Hund im Garten, bitte nicht reinkommen', 'Wir sind im Büro, Eingang rechts', ''];
// منطقة التوزيع: 41747/48/49/51/41063 (Viersen, Mönchengladbach)
const STREETS = [
  ['Gereonstraße', '41747', 'Viersen', 51.2560, 6.3920], ['Hauptstraße', '41747', 'Viersen', 51.2531, 6.3889], ['Kleiststraße', '41747', 'Viersen', 51.2589, 6.3812],
  ['Rintgerstraße', '41747', 'Viersen', 51.2610, 6.3990], ['Dülkener Straße', '41747', 'Viersen', 51.2601, 6.3753], ['Hardter Straße', '41748', 'Viersen', 51.2404, 6.3770],
  ['Sittarder Straße', '41748', 'Viersen', 51.2441, 6.4012], ['Gerberstraße', '41748', 'Viersen', 51.2478, 6.3960], ['Löhstraße', '41749', 'Viersen', 51.2720, 6.4120],
  ['Süchtelner Straße', '41749', 'Viersen', 51.2695, 6.4180], ['Bahnhofstraße', '41751', 'Viersen', 51.2480, 6.3500], ['Rathausmarkt', '41751', 'Viersen', 51.2510, 6.3560],
  ['Waldniel Straße', '41063', 'Mönchengladbach', 51.2050, 6.4310], ['Hohenzollernstraße', '41063', 'Mönchengladbach', 51.1990, 6.4350],
];
const NAMES = ['Max Muster', 'Lea Schmidt', 'Paul Weber', 'Sara Yilmaz', 'Jonas Becker', 'Mia Hoffmann', 'Ali Kaya', 'Nina Wolf', 'Emre Demir', 'Julia Koch', 'Tim Richter', 'Layla Hassan', 'Felix Braun', 'Anna Krüger', 'Omar Said', 'Hanna Vogel'];

// القناة: [المفتاح، الوزن]
export const CHANNELS = [['KASSE', 18], ['DINEIN', 14], ['WEB', 20], ['LIEFERANDO', 28], ['UBER_EATS', 12], ['LOCO', 8]];

const eur = c => (c / 100).toFixed(2);
const optLine = (o, g) => ({ name: o.name, quantity: 1, ...(g ? { group: g } : {}), ...(o.cents ? { cents: o.cents } : {}) });

// ── سطر طلب من منتج ──
export function buildLine(r, p, qty = 1) {
  const dips = Array.isArray(p.dips) ? p.dips : [];
  const groups = g => dips.filter(d => d.group === g && !d.unavailable);
  const isBurger = /burger/i.test(p.c) && !/Veggie/i.test(p.c) || /Veggie Burger/i.test(p.c);
  const options = []; let unit = Number(p.cents) || 0; let name = p.n; const notes = [];
  const required = Array.isArray(p.requiredGroups) ? p.requiredGroups : [];
  const wantMenu = !!p.menuCents && chance(r, isBurger ? 0.55 : 0.3);
  if (wantMenu) {
    // منيو: +3 € (مع مشروب 0.33 وصوص)؛ السعر من menuCents
    unit = Number(p.menuCents);
    name = p.n + ' (Menü)';
    for (const g of (p.mealGroups && p.mealGroups.length ? p.mealGroups : required)) {
      const opts = groups(g); if (!opts.length) continue;
      const o = g === 'Ihr Getränk' ? (opts.filter(x => /0,33/.test(x.name) && !x.cents)[0] && pick(r, opts.filter(x => /0,33/.test(x.name) && !x.cents))) || pick(r, opts) : pick(r, opts.filter(x => !/Ohne/.test(x.name)).length ? opts.filter(x => !/Ohne/.test(x.name)) : opts);
      options.push(optLine(o, g)); unit += o.cents || 0;
    }
  } else if (!p.menuCents) {
    // صفقات/عروض فيها مجموعات مطلوبة (Dip 1، Sauce 1، Getränk…)
    for (const g of required) { const opts = groups(g); if (!opts.length) continue; const o = pick(r, opts); options.push(optLine(o, g)); unit += o.cents || 0; }
  }
  // إضافات: صوص جوا البرغر 0.99، بيكون، جبنة…
  const extras = groups('Ihre Extras');
  if (extras.length && chance(r, isBurger ? 0.35 : 0.15)) {
    const n = chance(r, 0.25) ? 2 : 1;
    const used = new Set();
    for (let i = 0; i < n; i++) { const o = pick(r, extras); if (used.has(o.id)) continue; used.add(o.id); options.push(optLine(o, 'Ihre Extras')); unit += o.cents || 0; }
  }
  // ديب 1.49 €
  const dipsOpts = groups('Dips').filter(d => d.cents >= 149);
  if (dipsOpts.length && !wantMenu && chance(r, 0.18)) { const o = pick(r, dipsOpts); options.push(optLine(o, 'Dips')); unit += o.cents || 0; }
  if (chance(r, 0.22)) notes.push(pick(r, NOTES_DE));
  return { name, category: p.c, productId: p.id, quantity: qty, unitCents: unit, totalCents: unit * qty, options, note: notes.join(', ') };
}

// ── سلة كاملة ──
export function buildCart(r, menu, { family = false, forDelivery = false } = {}) {
  const byCat = new Map(); for (const p of menu) { if (!byCat.has(p.c)) byCat.set(p.c, []); byCat.get(p.c).push(p); }
  const avail = list => list.filter(([c]) => (byCat.get(c) || []).length);
  const mains = avail(CAT_WEIGHTS), sides = avail(SIDE_CATS);
  const cart = [];
  const lines = family ? 3 + Math.floor(r() * 4) : 1 + Math.floor(r() * 3);
  for (let i = 0; i < lines; i++) {
    const cat = weighted(r, mains); const p = pick(r, byCat.get(cat));
    const qty = family ? (chance(r, 0.35) ? 2 : 1) : (chance(r, 0.12) ? 2 : 1);
    const l = buildLine(r, p, qty); const same = cart.find(x => x.productId === l.productId && x.name === l.name && !x.options.length && !l.options.length && !x.note && !l.note);
    if (same) { same.quantity += qty; same.totalCents = same.unitCents * same.quantity; } else cart.push(l);
  }
  if (sides.length && chance(r, family ? 0.8 : 0.4)) {
    const cat = weighted(r, sides); const p = pick(r, byCat.get(cat)); cart.push(buildLine(r, p, family && chance(r, 0.5) ? 2 : 1));
  }
  return cart.filter(l => l.unitCents > 0 || /Menü|Kinder/.test(l.name) || l.options.length || true);
}

export const totalOf = cart => cart.reduce((s, x) => s + x.totalCents, 0);
export const minOrderCents = 1000; // أقل طلب للتوصيل
function ensureMinimum(r, cart, menu) {
  let guard = 0;
  while (totalOf(cart) < minOrderCents && guard++ < 5) { const p = pick(r, menu.filter(x => /Burger|Taco/.test(x.c))); if (p) cart.push(buildLine(r, p, 1)); }
}

// ── طلب كامل (بدون إرسال) — بيرجع { channel, kind, order } ──
export function buildOrder(r, menu, idx, stamp, now = Date.now()) {
  const channel = weighted(r, CHANNELS);
  const family = chance(r, 0.15);
  const delivery = ['WEB', 'LIEFERANDO', 'UBER_EATS', 'LOCO'].includes(channel) ? chance(r, 0.85) : false;
  const cart = buildCart(r, menu, { family, forDelivery: delivery });
  if (delivery) ensureMinimum(r, cart, menu);
  const code = `${PREFIX}${stamp}-${String(idx + 1).padStart(3, '0')}`;
  const ago = Math.floor(r() * 25) + 1; // دقيقة
  const placed = new Date(now - ago * 60000).toISOString();
  const total = totalOf(cart);
  const name = pick(r, NAMES), phone = '+49 151 1' + String(Math.floor(r() * 9000000) + 1000000);
  const st = pick(r, STREETS), house = String(1 + Math.floor(r() * 150));
  const cash = delivery ? chance(r, 0.3) : chance(r, 0.5);
  const base = { isTest: true, cart, totalCents: total, createdAt: placed, placedAt: placed };
  if (channel === 'KASSE' || channel === 'DINEIN') {
    const dine = channel === 'DINEIN';
    return { channel, kind: 'kasse', code, family, order: {
      ...base, id: 'sim-' + code.toLowerCase(), displayCode: code, source: 'KASSE', orderType: dine ? 'DINE_IN' : 'TAKEAWAY', type: dine ? 'dinein' : 'pickup',
      ...(dine ? { table: String(1 + Math.floor(r() * 12)) } : {}), customerName: dine ? '' : (chance(r, 0.4) ? name : ''), status: 'OPEN' }, pay: chance(r, 0.6) ? { method: cash ? 'CASH' : 'CARD', amountCents: total } : null };
  }
  const dl = delivery ? { name, phone, street: st[0], house, houseNumber: house, address: st[0] + ' ' + house, postal: st[1], postalCode: st[1], city: st[2], lat: st[3] + (r() - 0.5) * 0.004, lng: st[4] + (r() - 0.5) * 0.004, notes: pick(r, DELIVERY_NOTES) } : undefined;
  const feeCents = delivery && channel === 'WEB' ? 100 : 0;
  const plat = { WEB: ['LANCH', 'WEB', 'Flamo'], LIEFERANDO: ['LIEFERANDO', 'LIEFERANDO', 'Flamo'], UBER_EATS: ['UBER_EATS', 'UBER_EATS', 'Flamo'], LOCO: ['SIDES', 'LIEFERANDO', 'Loco Chicken'] }[channel];
  return { channel, kind: 'platform', code, family, source: plat[0], order: {
    ...base, externalOrderCode: code, displayCode: code, platform: plat[1], channel: plat[1], brand: plat[2],
    type: delivery ? 'delivery' : 'pickup', orderType: delivery ? 'DELIVERY' : 'PICKUP', liveStage: 'PREPARE', kitchenStartAt: placed, prepMinutes: 15, dueAt: new Date(now - ago * 60000 + 35 * 60000).toISOString(),
    customerName: name, customerPhone: phone, ...(dl ? { delivery: dl } : {}),
    payment: { method: cash && channel === 'WEB' ? 'CASH' : 'ONLINE' }, cashDueCents: cash && channel === 'WEB' ? total + feeCents : 0,
    deliveryFeeCents: feeCents, totalCents: total + feeCents,
    ...(feeCents ? { cart: [...cart, { name: 'Liefergebühr', kind: 'DELIVERY_FEE', quantity: 1, unitCents: feeCents, totalCents: feeCents, options: [], note: '' }] } : {}) } };
}

// مفتاح المدير (للكاشير وmark-test): من البيئة أو من ملف .env بجانب المشروع
function managerKey() {
  if (process.env.NARA_MANAGER_KEY) return process.env.NARA_MANAGER_KEY;
  try { const m = fs.readFileSync(path.join(HERE, '..', '.env'), 'utf8').match(/^\s*NARA_MANAGER_KEY\s*=\s*(.+?)\s*$/m); if (m) return m[1].replace(/^["']|["']$/g, ''); } catch { /* ما في .env */ }
  return '';
}
async function api(method, url, body) {
  const key = managerKey();
  const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-nara-manager-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* ليس JSON */ }
  return { status: r.status, json: j };
}

export async function simulate(count, { seed = Date.now() % 100000, log = console.log } = {}) {
  const m = await api('GET', '/api/menu');
  if (m.status !== 200 || !m.json) throw new Error('/api/menu HTTP ' + m.status);
  const menu = m.json.products.filter(p => !p.hidden && !p.unavailable && (p.channels ? p.channels.kasse !== false : true) && !['Extra', 'Shisha'].includes(p.c) && p.cents > 0);
  if (!menu.length) throw new Error('Menü leer');
  const r = rng(seed);
  const stamp = (Math.floor(Date.now() / 1000) % 46656).toString(36).toUpperCase().padStart(3, '0');
  const made = [], stats = { total: 0, byChannel: {}, cents: 0, family: 0, failed: 0, authSkipped: 0 };
  let warned = false;
  for (let i = 0; i < count; i++) {
    const o = buildOrder(r, menu, i, stamp);
    let ok = false;
    if (o.kind === 'platform') {
      const res = await api('POST', '/api/platform-orders/import', { source: o.source, order: o.order });
      ok = res.status < 300; if (!ok) log(o.code, 'HTTP', res.status, res.json && res.json.error || '');
    } else {
      const res = await api('POST', '/api/kasse/events', { action: 'ORDER_SYNC', training: true, order: o.order, items: o.order.cart });
      ok = res.status < 300;
      if (!ok && (res.status === 401 || res.status === 403)) { stats.authSkipped++; if (!warned) { warned = true; log('⚠ Kasse/Vor-Ort-Bestellungen brauchen NARA_MANAGER_KEY (in .env oder als Umgebungsvariable). Nur Plattform-/Web-Bestellungen werden angelegt.'); } continue; }
      if (!ok) log(o.code, 'HTTP', res.status, res.json && res.json.error || '');
      if (ok && o.pay) await api('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', training: true, order: { id: o.order.id }, paymentLines: [{ method: o.pay.method, amountCents: o.pay.amountCents }] });
    }
    if (ok) { made.push({ code: o.code, id: o.order.id, kind: o.kind, source: o.source }); stats.total++; stats.byChannel[o.channel] = (stats.byChannel[o.channel] || 0) + 1; stats.cents += o.order.totalCents; if (o.family) stats.family++; } else stats.failed++;
  }
  return { made, stats };
}

export async function clearSims({ log = console.log } = {}) {
  let saved = []; try { saved = JSON.parse(fs.readFileSync(CODES, 'utf8')); } catch { /* أول مرة */ }
  // كل طلبات المحاكاة المفتوحة من ملف البيانات (إن وُجد)، وإلا من الأكواد المحفوظة
  let open = [];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nara-admin.json'), 'utf8'));
    open = (data.orders || []).filter(o => o.isTest && String(o.displayCode || o.externalOrderCode || '').startsWith(PREFIX) && !['CANCELLED', 'STORNIERT'].includes(String(o.status || '').toUpperCase()))
      .map(o => ({ code: String(o.externalOrderCode || o.displayCode), id: o.id, kind: o.externalOrderCode ? 'platform' : 'kasse', source: String(o.source || '').toUpperCase() }));
  } catch { open = saved; }
  let n = 0;
  for (const o of open) {
    let st;
    if (o.kind === 'platform') st = (await api('POST', '/api/platform-orders/import', { source: o.source, order: { externalOrderCode: o.code, liveStage: 'CANCELLED', isTest: true } })).status;
    else st = (await api('POST', '/api/orders/mark-test', { orderId: o.id, test: true })).status;
    if (st < 300) n++; else log(o.code, 'HTTP', st);
  }
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CODES, '[]'); } catch { /* مو مهم */ }
  return n;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('clear')) {
    const n = await clearSims();
    console.log(`✓ ${n} Simulations-Bestellungen storniert.`);
  } else {
    const count = Math.max(1, Math.min(300, parseInt(args.find(a => /^\d+$/.test(a)) || '40', 10)));
    const seedArg = args.find(a => /^seed=\d+$/.test(a));
    const { made, stats } = await simulate(count, seedArg ? { seed: Number(seedArg.slice(5)) } : {});
    let saved = []; try { saved = JSON.parse(fs.readFileSync(CODES, 'utf8')); } catch { /* أول مرة */ }
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CODES, JSON.stringify([...saved, ...made])); } catch (e) { console.log('(Codes nicht gespeichert: ' + e.message + ')'); }
    console.log(`✓ ${stats.total} Simulations-Bestellungen angelegt${stats.failed ? ` (${stats.failed} fehlgeschlagen)` : ''}${stats.authSkipped ? ` (${stats.authSkipped} Kasse ohne Schlüssel übersprungen)` : ''} · Summe ${eur(stats.cents)} € · Familienbestellungen ${stats.family}`);
    console.log('  Kanäle:', Object.entries(stats.byChannel).map(([k, v]) => k + ' ' + v).join(' · '));
    console.log(`  Küche: ${BASE}/kitchen.html · Live Orders: ${BASE}/live-orders.html`);
  }
}
