// smoke.spec.mjs — كل صفحة رئيسية لازم تنفتح بدون أخطاء JavaScript وبدون 5xx من السيرفر.
import { test, expect } from 'playwright/test';

const PAGES = ['kasse.html', 'kitchen.html', 'live-orders.html', 'dispatch.html', 'driver.html',
  'delivery.html', 'dashboard.html', 'reports.html', 'accounting.html', 'customers.html'];

for (const name of PAGES) {
  test(`صفحة ${name} بتنفتح بدون أخطاء`, async ({ page, baseURL }) => {
    const errors = [], bad = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    page.on('response', r => { if (r.url().startsWith(baseURL) && r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });
    const res = await page.goto('/' + name, { waitUntil: 'domcontentloaded' });
    expect(res && res.status(), 'HTTP status').toBeLessThan(400);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); // بعض الصفحات بتعمل polling دايم
    expect(errors, 'JS errors').toEqual([]);
    expect(bad, 'server 5xx').toEqual([]);
  });
}
