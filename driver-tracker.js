'use strict';
/* Traccar Client (iPhone) -> Flamo: Positionen im OsmAnd-Format annehmen.
   Jeder Fahrer bekommt einen geheimen Token (steht im Traccar-Client als "Geräte-ID").
   Reine Logik ohne HTTP, damit sie testbar ist. server.js verdrahtet sie. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const MIN_GAP_MS = 2000;            // schneller als alle 2 s wird ignoriert (Spam-Schutz)
const BAD_LIMIT = 20, BAD_WINDOW_MS = 10 * 60000; // 20 falsche Tokens pro IP / 10 min -> gesperrt

function newToken() { return 'trk_' + crypto.randomBytes(24).toString('base64url'); }

function createStore(file) {
  let tokens = {}; // employeeId -> { token, createdAt }
  try { tokens = JSON.parse(fs.readFileSync(file, 'utf8')).tokens || {}; } catch { tokens = {}; }
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ tokens }, null, 1)); };
  return {
    get: id => (tokens[id] ? tokens[id].token : null),
    ensure(id) { if (!tokens[id]) { tokens[id] = { token: newToken(), createdAt: new Date().toISOString() }; save(); } return tokens[id].token; },
    regenerate(id) { tokens[id] = { token: newToken(), createdAt: new Date().toISOString() }; save(); return tokens[id].token; },
    employeeFor(token) {
      const t = String(token || '');
      if (t.length < 20) return null;
      for (const [id, v] of Object.entries(tokens)) {
        const a = Buffer.from(v.token), b = Buffer.from(t);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) return id;
      }
      return null;
    },
    remove(id) { if (tokens[id]) { delete tokens[id]; save(); } },
  };
}

// "1700000000" (s), "1700000000000" (ms), ISO 8601 oder "yyyy-MM-dd HH:mm:ss" (UTC) -> ms oder null
function parseTime(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n < 1e11 ? Math.round(n * 1000) : Math.round(n); }
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// params: Objekt mit OsmAnd-Feldern (aus Query und/oder Body)
function parseReport(params) {
  let p = params || {};
  // Neuere Traccar-Clients senden JSON: { device_id, location: { timestamp, coords: { latitude, longitude, accuracy } } }
  if (p.location && typeof p.location === 'object' && p.location.coords) {
    const c = p.location.coords;
    p = { id: p.device_id || p.id || p.deviceid, lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, timestamp: p.location.timestamp };
  }
  const id = String(p.id || p.deviceid || p.device_id || '').trim();
  let lat = p.lat != null ? Number(p.lat) : NaN, lng = p.lon != null ? Number(p.lon) : (p.lng != null ? Number(p.lng) : NaN);
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && p.location) {
    const m = String(p.location).split(',');
    lat = Number(m[0]); lng = Number(m[1]);
  }
  const acc = Number(p.accuracy);
  return { id, lat, lng, accuracy: Number.isFinite(acc) && acc >= 0 ? acc : null, ts: parseTime(p.timestamp) };
}

const validCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// Entscheidet, ob eine Meldung die gespeicherte Position ersetzt.
// prevAt: ISO-Zeit der aktuell gespeicherten Position (oder undefined). Gibt { ok, stale?, position?, reason? }
function evaluate(report, nowMs, prevAt) {
  if (!validCoords(report.lat, report.lng)) return { ok: false, reason: 'invalid position' };
  let ts = report.ts == null ? nowMs : report.ts;
  if (ts > nowMs) ts = nowMs; // Handy-Uhr geht vor -> auf "jetzt" kappen
  const prev = prevAt ? Date.parse(prevAt) : NaN;
  if (Number.isFinite(prev) && ts <= prev) return { ok: true, stale: true }; // älter als das, was wir haben (z. B. nach Offline-Puffer)
  return { ok: true, position: { lat: report.lat, lng: report.lng, accuracy: report.accuracy, at: new Date(ts).toISOString() } };
}

function createGuard() {
  const last = new Map(), bad = new Map();
  return {
    tooFast(token, nowMs) { const l = last.get(token); if (l && nowMs - l < MIN_GAP_MS) return true; last.set(token, nowMs); return false; },
    blocked(ip, nowMs) { const a = (bad.get(ip) || []).filter(t => nowMs - t < BAD_WINDOW_MS); bad.set(ip, a); return a.length >= BAD_LIMIT; },
    fail(ip, nowMs) { const a = (bad.get(ip) || []).filter(t => nowMs - t < BAD_WINDOW_MS); a.push(nowMs); bad.set(ip, a); },
    prune(nowMs) { for (const [k, a] of bad) { const f = a.filter(t => nowMs - t < BAD_WINDOW_MS); if (f.length) bad.set(k, f); else bad.delete(k); } for (const [k, t] of last) if (nowMs - t > 3600000) last.delete(k); },
  };
}

module.exports = { newToken, createStore, parseTime, parseReport, validCoords, evaluate, createGuard, MIN_GAP_MS };
