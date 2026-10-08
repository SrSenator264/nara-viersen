'use strict';
// server-auth.js — ربط auth.js بالسيرفر: بوابة الصلاحيات، تسجيل الدخول بالـPIN، الجلسات، إدارة الفريق.
// التخزين: data/nara-auth.json (حسابات + هاش الـPIN + هاش الجلسات) — منفصل عن بيانات الكاشير.
const fs = require('node:fs');
const path = require('node:path');
const A = require('./auth.js');

const COOKIE = 'nara_session';
const SESSION_MS = 14 * 3600 * 1000;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function create({ readAdminData, writeAdminData, reply, adminId, dir }) {
  const file = path.join(dir, 'nara-auth.json');
  let store = { accounts: {}, sessions: {} };
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && typeof j === 'object') store = { accounts: j.accounts || {}, sessions: j.sessions || {} }; } catch { /* first run */ }
  const save = () => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const acctLimiter = new A.Limiter(), ipLimiter = new A.Limiter({ max: 20, lockMs: 5 * 60000 });
  const ipOf = req => String(req.socket.remoteAddress || '');
  const isLoopback = req => LOOPBACK.has(ipOf(req));
  const secureReq = req => String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';

  function pruneSessions() { const now = Date.now(); let ch = false; for (const [k, v] of Object.entries(store.sessions)) if (v.exp < now) { delete store.sessions[k]; ch = true; } if (ch) save(); }
  function revoke(employeeId) { let ch = false; for (const [k, v] of Object.entries(store.sessions)) if (v.employeeId === employeeId) { delete store.sessions[k]; ch = true; } if (ch) save(); }
  const nameOf = (data, id) => { const e = (data.employees || []).find(x => x.id === id); return e ? String(e.name || e.fullName || id) : id; };

  function userFrom(req) {
    const keyHdr = process.env.NARA_MANAGER_KEY;
    if (keyHdr && String(req.headers['x-nara-manager-key'] || '') === keyHdr) return { id: 'manager-key', name: 'Manager key', role: 'OWNER' };
    const tok = A.parseCookies(req.headers.cookie)[COOKIE];
    if (!tok) return null;
    const s = store.sessions[A.tokenHash(tok)];
    if (!s || s.exp < Date.now()) return null;
    const acc = store.accounts[s.employeeId];
    if (!acc || acc.active === false) return null;
    return { id: s.employeeId, name: s.name, role: acc.role };
  }
  function serviceOk(req) {
    const key = process.env.NARA_SERVICE_KEY;
    if (key) return String(req.headers['x-nara-service-key'] || '') === key;
    return isLoopback(req) && !req.headers['x-forwarded-for'];
  }
  const cookieHeader = (req, value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureReq(req) ? '; Secure' : ''}`;
  function replyC(res, status, data, cookie) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
    res.end(body);
  }
  function readJson(req, res, limit, handler) {
    let body = '', dead = false;
    req.on('data', c => { body += c; if (body.length > limit) { dead = true; req.destroy(); } });
    req.on('end', () => { if (dead) return; try { handler(JSON.parse(body || '{}')); } catch (e) { reply(res, 400, { error: e.message || 'Bad request.' }); } });
  }
  const activeManagers = () => Object.entries(store.accounts).filter(([, a]) => a.active !== false && A.MANAGERS.includes(a.role) && a.pin);

  function startSession(req, res, employeeId, name, role) {
    pruneSessions();
    const tok = A.newToken();
    store.sessions[A.tokenHash(tok)] = { employeeId, name, exp: Date.now() + SESSION_MS };
    save();
    replyC(res, 200, { ok: true, user: { id: employeeId, name, role } }, cookieHeader(req, tok, SESSION_MS / 1000));
  }

  // يرجع true إذا الطلب انتهى (مرفوض أو endpoint دخول)
  function gate(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false;
    if (req.method === 'OPTIONS') return false;
    req.naraUser = userFrom(req);
    // حماية CSRF: الطلبات المغيِّرة من متصفح لازم تيجي من نفس الـhost
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) { reply(res, 403, { error: 'Cross-origin request blocked.', code: 'FORBIDDEN' }); return true; } } catch { reply(res, 403, { error: 'Bad origin.', code: 'FORBIDDEN' }); return true; }
    }
    if (url.pathname.startsWith('/api/auth/') && authRoutes(req, res, url)) return true;
    const access = A.policyFor(req.method, url.pathname);
    if (access === 'public') return false;
    if (access === 'service') {
      if (serviceOk(req) || (req.naraUser && A.MANAGERS.includes(req.naraUser.role))) return false;
      reply(res, 401, { error: 'Service access required.', code: 'AUTH_REQUIRED' }); return true;
    }
    if (!req.naraUser) { reply(res, 401, { error: 'Anmeldung erforderlich.', code: 'AUTH_REQUIRED' }); return true; }
    if (!A.allowed(access, req.naraUser.role)) { reply(res, 403, { error: 'Keine Berechtigung.', code: 'FORBIDDEN' }); return true; }
    return false;
  }

  function authRoutes(req, res, url) {
    const p = url.pathname, m = req.method;
    if (p === '/api/auth/me' && m === 'GET') { replyC(res, 200, { ok: true, user: req.naraUser || null, setupNeeded: activeManagers().length === 0 }); return true; }
    if (p === '/api/auth/employees' && m === 'GET') {
      const data = readAdminData();
      const list = Object.entries(store.accounts).filter(([, a]) => a.active !== false && a.pin).map(([id, a]) => ({ id, name: nameOf(data, id), role: a.role }));
      replyC(res, 200, { ok: true, employees: list, setupNeeded: activeManagers().length === 0 }); return true;
    }
    if (p === '/api/auth/logout' && m === 'POST') {
      const tok = A.parseCookies(req.headers.cookie)[COOKIE];
      if (tok) { delete store.sessions[A.tokenHash(tok)]; save(); }
      replyC(res, 200, { ok: true }, cookieHeader(req, '', 0)); return true;
    }
    if (p === '/api/auth/login' && m === 'POST') {
      readJson(req, res, 2000, b => {
        const id = String(b.employeeId || ''), ip = 'ip:' + ipOf(req), ak = 'acct:' + id;
        const c1 = acctLimiter.check(ak), c2 = ipLimiter.check(ip);
        if (!c1.ok || !c2.ok) { const s = Math.ceil(Math.max(c1.retryMs, c2.retryMs) / 1000); return replyC(res, 429, { error: `Zu viele Versuche. Bitte in ${s} s erneut.`, code: 'LOCKED', retrySeconds: s }); }
        const acc = store.accounts[id];
        const ok = acc && acc.active !== false && acc.pin && A.verifyPin(b.pin, acc.pin);
        if (!ok) { if (!acc) A.verifyPin('0', { salt: 'ab', hash: 'cd' }); acctLimiter.fail(ak); ipLimiter.fail(ip); return replyC(res, 401, { error: 'PIN falsch.', code: 'BAD_PIN' }); }
        acctLimiter.success(ak); ipLimiter.success(ip);
        startSession(req, res, id, nameOf(readAdminData(), id), acc.role);
      });
      return true;
    }
    if (p === '/api/auth/bootstrap' && m === 'POST') {
      readJson(req, res, 2000, b => {
        if (activeManagers().length) return reply(res, 409, { error: 'Es gibt bereits einen Manager.', code: 'ALREADY_SETUP' });
        const keyOk = process.env.NARA_MANAGER_KEY && String(req.headers['x-nara-manager-key'] || '') === process.env.NARA_MANAGER_KEY;
        if (!keyOk && !(isLoopback(req) && !req.headers['x-forwarded-for'])) return reply(res, 403, { error: 'Ersteinrichtung nur am Geschäfts-PC.', code: 'FORBIDDEN' });
        const name = String(b.name || '').trim(), err = !name ? 'Name fehlt.' : A.validatePin('OWNER', b.pin);
        if (err) return reply(res, 422, { error: err });
        const data = readAdminData(), id = adminId('employee'), now = new Date().toISOString();
        data.employees.push({ id, name, role: 'OWNER', active: true, permissions: [], qrToken: adminId('qr'), hourlyRateCents: null, monthlySalaryCents: null, contractType: 'HOURLY', internalProfileEnabled: true, officialProfileEnabled: false, workforceType: 'INTERNAL', breakMinutes: 0, overtimeMultiplier: 1.25, dailyDeductionCents: 0, currency: 'EUR', createdAt: now, updatedAt: now });
        writeAdminData(data);
        store.accounts[id] = { role: 'OWNER', active: true, pin: A.hashPin(b.pin) };
        save();
        startSession(req, res, id, name, 'OWNER');
      });
      return true;
    }
    // ───── إدارة الفريق (المدير فقط — policyFor بتفرضها لكن نتحقق هون كمان) ─────
    const isMgr = req.naraUser && A.MANAGERS.includes(req.naraUser.role);
    if (/^\/api\/auth\/(team|set-pin|staff)$/.test(p)) {
      if (!req.naraUser) { reply(res, 401, { error: 'Anmeldung erforderlich.', code: 'AUTH_REQUIRED' }); return true; }
      if (!isMgr) { reply(res, 403, { error: 'Keine Berechtigung.', code: 'FORBIDDEN' }); return true; }
    }
    if (p === '/api/auth/team' && m === 'GET') {
      const data = readAdminData();
      const ids = new Set([...(data.employees || []).map(e => e.id), ...Object.keys(store.accounts)]);
      const team = [...ids].map(id => { const a = store.accounts[id]; const e = (data.employees || []).find(x => x.id === id); return { id, name: nameOf(data, id), role: a?.role || null, active: a ? a.active !== false : false, hasPin: !!a?.pin, employeeActive: e ? e.active !== false : false }; });
      replyC(res, 200, { ok: true, team, roles: A.ROLES }); return true;
    }
    if (p === '/api/auth/set-pin' && m === 'POST') {
      readJson(req, res, 2000, b => {
        const id = String(b.employeeId || ''), acc = store.accounts[id];
        if (!acc) return reply(res, 404, { error: 'Konto nicht gefunden.' });
        if (A.MANAGERS.includes(acc.role) && req.naraUser.role !== 'OWNER' && req.naraUser.id !== id) return reply(res, 403, { error: 'Nur der Inhaber ändert Manager-PINs.', code: 'FORBIDDEN' });
        const err = A.validatePin(acc.role, b.pin); if (err) return reply(res, 422, { error: err });
        acc.pin = A.hashPin(b.pin); save(); revoke(id);
        replyC(res, 200, { ok: true });
      });
      return true;
    }
    if (p === '/api/auth/staff' && m === 'POST') {
      readJson(req, res, 5000, b => {
        const role = A.normalizeRole(b.role); if (!role) return reply(res, 422, { error: 'Rolle ungültig.' });
        if ((role === 'OWNER' || (store.accounts[b.id]?.role === 'OWNER')) && req.naraUser.role !== 'OWNER') return reply(res, 403, { error: 'Nur der Inhaber verwaltet Inhaber-Konten.', code: 'FORBIDDEN' });
        const data = readAdminData(), now = new Date().toISOString();
        let id = String(b.id || ''), emp = id ? data.employees.find(e => e.id === id) : null;
        if (id && !emp) return reply(res, 404, { error: 'Mitarbeiter nicht gefunden.' });
        const name = String(b.name || emp?.name || '').trim(); if (!name) return reply(res, 422, { error: 'Name fehlt.' });
        const active = b.active !== false, prev = store.accounts[id];
        if (prev && A.MANAGERS.includes(prev.role) && prev.active !== false && (!active || !A.MANAGERS.includes(role)) && activeManagers().filter(([k]) => k !== id).length === 0)
          return reply(res, 409, { error: 'Der letzte Manager kann nicht deaktiviert oder herabgestuft werden.' });
        if (!prev && !b.pin) return reply(res, 422, { error: 'Neues Konto braucht eine PIN.' });
        if (b.pin) { const err = A.validatePin(role, b.pin); if (err) return reply(res, 422, { error: err }); }
        else if (prev?.pin && String(prev.pin.salt)) { const need = ({ OWNER: 6, MANAGER: 6, ACCOUNTANT: 6 })[role]; if (need && !(A.MANAGERS.includes(prev.role) || prev.role === 'ACCOUNTANT')) return reply(res, 422, { error: `Für ${role} bitte neue PIN (mind. ${need} Ziffern) setzen.` }); }
        if (!emp) { id = adminId('employee'); emp = { id, name, role, active, permissions: [], qrToken: adminId('qr'), hourlyRateCents: null, monthlySalaryCents: null, contractType: 'HOURLY', internalProfileEnabled: true, officialProfileEnabled: false, workforceType: 'INTERNAL', breakMinutes: 0, overtimeMultiplier: 1.25, dailyDeductionCents: 0, currency: 'EUR', createdAt: now, updatedAt: now }; data.employees.push(emp); }
        else { emp.name = name; emp.role = role; emp.active = active; emp.updatedAt = now; }
        writeAdminData(data);
        store.accounts[id] = { role, active, pin: b.pin ? A.hashPin(b.pin) : prev?.pin };
        if (b.pin || !active || (prev && prev.role !== role)) revoke(id);
        save();
        replyC(res, 200, { ok: true, id });
      });
      return true;
    }
    return false;
  }

  // شاشة الدخول بتنحقن بالصفحات المحمية
  function inject(pathname, html) {
    const name = pathname.replace(/^\//, '');
    const roles = A.PAGE_ROLES[name];
    if (!roles) return html;
    const tag = `<script src="/nara-auth.js" data-roles="${roles.join(',')}"></script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  }

  return { gate, inject, userFrom, _store: () => store };
}
module.exports = { create, COOKIE };
