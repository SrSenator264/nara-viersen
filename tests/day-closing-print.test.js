'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = require('../auth.js'), bizDay = require('../business-day.js');
const DC = require('../day-closing.js'), P = require('../day-closing-print.js'), R = require('../day-closing-routes.js'), PS = require('../print-service.js');

const clone = x => JSON.parse(JSON.stringify(x));
function data() {
  const now = new Date().toISOString();
  const d = { orders: [], payments: [], receipts: [], fiscalTransactions: [{ id: 'f1', transactionNumber: 1, tseSerialNumber: 'SER1', createdAt: now }], auditEvents: [], cashbooks: [], dayClosings: [], dailySettlements: [], categories: [], settings: {}, products: [] };
  d.orders.push({ id: 'a', displayCode: '#a', status: 'COMPLETED', createdAt: now, cart: [{ id: 'p1-1730000000000', name: 'Burger', unitCents: 1700, quantity: 1 }] });
  d.payments.push({ id: 'pa', orderId: 'a', method: 'CASH', paymentLines: [{ method: 'CASH', amountCents: 1700 }], amountCents: 1700, grossAmountCents: 1700, tipCents: 0, status: 'COMPLETED', createdAt: now });
  return d;
}
function rec(d) {
  return DC.makeRecord(d, { day: bizDay.today(), input: { countedCents: 1700, leaveCents: 0 }, user: { id: 'u', name: 'Omar', role: 'OWNER' }, now: new Date().toISOString(), newId: p => p + '-1' });
}

test('إيصال 80mm: ألماني، بدون تحذيرات/علامات، "Kopie" بس من النسخة 2', () => {
  const r = rec(data()), t = o => P.receiptLines(r, o).map(l => l.text).join('\n');
  const one = t({ copyNumber: 1 });
  assert.match(one, /TAGESABSCHLUSS/); assert.match(one, new RegExp(r.number)); assert.doesNotMatch(one, /Kopie|⚠|Warn|Training|TRAIN/i);
  assert.match(t({ copyNumber: 2 }), /Kopie 2/);
  assert.ok(P.receiptLines(r, { width: 42 }).every(l => l.text.length <= 42), 'سطر أطول من 42');
  assert.ok(P.receiptLines(r, { width: 32 }).every(l => l.text.length <= 32), 'سطر أطول من 32');
  assert.match(one, /17,00/);
});

test('تقفيلة بلا توقيع TSE: الورقة ما بتذكر تحذير؛ A4 وإيصال HTML صالحين', () => {
  const d = data(); d.fiscalTransactions = []; const r = rec(d);
  for (const h of [P.a4Html(r), P.receiptHtml(r)]) { assert.match(h, /^<!doctype html>/i); assert.doesNotMatch(h, /⚠|Training|Probe/i); assert.match(h, /@page/); }
  assert.match(P.a4Html(r), /size:\s*A4/i); assert.match(P.receiptHtml(r), /80mm/);
});

