'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

test('PIN rules: length per role, no trivial PINs', () => {
  assert.equal(A.validatePin('CASHIER', '4821'), null);
  assert.match(A.validatePin('MANAGER', '4821'), /mindestens 6/);
  assert.equal(A.validatePin('MANAGER', '482193'), null);
  for (const bad of ['1234', '0000', '4321', '12ab', '123', '1111']) assert.notEqual(A.validatePin('CASHIER', bad), null, bad);
});
test('PIN hash verifies only the right PIN and never stores it', () => {
  const rec = A.hashPin('482193');
  assert.equal(JSON.stringify(rec).includes('482193'), false);
  assert.equal(A.verifyPin('482193', rec), true);
  assert.equal(A.verifyPin('482194', rec), false);
  assert.equal(A.verifyPin('', rec), false);
  assert.equal(A.verifyPin('482193', null), false);
  assert.notEqual(A.hashPin('482193').hash, rec.hash); // random salt
});
test('limiter locks after max failures and unlocks on success/time', () => {
  const L = new A.Limiter({ max: 3, windowMs: 1000, lockMs: 5000 });
  assert.equal(L.check('k', 0).ok, true);
  L.fail('k', 1); L.fail('k', 2); const r = L.fail('k', 3);
  assert.equal(r.ok, false); assert.equal(L.check('k', 4000).ok, false); assert.equal(L.check('k', 6000).ok, true);
  L.fail('x', 0); L.success('x'); L.fail('x', 1); L.fail('x', 2); assert.equal(L.check('x', 3).ok, true);
});
test('cookies and tokens', () => {
  assert.deepEqual(A.parseCookies('a=1; nara_session=abc%20d; x'), { a: '1', nara_session: 'abc d' });
  assert.notEqual(A.newToken(), A.newToken()); assert.equal(A.tokenHash('t').length, 64);
});
test('policy: public, staff and manager-only routes', () => {
  assert.equal(A.policyFor('POST', '/api/delivery/quote'), 'public');
  assert.equal(A.policyFor('GET', '/api/menu'), 'public');
  assert.equal(A.policyFor('POST', '/api/platform-orders/import'), 'service');
  assert.ok(A.allowed(A.policyFor('POST', '/api/kasse/events'), 'CASHIER'));
  assert.ok(A.allowed(A.policyFor('POST', '/api/kasse/events'), 'KITCHEN'));
  assert.equal(A.allowed(A.policyFor('POST', '/api/kasse/events'), 'DRIVER'), false);
  assert.equal(A.allowed(A.policyFor('GET', '/api/customers'), 'KITCHEN'), false);
  assert.ok(A.allowed(A.policyFor('GET', '/api/customers'), 'CASHIER'));
  for (const p of ['/api/delivery/config', '/api/delivery/driver-pay', '/api/delivery/daily-report', '/api/admin-data', '/api/payroll/daily'])
    for (const r of ['CASHIER', 'KITCHEN', 'DRIVER', 'ACCOUNTANT']) assert.equal(A.allowed(A.policyFor('GET', p), r), false, p + ' ' + r);
  assert.ok(A.allowed(A.policyFor('GET', '/api/delivery/config'), 'MANAGER'));
  assert.ok(A.allowed(A.policyFor('GET', '/api/accounting/journal-entries'), 'ACCOUNTANT'));
  assert.equal(A.allowed(A.policyFor('GET', '/api/accounting/journal-entries'), 'CASHIER'), false);
});
test('policy: unknown /api routes are manager-only (deny by default)', () => {
  assert.deepEqual(A.policyFor('GET', '/api/something-new'), A.MANAGERS);
  assert.deepEqual(A.policyFor('DELETE', '/api/delivery/zones'), A.MANAGERS);
});
test('static files: data, secrets and dotfiles are never served', () => {
  for (const bad of ['data/nara-admin.json', 'data/nara-admin.json.bak', '.env', '.git/config', 'logs/x.log', 'node_modules/a/b.js', 'server.js.bak', 'package.json', 'tests/auth.test.js', 'scripts/x.js', 'nara-worker-deploy-archive-backup-20261007/x.js', 'a/../.env', 'secret.pem', 'checkpoint1/a.js'])
    assert.equal(A.staticAllowed(bad), false, bad);
  for (const ok of ['kasse.html', 'kasse-touch.css', 'vendor/qrcode.bundle.js', 'dist/client/assets/burger-1.png', 'dist/client/assets/Brownie.webp', 'nara-receipt-core.mjs'])
    assert.equal(A.staticAllowed(ok), true, ok);
});
test('every page that is gated has a role list', () => {
  assert.ok(A.PAGE_ROLES['kasse.html'].includes('CASHIER')); assert.equal(A.PAGE_ROLES['kasse.html'].includes('KITCHEN'), false);
  assert.equal(A.PAGE_ROLES['staff.html'].includes('CASHIER'), false);
});
