'use strict';
// delivery-quote.js — اقتراح وقت التسليم لطلب جديد من المنصات (قبل ما نقبله ونطبعه).
// اللي بيحكمنا: حجم الطلب (وقت المطبخ متعلّم من المطبخ نفسه) + المسافة (وقت السواقة) + شغل المطبخ هلق.
// المطبخ بيشتغل عادي على كذا طلب سوا (settings.kitchen.parallelOrders، الافتراضي 10).
// - طلب فوري: "اقبل بـ X دقيقة" (مدوّر لـ 5) ومقارنة مع وقت المنصة.
// - طلب مجدول (geplant): منلحق ولا لأ؟ وإيمتى لازم نبلّش؟ وإذا ما منلحق: أول وقت منقدر عليه.
// ما في أي مبلغ هون.

const prep = require('./prep-learning.js');
const kitchen = require('./kitchen.js');
const dispatch = require('./dispatch-service.js');

const MIN = 60000;
const str = v => (v == null ? '' : String(v)).trim();
const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const ceil5 = m => Math.max(5, Math.ceil(m / 5) * 5);
const PLATFORM_RE = /^(LIEFERANDO|UBER|WOLT|LANCH)/i;

function settings(data) {
  const q = (data.settings && data.settings.quote) || {};
  return {
    bufferMin: Number.isFinite(Number(q.bufferMin)) ? Number(q.bufferMin) : 5,       // هامش أمان
    unknownDriveMin: Number.isFinite(Number(q.unknownDriveMin)) ? Number(q.unknownDriveMin) : 15, // إذا ما عرفنا العنوان
    freshMin: Number.isFinite(Number(q.freshMin)) ? Number(q.freshMin) : 20,        // قديش بيضل الاقتراح ظاهر
    standardMin: Number.isFinite(Number(q.standardMin)) ? Number(q.standardMin) : 60, // الوقت اللي دايماً منحطّه عالمنصة
  };
}

const isDelivery = o => !/pick|abhol|collect/i.test(str(o.type || o.orderType));

// اقتراح لطلب واحد
function quote(data, o, now = Date.now()) {
  const S = settings(data);
  const tm = dispatch.travelModel(data);
  const cart = Array.isArray(o.cart) ? o.cart : [];
  // أبكر وقت بيجهز فيه إذا بلّشنا فيه هلق (مع الطابور، بدون هالطلب نفسه)
  const others = { ...data, orders: (data.orders || []).filter(x => String(x.id) !== String(o.id)) };
  const fc = prep.forecast(others, now, cart);
  const prepMin = fc.extra ? fc.extra.prepMin : prep.prepMinutes(prep.model(data), cart);
  const readyAt = fc.extra ? ms(fc.extra.readyAt) : now + prepMin * MIN;
  const delivery = isDelivery(o);
  let driveMin = 0, km = null, distanceKnown = true;
  if (delivery) {
    const shop = dispatch.shopOf(data);
    const p = dispatch.pointOf(o, data.geocodeCache || {});
    if (p) {
      driveMin = Math.round(tm.travel(shop, p));
      km = Math.round(require('./dispatch-engine.js').haversineKm(shop, p) * tm.cfg.roadFactor * 10) / 10;
    } else { driveMin = S.unknownDriveMin; distanceKnown = false; }
  }
  const handover = delivery ? (Number(tm.cfg.handoverMin) || 2) : 0;
  const earliestAt = readyAt + (handover + driveMin) * MIN;           // أبكر وصول/استلام
  const out = {
    orderId: o.id,
    code: kitchen.kitchenView(o, now).displayCode,
    source: kitchen.kitchenView(o, now).source,
    type: delivery ? 'delivery' : 'pickup',
    items: prep.cookItems(cart).reduce((s, i) => s + i.qty, 0),
    prepMin: Math.round(prepMin), driveMin, km, distanceKnown,
    queue: fc.queue, slots: fc.slots,
    readyAt: new Date(readyAt).toISOString(),
    earliestAt: new Date(earliestAt).toISOString(),
  };
  const requested = ms(o.requestedAt);
  if (requested && requested > now + 5 * MIN && !o.asap) {
    // مجدول: لازم نبلّش قبل الموعد بـ (سواقة + تحميل + تحضير + هامش)
    const latestStart = requested - (driveMin + handover + prepMin + S.bufferMin) * MIN;
    const ok = earliestAt + S.bufferMin * MIN <= requested;
    Object.assign(out, {
      scheduled: true,
      requestedAt: new Date(requested).toISOString(),
      feasible: ok,
      startAt: new Date(Math.max(now, latestStart)).toISOString(),
      // إذا ما منلحق: أول وقت منقدر عليه، مدوّر لـ 5 دقايق
      suggestedAt: ok ? new Date(requested).toISOString() : new Date(Math.ceil((earliestAt + S.bufferMin * MIN) / (5 * MIN)) * 5 * MIN).toISOString(),
    });
  } else {
    const minutes = ceil5((earliestAt - now) / MIN + S.bufferMin);
    // وقت المنصة: من القبول للتسليم المتوقع
    const base = ms(o.confirmedAt || o.acceptedAt || o.placedAt) || now;
    const due = ms(o.dueAt || o.etaAt);
    // إذا المنصة عطت وقت منستعملو، وإلا الوقت الثابت تبعنا (60 د)
    const platformMin = due ? Math.round((due - base) / MIN) : S.standardMin;
    Object.assign(out, {
      scheduled: false,
      recommendMin: minutes,
      deliverAt: new Date(now + minutes * MIN).toISOString(),
      platformMin, standardMin: S.standardMin,
      // الوقت اللي لازم ينكتب: الثابت إذا بيكفي، وإلا اقتراحنا
      setMin: Math.max(minutes, S.standardMin),
      addMin: Math.max(0, minutes - platformMin),
    });
  }
  return out;
}

// الطلبات الجديدة من المنصات اللي لسا ما بلّش فيها المطبخ
function freshQuotes(data, now = Date.now()) {
  const S = settings(data);
  return (data.orders || [])
    .filter(o => PLATFORM_RE.test(str(o.platform || o.source)) && !kitchen.isClosedForOps(o, now) && !kitchen.isOtherStation(o)
      && str(o.kitchenStatus || 'NEW').toUpperCase() === 'NEW' && Array.isArray(o.cart) && o.cart.length)
    .filter(o => {
      const t = ms(o.placedAt || o.createdAt || o.acceptedAt);
      return t != null && now - t < S.freshMin * MIN;
    })
    .map(o => { try { return quote(data, o, now); } catch (e) { return null; } })
    .filter(Boolean);
}

module.exports = { quote, freshQuotes, settings };
