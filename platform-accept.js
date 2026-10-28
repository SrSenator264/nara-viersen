'use strict';
// platform-accept.js — استلام طلبات المنصات من تابلت واحد.
// الطلب اللي بيوصل وهو لسا "منتظر موافقة" على المنصة بياخد acceptState = PENDING.
// التابلت بيطلب الاستلام (ACCEPTING) ← السيرفر بيحط أمر بالطابور ← الجسر بيكبس Accept جوّا المنصة
// وبيرجّع النتيجة ← ACCEPTED (وبتنطبع التذكرة) أو FAILED (البطاقة حمرا وبتقدر تعيد المحاولة).
// الطابور بالذاكرة بس: لو السيرفر عمل restart، الأمر الضايع بينتهي بـ FAILED بعد المهلة والموظف بيعيد.

const MIN = 60000;
const WAITING = new Set(['PENDING', 'ACCEPTING', 'FAILED']);
const TIMEOUT_MS = 90000;           // الجسر ما رجّع نتيجة خلال 90 ثانية = فشل
const QR_RE = /^https:\/\/mca\.scoober\.com\/qr\/\?[^\s"'<>]{3,300}$/;

const str = v => (v == null ? '' : String(v)).trim();
const stateOf = o => str(o && o.acceptState).toUpperCase();
const isWaiting = o => WAITING.has(stateOf(o));
const isOpen = o => !['COMPLETED', 'CANCELLED', 'STORNIERT', 'DONE'].includes(str(o && o.status).toUpperCase());
const iso = now => new Date(now).toISOString();
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// Lieferando: الطلب منتظر موافقة إذا لسا مرحلة التحضير، ما إلو confirmed_at، وحالته من الحالات "الجديدة".
// إذا حالة Lieferando الحقيقية للجديد مختلفة عن هالقائمة، ما بيصير شي (الطلب بيدخل وبيتصرف متل قبل).
const LIEF_WAITING_STATUS = /^(new|placed|received|pending|unconfirmed|awaiting_confirmation|to_confirm|open)$/;
function lieferandoNeedsAccept(stage, rawStatus, confirmedAt) {
  return stage === 'PREPARE' && !confirmedAt && LIEF_WAITING_STATUS.test(str(rawStatus).toLowerCase());
}

// Uber Eats و Loco (Sides) بيقبلوا الطلب لحالن على المنصة، فالقبول عندنا داخلي بس (بدون كبسة على المنصة).
// الطلب الجديد بينحجز على تابلت التجميع، ولما الموظف يكبس ✅ بينطبع على الطابعة وبيروح للمطبخ.
const INTERNAL = new Set(['UBER_EATS', 'SIDES']);
const FRESH_MS = 10 * MIN;       // طلب أقدم من هيك (مثلاً بعد إعادة تشغيل الجسر) ما منحجزه
const LATE_STATUS = /ready|pick|courier|route|deliver|dispatch|complete|cancel|done|finish/i;
const isInternalSource = o => INTERNAL.has(str(o && (o.source || o.platform)).toUpperCase());
function holdInternally(order, now) {
  if (!isInternalSource(order) || !isOpen(order) || order.acceptState) return false;
  const at = Date.parse(order.placedAt || order.createdAt || '') || 0;
  if (!at || now - at > FRESH_MS) return false;
  return !LATE_STATUS.test(str(order.platformStatus));
}

let queue = [];
let seq = 0;
function reset() { queue = []; seq = 0; }
const dropQueued = orderId => { queue = queue.filter(c => c.orderId !== String(orderId)); };

// يتنادى من استيراد الطلبات. بيرجّع: 'HOLD' (طلب جديد منتظر، ما منطبعه) | 'PRINT' (انقبل من المنصة، اطبع) | 'NONE'
function onImport(order, isNew, now = Date.now()) {
  if (!order) return 'NONE';
  if (isNew) {
    if ((order.needsAccept === true && isOpen(order)) || holdInternally(order, now)) {
      if (isInternalSource(order)) order.acceptInternal = true;
      order.acceptState = 'PENDING';
      order.pendingSince = iso(now);
      return 'HOLD';
    }
    return 'NONE';
  }
  if (isWaiting(order) && order.needsAccept === false && isOpen(order)) {
    order.acceptedVia = stateOf(order) === 'ACCEPTING' ? 'NARA' : 'PLATFORM';
    order.acceptState = 'ACCEPTED';
    order.acceptedAt = iso(now);
    order.acceptError = '';
    dropQueued(order.id);
    return 'PRINT';
  }
  return 'NONE';
}

// طلبات علقت بـ ACCEPTING أكتر من المهلة → FAILED. بيرجّع true إذا تغيّر شي.
function sweep(data, now = Date.now()) {
  let changed = false;
  for (const o of (data && data.orders) || []) {
    if (stateOf(o) !== 'ACCEPTING') continue;
    const at = Date.parse(o.acceptRequestedAt || '') || 0;
    if (now - at < TIMEOUT_MS) continue;
    o.acceptState = 'FAILED';
    o.acceptError = 'Keine Antwort von der Plattform (Zeitüberschreitung)';
    o.updatedAt = iso(now);
    dropQueued(o.id);
    changed = true;
  }
  return changed;
}

// الموظف كبس ✅ استلام
function requestAccept(data, orderId, minutes, user, now = Date.now()) {
  const o = ((data && data.orders) || []).find(x => String(x.id) === String(orderId));
  if (!o) throw httpError(404, 'Bestellung nicht gefunden');
  const min = Math.round(Number(minutes));
  if (!(min >= 5 && min <= 240)) throw httpError(422, 'Minuten 5–240');
  sweep(data, now);
  const st = stateOf(o);
  if (st === 'ACCEPTED') return { state: 'ACCEPTED', already: true };   // مرة وحدة بس: كبسة مكررة ما بتعمل شي
  if (st === 'ACCEPTING') throw httpError(409, 'Wird bereits angenommen');
  if (st !== 'PENDING' && st !== 'FAILED') throw httpError(422, 'Bestellung wartet nicht auf Annahme');
  if (!isOpen(o)) throw httpError(409, 'Bestellung ist nicht mehr offen');
  if (o.acceptInternal || isInternalSource(o)) {      // المنصة قبلته لحالها: قبول داخلي فوري
    o.acceptState = 'ACCEPTED'; o.acceptedVia = 'NARA'; o.acceptedAt = iso(now); o.acceptMinutes = min;
    o.acceptBy = str(user && user.name); o.acceptError = ''; o.updatedAt = iso(now);
    return { state: 'ACCEPTED', internal: true, printNow: true };
  }
  o.acceptState = 'ACCEPTING';
  o.acceptMinutes = min;
  o.acceptRequestedAt = iso(now);
  o.acceptBy = str(user && user.name);
  o.acceptError = '';
  o.updatedAt = iso(now);
  dropQueued(o.id);
  queue.push({
    id: 'acc_' + (++seq) + '_' + now.toString(36),
    type: 'ACCEPT',
    orderId: String(o.id),
    source: str(o.source || o.platform).toUpperCase(),
    brand: str(o.brand || o.brandName),
    externalOrderCode: str(o.externalOrderCode),
    displayCode: str(o.displayCode),
    minutes: min,
    createdAt: iso(now),
    claimedAt: null,
  });
  return { state: 'ACCEPTING' };
}

// الجسر بيسأل: في أوامر إلي؟ (brand فاضي = الجسر الأساسي؛ جسر علامة ثانية بيبعت اسم علامته)
function claim(source, brand, now = Date.now()) {
  queue = queue.filter(c => now - Date.parse(c.createdAt) < TIMEOUT_MS);
  const src = str(source).toUpperCase(), b = str(brand).toLowerCase();
  const out = [];
  for (const c of queue) {
    if (c.claimedAt || c.source !== src || str(c.brand).toLowerCase() !== b) continue;
    c.claimedAt = iso(now);
    out.push({ ...c });
  }
  return out;
}

// الجسر رجّع النتيجة. الحقيقة عند المنصة: إذا انقبل فعلاً بيصير ACCEPTED حتى لو الحالة عنا FAILED.
function complete(data, p, now = Date.now()) {
  const id = str(p && p.orderId);
  const o = ((data && data.orders) || []).find(x => String(x.id) === id);
  if (!o) return { orderId: id, printNow: false, missing: true };
  dropQueued(o.id);
  if (stateOf(o) === 'ACCEPTED') return { orderId: o.id, printNow: false };
  if (p.ok) {
    o.acceptState = 'ACCEPTED';
    o.acceptedAt = iso(now);
    o.acceptedVia = 'NARA';
    o.acceptError = '';
    o.needsAccept = false;
    o.confirmedAt = o.confirmedAt || iso(now);
    if (QR_RE.test(str(p.qrUrl))) o.deliveryQrUrl = str(p.qrUrl);
    o.updatedAt = iso(now);
    return { orderId: o.id, printNow: true };
  }
  o.acceptState = 'FAILED';
  o.acceptError = str(p.error).slice(0, 160) || 'Fehler bei der Annahme';
  o.updatedAt = iso(now);
  return { orderId: o.id, printNow: false };
}

// أي أوراق بتنطبع لهالطلب تلقائياً → [[kind, flag], ...]. opts.onAccept = انقبل من التابلت (أو من المنصة).
function printJobs(o, cfg, opts) {
  const acc = !!(opts && opts.onAccept), auto = (cfg && cfg.auto) || {};
  const web = /^WEB$/i.test(str(o && o.source)) && auto.webOrder !== false;
  const jobs = [];
  if ((web || auto.kitchenOnPlatformOrder || (acc && auto.kitchenOnAccept)) && !o.autoKitchenPrintedAt) jobs.push(['kitchen', 'autoKitchenPrintedAt']);
  if ((web || auto.receiptOnPlatformOrder || (acc && auto.receiptOnAccept)) && !o.autoReceiptPrintedAt) jobs.push(['customer', 'autoReceiptPrintedAt']);
  return jobs;
}

// الوقت المقترح: جاهزية المطبخ الفعلية، مقرّبة لأقرب 5 دقايق لفوق، بين 10 و240
function suggest(readyAtIso, now = Date.now()) {
  const m = (Date.parse(readyAtIso) - now) / MIN;
  if (!Number.isFinite(m)) return 20;
  return Math.min(240, Math.max(10, Math.ceil(m / 5) * 5));
}

// قائمة الطلبات المنتظرة للتابلت. deps.forecast(data, now, cart) و deps.view(order) بيجوا من السيرفر.
function pending(data, now, deps) {
  const changed = sweep(data, now);
  const since = o => Date.parse(o.pendingSince || o.placedAt || o.createdAt || '') || 0;
  const list = ((data && data.orders) || []).filter(o => isWaiting(o) && isOpen(o)).sort((a, b) => since(a) - since(b));
  const orders = list.map(o => {
    let minutes = 20, queueLen = 0;
    try { const fc = deps.forecast(data, now, o.cart); minutes = suggest(fc.extra.readyAt, now); queueLen = fc.queue; } catch (e) { /* افتراضي */ }
    const v = deps.view(o);
    const pm = str(o.payment && o.payment.method || o.paymentMethod).toUpperCase();
    return {
      id: o.id,
      displayCode: v.displayCode,
      source: str(o.source || o.platform).toUpperCase(),
      brand: str(o.brand || o.brandName),
      type: v.type,
      state: stateOf(o),
      error: str(o.acceptError),
      suggestedMinutes: minutes,
      queue: queueLen,
      placedAt: o.placedAt || o.createdAt || null,
      pendingSince: o.pendingSince || null,
      asap: !o.requestedAt,
      requestedAt: o.requestedAt || null,
      customerName: v.customerName,
      city: v.city,
      notes: v.notes,
      items: v.items,
      payment: { method: pm === 'CASH' ? 'CASH' : 'ONLINE', cashDueCents: pm === 'CASH' ? Number(o.cashDueCents || o.totalCents) || 0 : 0 },
    };
  });
  return { changed, orders, count: orders.length, needAction: orders.filter(x => x.state !== 'ACCEPTING').length };
}

module.exports = { printJobs, isWaiting, lieferandoNeedsAccept, onImport, requestAccept, claim, complete, sweep, pending, suggest, reset, TIMEOUT_MS };
