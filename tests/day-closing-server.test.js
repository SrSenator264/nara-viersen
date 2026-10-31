'use strict';
// End-to-End: السيرفر الحقيقي (نسخة بمجلد data فاضي) — صلاحيات، تخزين dayClosings، 409، ملفات السيرفر مو محمّلة.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-dayclose-'));
const port = 4900 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
const SKIP = new Set(['.git', 'data', 'node_modules', 'logs', '.env', 'dist', 'nara-worker-deploy-archive-backup-20261007']);
let proc; const S = {};
test.before(async () => {
  fs.cpSync(root, tmp, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/\.(backup|mvp-backup)/.test(s) });
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=topsecret\n');
  proc = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NARA_SERVICE_KEY: '', NARA_MANAGER_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/auth/me'); return; } catch { await new Promise(r => setTimeout(r, 150)); } }
  throw new Error('server did not start');
});
test.after(() => { proc && proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, cookie) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json, cookie: sc ? sc.split(';')[0] : null };
}

test('تجهيز: مالك + كاشير + محاسب', async () => {
  const b = await call('POST', '/api/auth/bootstrap', { name: 'Chef', pin: '739402' }); assert.equal(b.status, 200); S.owner = b.cookie;
  for (const [k, role, pin] of [['cashier', 'CASHIER', '4821'], ['acct', 'ACCOUNTANT', '482916']]) {
    const r = await call('POST', '/api/auth/staff', { name: k, role, pin }, S.owner); assert.equal(r.status, 200);
    const l = await call('POST', '/api/auth/login', { employeeId: r.json.id, pin }); assert.equal(l.status, 200); S[k] = l.cookie;
  }
});

test('الصلاحيات: كاشير ممنوع، محاسب بيشوف بس، تدريب للمحاسب ممنوع', async () => {
  assert.equal((await call('GET', '/api/day-closing/preview')).status, 401);
  assert.equal((await call('GET', '/api/day-closing/preview', null, S.cashier)).status, 403);
  const v = await call('GET', '/api/day-closing/preview', null, S.acct); assert.equal(v.status, 200); assert.equal(v.json.report.revenue.grossCents, 0);
  assert.equal((await call('GET', '/api/day-closing/preview?mode=TRAINING', null, S.acct)).status, 403);
  assert.equal((await call('POST', '/api/day-closing/close', { countedCents: 0 }, S.acct)).status, 403);
  assert.equal((await call('POST', '/api/day-closing/close', { countedCents: 0 }, S.cashier)).status, 403);
  assert.equal((await call('GET', '/api/day-closing/preview?mode=TRAINING', null, S.owner)).status, 200);
});

test('المالك: تقفيلة، تخزين ثابت، 409 للتانية، قائمة، نسخة', async () => {
  const c = await call('POST', '/api/day-closing/close', { countedCents: 0 }, S.owner);
  assert.equal(c.status, 200, JSON.stringify(c.json)); assert.match(c.json.record.number, /^Z-\d{4}-0001$/); assert.equal(c.json.record.mode, 'REAL');
  const again = await call('POST', '/api/day-closing/close', { countedCents: 0 }, S.owner); assert.equal(again.status, 409); assert.equal(again.json.code, 'ALREADY_CLOSED');
  const list = await call('GET', '/api/day-closing/list', null, S.acct); assert.equal(list.status, 200); assert.equal(list.json.rows.length, 1);
  assert.equal((await call('POST', '/api/day-closing/reprint', { id: c.json.record.id }, S.owner)).json.copyNumber, 1);
  const rec = await call('GET', '/api/day-closing/record?id=' + c.json.record.id, null, S.acct); assert.equal(rec.json.copies, 1); assert.equal(rec.json.record.number, c.json.record.number);
  const st = await call('GET', '/api/day-closing/preview', null, S.owner); assert.equal(st.json.status.closed, true);
});

test('ملفات السيرفر ما بتنحمّل بالمتصفح', async () => {
  for (const u of ['/day-closing.js', '/day-closing-routes.js']) assert.equal((await call('GET', u)).status, 404, u);
});
