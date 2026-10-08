import { chromium } from 'playwright';

const profileDir = 'D:/NARA-Playwright/pw-profile';
const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
});

const page = context.pages()[0] || await context.newPage();

page.on('response', async (response) => {
  const contentType = response.headers()['content-type'] || '';
  if (!contentType.toLowerCase().includes('json')) return;

  const body = await response.text().catch(() => '');
  const hint = /order|items|address/i.test(body)
    ? '  <-- looks like orders'
    : '';

  console.log(
    response.status(),
    response.request().method(),
    response.url().split('?')[0],
    `${body.length}B${hint}`,
  );
});

page.on('websocket', (socket) => {
  console.log('WS', socket.url().split('?')[0]);
});

await page.goto('https://live-orders.takeaway.com/orders');
console.log('Browser ready. Log in manually, then refresh or wait for a new order.');
