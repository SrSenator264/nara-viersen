'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const DR = require('../daily-report.js');

const DAY = '2026-11-20', LAST = '2026-11-13';
const mk = () => ({ orders: [], payments: [], receipts: [], fiscalTransactions: [], auditEvents: [], cashbooks: [], dayClosings: [], categories: [], settings: {},
  products: [{ id: 'p1', name: 'Burger', category: 'Burger' }] });
const at = (day, hhmm = '12:00') => new Date(`${day}T${hhmm}:00+01:00`).toISOString();
let n = 0;
function sale(d, day, cents, method = 'CASH', extra = {}, when) {
  const id = 'o' + (++n), t = when || at(day);
  d.orders.push({ id, displayCode: '#' + id, status: 'COMPLETED', createdAt: t, cart: [{ id: 'p1-1', name: 'Burger', unitCents: cents, quantity: 1 }], ...extra });
  d.payments.push({ id: 'pay-' + id, orderId: id, method, paymentLines: [{ method, amountCents: cents }], amountCents: cents, grossAmountCents: cents, tipCents: 0, status: 'COMPLETED', createdAt: t });
}
function platform(d, day, key, cents, status = 'COMPLETED') {
  const id = 'pl' + (++n);
  d.orders.push({ id, platform: key, status, createdAt: at(day), placedAt: at(day), totalCents: cents, grossCents: cents, cart: [{ id: 'p1-1', name: 'Burger', unitCents: cents, quantity: 1 }] });
}

test('يوم عادي: أرقام المحل مطابقة للتقفيلة، والموقع معدود', () => {
  const d = mk(); sale(d, DAY, 1000, 'CASH'); sale(d, DAY, 500, 'CARD'); sale(d, DAY, 700, 'CARD', { source: 'WEB' });
  const r = DR.compose(d, DAY);
  assert.equal(r.today.ownCount, 3); assert.equal(r.today.ownGrossCents, 2200);
  assert.equal(r.today.cashCents, 1000); assert.equal(r.today.cardCents, 1200); assert.equal(r.today.webCount, 1);
  assert.match(r.text, /📊 تقرير اليوم 20\.11\.2026/); assert.match(r.text, /22,00 €/); assert.match(r.text, /منها الموقع 1/);
});

test('يوم فاضي: جملة واضحة وبدون تنبيهات', () => {
  const r = DR.compose(mk(), DAY);
  assert.match(r.text, /ما في طلبات اليوم/); assert.deepEqual(r.warnings, []);
});

test('طلب بعد نص الليل بينحسب لليوم التجاري اللي قبلو', () => {
  const d = mk(); sale(d, DAY, 900, 'CASH', {}, new Date('2026-11-21T00:40:00+01:00').toISOString());
  assert.equal(DR.compose(d, DAY).today.ownCount, 1);
  assert.equal(DR.compose(d, '2026-11-21').today.ownCount, 0);
});

test('تنبيهات: مبيعات نص الأسبوع الماضي + منصة غايبة + إلغاءات كتيرة', () => {
  const d = mk();
  for (let i = 0; i < 4; i++) sale(d, LAST, 2000);
  for (let i = 0; i < 3; i++) platform(d, LAST, 'LIEFERANDO', 1500);
  sale(d, DAY, 1000);
  for (let i = 0; i < 3; i++) d.orders.push({ id: 'c' + i, status: 'CANCELLED', createdAt: at(DAY), cancelledAt: at(DAY), cart: [] });
  const w = DR.compose(d, DAY).warnings.join('\n');
  assert.match(w, /أقل من نص/); assert.match(w, /3 طلبات ملغاة/);
  assert.match(w, /ولا طلب من Lieferando/);
  assert.equal(DR.summarize(d, LAST).platformGrossCents, 4500);
});

test('وقت التقرير: قبل 23:30 = مبارح، بعدها = اليوم، وبعد نص الليل = يوم الشغل اللي خلص', () => {
  assert.equal(DR.dueDay(Date.parse('2026-11-20T23:00:00+01:00')), '2026-11-19');
  assert.equal(DR.dueDay(Date.parse('2026-11-20T23:31:00+01:00')), '2026-11-20');
  assert.equal(DR.dueDay(Date.parse('2026-11-21T01:00:00+01:00')), '2026-11-20');
});

test('مرة وحدة باليوم، وبعد restart ما بيتكرر، وإذا فشل الإرسال بيعيد', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dr-')), 'daily-report.json');
  const sent = []; let ok = false;
  const alerts = { send: async (k, t) => { sent.push(k); return ok ? { sent: true } : { sent: false, reason: 'network' }; } };
  const now = Date.parse('2026-11-20T23:35:00+01:00'), readData = () => mk();
  assert.equal((await DR.tick({ readData, alerts, file, now })).sent, false);
  ok = true;
  assert.equal((await DR.tick({ readData, alerts, file, now: now + 60000 })).sent, true);
  assert.equal((await DR.tick({ readData, alerts, file, now: now + 120000 })).reason, 'done');
  assert.equal((await DR.tick({ readData, alerts, file, now: Date.parse('2026-11-21T09:00:00+01:00') })).reason, 'done');
  assert.equal(sent.length, 2);
});

test('قراءة بس: البيانات ما بتتغيّر', () => {
  const d = mk(); sale(d, DAY, 1000); const before = JSON.stringify(d);
  DR.compose(d, DAY); assert.equal(JSON.stringify(d), before);
});
