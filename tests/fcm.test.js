'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const F = require('../fcm.js');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SA = { client_email: 'svc@flamo-test.iam.gserviceaccount.com', private_key: PEM, project_id: 'flamo-test' };
const TOK = 't'.repeat(40), TOK2 = 'u'.repeat(40);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-'));
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Fake-Google: zaehlt Aufrufe, antwortet je nach URL
function fake(sendReply = () => res(200, { name: 'm1' }), authReply = () => res(200, { access_token: 'AT', expires_in: 3600 })) {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return url.startsWith('https://oauth2.googleapis.com/') ? authReply() : sendReply(url, opts); };
  return { calls, fetchImpl };
}

test('loadServiceAccount: missing file -> null, valid -> object, bad project id -> null', () => {
  const d = tmp(); assert.equal(F.loadServiceAccount(d), null);
  fs.writeFileSync(path.join(d, 'fcm-service-account.json'), JSON.stringify(SA));
  assert.equal(F.loadServiceAccount(d).project_id, 'flamo-test');
  fs.writeFileSync(path.join(d, 'fcm-service-account.json'), JSON.stringify({ ...SA, project_id: '../evil' }));
  assert.equal(F.loadServiceAccount(d), null);
});

test('assertion: RS256 jwt verifies with the public key and carries the messaging scope', () => {
  const [h, c, sig] = F.assertion(SA, 1000000).split('.');
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), publicKey, Buffer.from(sig, 'base64url')));
  const claims = JSON.parse(Buffer.from(c, 'base64url')); assert.equal(claims.iss, SA.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging'); assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3600);
});

test('send: high priority + channel + string data; access token is cached across sends', async () => {
  const f = fake(), sa = { ...SA, client_email: 'cache1@x.iam.gserviceaccount.com' };
  const a = await F.send(sa, TOK, { title: 'Neuer Auftrag', body: 'Q7CTPT', url: 'driver.html', tag: 'nara-new-order' }, { fetchImpl: f.fetchImpl });
  await F.send(sa, TOK, { title: 'x', body: 'y' }, { fetchImpl: f.fetchImpl });
  assert.deepEqual(a, { ok: true, gone: false, status: 200 });
  assert.equal(f.calls.filter(c => c.url.includes('oauth2')).length, 1);
  const call = f.calls.find(c => c.url.includes('messages:send')), m = JSON.parse(call.opts.body).message;
  assert.equal(call.url, 'https://fcm.googleapis.com/v1/projects/flamo-test/messages:send');
  assert.equal(call.opts.headers.Authorization, 'Bearer AT');
  assert.equal(m.token, TOK); assert.equal(m.notification.body, 'Q7CTPT');
  assert.equal(m.android.priority, 'HIGH'); assert.equal(m.android.notification.channel_id, F.CHANNEL);
  assert.ok(Object.values(m.data).every(v => typeof v === 'string')); assert.equal(m.data.url, 'driver.html');
});

test('send: UNREGISTERED/404 marks the token gone, 500 does not', async () => {
  const sa = { ...SA, client_email: 'gone1@x.iam.gserviceaccount.com' };
  const dead = fake(() => res(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
  assert.equal((await F.send(sa, TOK, {}, { fetchImpl: dead.fetchImpl })).gone, true);
  const err = fake(() => res(500, { error: { status: 'INTERNAL' } }));
  assert.deepEqual(await F.send(sa, TOK, {}, { fetchImpl: err.fetchImpl }), { ok: false, gone: false, status: 500 });
});

test('auth failure throws without leaking the private key', async () => {
  const sa = { ...SA, client_email: 'bad1@x.iam.gserviceaccount.com' }, f = fake(undefined, () => res(400, { error: 'invalid_grant' }));
  await assert.rejects(() => F.send(sa, TOK, {}, { fetchImpl: f.fetchImpl }), e => /invalid_grant/.test(e.message) && !e.message.includes('PRIVATE KEY'));
});

test('register: needs login, validates token, moves token between drivers, caps at 5 per driver', () => {
  const data = {};
  assert.throws(() => F.register(data, null, { token: TOK }), e => e.status === 401);
  assert.throws(() => F.register(data, { id: 'd1' }, { token: 'short' }), e => e.status === 422);
  assert.throws(() => F.register(data, { id: 'd1' }, { token: 'a b'.repeat(20) }), e => e.status === 422);
  F.register(data, { id: 'd1' }, { token: TOK }); F.register(data, { id: 'd1' }, { token: TOK });
  assert.equal(data.fcmTokens.length, 1);
  F.register(data, { id: 'd2' }, { token: TOK }); // anderes Login auf demselben Handy
  assert.deepEqual(data.fcmTokens.map(s => s.userId), ['d2']);
  for (let i = 0; i < 7; i++) F.register(data, { id: 'd3' }, { token: String(i).repeat(30) });
  const mine = data.fcmTokens.filter(s => s.userId === 'd3');
  assert.equal(mine.length, 5); assert.equal(mine[4].token, '6'.repeat(30)); assert.ok(!mine.some(s => s.token === '0'.repeat(30)));
});

test('notifyUser: only that driver, dead tokens removed, network errors keep the token', async () => {
  const sa = { ...SA, client_email: 'notify1@x.iam.gserviceaccount.com' };
  const data = { fcmTokens: [{ userId: 'd1', token: TOK }, { userId: 'd1', token: TOK2 }, { userId: 'd2', token: 'z'.repeat(40) }] };
  const f = fake((url, o) => { const t = JSON.parse(o.body).message.token; if (t === TOK) return res(404, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }); if (t === TOK2) throw new Error('ECONNRESET'); return res(200, {}); });
  const r = await F.notifyUser(sa, data, 'd1', { title: 'x' }, { fetchImpl: f.fetchImpl });
  assert.deepEqual(r, { sent: 1, removed: 1 });
  assert.deepEqual(data.fcmTokens.map(s => s.token), [TOK2, 'z'.repeat(40)]);
  assert.equal(f.calls.filter(c => c.url.includes('messages:send')).length, 2); // d2 wurde nicht angefasst
});
