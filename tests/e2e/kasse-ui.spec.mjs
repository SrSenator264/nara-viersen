// kasse-ui.spec.mjs — الكاشير بالضغط الفعلي: منتج → مطبخ → دفع كاش. بعد الدفع ما بصير أي إعادة تحميل (بلا وميض).
import { test, expect } from 'playwright/test';

async function addProduct(page) {
  await page.locator('button.product').first().click();
  await page.getByRole('button', { name: /Hinzufügen/ }).click();
}
async function loadKasse(page) {
  await page.goto('/kasse.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

test('كاشير: مطبخ + دفع كاش بدون إعادة تحميل، والطلب الجديد جاهز', async ({ page, request }) => {
  const errors = []; let loads = 0;
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('framenavigated', f => { if (f === page.mainFrame()) loads++; });
  await loadKasse(page);
  await page.getByRole('button', { name: /Abholung/ }).click();
  await addProduct(page);
  await page.getByRole('button', { name: /An Küche/ }).click();
  await page.waitForTimeout(1500);
  await page.locator('#cash').click();
  const before = loads;
  await page.getByRole('button', { name: /^Bezahlen/ }).click();
  await expect.poll(async () => (await (await request.get('/api/kasse-state?days=2')).json()).orders.some(o => o.status === 'COMPLETED'), { timeout: 15000 }).toBe(true);
  await page.waitForTimeout(4000);
  expect(loads - before, 'عدد إعادات تحميل الصفحة بعد الدفع').toBe(0);
  // الطلب الجديد: سلة فاضية، وفقط طلب مفتوح واحد بالقائمة
  await expect(page.locator('#open-order option')).toHaveCount(1);
  await expect(page.locator('#cart, .cart').first()).not.toContainText('Joppie');
  // الطلب الجديد شغّال: بنقدر نضيف منتج
  await page.getByRole('button', { name: /Abholung/ }).click();
  await addProduct(page);
  await expect(page.locator('#cart, .cart').first()).toContainText('€');
  // المطبخ استلم الطلب
  const k = await (await request.get('/api/kitchen/orders')).json();
  expect(k.orders.length).toBe(1);
  expect(errors, 'JS errors').toEqual([]);
});

test('كاشير: بعد الدفع وإعادة فتح الصفحة ما بصير تحميل إضافي', async ({ page }) => {
  let loads = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame()) loads++; });
  await loadKasse(page);
  const before = loads;
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  expect(loads - before, 'reload واحد بس (اللي طلبناه)').toBe(1);
});

async function orderToPayment(page, method) {
  await loadKasse(page);
  await page.getByRole('button', { name: /Abholung/ }).click();
  await addProduct(page);
  await page.locator(method).click();
}
async function completedCount(request) {
  return (await (await request.get('/api/kasse-state?days=2')).json()).orders.filter(o => o.status === 'COMPLETED').length;
}

test('كاشير: دفع كارد بدون إعادة تحميل', async ({ page, request }) => {
  let loads = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) loads++; });
  const base = await completedCount(request);
  await orderToPayment(page, '#card');
  const before = loads;
  await page.getByRole('button', { name: /^Bezahlen/ }).click();
  await expect.poll(() => completedCount(request), { timeout: 15000 }).toBe(base + 1);
  await page.waitForTimeout(3000);
  expect(loads - before).toBe(0);
  await expect(page.locator('#open-order option')).toHaveCount(1);
});

test('كاشير: دفع مقسوم (Gleich teilen) بجزئين بدون إعادة تحميل', async ({ page, request }) => {
  let loads = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) loads++; });
  const base = await completedCount(request);
  await orderToPayment(page, '#cash');
  await page.getByRole('button', { name: /Gleich teilen/ }).click();
  const before = loads;
  await page.locator('.np-go').click();           // الجزء 1: ما لازم يكمّل الطلب
  await page.waitForTimeout(2000);
  expect(await completedCount(request)).toBe(base);
  await page.locator('.np-go').click();           // الجزء 2: بيكمّل
  await expect.poll(() => completedCount(request), { timeout: 15000 }).toBe(base + 1);
  await page.waitForTimeout(3000);
  expect(loads - before).toBe(0);
  await expect(page.locator('#open-order option')).toHaveCount(1);
});
