'use strict';
// push.js — Web Push (RFC 8030 + RFC 8291 aes128gcm + VAPID RFC 8292) ohne Fremdbibliothek, nur node:crypto.
// Schluessel liegen in data/push-vapid.json (nicht in Git). Abos in data.pushSubs.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');

const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s || ''), 'base64url');
// nur echte Push-Dienste der Browser (kein SSRF auf interne Adressen)
const HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
function endpointOk(ep) {
  try { const u = new URL(ep); return u.protocol === 'https:' && !u.port && HOSTS.some(r => r.test(u.hostname)); } catch (e) { return false; }
}

function loadKeys(dir) {
  const file = path.join(dir, 'push-vapid.json');
  try { const k = JSON.parse(fs.readFileSync(file, 'utf8')); if (k.pub && k.priv) return k; } catch (e) { /* neu erzeugen */ }
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const k = { pub: b64u(e.getPublicKey()), priv: b64u(e.getPrivateKey()), createdAt: new Date().toISOString() };
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(k), { mode: 0o600 });
  return k;
}

function vapidJwt(keys, audience, now = Date.now(), subject = 'mailto:admin@flamo.co.de') {
  const pub = unb64u(keys.pub);
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: keys.priv }, format: 'jwk' });
  const data = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  return data + '.' + b64u(crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }));
}

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// RFC 8291: Nutzlast fuer ein Abo verschluesseln
function encrypt(sub, payload) {
  const ua = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  if (ua.length !== 65 || auth.length !== 16) throw new Error('bad subscription keys');
  const as = crypto.createECDH('prime256v1'); as.generateKeys();
  const asPub = as.getPublicKey(), secret = as.computeSecret(ua);
  const ikm = hkdf(auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([65]), asPub, body]);
}

// gibt { ok, gone } zurueck; gone = Abo ist tot (404/410) und soll geloescht werden
async function send(keys, sub, payload, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!endpointOk(sub.endpoint)) return { ok: false, gone: true };
  const aud = new URL(sub.endpoint).origin;
  const r = await fetchImpl(sub.endpoint, { method: 'POST', body: encrypt(sub, payload), signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined, headers: {
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high',
    Authorization: 'vapid t=' + vapidJwt(keys, aud, now) + ', k=' + keys.pub } });
  return { ok: r.status >= 200 && r.status < 300, gone: r.status === 404 || r.status === 410, status: r.status };
}

function subscribe(data, user, body, now = new Date().toISOString()) {
  const ep = String((body && body.endpoint) || ''), k = (body && body.keys) || {};
  const bad = m => Object.assign(new Error(m), { status: 422 });
  if (!user) throw Object.assign(new Error('login required'), { status: 401 });
  if (!endpointOk(ep)) throw bad('endpoint not allowed');
  if (unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length !== 16) throw bad('bad keys');
  data.pushSubs = (data.pushSubs || []).filter(s => s.endpoint !== ep);
  const mine = data.pushSubs.filter(s => s.userId === user.id);
  if (mine.length >= 5) { const drop = new Set(mine.slice(0, mine.length - 4).map(s => s.endpoint)); data.pushSubs = data.pushSubs.filter(s => !drop.has(s.endpoint)); }
  data.pushSubs.push({ userId: user.id, endpoint: ep, p256dh: k.p256dh, auth: k.auth, createdAt: now });
  return { ok: true };
}

// an alle Geraete eines Fahrers; tote Abos werden aus data entfernt (Aufrufer speichert)
async function notifyUser(keys, data, userId, payload, opts) {
  const subs = (data.pushSubs || []).filter(s => s.userId === userId), dead = new Set();
  await Promise.all(subs.map(async s => { try { const r = await send(keys, s, payload, opts); if (r.gone) dead.add(s.endpoint); } catch (e) { /* Netzwerkfehler: Abo behalten */ } }));
  if (dead.size) data.pushSubs = (data.pushSubs || []).filter(s => !dead.has(s.endpoint));
  return { sent: subs.length - dead.size, removed: dead.size };
}

module.exports = { loadKeys, vapidJwt, encrypt, send, subscribe, notifyUser, endpointOk };
