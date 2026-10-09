// uber-bridge.mjs — جسر Uber Eats: بيقرا الطلبات من Uber Eats Orders (merchants.ubereats.com/orders) وبيسجّلها بـ NARA.
// - متصفح Playwright خاص (بروفايل على D:)، تسجيل الدخول بالإيد مرة وحدة.
// - الصفحة نفسها بتسأل أوبر كل كم ثانية (GraphQL getActiveOrders)؛ نحنا منسمع الردود بس.
// - ما بيكبس على أي زر بأوبر وما بيغيّر شي هونيك. قراءة بس.
// - طلب اختفى من القائمة الحيّة: منعلّمه "انسلّم للسواق" (HANDOVER) مو "خلص"، لأنو سواقينّا بيوصّلوه وNARA بيسكّره.
//
// التشغيل: NARA-Uber.cmd (بيشتغل لحالو مع NARA Kasse)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeUber } from './uber-normalize.mjs';

const env = (k, d) => process.env[k] ?? d;
const CFG = {
  base: env('NARA_BASE_URL', 'http://127.0.0.1:' + env('PORT', '4185')).replace(/\/$/, ''),
  serviceKey: env('NARA_SERVICE_KEY', ''),
  url: env('UBER_URL', 'https://merchants.ubereats.com/orders'),
  profile: env('UBER_PLAYWRIGHT_PROFILE', 'D:/NARA-Playwright/uber-profile'),
  dataDir: env('UBER_DATA_DIR', 'D:/NARA-Playwright/uber-data'),
  rawKeepDays: Number(env('UBER_RAW_KEEP_DAYS', '14')),
  staleMs: Number(env('UBER_STALE_MS', String(3 * 60000))),
};
const log = (...a) => console.log('[UBER]', new Date().toLocaleTimeString('de-DE'), ...a);
const P = f => path.join(CFG.dataDir, f);
fs.mkdirSync(P('raw'), { recursive: true });
let state = { sent: {}, seen: {}, active: {}, stores: {} };
try { state = { ...state, ...JSON.parse(fs.readFileSync(P('state.json'), 'utf8')) }; } catch { /* أول مرة */ }
for (const k of ['sent', 'seen', 'active', 'stores']) state[k] ??= {};
function saveState() {
  for (const k of ['sent', 'seen']) { const keys = Object.keys(state[k]); if (keys.length > 3000) for (const old of keys.slice(0, keys.length - 3000)) delete state[k][old]; }
  try { fs.writeFileSync(P('state.json.tmp'), JSON.stringify(state)); fs.renameSync(P('state.json.tmp'), P('state.json')); } catch (e) { log('state save failed: ' + e.message); }
}
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
try { const cut = Date.now() - CFG.rawKeepDays * 86400000; for (const f of fs.readdirSync(P('raw'))) { const fp = P('raw/' + f); if (fs.statSync(fp).mtimeMs < cut) fs.unlinkSync(fp); } } catch { /* تجاهل */ }

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

let lastOkAt = null, loggedOut = false, alertAt = 0;
async function alertServer(type) {
  if (Date.now() - alertAt < 300000) return;
  alertAt = Date.now();
  log('ALERT ' + type);
  await post('/api/platform-orders/alert', { source: 'UBER_EATS', type });
}
async function beat() {
  await post('/api/platform-orders/heartbeat', { source: 'UBER_EATS', bridge: 'playwright', lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null, loggedOut });
}

async function sendOrder(order, sig) {
  const r = await post('/api/platform-orders/import', { source: 'UBER_EATS', order });
  if (r === 'retry') return false;
  state.sent[order.externalOrderCode] = sig; saveState();
  log(`sent ${order.displayCode} ${order.brand || ''} ${order.liveStage} ${order.cart.length} lines ${(order.totalCents / 100).toFixed(2)} EUR ${order.parseStatus}${order.warnings.length ? ' ⚠ ' + order.warnings.join('; ') : ''}`);
  return true;
}

