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

// ── شريط الأيام / رموز / صور فلامو ──
test('weekStrip: 7 أيام بالترتيب؛ closed / diff / open / empty', () => {
  const d = data(), today = bizDay.today(), t = new Date(today + 'T00:00:00Z'); const prev = n => { const x = new Date(t); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
  const w0 = DC.weekStrip(d, today); assert.equal(w0.length, 7); assert.equal(w0[6].day, today); assert.equal(w0[0].day, prev(6));
  assert.equal(w0[6].state, 'open'); assert.ok(w0.slice(0, 6).every(x => x.state === 'empty'));
  const r = rec(d); d.dayClosings.push(r); assert.equal(DC.weekStrip(d, today)[6].state, r.report.cash.differenceCents ? 'diff' : 'closed');
  const r2 = clone(r); r2.id = 'x2'; r2.day = prev(1); r2.report.cash.differenceCents = -500; d.dayClosings.push(r2);
  assert.equal(DC.weekStrip(d, today)[5].state, 'diff');
});

test('/week: مسار صحيح + يوم غلط = 400', async () => {
  const { call } = mkRoutes(null);
  const ok = await new Promise(res => { const out = {}; R.handle({ method: 'GET', naraUser: { role: 'OWNER' } }, out, new URL('http://x/api/day-closing/week'), { readAdminData: () => data(), reply: (r, s, b) => { r.status = s; r.body = b; }, bizDay }); res(out); });
  assert.equal(ok.status, 200); assert.equal(ok.body.days.length, 7);
  const bad = {}; R.handle({ method: 'GET', naraUser: { role: 'OWNER' } }, bad, new URL('http://x/api/day-closing/week?end=oops'), { readAdminData: () => data(), reply: (r, s, b) => { r.status = s; r.body = b; }, bizDay }); assert.equal(bad.status, 400);
  assert.equal(A.allowed(A.policyFor('GET', '/api/day-closing/week'), 'ACCOUNTANT'), true);
});

test('رموز موحّدة + صور فلامو الثلاث (PNG بشفافية) + الصفحة بتحمّلهم', () => {
  const I = require('../flamo-icons.js'); for (const k of ['cash', 'card', 'tax', 'platform', 'tip']) assert.ok(I.get(k).icon && /^#/.test(I.get(k).color), k);
  assert.match(I.html('cash'), /class="ic"/); assert.equal(A.staticAllowed('flamo-icons.js'), true);
  for (const n of ['happy', 'worried', 'sleeping']) {
    const b = fs.readFileSync(path.join(__dirname, '..', 'brand', 'flamo-' + n + '.png'));
    assert.equal(b.slice(1, 4).toString(), 'PNG'); assert.equal(b[25], 6, n + ' لازم RGBA (colour type 6)');
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'kasse-settlement.html'), 'utf8');
  assert.ok(html.includes('flamo-icons.js') && html.includes('id="sd-night"'));
});

test('حركة: احترام تقليل الحركة + الوضع الليلي موجود بالـCSS/JS', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'kasse-settlement.css'), 'utf8'), js = fs.readFileSync(path.join(__dirname, '..', 'kasse-settlement.js'), 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/); assert.match(css, /body\.night/); assert.match(js, /flamo-night/); assert.match(js, /prefers-reduced-motion/);
});

test('وضع ليلي عام: ملفات الفرونت + مفعّل بصفحة الكاشير', () => {
  const root = path.join(__dirname, '..'), js = fs.readFileSync(path.join(root, 'flamo-night.js'), 'utf8'), css = fs.readFileSync(path.join(root, 'flamo-night.css'), 'utf8');
  assert.equal(A.staticAllowed('flamo-night.js'), true); assert.match(js, /flamo-night/); assert.match(css, /html\.flamo-night/); assert.match(css, /@media print/);
  assert.ok(fs.readFileSync(path.join(root, 'kasse.html'), 'utf8').includes('flamo-night.js'));
});

test('وضع ليلي: الجزء 2 (Live Orders، المطبخ، السواقين)', () => {
  for (const f of ['live-orders.html', 'driver.html', 'driver-app-v2.html']) assert.ok(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('flamo-night.js'), f);
  assert.ok(!fs.readFileSync(path.join(__dirname, '..', 'kitchen.html'), 'utf8').includes('flamo-night'), 'المطبخ بدون وضع ليلي (طلب Omar)');
});

test('وضع ليلي: الجزء 3 (المحاسبة والأرقام)', () => {
  for (const f of ['accounting.html', 'sales.html', 'reports.html', 'dashboard.html', 'banking.html', 'admin.html']) assert.ok(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('flamo-night.js'), f);
});

test('زر الرئيسية 🏠: على كل الصفحات (حتى موقع الزبون) ما عدا الرئيسية نفسها، وبيظهر بس مع جلسة موظف', () => {
  const root = path.join(__dirname, '..'), skip = new Set(['nara-app.html', 'index.html', 'delivery-print.html']);
  for (const f of fs.readdirSync(root).filter(x => x.endsWith('.html') && !skip.has(x))) assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes('flamo-home.js'), f);
  assert.ok(fs.readFileSync(path.join(root, 'web-prototype', 'c.html'), 'utf8').includes('../flamo-home.js'));
  for (const f of skip) assert.ok(!fs.readFileSync(path.join(root, f), 'utf8').includes('flamo-home.js'), f);
  const js = fs.readFileSync(path.join(root, 'flamo-home.js'), 'utf8'); assert.match(js, /\/api\/auth\/me/); assert.match(js, /nara-app\.html/); assert.equal(A.staticAllowed('flamo-home.js'), true);
});

test('ترويسة مؤقتة: IU GENE على الإيصال وA4 (بدون Flamo)', () => {
  const r = rec(data()), t = P.receiptLines(r).map(l => l.text).join('\n'), h = P.a4Html(r);
  assert.match(t, /IU GENE/); assert.match(h, /class="brand">IU GENE</); assert.doesNotMatch(t, /Flamo/); assert.doesNotMatch(h.replace(/<style[\s\S]*?<\/style>/, ''), /Flamo/);
});

test('الرئيسية: زر 🏠 مكان زر المنيو بالشريط العلوي، وكرت المنيو بدل الإدارة', () => {
  const root = path.join(__dirname, '..'), nav = fs.readFileSync(path.join(root, 'flamo-nav.js'), 'utf8'), app = fs.readFileSync(path.join(root, 'nara-app.html'), 'utf8');
  assert.match(nav, /class="fn-menu" href="\$\{base\}\$\{HOME\.f\}">🏠/); assert.doesNotMatch(nav, /class="fn-menu"[^`]*menuPage/);
  assert.ok(app.includes("['admin','🍔','/admin-foundation.html',M]") && !app.includes("'/admin.html'"));
});
