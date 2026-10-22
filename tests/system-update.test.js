'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../auth.js');
const U = require('../system-update.js');

test('system update: nur Inhaber und Manager (API + Seite)', () => {
  for (const m of ['GET', 'POST']) {
    const acc = A.policyFor(m, '/api/system/update');
    assert.equal(A.allowed(acc, 'OWNER'), true);
    assert.equal(A.allowed(acc, 'MANAGER'), true);
    assert.equal(A.allowed(acc, 'CASHIER'), false);
    assert.equal(A.allowed(acc, 'DRIVER'), false);
  }
  assert.deepEqual(A.PAGE_ROLES['update.html'], ['OWNER', 'MANAGER']);
});

test('system update: Modul wird nie ausgeliefert, Seite schon', () => {
  assert.equal(A.staticAllowed('system-update.js'), false);
  assert.equal(A.staticAllowed('update.html'), true);
});

test('system update: aktuelle Version aus .git lesen (ref, packed-refs, detached)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  const sha = 'a'.repeat(40), sha2 = 'b'.repeat(40);
  fs.mkdirSync(path.join(d, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(d, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  assert.equal(U.currentSha(d), null);
  fs.writeFileSync(path.join(d, '.git', 'packed-refs'), `# pack-refs\n${sha2} refs/heads/main\n`);
  assert.equal(U.currentSha(d), sha2);
  fs.writeFileSync(path.join(d, '.git', 'refs', 'heads', 'main'), sha + '\n');
  assert.equal(U.currentSha(d), sha);
  fs.writeFileSync(path.join(d, '.git', 'HEAD'), sha2 + '\n');
  assert.equal(U.currentSha(d), sha2);
  assert.equal(U.currentSha(path.join(d, 'nix')), null);
});

test('system update: Skripte sind vorhanden und ohne Geheimnisse', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['Flamo-Update.ps1', 'Flamo-Update-Einrichten.ps1', 'Flamo-Update-Einrichten.cmd', 'update.html']) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(t, /(password|passwort|api[_-]?key|token)\s*=/i, f);
  }
  const ps = fs.readFileSync(path.join(root, 'Flamo-Update.ps1'));
  assert.deepEqual([...ps.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'Flamo-Update.ps1 braucht UTF-8-BOM (arabischer Text)');
});
