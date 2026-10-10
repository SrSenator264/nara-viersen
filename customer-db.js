'use strict';
// customer-db.js — قاعدة الزباين الخارجية: ملف لحالو (data/customers-db.json) منفصل عن nara-admin.json.
// بتنبني أوتوماتيك من كل الطلبات (Lieferando, Uber Eats, Sides/Loco, Lanch, الموقع، الكاشير).
// الزبون بينعرف من عنوانه (المنصات بتخبّي أرقام التلفون)، ولو ما في عنوان (استلام/محل) من رقمه.
// لكل زبون: عدد طلباته، المبالغ، شو بيطلب عادةً، أي يوم وساعة، كل قديش بيرجع، ومتى متوقع يطلب مرة جاية.
// تنبيه: زبون المنصة بياناته للتوصيل بس، مو للتسويق. contactOk = طلب مرة من قنواتنا (الموقع/الكاشير).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dispatch = require('./dispatch-service.js');
const bizDay = require('./business-day.js');

const DAY = 86400000;
const OWN = new Set(['KASSE', 'WEB', 'DINE_IN', 'PHONE']);
const str = v => (v == null ? '' : String(v)).trim();
const digits = s => str(s).replace(/\D/g, '').replace(/^(0049|49)/, '0');
const cents = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mode = obj => { let best = null, n = 0; for (const [k, v] of Object.entries(obj)) if (v > n) { best = k; n = v; } return best; };
const bump = (obj, k, n = 1) => { if (k !== '' && k != null) obj[k] = (obj[k] || 0) + n; };

// وقت برلين (يوم الأسبوع 0=أحد، والساعة)
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// اليوم بيتحسب حسب "يوم الشغل" (طلب 00:30 ليلة السبت = الجمعة)، والساعة بتضل الساعة الحقيقية
function berlin(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const q = Object.fromEntries(fmt.formatToParts(new Date(ms - bizDay.startHour * 3600000)).map(x => [x.type, x.value]));
  return { weekday: WD[q.weekday], hour: Number(p.hour) };
}

const isTest = o => o.isTest === true || /DEMO|TEST/i.test(str(o.displayCode || o.externalOrderCode));
const isCancelled = o => /CANCEL|STORN|REJECT/i.test(str(o.status));
const sourceOf = o => {
  const s = str(o.source).toUpperCase();
  if (s === 'SIDES') return 'LOCO';
  return s || 'KASSE';
};
function timeOf(o) {
  const c = Array.isArray(o.changes) && o.changes[0] && o.changes[0].at;
  for (const v of [o.placedAt, o.createdAt, c, o.completedAt, o.updatedAt]) { const t = Date.parse(v); if (Number.isFinite(t)) return t; }
  return null;
}
function totalOf(o) {
  for (const v of [o.totalCents, o.externalTotalCents, o.paidCents]) if (cents(v) > 0) return cents(v);
  let sum = 0;
  for (const i of o.cart || []) {
    const q = Number(i.quantity) || 1;
    const opt = (i.options || []).reduce((s, x) => s + cents(x.cents) * (Number(x.quantity) || 1), 0);
    sum += i.totalCents != null ? cents(i.totalCents) : (cents(i.unitCents) + opt) * q;
  }
  return Math.max(0, sum - cents(o.billDiscount && o.billDiscount.cents));
}

function addressParts(o) {
  const d = o.delivery || {};
  let street = str(d.street), house = str(d.house || d.houseNumber);
  if (!street) street = str(d.address);
  if (house && street.toLowerCase().endsWith(' ' + house.toLowerCase())) street = street.slice(0, -house.length).trim();
  if (!house) { const m = street.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)$/); if (m) { street = m[1]; house = m[2].replace(/\s+/g, ''); } }
  return { street, house, postal: str(d.postal || d.postalCode).slice(0, 5), city: str(d.city) };
}
const normStreet = s => str(s).toLowerCase().replace(/str\.?(?=\s|$)/g, 'straße').replace(/strasse/g, 'straße').replace(/[^a-z0-9äöüß]/g, '');
function keyOf(o, proxy) {
  const a = addressParts(o);
  if (a.street && a.postal) return 'A:' + normStreet(a.street) + '|' + str(a.house).toLowerCase().replace(/\s+/g, '') + '|' + a.postal;
  const p = digits(o.customerPhone || (o.delivery || {}).phone);
  if (p.length >= 7 && !(proxy && proxy.has(p))) return 'P:' + p;
  return null;
}
const pretty = s => str(s).replace(/\s+/g, ' ').replace(/(^|[\s-])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase());

