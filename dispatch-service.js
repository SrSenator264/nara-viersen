'use strict';
// dispatch-service.js — بيجهّز معطيات عقل التوزيع من بيانات NARA:
// الطلبات المفتوحة للتوصيل، السواقين الشغّالين ومواقعهم، والجولات اللي طالعة هلق.
// + تحويل العناوين لإحداثيات بخدمة مجانية (OpenStreetMap Nominatim) مع حفظها كي ما ننسأل مرتين.

const engine = require('./dispatch-engine.js');
const kitchen = require('./kitchen.js');

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

function pointOf(o, cache) {
  const d = o.delivery || {};
  const lat = num(d.lat ?? o.lat), lng = num(d.lng ?? o.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const hit = cache && cache[addressKey(addressOf(o))];
  return hit && Number.isFinite(hit.lat) ? { lat: hit.lat, lng: hit.lng } : null;
}

const isDelivery = o => str(o.type || o.orderType).toLowerCase() === 'delivery';
const delivered = o => !!o.deliveredAt || CLOSED.has(str(o.status).toUpperCase()) || str(o.liveStage).toUpperCase() === 'DONE';

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

function buildInput(data, now = Date.now()) {
  const cache = data.geocodeCache || {};
  const routes = (data.deliveryRoutes || []).filter(r => r.startedAt && !r.completedAt);
  const ordersById = new Map((data.orders || []).map(o => [String(o.id), o]));
  const positions = data.driverPositions || {};
  const busy = new Set(routes.flatMap(r => (r.orderIds || []).map(String)));
  const { list, assumed } = activeDrivers(data);

  const drivers = list.map(e => {
    const pos = positions[e.id];
    const fresh = pos && Number.isFinite(pos.lat) && now - Date.parse(pos.at || 0) < 10 * MIN;
    const remaining = routes.filter(r => r.employeeId === e.id)
      .flatMap(r => (r.orderIds || []).map(id => ordersById.get(String(id))).filter(o => o && !delivered(o)))
      .map(o => pointOf(o, cache)).filter(Boolean);
    return { id: e.id, name: e.name, position: fresh ? { lat: pos.lat, lng: pos.lng } : (remaining.length ? shopOf(data) : null), remainingStops: remaining };
  });

  const orders = (data.orders || [])
    .filter(o => isDelivery(o) && !delivered(o) && !busy.has(String(o.id)))
    .map(o => {
      const p = pointOf(o, cache);
      const kv = kitchen.kitchenView(o, now);
      const readyAt = o.kitchenStatus === 'READY' || o.kitchenStatus === 'PICKED_UP' ? new Date(now).toISOString() : kv.readyBy;
      return { id: o.id, code: kv.displayCode, lat: p ? p.lat : NaN, lng: p ? p.lng : NaN, readyAt, dueAt: o.dueAt || o.etaAt || null, createdAt: o.createdAt || o.placedAt };
    });
  return { now, shop: shopOf(data), drivers, orders, config: (data.settings && data.settings.dispatch) || {}, assumedDrivers: assumed };
}

function planFor(data, now = Date.now()) {
  const input = buildInput(data, now);
  const result = engine.plan(input);
  for (const d of result.drivers) for (const t of d.tours) t.googleMapsUrl = engine.googleMapsLink(input.shop, t.stops);
  return { ...result, shop: input.shop, assumedDrivers: input.assumedDrivers };
}

// العناوين اللي لسا ما إلها إحداثيات (للطلبات المفتوحة)
function missingAddresses(data) {
  const cache = data.geocodeCache || {}, out = new Set();
  for (const o of data.orders || []) {
    if (!isDelivery(o) || delivered(o) || pointOf(o, cache)) continue;
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

module.exports = { DEFAULT_SHOP, addressOf, addressKey, pointOf, buildInput, planFor, missingAddresses, geocode, activeDrivers };
