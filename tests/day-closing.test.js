'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const DC = require('../day-closing.js');

const DAY = '2026-10-31', AT = '2026-10-31T12:00:00.000Z' /* 13:00 Berlin */, NOW = '2026-10-31T20:00:00.000Z';
let seq = 0; const newId = p => p + '-' + (++seq);
const mkData = (x = {}) => ({ orders: [], payments: [], receipts: [], fiscalTransactions: [], auditEvents: [], cashbooks: [], dailySettlements: [], categories: [], settings: {},
  products: [{ id: 'p1', name: 'Burger', category: 'Burger' }, { id: 'd1', name: 'Cola', category: 'Getränke' }], ...x });
const it = (pid, name, cents, q = 1) => ({ id: pid + '-1730000000000', name, unitCents: cents, quantity: q });
const burger = c => it('p1', 'Burger', c), cola = c => it('d1', 'Cola', c);
const total = cart => cart.reduce((s, i) => s + i.unitCents * i.quantity, 0);

function sale(d, { id, cart, method = 'CASH', lines, tip = 0, at = AT, discount = null, order = {}, pay = {} }) {
  const gross = total(cart), amount = gross - (discount ? discount.amountCents : 0);
  d.orders.push({ id, displayCode: '#' + id, status: 'COMPLETED', createdAt: at, cart, ...order });
  const p = { id: 'pay-' + id, orderId: id, method: lines ? 'MIXED' : method, paymentLines: lines || [{ method, amountCents: amount }], amountCents: amount, grossAmountCents: gross, discount, tipCents: tip, status: 'COMPLETED', createdAt: at, ...pay };
  d.payments.push(p); return p;
}
const thrown = (fn, code, status) => assert.throws(fn, e => e instanceof DC.ClosingError && e.code === code && (!status || e.status === status));

test('كاش/كارت + ضريبة 7% أكل و19% مشروبات، ومجموع الضريبة = مجموع النسب', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(1000), cola(300)], method: 'CASH' }); sale(d, { id: 'b', cart: [burger(700)], method: 'CARD' });
  const r = DC.build(d, DAY);
  assert.equal(r.revenue.grossCents, 2000); assert.equal(r.revenue.cashCents, 1300); assert.equal(r.revenue.cardCents, 700);
  assert.deepEqual(r.vat.rows, [{ rate: 7, grossCents: 1700, netCents: 1589, vatCents: 111 }, { rate: 19, grossCents: 300, netCents: 252, vatCents: 48 }]);
  assert.equal(r.vat.vatCents, 159); assert.equal(r.vat.grossCents, 2000); assert.equal(r.vat.netCents + r.vat.vatCents, 2000);
  assert.equal(r.counts.orders, 2);
});

test('دفع مقسوم كاش + كارت', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(1000)], lines: [{ method: 'CASH', amountCents: 600 }, { method: 'CARD', amountCents: 400 }] });
  const r = DC.build(d, DAY);
  assert.equal(r.revenue.cashCents, 600); assert.equal(r.revenue.cardCents, 400); assert.equal(r.revenue.otherCents, 0);
});

test('الخصم: المبلغ بعد الخصم، والخصم سطر مستقل، والتوزيع على النسب متناسب', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(1000), cola(1000)], discount: { type: 'AMOUNT', amountCents: 200 } });
  const r = DC.build(d, DAY);
  assert.equal(r.revenue.grossCents, 1800); assert.equal(r.revenue.discountCents, 200); assert.equal(r.revenue.grossBeforeDiscountCents, 2000);
  assert.deepEqual(r.vat.rows.map(x => [x.rate, x.grossCents]), [[7, 900], [19, 900]]);
});

test('أكبر باقي: المجموع دايماً دقيق؛ سلة فاضية = كلها نسبة الأكل', () => {
  const a = DC.allocate(100, new Map([[7, 1], [19, 2]]), 7);
  assert.equal(a.get(7), 33); assert.equal(a.get(19), 67);
  for (const t of [1, 2, 3, 7, 99, 101]) assert.equal([...DC.allocate(t, new Map([[7, 1], [19, 1], [0, 1]]), 7).values()].reduce((s, x) => s + x, 0), t);
  const d = mkData(); sale(d, { id: 'a', cart: [], amount: 500, pay: { amountCents: 500, paymentLines: [{ method: 'CASH', amountCents: 500 }] } });
  assert.deepEqual(DC.build(d, DAY).vat.rows.map(x => [x.rate, x.grossCents]), [[7, 500]]);
});

