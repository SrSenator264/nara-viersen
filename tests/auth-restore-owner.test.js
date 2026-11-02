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
  // حالة قديمة: ولا صاحب، مدير وكاشير بس (متل حالة عمر)
  const A = require(path.join(root, 'auth.js'));
  fs.writeFileSync(path.join(tmp, 'data', 'nara-auth.json'), JSON.stringify({ accounts: { mgr1: { role: 'MANAGER', active: true, pin: A.hashPin('739402') }, mgr2: { role: 'MANAGER', active: true, pin: A.hashPin('582913') }, cash1: { role: 'CASHIER', active: true, pin: A.hashPin('4821') } }, sessions: {}, invites: {} }));
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
  const cash = await call('POST', '/api/auth/login', { employeeId: 'cash1', pin: '4821' });
  assert.equal(cash.status, 200);
  assert.equal((await call('POST', '/api/auth/restore-owner', {})).status === 200, false);
  assert.equal((await call('POST', '/api/auth/restore-owner', {}, cash.cookie)).status, 403);
  // الرفض بينسجّل بسجل التدقيق
  const audit = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'nara-admin.json'), 'utf8')).auditEvents || [];
  const denied = audit.find(e => e.type === 'OWNER_RESTORE_DENIED' && e.entityId === 'cash1');
  assert.ok(denied && denied.details.reason === 'NOT_MANAGER');
  const m2 = await call('POST', '/api/auth/login', { employeeId: 'mgr2', pin: '582913' });
  const chef = await call('POST', '/api/auth/login', { employeeId: 'mgr1', pin: '739402' });
  assert.equal(chef.status, 200);
  const team = await call('GET', '/api/auth/team', null, chef.cookie); assert.equal(team.json.me.canRestoreOwner, true);
  const r = await call('POST', '/api/auth/restore-owner', {}, chef.cookie);
  assert.equal(r.status, 200); assert.equal(r.json.role, 'OWNER');
  const after = await call('GET', '/api/auth/team', null, chef.cookie);
  assert.equal(after.json.me.owner, true); assert.equal(after.json.me.canRestoreOwner, false);
  assert.equal(after.json.team.find(x => x.id === 'mgr1').role, 'OWNER');
  assert.equal(after.json.team.find(x => x.id === 'mgr2').role, 'MANAGER');
  // ما تتكرر
  assert.equal((await call('POST', '/api/auth/restore-owner', {}, m2.cookie)).status, 409);
  // آخر صاحب ما بينزّل ولا بينعطّل
  S.owner = chef.cookie;
  assert.equal((await call('POST', '/api/auth/staff', { id: 'mgr1', name: 'Chef', role: 'MANAGER' }, S.owner)).status, 409);
  assert.equal((await call('POST', '/api/auth/staff', { id: 'mgr1', name: 'Chef', role: 'OWNER', active: false }, S.owner)).status, 409);
});
