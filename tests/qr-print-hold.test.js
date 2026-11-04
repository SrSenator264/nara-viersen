'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const A = require('../platform-accept.js');
const lief = x => ({ source: 'LIEFERANDO', type: 'DELIVERY', ...x });

test('hold: Lieferando delivery without platform QR waits up to 10s', () => {
  const o = lief({}); assert.equal(A.markQrHold(o, 1000), true);
  assert.equal(A.qrHoldMs(o, 1000), 10000); assert.equal(A.qrHoldMs(o, 6000), 5000);
  assert.equal(A.qrHoldMs(o, 11000), 0); assert.equal(A.qrHoldMs(o, 99999), 0); // Timeout: druckt mit Fallback
});
test('hold ends immediately when the QR arrives', () => {
  const o = lief({}); A.markQrHold(o, 1000); o.deliveryQrUrl = 'https://mca.scoober.com/qr/?ref=A1&id=0123456789abcdef';
  assert.equal(A.qrHoldMs(o, 2000), 0);
});
test('no hold: pickup, other platforms, QR already there', () => {
  assert.equal(A.markQrHold({ source: 'LIEFERANDO', type: 'PICKUP' }, 1), false);
  assert.equal(A.markQrHold({ source: 'UBER_EATS', type: 'DELIVERY' }, 1), false);
  assert.equal(A.markQrHold(lief({ deliveryQrUrl: 'x' }), 1), false);
  assert.equal(A.qrHoldMs({ source: 'LIEFERANDO' }, 1), 0);
});
test('server wires hold + reprint on QR arrival + in-flight guard', () => {
  const s = fs.readFileSync(__dirname + '/../server.js', 'utf8');
  assert.match(s, /acceptLib\.qrHoldMs\(o,Date\.now\(\)\)/); assert.match(s, /acceptLib\.markQrHold\(next/);
  assert.match(s, /duplicate\.qrHoldUntil&&duplicate\.deliveryQrUrl/); assert.match(s, /_apInflight/);
});