test('البقشيش سطر مستقل (مو مبيعات)، وبقشيش الكاش بس بيدخل الصندوق', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(1000)], method: 'CASH', tip: 150 }); sale(d, { id: 'b', cart: [burger(500)], method: 'CARD', tip: 70 });
  const r = DC.build(d, DAY);
  assert.equal(r.revenue.grossCents, 1500); assert.equal(r.revenue.tipCents, 220); assert.equal(r.revenue.tipCashCents, 150);
  assert.equal(r.vat.grossCents, 1500);
});

test('REAL بيستبعد التجربة والتدريب والمنصات؛ TRAINING بيعرض التدريب لحاله', () => {
  const d = mkData();
  sale(d, { id: 'real', cart: [burger(1000)] });
  sale(d, { id: 'tr', cart: [burger(400)], order: { training: true }, pay: { isTest: true } });
  sale(d, { id: 'tst', cart: [burger(300)], order: { isTest: true }, pay: { isTest: true } });
  sale(d, { id: 'plat', cart: [burger(900)], order: { source: 'LIEFERANDO' } });
  const real = DC.build(d, DAY), tr = DC.build(d, DAY, { mode: 'TRAINING' });
  assert.equal(real.revenue.grossCents, 1000); assert.equal(real.counts.orders, 1);
  assert.equal(tr.mode, 'TRAINING'); assert.equal(tr.revenue.grossCents, 400); assert.equal(tr.counts.orders, 1);
  assert.equal(tr.tse, null); assert.equal(tr.platform.rows.length, 0);
});

test('المنصات: قسم منفصل مع عمولة، وبدون ما تدخل مبيعات الكاشير', () => {
  const d = mkData();
  sale(d, { id: 'k', cart: [burger(1000)] });
  d.orders.push({ id: 'L1', source: 'LIEFERANDO', placedAt: AT, totalCents: 4000, status: 'ACCEPTED', cashDueCents: 0, externalPaymentStatus: 'PAID_ON_PLATFORM' });
  d.orders.push({ id: 'L2', source: 'LIEFERANDO', brand: 'Loco Chicken', placedAt: AT, totalCents: 2000, status: 'ACCEPTED', cashDueCents: 2000 });
  d.orders.push({ id: 'L3', source: 'WOLT', placedAt: AT, totalCents: 999, status: 'CANCELLED' });
  const r = DC.build(d, DAY);
  assert.equal(r.revenue.grossCents, 1000);
  assert.deepEqual(r.platform.rows.map(x => [x.key, x.count, x.grossCents, x.rate, x.commissionCents, x.cashDueCents]), [['LIEFERANDO', 1, 4000, 25, 1000, 0], ['LOCO', 1, 2000, 25, 500, 2000]]);
  assert.equal(r.platform.grossCents, 6000); assert.equal(r.platform.commissionCents, 1500); assert.equal(r.platform.cancelled, 1);
});

test('حدّ يوم الشغل: 04:59 لليوم اللي قبل، 05:01 ونص الليل لنفس اليوم', () => {
  const d = mkData();
  sale(d, { id: 'a', cart: [burger(100)], at: '2026-10-31T03:59:00.000Z' });
  sale(d, { id: 'b', cart: [burger(200)], at: '2026-10-31T04:01:00.000Z' });
  sale(d, { id: 'c', cart: [burger(400)], at: '2026-10-31T23:30:00.000Z' });
  assert.equal(DC.build(d, DAY).revenue.grossCents, 600);
  assert.equal(DC.build(d, '2026-10-30').revenue.grossCents, 100);
});

