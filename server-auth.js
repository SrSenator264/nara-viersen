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
  let store = { accounts: {}, sessions: {}, invites: {} };
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && typeof j === 'object') store = { accounts: j.accounts || {}, sessions: j.sessions || {}, invites: j.invites || {} }; } catch { /* first run */ }
  const save = () => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  // Sperren: pro (IP+Konto) 5 Fehlversuche → 5 min; pro Konto gesamt (verteilte Angriffe) 25 → 15 min; pro IP 20 → 5 min.
  // So kann ein Angreifer nicht das Konto eines Mitarbeiters für alle sperren, und Tunnel-Besucher teilen sich keine IP.
  const acctIpLimiter = new A.Limiter(), acctLimiter = new A.Limiter({ max: 25, windowMs: 30 * 60000, lockMs: 15 * 60000 }), ipLimiter = new A.Limiter({ max: 20, lockMs: 5 * 60000 });
  const ipOf = req => A.clientIp(req);
  const isLocal = req => A.isLocalOnly(req);
  const secureReq = req => String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';

  function pruneSessions() { const now = Date.now(); let ch = false; for (const [k, v] of Object.entries(store.sessions)) if (v.exp < now) { delete store.sessions[k]; ch = true; } if (ch) save(); }
  function revoke(employeeId) { let ch = false; for (const [k, v] of Object.entries(store.sessions)) if (v.employeeId === employeeId) { delete store.sessions[k]; ch = true; } if (ch) save(); }
  const nameOf = (data, id) => { const e = (data.employees || []).find(x => x.id === id); return e ? String(e.name || e.fullName || id) : id; };

  function userFrom(req) {
    const keyHdr = process.env.NARA_MANAGER_KEY;
    if (keyHdr && A.safeEq(req.headers['x-nara-manager-key'] || '', keyHdr)) return { id: 'manager-key', name: 'Manager key', role: 'OWNER' };
    const tok = A.parseCookies(req.headers.cookie)[COOKIE];
    if (!tok) return null;
    const s = store.sessions[A.tokenHash(tok)];
    if (!s || s.exp < Date.now()) return null;
    const acc = store.accounts[s.employeeId];
    if (!acc || acc.active === false) return null;
    return { id: s.employeeId, name: s.name, role: acc.role, customers: acc.role === 'OWNER' || acc.customers === true };
  }
  function serviceOk(req) {
    const key = process.env.NARA_SERVICE_KEY;
    if (key) return A.safeEq(req.headers['x-nara-service-key'] || '', key);
    return isLocal(req);
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
    replyC(res, 200, { ok: true, user: { id: employeeId, name, role, customers: role === 'OWNER' || store.accounts[employeeId]?.customers === true } }, cookieHeader(req, tok, SESSION_MS / 1000));
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
      // Über den Tunnel (Proxy-Header) nur Fahrer zeigen und nie "setupNeeded" verraten; Geschäfts-PC/WLAN sehen alle wie bisher.
      const tunnel = A.viaProxy(req);
      const list = Object.entries(store.accounts).filter(([, a]) => a.active !== false && a.pin && (!tunnel || A.normalizeRole(a.role) === 'DRIVER')).map(([id, a]) => ({ id, name: nameOf(data, id), role: a.role }));
      replyC(res, 200, { ok: true, employees: list, setupNeeded: tunnel ? false : activeManagers().length === 0 }); return true;
    }
    if (p === '/api/auth/logout' && m === 'POST') {
      const tok = A.parseCookies(req.headers.cookie)[COOKIE];
      if (tok) { delete store.sessions[A.tokenHash(tok)]; save(); }
      replyC(res, 200, { ok: true }, cookieHeader(req, '', 0)); return true;
    }
    if (p === '/api/auth/login' && m === 'POST') {
      readJson(req, res, 2000, b => {
        const id = String(b.employeeId || ''), ip = 'ip:' + ipOf(req), ak = 'acct:' + id, aik = 'acctip:' + id + '|' + ipOf(req);
        const c1 = acctLimiter.check(ak), c2 = ipLimiter.check(ip), c3 = acctIpLimiter.check(aik);
        if (!c1.ok || !c2.ok || !c3.ok) { const s = Math.ceil(Math.max(c1.retryMs || 0, c2.retryMs || 0, c3.retryMs || 0) / 1000); return replyC(res, 429, { error: `Zu viele Versuche. Bitte in ${s} s erneut.`, code: 'LOCKED', retrySeconds: s }); }
        const acc = store.accounts[id];
        const ok = acc && acc.active !== false && acc.pin && A.verifyPin(b.pin, acc.pin);
        if (!ok) { if (!acc) A.verifyPin('0', { salt: 'ab', hash: 'cd' }); acctLimiter.fail(ak); ipLimiter.fail(ip); acctIpLimiter.fail(aik); return replyC(res, 401, { error: 'PIN falsch.', code: 'BAD_PIN' }); }
        acctLimiter.success(ak); ipLimiter.success(ip); acctIpLimiter.success(aik);
        startSession(req, res, id, nameOf(readAdminData(), id), acc.role);
      });
      return true;
    }
    if (p === '/api/auth/bootstrap' && m === 'POST') {
      readJson(req, res, 2000, b => {
        if (activeManagers().length) return reply(res, 409, { error: 'Es gibt bereits einen Manager.', code: 'ALREADY_SETUP' });
        const keyOk = process.env.NARA_MANAGER_KEY && A.safeEq(req.headers['x-nara-manager-key'] || '', process.env.NARA_MANAGER_KEY);
        if (!keyOk && !isLocal(req)) return reply(res, 403, { error: 'Ersteinrichtung nur am Geschäfts-PC.', code: 'FORBIDDEN' });
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
    // ───── دعوة سائق: رابط لمرة وحدة 24 ساعة، الدور سائق فقط ─────
    const inviteKey = t => 'inv:' + A.tokenHash(String(t || ''));
    const liveInvite = t => { const v = store.invites[A.tokenHash(String(t || ''))]; return v && !v.used && v.exp > Date.now() ? v : null; };
    if (p === '/api/auth/invite-check' && m === 'GET') {
      const ip = 'ipj:' + ipOf(req), c = ipLimiter.check(ip); if (!c.ok) { replyC(res, 429, { error: 'Zu viele Versuche.', code: 'LOCKED' }); return true; }
      const ok = !!liveInvite(url.searchParams.get('t')); if (!ok) ipLimiter.fail(ip);
      replyC(res, ok ? 200 : 410, ok ? { ok: true } : { error: 'Einladung ungültig oder abgelaufen.', code: 'INVITE_INVALID' }); return true;
    }
    if (p === '/api/auth/join' && m === 'POST') {
      readJson(req, res, 2000, b => {
        const ip = 'ipj:' + ipOf(req), c = ipLimiter.check(ip); if (!c.ok) return replyC(res, 429, { error: 'Zu viele Versuche.', code: 'LOCKED' });
        const inv = liveInvite(b.token); if (!inv) { ipLimiter.fail(ip); return replyC(res, 410, { error: 'Einladung ungültig oder abgelaufen.', code: 'INVITE_INVALID' }); }
        const name = String(b.name || '').trim().slice(0, 60); if (!name) return reply(res, 422, { error: 'Name fehlt.' });
        const err = A.validatePin('DRIVER', b.pin); if (err) return reply(res, 422, { error: err });
        const data = readAdminData(), now = new Date().toISOString();
        if ((data.employees || []).some(e => String(e.name || '').trim().toLowerCase() === name.toLowerCase())) return reply(res, 409, { error: 'Dieser Name existiert schon. Bitte Nachnamen/Zusatz ergänzen.' });
        const id = adminId('employee');
        data.employees.push({ id, name, role: 'DRIVER', active: true, permissions: [], qrToken: adminId('qr'), hourlyRateCents: null, monthlySalaryCents: null, contractType: 'HOURLY', internalProfileEnabled: true, officialProfileEnabled: false, workforceType: 'INTERNAL', breakMinutes: 0, overtimeMultiplier: 1.25, dailyDeductionCents: 0, currency: 'EUR', createdAt: now, updatedAt: now });
        writeAdminData(data);
        inv.used = true; inv.usedBy = id; inv.usedAt = now;
        store.accounts[id] = { role: 'DRIVER', active: true, pin: A.hashPin(b.pin) };
        save();
        startSession(req, res, id, name, 'DRIVER');
      });
      return true;
    }
    const isMgr = req.naraUser && A.MANAGERS.includes(req.naraUser.role);
    if (/^\/api\/auth\/(team|set-pin|staff|invite)$/.test(p)) {
      if (!req.naraUser) { reply(res, 401, { error: 'Anmeldung erforderlich.', code: 'AUTH_REQUIRED' }); return true; }
      if (!isMgr) { reply(res, 403, { error: 'Keine Berechtigung.', code: 'FORBIDDEN' }); return true; }
    }
    if (p === '/api/auth/invite' && m === 'POST') {
      const tok = A.newToken(), exp = Date.now() + 24 * 3600 * 1000;
      for (const [k, v] of Object.entries(store.invites)) if (v.exp < Date.now() - 86400000) delete store.invites[k];
      store.invites[A.tokenHash(tok)] = { exp, by: req.naraUser.id, used: false };
      save();
      const base = String(process.env.NARA_PUBLIC_URL || '').replace(/\/+$/, '') || (secureReq(req) ? 'https://' : 'http://') + String(req.headers.host || '');
      replyC(res, 200, { ok: true, url: base + '/join.html?t=' + encodeURIComponent(tok), expiresAt: new Date(exp).toISOString() }); return true;
    }
    if (p === '/api/auth/team' && m === 'GET') {
      const data = readAdminData();
      const ids = new Set([...(data.employees || []).map(e => e.id), ...Object.keys(store.accounts)]);
      const team = [...ids].map(id => { const a = store.accounts[id]; const e = (data.employees || []).find(x => x.id === id); return { id, name: nameOf(data, id), role: a?.role || null, active: a ? a.active !== false : false, hasPin: !!a?.pin, customers: a?.role === 'OWNER' || a?.customers === true, employeeActive: e ? e.active !== false : false, empRole: e ? A.normalizeRole(e.role) : null }; });
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
        const custGrant = req.naraUser.role === 'OWNER' && b.customers !== undefined ? b.customers === true : prev?.customers === true;
        store.accounts[id] = { role, active, pin: b.pin ? A.hashPin(b.pin) : prev?.pin, ...(custGrant ? { customers: true } : {}) };
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
    let v = '0'; try { v = String(Math.floor(fs.statSync(path.join(__dirname, 'nara-auth.js')).mtimeMs)); } catch {}
    const tag = `<script src="/nara-auth.js?v=${v}" data-roles="${roles.join(',')}"></script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  }

  return { gate, inject, userFrom, _store: () => store };
}
module.exports = { create, COOKIE };
