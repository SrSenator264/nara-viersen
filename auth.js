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
    const k = part.slice(0, i).trim(); if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
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
}

// ───────── جدول صلاحيات المسارات (الأول المطابق يفوز) ─────────
// access: 'public' | 'service' (مفتاح الجسر أو loopback) | مصفوفة أدوار
const RULES = [
  ['GET', /^\/api\/delivery\/zones$/, 'public'],
  ['POST', /^\/api\/delivery\/quote$/, 'public'],
  ['GET', /^\/api\/menu$/, 'public'],
  ['GET', /^\/api\/permissions$/, 'public'],
  ['POST', /^\/api\/nara-guide$/, 'public'],
  ['*', /^\/api\/auth\/(login|logout|me|employees|bootstrap)$/, 'public'],
  ['POST', /^\/api\/platform-orders\/import$/, 'service'],
  ['POST', /^\/api\/platform-orders\/(heartbeat|alert)$/, 'service'],
  ['GET', /^\/api\/platform-orders\/status$/, KITCH],
  ['GET', /^\/api\/system\/lan$/, CASH],
  ['POST', /^\/api\/kasse\/events$/, KITCH],
  ['GET', /^\/api\/kasse-state$/, KITCH],
  ['GET', /^\/api\/kasse\/open-orders$/, KITCH],
  ['*', /^\/api\/customers(\/sync)?$/, CASH],
  ['GET', /^\/api\/cashier\/employee-lookup$/, CASH],
  ['*', /^\/api\/kitchen\/orders$/, KITCH],
  ['GET', /^\/api\/delivery\/auto-plan$/, CASH],
  ['POST', /^\/api\/kitchen\/estimate$/, CASH],
  ['*', /^\/api\/kasse\/settings$/, CASH],
  ['POST', /^\/api\/driver\/(position|start|delivered|finish|proof)$/, STAFF],
  ['GET', /^\/api\/delivery\/proof$/, CASH],
  ['GET', /^\/api\/driver\/routes$/, STAFF],
  ['POST', /^\/api\/delivery\/(assign|cancel)$/, CASH],
  ['POST', /^\/api\/live-orders\/stage$/, KITCH],
  ['POST', /^\/api\/live-orders\/archive-day$/, CASH],
  ['POST', /^\/api\/tse-demo\/receipt$/, CASH],
  ['GET', /^\/api\/delivery\/(scan|route-link|order-print)$/, STAFF],
  ['POST', /^\/api\/delivery\/(order-qr|route-qr)$/, STAFF],
  ['GET', /^\/api\/delivery\/(dispatch-plan|operations-plan)$/, CASH],
  ['POST', /^\/api\/delivery\/smart-plan$/, CASH],
  ['*', /^\/api\/delivery\/(daily-report|config|driver-pay|pay-preview)$/, MANAGERS],
  ['POST', /^\/api\/(attendance(\/qr)?|employee\/qr|shifts\/open)$/, STAFF],
  ['*', /^\/api\/(accounting|invoices|reports)(\/|$)/, ACCT],
  ['POST', /^\/api\/(documents|invoice-extract)$/, ACCT],
  ['*', /^\/api\/auth\/(team|set-pin|staff)(\/|$)/, MANAGERS],
];
function policyFor(method, pathname) {
  const m = String(method || 'GET').toUpperCase();
  for (const [meth, re, access] of RULES) if ((meth === '*' || meth === m) && re.test(pathname)) return access;
  return MANAGERS;
}
const allowed = (access, role) => Array.isArray(access) && access.includes(role);

// ───────── ملفات ثابتة مسموحة ─────────
const BLOCKED_DIRS = new Set(['data', 'logs', 'node_modules', 'tests', 'scripts', 'checkpoint', 'local-ocr-output']);
const SERVER_FILES = new Set(['server.js', 'server-auth.js', 'auth.js', 'kitchen.js', 'dispatch-engine.js', 'dispatch-service.js', 'dispatch-learning.js', 'prep-learning.js', 'platform-status.js', 'project-agent-tools.js', 'project-change-worker.js', 'local-ocr-worker-manager.js', 'invoice-extraction-provider.js', 'local-invoice-preparser.js', 'nara-agent-suite.js', 'nara-receipt.mjs', 'lieferando-playwright-bridge.mjs', 'sides-bridge.mjs', 'uber-discover.mjs', 'sides-normalize.mjs']);
const STATIC_EXT = new Set(['.html', '.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico', '.woff', '.woff2', '.webmanifest', '.mp3', '.wav', '.ogg']);
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
  return true;
}

// الصفحات اللي بتنحقن فيها شاشة الدخول (الاسم → الأدوار)
const PAGE_ROLES = {
  'kasse.html': CASH, 'live-orders.html': KITCH, 'kitchen.html': KITCH,
  'driver-app-v2.html': STAFF, 'driver.html': STAFF, 'dispatch.html': CASH, 'connect.html': CASH, 'driver-app.html': STAFF, 'delivery.html': STAFF, 'delivery-print.html': STAFF,
  'staff.html': MANAGERS, 'team.html': MANAGERS, 'admin.html': MANAGERS, 'admin-foundation.html': MANAGERS, 'ai-control.html': MANAGERS, 'dashboard.html': MANAGERS, 'inventory-foundation.html': MANAGERS,
  'accounting.html': ACCT, 'banking.html': ACCT, 'ledger.html': ACCT, 'reports.html': ACCT, 'sales.html': ACCT, 'kasse-settlement.html': ACCT,
};

module.exports = { ROLES, MANAGERS, CASH, KITCH, STAFF, ACCT, normalizeRole, validatePin, hashPin, verifyPin, newToken, tokenHash, parseCookies, Limiter, policyFor, allowed, staticAllowed, PAGE_ROLES };
