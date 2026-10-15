'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const P = require('../push.js'), S = require('../dispatch-service.js');

const b64u = b => Buffer.from(b).toString('base64url');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'push-'));
function device() { const e = crypto.createECDH('prime256v1'); e.generateKeys(); const auth = crypto.randomBytes(16);
  return { e, auth, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u(e.getPublicKey()), auth: b64u(auth) } }; }
const hk = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
// Empfaenger-Seite nach RFC 8291
function decrypt(dev, body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const uaPub = dev.e.getPublicKey(), secret = dev.e.computeSecret(asPub);
  const ikm = hk(dev.auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2); return JSON.parse(pt.subarray(0, pt.length - 1).toString());
}

test('encrypt: device can decrypt (RFC 8291 layout)', () => {
  const dev = device(), body = P.encrypt(dev.sub, { body: 'Q7CTPT', url: 'driver.html' });
  assert.equal(body.readUInt32BE(16), 4096); assert.equal(body[20], 65);
  assert.deepEqual(decrypt(dev, body), { body: 'Q7CTPT', url: 'driver.html' });
});
test('vapid keys are created once and reused; jwt verifies with public key', () => {
  const dir = tmp(), k = P.loadKeys(dir), k2 = P.loadKeys(dir);
  assert.deepEqual(k, k2); assert.equal(Buffer.from(k.pub, 'base64url').length, 65);
  const jwt = P.vapidJwt(k, 'https://fcm.googleapis.com', Date.now()), [h, c, sig] = jwt.split('.');
  const pub = Buffer.from(k.pub, 'base64url'), key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  const claims = JSON.parse(Buffer.from(c, 'base64url')); assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.ok(claims.exp * 1000 > Date.now());
});
test('send: headers, 201 ok, 410 gone, foreign host refused', async () => {
  const keys = P.loadKeys(tmp()), dev = device(); let seen;
  const f = status => async (url, o) => { seen = { url, o }; return { status }; };
  let r = await P.send(keys, dev.sub, { body: 'x' }, { fetchImpl: f(201) });
  assert.ok(r.ok); assert.equal(seen.o.headers['Content-Encoding'], 'aes128gcm'); assert.match(seen.o.headers.Authorization, /^vapid t=.+, k=.+$/); assert.equal(seen.o.headers.Urgency, 'high');
  r = await P.send(keys, dev.sub, { body: 'x' }, { fetchImpl: f(410) }); assert.ok(r.gone && !r.ok);
  r = await P.send(keys, dev.sub, { body: 'x' }, { fetchImpl: f(500) }); assert.ok(!r.gone && !r.ok);
  let called = false; r = await P.send(keys, { ...dev.sub, endpoint: 'https://127.0.0.1/x' }, {}, { fetchImpl: async () => { called = true; return { status: 201 }; } });
  assert.ok(!called && r.gone);
});
test('subscribe validates, dedupes by endpoint and caps devices per user', () => {
  const data = {}, user = { id: 'u1' }, dev = device();
  P.subscribe(data, user, { endpoint: dev.sub.endpoint, keys: { p256dh: dev.sub.p256dh, auth: dev.sub.auth } });
  P.subscribe(data, user, { endpoint: dev.sub.endpoint, keys: { p256dh: dev.sub.p256dh, auth: dev.sub.auth } });
  assert.equal(data.pushSubs.length, 1);
  assert.throws(() => P.subscribe(data, user, { endpoint: 'http://fcm.googleapis.com/x', keys: dev.sub }), e => e.status === 422);
  assert.throws(() => P.subscribe(data, user, { endpoint: 'https://evil.example/x', keys: { p256dh: dev.sub.p256dh, auth: dev.sub.auth } }), e => e.status === 422);
  assert.throws(() => P.subscribe(data, user, { endpoint: dev.sub.endpoint, keys: { p256dh: 'AAAA', auth: 'AAAA' } }), e => e.status === 422);
  assert.throws(() => P.subscribe(data, null, {}), e => e.status === 401);
  for (let i = 0; i < 8; i++) P.subscribe(data, user, { endpoint: 'https://fcm.googleapis.com/fcm/send/' + i, keys: { p256dh: dev.sub.p256dh, auth: dev.sub.auth } });
  assert.equal(data.pushSubs.filter(s => s.userId === 'u1').length, 5);
});
test('notifyUser: only that user, dead subscriptions removed', async () => {
  const keys = P.loadKeys(tmp()), a = device(), data = { pushSubs: [
    { userId: 'd1', endpoint: 'https://fcm.googleapis.com/fcm/send/alive', p256dh: a.sub.p256dh, auth: a.sub.auth },
    { userId: 'd1', endpoint: 'https://fcm.googleapis.com/fcm/send/dead', p256dh: a.sub.p256dh, auth: a.sub.auth },
    { userId: 'd2', endpoint: 'https://fcm.googleapis.com/fcm/send/other', p256dh: a.sub.p256dh, auth: a.sub.auth }] };
  const hit = [];
  const r = await P.notifyUser(keys, data, 'd1', { body: 'x' }, { fetchImpl: async url => { hit.push(url); return { status: url.endsWith('dead') ? 410 : 201 }; } });
  assert.deepEqual(r, { sent: 1, removed: 1 }); assert.equal(hit.length, 2);
  assert.deepEqual(data.pushSubs.map(s => s.endpoint.split('/').pop()), ['alive', 'other']);
});
test('pushTargets: assign, move, swap notify the right driver with codes only', () => {
  const mk = id => ({ id, type: 'delivery', status: 'OPEN', delivery: { lat: 51.26, lng: 6.39, street: 'S', name: 'Secret Name', phone: '0123' }, cart: [] });
  const d = { employees: [{ id: 'd1', name: 'A', role: 'DRIVER', active: true }, { id: 'd2', name: 'B', role: 'DRIVER', active: true }], orders: [mk('o1'), mk('o2'), mk('o3')], deliveryRoutes: [], settings: {} };
  const iso = new Date().toISOString();
  const r1 = S.assignRoute(d, { driverId: 'd1', orderIds: ['o1', 'o2'] }, null, iso), r2 = S.assignRoute(d, { driverId: 'd2', orderIds: ['o3'] }, null, iso);
  let t = S.pushTargets(d, 'DELIVERY_ROUTE_ASSIGNED', r1); assert.equal(t.length, 1); assert.equal(t[0].driverId, 'd1'); assert.equal(t[0].codes.length, 2);
  assert.ok(!JSON.stringify(t).includes('Secret') && !JSON.stringify(t).includes('0123'));
  const sw = S.swapOrders(d, { orderA: 'o1', orderB: 'o3' }, null, iso);
  t = S.pushTargets(d, 'DELIVERY_ORDERS_SWAPPED', sw, { orderA: 'o1', orderB: 'o3' }); assert.equal(t.length, 2);
  const m = S.moveOrder(d, { orderId: 'o2', toDriverId: 'd2' }, null, iso);
  t = S.pushTargets(d, 'DELIVERY_ORDER_MOVED', m, { orderId: 'o2' }); assert.deepEqual(t.map(x => x.driverId), ['d2']);
  assert.deepEqual(S.pushTargets(d, 'DELIVERY_STOPS_REORDERED', {}, {}), []);
});
