'use strict';
// auth.js — منطق الصلاحيات (بدون أي اعتماد على السيرفر): PIN، جلسات، تحديد المحاولات، جدول صلاحيات المسارات، ملفات ثابتة مسموحة.
// القاعدة: أي مسار /api غير مذكور هون = للمدير فقط (deny by default).
const crypto = require('crypto');

const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'DRIVER', 'ACCOUNTANT'];
const MANAGERS = ['OWNER', 'MANAGER'];
const CASH = ['OWNER', 'MANAGER', 'CASHIER'];
const KITCH = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN'];
const STAFF = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'DRIVER'];
const ACCT = ['OWNER', 'MANAGER', 'ACCOUNTANT'];

const normalizeRole = r => { const x = String(r || '').trim().toUpperCase(); return ROLES.includes(x) ? x : null; };

// ───────── PIN ─────────
const PIN_MIN = { OWNER: 6, MANAGER: 6, ACCOUNTANT: 6, CASHIER: 4, KITCHEN: 4, DRIVER: 4 };
function validatePin(role, pin) {
  const p = String(pin ?? '');
  if (!/^\d{4,12}$/.test(p)) return 'PIN muss aus 4 bis 12 Ziffern bestehen.';
  const min = PIN_MIN[role] || 6;
  if (p.length < min) return `PIN für ${role} braucht mindestens ${min} Ziffern.`;
  if (/^(\d)\1+$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p)) return 'PIN ist zu einfach (z. B. 1234 oder 0000).';
  return null;
}
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { algo: 'scrypt', salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}
function verifyPin(pin, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const h = crypto.scryptSync(String(pin ?? ''), rec.salt, 32), exp = Buffer.from(rec.hash, 'hex');
  return exp.length === h.length && crypto.timingSafeEqual(h, exp);
}

// ───────── جلسات ─────────
const newToken = () => crypto.randomBytes(32).toString('base64url');
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(); if (k) { const raw = part.slice(i + 1).trim(); try { out[k] = decodeURIComponent(raw); } catch { out[k] = raw; } }
  }
  return out;
}

// ───────── تحديد محاولات الدخول ─────────
class Limiter {
  constructor({ max = 5, windowMs = 10 * 60000, lockMs = 5 * 60000 } = {}) { this.max = max; this.windowMs = windowMs; this.lockMs = lockMs; this.m = new Map(); }
  check(key, now = Date.now()) { const e = this.m.get(key); if (e && e.lockedUntil > now) return { ok: false, retryMs: e.lockedUntil - now }; return { ok: true, retryMs: 0 }; }
  fail(key, now = Date.now()) {
    let e = this.m.get(key);
    if (!e || now - e.first > this.windowMs) e = { n: 0, first: now, lockedUntil: 0 };
    e.n += 1; if (e.n >= this.max) { e.lockedUntil = now + this.lockMs; e.n = 0; e.first = now; }
    this.m.set(key, e); return this.check(key, now);
  }
  success(key) { this.m.delete(key); }
  // Speicher-Hygiene: Einträge löschen, die nicht mehr gesperrt sind UND deren Fenster abgelaufen ist (sonst wächst this.m mit jeder fremden IP). Gibt die Anzahl gelöschter Einträge zurück.
  prune(now = Date.now()) {
    let n = 0;
    for (const [k, e] of this.m) if (e.lockedUntil <= now && now - e.first > this.windowMs) { this.m.delete(k); n++; }
    return n;
  }
}
// Zeitstempel-Maps (Rate-Limit der Web-Bestellungen / Flamo-Chat: key → [timestamps]): Schlüssel löschen, deren Stempel alle älter als das Fenster sind.
function pruneHits(map, windowMs, now = Date.now()) {
  let n = 0;
  for (const [k, arr] of map) if (!Array.isArray(arr) || !arr.some(t => now - t < windowMs)) { map.delete(k); n++; }
  return n;
}

