'use strict';
// dispatch-engine.js — عقل التوزيع: هدفه الوحيد إنو كل طلب يوصل بأسرع وقت.
// - السائق اللي بيقدر يوصّل الطلب أبكر بياخده (مش "الدور").
// - الطلبات بنفس الاتجاه بتتجمّع بجولة وحدة، وترتيب المحطات حسب الأقرب والأضيق وقتاً.
// - وقت رجعة كل سائق بينحسب من موقعه (GPS) والمحطات الباقية عنده.
// - بسائق واحد: بيقرر شو ياخد هلق وشو بيستنى للجولة الجاية.
// بدون أي خدمة مدفوعة: المسافة تقديرية (خط مستقيم × معامل طرق) إلا إذا انعطى travel() من خدمة طرق.

const DEFAULTS = {
  speedKmh: 25,        // سرعة وسطية بالمدينة
  roadFactor: 1.35,    // الطريق الحقيقي أطول من الخط المستقيم
  stopMin: 3,          // وقت تسليم عند كل زبون
  handoverMin: 2,      // تحميل الطلبات بالمحل
  maxStops: 5,         // أقصى طلبات بالجولة
  maxWaitMin: 8,       // أقصى وقت بيستنى فيه السائق طلب تاني ليجهز
  defaultDueMin: 45,   // إذا الطلب ما إله وقت موعود: بعد 45 دقيقة من إنشائه
  latePenalty: 10,     // كل دقيقة تأخير أغلى بـ 10 مرات من دقيقة انتظار عادية
};

const MIN = 60000;
const rad = d => d * Math.PI / 180;
function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

function makeTravel(cfg) {
  if (typeof cfg.travel === 'function') return cfg.travel;
  return (a, b) => (haversineKm(a, b) * cfg.roadFactor / cfg.speedKmh) * 60;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => { for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}

// أحسن ترتيب لمحطات جولة وحدة تبدأ من المحل بوقت depart
function bestRoute(orders, depart, ctx) {
  const { shop, travel, cfg } = ctx;
  let best = null;
  const perms = orders.length <= 6 ? permutations(orders) : [orders.slice().sort((a, b) => a.due - b.due)];
  for (const seq of perms) {
    let t = depart + cfg.handoverMin * MIN, at = shop, late = 0, sumEta = 0;
    const etas = [];
    for (const o of seq) {
      t += travel(at, o) * MIN;
      etas.push(t);
      late += Math.max(0, t - o.due);
      sumEta += t - ctx.now;
      t += cfg.stopMin * MIN;
      at = o;
    }
    const back = t + travel(at, shop) * MIN;
    const score = late / MIN * cfg.latePenalty + sumEta / MIN + (back - depart) / MIN * 0.1;
    if (!best || score < best.score) best = { seq, etas, back, late, score };
  }
  return best;
}

// جولات سائق متتالية: كل جولة بتطلع لما يرجع من اللي قبلها ويكون كل شي فيها جاهز
function simulateDriver(driver, tours, ctx) {
  let free = driver.availableAt, total = 0;
  const out = [];
  for (const orders of tours) {
    const ready = Math.max(...orders.map(o => o.ready));
    const depart = Math.max(free, ready, ctx.now);
    const r = bestRoute(orders, depart, ctx);
    out.push({ orders: r.seq, etas: r.etas, depart, back: r.back, late: r.late });
    total += r.score;
    free = r.back;
  }
  return { tours: out, score: total };
}

// متى السائق بيصير فاضي بالمحل: من موقعه الحالي عبر المحطات الباقية ثم الرجعة
function availability(d, ctx) {
  const { shop, travel, cfg, now } = ctx;
  const stops = (d.remainingStops || []).filter(validPoint);
  let at = validPoint(d.position) ? d.position : shop, t = now;
  if (!stops.length && !validPoint(d.position)) return now;
  for (const s of stops) { t += travel(at, s) * MIN + cfg.stopMin * MIN; at = s; }
  return t + travel(at, shop) * MIN;
}


// تحسين بعد التوزيع الأولي: منجرّب ننقل طلب لجولة تانية، أو نبدّل طلبين بين جولتين،
// ومنقبل التغيير إذا المجموع صار أحسن (أسرع وأقل تأخير). بيصلّح أخطاء "الأول بالدور".
function improve(drivers, state, ctx) {
  const { cfg } = ctx;
  const total = () => drivers.reduce((s, d) => s + state.get(d.id).score, 0);
  const okTour = t => t.length <= cfg.maxStops && Math.max(...t.map(x => x.ready)) - Math.min(...t.map(x => x.ready)) <= cfg.maxWaitMin * MIN;
  const tryApply = (changes) => { // changes: [{d, tours}]
    const before = changes.reduce((s, c) => s + state.get(c.d.id).score, 0);
    const sims = changes.map(c => ({ c, sim: simulateDriver(c.d, c.tours, ctx) }));
    const after = sims.reduce((s, x) => s + x.sim.score, 0);
    return { gain: before - after, apply: () => sims.forEach(({ c, sim }) => { c.d.tours = c.tours; state.set(c.d.id, sim); }) };
  };
  const clean = tours => tours.filter(t => t.length);
  for (let iter = 0; iter < 60; iter++) {
    let best = null;
    const slots = [];
    drivers.forEach(d => d.tours.forEach((t, ti) => t.forEach((o, oi) => slots.push({ d, ti, oi, o }))));
    // نقل طلب
    for (const a of slots) {
      for (const d of drivers) {
        const targets = [...d.tours.map((_, i) => i), d.tours.length];
        for (const ti of targets) {
          if (d === a.d && ti === a.ti) continue;
          const srcTours = a.d.tours.map((t, i) => (i === a.ti ? t.filter(x => x !== a.o) : t));
          const base = d === a.d ? srcTours : d.tours;
          const tgt = base.map((t, i) => (i === ti ? [...t, a.o] : t));
          if (ti === base.length) tgt.push([a.o]);
          if (!okTour(tgt[ti] || [a.o])) continue;
          const changes = d === a.d ? [{ d, tours: clean(tgt) }] : [{ d: a.d, tours: clean(srcTours) }, { d, tours: clean(tgt) }];
          const r = tryApply(changes);
          if (r.gain > 0.01 && (!best || r.gain > best.gain)) best = r;
        }
      }
    }
    // تبديل طلبين بين جولتين
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.d === b.d && a.ti === b.ti) continue;
      const swap = (tours, d) => tours.map((t, ti) => t.map(x => (d === a.d && ti === a.ti && x === a.o ? b.o : d === b.d && ti === b.ti && x === b.o ? a.o : x)));
      const ta = swap(a.d.tours, a.d), tb = a.d === b.d ? null : swap(b.d.tours, b.d);
      if (!okTour(ta[a.ti]) || !(tb ? okTour(tb[b.ti]) : okTour(ta[b.ti]))) continue;
      const r = tryApply(tb ? [{ d: a.d, tours: ta }, { d: b.d, tours: tb }] : [{ d: a.d, tours: ta }]);
      if (r.gain > 0.01 && (!best || r.gain > best.gain)) best = r;
    }
    if (!best) break;
    best.apply();
  }
  return total();
}

