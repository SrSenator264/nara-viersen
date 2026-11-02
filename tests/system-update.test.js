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

// ── التحديث الآمن (2026-11-02) ──
const { spawnSync } = require('node:child_process');
const CHECK = path.join(__dirname, '..', 'scripts', 'update-check.cjs');
const runCheck = (...a) => JSON.parse(spawnSync(process.execPath, [CHECK, ...a], { encoding: 'utf8' }).stdout);

test('sicheres Update: Rollback-Ziel = Version vor dem letzten erfolgreichen Update zur aktuellen Version', () => {
  const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
  const hist = [
    { mode: 'update', ok: false, from: B, to: B },
    { mode: 'rollback', ok: true, from: C, to: B },
    { mode: 'update', ok: true, from: A, to: B },
    { mode: 'update', ok: true, from: B, to: C },
  ];
  assert.equal(U.rollbackTarget(hist, B), A);
  assert.equal(U.rollbackTarget(hist, C), B);
  assert.equal(U.rollbackTarget(hist, A), null);
  assert.equal(U.rollbackTarget([{ mode: 'test', ok: true, from: A, to: B }], B), null, 'Test zählt nicht');
  assert.equal(U.rollbackTarget([{ mode: 'update', ok: true, from: 'kaputt', to: B }], B), null);
  assert.equal(U.rollbackTarget(null, B), null);
});

test('sicheres Update: Start schreibt den Modus für das Skript, prüft Modus, Rollback-Ziel und laufendes Update', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-start-'));
  await assert.rejects(U.start(d, 'rm -rf'), /Modus/);
  assert.ok(!fs.existsSync(path.join(d, 'logs', 'update-request.json')));
  await assert.rejects(U.start(d, 'rollback'), /نسخة سابقة/);
  // ما في مهمة ولا سكربت بهالمجلد → بيرفض، بس الطلب انكتب
  await assert.rejects(U.start(d, 'test'), /Flamo-Update/);
  const req = JSON.parse(fs.readFileSync(path.join(d, 'logs', 'update-request.json'), 'utf8'));
  assert.equal(req.mode, 'test'); assert.ok(Date.now() - Date.parse(req.at) < 60000);
  fs.writeFileSync(path.join(d, 'logs', 'update-status.json'), '﻿' + JSON.stringify({ state: 'RUNNING', time: new Date().toISOString() }));
  await assert.rejects(U.start(d, 'update'), /شغّال/);
  fs.rmSync(d, { recursive: true, force: true });
});

test('sicheres Update: Code-Prüfung ist für das echte Projekt grün', () => {
  const r = runCheck();
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  assert.ok(r.checked > 100);
});

test('sicheres Update: Code-Prüfung findet Syntaxfehler, fehlende Module und kaputtes JSON', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-check-'));
  fs.writeFileSync(path.join(d, 'server.js'), "'use strict';\nconst x = require('./gut.js');\nfunction f(){ return require('./fehlt.js'); }\n");
  fs.writeFileSync(path.join(d, 'gut.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(d, 'kaputt.js'), 'function (\n');
  fs.writeFileSync(path.join(d, 'seite.mjs'), 'export const a = ;\n');
  fs.writeFileSync(path.join(d, 'menu.json'), '{"a":');
  fs.writeFileSync(path.join(d, 'browser.js'), 'const module = 1; return;\n'); // Browser-Skript ist ok
  const r = runCheck(d), bad = r.failed.map(x => x.file).sort();
  assert.equal(r.ok, false);
  assert.deepEqual(bad, ['fehlt.js', 'kaputt.js', 'menu.json', 'seite.mjs']);
  fs.rmSync(d, { recursive: true, force: true });
});

test('sicheres Update: Backup-Prüfung liest jede Datei', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-bk-'));
  fs.writeFileSync(path.join(d, 'nara-admin.json'), '﻿{"orders":[]}');
  fs.writeFileSync(path.join(d, 'notiz.txt'), 'egal');
  assert.deepEqual(runCheck('--verify-backup', d), { ok: true, files: 1, failed: [] });
  fs.writeFileSync(path.join(d, 'nara-auth.json'), '{kaputt');
  const r = runCheck('--verify-backup', d);
  assert.equal(r.ok, false); assert.equal(r.files, 2); assert.equal(r.failed[0].file, 'nara-auth.json');
  fs.rmSync(d, { recursive: true, force: true });
});

test('sicheres Update: Skript hat alle Schutz-Schritte (Backup, Prüfung vor Neustart, Gesundheit, automatisch zurück, Sperre, Telegram)', () => {
  const ps = fs.readFileSync(path.join(__dirname, '..', 'Flamo-Update.ps1'), 'utf8');
  for (const s of ['function Backup-Data', 'function Restore-Data', 'function Run-Check', 'function Test-Health', 'function Reset-Code', 'function Block-Version', 'function Notify',
    "'update', 'rollback', 'test'", 'update-request.json', 'update-blocked.json', 'update-history.json', "'pull', '--ff-only'", '/api/health', '/kasse.html', '--verify-backup'])
    assert.ok(ps.includes(s), 'fehlt: ' + s);
  // Prüfung kommt VOR dem Stoppen des Servers
  const upd = ps.slice(ps.lastIndexOf('# update'));
  assert.ok(upd.indexOf('Run-Check') < upd.indexOf('Restart-And-Check'));
  assert.ok(upd.indexOf('Backup-Data') < upd.indexOf("'pull', '--ff-only'"));
  const html = fs.readFileSync(path.join(__dirname, '..', 'update.html'), 'utf8');
  for (const s of ["run('update'", "run('test'", "run('rollback'", 'id="hist"', 'id="blocked"']) assert.ok(html.includes(s), 'update.html: ' + s);
});
