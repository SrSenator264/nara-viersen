'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const PS = require('../print-service.js');
const A = require('../platform-accept.js');

const panel = fs.readFileSync(path.join(__dirname, '..', 'kasse-printer-panel.js'), 'utf8');

test('printer panel: big accept-print switch exists and toggles both on-accept flags', () => {
  assert.match(panel, /id="npp-accept"/);
  assert.match(panel, /cfg\.auto\.receiptOnAccept=next/);
  assert.match(panel, /cfg\.auto\.kitchenOnAccept=next/);
  for (const k of ['aAccept', 'aOn', 'aOff', 'aAcceptHint']) assert.equal((panel.match(new RegExp(k + ':', 'g')) || []).length, 3, k + ' in de/ar/en');
});

test('printer panel: switching off is saved and stops printing on accept', () => {
  const off = PS.sanitize({ auto: { receiptOnAccept: false, kitchenOnAccept: false } });
  assert.equal(off.auto.receiptOnAccept, false); assert.equal(off.auto.kitchenOnAccept, false);
  assert.equal(PS.sanitize({}).auto.receiptOnAccept, true, 'default stays on');
  const o = { id: 'x', source: 'LIEFERANDO', platform: 'LIEFERANDO', status: 'ACCEPTED' };
  assert.deepEqual(A.printJobs(o, { auto: off.auto }, { onAccept: true }), []);
});

test('printer panel: website orders are not affected by the accept switch', () => {
  const off = PS.sanitize({ auto: { receiptOnAccept: false, kitchenOnAccept: false } });
  assert.equal(off.auto.webOrder, true);
});
