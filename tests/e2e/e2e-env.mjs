// e2e-env.mjs — ثوابت مشتركة بين الإعداد والسيرفر التجريبي.
// المنفذ 4199 (مو 4185 تبع النظام الحقيقي) والمفتاح للاختبار فقط، ما بيفتح شي على النظام الحقيقي.
export const E2E_PORT = Number(process.env.FLAMO_E2E_PORT) || 4199;
export const E2E_KEY = 'flamo-e2e-test-key-not-a-secret';
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_DRIVER_ID = 'e2e-driver';
