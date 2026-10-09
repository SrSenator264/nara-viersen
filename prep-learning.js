'use strict';
// prep-learning.js — البرنامج بيتعلّم قديش كل صنف بياخد بالمطبخ، وبيتوقع إيمتى الطلب بيخلص.
// - كل ما المطبخ يضغط "ابدأ" ثم "جاهز"، منسجّل المدة الحقيقية مع أصناف الطلب.
// - لكل صنف (مثلاً منيو Crunchy) منحسب الوسيط من الطلبات اللي فيها.
// - وقت الطلب = أبطأ صنف فيه + شوي لكل قطعة زيادة.
// - الطابور: المطبخ بيشتغل على كم طلب بنفس الوقت (قابل للتعديل، الافتراضي 10)،
//   فالطلب الجديد بيستنى لحتى يفضى مكان، وهيك منعرف إيمتى رح يجهز فعلياً.

const MIN = 60000;
const DEFAULT_PREP = 12;     // قبل ما يتعلّم شي
const PER_EXTRA = 0.6;       // دقيقة لكل قطعة زيادة
const MIN_SAMPLES = 3;
const MAX_SAMPLES = 600;
const FEE = new Set(['DELIVERY_FEE', 'FEE', 'SERVICE_FEE', 'TIP', 'EXTRA']); // EXTRA (كاسة، صحن…) ما بينطبخ
const DRINK = /getr[äa]nk|drink|cola|fanta|sprite|wasser|water|saft|juice|limo|ayran|iced tea|eistee/i;

const str = v => (v == null ? '' : String(v)).trim();
const keyOf = name => str(name).toLowerCase().replace(/\s+/g, ' ');
function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// الأصناف اللي بتنطبخ (بدون رسوم ومشروبات جاهزة)
function cookItems(cart) {
  return (Array.isArray(cart) ? cart : []).filter(i => i && !FEE.has(str(i.kind).toUpperCase()) && !DRINK.test(str(i.name) + ' ' + str(i.category)))
    .map(i => ({ key: keyOf(i.name), name: str(i.name), qty: Math.max(1, Number(i.quantity) || 1) }));
}

function store(data) { data.prepLearning ??= { samples: [] }; data.prepLearning.samples ??= []; return data.prepLearning; }

// لما الطلب يصير جاهز: منسجّل المدة من "ابدأ" لـ "جاهز"
function recordReady(data, order) {
  const start = Date.parse(order.preparingAt), end = Date.parse(order.readyAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const minutes = (end - start) / MIN;
  if (minutes < 1 || minutes > 90) return null; // نسيوا يضغطوا: ما منتعلّم منه
  const items = cookItems(order.cart);
  if (!items.length) return null;
  const L = store(data);
  const sample = { items: items.map(i => i.key), qty: items.reduce((s, i) => s + i.qty, 0), minutes: Math.round(minutes * 10) / 10, at: order.readyAt };
  L.samples.push(sample);
  if (L.samples.length > MAX_SAMPLES) L.samples.splice(0, L.samples.length - MAX_SAMPLES);
  return sample;
}

function model(data) {
  const S = (data.prepLearning && data.prepLearning.samples) || [];
  const by = {};
  for (const s of S) {
    // منطرح وقت القطع الزيادة لنوصل لوقت الصنف نفسه
    const base = Math.max(1, s.minutes - PER_EXTRA * Math.max(0, s.qty - 1));
    for (const k of new Set(s.items)) (by[k] ??= []).push(base);
  }
  const items = {};
  for (const [k, xs] of Object.entries(by)) if (xs.length >= MIN_SAMPLES) items[k] = Math.round(median(xs.slice(-40)) * 10) / 10;
  const g = median(S.slice(-60).map(s => Math.max(1, s.minutes - PER_EXTRA * Math.max(0, s.qty - 1))));
  return { samples: S.length, items, global: g == null ? DEFAULT_PREP : Math.round(g * 10) / 10 };
}

// وقت تحضير طلب لحاله (بدون طابور)
function prepMinutes(m, cart) {
  const items = cookItems(cart);
  if (!items.length) return 2; // مشروبات بس
  const slowest = Math.max(...items.map(i => m.items[i.key] ?? m.global));
  const qty = items.reduce((s, i) => s + i.qty, 0);
  return Math.round((slowest + PER_EXTRA * Math.max(0, qty - 1)) * 10) / 10;
}

// الطابور: كل الطلبات المفتوحة بالمطبخ، بالترتيب، على عدد أماكن (طلبات بنفس الوقت)
// بيرجّع لكل طلب: إيمتى بيبلّش وإيمتى بيجهز. extraCart = طلب جديد لسا عم ينكتب بالكاشير.
function forecast(data, now = Date.now(), extraCart = null) {
  const m = model(data);
  const slots = Math.max(1, Number(data.settings && data.settings.kitchen && data.settings.kitchen.parallelOrders) || 10);
  const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT', 'DONE']);
  const stale = o => require('./kitchen.js').isStale(o, now);
  const open = (data.orders || []).filter(o => !require('./kitchen.js').isClosedForOps(o, now) && !stale(o) && cookItems(o.cart).length
    && !['READY', 'PICKED_UP'].includes(require('./kitchen.js').kitchenStatusOf(o))
    && !/loco/i.test(str(o.brand || o.brandName)) && !/^SIDES/i.test(str(o.source)));
  const free = Array(slots).fill(now);
  const out = {};
  // اللي عم ينطبخ هلق بياخد مكان لحتى يخلص
  const cooking = open.filter(o => require('./kitchen.js').kitchenStatusOf(o) === 'PREPARING').sort((a, b) => Date.parse(a.preparingAt || 0) - Date.parse(b.preparingAt || 0));
  for (const o of cooking) {
    const start = Date.parse(o.preparingAt) || now, prep = prepMinutes(m, o.cart);
    const end = Math.max(now + MIN, start + prep * MIN);
    free.sort((a, b) => a - b); free[0] = Math.max(free[0], end);
    out[o.id] = { startAt: new Date(start).toISOString(), readyAt: new Date(end).toISOString(), prepMin: prep };
  }
  // الجديدة بالدور (الأقدم أول)
  const waiting = open.filter(o => require('./kitchen.js').kitchenStatusOf(o) === 'NEW')
    .sort((a, b) => Date.parse(a.kitchenStartAt || a.createdAt || a.placedAt || 0) - Date.parse(b.kitchenStartAt || b.createdAt || b.placedAt || 0));
  const place = (cart, notBefore) => {
    free.sort((a, b) => a - b);
    const start = Math.max(free[0], notBefore || now), prep = prepMinutes(m, cart), end = start + prep * MIN;
    free[0] = end;
    return { startAt: new Date(start).toISOString(), readyAt: new Date(end).toISOString(), prepMin: prep };
  };
  for (const o of waiting) out[o.id] = place(o.cart, Date.parse(o.requestedAt ? o.kitchenStartAt : 0) || now);
  const extra = extraCart ? place(extraCart, now) : null;
  return { model: m, slots, orders: out, extra, queue: cooking.length + waiting.length };
}

module.exports = { recordReady, model, prepMinutes, forecast, cookItems, DEFAULT_PREP };
