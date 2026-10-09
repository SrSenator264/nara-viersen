'use strict';
// dispatch-service.js — بيجهّز معطيات عقل التوزيع من بيانات NARA:
// الطلبات المفتوحة للتوصيل، السواقين الشغّالين ومواقعهم، والجولات اللي طالعة هلق.
// + تحويل العناوين لإحداثيات بخدمة مجانية (OpenStreetMap Nominatim) مع حفظها كي ما ننسأل مرتين.

const engine = require('./dispatch-engine.js');
const kitchen = require('./kitchen.js');
const learning = require('./dispatch-learning.js');
const prep = require('./prep-learning.js');

const DEFAULT_SHOP = { lat: 51.2556, lng: 6.3936, address: 'Gereonstraße 1, 41747 Viersen' };
const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT', 'DONE']);
const MIN = 60000;
const str = v => (v == null ? '' : String(v)).trim();
const num = v => (v === '' || v == null ? NaN : Number(v));

function addressOf(o) {
  const d = o.delivery || {};
  const street = str(d.address) || [str(d.street), str(d.house || d.houseNumber)].filter(Boolean).join(' ');
  const city = [str(d.postal || d.postalCode), str(d.city)].filter(Boolean).join(' ');
  if (!street) return '';
  return [street, city, 'Deutschland'].filter(Boolean).join(', ');
}
const addressKey = a => str(a).toLowerCase().replace(/\s+/g, ' ').replace(/str\.?(\s|,)/g, 'straße$1');

const zoneOf = o => { const d = o.delivery || {}; return str(d.postal || d.postalCode || o.postalCode).slice(0, 5); };

function pointOf(o, cache) {
  const d = o.delivery || {};
  const lat = num(d.lat ?? o.lat), lng = num(d.lng ?? o.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, zone: zoneOf(o) };
  const hit = cache && cache[addressKey(addressOf(o))];
  return hit && Number.isFinite(hit.lat) ? { lat: hit.lat, lng: hit.lng, zone: zoneOf(o) } : null;
}

const isDelivery = o => str(o.type || o.orderType).toLowerCase() === 'delivery';
const delivered = (o, now = Date.now()) => kitchen.isClosedForOps(o, now);

function shopOf(data) {
  const s = (data.settings && data.settings.restaurantLocation) || {};
  return Number.isFinite(num(s.lat)) && Number.isFinite(num(s.lng)) ? { lat: num(s.lat), lng: num(s.lng) } : { lat: DEFAULT_SHOP.lat, lng: DEFAULT_SHOP.lng };
}

// سواق شغّال هلق: عنده دخول دوام مفتوح أو وردية مفتوحة. إذا ولا واحد مسجّل، منعتبر كل السواقين الفعّالين.
function activeDrivers(data) {
  const drivers = (data.employees || []).filter(e => e.active !== false && str(e.role).toUpperCase() === 'DRIVER');
  const onDuty = new Set([
    ...(data.attendanceEvents || []).filter(x => x.action === 'CLOCK_IN' && !x.closedAt).map(x => x.employeeId),
    ...(data.shifts || []).filter(x => x.status === 'OPEN').map(x => x.employeeId),
  ]);
  const working = drivers.filter(d => onDuty.has(d.id));
  return { list: working.length ? working : drivers, assumed: !working.length && drivers.length > 0 };
}

// جولات مو خالصة: مرسلة للسائق (ASSIGNED) أو طالعة (startedAt)
const openRoutes = data => (data.deliveryRoutes || []).filter(r => !r.completedAt && r.status !== 'CANCELLED');

// تقدير وقت المشوار: خط مستقيم × معامل طرق ÷ سرعة، مضروب بما تعلّمه البرنامج لهالمنطقة
function travelModel(data) {
  const cfg = { ...engine.DEFAULTS, ...((data.settings && data.settings.dispatch) || {}) };
  const m = learning.model(data);
  const base = (a, b) => engine.haversineKm(a, b) * cfg.roadFactor / cfg.speedKmh * 60;
  return { cfg, model: m, base, travel: (a, b) => base(a, b) * learning.factorFor(m, b && b.zone) };
}