// ───────── جدول صلاحيات المسارات (الأول المطابق يفوز) ─────────
// access: 'public' | 'service' (مفتاح الجسر أو loopback) | مصفوفة أدوار
const RULES = [
  ['GET', /^\/api\/delivery\/zones$/, 'public'],
  ['POST', /^\/api\/delivery\/quote$/, 'public'],
  ['GET', /^\/api\/menu$/, 'public'],
  ['POST', /^\/api\/web-orders$/, 'public'],
  ['GET', /^\/api\/web-orders\/status$/, 'public'],
  ['GET', /^\/api\/pay\/enabled$/, 'public'],
  ['GET', /^\/api\/pay\/door$/, 'public'],
  ['GET', /^\/api\/flamo\/status$/, 'public'],
  ['POST', /^\/api\/flamo\/chat$/, 'public'],
  ['GET', /^\/api\/permissions$/, 'public'],
  ['POST', /^\/api\/nara-guide$/, 'public'],
  ['*', /^\/api\/auth\/(login|logout|me|employees|bootstrap|join|invite-check)$/, 'public'],
  ['POST', /^\/api\/platform-orders\/import$/, 'service'],
  ['POST', /^\/api\/platform-orders\/(heartbeat|alert)$/, 'service'],
  ['GET', /^\/api\/platform-orders\/status$/, KITCH],
  ['POST', /^\/api\/platform-orders\/promise$/, CASH],
  ['GET', /^\/api\/platform-orders\/pending$/, KITCH],
  ['POST', /^\/api\/platform-orders\/accept$/, KITCH],
  ['GET', /^\/api\/platform-orders\/board$/, KITCH],
  ['POST', /^\/api\/platform-orders\/(times|stage)$/, KITCH],
  ['GET', /^\/api\/platform-orders\/commands$/, 'service'],
  ['POST', /^\/api\/platform-orders\/command-result$/, 'service'],
  ['GET', /^\/api\/printing\/config$/, KITCH],
  ['POST', /^\/api\/printing\/config$/, MANAGERS],
  ['GET', /^\/api\/printing\/windows-printers$/, MANAGERS],
  ['POST', /^\/api\/print$/, KITCH],
  ['POST', /^\/api\/orders\/mark-test$/, MANAGERS],
  ['GET', /^\/api\/system\/lan$/, CASH],
  ['POST', /^\/api\/kasse\/events$/, KITCH],
  ['GET', /^\/api\/health$/, 'public'],
  ['*', /^\/api\/system\/update$/, MANAGERS],
  ['GET', /^\/api\/health\/details$/, MANAGERS],
  ['GET', /^\/api\/kasse-state$/, KITCH],
  ['GET', /^\/api\/kasse\/open-orders$/, KITCH],
  ['*', /^\/api\/customers(\/sync)?$/, CASH],
  ['GET', /^\/api\/customer-hint$/, KITCH],
  ['POST', /^\/api\/customer-note$/, CASH],
  ['GET', /^\/api\/customer-db$/, KITCH], // الصلاحية الفعلية (مالك أو ممنوحة) بتنفحص بالـhandler
  ['GET', /^\/api\/customer-book(\/history)?$/, KITCH], // سجل الزباين: نفس الصلاحية الفعلية (مالك أو ممنوحة) بالـhandler
  ['POST', /^\/api\/customer-book\/save$/, KITCH],
  ['GET', /^\/api\/reminders$/, KITCH],
  ['POST', /^\/api\/reminders\/done$/, KITCH],
  ['POST', /^\/api\/reminders\/(settings|test)$/, MANAGERS],
  ['GET', /^\/api\/cashier\/employee-lookup$/, CASH],
  ['*', /^\/api\/kitchen\/orders$/, KITCH],
  ['GET', /^\/api\/delivery\/auto-plan$/, CASH],
  ['POST', /^\/api\/kitchen\/estimate$/, CASH],
  ['*', /^\/api\/kasse\/settings$/, CASH],
  ['POST', /^\/api\/driver\/(position|start|delivered|finish|proof|door-pay)$/, STAFF],
  ['GET', /^\/api\/delivery\/proof$/, CASH],
  ['GET', /^\/api\/driver\/routes$/, STAFF],
  ['POST', /^\/api\/delivery\/(assign|cancel|move|swap|reorder|order-pref|driver-pref)$/, CASH],
  ['POST', /^\/api\/live-orders\/stage$/, KITCH],
  ['POST', /^\/api\/live-orders\/archive-day$/, CASH],
  ['POST', /^\/api\/tse-demo\/receipt$/, CASH],
  ['GET', /^\/api\/day-closing(\/|$)/, ACCT], // تقفيلة اليوم: عرض (المحاسب كمان)
  ['POST', /^\/api\/day-closing(\/|$)/, MANAGERS], // إنشاء تقفيلة / Nachtrag / إعادة طباعة: مالك أو مدير بس
  ['GET', /^\/api\/delivery\/(scan|route-link|order-print)$/, STAFF],
  ['POST', /^\/api\/delivery\/(order-qr|route-qr)$/, STAFF],
  ['GET', /^\/api\/delivery\/(dispatch-plan|operations-plan)$/, CASH],
  ['POST', /^\/api\/delivery\/smart-plan$/, CASH],
  ['*', /^\/api\/delivery\/(daily-report|config|driver-pay|pay-preview)$/, MANAGERS],
  ['POST', /^\/api\/(attendance(\/qr)?|employee\/qr|shifts\/open)$/, STAFF],
  ['*', /^\/api\/(accounting|invoices|reports)(\/|$)/, ACCT],
  ['POST', /^\/api\/(documents|invoice-extract)$/, ACCT],
  ['*', /^\/api\/auth\/(team|set-pin|staff|invite)(\/|$)/, MANAGERS],
  ['POST', /^\/api\/driver\/note$/, STAFF],
  ['GET', /^\/api\/push\/key$/, STAFF],
  ['POST', /^\/api\/push\/subscribe$/, STAFF],
  ['POST', /^\/api\/push\/fcm-token$/, STAFF],
  ['GET', /^\/api\/driver\/notes$/, STAFF],
];
function policyFor(method, pathname) {
  const m = String(method || 'GET').toUpperCase();
  for (const [meth, re, access] of RULES) if ((meth === '*' || meth === m) && re.test(pathname)) return access;
  return MANAGERS;
}
const allowed = (access, role) => Array.isArray(access) && access.includes(role);