function plan(input) {
  const cfg = { ...DEFAULTS, ...(input.config || {}) };
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const shop = input.shop;
  if (!validPoint(shop)) throw new Error('shop location (lat/lng) is required');
  const ctx = { cfg, now, shop, travel: makeTravel({ ...cfg, travel: input.travel }) };

  const unplaced = [];
  const orders = [];
  for (const o of input.orders || []) {
    if (!validPoint(o)) { unplaced.push({ id: o.id, reason: 'NO_LOCATION' }); continue; }
    const created = Number(new Date(o.createdAt || now));
    orders.push({
      id: o.id, code: o.code || o.id, lat: o.lat, lng: o.lng, zone: o.zone || '',
      ready: Math.max(now, Number(new Date(o.readyAt || now))),
      due: o.dueAt ? Number(new Date(o.dueAt)) : created + cfg.defaultDueMin * MIN,
    });
  }
  const drivers = (input.drivers || []).filter(d => d && d.active !== false).map(d => ({ id: d.id, name: d.name, availableAt: availability(d, ctx), tours: [] }));
  if (!drivers.length) return { ok: false, reason: 'NO_DRIVERS', drivers: [], assignments: [], unplaced: [...unplaced, ...orders.map(o => ({ id: o.id, reason: 'NO_DRIVERS' }))] };

  // الأضيق وقتاً أولاً
  orders.sort((a, b) => a.due - b.due || a.ready - b.ready);
  const state = new Map(drivers.map(d => [d.id, simulateDriver(d, [], ctx)]));

  for (const o of orders) {
    let best = null;
    for (const d of drivers) {
      const base = state.get(d.id).score;
      const options = [];
      // ضمّه لجولة مخططة (نفس الاتجاه بيطلع أرخص لأن الالتفاف أقل)
      d.tours.forEach((t, i) => {
        if (t.length >= cfg.maxStops) return;
        const tReady = Math.max(...t.map(x => x.ready));
        if (o.ready > tReady + cfg.maxWaitMin * MIN) return; // ما منخلّي جولة تستنى كتير
        options.push(d.tours.map((x, j) => (j === i ? [...x, o] : x)));
      });
      // أو جولة جديدة بعد آخر جولة عنده
      options.push([...d.tours, [o]]);
      for (const tours of options) {
        const sim = simulateDriver(d, tours, ctx);
        const delta = sim.score - base;
        if (!best || delta < best.delta) best = { d, tours, sim, delta };
      }
    }
    best.d.tours = best.tours;
    state.set(best.d.id, best.sim);
  }

  improve(drivers, state, ctx);

  const assignments = [];
  const out = drivers.map(d => {
    const sim = state.get(d.id);
    const tours = sim.tours.map((t, i) => {
      t.orders.forEach((o, k) => assignments.push({
        orderId: o.id, code: o.code, driverId: d.id, driverName: d.name, tour: i + 1, stop: k + 1,
        departAt: new Date(t.depart).toISOString(), etaAt: new Date(t.etas[k]).toISOString(),
        lateMin: Math.max(0, Math.round((t.etas[k] - o.due) / MIN)),
      }));
      return {
        tour: i + 1, departAt: new Date(t.depart).toISOString(), backAt: new Date(t.back).toISOString(),
        stops: t.orders.map((o, k) => ({ orderId: o.id, code: o.code, lat: o.lat, lng: o.lng, etaAt: new Date(t.etas[k]).toISOString() })),
      };
    });
    return { driverId: d.id, name: d.name, freeAt: new Date(d.availableAt).toISOString(), tours };
  });
  return { ok: true, generatedAt: new Date(now).toISOString(), drivers: out, assignments, unplaced };
}

// رابط ملاحة Google Maps للسائق (مجاني، بدون مفتاح): من المحل عبر المحطات بالترتيب ورجوع للمحل
function googleMapsLink(shop, stops) {
  const p = x => `${x.lat},${x.lng}`;
  const pts = stops.filter(validPoint);
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const q = new URLSearchParams({ api: '1', origin: p(shop), destination: p(last), travelmode: 'driving' });
  if (pts.length > 1) q.set('waypoints', pts.slice(0, -1).map(p).join('|'));
  return 'https://www.google.com/maps/dir/?' + q.toString();
}

module.exports = { DEFAULTS, plan, googleMapsLink, haversineKm };