function buildInput(data, now = Date.now()) {
  const cache = data.geocodeCache || {};
  const routes = openRoutes(data);
  const ordersById = new Map((data.orders || []).map(o => [String(o.id), o]));
  const positions = data.driverPositions || {};
  const busy = new Set(routes.flatMap(r => (r.orderIds || []).map(String)));
  const { list, assumed } = activeDrivers(data);
  const tm = travelModel(data);

  const drivers = list.map(e => {
    const pos = positions[e.id];
    const fresh = pos && Number.isFinite(pos.lat) && now - Date.parse(pos.at || 0) < 10 * MIN;
    const mine = routes.filter(r => r.employeeId === e.id);
    const out = mine.some(r => r.startedAt);
    const remaining = mine.flatMap(r => (r.orderIds || []).map(id => ordersById.get(String(id))).filter(o => o && !delivered(o, now)))
      .map(o => pointOf(o, cache)).filter(Boolean);
    // طالع: من موقعه (أو المحل إذا ما في GPS). مرسلة بس لسا ما طلع: من المحل
    const position = out && fresh ? { lat: pos.lat, lng: pos.lng } : (remaining.length || (fresh && out) ? shopOf(data) : (fresh ? { lat: pos.lat, lng: pos.lng } : null));
    return { id: e.id, name: e.name, position, remainingStops: remaining, out, lastSeenAt: pos ? pos.at : null };
  });

  const fc = prep.forecast(data, now); // متى كل طلب رح يجهز فعلياً (متعلّم من المطبخ + الطابور)
  const orders = (data.orders || [])
    .filter(o => isDelivery(o) && !delivered(o, now) && !kitchen.isStale(o, now) && !busy.has(String(o.id)))
    .map(o => {
      const p = pointOf(o, cache);
      const kv = kitchen.kitchenView(o, now);
      // Loco (Sides): مطبخها لحالو، فوقت الجهوزية من Sides نفسه (expectedTourStart)
      const locoReady = (/loco/i.test(String(o.brand || o.brandName || '')) || /^SIDES/i.test(String(o.source || ''))) && o.readyAt ? o.readyAt : null;
      const readyAt = o.kitchenStatus === 'READY' || o.kitchenStatus === 'PICKED_UP' ? new Date(now).toISOString() : locoReady || (fc.orders[o.id] ? fc.orders[o.id].readyAt : kv.readyBy);
      return { id: o.id, code: kv.displayCode, lat: p ? p.lat : NaN, lng: p ? p.lng : NaN, zone: zoneOf(o), readyAt, dueAt: o.promisedDueAt || o.dueAt || o.etaAt || null, createdAt: o.createdAt || o.placedAt };
    });
  const config = { ...((data.settings && data.settings.dispatch) || {}) };
  if (tm.model.stopMin) config.stopMin = tm.model.stopMin;
  return { now, shop: shopOf(data), drivers, orders, config, travel: tm.travel, learning: { ...tm.model, kitchen: { samples: fc.model.samples, slots: fc.slots, queue: fc.queue } }, assumedDrivers: assumed };
}