test('ESC/POS نصي: init + codepage + أمر القص + Umlaute بـCP858', () => {
  const b = PS.buildTextJob([{ text: 'Größe €', align: 'center', bold: true }], { cut: 'full' });
  assert.deepEqual([...b.slice(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 19]);
  assert.ok(b.includes(0x94) && b.includes(0xe1) && b.includes(0xd5), 'ö ß €');
  assert.equal(b[b.length - 1], PS.buildTextJob([], { cut: 'full' })[PS.buildTextJob([], { cut: 'full' }).length - 1]);
});

test('طباعة browser: printClosing بيرجّع mode=browser بدون إرسال', async () => {
  const r = await PS.printClosing({ settings: {} }, rec(data()), { copyNumber: 1 });
  assert.equal(r.ok, true); assert.equal(r.mode, 'browser');
});

function mkRoutes(printService) {
  const store = { data: data() }; let n = 0;
  const ctx = { readAdminData: () => clone(store.data), writeAdminData: x => { store.data = clone(x); }, adminId: p => p + '-' + (++n), reply: (res, s, b) => { res.status = s; res.body = b; }, bizDay,
    naraJsonBody: (req, res, l, h) => h(req.body || {}), printService };
  const wait = () => new Promise(r => setTimeout(r, 20));
  const call = async (p, body, role = 'OWNER') => { const res = {}; R.handle({ method: 'POST', naraUser: { id: 'u', name: 'Omar', role }, body }, res, new URL('http://x' + p), ctx); await wait(); return res; };
  return { store, call };
}

test('/print: يطبع أول وبعدين يدوّن؛ نسخة 1 ثم 2', async () => {
  const calls = []; const { store, call } = mkRoutes({ printClosing: async (d, r, o) => { calls.push(o.copyNumber); return { mode: 'network' }; } });
  const c = await call('/api/day-closing/close', { day: bizDay.today(), countedCents: 1700, leaveCents: 0 }); assert.equal(c.status, 200);
  const id = c.body.record.id;
  assert.equal((await call('/api/day-closing/print', { id })).body.copyNumber, 1);
  assert.equal((await call('/api/day-closing/print', { id })).body.copyNumber, 2);
  assert.deepEqual(calls, [1, 2]); assert.equal(store.data.auditEvents.filter(e => e.type === 'CLOSING_REPRINT').length, 2);
});

test('/print: فشل الطابعة = 502 وما بتنحسب نسخة', async () => {
  const { store, call } = mkRoutes({ printClosing: async () => { throw new Error('offline'); } });
  const id = (await call('/api/day-closing/close', { day: bizDay.today(), countedCents: 1700, leaveCents: 0 })).body.record.id;
  const r = await call('/api/day-closing/print', { id }); assert.equal(r.status, 502); assert.equal(r.body.code, 'PRINT_FAILED');
  assert.equal(store.data.auditEvents.filter(e => e.type === 'CLOSING_REPRINT').length, 0);
  assert.equal((await call('/api/day-closing/print', { id: 'nope' })).status, 404);
});

test('صلاحيات وتوصيل: print = OWNER/MANAGER بس، day-closing-print.js فرونت', () => {
  assert.equal(A.allowed(A.policyFor('POST', '/api/day-closing/print'), 'ACCOUNTANT'), false);
  assert.equal(A.allowed(A.policyFor('POST', '/api/day-closing/print'), 'MANAGER'), true);
  assert.equal(A.staticAllowed('day-closing-print.js'), true);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'kasse-settlement.html'), 'utf8').includes('day-closing-print.js'));
});

test('TSE مخفية مؤقتاً: لا ورقة ولا صفحة بتعرضها', () => {
  const r = rec(data()); assert.ok(r.report.tse && r.report.tse.signed >= 0);
  assert.doesNotMatch(P.receiptLines(r).map(l => l.text).join('\n'), /TSE|Signierte/); assert.doesNotMatch(P.a4Html(r), /TSE|Signierte/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'kasse-settlement.js'), 'utf8'), /tseCard/);
});

test('CSV: Semikolon + Dezimalkomma + BOM + Quotes؛ سطر لكل تقفيلة', () => {
  const r = rec(data()); r.count.note = 'a;b "x"';
  const c = P.closingCsv(r); assert.ok(c.startsWith('﻿Abschnitt;Posten;Wert\r\n'));
  assert.match(c, /Umsatz;Brutto;17,00\r\n/); assert.match(c, /Steuer 7 %;Brutto;17,00/); assert.match(c, /Notiz;;"a;b ""x"""/); assert.doesNotMatch(c, /TSE/);
  const l = P.listCsv([{ day: '2026-11-01', number: 'Z-2026-0001', type: 'CLOSING', closedAt: 'x', closedBy: 'Omar', grossCents: 123456, vatCents: 8000, differenceCents: -50 }]);
  assert.match(l, /2026-11-01;Z-2026-0001;Tagesabschluss;x;Omar;1234,56;80,00;-0,50\r\n$/);
});
