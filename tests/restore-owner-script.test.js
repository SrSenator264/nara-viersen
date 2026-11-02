'use strict';
// Tests für scripts/restore-owner.cjs (offline-Skript): Rolle, Sessions, Backup, atomares Schreiben, "nichts tun" wenn Inhaber existiert.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '..', 'scripts', 'restore-owner.cjs');

function setup(accounts, sessions = {}, employees) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-restore-script-'));
  fs.writeFileSync(path.join(dir, 'nara-auth.json'), JSON.stringify({ accounts, sessions, invites: {} }));
  if (employees) fs.writeFileSync(path.join(dir, 'nara-admin.json'), JSON.stringify({ employees }, null, 2));
  return dir;
}
const run = (dir, input = '') => spawnSync(process.execPath, [script, dir], { input, encoding: 'utf8' });
const readAuth = dir => JSON.parse(fs.readFileSync(path.join(dir, 'nara-auth.json'), 'utf8'));
const files = (dir, re) => fs.readdirSync(dir).filter(f => re.test(f));
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

test('restore-owner script: promotes the chosen manager, clears only his sessions, keeps backups, leaves no tmp files', () => {
  const dir = setup(
    { mgr1: { role: 'MANAGER', active: true, pin: 'x1' }, mgr2: { role: 'MANAGER', active: true, pin: 'x2' }, cash1: { role: 'CASHIER', active: true, pin: 'x3' } },
    { s1: { employeeId: 'mgr2' }, s2: { employeeId: 'mgr1' }, s3: { employeeId: 'mgr2' } },
    [{ id: 'mgr1', name: 'Eins', role: 'MANAGER' }, { id: 'mgr2', name: 'Zwei', role: 'MANAGER' }]
  );
  try {
    const r = run(dir, '2\n');
    assert.equal(r.status, 0, r.stderr);
    const a = readAuth(dir);
    assert.equal(a.accounts.mgr2.role, 'OWNER'); assert.equal(a.accounts.mgr2.active, true);
    assert.equal(a.accounts.mgr1.role, 'MANAGER'); assert.equal(a.accounts.cash1.role, 'CASHIER');
    assert.deepEqual(Object.keys(a.sessions), ['s2']); // nur die Sessions des neuen Inhabers sind weg
    assert.equal(files(dir, /^nara-auth\.json\.bak-/).length, 1);
    assert.equal(files(dir, /^nara-admin\.json\.bak-/).length, 1);
    assert.equal(files(dir, /\.tmp-/).length, 0); // atomares Schreiben hinterlässt nichts
    const admin = JSON.parse(fs.readFileSync(path.join(dir, 'nara-admin.json'), 'utf8'));
    assert.equal(admin.employees.find(e => e.id === 'mgr2').role, 'OWNER');
    assert.equal(admin.employees.find(e => e.id === 'mgr1').role, 'MANAGER');
  } finally { cleanup(dir); }
});

test('restore-owner script: does nothing when an active owner already exists', () => {
  const dir = setup({ own: { role: 'OWNER', active: true, pin: 'x' }, mgr1: { role: 'MANAGER', active: true, pin: 'y' } }, { s1: { employeeId: 'mgr1' } });
  try {
    const before = fs.readFileSync(path.join(dir, 'nara-auth.json'), 'utf8');
    const r = run(dir, '1\n');
    assert.equal(r.status, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'nara-auth.json'), 'utf8'), before);
    assert.equal(files(dir, /\.bak-|\.tmp-/).length, 0);
  } finally { cleanup(dir); }
});

test('restore-owner script: an inactive owner does not block the restore', () => {
  const dir = setup({ old: { role: 'OWNER', active: false, pin: 'x' }, mgr1: { role: 'MANAGER', active: true, pin: 'y' } });
  try {
    const r = run(dir); // مدير واحد: ما بيسأل
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readAuth(dir).accounts.mgr1.role, 'OWNER');
  } finally { cleanup(dir); }
});

test('restore-owner script: no manager or an invalid choice leaves the file untouched', () => {
  const none = setup({ cash1: { role: 'CASHIER', active: true, pin: 'x' } });
  const two = setup({ mgr1: { role: 'MANAGER', active: true, pin: 'x' }, mgr2: { role: 'MANAGER', active: true, pin: 'y' } });
  try {
    const b1 = fs.readFileSync(path.join(none, 'nara-auth.json'), 'utf8');
    assert.equal(run(none).status, 1);
    assert.equal(fs.readFileSync(path.join(none, 'nara-auth.json'), 'utf8'), b1);
    const b2 = fs.readFileSync(path.join(two, 'nara-auth.json'), 'utf8');
    assert.equal(run(two, '9\n').status, 1);
    assert.equal(fs.readFileSync(path.join(two, 'nara-auth.json'), 'utf8'), b2);
    assert.equal(files(two, /\.bak-|\.tmp-/).length, 0);
  } finally { cleanup(none); cleanup(two); }
});