// ───────── ملفات ثابتة مسموحة ─────────
const BLOCKED_DIRS = new Set(['data', 'logs', 'node_modules', 'tests', 'scripts', 'checkpoint', 'local-ocr-output']);
const SERVER_FILES = new Set(['server.js', 'server-auth.js', 'auth.js', 'kitchen.js', 'dispatch-engine.js', 'dispatch-service.js', 'push.js', 'customer-db.js', 'customer-book.js', 'reminders.js', 'telegram-actions.js', 'platform-trips.js', 'dispatch-learning.js', 'prep-learning.js', 'platform-accept.js', 'platform-status.js', 'payment-logic.js','delivery-quote.js','print-service.js', 'project-agent-tools.js', 'project-change-worker.js', 'local-ocr-worker-manager.js', 'invoice-extraction-provider.js', 'local-invoice-preparser.js', 'nara-agent-suite.js', 'nara-receipt.mjs', 'lieferando-playwright-bridge.mjs', 'sides-bridge.mjs', 'uber-discover.mjs', 'sides-normalize.mjs', 'uber-bridge.mjs', 'uber-normalize.mjs', 'web-order.js', 'bank-pay.js', 'qonto-sync.js', 'flamo-ai.js', 'sides-login-save.ps1',
  // 2a) Server-only (nur per require geladen, in keiner .html / keinem Frontend-Skript referenziert):
  'alerts.js', 'monitor.js', 'data-guard.js', 'delivery-rules.js', 'local-invoice-hybrid.js', 'option-library.js', 'sales-ledger.js', 'settlement-ledger.js', 'day-closing.js', 'day-closing-routes.js', 'customers-sync.js', 'menu-translations-lib.js', 'kasse-window.js', 'body-reader.js', 'system-update.js',
  // Dev-/Benchmark-/CLI-Tools (kein Frontend)
  'deepseek-benchmark.js', 'local-coordinate-benchmark.js', 'local-preparser-diagnostic.js', 'run-local-ocr-generalization-controlled.js', 'discover.mjs']);
