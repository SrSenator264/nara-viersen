'use strict';
// Beleg-Backup: inkrementell, nie löschen, Unterordner, manifest (sha256), Spiegel; im Monitor einmal pro Tag.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const G = require('../data-guard.js'), M = require('../monitor.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nara-docbk-'));
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

test('erste Kopie alles, zweite nur Neues/Geändertes, gelöschte Belege bleiben, Unterordner, manifest', async () => {
  const src = tmp(), dst = tmp();
  write(src, 'doc_a.pdf', 'AAA'); write(src, 'platforms/p1.pdf', 'PPP');
  let r = await G.mirrorFiles(src, dst);
  assert.equal(r.copied, 2); assert.equal(r.total, 2); assert.deepEqual(r.errors, []);
  assert.equal(fs.readFileSync(path.join(dst, 'platforms', 'p1.pdf'), 'utf8'), 'PPP');

  r = await G.mirrorFiles(src, dst); assert.equal(r.copied, 0); // nichts Neues
  write(src, 'doc_b.jpg', 'BB'); write(src, 'doc_a.pdf', 'AAAA'); fs.rmSync(path.join(src, 'platforms', 'p1.pdf'));
  r = await G.mirrorFiles(src, dst);
  assert.equal(r.copied, 2); assert.equal(r.total, 3);
  assert.equal(fs.readFileSync(path.join(dst, 'doc_a.pdf'), 'utf8'), 'AAAA');
  assert.ok(fs.existsSync(path.join(dst, 'platforms', 'p1.pdf'))); // nie löschen

  const man = JSON.parse(fs.readFileSync(path.join(dst, 'manifest.json'), 'utf8'));
  const byName = Object.fromEntries(man.files.map(f => [f.file, f]));
  assert.deepEqual(Object.keys(byName).sort(), ['doc_a.pdf', 'doc_b.jpg', 'platforms/p1.pdf']);
  assert.equal(byName['doc_b.jpg'].sha256, sha('BB')); assert.equal(byName['doc_b.jpg'].size, 2);
  assert.ok(!fs.readdirSync(dst).some(f => f.endsWith('.part')));
});

test('Quelle fehlt → nichts, kein Fehler; Ziel nicht schreibbar → Fehler', async () => {
  const r = await G.mirrorFiles(path.join(tmp(), 'gibts-nicht'), tmp());
  assert.equal(r.copied, 0); assert.deepEqual(r.errors, []);
  const src = tmp(); write(src, 'a.pdf', 'x');
  const blocker = path.join(tmp(), 'file'); fs.writeFileSync(blocker, 'x'); // Ziel ist eine Datei → mkdir schlägt fehl
  const bad = await G.mirrorFiles(src, path.join(blocker, 'sub'));
  assert.ok(bad.errors.length > 0);
});

test('Monitor: Beleg-Backup einmal pro Tag, mit Spiegel, Fehler gehen in backupError', async () => {
  const root = tmp(), dataDir = path.join(root, 'data'), backupsDir = path.join(root, 'backups'), mirror = path.join(root, 'mirror');
  fs.mkdirSync(dataDir, { recursive: true }); write(dataDir, 'documents/doc_1.pdf', 'D1'); fs.writeFileSync(path.join(dataDir, 'nara-admin.json'), '{}');
  let calls = 0; const guard = { ...G, mirrorFiles: async (...a) => { calls++; return G.mirrorFiles(...a); } };
  const m = M.create({ alerts: { configured: () => false, recent: () => [], send: async () => {} }, dataFile: path.join(dataDir, 'nara-admin.json'), dataDir, backupsDir, guard, env: { NARA_BACKUP_MIRROR_DIR: mirror }, log: () => {} });
  assert.equal(await m.runBackup(), null);
  assert.equal(fs.readFileSync(path.join(root, 'backups-documents', 'doc_1.pdf'), 'utf8'), 'D1');
  assert.equal(fs.readFileSync(path.join(mirror, 'documents', 'doc_1.pdf'), 'utf8'), 'D1');
  const s = m.snapshot().backups.documents;
  assert.equal(s.files, 1); assert.equal(s.copied, 1); assert.deepEqual(s.mirror, { files: 1, copied: 1 });
  await m.runBackup(); assert.equal(calls, 2); // gleicher Tag → nicht nochmal (2 = lokal + Spiegel beim ersten Lauf)

  const blocker = path.join(root, 'x'); fs.writeFileSync(blocker, 'x');
  const m2 = M.create({ alerts: { configured: () => false, recent: () => [], send: async () => {} }, dataFile: path.join(dataDir, 'nara-admin.json'), dataDir, backupsDir, guard: G, env: { NARA_BACKUP_MIRROR_DIR: path.join(blocker, 'sub') }, log: () => {} });
  assert.match(await m2.runBackup(), /Spiegel documents/);
});
