'use strict';
// kitchen.js — منطق شاشة المطبخ: شكل الطلب للمطبخ (بدون أي مبلغ) وتغيير حالته.
// معلومات الزبون (اسم، عنوان، هاتف) ظاهرة: المطبخ بيرد على التلفون وبيعرف الطلب منها.
// طلبات Loco Chicken (برنامج Sides منفصل) ما بتظهر هون.
// بيستعمله السيرفر (/api/kitchen/orders) والاختبارات.

const STATES = ['NEW', 'PREPARING', 'READY', 'PICKED_UP'];
const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT', 'DONE']);
const FEE_KINDS = new Set(['DELIVERY_FEE', 'FEE', 'SERVICE_FEE', 'TIP']);
const KEEP_PICKED_UP_MIN = 10; // بعد "تم الاستلام" بيضل الطلب ظاهر 10 دقائق ثم بيختفي

const str = v => (v == null ? '' : String(v)).trim();
const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

function sourceOf(o) {
  const p = str(o.platform || o.source).toUpperCase();
  if (/LIEFERANDO/.test(p)) return 'LIEFERANDO';
  if (/UBER/.test(p)) return 'UBER_EATS';
  if (/WOLT/.test(p)) return 'WOLT';
  if (/LANCH/.test(p)) return 'LANCH';
  return 'NARA';
}

function typeOf(o) {
  const t = str(o.type || o.orderType).toLowerCase();
  if (t === 'pickup') return 'pickup';
  if (t === 'local' || t === 'dine_in' || t === 'dine-in') return 'local';
  return 'delivery';
}

// اسم الخيار بدون الترجمة العربية الملحقة ("Einzel / بدون منيو" → "Einzel")
function optionName(x) { return str(x && x.name).split(' / ')[0].trim(); }

function kitchenItems(cart, catalog) {
  return (Array.isArray(cart) ? cart : [])
    .filter(i => i && !FEE_KINDS.has(str(i.kind).toUpperCase()))
    .map(i => ({
      name: str(i.name) || 'Artikel',
      quantity: Math.max(1, Number(i.quantity) || 1),
      options: (Array.isArray(i.options) ? i.options : [])
        .map(x => ({ name: optionName(x), quantity: Math.max(1, Number(x && x.quantity) || 1) }))
        .filter(x => x.name && !/^einzel$/i.test(x.name) && !/^__/.test(x.name)),
      note: str(i.note || i.notes),
      category: str(i.category) || (catalog ? catalog(str(i.name)) : ''),
    }));
}

// طلب → شكل المطبخ. ما في أي حقل فيه مبلغ.
function kitchenView(o, now = Date.now(), catalog = null) {
  const d = o.delivery || {};
  const created = orderTime(o) ?? now;
  const prep = Math.max(1, Number(o.preparationMinutes || d.preparationMinutes || o.prepMinutes) || 20);
  // وقت لازم يكون جاهز: من المنصة (dueAt - وقت التوصيل) أو من وقت الطلب + التحضير
  const platformStart = ms(o.kitchenStartAt);
  const readyBy = platformStart ? platformStart + prep * 60000 : created + prep * 60000;
  const notes = [str(d.notes), str(d.extra), str(o.remarks), str(o.note)].filter(Boolean);
  return {
    id: o.id,
    displayCode: str(o.displayCode || o.externalOrderCode) || ('NARA-' + str(o.id).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()),
    source: sourceOf(o),
    type: typeOf(o),
    table: str(o.table),
    customerName: str(d.name || o.customerName),
    phone: str(d.phone || o.customerPhone),
    address: str(d.address) || [str(d.street), str(d.house || d.houseNumber)].filter(Boolean).join(' '),
    city: [str(d.postal || d.postalCode), str(d.city)].filter(Boolean).join(' '),
    floor: str(d.floor),
    notes: notes.join(' · '),
    items: kitchenItems(o.cart, catalog),
    createdAt: new Date(created).toISOString(),
    readyBy: new Date(readyBy).toISOString(),
    scheduled: !!o.requestedAt,
    preparationMinutes: prep,
    kitchenStatus: STATES.includes(str(o.kitchenStatus).toUpperCase()) ? str(o.kitchenStatus).toUpperCase() : 'NEW',
    kitchenStatusAt: o.kitchenStatusAt || null,
    employeeName: str(o.employeeName || o.createdByName),
  };
}

// Loco Chicken شغّالة ببرنامج Sides لحالها وبتطبع عندها، فطلباتها ما بتظهر على تابلت مطبخنا
function isOtherStation(o) {
  return /loco/i.test(str(o.brand || o.brandName || o.restaurantName || o.restaurant)) || /^SIDES/i.test(str(o.source || o.platform));
}