test('Storno: بيوم الـStorno، مطروح من الصافي والضريبة والكاش بنفس طريقة الدفع الأصلية', () => {
  const d = mkData(); sale(d, { id: 'S1', cart: [burger(1000), cola(300)], method: 'CASH', order: { status: 'STORNIERT' } });
  d.auditEvents.push({ type: 'STORNO', orderId: 'S1', createdAt: AT, details: { amountCents: 1300, originalPaymentIds: ['pay-S1'], reason: 'Fehlbon' } });
  const r = DC.build(d, DAY);
  assert.equal(r.storno.count, 1); assert.equal(r.storno.amountCents, 1300); assert.equal(r.storno.cashCents, 1300);
  assert.equal(r.net.grossCents, 0); assert.deepEqual(r.vat.rows, []); assert.equal(r.cash.refundsCents, 1300); assert.equal(r.cash.expectedCents, 0);
  // Storno يوم تاني لبيع قديم
  const d2 = mkData(); sale(d2, { id: 'S2', cart: [burger(1000), cola(300)], at: '2026-10-30T12:00:00.000Z', order: { status: 'STORNIERT' } });
  d2.auditEvents.push({ type: 'STORNO', orderId: 'S2', createdAt: AT, details: { amountCents: 1300, originalPaymentIds: ['pay-S2'] } });
  const r2 = DC.build(d2, DAY);
  assert.equal(r2.revenue.grossCents, 0); assert.equal(r2.net.grossCents, -1300); assert.equal(r2.vat.grossCents, -1300);
  assert.deepEqual(r2.vat.rows.map(x => [x.rate, x.grossCents]), [[7, -1000], [19, -300]]);
});

test('طلبات ملغاة ومفتوحة غير مدفوعة', () => {
  const d = mkData();
  d.orders.push({ id: 'c1', displayCode: '#c1', status: 'CANCELLED', createdAt: AT, cancelledAt: AT, cart: [burger(800)] });
  d.orders.push({ id: 'o1', displayCode: '#o1', status: 'NEW', createdAt: AT, cart: [burger(500)] });
  d.orders.push({ id: 'o2', status: 'NEW', createdAt: '2026-10-29T12:00:00.000Z', cart: [burger(500)] });
  d.orders.push({ id: 'o3', status: 'NEW', createdAt: AT, cart: [burger(500)], training: true });
  d.orders.push({ id: 'o4', status: 'NEW', createdAt: AT, cart: [burger(500)], source: 'WOLT' });
  const r = DC.build(d, DAY);
  assert.deepEqual(r.cancelled, { count: 1, cartCents: 800 });
  assert.deepEqual(r.open.rows, [{ id: 'o1', code: '#o1', totalCents: 500 }]); assert.equal(r.open.count, 1);
  assert.equal(DC.build(d, DAY, { mode: 'TRAINING' }).open.count, 1);
});

test('عدّ الصندوق: المتوقع، الفرق، الحالة، والمبلغ المسحوب', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(2000)], method: 'CASH', tip: 100 });
  d.cashbooks.push({ date: DAY, type: 'DEPOSIT', inCents: 1000, outCents: 0 }, { date: DAY, type: 'WITHDRAWAL', inCents: 0, outCents: 500 });
  const r = DC.build(d, DAY, { openingCents: 5000, countedCents: 7500, leaveCents: 5000 });
  assert.equal(r.cash.expectedCents, 7600); assert.equal(r.cash.differenceCents, -100); assert.equal(r.cash.state, 'SHORT'); assert.equal(r.cash.takeOutCents, 2500);
  assert.equal(DC.build(d, DAY, { openingCents: 5000, countedCents: 7700 }).cash.state, 'OVER');
  const ok = DC.build(d, DAY, { openingCents: 5000, countedCents: 7600 }); assert.equal(ok.cash.state, 'OK'); assert.equal(ok.cash.leaveCents, 7600);
  assert.equal(DC.build(d, DAY).cash.countedCents, undefined);
});

test('رصيد البداية: يدوي ← Cashbook OPENING ← تقفيلة سابقة ← صفر', () => {
  const d = mkData();
  assert.deepEqual([DC.build(d, DAY).cash.openingCents, DC.build(d, DAY).cash.openingSource], [0, 'NONE']);
  d.dailySettlements.push({ id: 's0', mode: 'REAL', type: 'CLOSING', day: '2026-10-30', closedAt: '2026-10-30T20:00:00.000Z', count: { countedCents: 9000, leaveCents: 4000 } });
  assert.deepEqual([DC.build(d, DAY).cash.openingCents, DC.build(d, DAY).cash.openingSource], [4000, 'PREVIOUS']);
  d.cashbooks.push({ date: DAY, type: 'OPENING', inCents: 3000, outCents: 0 });
  assert.deepEqual([DC.build(d, DAY).cash.openingCents, DC.build(d, DAY).cash.openingSource], [3000, 'CASHBOOK']);
  assert.deepEqual([DC.build(d, DAY, { openingCents: 1234 }).cash.openingCents, DC.build(d, DAY, { openingCents: 1234 }).cash.openingSource], [1234, 'INPUT']);
});

