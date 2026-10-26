'use strict';
/* QR-/Zugriffs-Tokens öffnen Daten ohne Login -> müssen unratbar sein (CSPRNG), nicht Math.random/Date.now */
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('secretToken existiert und nutzt crypto.randomBytes(16)', () => {
  assert.match(src, /function secretToken\(prefix\)\{[^}]*require\('crypto'\)\.randomBytes\(16\)/);
});

test('adminId() wird für keinen QR-/Zugriffs-Token mehr benutzt', () => {
  for (const name of ['delivery-qr', 'employee-qr', 'route-qr', 'qr']) {
    assert.doesNotMatch(src, new RegExp("adminId\\('" + name + "'\\)"), name + ' darf nicht mehr über adminId() erzeugt werden');
  }
});

test('secretToken(...) wird für alle vier Token-Arten verwendet', () => {
  for (const name of ['delivery-qr', 'employee-qr', 'route-qr', 'qr']) {
    assert.match(src, new RegExp("secretToken\\('" + name + "'\\)"), name + ' muss secretToken nutzen');
  }
});
