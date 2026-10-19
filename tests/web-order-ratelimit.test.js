'use strict';
// Rate-Limit-Schlüssel: der cf-connecting-ip-Header zählt nur, wenn die Verbindung vom eigenen Rechner (Tunnel/loopback) kommt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../auth.js');

const fakeReq = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

test('rate-limit key: direct (non-loopback) connection ignores a forged cf-connecting-ip header', () => {
  const a = A.clientIp(fakeReq('203.0.113.7', { 'cf-connecting-ip': '1.1.1.1' }));
  const b = A.clientIp(fakeReq('203.0.113.7', { 'cf-connecting-ip': '2.2.2.2' }));
  const c = A.clientIp(fakeReq('203.0.113.7'));
  assert.equal(a, '203.0.113.7');
  assert.equal(a, b); // Header wechseln ändert den Schlüssel nicht
  assert.equal(a, c);
});
test('rate-limit key: forged x-forwarded-for from a direct connection is ignored too', () => {
  assert.equal(A.clientIp(fakeReq('198.51.100.9', { 'x-forwarded-for': '9.9.9.9' })), '198.51.100.9');
});
test('rate-limit key: loopback connection (cloudflared tunnel) uses the header value', () => {
  assert.equal(A.clientIp(fakeReq('127.0.0.1', { 'cf-connecting-ip': '5.6.7.8' })), '5.6.7.8');
  assert.equal(A.clientIp(fakeReq('::1', { 'cf-connecting-ip': '5.6.7.8' })), '5.6.7.8');
  assert.equal(A.clientIp(fakeReq('::ffff:127.0.0.1', { 'cf-connecting-ip': '5.6.7.8' })), '5.6.7.8');
  assert.equal(A.clientIp(fakeReq('127.0.0.1')), '127.0.0.1'); // ohne Header: Socket-Adresse
});
test('server.js: web-orders and flamo/chat use clientIp, not the raw header', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.equal(/req\.headers\[['"]cf-connecting-ip['"]\]/.test(src), false);
  const uses = src.match(/naraAuthLib\.clientIp\(req\)/g) || [];
  assert.ok(uses.length >= 2, 'both limiters must key on naraAuthLib.clientIp(req)');
});