const MAX_AGE_H = 12; // طلب مفتوح أقدم من 12 ساعة = منسي من يوم قبل، مش شغل المطبخ هلق
// وقت الطلب: أول تاريخ صالح (acceptedAt أحياناً نص مكسور من الجسر القديم متل "22:27 - 4 Oct")،
// وإذا ما في، طلبات الكاشير رقمها هو وقت إنشائها بالميلي ثانية
function orderTime(o) {
  for (const k of ['acceptedAt', 'createdAt', 'placedAt']) {
    const v = o && o[k];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) { const t = Date.parse(v); if (Number.isFinite(t)) return t; }
  }
  const id = String(o && o.id || '');
  if (/^1\d{12}$/.test(id)) return Number(id);
  return null;
}
function isStale(o, now = Date.now()) {
  const t = orderTime(o);
  return t != null && now - t > MAX_AGE_H * 3600000;
}

// "مدفوع" مش يعني "خلص": طلب الكاشير بيصير COMPLETED لما ينضرب Cash/Karte، بس لسا لازم ينطبخ ويتوصّل.
// منعتبره منتهي بس إذا: ملغي، أو انوصل، أو المنصة قالت DONE، أو طلب منصة مغلق، أو طلب كاشير مدفوع من أكتر من 90 دقيقة.
const PAID_GRACE_MS = 90 * 60000;
const PLATFORM_RE = /^(LIEFERANDO|UBER|WOLT|LANCH|SIDES)/i;
function isClosedForOps(o, now = Date.now()) {
  if (!o) return true;
  const st = str(o.status).toUpperCase();
  if (st === 'CANCELLED' || st === 'STORNIERT') return true;
  if (o.deliveredAt || str(o.liveStage).toUpperCase() === 'DONE') return true;
  if (st === 'COMPLETED' || st === 'DONE') {
    if (PLATFORM_RE.test(str(o.source || o.platform))) return true;
    const t = ms(o.completedAt) ?? orderTime(o);
    return t == null || now - t > PAID_GRACE_MS;
  }
  return false;
}

function isKitchenOrder(o, now = Date.now()) {
  if (!o || isClosedForOps(o, now)) return false;
  if (isStale(o, now)) return false;
  if (isOtherStation(o)) return false;
  if (!Array.isArray(o.cart) || !kitchenItems(o.cart).length) return false;
  if (str(o.kitchenStatus).toUpperCase() === 'PICKED_UP') {
    const at = ms(o.kitchenStatusAt);
    return at != null && now - at < KEEP_PICKED_UP_MIN * 60000;
  }
  return true;
}

// اسم الصنف → اسم الفئة من المنيو (لطلبات الكاشير اللي ما فيها فئة)
function catalogFrom(data) {
  const cats = new Map((data && data.categories || []).map(c => [c.id, str(c.name)]));
  const byName = new Map();
  for (const p of (data && data.products) || []) if (p && p.name) byName.set(str(p.name).toLowerCase(), cats.get(p.categoryId) || '');
  return name => byName.get(str(name).toLowerCase()) || '';
}

function listKitchenOrders(orders, now = Date.now(), catalog = null) {
  const rank = { NEW: 0, PREPARING: 1, READY: 2, PICKED_UP: 3 };
  return (Array.isArray(orders) ? orders : [])
    .filter(o => isKitchenOrder(o, now))
    .map(o => kitchenView(o, now, catalog))
    .sort((a, b) => (rank[a.kitchenStatus] - rank[b.kitchenStatus]) || (Date.parse(a.readyBy) - Date.parse(b.readyBy)));
}

// تغيير حالة المطبخ + مزامنة مرحلة صفحة الطلبات الحية (PREPARE/HANDOVER)
function applyKitchenStatus(order, next, user, now = new Date().toISOString()) {
  const to = str(next).toUpperCase();
  if (!STATES.includes(to)) { const e = new Error('حالة المطبخ غير صالحة'); e.status = 422; throw e; }
  if (isClosedForOps(order, Date.parse(now) || Date.now())) { const e = new Error('الطلب مغلق'); e.status = 409; throw e; }
  const from = STATES.includes(str(order.kitchenStatus).toUpperCase()) ? str(order.kitchenStatus).toUpperCase() : 'NEW';
  order.kitchenStatus = to;
  order.kitchenStatusAt = now;
  order.kitchenStatusBy = user ? str(user.name) : '';
  if (to === 'PREPARING' && !order.preparingAt) order.preparingAt = now;
  if (to === 'READY') order.readyAt = now;
  if (to === 'PICKED_UP') order.pickedUpAt = now;
  const live = str(order.liveStage).toUpperCase() || 'PREPARE';
  if ((to === 'READY' || to === 'PICKED_UP') && live === 'PREPARE') { order.liveStage = 'HANDOVER'; order.liveStageSource = 'NARA'; order.liveStageUpdatedAt = now; }
  if ((to === 'NEW' || to === 'PREPARING') && live === 'HANDOVER') { order.liveStage = 'PREPARE'; order.liveStageSource = 'NARA'; order.liveStageUpdatedAt = now; }
  order.updatedAt = now;
  return { from, to };
}

module.exports = { isClosedForOps, STATES, MAX_AGE_H, isStale, orderTime, kitchenItems, kitchenView, isKitchenOrder, isOtherStation, catalogFrom, listKitchenOrders, applyKitchenStatus };