function planFor(data, now = Date.now()) {
  const input = buildInput(data, now);
  const result = engine.plan(input);
  const cache = data.geocodeCache || {};
  const byId = new Map((data.orders || []).map(o => [String(o.id), o]));
  for (const d of result.drivers) for (const t of d.tours) {
    t.googleMapsUrl = engine.googleMapsLink(input.shop, t.stops);
    for (const s of t.stops) { const o = byId.get(String(s.orderId)); if (o) { s.address = addressOf(o).replace(/, Deutschland$/, ''); s.name = str((o.delivery || {}).name || o.customerName); s.source = kitchen.kitchenView(o, now).source; } }
  }
  // الجولات المرسلة/الطالعة هلق (للعرض على الخريطة)
  const active = openRoutes(data).map(r => ({
    routeId: r.id, driverId: r.employeeId, driverName: r.employeeName || '', startedAt: r.startedAt || null, assignedAt: r.createdAt,
    stops: (r.orderIds || []).map(id => byId.get(String(id))).filter(Boolean).map(o => ({ orderId: o.id, code: kitchen.kitchenView(o, now).displayCode, delivered: delivered(o), address: addressOf(o).replace(/, Deutschland$/, ''), ...(pointOf(o, cache) || {}) })),
  }));
  const positions = Object.entries(data.driverPositions || {}).map(([id, p]) => ({ driverId: id, ...p }));
  // الطلبات بدون موقع: منعرض رقم الطلب والعنوان، مو الـ id الداخلي
  result.unplaced = result.unplaced.map(u => { const o = byId.get(String(u.id)); return o ? { ...u, code: kitchen.kitchenView(o, now).displayCode, address: addressOf(o).replace(/, Deutschland$/, '') } : u; });
  return { ...result, shop: input.shop, assumedDrivers: input.assumedDrivers, learning: input.learning, active, positions };
}

const err = (status, message) => Object.assign(new Error(message), { status });

// إرسال جولة لسائق (من الخطة أو يدوي)
function assignRoute(data, { driverId, orderIds, etas }, user, now = new Date().toISOString()) {
  const driver = (data.employees || []).find(e => e.id === driverId && str(e.role).toUpperCase() === 'DRIVER');
  if (!driver) throw err(422, 'السائق غير موجود');
  const ids = (Array.isArray(orderIds) ? orderIds : []).map(String);
  if (!ids.length || ids.length > 8) throw err(422, 'اختر من 1 لـ 8 طلبات');
  const taken = new Set(openRoutes(data).flatMap(r => (r.orderIds || []).map(String)));
  const orders = ids.map(id => (data.orders || []).find(o => String(o.id) === id));
  if (orders.some(o => !o)) throw err(404, 'طلب غير موجود');
  if (orders.some(o => taken.has(String(o.id)))) throw err(409, 'طلب مرسل لسائق تاني');
  if (orders.some(o => !isDelivery(o) || delivered(o))) throw err(409, 'طلب مو توصيل أو مسلّم');
  data.deliveryRoutes ??= [];
  const route = { id: 'route_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), employeeId: driver.id, employeeName: driver.name, orderIds: ids,
    plannedEtas: etas || null, status: 'ASSIGNED', source: 'AUTO_PLAN', createdAt: now, createdBy: user ? user.name : null, startedAt: null, completedAt: null, updatedAt: now };
  data.deliveryRoutes.push(route);
  for (const o of orders) {
    o.deliveryRouteId = route.id; o.assignmentStatus = 'ASSIGNED'; o.driverId = driver.id;
    o.assignment = { driverId: driver.id, driverName: driver.name, roundId: route.id.slice(-4).toUpperCase(), etaAt: etas && etas[String(o.id)] || null };
    o.updatedAt = now;
  }
  return route;
}

function routeFor(data, routeId, user) {
  const r = (data.deliveryRoutes || []).find(x => x.id === routeId);
  if (!r) throw err(404, 'الجولة غير موجودة');
  const boss = user && ['OWNER', 'MANAGER', 'CASHIER'].includes(str(user.role).toUpperCase());
  if (!boss && (!user || r.employeeId !== user.id)) throw err(403, 'هالجولة مو إلك');
  return r;
}

function cancelRoute(data, routeId, user, now = new Date().toISOString()) {
  const r = routeFor(data, routeId, user);
  if (r.startedAt) throw err(409, 'الجولة طالعة، ما بتنلغى');
  r.status = 'CANCELLED'; r.completedAt = now; r.updatedAt = now;
  for (const o of data.orders || []) if (o.deliveryRouteId === r.id) { delete o.deliveryRouteId; delete o.driverId; delete o.assignment; o.assignmentStatus = 'UNASSIGNED'; o.updatedAt = now; }
  return r;
}

