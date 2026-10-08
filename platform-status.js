'use strict';
// platform-status.js — حالة جسور المنصات (Lieferando، لاحقاً Uber Eats…) بالذاكرة.
// الجسر بيبعت heartbeat كل دقيقة وتنبيه (alert) لما ينطلب تسجيل دخول أو توقف الطلبات.
// الكاشير بيسأل /api/platform-orders/status وبيعرض: شغّال / لازم تسجيل دخول / مسكّر.

const STALE_MS = 3 * 60000;     // ما في heartbeat من 3 دقايق = الجسر مسكّر
const SOURCES = ['LIEFERANDO', 'UBER_EATS', 'WOLT', 'LANCH', 'SIDES'];
const state = new Map();

const src = v => String(v || '').toUpperCase();
const isoOr = (v, d) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : d);

function heartbeat(p, now = Date.now()) {
  const s = src(p && p.source);
  if (!SOURCES.includes(s)) throw Error('Unsupported platform source.');
  const cur = state.get(s) || {};
  const nowIso = new Date(now).toISOString();
  const next = { ...cur, source: s, bridge: String(p.bridge || cur.bridge || ''), lastHeartbeatAt: nowIso, lastOkAt: isoOr(p.lastOkAt, cur.lastOkAt || null), loggedOut: !!p.loggedOut };
  // وصلت بيانات بعد التنبيه؟ التنبيه انحلّ
  if (next.alert && next.lastOkAt && Date.parse(next.lastOkAt) > Date.parse(next.alert.at)) delete next.alert;
  state.set(s, next);
  return view(s, now);
}

function alert(p, now = Date.now()) {
  const s = src(p && p.source);
  if (!SOURCES.includes(s)) throw Error('Unsupported platform source.');
  const type = String(p.type || '').toUpperCase().replace(/[^A-Z_]/g, '').slice(0, 40) || 'UNKNOWN';
  const cur = state.get(s) || { source: s };
  state.set(s, { ...cur, lastHeartbeatAt: new Date(now).toISOString(), alert: { type, at: new Date(now).toISOString() } });
  return view(s, now);
}

// state: ok | login | nodata | down
function view(s, now = Date.now()) {
  const x = state.get(s);
  if (!x) return { source: s, state: 'down', lastHeartbeatAt: null, lastOkAt: null };
  let st = 'ok';
  if (!x.lastHeartbeatAt || now - Date.parse(x.lastHeartbeatAt) > STALE_MS) st = 'down';
  else if (x.loggedOut || (x.alert && x.alert.type === 'SESSION_EXPIRED')) st = 'login';
  else if (x.alert && x.alert.type === 'NO_DATA') st = 'nodata';
  return { source: s, state: st, bridge: x.bridge || '', lastHeartbeatAt: x.lastHeartbeatAt || null, lastOkAt: x.lastOkAt || null, alert: x.alert ? x.alert.type : null };
}

// بس المنصات اللي إلها جسر شغّال أو كان شغّال (Lieferando دايماً بتبين)
function list(now = Date.now()) {
  const keys = new Set(['LIEFERANDO', 'SIDES', ...state.keys()]);
  return [...keys].map(s => view(s, now));
}

function reset() { state.clear(); }

module.exports = { heartbeat, alert, view, list, reset, STALE_MS };
