// receipt-flow.spec.mjs — المرحلة 2: وصل الكاشير + Storno + Tagesabschluss (TSE محاكاة بالسيرفر التجريبي).
// البيع والـStorno عبر نفس API اللي بيستعمله الكاشير؛ الوصل بيتبني بصفحة الكاشير الحقيقية (NARA_RECEIPT) من بيانات /api/print.
import { test, expect } from 'playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
const BURGER = { name: 'E2E Burger', category: 'Beef Burger', quantity: 1, unitCents: 1000, totalCents: 1000 };
const COLA = { name: 'E2E Cola', category: 'Alkoholfreie Getränke', quantity: 1, unitCents: 300, totalCents: 300 };

function apiCaller(request) {
  return async (method, path, data) => {
    const r = await request.fetch(path, { method, data });
    let json = null; try { json = await r.json(); } catch { /* مو JSON */ }
    return [r.status(), json];
  };
}
// بيع كاش كامل: ORDER_SYNC ← FINALIZE_PAYMENT. createdAt = "وقت فتح الفاتورة" (قبل 10 دقايق) لنتأكد إنو هو اللي بينطبع.
async function sell(call, { type = 'pickup', cart, delivery = {}, createdMinAgo = 10 } = {}) {
  const id = 'ord_e2e_' + uid(), total = cart.reduce((s, i) => s + i.totalCents, 0);
  const createdAt = new Date(Date.now() - createdMinAgo * 60000).toISOString();
  const order = { id, type, orderType: type.toUpperCase(), cart, totalCents: total, delivery, status: 'OPEN', createdAt };
  const [s1] = await call('POST', '/api/kasse/events', { action: 'ORDER_SYNC', order });
  expect(s1).toBe(200);
  const [s2] = await call('POST', '/api/kasse/events', { action: 'FINALIZE_PAYMENT', order, paymentLines: [{ method: 'CASH', amountCents: total, amountReceivedCents: total }], paymentRequestId: 'r' + uid() });
  expect(s2).toBe(200);
  return { id, total, createdAt };
}
// الوصل HTML متل ما بيطلع بالكاشير (بعد /api/print)
async function receiptHtml(page, call, id) {
  const [, pr] = await call('POST', '/api/print', { orderId: id, kind: 'customer' });
  const [, st] = await call('GET', '/api/kasse-state?days=2');
  const order = st.orders.find(o => o.id === id);
  await page.goto('/kasse.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.NARA_RECEIPT && window.NARA_RECEIPT.html);
  return page.evaluate(({ order, pr }) => window.NARA_RECEIPT.html({ ...order, tseReceipts: pr.tseReceipts, ...(pr.receiptCart ? { cart: pr.receiptCart } : {}) }, 'customer'), { order, pr });
}
const count = (h, re) => (h.match(re) || []).length;

test('وصل بيع كاش: كود TSE واحد، وقت واحد (فتح الفاتورة)، بدون "Beim Kunden kassieren"، بدون تلفون/USt-IdNr، A وB', async ({ page, request }) => {
  const call = apiCaller(request);
  const { id, createdAt } = await sell(call, { cart: [BURGER, COLA] });
  const h = await receiptHtml(page, call, id);
  expect(count(h, /class="rc-qr"/g), 'QR واحد فقط (TSE)').toBe(1);
  expect(h).toContain('BEZAHLT · BAR');
  expect(h).not.toContain('Beim Kunden kassieren');
  expect(h).not.toContain('USt-IdNr'); expect(h).not.toContain('02162');
  expect(count(h, /\d{2}\.\d{2}\.\d{4} · \d{2}:\d{2}/g), 'وقت واحد').toBe(1);
  const expected = await page.evaluate(iso => { const d = new Date(iso), p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); }, createdAt);
  expect(h).toContain(' · ' + expected);
  expect(h).toMatch(/rc-vl">A</); expect(h).toMatch(/rc-vl">B</);
  expect(h).toContain('A = 7 % · B = 19 % MwSt inkl.');
});

test('توصيل مدفوع: رسوم التوصيل عليها A، وما في QR سواق بالوصل (QR واحد = TSE)', async ({ page, request }) => {
  const call = apiCaller(request);
  const fee = { kind: 'DELIVERY_FEE', name: 'Lieferkosten', category: 'Lieferung', quantity: 1, unitCents: 100, totalCents: 100 };
  const { id } = await sell(call, { type: 'delivery', cart: [BURGER, fee], delivery: { name: 'E2E Kunde', street: 'Gereonstraße', house: '1', postalCode: '41747', city: 'Viersen', phone: '+49 151 0000000' } });
  const h = await receiptHtml(page, call, id);
  expect(count(h, /class="rc-qr"/g)).toBe(1);
  expect(h).not.toContain('Beim Kunden kassieren'); expect(h).not.toContain('Zum Liefern scannen'); expect(h).not.toContain('QR-Code scannen, um die Bestellung');
  expect(h).toMatch(/Lieferkosten<\/span><span>[^<]*<span class="rc-vl">A</);
});

test('Pickup فيه منتج 7 % فقط: الـLegende بتذكر A بس', async ({ page, request }) => {
  const call = apiCaller(request);
  const { id } = await sell(call, { cart: [BURGER] });
  const h = await receiptHtml(page, call, id);
  expect(h).toContain('A = 7 % MwSt inkl.'); expect(h).not.toContain('B = 19');
});

test('Storno: بالسجل storniert، إعادة الطباعة = وصل STORNO واحد، Tagesabschluss net = 0', async ({ page, request }) => {
  const call = apiCaller(request);
  const day = () => call('GET', '/api/day-closing/preview').then(([, j]) => j.report);
  const before = await day();
  const { id, total } = await sell(call, { cart: [BURGER, COLA] });
  const afterSale = await day();
  expect(afterSale.net.grossCents - before.net.grossCents).toBe(total);

  const [s] = await call('POST', '/api/kasse/events', { action: 'STORNO', order: { id }, reason: 'E2E Test' });
  expect(s).toBe(200);
  const [, st] = await call('GET', '/api/kasse-state?days=2');
  expect(st.orders.find(o => o.id === id).status).toBe('STORNIERT');

  const afterStorno = await day();
  expect(afterStorno.net.grossCents, 'Storno بينقص المبلغ').toBe(before.net.grossCents);
  expect(afterStorno.storno.count - before.storno.count).toBe(1);
  expect(afterStorno.storno.amountCents - before.storno.amountCents).toBe(total);

  const h = await receiptHtml(page, call, id);
  expect(count(h, /class="rc-qr"/g)).toBe(1);
  expect(h).toContain('STORNO'); expect(count(h, /Beleg (FL|STORNO)-/g)).toBe(1);
});
