// order-flow.spec.mjs — السلسلة كاملة: طلب (مثل الكاشير) → مطبخ → Live Orders → توزيع → سائق → تسليم.
// الطلب بينحقن عبر API (محاكاة الكاشير)؛ الضغط على واجهة الكاشير نفسها = المرحلة 2 (بعد الموافقة على الـ DoD).
// الصفحات (مطبخ / Live Orders / توزيع) بتنفتح بالمتصفح وبنتأكد إنها بتعرض الطلب؛ التنقل بين الحالات عبر API.
import { test, expect } from 'playwright/test';
import * as F from './helpers/flow.mjs';

function apiCaller(request) {
  return async (method, path, body) => {
    const r = await request.fetch(path, { method, data: body });
    let json = null; try { json = await r.json(); } catch { /* مو JSON */ }
    return [r.status(), json];
  };
}
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  return errors;
}
async function expectShows(page, url, text, tabSelector) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (tabSelector) await page.locator(tabSelector).click();
  await expect.poll(async () => (await page.locator('body').innerText()).includes(text),
    { timeout: 20000, message: `${url} لازم يعرض "${text}"` }).toBe(true);
}

test('توصيل: طلب → مطبخ → Live Orders → سائق → تم التسليم', async ({ page, request }) => {
  const call = apiCaller(request), errors = watchErrors(page);
  const id = await F.importOrder(call, F.makeOrder({ kind: 'delivery' }));

  // 1) المطبخ بيشوفه كـ NEW
  expect((await F.getKitchenOrder(call, id))?.kitchenStatus).toBe('NEW');
  await expectShows(page, '/kitchen.html', F.ITEM_NAME);

  // 2) المطبخ: قيد التحضير ← جاهز
  expect((await F.setKitchen(call, id, 'PREPARING'))[0]).toBe(200);
  expect((await F.setKitchen(call, id, 'READY'))[0]).toBe(200);
  expect((await F.getKitchenOrder(call, id))?.kitchenStatus).toBe('READY');

  // 3) Live Orders بيعرضه، وبننقله لمرحلة التسليم للسائق
  await expectShows(page, '/live-orders.html', F.ITEM_NAME, 'button[data-st="HANDOVER"]')  // مطبخ "جاهز" ← بينتقل لتبويب التسليم;
  expect((await F.setStage(call, id, 'HANDOVER'))[0]).toBe(200);
  expect((await F.getOrder(call, id))?.liveStage).toBe('HANDOVER');

  // 4) التوزيع: تعيين السائق التجريبي
  const [as] = await F.assignDriver(call, id);
  expect(as).toBe(200);
  const route = await F.driverRoute(call);
  expect(route, 'route للسائق').toBeTruthy();
  expect(route.stops.map(s => s.orderId)).toContain(id);
  await page.goto('/dispatch.html', { waitUntil: 'domcontentloaded' });

  // 5) السائق: بدء الجولة ← تم التسليم
  expect((await F.startRoute(call, route.routeId))[0]).toBe(200);
  await page.goto('/driver.html', { waitUntil: 'domcontentloaded' });
  expect((await F.deliver(call, id))[0]).toBe(200);

  // 6) الحالة النهائية
  const done = await F.getOrder(call, id);
  expect(done.liveStage).toBe('DONE');
  expect(done.assignmentStatus).toBe('DELIVERED');
  expect(errors, 'JS errors').toEqual([]);
});

test('استلام (Pickup): طلب → مطبخ → Live Orders → خلص بدون سائق', async ({ page, request }) => {
  const call = apiCaller(request), errors = watchErrors(page);
  const id = await F.importOrder(call, F.makeOrder({ kind: 'pickup' }));
  await expectShows(page, '/kitchen.html', F.ITEM_NAME);
  expect((await F.setKitchen(call, id, 'READY'))[0]).toBe(200);
  await expectShows(page, '/live-orders.html', F.ITEM_NAME, 'button[data-st="HANDOVER"]')  // مطبخ "جاهز" ← بينتقل لتبويب التسليم;
  expect((await F.setStage(call, id, 'DONE'))[0]).toBe(200);
  const done = await F.getOrder(call, id);
  expect(done.liveStage).toBe('DONE');
  expect(done.assignmentStatus || null).not.toBe('ASSIGNED');
  expect(errors, 'JS errors').toEqual([]);
});

test('إعادة تحميل صفحة المطبخ بنص الطريق ما بتضيّع الطلب', async ({ page, request }) => {
  const call = apiCaller(request);
  const id = await F.importOrder(call, F.makeOrder({ kind: 'delivery' }));
  await expectShows(page, '/kitchen.html', F.ITEM_NAME);
  await F.setKitchen(call, id, 'PREPARING');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('button.tab[data-v="PREPARING"]').click();   // بعد التحديث بيرجع لتبويب "جديد"
  await expect.poll(async () => (await page.locator('body').innerText()).includes(F.ITEM_NAME), { timeout: 20000 }).toBe(true);
  expect((await F.getKitchenOrder(call, id))?.kitchenStatus).toBe('PREPARING');
});