let busy = false;
async function handleActive(result, storeId) {
  if (busy) return; busy = true;
  try {
    const list = (result && result.orders) || [];
    const now = new Date().toISOString();
    const present = new Set();
    for (const entry of list) {
      const o = entry && entry.value; if (!o || !o.id) continue;
      if (o.isTestOrder) continue;
      const store = state.stores[storeId] || { id: storeId, name: '' };
      // Loco Chicken بيجي عن طريق Sides: ما منكرّرو
      if (/loco/i.test(store.name || '')) continue;
      const id = String(o.id);
      present.add(id);
      state.seen[id] ??= now;
      const order = normalizeUber(o, store);
      order.placedAt = order.createdAt = order.acceptedAt = state.seen[id];
      // الطلب المجدول: إيمتى لازم يبلّش المطبخ (الموعد − السواقة التقديرية − التحضير)
      if (order.requestedAt && order.prepMinutes) order.kitchenStartAt = new Date(Date.parse(order.requestedAt) - (order.prepMinutes + 20) * 60000).toISOString();
      const sig = sha(JSON.stringify([order.liveStage, order.cart, order.totalCents, order.dueAt, order.requestedAt, order.delivery, order.deliveryQrUrl ? 1 : 0]));
      state.active[id] = { code: order.displayCode, store: storeId, at: now, ext: order.externalOrderCode };
      if (state.sent[order.externalOrderCode] === sig) continue;
      try { fs.writeFileSync(P(`raw/${id}.json`), JSON.stringify(o)); } catch { /* تجاهل */ }
      await sendOrder(order, sig);
    }
    // اللي كان بالقائمة واختفى (لنفس المحل): انسلّم للسواق
    for (const [id, a] of Object.entries(state.active)) {
      if (a.store !== storeId || present.has(id)) continue;
      const r = await post('/api/platform-orders/import', { source: 'UBER_EATS', order: { externalOrderCode: a.ext, liveStage: 'HANDOVER', platformStatus: 'GONE_FROM_ACTIVE', platformGoneAt: now } });
      if (r === 'retry') continue;
      log(`${a.code}: nicht mehr aktiv bei Uber → HANDOVER`);
      delete state.active[id];
    }
    saveState();
    lastOkAt = Date.now(); loggedOut = false;
  } catch (e) { log('handle failed: ' + e.message); }
  finally { busy = false; }
}

const { chromium } = await import('playwright');
const ctx = await chromium.launchPersistentContext(CFG.profile, { headless: false, viewport: null });
const page = ctx.pages()[0] || await ctx.newPage();
ctx.on('close', () => { console.error('[UBER] browser closed - exiting'); process.exit(1); });
process.on('unhandledRejection', e => console.error('[UBER] unhandledRejection:', e && e.message));

ctx.on('response', async r => {
  try {
    const u = new URL(r.url());
    if (!/ubereats\.com$/i.test(u.hostname) || !/\/graphql$/.test(u.pathname)) return;
    const j = await r.json().catch(() => null);
    const d = j && j.data; if (!d) return;
    if (d.getStoreDetails && d.getStoreDetails.result && d.getStoreDetails.result.store) {
      const s = d.getStoreDetails.result.store;
      if (s.id && (!state.stores[s.id] || state.stores[s.id].name !== s.name)) { state.stores[s.id] = { id: s.id, name: s.name }; saveState(); log(`store ${s.name}`); }
    }
    if (d.getActiveOrders && d.getActiveOrders.result) {
      const m = String(d.getActiveOrders.message || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      await handleActive(d.getActiveOrders.result, m ? m[0] : 'default');
    }
  } catch { /* تجاهل */ }
});

// تسجيل الكبسات (Ready، Adjust…) لبعدين، إذا بدنا نخلي NARA يكبس "Ready" لحالو. بدون أي كلمة سر.
ctx.on('request', req => {
  try {
    if (req.method() !== 'POST' || !/\/graphql$/.test(new URL(req.url()).pathname)) return;
    const body = req.postData() || '';
    if (!/"query"\s*:\s*"\s*mutation/i.test(body)) return;
    let op = ''; try { op = JSON.parse(body).operationName || ''; } catch { /* تجاهل */ }
    if (/login|auth|password|token/i.test(op)) return;
    fs.appendFileSync(P('actions-capture.jsonl'), JSON.stringify({ at: new Date().toISOString(), op, body: body.slice(0, 4000) }) + '\n');
    log('action captured: ' + op);
  } catch { /* تجاهل */ }
});

async function watchdog() {
  const url = page.url();
  if (/auth\.uber\.com|\/login/i.test(url)) { loggedOut = true; await alertServer('SESSION_EXPIRED'); return; }
  if (!lastOkAt || Date.now() - lastOkAt > CFG.staleMs) {
    // الصفحة ما عم تسأل أوبر: منعيد تحميلها
    log('keine Daten seit ' + (lastOkAt ? Math.round((Date.now() - lastOkAt) / 1000) + 's' : 'Start') + ' → reload');
    if (!/\/orders/.test(url)) await page.goto(CFG.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    else await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}

await page.goto(CFG.url, { waitUntil: 'domcontentloaded' });
log('Uber-Bridge bereit. Falls nötig: einmal selbst einloggen und dieses Fenster offen lassen. Nichts anklicken.');
log(`NARA: ${CFG.base} | Profil: ${CFG.profile}`);
setInterval(() => watchdog().catch(() => {}), 60000);
setInterval(() => beat().catch(() => {}), 60000);
setTimeout(() => beat().catch(() => {}), 8000);
await new Promise(() => {});