function startRoute(data, routeId, user, now = new Date().toISOString()) {
  const r = routeFor(data, routeId, user);
  if (r.completedAt) throw err(409, 'الجولة خالصة');
  if (!r.startedAt) { r.startedAt = now; r.status = 'STARTED'; r.updatedAt = now; }
  for (const o of data.orders || []) if (o.deliveryRouteId === r.id) { o.outAt ??= now; o.liveStage = 'HANDOVER'; o.updatedAt = now; }
  return r;
}

// تسليم طلب: بيتسجّل الوقت والمكان، والبرنامج بيتعلّم من المشوار
function deliverStop(data, orderId, user, pos, now = new Date().toISOString()) {
  const o = (data.orders || []).find(x => String(x.id) === String(orderId));
  if (!o || !o.deliveryRouteId) throw err(404, 'الطلب مو بجولة');
  const r = routeFor(data, o.deliveryRouteId, user);
  if (!r.startedAt) startRoute(data, r.id, user, now);
  if (o.deliveredAt) return { route: r, order: o, learned: null };
  o.deliveredAt = now; o.liveStage = 'DONE'; o.assignmentStatus = 'DELIVERED'; o.updatedAt = now;
  if (pos && Number.isFinite(pos.lat)) o.deliveredAt_pos = { lat: pos.lat, lng: pos.lng };
  // المشوار: من آخر تسليم بهالجولة (أو من المحل وقت الطلوع) لهون
  const tm = travelModel(data), cache = data.geocodeCache || {};
  const done = (r.orderIds || []).map(id => (data.orders || []).find(x => String(x.id) === String(id))).filter(x => x && x.deliveredAt && x !== o).sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt));
  const prev = done[done.length - 1];
  const from = prev ? pointOf(prev, cache) : shopOf(data), to = pointOf(o, cache);
  let learned = null;
  if (from && to) {
    const startT = prev ? Date.parse(prev.deliveredAt) + (tm.model.stopMin || tm.cfg.stopMin) * MIN : Date.parse(r.startedAt) + tm.cfg.handoverMin * MIN;
    const actualMin = (Date.parse(now) - startT) / MIN;
    learned = learning.record(data, { zone: zoneOf(o), estMin: tm.base(from, to), actualMin, km: engine.haversineKm(from, to), driverId: r.employeeId, at: now });
  }
  if ((r.orderIds || []).every(id => { const x = (data.orders || []).find(y => String(y.id) === String(id)); return !x || x.deliveredAt; })) { r.allDeliveredAt = now; r.updatedAt = now; }
  return { route: r, order: o, learned };
}

// السائق رجع للمحل: بتخلص الجولة وبيتعلّم مشوار الرجعة
function finishRoute(data, routeId, user, now = new Date().toISOString()) {
  const r = routeFor(data, routeId, user);
  if (r.completedAt) return r;
  r.completedAt = now; r.status = 'COMPLETED'; r.updatedAt = now;
  const cache = data.geocodeCache || {};
  const last = (r.orderIds || []).map(id => (data.orders || []).find(x => String(x.id) === String(id))).filter(x => x && x.deliveredAt).sort((a, b) => Date.parse(b.deliveredAt) - Date.parse(a.deliveredAt))[0];
  if (last && pointOf(last, cache)) {
    const tm = travelModel(data);
    learning.record(data, { zone: 'RETURN', estMin: tm.base(pointOf(last, cache), shopOf(data)), actualMin: (Date.parse(now) - Date.parse(last.deliveredAt)) / MIN - (tm.model.stopMin || tm.cfg.stopMin), driverId: r.employeeId, at: now });
  }
  return r;
}

