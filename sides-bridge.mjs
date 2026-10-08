// sides-bridge.mjs — جسر Loco Chicken: بيقرا طلبات Sides (SimplyPOS) وبيسجّلها بـ NARA.
// - متصفح Playwright خاص (بروفايل على D:) مفتوح على Bestellübersicht. تسجيل الدخول بالإيد مرة وحدة.
// - كل 20 ثانية: قائمة الطلبات (listOrders). طلب جديد أو تغيّرت حالته → تفاصيله (showSingleOrderdata) → NARA.
// - ما بيكبس على أي زر بـ Sides وما بيغيّر شي هونيك. قراءة بس.
//
// التشغيل: NARA-Sides.cmd (بيشتغل لحالو مع NARA Kasse)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeSides } from './sides-normalize.mjs';

const env = (k, d) => process.env[k] ?? d;
const CFG = {
  base: env('NARA_BASE_URL', 'http://127.0.0.1:' + env('PORT', '4185')).replace(/\/$/, ''),
  serviceKey: env('NARA_SERVICE_KEY', ''),
  url: env('SIDES_URL', 'https://crumz.simplypos.de/ordercentral/order#/listOrder'),
  profile: env('SIDES_PLAYWRIGHT_PROFILE', 'D:/NARA-Playwright/sides-profile'),
  dataDir: env('SIDES_DATA_DIR', 'D:/NARA-Playwright/sides-data'),
  pollMs: Number(env('SIDES_POLL_MS', '20000')),
};
const log = (...a) => console.log('[SIDES]', new Date().toLocaleTimeString('de-DE'), ...a);
const P = f => path.join(CFG.dataDir, f);
fs.mkdirSync(P('raw'), { recursive: true });
let state = { sent: {} };
try { state = JSON.parse(fs.readFileSync(P('state.json'), 'utf8')); state.sent ??= {}; } catch { /* أول مرة */ }
const saveState = () => fs.writeFileSync(P('state.json'), JSON.stringify(state));
const sha = s => crypto.createHash('sha1').update(s).digest('hex');

async function post(pathname, body) {
  try {
    const r = await fetch(CFG.base + pathname, { method: 'POST', headers: { 'content-type': 'application/json', ...(CFG.serviceKey ? { 'x-nara-service-key': CFG.serviceKey } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (r.ok || r.status === 409) return 'ok';
    const txt = (await r.text().catch(() => '')).slice(0, 200);
    if (r.status >= 500 || [401, 403, 404, 408, 429].includes(r.status)) { log(`server ${r.status} ${pathname} ${txt}`); return 'retry'; }
    fs.appendFileSync(P('rejected.jsonl'), JSON.stringify({ at: new Date().toISOString(), status: r.status, txt, body }) + '\n');
    log(`rejected ${r.status}: ${txt}`);
    return 'drop';
  } catch (e) { log('NARA server unreachable: ' + e.message); return 'retry'; }
}

const { chromium } = await import('playwright');
const ctx = await chromium.launchPersistentContext(CFG.profile, { headless: false, viewport: null });
const page = ctx.pages()[0] || await ctx.newPage();
ctx.on('close', () => { console.error('[SIDES] browser closed - exiting'); process.exit(1); });
process.on('unhandledRejection', e => console.error('[SIDES] unhandledRejection:', e && e.message));

// الطلبات بتنعمل من جوّا الصفحة نفسها (نفس جلسة الدخول)
async function sidesCall(url, body = '') {
  return page.evaluate(async ({ url, body }) => {
    const r = await fetch('/proxy?url=' + url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' }, body });
    const t = await r.text();
    try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 200), redirected: r.redirected, url: r.url }; }
  }, { url, body });
}

let lastOkAt = null, loggedOut = false, alertAt = 0;
async function alertServer(type) {
  if (Date.now() - alertAt < 300000) return;
  alertAt = Date.now();
  log('ALERT ' + type);
  await post('/api/platform-orders/alert', { source: 'SIDES', type });
}

let busy = false;
async function poll() {
  if (busy) return; busy = true;
  try {
    if (!/simplypos\.de\/ordercentral/i.test(page.url())) { loggedOut = true; await alertServer('SESSION_EXPIRED'); return; }
    const L = await sidesCall('/ordercentral/listOrders');
    const orders = L.json && L.json.response && L.json.response.orders;
    if (!Array.isArray(orders)) { loggedOut = true; await alertServer('SESSION_EXPIRED'); log('listOrders: no data (login?)', L.status, L.text || ''); return; }
    loggedOut = false; lastOkAt = Date.now();
    for (const o of orders) {
      const id = String(o.id);
      const sig = sha(JSON.stringify([o.orderstatetypeId, o.amount, o.billingNumber, o.expectedDeliveryTimeMinutes, o.paymentIds, o.routing && o.routing.expectedTourStart]));
      if (state.sent[id] === sig) continue;
      const D = await sidesCall('/ordercentral/showSingleOrderdata', 'order_id=' + encodeURIComponent(id) + '&showDeliveryPortal=1&showOrderstateHistory=1');
      if (!D.json || D.json.status !== 1 || !D.json.response || !D.json.response.orderDataset) { log(`detail ${id} failed`, D.status, JSON.stringify(D.json && D.json.response && D.json.response.error_code || D.text || '')); continue; }
      fs.writeFileSync(P(`raw/${id}.json`), JSON.stringify(D.json));
      const order = normalizeSides(D.json, o);
      const r = await post('/api/platform-orders/import', { source: 'SIDES', order });
      if (r === 'retry') continue; // المرة الجاية منجرّب
      state.sent[id] = sig; saveState();
      log(`sent ${order.displayCode} (${order.portalName}) ${order.liveStage} ${order.cart.length} items ${(order.totalCents / 100).toFixed(2)} EUR ${order.payment.method} ${order.parseStatus}${order.warnings.length ? ' ⚠ ' + order.warnings.join('; ') : ''}`);
    }
  } catch (e) { log('poll failed: ' + e.message); }
  finally { busy = false; }
}

async function beat() {
  await post('/api/platform-orders/heartbeat', { source: 'SIDES', bridge: 'playwright', lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null, loggedOut });
}

await page.goto(CFG.url, { waitUntil: 'domcontentloaded' });
log('Sides-Bridge bereit. Falls nötig: einmal selbst einloggen und dieses Fenster offen lassen.');
log(`NARA: ${CFG.base} | Profil: ${CFG.profile}`);
setInterval(poll, CFG.pollMs);
setInterval(() => beat().catch(() => {}), 60000);
// الصفحة بتضل حيّة (sessionstayalive)، ومنعيد تحميلها كل 30 دقيقة احتياط
setInterval(() => { if (!busy) page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); }, 30 * 60000);
setTimeout(async () => { await poll(); await beat(); }, 5000);
await new Promise(() => {});
