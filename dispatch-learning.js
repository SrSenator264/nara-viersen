'use strict';
// dispatch-learning.js — البرنامج بيتعلّم من التوصيلات الحقيقية.
// كل ما سائق يسلّم طلب، منقارن الوقت الحقيقي للمشوار مع تقديرنا، ومنحفظ النسبة.
// بعدين التقدير لكل منطقة (رمز بريدي) بينضرب بالنسبة المتعلّمة: إذا Süchteln دايماً أبطأ بـ 30%، النظام بيعرف.
// وكمان بيتعلّم وقت التسليم عند الزبون (من الوصول للطلب اللي بعده).

const MAX_SAMPLES = 400;     // آخر 400 مشوار بس
const ZONE_MIN = 5;          // أقل عدد عينات لنثق بمنطقة لحالها
const RECENT = 40;           // منحسب من آخر 40 عينة
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function store(data) {
  data.dispatchLearning ??= { samples: [] };
  data.dispatchLearning.samples ??= [];
  return data.dispatchLearning;
}

// عينة: مشوار من نقطة لنقطة، تقديرنا estMin، والحقيقي actualMin
function record(data, { zone, estMin, actualMin, km, driverId, at }) {
  if (!(estMin > 0.5) || !(actualMin > 0)) return null;
  const ratio = clamp(actualMin / estMin, 0.4, 3);
  // مشوار غريب جداً (السائق وقف بالطريق مثلاً): منسجّله بس ما منخليه يأثّر كتير
  const sample = { zone: String(zone || ''), ratio: Math.round(ratio * 1000) / 1000, estMin: Math.round(estMin * 10) / 10, actualMin: Math.round(actualMin * 10) / 10, km: km != null ? Math.round(km * 100) / 100 : null, driverId: driverId || null, at: at || new Date().toISOString() };
  const L = store(data);
  L.samples.push(sample);
  if (L.samples.length > MAX_SAMPLES) L.samples.splice(0, L.samples.length - MAX_SAMPLES);
  return sample;
}

function recordStop(data, { minutes, at }) {
  if (!(minutes > 0) || minutes > 30) return;
  const L = store(data);
  L.stopSamples ??= [];
  L.stopSamples.push({ minutes: Math.round(minutes * 10) / 10, at: at || new Date().toISOString() });
  if (L.stopSamples.length > 200) L.stopSamples.splice(0, L.stopSamples.length - 200);
}

// معامل التصحيح لكل منطقة + العام + وقت التسليم المتعلّم
function model(data) {
  const S = (data.dispatchLearning && data.dispatchLearning.samples) || [];
  const recent = S.slice(-RECENT * 4);
  const global = median(recent.slice(-RECENT).map(s => s.ratio));
  const byZone = {};
  for (const s of recent) (byZone[s.zone] ??= []).push(s.ratio);
  const zones = {};
  for (const [z, xs] of Object.entries(byZone)) if (z && xs.length >= ZONE_MIN) zones[z] = Math.round(median(xs.slice(-RECENT)) * 1000) / 1000;
  const stops = ((data.dispatchLearning && data.dispatchLearning.stopSamples) || []).slice(-RECENT).map(x => x.minutes);
  return {
    samples: S.length,
    global: global == null ? 1 : Math.round(global * 1000) / 1000,
    zones,
    stopMin: stops.length >= ZONE_MIN ? Math.round(median(stops) * 10) / 10 : null,
  };
}

function factorFor(m, zone) {
  if (zone && m.zones[zone] != null) return m.zones[zone];
  return m.global || 1;
}

module.exports = { record, recordStop, model, factorFor, median };
