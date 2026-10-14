'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../auth.js');
const req = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers });
test('isLocalOnly: Loopback ohne Proxy-Header = lokal; mit Tunnel-Header nicht', () => {
  assert.equal(A.isLocalOnly(req('127.0.0.1')), true);
  assert.equal(A.isLocalOnly(req('::1')), true);
  assert.equal(A.isLocalOnly(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' })), false);
  assert.equal(A.isLocalOnly(req('127.0.0.1', { 'x-forwarded-for': '1.2.3.4' })), false);
  assert.equal(A.isLocalOnly(req('192.168.2.50')), false);
});
test('clientIp: Proxy-Header nur von Loopback (Tunnel) vertrauen', () => {
  assert.equal(A.clientIp(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' })), '1.2.3.4');
  assert.equal(A.clientIp(req('127.0.0.1', { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })), '5.6.7.8');
  assert.equal(A.clientIp(req('192.168.2.50', { 'cf-connecting-ip': '1.2.3.4' })), '192.168.2.50', 'gefälschter Header aus dem LAN zählt nicht');
});
test('safeEq: gleich/ungleich/unterschiedliche Länge', () => {
  assert.equal(A.safeEq('abc', 'abc'), true);
  assert.equal(A.safeEq('abc', 'abd'), false);
  assert.equal(A.safeEq('abc', 'abcd'), false);
  assert.equal(A.safeEq('', 'x'), false);
});
