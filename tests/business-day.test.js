'use strict';
const test = require('node:test');
const assert = require('node:assert');
const B = require('../business-day.js');

test('orders after midnight belong to the previous business day (Berlin time)', () => {
  B.setStartHour(5);
  assert.equal(B.day('2026-10-10T22:30:00Z'), '2026-10-10');   // 00:30 Berlin am 11.10.
  assert.equal(B.day('2026-10-10T20:58:41Z'), '2026-10-10');   // 22:58 Berlin am 10.10.
  assert.equal(B.day('2026-10-11T02:59:00Z'), '2026-10-10');   // 04:59 Berlin
  assert.equal(B.day('2026-10-11T03:01:00Z'), '2026-10-11');   // 05:01 Berlin = neuer Tag
});

test('winter time and the start hour setting', () => {
  B.setStartHour(5);
  assert.equal(B.day('2026-12-01T23:30:00Z'), '2026-12-01');   // 00:30 Berlin am 02.12.
  B.setStartHour(3);
  assert.equal(B.day('2026-10-11T00:30:00Z'), '2026-10-10');   // 02:30 Berlin, vor 03:00 = alter Tag
  assert.equal(B.day('2026-10-11T02:30:00Z'), '2026-10-11');   // 04:30 Berlin, nach 03:00 = neuer Tag
  B.setStartHour(5);
});

test('dayOf keeps plain dates and converts full timestamps', () => {
  B.setStartHour(5);
  assert.equal(B.dayOf('2026-10-10'), '2026-10-10');
  assert.equal(B.dayOf('2026-10-10T22:05:13Z'), '2026-10-10');
  assert.equal(B.dayOf(''), '');
  assert.equal(B.setStartHour(99), 5, 'invalid hours are ignored');
});
