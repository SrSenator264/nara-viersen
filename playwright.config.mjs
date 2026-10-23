// playwright.config.mjs — اختبارات E2E لـ Flamo.  التشغيل: npm run test:e2e
// بيشغّل سيرفر تجريبي معزول (tests/e2e/server-harness.mjs) على منفذ 4199 ببيانات فاضية؛ ما بيلمس النظام الحقيقي.
import { defineConfig, devices } from 'playwright/test';
import { E2E_BASE_URL, E2E_KEY } from './tests/e2e/e2e-env.mjs';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  outputDir: 'test-results/e2e',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  workers: 1,            // سيرفر واحد وبيانات مشتركة → اختبار ورا اختبار
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { 'x-nara-manager-key': E2E_KEY },   // دخول مدير للسيرفر التجريبي فقط
    locale: 'de-DE',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server-harness.mjs',
    url: E2E_BASE_URL + '/kasse.html',
    reuseExistingServer: false,
    timeout: 90000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: '**/smoke.spec.mjs' },
  ],
});