// طلبات Lieferando القديمة انحفظت كنص صفحة بس (rawText) بدون عنوان. منطلّع العنوان والاسم من النص:
//   قائمة:  "53 min 41749 Viersen, Friedrich-Ebert-Straße 19 Glantis Hölter ASAP #BWFM9C"
//   تفاصيل: "41749 Viersen, Friedrich-Ebert-Straße 19 #BWFM9C Delivery Glantis Hölter +49..."
const W = "A-Za-zÄÖÜäöüß";
const RE_DETAIL = new RegExp(`(\\d{5}) ([${W}\\- ]{2,30}?), ([${W}0-9.\\- ]{3,60}?) #([A-Z0-9]{5,8}) (?:Delivery|Lieferung) (.{2,60}?) (?:\\+?\\d[\\d ]{6,}|Verification|Order accepted)`, 'g');
const RE_LIST = new RegExp(`(\\d{5}) ([${W}\\- ]{2,30}?), ([${W}.\\- ]{2,50}? \\d{1,4}[A-Za-z]?) (.{1,50}?) (?:ASAP|\\d{1,2}:\\d{2}) #([A-Z0-9]{5,8})\\b`, 'g');
function rawIndex(orders) {
  const idx = new Map();
  for (const o of orders) {
    const r = str(o.rawText || o.receiptText).replace(/\s+/g, ' ');
    if (!r) continue;
    for (const m of r.matchAll(RE_DETAIL)) idx.set(m[4], { postal: m[1], city: m[2], address: m[3], name: m[5] });
    for (const m of r.matchAll(RE_LIST)) if (!idx.has(m[5])) idx.set(m[5], { postal: m[1], city: m[2], address: m[3], name: m[4] });
  }
  return idx;
}
// الطلب مع عنوان مكمّل من النص إذا ناقص
function withAddress(o, idx) {
  const d = o.delivery || {};
  if (str(d.street || d.address) && str(d.postal || d.postalCode)) return o;
  const hit = idx && idx.get(str(o.externalOrderCode || o.displayCode).replace(/^#/, ''));
  if (!hit) return o;
  return { ...o, customerName: o.customerName || hit.name, delivery: { ...d, address: hit.address, postal: hit.postal, city: hit.city, name: str(d.name) || hit.name, fromRawText: true } };
}

function itemName(i) {
  let n = str(i.name);
  if (/^(lieferando|uber eats|uber|platform|lanch|sides) order$/i.test(n)) return ''; // طلب قديم بدون أصناف
  const menu = (i.options || []).some(x => x.id === '__menu' || /men[uü]/i.test(str(x.name)) && x.group === '__order');
  return n ? n + (menu ? ' (Menü)' : '') : '';
}

function build(data, now = Date.now()) {
  const geo = data.geocodeCache || {};
  const by = new Map();
  const all = data.orders || [];
  const idx = rawIndex(all);
  // رقم تلفون بيطلع عند 3 عناوين أو أكتر = رقم وسيط للمنصة (Lieferando بيعطي نفس الرقم)، مو رقم الزبون
  const phoneAddr = new Map();
  for (const x of all) { const o = withAddress(x, idx), p = digits(o.customerPhone || (o.delivery || {}).phone), a = addressParts(o); if (p.length >= 7 && a.street) { if (!phoneAddr.has(p)) phoneAddr.set(p, new Set()); phoneAddr.get(p).add(normStreet(a.street) + a.house); } }
  const proxy = new Set([...phoneAddr].filter(([, s]) => s.size >= 3).map(([p]) => p));
  for (const raw of all) {
    if (isTest(raw)) continue;
    const o = withAddress(raw, idx);
    const key = keyOf(o, proxy);
    if (!key) continue;
    const t = timeOf(o);
    let c = by.get(key);
    if (!c) {
      c = { id: 'C-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 10), key, names: {}, phones: {}, sources: {}, brands: {}, payments: {}, items: {}, weekdays: {}, hours: {}, times: [], totals: [], cancelled: 0, orderIds: [], last: null };
      by.set(key, c);
    }
    const d = o.delivery || {};
    bump(c.names, pretty(d.name || o.customerName));
    const ph = digits(o.customerPhone || d.phone); if (ph.length >= 7 && !proxy.has(ph)) bump(c.phones, ph);
    c.orderIds.push(String(o.id));
    if (isCancelled(o)) { c.cancelled++; continue; }
    bump(c.sources, sourceOf(o));
    bump(c.brands, str(o.brand || o.brandName));
    bump(c.payments, str((o.payment && o.payment.method) || o.paymentMethod).toUpperCase() || (sourceOf(o) === 'KASSE' ? 'KASSE' : ''));
    for (const i of o.cart || []) bump(c.items, itemName(i), Number(i.quantity) || 1);
    c.totals.push(totalOf(o));
    if (t != null) {
      c.times.push(t);
      const b = berlin(t); bump(c.weekdays, b.weekday); bump(c.hours, b.hour);
      if (!c.last || t >= c.last.t) c.last = { t, o };
    } else if (!c.last) c.last = { t: null, o };
  }

  const customers = [];
  for (const c of by.values()) {
    const orders = c.totals.length;
    if (!orders && !c.cancelled) continue;
    const lo = (c.last && c.last.o) || {};
    c.fromRawText = !!(lo.delivery && lo.delivery.fromRawText);
    const a = addressParts(lo), d = lo.delivery || {};
    const times = c.times.sort((x, y) => x - y);
    // طلبين بنفس الساعة (طلب مكرر أو مقسوم) ما منحسبهن رجعة
    const visits = times.filter((t, i) => i === 0 || t - times[i - 1] > 3 * 3600000);
    const gaps = visits.slice(1).map((t, i) => (t - visits[i]) / DAY);
    const gapDays = gaps.length ? Math.round(median(gaps) * 10) / 10 : null;
    const lastAt = times.length ? times[times.length - 1] : null;
    const since = lastAt ? (now - lastAt) / DAY : null;
    let segment = 'NEW';
    if (visits.length >= 3) segment = 'REGULAR';
    else if (visits.length === 2) segment = 'RETURNING';
    if (lastAt && since > Math.max(30, gapDays ? gapDays * 2.5 : 0)) segment = 'SLEEPING';
    if (!orders) segment = 'CANCELLED_ONLY';
    const total = c.totals.reduce((s, x) => s + x, 0);
    let lat = Number(d.lat), lng = Number(d.lng);
    let geoAddress = null;
    if (!(Number.isFinite(lat) && Number.isFinite(lng) && lat)) {
      const addr = dispatch.addressOf(lo), g = geo[dispatch.addressKey(addr)];
      lat = g && g.lat; lng = g && g.lng;
      if (!(g && (Number.isFinite(g.lat) || g.failedAt)) && addr) geoAddress = addr; // لسا ما اندوّر عليه: السيرفر بيحطه بالدور
    }
    const sources = c.sources;
    customers.push({
      id: c.id,
      name: mode(c.names) || '',
      otherNames: Object.keys(c.names).filter(n => n !== mode(c.names)).slice(0, 5),
      phone: mode(c.phones) || '',
      street: pretty(a.street), house: a.house, postal: a.postal, city: pretty(a.city),
      floor: str(d.floor), bell: str(d.bell), notes: str(d.notes || d.extra).slice(0, 200),
      lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
      orders, visits: visits.length, cancelled: c.cancelled,
      totalCents: total, avgCents: orders ? Math.round(total / orders) : 0,
      minCents: orders ? Math.min(...c.totals) : 0, maxCents: orders ? Math.max(...c.totals) : 0,
      firstAt: times.length ? new Date(times[0]).toISOString() : null,
      lastAt: lastAt ? new Date(lastAt).toISOString() : null,
      gapDays, nextExpectedAt: lastAt && gapDays ? new Date(lastAt + gapDays * DAY).toISOString() : null,
      usualWeekday: c.times.length ? Number(mode(c.weekdays)) : null,
      usualHour: c.times.length ? Number(mode(c.hours)) : null,
      favourites: Object.entries(c.items).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, count]) => ({ name, count })),
      sources, mainSource: mode(sources) || '', brands: c.brands, payments: c.payments,
      contactOk: Object.keys(sources).some(s => OWN.has(s)),
      segment, fromRawText: c.fromRawText, geoAddress, orderIds: c.orderIds.slice(-50),
    });
  }
  customers.sort((x, y) => (y.lastAt || '').localeCompare(x.lastAt || ''));

  const real = customers.filter(c => c.orders);
  const seg = {}; for (const c of real) bump(seg, c.segment);
  const totalOrders = real.reduce((s, c) => s + c.orders, 0), totalCents = real.reduce((s, c) => s + c.totalCents, 0);
  const repeatCust = real.filter(c => c.visits >= 2);
  return {
    version: 1, builtAt: new Date(now).toISOString(),
    stats: {
      customers: real.length, orders: totalOrders, totalCents, avgCents: totalOrders ? Math.round(totalCents / totalOrders) : 0,
      repeatCustomers: repeatCust.length, repeatShare: real.length ? Math.round(repeatCust.length / real.length * 100) : 0,
      repeatOrdersShare: totalOrders ? Math.round(repeatCust.reduce((s, c) => s + c.orders, 0) / totalOrders * 100) : 0,
      segments: seg, contactOk: real.filter(c => c.contactOk).length,
      firstAt: real.reduce((m, c) => (c.firstAt && (!m || c.firstAt < m) ? c.firstAt : m), null),
    },
    customers,
  };
}

function save(file, db) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, file);
  return db;
}

module.exports = { build, save, keyOf, totalOf, addressParts, isTest, rawIndex, withAddress };
