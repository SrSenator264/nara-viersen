'use strict';
// End-to-end Sicherheitstests: startet eine Kopie des Servers mit leerem data/-Ordner.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-restore-owner-'));
const port = 4400 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
let proc;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, cookie, headers = {}) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, text, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
const S = {};

test('restore-owner: only a logged-in manager, only when no owner exists', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' });
  S.owner = b.cookie; S.ownerId = b.json.user.id;
  // مع وجود صاحب: مرفوض
  assert.equal((await call('POST', '/api/auth/restore-owner', {}, S.owner)).status, 409);
  // الصاحب بيضيف مدير تاني وبينزّل حاله لمدير
  const m = await call('POST', '/api/auth/staff', { name: 'Mgr', role: 'MANAGER', pin: '582913' }, S.owner); assert.equal(m.status, 200);
  S.mgrId = m.json.id;
  assert.equal((await call('POST', '/api/auth/staff', { id: S.ownerId, name: 'Chef', role: 'MANAGER' }, S.owner)).status, 200);
  // بدون تسجيل دخول: مرفوض
  assert.ok([401, 403].includes((await call('POST', '/api/auth/restore-owner', {})).status));
  // كاشير: مرفوض
  const mgr = await call('POST', '/api/auth/login', { employeeId: S.mgrId, pin: '582913' });
  const c = await call('POST', '/api/auth/staff', { name: 'Cash', role: 'CASHIER', pin: '4821' }, mgr.cookie);
  const cash = await call('POST', '/api/auth/login', { employeeId: c.json.id, pin: '4821' });
  assert.equal((await call('POST', '/api/auth/restore-owner', {}, cash.cookie)).status, 403);
  // المدير الأول (كان صاحب) بيرجّع حاله
  const chef = await call('POST', '/api/auth/login', { employeeId: S.ownerId, pin: '739402' });
  assert.equal(chef.status, 200);
  const team = await call('GET', '/api/auth/team', null, chef.cookie); assert.equal(team.json.me.canRestoreOwner, true);
  const r = await call('POST', '/api/auth/restore-owner', {}, chef.cookie);
  assert.equal(r.status, 200); assert.equal(r.json.role, 'OWNER');
  const after = await call('GET', '/api/auth/team', null, chef.cookie);
  assert.equal(after.json.me.owner, true); assert.equal(after.json.me.canRestoreOwner, false);
  assert.equal(after.json.team.find(x => x.id === S.ownerId).role, 'OWNER');
  // ما تتكرر وما تأثر عالمدير التاني
  assert.equal((await call('POST', '/api/auth/restore-owner', {}, mgr.cookie)).status, 409);
  assert.equal(after.json.team.find(x => x.id === S.mgrId).role, 'MANAGER');
});
