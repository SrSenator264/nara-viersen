// sides-discover.mjs — خطوة أولى لجسر Loco Chicken (Sides / SimplyPOS).
// بيفتح صفحة Bestellübersicht بمتصفح Playwright خاص (بروفايل منفصل على D:)،
// إنت بتسجّل الدخول بإيدك مرة وحدة، وهو بيسجّل كل ردود JSON اللي الصفحة بتجيبها
// لملفات محلية، كرمال نعرف شكل البيانات ونبني الجسر الحقيقي عليها.
// ما بيبعت شي لأي مكان وما بيكبس على أي زر.
//
// التشغيل: NARA-Sides-Discover.cmd   (أو: node sides-discover.mjs)

import fs from 'node:fs';
import path from 'node:path';

const env = (k, d) => process.env[k] ?? d;
const URL0 = env('SIDES_URL', 'https://crumz.simplypos.de/ordercentral/order#/listOrder');
const PROFILE = env('SIDES_PLAYWRIGHT_PROFILE', 'D:/NARA-Playwright/sides-profile');
const OUT = env('SIDES_DISCOVER_DIR', 'D:/NARA-Playwright/sides-data/discover');
const MAX_FILES = 400;

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[SIDES]', ...a);
let n = 0;
const index = [];

const { chromium } = await import('playwright');
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null });
const page = ctx.pages()[0] || await ctx.newPage();
ctx.on('close', () => { log('browser closed'); process.exit(0); });

ctx.on('response', async r => {
  try {
    const req = r.request(), type = req.resourceType();
    if (!['xhr', 'fetch'].includes(type)) return;
    const ct = (r.headers()['content-type'] || '').toLowerCase();
    if (!/json|javascript|text\/plain/.test(ct)) return;
    if (n >= MAX_FILES) return;
    const body = await r.text().catch(() => null);
    if (body == null || body.length < 2) return;
    const u = new URL(r.url());
    // ردود الدخول ممكن يكون فيها مفاتيح (token): ما منحفظها
    const secret = /login|logout|auth|token|session|password|passwort|credential/i.test(u.pathname);
    const name = String(++n).padStart(4, '0') + '_' + (req.method() + u.pathname).replace(/[^a-z0-9]+/gi, '_').slice(0, 80) + '.json';
    // كلمة السر ما بتنحفظ: ما منسجّل جسم الطلب (request body) أبداً، بس الرد.
    fs.writeFileSync(path.join(OUT, name), JSON.stringify({ url: u.origin + u.pathname, query: u.search.length > 300 ? u.search.slice(0, 300) : u.search, method: req.method(), status: r.status(), contentType: ct, at: new Date().toISOString(), body: secret ? '[nicht gespeichert: Login/Token]' : body }, null, 1));
    index.push({ file: name, method: req.method(), path: u.pathname, status: r.status(), bytes: body.length });
    fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 1));
    log(`${req.method()} ${u.pathname} ${r.status()} ${body.length}B → ${name}`);
  } catch (e) { /* تجاهل */ }
});

page.on('websocket', ws => {
  log('websocket', ws.url().replace(/\?.*$/, ''));
  let k = 0;
  ws.on('framereceived', f => {
    if (k++ > 30) return;
    const p = typeof f.payload === 'string' ? f.payload : '[binary]';
    fs.appendFileSync(path.join(OUT, '_websocket.txt'), new Date().toISOString() + ' ' + ws.url().replace(/\?.*$/, '') + '\n' + p.slice(0, 4000) + '\n\n');
  });
});

await page.goto(URL0, { waitUntil: 'domcontentloaded' });
log('سجّل الدخول بإيدك إذا انطلب، وافتح Bestellübersicht. افتح طلب واحد بالعدسة 🔍 كمان.');
log('Ordner: ' + OUT);
// إعادة تحميل كل دقيقتين كرمال نشوف كيف بتتحدّث القائمة
setInterval(() => { if (!/login|anmelden/i.test(page.url())) page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); }, 120000);
await new Promise(() => {});
