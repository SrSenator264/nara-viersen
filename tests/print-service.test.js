'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const PS = require('../print-service.js');

test('printer config: defaults, sanitize keeps routes valid', () => {
  const d = PS.config({});
  assert.equal(d.printers.length, 2); assert.equal(d.routes.kasse, 'kasse'); assert.equal(d.routes.kitchen, 'epson');
  const c = PS.sanitize({ printers: [{ id: 'usb', name: 'Bon', mode: 'windows', winName: 'POS-58', width: 58, cut: 'xx' }], routes: { kasse: 'usb', kitchen: 'gone' }, promo: { percent: 99, url: 'javascript:alert(1)' } });
  assert.equal(c.printers[0].width, 58); assert.equal(c.printers[0].cut, 'full');
  assert.equal(c.routes.kitchen, 'usb');
  assert.equal(c.promo.percent, 50); assert.match(c.promo.url, /^https:/);
});

test('routing: platform customer copy → platform printer, kasse → kasse printer', () => {
  assert.equal(PS.roleFor({ source: 'LIEFERANDO' }, 'customer'), 'platform');
  assert.equal(PS.roleFor({ source: 'NARA' }, 'customer'), 'kasse');
  assert.equal(PS.roleFor({ source: 'UBER_EATS' }, 'kitchen'), 'kitchen');
});

test('ESC/POS job: raster blocks, partial cut between receipt and promo, full cut at the end', () => {
  const img = { width: 16, height: 3, bits: Buffer.from([0xff, 0x00, 0x0f, 0xf0, 0xaa, 0x55]) };
  const job = PS.buildJob([img, img], { cut: 'partial' });
  assert.deepEqual([...job.subarray(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...job.subarray(2, 10)], [0x1d, 0x76, 0x30, 0x00, 2, 0, 3, 0]);
  const hex = job.toString('hex');
  assert.ok(hex.includes('1d564200')); // partial
  assert.ok(hex.endsWith('1d564100'));  // full
});

test('browser printers: nothing printed on the server, page prints itself (with promo for platforms)', async () => {
  const r = await PS.printOrder({}, { source: 'UBER_EATS', platform: 'UBER_EATS', cart: [] }, 'customer');
  assert.equal(r.mode, 'browser'); assert.equal(r.role, 'platform'); assert.equal(r.promo, true);
  const k = await PS.printOrder({}, { source: 'NARA', cart: [] }, 'customer');
  assert.equal(k.promo, false); assert.equal(k.role, 'kasse');
});
