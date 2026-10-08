'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../delivery-rules.js');

const cfg = () => R.defaultConfig();

test('default config is valid', () => {
  assert.deepEqual(R.validateConfig(cfg()), { ok: true, errors: [] });
});

test('quote: customer fee and minimum order per postal code', () => {
  const c = cfg();
  const a = R.quote(c, { postalCode: '41747', subtotalCents: 1500 });
  assert.equal(a.ok, true); assert.equal(a.customerFeeCents, 100); assert.equal(a.totalCents, 1600);
  assert.equal(R.quote(c, { postalCode: '41748', subtotalCents: 1500 }).customerFeeCents, 100);
  const b = R.quote(c, { postalCode: '41749', subtotalCents: 2000 });
  assert.equal(b.ok, true); assert.equal(b.customerFeeCents, 200);
  const d = R.quote(c, { postalCode: '41751', subtotalCents: 2500 });
  assert.equal(d.ok, true); assert.equal(d.customerFeeCents, 300);
});

test('quote: below minimum reports the shortfall', () => {
  const q = R.quote(cfg(), { postalCode: '41747', subtotalCents: 1499 });
  assert.equal(q.ok, false); assert.equal(q.reason, 'BELOW_MINIMUM'); assert.equal(q.shortfallCents, 1);
  const q2 = R.quote(cfg(), { postalCode: '41749', subtotalCents: 1500 });
  assert.equal(q2.shortfallCents, 500);
});

test('quote: postal code with spaces, invalid and out of area', () => {
  assert.equal(R.quote(cfg(), { postalCode: ' 41 749 ', subtotalCents: 3000 }).zone.id, 'viersen-41749');
  assert.equal(R.quote(cfg(), { postalCode: '4174', subtotalCents: 3000 }).reason, 'POSTAL_CODE_INVALID');
  assert.equal(R.quote(cfg(), { postalCode: '41061', subtotalCents: 5000 }).reason, 'OUT_OF_AREA');
});

test('quote: Mönchengladbach 41063 = 4 EUR fee, 30 EUR minimum', () => {
  const c = cfg();
  const m = R.quote(c, { postalCode: '41063', subtotalCents: 3000 });
  assert.equal(m.ok, true); assert.equal(m.customerFeeCents, 400); assert.equal(m.totalCents, 3400);
  assert.equal(R.quote(c, { postalCode: '41063', subtotalCents: 2999 }).reason, 'BELOW_MINIMUM');
  assert.equal(R.quote(c, { postalCode: '41061', subtotalCents: 5000 }).reason, 'OUT_OF_AREA');
  const next = R.updateConfig(c, { zones: c.zones.map(z => z.id === 'moenchengladbach-start' ? { ...z, postalCodes: ['41061'], customerFeeCents: 400, needsSetup: false } : z) });
  const q = R.quote(next, { postalCode: '41061', subtotalCents: 2999 });
  assert.equal(q.reason, 'BELOW_MINIMUM'); assert.equal(q.minOrderCents, 3000);
  assert.equal(R.quote(next, { postalCode: '41061', subtotalCents: 3000 }).ok, true);
  // zone with postal code but no fee yet
  const half = R.updateConfig(c, { zones: c.zones.map(z => z.id === 'moenchengladbach-start' ? { ...z, postalCodes: ['41061'], customerFeeCents: null } : z) });
  assert.equal(R.quote(half, { postalCode: '41061', subtotalCents: 5000 }).reason, 'ZONE_NOT_CONFIGURED');
});

test('quote: pickup has no fee and no minimum', () => {
  const q = R.quote(cfg(), { type: 'pickup', subtotalCents: 500 });
  assert.equal(q.ok, true); assert.equal(q.customerFeeCents, 0); assert.equal(q.totalCents, 500);
});

test('public zones never expose driver pay and hide unconfigured zones', () => {
  const zones = R.publicZones(cfg());
  assert.equal(zones.length, 4);
  for (const z of zones) assert.equal('driverPayCents' in z, false);
  assert.equal(JSON.stringify(zones).includes('driverPay'), false);
});