test('يوم فاضي: أصفار بدون خطأ', () => {
  const r = DC.build(mkData(), DAY);
  assert.equal(r.revenue.grossCents, 0); assert.equal(r.counts.orders, 0); assert.deepEqual(r.vat.rows, []); assert.equal(r.vat.vatCents, 0); assert.equal(r.counts.avgCents, 0);
  thrown(() => DC.build(mkData(), 'x'), 'BAD_DAY', 422);
});

test('TSE: موقّع/غير موقّع، الرقم التسلسلي، أول وآخر وصل', () => {
  const d = mkData();
  sale(d, { id: 'a', cart: [burger(100)], at: '2026-10-31T10:00:00.000Z' }); sale(d, { id: 'b', cart: [burger(100)], at: '2026-10-31T11:00:00.000Z' });
  d.fiscalTransactions.push({ paymentId: 'pay-a', transactionNumber: '12', tseSerialNumber: 'SER1' }, { paymentId: 'pay-b', status: 'DEVELOPMENT_NOT_CONFIGURED' });
  d.receipts.push({ paymentId: 'pay-b', receiptNumber: 'R-2' }, { paymentId: 'pay-a', receiptNumber: 'R-1' });
  const r = DC.build(d, DAY);
  assert.deepEqual(r.tse, { signed: 1, unsigned: 1, serial: 'SER1' }); assert.deepEqual(r.receipts, { first: 'R-1', last: 'R-2' });
});

test('تصنيف الضريبة: override، تصنيف، أسماء مشروبات بدون false-positive', () => {
  assert.equal(DC.isDrinkName('Saftiges Beef Burger'), false); assert.equal(DC.isDrinkName('Schweinefleisch'), false); assert.equal(DC.isDrinkName('Steak'), false);
  assert.equal(DC.isDrinkName('Cola 0,33'), true); assert.equal(DC.isDrinkName('Getränke'), true); assert.equal(DC.isDrinkName('عصير برتقال'), true);
  const d = mkData({ products: [{ id: 'p9', name: 'Spezial', vatRate: 0 }, { id: 'p5', name: 'Mystery', categoryId: 'c1' }, { id: 'p6', name: 'Ayran' }], categories: [{ id: 'c1', name: 'Getränke' }] });
  const { rateOf } = DC.rateResolver(d);
  assert.equal(rateOf({ id: 'p9-1730000000000' }), 0); assert.equal(rateOf({ id: 'p5-1730000000000' }), 19); assert.equal(rateOf({ id: 'p6-1730000000000' }), 19);
  assert.equal(rateOf({ id: 'zz-1', name: 'Cola' }), 19); assert.equal(rateOf({ id: 'zz-1', name: 'Burger' }), 7); assert.equal(rateOf({ id: 'p1-1730000000000', vatRate: 19 }), 19);
});

test('إنشاء التقفيلة: رقم Z، سجل REAL، تقفيلة ثانية 409، تدريب/مستقبل/عدّ ناقص مرفوض', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(2000)] });
  const user = { id: 'u1', name: 'Omar', role: 'OWNER' };
  const rec = DC.makeRecord(d, { day: DAY, input: { countedCents: 2000, denominations: { 1000: 2 } }, user, now: NOW, newId });
  assert.equal(rec.number, 'Z-2026-0001'); assert.equal(rec.type, 'CLOSING'); assert.equal(rec.mode, 'REAL'); assert.equal(rec.closedBy.role, 'OWNER');
  assert.equal(rec.report.cash.countedCents, 2000); assert.equal(rec.count.leaveCents, 2000); assert.deepEqual(rec.count.denominations, { 1000: 2 });
  d.dailySettlements.push(rec);
  thrown(() => DC.makeRecord(d, { day: DAY, input: { countedCents: 2000 }, now: NOW, newId }), 'ALREADY_CLOSED', 409);
  const e = mkData();
  thrown(() => DC.makeRecord(e, { day: DAY, input: { mode: 'TRAINING', countedCents: 0 }, now: NOW, newId }), 'TRAINING_NOT_SAVED', 422);
  thrown(() => DC.makeRecord(e, { day: DAY, input: {}, now: NOW, newId }), 'COUNT_REQUIRED', 422);
  thrown(() => DC.makeRecord(e, { day: '2026-11-02', input: { countedCents: 0 }, now: NOW, newId }), 'FUTURE_DAY', 422);
  thrown(() => DC.makeRecord(e, { day: DAY, input: { countedCents: 3000, denominations: { 2000: 1 } }, now: NOW, newId }), 'DENOMINATIONS_MISMATCH', 422);
  thrown(() => DC.makeRecord(e, { day: DAY, input: { countedCents: 1000, leaveCents: 1500 }, now: NOW, newId }), 'BAD_LEAVE', 422);
  assert.equal(DC.makeRecord(e, { day: DAY, input: { countedCents: 0 }, now: NOW, newId }).report.revenue.grossCents, 0);
});