// 2b) Whitelist für Skripte: .js/.mjs außerhalb von dist/ werden NUR ausgeliefert, wenn sie hier stehen (default-deny).
// Quelle: <script src> in den .html-Seiten + dynamisch nachgeladene Skripte (createElement('script'), import(), serviceWorker, server-injizierte nara-auth.js/flamo-nav.js).
// Neue Frontend-Datei? → hier eintragen (tests/auth.test.js meldet es, wenn eine Seite sie lädt und sie fehlt). Server-Module gehören NICHT hierher.
const FRONTEND_JS = new Set([
  'accounting.js', 'admin-foundation.js', 'admin-menu-translations.js', 'ai-manager-cashier-agents.js', 'ai-manager-command-center.js',
  'ai-manager-i18n-fix.js', 'ai-manager.js', 'allergen-data.js', 'app.js', 'business-day.js', 'catalog.js', 'customer-chef.js',
  'customer-sidebar.js', 'day-closing-print.js', 'flamo-icons.js', 'flamo-night.js', 'flamo-nav.js', 'flamo-t.js', 'inventory-foundation.js', 'invoice-review-model.js', 'kasse-agent-suite.js',
  'kasse-customer-directory.js', 'kasse-reminders.js', 'kasse-delivery-fee.js', 'kasse-domain.js', 'kasse-external-payment-guard.js', 'kasse-header-tidy.js',
  'kasse-helpers.js', 'kasse-lanch-file-preview.js', 'kasse-lanch-import.js', 'kasse-lieferando-bridge.js', 'kasse-live-orders-link.js',
  'kasse-monitor.js', 'kasse-open-orders.js', 'kasse-order-hub.js', 'kasse-payment.js', 'kasse-phone-lookup.js', 'kasse-phone.js', 'kasse-platform-sync.js', 'kasse-print-lifecycle.js',
  'kasse-print-sound.js', 'kasse-printer-panel.js', 'kasse-product-dialog.js', 'kasse-quick-extras.js', 'kasse-receipt.js',
  'kasse-settlement.js', 'kasse-sync.js', 'kasse-touch.js', 'kasse-training.js', 'kasse-tse-demo.js', 'kasse.js',
  'live-orders-trend.js', 'manager-pending-actions.js', 'menu-source.js', 'menu-surcharge.js', 'nara-3d-scene.js', 'nara-auth.js', 'nara-emoji.js', 'nara-i18n.js',
  'nara-lang.js', 'nara-receipt-core.mjs', 'nara-sidebar-chef.js', 'operations/core.js', 'reports.js', 'staff.js', 'sw.js',
  'vendor/qrcode.bundle.js',
]);
const STATIC_EXT = new Set(['.html', '.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.webp', '.webm', '.avif', '.gif', '.svg', '.ico', '.woff', '.woff2', '.webmanifest', '.mp3', '.wav', '.ogg']);
function staticAllowed(rel) {
  const parts = String(rel || '').split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return false;
  for (const p of parts) {
    if (p.startsWith('.')) return false;
    const lower = p.toLowerCase();
    if (BLOCKED_DIRS.has(lower) || lower.startsWith('checkpoint') || lower.startsWith('local-ocr-output') || lower.startsWith('nara-worker-deploy-archive') || lower.startsWith('.nara-ocr')) return false;
  }
  const last = parts[parts.length - 1].toLowerCase();
  if (/\.(bak|tmp|log|env|pem|key)$/i.test(last) || last.includes('.bak')) return false;
  const ext = last.includes('.') ? last.slice(last.lastIndexOf('.')) : '';
  if (!STATIC_EXT.has(ext)) return false;
  if (SERVER_FILES.has(last)) return false;
  if (parts[0].toLowerCase() === 'dist' && parts[1] && parts[1].toLowerCase() === 'server') return false;
  // default-deny für Skripte: nur explizit gelistete Frontend-Dateien (dist/ = Build-Ausgabe, unverändert behandelt)
  if ((ext === '.js' || ext === '.mjs') && parts[0].toLowerCase() !== 'dist' && !FRONTEND_JS.has(parts.map(x => x.toLowerCase()).join('/'))) return false;
  return true;
}

// الصفحات اللي بتنحقن فيها شاشة الدخول (الاسم → الأدوار)
const PAGE_ROLES = {
  'kasse.html': CASH, 'live-orders.html': KITCH, 'kitchen.html': KITCH, 'reception.html': KITCH, 'nara-app.html': STAFF,
  'driver-app-v2.html': STAFF, 'driver.html': STAFF, 'dispatch.html': CASH, 'connect.html': CASH, 'delivery.html': STAFF, 'delivery-print.html': STAFF,
  'staff.html': MANAGERS, 'customers.html': KITCH, 'customer-book.html': KITCH, 'reminders.html': KITCH, 'team.html': MANAGERS, 'admin.html': MANAGERS, 'admin-foundation.html': MANAGERS, 'ai-control.html': MANAGERS, 'dashboard.html': MANAGERS, 'status.html': MANAGERS, 'inventory-foundation.html': MANAGERS,
  'accounting.html': ACCT, 'banking.html': ACCT, 'reports.html': ACCT, 'sales.html': ACCT, 'kasse-settlement.html': ACCT,
  'update.html': MANAGERS,
};


// ───────── Tunnel-/Proxy-sicher: echte Client-IP, "nur lokal", zeitkonstanter Vergleich ─────────
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const crypto_ = require('node:crypto');
const viaProxy = req => !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers['forwarded'] || req.headers['x-real-ip']);
// Nur echte lokale Zugriffe (Geschäfts-PC): Loopback-Socket UND kein Proxy-/Tunnel-Header (cloudflared verbindet von 127.0.0.1!)
const isLocalOnly = req => LOOPBACK_ADDRS.has(String(req.socket && req.socket.remoteAddress || '')) && !viaProxy(req);
// Client-IP: Proxy-Header nur vertrauen, wenn die Verbindung vom eigenen Rechner (Tunnel) kommt
const clientIp = req => {
  const sock = String(req.socket && req.socket.remoteAddress || '');
  if (LOOPBACK_ADDRS.has(sock)) { const h = String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim(); if (h) return h.slice(0, 64); }
  return sock;
};
const safeEq = (a, b) => { const x = crypto_.createHash('sha256').update(String(a)).digest(), y = crypto_.createHash('sha256').update(String(b)).digest(); return crypto_.timingSafeEqual(x, y); };

module.exports = { viaProxy, isLocalOnly, clientIp, safeEq, ROLES, MANAGERS, CASH, KITCH, STAFF, ACCT, normalizeRole, validatePin, hashPin, verifyPin, newToken, tokenHash, parseCookies, Limiter, pruneHits, policyFor, allowed, staticAllowed, FRONTEND_JS, SERVER_FILES, PAGE_ROLES };
