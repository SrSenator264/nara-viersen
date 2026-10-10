'use strict';
// platform-trips.js — NARA بيتعلّم الخريطة من سواقينّا وهني عم يشتغلوا بتطبيق Lieferando.
// Lieferando بيسجّل متى السواق استلم الطلب (pickup) ومتى سلّمه (delivered). نحنا منعرف موقع الزبون.
// فكل طلب = مشوار حقيقي بالدقايق. الطلبات اللي انستلمت سوا (نفس السواق، نفس الدقيقة) = جولة وحدة:
// أول زبون من المحل، والتاني من عند الأول، إلخ. وبنقارن الوقت الحقيقي مع تقديرنا ومنتعلّم لكل منطقة.
// منرمي العينات الغلط: سواق كبس "استلمت" و"سلّمت" سوا (أقل من دقيقة)، أو نسي يكبس (أكتر من 45 دقيقة).

const fs = require('fs');
const path = require('path');
const learning = require('./dispatch-learning.js');
const dispatch = require('./dispatch-service.js');
const engine = require('./dispatch-engine.js');

const MIN = 60000;
const LEG_MIN = 1, LEG_MAX = 45;          // دقايق: مشوار أقصر أو أطول = كبسة غلط
const SAME_TOUR_MS = 3 * MIN;             // استلام خلال 3 دقايق من نفس السواق = نفس الجولة
const SETTLE_MS = 3 * 3600000;            // جولة ما خلصت بعد 3 ساعات: منتعلّم من اللي خلص منها
const str = v => (v == null ? '' : String(v)).trim();
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// من JSON الخام تبع Lieferando: بس الأوقات الحقيقية (قبل التسليم، delivery_time هو تقدير مو حقيقة)
function timesFromLieferando(x) {
  const status = str(x && x.status).toLowerCase();
  const pickup = /in_delivery|delivered/.test(status) ? iso(x.delivery_service_pickup_time) : null;
  const delivered = status === 'delivered' ? iso(x.delivery_service_delivery_time) : null;
  const courier = Array.isArray(x && x.couriers) && x.couriers[0] ? str(x.couriers[0].full_name || x.couriers[0].name) : '';
  return { platformPickupAt: pickup, platformDeliveredAt: delivered, courierName: courier };
}

// تعبئة الطلبات القديمة من ملفات الجسر الخام (D:/NARA-Playwright/data/raw)
function backfillFromRaw(data, rawDir) {
  let files = [];
  try { files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json')); } catch { return 0; }
  const byCode = new Map();
  for (const o of data.orders || []) if (str(o.source).toUpperCase() === 'LIEFERANDO') { byCode.set(str(o.externalOrderCode), o); if (o.displayCode) byCode.set('#' + str(o.displayCode), o); }
  let changed = 0;
  for (const f of files) {
    let x; try { x = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')); } catch { continue; }
    const o = byCode.get(str(x.id)) || byCode.get('#' + str(x.public_reference));
    if (!o) continue;
    const t = timesFromLieferando(x);
    for (const k of ['platformPickupAt', 'platformDeliveredAt']) if (t[k] && o[k] !== t[k]) { o[k] = t[k]; changed++; }
    if (t.courierName && !o.courierName) { o.courierName = t.courierName; changed++; }
  }
  return changed;
}

// الطلبات اللي فيها أوقات حقيقية بس لسا ما إلها موقع على الخريطة (لحتى السيرفر يدوّر عليها)
function missingAddresses(data) {
  const cache = data.geocodeCache || {}, out = new Set();
  for (const o of data.orders || []) {
    if (!o.platformPickupAt || !o.platformDeliveredAt || dispatch.pointOf(o, cache)) continue;
    const a = dispatch.addressOf(o), hit = cache[dispatch.addressKey(a)];
    if (a && !(hit && hit.failedAt)) out.add(a);
  }
  return [...out];
}

function learn(data, now = Date.now()) {
  const L = (data.dispatchLearning ??= { samples: [] });
  L.platformSeen ??= {};
  const cache = data.geocodeCache || {};
  const shop = dispatch.shopOf(data);
  const tm = dispatch.travelModel(data);
  const stopMin = tm.model.stopMin || tm.cfg.stopMin;
  const trips = (data.orders || []).filter(o => o.platformPickupAt && !L.platformSeen[o.id] && !o.isTest)
    .map(o => ({ o, pu: Date.parse(o.platformPickupAt), dl: Date.parse(o.platformDeliveredAt), who: str(o.courierName) || '?' }))
    .filter(t => Number.isFinite(t.pu)).sort((a, b) => a.pu - b.pu);
  // جولات: نفس السواق واستلام متقارب
  const tours = [];
  for (const t of trips) {
    const tour = tours.find(x => x.who === t.who && t.pu - x.last <= SAME_TOUR_MS);
    if (tour) { tour.items.push(t); tour.last = t.pu; } else tours.push({ who: t.who, start: t.pu, last: t.pu, items: [t] });
  }
  const res = { learned: 0, skipped: 0, waiting: 0, missingPos: 0 };
  for (const tour of tours) {
    const open = tour.items.some(t => !Number.isFinite(t.dl));
    if (open && now - tour.start < SETTLE_MS) { res.waiting += tour.items.length; continue; } // لسا عم يوزّع
    if (tour.items.some(t => Number.isFinite(t.dl) && !dispatch.pointOf(t.o, cache))) { res.missingPos++; continue; } // ناطرين الموقع
    const done = tour.items.filter(t => Number.isFinite(t.dl)).sort((a, b) => a.dl - b.dl);
    let from = shop, fromT = tour.start, prevDl = null;
    for (const t of done) {
      const to = dispatch.pointOf(t.o, cache);
      const startT = prevDl == null ? fromT : prevDl + stopMin * MIN;
      const actualMin = (t.dl - startT) / MIN;
      const tapTogether = prevDl != null ? t.dl - prevDl < 30000 : t.dl - t.pu < 30000;
      if (!tapTogether && actualMin >= LEG_MIN && actualMin <= LEG_MAX) {
        learning.record(data, { zone: str((t.o.delivery || {}).postal || (t.o.delivery || {}).postalCode).slice(0, 5), estMin: tm.base(from, to), actualMin, km: engine.haversineKm(from, to), driverId: 'LIEFERANDO:' + t.who, at: new Date(t.dl).toISOString() });
        L.platformSeen[t.o.id] = 'LEARNED'; res.learned++;
      } else { L.platformSeen[t.o.id] = 'SKIPPED'; res.skipped++; }
      from = to; prevDl = t.dl;
    }
    for (const t of tour.items) if (!L.platformSeen[t.o.id]) L.platformSeen[t.o.id] = 'NO_DELIVERY';
  }
  // ما منخلي القائمة تكبر للأبد
  const ids = Object.keys(L.platformSeen);
  if (ids.length > 5000) for (const id of ids.slice(0, ids.length - 5000)) delete L.platformSeen[id];
  L.platformLearned = (L.platformLearned || 0) + res.learned;
  return res;
}

module.exports = { timesFromLieferando, backfillFromRaw, missingAddresses, learn, LEG_MIN, LEG_MAX };
