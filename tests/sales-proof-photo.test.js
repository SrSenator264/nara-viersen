'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const h = fs.readFileSync(__dirname + '/../sales.html', 'utf8'), a = fs.readFileSync(__dirname + '/../auth.js', 'utf8');
test('sales page: 📷 marker only when order has deliveryProof, detail shows the photo with fallback', () => {
  assert.match(h, /r\.order&&r\.order\.deliveryProof\?' 📷':''/);
  assert.match(h, /function proofBlock\(r\)\{const p=r\.order&&r\.order\.deliveryProof;if\(!p\|\|!p\.file\)return''/);
  assert.match(h, /\/api\/delivery\/proof\?orderId=/); assert.match(h, /proofGone/);
  for (const k of ['proofTitle', 'proofBy', 'proofGone']) assert.match(h, new RegExp(k + ":\\{de:'.+',ar:'.+',en:'.+'\\}"));
});
test('photo endpoint is cashier-level only (drivers cannot open it)', () => {
  assert.match(a, /\['GET', \/\^\\\/api\\\/delivery\\\/proof\$\/, CASH\]/);
});