test('ترقيم: يزيد بنفس السنة، يبدأ من جديد بالسنة الجاية، والتدريب ما بيدخل', () => {
  const d = mkData({ dailySettlements: [
    { mode: 'REAL', type: 'CLOSING', day: '2026-10-30', number: 'Z-2026-0007' }, { mode: 'TRAINING', type: 'CLOSING', day: '2026-10-30', number: 'Z-2026-0099' },
    { mode: 'REAL', type: 'NACHTRAG', day: '2026-10-30', number: 'Z-2026-0007-N1' }] });
  assert.equal(DC.nextNumber(d, DAY), 'Z-2026-0008'); assert.equal(DC.nextNumber(d, '2027-01-02'), 'Z-2027-0001');
});

test('مبيعات بعد التقفيلة: تحذير ثم Nachtrag بالفرق بس، وبعدو ما في تحذير', () => {
  const d = mkData(); sale(d, { id: 'a', cart: [burger(1000)] });
  thrown(() => DC.makeRecord(d, { day: DAY, input: { nachtrag: true }, now: NOW, newId }), 'NO_CLOSING', 409);
  d.dailySettlements.push(DC.makeRecord(d, { day: DAY, input: { countedCents: 1000 }, now: NOW, newId }));
  assert.equal(DC.status(d, DAY).closed, true); assert.equal(DC.status(d, DAY).lateSales, null);
  thrown(() => DC.makeRecord(d, { day: DAY, input: { nachtrag: true }, now: '2026-10-31T22:00:00.000Z', newId }), 'NOTHING_NEW', 409);
  sale(d, { id: 'late', cart: [burger(250)], at: '2026-10-31T21:00:00.000Z' });
  assert.deepEqual(DC.status(d, DAY).lateSales, { count: 1, grossCents: 250, stornoCount: 0 });
  const n = DC.makeRecord(d, { day: DAY, input: { nachtrag: true }, now: '2026-10-31T22:00:00.000Z', newId });
  assert.equal(n.number, 'Z-2026-0001-N1'); assert.equal(n.type, 'NACHTRAG'); assert.equal(n.report.revenue.grossCents, 250); assert.equal(n.refId, d.dailySettlements[0].id);
  d.dailySettlements.push(n);
  assert.equal(DC.status(d, DAY).lateSales, null);
});

test('أيام فاتت بدون تقفيلة', () => {
  const d = mkData(); sale(d, { id: 'old', cart: [burger(500)], at: '2026-10-29T12:00:00.000Z' });
  assert.deepEqual(DC.status(d, DAY).missedDays, ['2026-10-29']);
  d.dailySettlements.push({ id: 's', mode: 'REAL', type: 'CLOSING', day: '2026-10-29', number: 'Z-2026-0001', closedAt: '2026-10-29T20:00:00.000Z' });
  assert.deepEqual(DC.status(d, DAY).missedDays, []);
  assert.equal(DC.status(d, DAY).nextNumber, 'Z-2026-0002');
});

test('إعادة الطباعة: رقم النسخة بيزيد من التدقيق والسجل ما بيتعدّل', () => {
  const d = mkData(); const s = { id: 's1', number: 'Z-2026-0001' }, before = JSON.stringify(s);
  const a1 = DC.reprintAudit(d, s, { name: 'Omar' }, NOW, newId); assert.equal(a1.details.copyNumber, 1); d.auditEvents.push(a1);
  assert.equal(DC.reprintAudit(d, s, null, NOW, newId).details.copyNumber, 2); assert.equal(JSON.stringify(s), before);
});