// مدفوع أونلاين؟ (بس هالطلبات بيصير فيها إثبات بالصورة إذا ما حدا فتح)
function paidOnline(o) {
  const method = str((o.payment && o.payment.method) || o.paymentMethod).toUpperCase();
  if (method === 'CASH') return false;
  return method === 'ONLINE' || str(o.paymentStatus).toUpperCase() === 'PAID_ON_PLATFORM' || !!(o.payment && o.payment.paid === true);
}

// إثبات تسليم بالصورة: الطلب مدفوع أونلاين وما حدا فتح الباب
function proofDelivery(data, orderId, user, { file, pos }, now = new Date().toISOString()) {
  const o = (data.orders || []).find(x => String(x.id) === String(orderId));
  if (!o || !o.deliveryRouteId) throw err(404, 'الطلب مو بجولة');
  routeFor(data, o.deliveryRouteId, user);
  if (!paidOnline(o)) throw err(409, 'الصورة بس للطلبات المدفوعة أونلاين. طلب الكاش لازم ينسلّم باليد.');
  o.deliveryProof = { file, at: now, by: user ? user.name : null, reason: 'NOT_HANDED_OVER', ...(pos && Number.isFinite(pos.lat) ? { lat: pos.lat, lng: pos.lng } : {}) };
  return deliverStop(data, orderId, user, pos, now);
}

// جولات السائق نفسه (بدون أي مبلغ)
function driverRoutes(data, driverId) {
  const cache = data.geocodeCache || {};
  return openRoutes(data).filter(r => r.employeeId === driverId).map(r => {
    const stops = (r.orderIds || []).map(id => (data.orders || []).find(o => String(o.id) === String(id))).filter(Boolean).map(o => {
      const d = o.delivery || {}, kv = kitchen.kitchenView(o);
      const cash = !paidOnline(o);
      return { orderId: o.id, code: kv.displayCode, source: kv.source, name: kv.customerName, phone: kv.phone, address: kv.address, city: kv.city, floor: kv.floor, canProof: paidOnline(o), proof: !!o.deliveryProof,
        notes: kv.notes, itemsCount: kv.items.reduce((s, i) => s + i.quantity, 0), cash, delivered: !!o.deliveredAt, etaAt: o.assignment && o.assignment.etaAt || null, ...(pointOf(o, cache) || {}) };
    });
    return { routeId: r.id, roundId: r.id.slice(-4).toUpperCase(), status: r.status, startedAt: r.startedAt, allDelivered: stops.every(s => s.delivered), stops,
      googleMapsUrl: engine.googleMapsLink(shopOf(data), stops.filter(s => !s.delivered && Number.isFinite(s.lat))) };
  });
}

// العناوين اللي لسا ما إلها إحداثيات (للطلبات المفتوحة)
function missingAddresses(data, now = Date.now()) {
  const cache = data.geocodeCache || {}, out = new Set();
  for (const o of data.orders || []) {
    if (!isDelivery(o) || delivered(o, now) || kitchen.isStale(o, now) || pointOf(o, cache)) continue;
    const a = addressOf(o); if (a && !(cache[addressKey(a)] && cache[addressKey(a)].failedAt)) out.add(a);
  }
  return [...out];
}

// Nominatim: مجاني، طلب واحد بالثانية، ولازم اسم برنامج واضح
async function geocode(address, fetchImpl = fetch) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q: address, format: 'json', limit: '1', countrycodes: 'de' });
  const r = await fetchImpl(url, { headers: { 'User-Agent': 'NARA-Viersen/1.0 (restaurant delivery planner)', 'Accept-Language': 'de' } });
  if (!r.ok) throw new Error('geocode ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) return null;
  return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
}

module.exports = { DEFAULT_SHOP, shopOf, addressOf, addressKey, pointOf, buildInput, planFor, missingAddresses, geocode, activeDrivers, assignRoute, cancelRoute, startRoute, deliverStop, finishRoute, driverRoutes, travelModel, paidOnline, proofDelivery };
