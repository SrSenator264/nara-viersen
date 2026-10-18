'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const G = require('../data-guard.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nara-guard-'));
const quiet = () => {};

test('gesunde Datei wird normal gelesen', () => {
  const d = tmp(), f = path.join(d, 'a.json'); fs.writeFileSync(f, '{"x":1}');
  assert.deepEqual(G.readJsonRecovering(f, { log: quiet }), { data: { x: 1 }, source: 'main' });
});

test('beschädigte Datei → automatisch aus .bak, kaputte Datei bleibt als *.corrupt-* erhalten', () => {
  const d = tmp(), f = path.join(d, 'a.json');
  fs.writeFileSync(f + '.bak', '{"orders":[1,2,3]}'); fs.writeFileSync(f, '{"orders":[1,2,');
  let info = null;
  const r = G.readJsonRecovering(f, { log: quiet, onRecover: x => { info = x; } });
  assert.deepEqual(r.data, { orders: [1, 2, 3] }); assert.equal(r.source, 'a.json.bak');
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { orders: [1, 2, 3] }, 'Hauptdatei ist wieder heil');
  assert.ok(fs.readdirSync(d).some(n => n.startsWith('a.json.corrupt-')), 'Original nicht gelöscht');
  assert.equal(info.from, 'a.json.bak');
});

test('leere Datei (0 Byte, z. B. Stromausfall) → Wiederherstellung', () => {
  const d = tmp(), f = path.join(d, 'a.json'); fs.writeFileSync(f + '.bak', '{"ok":true}'); fs.writeFileSync(f, '');
  assert.deepEqual(G.readJsonRecovering(f, { log: quiet }).data, { ok: true });
});

test('.bak auch kaputt → neuestes Tages-Backup; Validator wird respektiert', () => {
  const d = tmp(), f = path.join(d, 'a.json'), b = path.join(d, 'backups');
  fs.writeFileSync(f, 'garbage'); fs.writeFileSync(f + '.bak', 'also garbage');
  for (const [day, v] of [['2026-10-01', 1], ['2026-10-02', 2], ['2026-10-03', 'invalid']]) {
    fs.mkdirSync(path.join(b, day), { recursive: true }); fs.writeFileSync(path.join(b, day, 'a.json.gz'), zlib.gzipSync(JSON.stringify({ v })));
  }
  const validate = o => { if (typeof o.v !== 'number') throw Error('bad'); };
  const r = G.readJsonRecovering(f, { backupsDir: b, validate, log: quiet });
  assert.equal(r.data.v, 2); assert.equal(r.source, 'backups/2026-10-02');
});

test('nichts lesbar → klarer Fehler (kein stilles Weitermachen mit leeren Daten)', () => {
  const d = tmp(), f = path.join(d, 'a.json'); fs.writeFileSync(f, 'garbage');
  assert.throws(() => G.readJsonRecovering(f, { log: quiet }), e => e.code === 'NO_BACKUP');
  assert.equal(fs.readFileSync(f, 'utf8'), 'garbage', 'Original unberührt');
});

test('fehlende Datei bleibt ENOENT (erster Start ist kein Wiederherstellungsfall)', () => {
  assert.throws(() => G.readJsonRecovering(path.join(tmp(), 'none.json'), { log: quiet }), e => e.code === 'ENOENT');
});

test('Tages-Backup: 1× pro Tag, geprüft, alte Tage werden entfernt', async () => {
  const d = tmp(), f = path.join(d, 'nara-admin.json'), b = path.join(d, 'backups');
  fs.writeFileSync(f, JSON.stringify({ orders: Array.from({ length: 500 }, (_, i) => ({ id: i })) }));
  const day = n => new Date(2026, 9, n, 12).getTime();
  const r1 = await G.dailyBackup([f, path.join(d, 'missing.json')], b, { keep: 3, now: day(1) });
  assert.deepEqual(r1.created, ['nara-admin.json']); assert.deepEqual(r1.errors, []);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(b, '2026-10-01', 'nara-admin.json.gz'))).toString()), JSON.parse(fs.readFileSync(f, 'utf8')));
  const r2 = await G.dailyBackup([f], b, { keep: 3, now: day(1) });
  assert.deepEqual(r2.skipped, ['nara-admin.json']); assert.deepEqual(r2.created, []);
  for (const n of [2, 3, 4, 5]) await G.dailyBackup([f], b, { keep: 3, now: day(n) });
  assert.deepEqual(fs.readdirSync(b).sort(), ['2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepEqual(G.backupInfo(b), { count: 3, last: '2026-10-05' });
});

test('Log-Rotation: große Datei wird kopiert und geleert, kleine bleibt', () => {
  const d = tmp(), f = path.join(d, 'server.log');
  fs.writeFileSync(f, 'x'.repeat(100));
  assert.equal(G.rotateLog(f, { maxBytes: 1000 }), false);
  fs.writeFileSync(f, 'y'.repeat(2000));
  assert.equal(G.rotateLog(f, { maxBytes: 1000, keep: 2 }), true);
  assert.equal(fs.statSync(f).size, 0); assert.equal(fs.readFileSync(f + '.1', 'utf8').length, 2000);
  fs.writeFileSync(f, 'z'.repeat(2000)); G.rotateLog(f, { maxBytes: 1000, keep: 2 });
  assert.equal(fs.readFileSync(f + '.2', 'utf8')[0], 'y'); assert.equal(fs.readFileSync(f + '.1', 'utf8')[0], 'z');
});
