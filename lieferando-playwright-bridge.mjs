// lieferando-playwright-bridge.mjs  (النسخة الكاملة)
// يقرأ /api/orders من Lieferando Live Orders عبر Playwright، يطبّع كل الحقول،
// يتحقق من المجاميع، يرسل للسيرفر مع طابور احتياطي، ويبني الفاتورة (ويطبعها اختيارياً).
//
// التشغيل:   node lieferando-playwright-bridge.mjs
// اختبار:    node lieferando-playwright-bridge.mjs --selftest   (بدون متصفح)
//
// متغيرات البيئة (كلها اختيارية):
//   NARA_BASE_URL, NARA_TOKEN, NARA_PLAYWRIGHT_PROFILE, NARA_DATA_DIR, NARA_REFRESH_MS
//   NARA_MONEY_UNIT=auto|euro|cents      NARA_DURATION_UNIT=auto|min|sec
//   NARA_RECEIPT_LANG=en|de  NARA_RECEIPT_WIDTH=42  NARA_RECEIPT_HEADER="..."
//   NARA_PRINTER_HOST=192.168.x.x  NARA_PRINTER_PORT=9100  NARA_PRINTER_CODEPAGE=19
//   NARA_LOAD_MIN=5  NARA_SAFETY_MIN=5   NARA_DEBUG_WS=1

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderLines, toText, toEscPos, printTcp } from './nara-receipt.mjs';

const env = (k, d) => process.env[k] ?? d;
const CFG = {
  base: env('NARA_BASE_URL', 'http://localhost:4174').replace(/\/$/, ''),
  token: env('NARA_TOKEN', ''),
  profile: env('NARA_PLAYWRIGHT_PROFILE', 'D:/NARA-Playwright/pw-profile'),
  dataDir: env('NARA_DATA_DIR', 'D:/NARA-Playwright/data'),
  // WebSocket هو المصدر الأساسي؛ إعادة التحميل مجرد احتياط كل دقيقتين.
  refreshMs: Number(env('NARA_REFRESH_MS', '120000')),
  unit: env('NARA_MONEY_UNIT', 'auto'),
  durUnit: env('NARA_DURATION_UNIT', 'auto'),
  lang: env('NARA_RECEIPT_LANG', 'en'),
  width: Number(env('NARA_RECEIPT_WIDTH', '42')),
  header: env('NARA_RECEIPT_HEADER', ''),
  printerHost: env('NARA_PRINTER_HOST', ''),
  printerPort: Number(env('NARA_PRINTER_PORT', '9100')),
  codepage: Number(env('NARA_PRINTER_CODEPAGE', '19')),
  loadMin: Number(env('NARA_LOAD_MIN', '5')),
  safetyMin: Number(env('NARA_SAFETY_MIN', '5')),
  rawKeepDays: Number(env('NARA_RAW_KEEP_DAYS', '30')),
  debugWs: !!env('NARA_DEBUG_WS', ''),
};

// ───────────── أدوات عامة ─────────────
const log = (...a) => console.log('[NARA]', ...a);
const warned = new Set();
const warnOnce = (key, ...a) => { if (warned.has(key)) return; warned.add(key); console.warn('[NARA] WARN', ...a); };
const S = v => String(v ?? '').trim();
const first = (...v) => v.find(x => x !== undefined && x !== null && S(x) !== '') ?? '';

// يبحث بعمق عن أول مفتاح يطابق التعبير، ويرجع قيمته إذا كانت نصاً أو رقماً
function deepFind(o, re, opt = {}, d = 0) {
  const { skip = [], maxDepth = 5 } = opt;
  if (!o || typeof o !== 'object' || d > maxDepth) return '';
  if (Array.isArray(o)) {
    for (const e of o) { const r = deepFind(e, re, opt, d + 1); if (r !== '') return r; }
    return '';
  }
  for (const [k, v] of Object.entries(o)) {
    if (skip.includes(k)) continue;
    if (re.test(k) && (typeof v === 'string' || typeof v === 'number') && S(v) !== '') return v;
  }
  for (const [k, v] of Object.entries(o)) {
    if (skip.includes(k)) continue;
    const r = deepFind(v, re, opt, d + 1);
    if (r !== '') return r;
  }
  return '';
}

