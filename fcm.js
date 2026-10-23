'use strict';
// fcm.js — Firebase Cloud Messaging (HTTP v1) fuer die Fahrer-APK, ohne Fremdbibliothek (nur node:crypto + fetch).
// Service-Account-Schluessel: data/fcm-service-account.json (nicht in Git). Geraete-Tokens: data.fcmTokens.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');

const b64u = b => Buffer.from(b).toString('base64url');
const TOKEN_URI = 'https://oauth2.googleapis.com/token'; // fest verdrahtet (kein SSRF ueber die Datei)
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const CHANNEL = 'orders'; // Android-Benachrichtigungskanal, wird in driver.html angelegt
const TOKEN_RE = /^[A-Za-z0-9_:.\-]{20,4096}$/, PROJECT_RE = /^[a-z][a-z0-9\-]{4,29}$/;
const MAX_PER_USER = 5;

function loadServiceAccount(dir) {
  try {
    const k = JSON.parse(fs.readFileSync(path.join(dir, 'fcm-service-account.json'), 'utf8'));
    if (k.client_email && k.private_key && PROJECT_RE.test(String(k.project_id || ''))) return k;
  } catch (e) { /* nicht eingerichtet */ }
  return null;
}

function assertion(sa, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const data = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URI, iat, exp: iat + 3600 }));
  return data + '.' + b64u(crypto.sign('sha256', Buffer.from(data), sa.private_key));
}

const cache = new Map(); // client_email -> { token, exp }
const timeout = () => (AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined);

async function accessToken(sa, { fetchImpl = fetch, now = Date.now() } = {}) {
  const c = cache.get(sa.client_email);
  if (c && c.exp - 60000 > now) return c.token;
  const r = await fetchImpl(TOKEN_URI, { method: 'POST', signal: timeout(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion(sa, now) }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('fcm auth failed: ' + (typeof j.error === 'string' ? j.error : r.status));
  cache.set(sa.client_email, { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 });
  return j.access_token;
}

function message(token, p = {}) {
  const tag = String(p.tag || 'nara-new-order');
  return { message: { token,
    notification: { title: String(p.title || ''), body: String(p.body || '') },
    data: { url: String(p.url || 'driver.html'), tag },
    android: { priority: 'HIGH', ttl: '3600s', notification: { channel_id: CHANNEL, tag, sound: 'default' } } } };
}

// gibt { ok, gone, status } zurueck; gone = Token ist tot (UNREGISTERED/404) und soll geloescht werden
async function send(sa, token, payload, { fetchImpl = fetch, now = Date.now() } = {}) {
  const at = await accessToken(sa, { fetchImpl, now });
  const r = await fetchImpl('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', { method: 'POST', signal: timeout(),
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify(message(token, payload)) });
  if (r.status === 401) cache.delete(sa.client_email);
  let gone = false;
  if (!r.ok) {
    const e = ((await r.json().catch(() => ({}))).error) || {};
    gone = r.status === 404 || (e.details || []).some(d => d && d.errorCode === 'UNREGISTERED');
  }
  return { ok: r.ok, gone, status: r.status };
}

function register(data, user, body, now = new Date().toISOString()) {
  const tok = String((body && body.token) || '');
  if (!user) throw Object.assign(new Error('login required'), { status: 401 });
  if (!TOKEN_RE.test(tok)) throw Object.assign(new Error('bad token'), { status: 422 });
  data.fcmTokens = (data.fcmTokens || []).filter(s => s.token !== tok); // Geraet wechselt den Fahrer -> Token zieht um
  const mine = data.fcmTokens.filter(s => s.userId === user.id);
  if (mine.length >= MAX_PER_USER) { const drop = new Set(mine.slice(0, mine.length - (MAX_PER_USER - 1)).map(s => s.token)); data.fcmTokens = data.fcmTokens.filter(s => !drop.has(s.token)); }
  data.fcmTokens.push({ userId: user.id, token: tok, createdAt: now });
  return { ok: true };
}

// an alle Geraete eines Fahrers; tote Tokens werden aus data entfernt (Aufrufer speichert)
async function notifyUser(sa, data, userId, payload, opts) {
  const list = (data.fcmTokens || []).filter(s => s.userId === userId), dead = new Set();
  await Promise.all(list.map(async s => { try { const r = await send(sa, s.token, payload, opts); if (r.gone) dead.add(s.token); } catch (e) { /* Netzwerkfehler: Token behalten */ } }));
  if (dead.size) data.fcmTokens = (data.fcmTokens || []).filter(s => !dead.has(s.token));
  return { sent: list.length - dead.size, removed: dead.size };
}

module.exports = { CHANNEL, loadServiceAccount, assertion, accessToken, message, send, register, notifyUser };
