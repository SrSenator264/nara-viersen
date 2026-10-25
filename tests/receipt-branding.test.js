const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

test('receipt/order codes use Flamo prefix, not NARA', () => {
  for (const f of ['kasse-receipt.js', 'kasse-print-lifecycle.js', 'server.js', 'nara-receipt-core.mjs']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/'NARA-'\+String|'NARA\|'|`NARA\|/.test(s), f + ' still has NARA prefix');
  }
});

test('receipt numbers are random, not time-sequential', () => {
  const s = fs.readFileSync('server.js', 'utf8');
  assert.ok(!/receiptNumber:[^,]*Date\.now\(\)/.test(s));
  assert.ok(/function rcptSuffix\(\)\{return require\('crypto'\)\.randomBytes/.test(s));
});