test('validate: duplicates and bad numbers are rejected', () => {
  const c = cfg();
  c.zones[1].postalCodes = ['41747'];
  assert.match(R.validateConfig(c).errors.join(' '), /41747/);
  const d = cfg(); d.zones[0].minOrderCents = -1;
  assert.equal(R.validateConfig(d).ok, false);
  const e = cfg(); e.kmTiers = [{ upToKm: 7, cents: 150 }, { upToKm: 5, cents: 100 }];
  assert.equal(R.validateConfig(e).ok, false);
  const f = cfg(); f.payRule = 'hourly';
  assert.equal(R.validateConfig(f).ok, false);
  const g = cfg(); g.zones[0].postalCodes = ['4174'];
  assert.equal(R.validateConfig(g).ok, false);
});

test('zone pay rule: standard pay, per-driver override and factor', () => {
  const c = cfg();
  assert.equal(R.standardPay(c, { zoneId: 'viersen-41751' }).cents, 300);
  assert.equal(R.driverPay(c, {}, { zoneId: 'viersen-41751' }).cents, 300);
  const trainee = { deliveryPay: { zoneCents: { 'viersen-41751': 200 } } };
  const p = R.driverPay(c, trainee, { zoneId: 'viersen-41751' });
  assert.equal(p.cents, 200); assert.equal(p.source, 'driver-override');
  assert.equal(R.driverPay(c, trainee, { zoneId: 'viersen-41749' }).cents, 200); // no override for this zone -> standard
  const veteran = { deliveryPay: { factor: 1.5 } };
  assert.equal(R.driverPay(c, veteran, { zoneId: 'viersen-41749' }).cents, 300);
  assert.equal(R.driverPay(c, {}, { zoneId: 'nope' }).reason, 'ZONE_UNKNOWN');
});

test('fairness uses the standard pay, not the personal pay', () => {
  const c = cfg();
  const rec = R.orderPayRecord(c, { deliveryPay: { zoneCents: { 'viersen-41751': 50 } } }, { postalCode: '41751', km: 6 });
  assert.equal(rec.standardPayCents, 300); assert.equal(rec.driverPayCents, 50);
});

test('km pay rule: tier boundaries', () => {
  const c = R.updateConfig(cfg(), { payRule: 'km' });
  const at = km => R.standardPay(c, { km }).cents;
  assert.equal(at(0.4), 100); assert.equal(at(5), 100); assert.equal(at(5.01), 150);
  assert.equal(at(7), 150); assert.equal(at(7.5), 300); assert.equal(at(8), 300);
  assert.equal(at(9.9), 300); assert.equal(at(10), 300);
  assert.equal(R.standardPay(c, { km: 10.01 }).reason, 'OVER_MAX_KM');
  assert.equal(R.standardPay(c, {}).reason, 'KM_MISSING');
  assert.equal(R.standardPay(c, { km: '' }).reason, 'KM_MISSING');
});

test('update: version increments, old object untouched, invalid rejected', () => {
  const c = cfg();
  const before = JSON.stringify(c);
  const next = R.updateConfig(c, { payRule: 'km' }, new Date('2026-10-08T10:00:00Z'));
  assert.equal(next.version, 2); assert.equal(next.payRule, 'km'); assert.equal(next.updatedAt, '2026-10-08T10:00:00.000Z');
  assert.equal(JSON.stringify(c), before);
  assert.throws(() => R.updateConfig(c, { payRule: 'banana' }), /Invalid delivery config/);
  assert.throws(() => R.updateConfig(c, { zones: [] }), /Invalid delivery config/);
});

test('order pay record keeps the rule version, later changes do not alter it', () => {
  const c = cfg();
  const rec = R.orderPayRecord(c, {}, { postalCode: '41749', km: 4.2 });
  assert.deepEqual({ z: rec.zoneId, v: rec.ruleVersion, p: rec.driverPayCents, r: rec.payRule }, { z: 'viersen-41749', v: 1, p: 200, r: 'zone' });
  const c2 = R.updateConfig(c, { payRule: 'km' });
  const rec2 = R.orderPayRecord(c2, {}, { postalCode: '41749', km: 4.2 });
  assert.equal(rec2.ruleVersion, 2); assert.equal(rec2.driverPayCents, 100);
  assert.equal(rec.driverPayCents, 200); // stored record is unchanged
});

test('order pay record without km under km rule reports the reason instead of inventing a value', () => {
  const c = R.updateConfig(cfg(), { payRule: 'km' });
  const rec = R.orderPayRecord(c, {}, { postalCode: '41747' });
  assert.equal(rec.driverPayCents, null); assert.equal(rec.payReason, 'KM_MISSING');
});