// ───────────── المال والوقت ─────────────
let lockedUnit = (CFG.unit === 'euro' || CFG.unit === 'cents') ? CFG.unit : null;
function pickUnit(x) {
  if (lockedUnit) return lockedUnit;
  const nums = [x.subtotal, x.customer_total, x.restaurant_total, x.delivery_fee, x.service_fee, x.small_order_fee,
    ...(x.products || []).flatMap(p => [p.amount, p.total_amount])]
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => Number(String(v).replace(',', '.'))).filter(Number.isFinite);
  const total = Number(String(x.customer_total ?? x.restaurant_total ?? 0).replace(',', '.')) || 0;
  if (nums.some(n => !Number.isInteger(n))) { lockedUnit = 'euro'; log('money unit detected: euro'); return 'euro'; }
  if (nums.length && total >= 500) { lockedUnit = 'cents'; log('money unit detected: cents'); return 'cents'; }
  warnOnce('unit', 'money unit not certain yet (all values are integers). Set NARA_MONEY_UNIT=euro or cents.');
  return total >= 100 ? 'cents' : 'euro';
}
const toCents = (v, unit) => {
  const n = Number(String(v ?? 0).replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return unit === 'euro' ? Math.round(n * 100) : Math.round(n);
};
function minutes(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    const m = v.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (m) return (+m[1] || 0) * 60 + (+m[2] || 0) + (+m[3] || 0) / 60;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (CFG.durUnit === 'sec') return n / 60;
  if (CFG.durUnit === 'min') return n;
  return n > 240 ? n / 60 : n; // auto: قيمة كبيرة = ثواني
}
function iso(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : v;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const addMin = (isoStr, m) => (isoStr && m !== null && Number.isFinite(m)) ? new Date(new Date(isoStr).getTime() + m * 60000).toISOString() : null;

// ───────────── الحالات ─────────────
const STAGES = [
  ['PREPARE', /^(kitchen|new|accepted|confirmed|preparing|in_preparation|placed|received)$/],
  ['HANDOVER', /^(ready|ready_for_pickup|handover|hand_over|waiting_for_courier|in_delivery|picked_up|on_the_way|dispatched)$/],
  ['DONE', /^(delivered|completed|done|collected|finished)$/],
  ['CANCELLED', /^(cancelled|canceled|rejected|refunded|failed|declined)$/],
];
function mapStatus(raw) {
  const s = S(raw).toLowerCase();
  for (const [stage, re] of STAGES) if (re.test(s)) return { stage, known: true, raw: s };
  warnOnce('status:' + s, `unknown status "${s}" → treated as PREPARE and flagged CHECK`);
  return { stage: 'PREPARE', known: false, raw: s };
}

// ───────────── الأصناف ─────────────
function flattenSpecs(s, c, out = [], depth = 0) {
  if (!s || depth > 5) return out;
  if (typeof s === 'string') { if (S(s)) out.push({ name: S(s), quantity: 1, totalCents: 0 }); return out; }
  if (Array.isArray(s)) { for (const e of s) flattenSpecs(e, c, out, depth + 1); return out; }
  if (typeof s !== 'object') return out;
  const children = ['options', 'items', 'values', 'specifications', 'children'].map(k => s[k]).find(a => Array.isArray(a) && a.length);
  const name = S(first(s.name, s.title, s.label, s.value));
  const qty = Number(first(s.quantity, 1)) || 1;
  if (name && !children) {
    const total = s.total_amount != null ? c(s.total_amount) : (s.amount != null ? c(s.amount) * qty : 0);
    out.push({ name, quantity: qty, totalCents: total });
  }
  if (children) flattenSpecs(children, c, out, depth + 1);
  else if (!name) for (const v of Object.values(s)) if (v && typeof v === 'object') flattenSpecs(v, c, out, depth + 1);
  return out;
}
function mapProduct(p, c) {
  const qty = Number(first(p.quantity, 1)) || 1;
  const total = p.total_amount != null ? c(p.total_amount) : c(p.amount) * qty;
  return {
    id: S(first(p.id, p.code)),
    name: S(first(p.name, p.title, 'Artikel')),
    category: S(p.category_name),
    quantity: qty,
    unitCents: Math.round(total / qty),
    totalCents: total,
    notes: S(p.remarks),
    options: flattenSpecs(p.specifications, c),
  };
}

// ───────────── تطبيع الطلب الكامل ─────────────
function normalize(x, st) {
  const unit = pickUnit(x);
  const c = v => toCents(v, unit);
  const warnings = [];

  const cart = (Array.isArray(x.products) ? x.products : []).map(p => mapProduct(p, c));
  const itemsSum = cart.reduce((s, p) => s + p.totalCents, 0);
  const optSum = cart.reduce((s, p) => s + p.options.reduce((a, o) => a + o.totalCents, 0), 0);
  const subtotalCents = x.subtotal != null ? c(x.subtotal) : itemsSum;
  const fees = { delivery: c(x.delivery_fee), service: c(x.service_fee), small: c(x.small_order_fee) };
  const discountsCents = Math.abs(c(x.discounts_total));
  const stampCents = Math.abs(c(x.stampcards_total));
  const customerTotal = x.customer_total != null ? c(x.customer_total) : null;
  const restaurantTotal = x.restaurant_total != null ? c(x.restaurant_total) : null;
  const expected = subtotalCents + fees.delivery + fees.service + fees.small - discountsCents - stampCents;
  const totalCents = customerTotal ?? restaurantTotal ?? expected;

  // تحقق المجاميع
  if (![itemsSum, itemsSum + optSum].some(v => Math.abs(v - subtotalCents) <= 1))
    warnings.push(`items ${itemsSum} != subtotal ${subtotalCents}`);
  if (customerTotal != null && Math.abs(expected - customerTotal) > 1)
    warnings.push(`expected total ${expected} != customer_total ${customerTotal}`);
  if (!cart.length) warnings.push('no products');
  if (x.has_failure_alert) warnings.push('platform failure alert');

  // الزبون والعنوان (بحث مرن لأن أسماء الحقول الداخلية غير معروفة بعد)
  const pools = [x.customer, x.delivery_address, x.address, x.delivery].filter(v => v && typeof v === 'object');
  const df = re => { for (const p of pools) { const r = deepFind(p, re); if (r !== '') return r; } return ''; };
  const nameFull = df(/^(full_?name|customer_?name|name)$/i);
  const nameJoined = [df(/^first_?name$/i), df(/^last_?name$/i)].filter(Boolean).join(' ');
  const customerName = S(first(nameFull, nameJoined));
  const customerPhone = S(first(df(/phone|mobile|tel/i)));
  let street = S(df(/^(street|street_?name|address_?line_?1|line_?1)$/i));
  const houseNumber = S(df(/house_?(number|no|nr)|^number$|street_?number/i));
  const formatted = S(df(/formatted|full_?address|address_?line|^address$/i));
  if (!street && formatted) street = formatted;
  if (street && houseNumber && !street.includes(houseNumber)) street = `${street} ${houseNumber}`;
  const postalCode = S(df(/postal|zip|postcode/i));
  const city = S(df(/^city$|town|locality/i));
  const floor = S(df(/floor|apartment|flat|suite/i));
  const dnotes = S(df(/note|instruction|comment|remark|delivery_?info/i));
  const lat = Number(df(/^lat(itude)?$/i)) || null;
  const lng = Number(df(/^(lng|lon|long|longitude)$/i)) || null;
  const verificationCode = S(deepFind(x, /verif/i, { skip: ['products'] }));
  if (!street) warnings.push('no street found');
  if (!customerPhone) warnings.push('no phone found');

  // الدفع
  const pay = (x.payment && typeof x.payment === 'object') ? x.payment : {};
  const payRaw = S(first(x.payment_type, pay.type, pay.method, pay.payment_method, deepFind(pay, /type|method/i))).toLowerCase();
  let method = 'UNKNOWN';
  if (/cash|bar|offline|cod|on_delivery/.test(payRaw)) method = 'CASH';
  else if (/online|card|paypal|ideal|klarna|apple|google|prepaid|paid|credit/.test(payRaw)) method = 'ONLINE';
  else warnOnce('pay:' + payRaw, `unknown payment_type "${payRaw}"`);
  if (method === 'UNKNOWN') warnings.push(`payment unknown "${payRaw}"`);

  // الأوقات
  const placedAt = iso(first(x.placed_date, x.created_at));
  const confirmedAt = iso(x.confirmed_at);
  const requestedAt = iso(x.requested_time);
  const prepMinutes = minutes(x.food_preparation_duration);
  const driveMinutes = minutes(x.delivery_time_duration);
  const etaAt = iso(first(x.restaurant_estimated_delivery_time, x.delivery_service_delivery_time))
    || addMin(confirmedAt || placedAt, (prepMinutes || 0) + (driveMinutes || 0)) || null;
  const dueAt = requestedAt || etaAt;
  // وقت بدء المطبخ = التسليم - التوصيل - التحميل - التحضير - هامش الأمان
  const kitchenStartAt = requestedAt
    ? addMin(requestedAt, -((driveMinutes || 0) + CFG.loadMin + (prepMinutes || 0) + CFG.safetyMin))
    : (confirmedAt || placedAt);

  const courier = Array.isArray(x.couriers) && x.couriers[0] ? x.couriers[0] : null;
  const o = {
    externalOrderCode: String(x.id),               // نفس المفتاح السابق (الرقم الداخلي) لتفادي التكرار
    displayCode: S(x.public_reference) || String(x.id),
    platform: 'LIEFERANDO',
    ingestMethod: 'PLAYWRIGHT_NETWORK_JSON',
    liveStage: st.stage,
    status: st.stage === 'CANCELLED' ? 'CANCELLED' : st.stage === 'DONE' ? 'DONE' : 'OPEN',
    platformStatus: st.raw,
    orderType: /pick|collect|abhol/i.test(S(x.delivery_type)) ? 'PICKUP' : 'DELIVERY',
    customerName, customerPhone, verificationCode,
    delivery: { address: street, street, houseNumber, house: houseNumber, postalCode, postal: postalCode, city, floor, notes: dnotes, lat, lng, name: customerName, phone: customerPhone },
    payment: { method, paid: method === 'ONLINE', raw: payRaw },
    paymentMethod: method,
    externalPaymentStatus: method === 'ONLINE' ? 'PAID_ON_PLATFORM' : 'UNKNOWN',
    externalTotalCents: totalCents,
    type: /pick|collect|abhol/i.test(S(x.delivery_type)) ? 'pickup' : 'delivery',
    acceptedAt: confirmedAt || placedAt,
    cashDueCents: method === 'CASH' ? totalCents : 0,
    cart, subtotalCents, fees, discountsCents, stampCents, totalCents,
    asap: !requestedAt,
    placedAt, confirmedAt, requestedAt, etaAt, dueAt, prepMinutes, driveMinutes, kitchenStartAt,
    readyForKitchen: x.is_ready_for_kitchen === undefined ? null : !!x.is_ready_for_kitchen,
    withAlcohol: !!x.with_alcohol,
    remarks: S(x.remarks),
    courierName: courier ? S(deepFind(courier, /name/i)) : '',
    parseStatus: (warnings.length || !st.known) ? 'CHECK' : 'OK',
    warnings,
    sourceUpdatedAt: iso(first(x.updated_at, x.confirmed_at, x.created_at)) || new Date().toISOString(),
  };
  o.rawText = JSON.stringify({ version: 'prices-v3', externalOrderCode: o.externalOrderCode, stage: o.liveStage, cart: o.cart, totalCents: o.totalCents });
  return o;
}

const buildReceipt = o => {
  const lines = renderLines(o, { width: CFG.width, lang: CFG.lang, header: CFG.header || undefined });
  return { lines, text: toText(lines, CFG.width) };
};

// ───────────── التخزين المحلي (حالة، طابور، خام) ─────────────
let state = { sent: {}, printed: {} };
const P = f => path.join(CFG.dataDir, f);
function initStorage() {
  fs.mkdirSync(P('raw'), { recursive: true });
  try { state = JSON.parse(fs.readFileSync(P('state.json'), 'utf8')); } catch { /* أول تشغيل */ }
  state.sent ??= {}; state.printed ??= {};
  const cutoff = Date.now() - CFG.rawKeepDays * 86400000;
  for (const f of fs.readdirSync(P('raw'))) {
    try { const fp = P('raw/' + f); if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp); } catch { /* تجاهل */ }
  }
}
function saveState() {
  for (const k of ['sent', 'printed']) {
    const keys = Object.keys(state[k]);
    if (keys.length > 3000) for (const old of keys.slice(0, keys.length - 3000)) delete state[k][old];
  }
  try { fs.writeFileSync(P('state.json.tmp'), JSON.stringify(state)); fs.renameSync(P('state.json.tmp'), P('state.json')); }
  catch (e) { warnOnce('state', 'state save failed: ' + e.message); }
}

// ───────────── الإرسال للسيرفر ─────────────
async function tryPost(pathname, body, { quiet = false } = {}) {
  try {
    const r = await fetch(CFG.base + pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(CFG.token ? { authorization: `Bearer ${CFG.token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok || r.status === 409) return 'ok';
    const txt = (await r.text().catch(() => '')).slice(0, 160);
    if (quiet && r.status === 404) { warnOnce('404' + pathname, `${pathname} not found on server (add it to get status alerts)`); return 'drop'; }
    if ([401, 403, 408, 429].includes(r.status) || r.status >= 500) { warnOnce('post' + r.status + pathname, `server ${r.status} on ${pathname} ${txt}`); return 'retry'; }
    console.error(`[NARA] rejected ${r.status} ${pathname}: ${txt}`);
    fs.appendFileSync(P('rejected.jsonl'), JSON.stringify({ at: new Date().toISOString(), status: r.status, txt, body }) + '\n');
    return 'drop';
  } catch (e) {
    warnOnce('net:' + pathname, `server unreachable (${e.message}) - queueing locally`);
    return 'retry';
  }
}
async function flushOutbox() {
  const f = P('outbox.jsonl');
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  let i = 0;
  for (; i < lines.length; i++) {
    let body; try { body = JSON.parse(lines[i]); } catch { continue; }
    if (await tryPost('/api/platform-orders/import', body) === 'retry') break;
  }
  const rest = lines.slice(i);
  if (rest.length) fs.writeFileSync(f, rest.join('\n') + '\n'); else fs.unlinkSync(f);
  if (i > 0) log(`outbox: flushed ${i}, pending ${rest.length}`);
}

// ───────────── الطباعة ─────────────
async function maybePrint(o, lines) {
  if (!CFG.printerHost) return;
  if (o.liveStage !== 'PREPARE' || o.readyForKitchen === false) return;
  if (state.printed[o.externalOrderCode]) return;
  try {
    await printTcp(CFG.printerHost, CFG.printerPort, toEscPos(lines, { codepage: CFG.codepage }));
    state.printed[o.externalOrderCode] = Date.now(); saveState();
    log(`printed ${o.displayCode}`);
  } catch (e) {
    console.error(`[NARA] print failed for ${o.displayCode}: ${e.message} (will retry on next poll)`);
  }
}

// ───────────── معالجة قائمة الطلبات ─────────────
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
let shapeDumped = false;
function describe(v, d = 0) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return d > 3 ? 'array' : [v.length ? describe(v[0], d + 1) : 'empty'];
  if (typeof v === 'object') return d > 3 ? 'object' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, describe(x, d + 1)]));
  return typeof v;
}
function dumpShape(x) {
  shapeDumped = true;
  const money = Object.fromEntries(['subtotal', 'customer_total', 'restaurant_total', 'delivery_fee', 'service_fee', 'small_order_fee',
    'discounts_total', 'stampcards_total', 'food_preparation_duration', 'delivery_time_duration', 'payment_type', 'status', 'delivery_type']
    .map(k => [k, x[k]]));
  money.product0 = x.products?.[0] ? { amount: x.products[0].amount, total_amount: x.products[0].total_amount, quantity: x.products[0].quantity } : null;
  const out = { note: 'أنواع الحقول فقط + أرقام المال. لا توجد بيانات زبون.', types: describe(x), values: money };
  fs.writeFileSync(P('shape.json'), JSON.stringify(out, null, 2));
  log(`field map written to ${P('shape.json')} (safe to share)`);
}

let lastOkAt = 0;
let chain = Promise.resolve();
const processList = list => (chain = chain.then(() => handleList(list)).catch(e => console.error('[NARA] handleList failed:', e)));

async function handleList(list) {
  lastOkAt = Date.now();
  for (const x of list) {
    if (!x || x.id == null) continue;
    const id = String(x.id);
    const st = mapStatus(x.status);
    const known = state.sent[id] !== undefined;
    if ((st.stage === 'DONE' || st.stage === 'CANCELLED') && !known) continue; // لا نغرق السيرفر بطلبات قديمة
    if (!shapeDumped && st.stage === 'PREPARE') dumpShape(x);

    const o = normalize(x, st);
    const rec = buildReceipt(o);
    o.receiptText = rec.text;

    const sig = sha(JSON.stringify([o.liveStage, o.totalCents, o.cart, o.delivery, o.payment, o.requestedAt, o.readyForKitchen, o.remarks, o.customerPhone]));
    if (state.sent[id] !== sig) {
      fs.writeFileSync(P(`raw/${id}.json`), JSON.stringify(x));
      const body = { source: 'LIEFERANDO', order: o };
      const r = await tryPost('/api/platform-orders/import', body);
      if (r === 'retry') fs.appendFileSync(P('outbox.jsonl'), JSON.stringify(body) + '\n');
      state.sent[id] = sig; saveState();
      log(`${r === 'retry' ? 'queued' : 'sent'} ${o.displayCode} ${o.liveStage} ${o.cart.length} items ${(o.totalCents / 100).toFixed(2)} EUR ${o.payment.method} ${o.parseStatus}${o.warnings.length ? ' ⚠ ' + o.warnings.join('; ') : ''}`);
    }
    await maybePrint(o, rec.lines);
  }
}

// ───────────── اختبار ذاتي بدون متصفح ─────────────
function selftest() {
  const x = {
    id: 18447753173, public_reference: 'B68HFC', status: 'kitchen', delivery_type: 'delivery',
    placed_date: '2026-10-07T14:04:00Z', confirmed_at: '2026-10-07T14:06:00Z', requested_time: null,
    restaurant_estimated_delivery_time: '2026-10-07T15:14:00Z',
    payment_type: 'online', currency: 'EUR',
    subtotal: 19.47, delivery_fee: 2, service_fee: 0, small_order_fee: 0.53, discounts_total: 0, stampcards_total: 0,
    restaurant_total: 22, customer_total: 22, food_preparation_duration: 25, delivery_time_duration: 15, is_ready_for_kitchen: true,
    customer: { name: 'Max Mustermann', phone: '+491701234567', address: { street: 'Musterweg', house_number: '6', postal_code: '41749', city: 'Viersen', note: 'Zweite Klingel' }, verification_code: '123456789' },
    payment: { type: 'online' }, couriers: [],
    products: [
      { id: 1, name: 'Smashed Beef Burger', category_name: 'Burger', quantity: 1, amount: 8.99, total_amount: 8.99, specifications: [{ name: 'Ohne Zwiebeln', total_amount: 0 }] },
      { id: 2, name: 'Cheese Burger', category_name: 'Burger', quantity: 1, amount: 7.99, total_amount: 7.99, remarks: 'gut durch' },
      { id: 3, name: 'COCA-COLA 033L ALU SC', category_name: 'Alkoholfreie Getränke', quantity: 1, amount: 2.49, total_amount: 2.49 },
    ],
  };
  const o = normalize(x, mapStatus(x.status));
  const rec = buildReceipt(o);
  console.log(rec.text);
  console.log('\n--- parseStatus:', o.parseStatus, o.warnings, '| kitchenStartAt:', o.kitchenStartAt, '| dueAt:', o.dueAt);
  console.log('--- ESC/POS bytes:', toEscPos(rec.lines).length);
  const cash = normalize({ ...x, payment_type: 'cash' }, mapStatus('kitchen'));
  console.log('--- cash method:', cash.payment.method, 'cashDue:', cash.cashDueCents);
}

// ───────────── التشغيل ─────────────
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

initStorage();
const { chromium } = await import('playwright');
const ctx = await chromium.launchPersistentContext(CFG.profile, { headless: false });
const page = ctx.pages()[0] || await ctx.newPage();
ctx.on('close', () => { console.error('[NARA] browser closed - exiting (let your service restart me)'); process.exit(1); });
process.on('unhandledRejection', e => console.error('[NARA] unhandledRejection:', e));

const alertedAt = {};
async function alertServer(type, extra = {}) {
  if (Date.now() - (alertedAt[type] || 0) < 300000) return;
  alertedAt[type] = Date.now();
  console.error(`[NARA] ALERT ${type}`);
  await tryPost('/api/platform-orders/alert', { source: 'LIEFERANDO', type, at: new Date().toISOString(), ...extra }, { quiet: true });
}

page.on('response', async r => {
  try {
    const u = new URL(r.url());
    if (u.hostname !== 'live-orders-api.takeaway.com' || u.pathname !== '/api/orders' || r.request().method() !== 'GET') return;
    if ([401, 403].includes(r.status())) { await alertServer('SESSION_EXPIRED', { status: r.status() }); return; }
    if (!r.ok()) { warnOnce('ordersHttp' + r.status(), `/api/orders returned ${r.status()}`); return; }
    const p = await r.json();
    const list = Array.isArray(p) ? p : (p?.orders || p?.data || []);
    await processList(Array.isArray(list) ? list : []);
  } catch (e) { console.error(`[NARA] response parse failed: ${e.message}`); }
});

let reloading = false, wsTimer = null;
async function refresh() {
  if (reloading) return;
  reloading = true;
  try { await page.reload({ waitUntil: 'domcontentloaded' }); }
  catch (e) { console.error('[NARA] refresh failed: ' + e.message); }
  finally { reloading = false; }
}
page.on('websocket', ws => {
  let host = ''; try { host = new URL(ws.url()).hostname; } catch { /* تجاهل */ }
  log('websocket connected', host);
  ws.on('framereceived', f => {
    const len = f.payload?.length ?? 0;
    if (CFG.debugWs) log(`WS frame ${len}B`);
    if (len > 40) { clearTimeout(wsTimer); wsTimer = setTimeout(refresh, 1500); } // رسالة حقيقية (مو heartbeat) → اجلب فوراً
  });
});

await page.goto('https://live-orders.takeaway.com/orders', { waitUntil: 'domcontentloaded' });
setInterval(refresh, CFG.refreshMs);
setInterval(() => flushOutbox().catch(e => console.error('[NARA] outbox:', e.message)), 30000);
setInterval(async () => {
  const url = page.url();
  const loggedOut = /login|signin|sign-in|auth|account\./i.test(new URL(url).hostname + new URL(url).pathname);
  if (loggedOut) await alertServer('SESSION_EXPIRED', { url });
  const silentMs = Date.now() - (lastOkAt || Date.now());
  if (lastOkAt && silentMs > Math.max(CFG.refreshMs * 4, 120000)) await alertServer('NO_DATA', { silentSeconds: Math.round(silentMs / 1000) });
  await tryPost('/api/platform-orders/heartbeat', { source: 'LIEFERANDO', bridge: 'playwright', lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null, loggedOut }, { quiet: true });
}, 60000);

log(`Playwright bridge ready. Profile: ${CFG.profile}`);
log(`Server: ${CFG.base} | printer: ${CFG.printerHost || 'off'} | receipt: ${CFG.lang}/${CFG.width}`);
log('Login manually once; keep this window open.');
await new Promise(() => {});
