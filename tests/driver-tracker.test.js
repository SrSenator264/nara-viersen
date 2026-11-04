'use strict';
// iPhone-Fahrer über Traccar Client: Token-Speicher, OsmAnd-Parser, Zeit-/Stale-Logik, Spam-Schutz.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const T = require('../driver-tracker.js');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trk-')), 'tokens.json');

test('Token: pro Fahrer erzeugt, stabil, neu erzeugen macht den alten ungültig, bleibt nach Neustart erhalten', () => {
  const f = tmp(), s = T.createStore(f);
  const a = s.ensure('emp1');
  assert.match(a, /^trk_[A-Za-z0-9_-]{30,}$/);
  assert.equal(s.ensure('emp1'), a);
  assert.equal(s.employeeFor(a), 'emp1');
  const b = s.regenerate('emp1');
  assert.notEqual(a, b);
  assert.equal(s.employeeFor(a), null);
  assert.equal(s.employeeFor(b), 'emp1');
  assert.equal(T.createStore(f).employeeFor(b), 'emp1');
  assert.equal(s.employeeFor(''), null);
  assert.equal(s.employeeFor('trk_x'), null);
});

test('Parser: OsmAnd-Query (lat/lon, Sekunden, ms, ISO, "yyyy-MM-dd HH:mm:ss", location=)', () => {
  const r = T.parseReport({ id: 'trk_abc', lat: '51.25', lon: '6.39', timestamp: '1700000000', accuracy: '12.5' });
  assert.deepEqual([r.id, r.lat, r.lng, r.accuracy, r.ts], ['trk_abc', 51.25, 6.39, 12.5, 1700000000000]);
  assert.equal(T.parseReport({ deviceid: 'x', lat: 1, lon: 2, timestamp: '1700000000123' }).ts, 1700000000123);
  assert.equal(T.parseReport({ id: 'x', lat: 1, lon: 2, timestamp: '2026-11-04T22:53:00Z' }).ts, Date.parse('2026-11-04T22:53:00Z'));
  assert.equal(T.parseReport({ id: 'x', lat: 1, lon: 2, timestamp: '2026-11-04 22:53:00' }).ts, Date.parse('2026-11-04T22:53:00Z'));
  const l = T.parseReport({ id: 'x', location: '51.1,6.2' });
  assert.deepEqual([l.lat, l.lng], [51.1, 6.2]);
});

test('Parser: JSON-Form neuer Traccar-Clients (device_id + location.coords)', () => {
  const r = T.parseReport({ device_id: 'trk_j', location: { timestamp: '2026-11-04T22:53:00Z', coords: { latitude: 51.25, longitude: 6.39, accuracy: 8 } } });
  assert.deepEqual([r.id, r.lat, r.lng, r.accuracy], ['trk_j', 51.25, 6.39, 8]);
  assert.equal(r.ts, Date.parse('2026-11-04T22:53:00Z'));
});

test('evaluate: ungültige Koordinaten werden abgelehnt', () => {
  const now = Date.now();
  for (const bad of [{ lat: NaN, lng: 6 }, { lat: 91, lng: 6 }, { lat: 51, lng: 181 }, { lat: 0, lng: 0 }, { lat: 'a', lng: 'b' }])
    assert.equal(T.evaluate(T.parseReport({ id: 'x', lat: bad.lat, lon: bad.lng }), now).ok, false);
});

test('evaluate: gültig, ohne Zeitstempel = jetzt; Zukunft wird auf jetzt gekappt', () => {
  const now = Date.parse('2026-11-04T22:55:00Z');
  const a = T.evaluate(T.parseReport({ id: 'x', lat: 51.25, lon: 6.39 }), now);
  assert.equal(a.ok, true); assert.equal(a.position.at, new Date(now).toISOString());
  const b = T.evaluate(T.parseReport({ id: 'x', lat: 51.25, lon: 6.39, timestamp: String(now + 3600000) }), now);
  assert.equal(b.position.at, new Date(now).toISOString());
});

test('evaluate: ältere Meldung (Offline-Puffer) überschreibt keine neuere Position', () => {
  const now = Date.parse('2026-11-04T22:55:00Z'), prevAt = '2026-11-04T22:54:00Z';
  const old = T.evaluate(T.parseReport({ id: 'x', lat: 51.25, lon: 6.39, timestamp: '2026-11-04T22:50:00Z' }), now, prevAt);
  assert.equal(old.ok, true); assert.equal(old.stale, true); assert.equal(old.position, undefined);
  const nw = T.evaluate(T.parseReport({ id: 'x', lat: 51.25, lon: 6.39, timestamp: '2026-11-04T22:54:30Z' }), now, prevAt);
  assert.equal(nw.position.at, '2026-11-04T22:54:30.000Z');
});

test('Guard: zu schnelle Meldungen ignoriert; 20 falsche Tokens pro IP sperren, danach wieder frei', () => {
  const g = T.createGuard();
  assert.equal(g.tooFast('t', 1000), false);
  assert.equal(g.tooFast('t', 1500), true);
  assert.equal(g.tooFast('t', 1000 + T.MIN_GAP_MS + 1), false);
  for (let i = 0; i < 19; i++) g.fail('1.2.3.4', 1000 + i);
  assert.equal(g.blocked('1.2.3.4', 2000), false);
  g.fail('1.2.3.4', 2000);
  assert.equal(g.blocked('1.2.3.4', 2001), true);
  assert.equal(g.blocked('9.9.9.9', 2001), false);
  assert.equal(g.blocked('1.2.3.4', 2000 + 10 * 60000 + 1), false);
});
