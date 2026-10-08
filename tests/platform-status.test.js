'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../platform-status.js');
const T0 = Date.parse('2026-10-08T18:00:00Z'), iso = t => new Date(t).toISOString();

test('bridge states: down → ok → login → ok again after new data → down when silent', () => {
  P.reset();
  assert.equal(P.list(T0)[0].state, 'down');
  P.heartbeat({ source: 'LIEFERANDO', bridge: 'playwright', lastOkAt: iso(T0) }, T0);
  assert.equal(P.view('LIEFERANDO', T0 + 60000).state, 'ok');
  P.alert({ source: 'LIEFERANDO', type: 'SESSION_EXPIRED' }, T0 + 120000);
  assert.equal(P.view('LIEFERANDO', T0 + 130000).state, 'login');
  P.heartbeat({ source: 'LIEFERANDO', lastOkAt: iso(T0 + 100000) }, T0 + 180000); // بيانات قديمة: لسا لازم تسجيل دخول
  assert.equal(P.view('LIEFERANDO', T0 + 180000).state, 'login');
  P.heartbeat({ source: 'LIEFERANDO', lastOkAt: iso(T0 + 200000) }, T0 + 240000);
  assert.equal(P.view('LIEFERANDO', T0 + 240000).state, 'ok');
  P.heartbeat({ source: 'LIEFERANDO', loggedOut: true }, T0 + 300000);
  assert.equal(P.view('LIEFERANDO', T0 + 300000).state, 'login');
  assert.equal(P.view('LIEFERANDO', T0 + 300000 + P.STALE_MS + 1).state, 'down');
  assert.throws(() => P.heartbeat({ source: 'X' }), /Unsupported/);
});
