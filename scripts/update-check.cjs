'use strict';
// update-check.cjs — فحص سريع للكود قبل ما نوقف السيرفر الشغّال (بيستعمله Flamo-Update.ps1).
// 1) أخطاء صياغة بكل ملفات JS (السيرفر + الصفحات)  2) كل موديولات السيرفر بتتحمّل (require)  3) ملفات JSON المتتبعة سليمة.
// الاستعمال: node scripts/update-check.cjs [مجلد]          → JSON {ok, checked, failed:[{file,error}]}
//            node scripts/update-check.cjs --verify-backup <مجلد> → JSON {ok, files, failed:[...]} (كل نسخ البيانات بتنقرا)
// ما بيكتب ولا ملف، وبيطلع دايماً بـ exit 0 (السكربت بيقرّر من الـ JSON).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { spawnSync } = require('node:child_process');

const out = o => { process.stdout.write(JSON.stringify(o) + '\n'); process.exit(0); };
const msg = e => String((e && e.message) || e).split('\n')[0].slice(0, 200);

if (process.argv[2] === '--verify-backup') {
  const dir = path.resolve(process.argv[3] || '.'), failed = [];
  let files = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      files++;
      try { JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '')); } catch (e) { failed.push({ file: f, error: msg(e) }); }
    }
  } catch (e) { failed.push({ file: dir, error: msg(e) }); }
  out({ ok: failed.length === 0, files, failed });
}

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'logs', 'dist', 'tests', 'android-app', 'vendor', 'backups', 'outputs', 'work', 'tunnel', 'operations', 'web-prototype', 'plans', 'fonts', 'icons', 'brand']);
const failed = [];
let checked = 0;

function files(dir, depth) {
  let list = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (depth < 1 && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) list = list.concat(files(path.join(dir, e.name), depth + 1)); }
    else list.push(path.join(dir, e.name));
  }
  return list;
}

const all = files(root, 0), rel = f => path.relative(root, f).split(path.sep).join('/');
for (const f of all) {
  const r = rel(f);
  try {
    if (f.endsWith('.js') || f.endsWith('.cjs')) {
      // compileFunction = صياغة بس، ما بينفّذ شي (بيقبل return بأعلى الملف متل CommonJS)
      vm.compileFunction(fs.readFileSync(f, 'utf8').replace(/^#!.*/, '').replace(/^﻿/, ''), [], { filename: r });
      checked++;
    } else if (f.endsWith('.mjs')) {
      const p = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 20000 });
      if (p.status !== 0) throw new Error((p.stderr || p.error || 'node --check failed').toString().split('\n').filter(Boolean).slice(-1)[0]);
      checked++;
    } else if (f.endsWith('.json') && path.dirname(f) === root) {
      JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
      checked++;
    }
  } catch (e) { failed.push({ file: r, error: msg(e) }); }
}

// موديولات السيرفر (حتى اللي بتتحمّل بس وقت الحاجة، متل الدفع أو التقفيلة): لازم كلها تتحمّل
const mods = new Set();
for (const s of ['server.js', 'server-auth.js']) {
  let src = ''; try { src = fs.readFileSync(path.join(root, s), 'utf8'); } catch { continue; }
  for (const m of src.matchAll(/require\('\.\/([^'/]+?)(\.js)?'\)/g)) if (m[1] !== 'server') mods.add(m[1] + '.js');
}
for (const m of [...mods].sort()) {
  try { require(path.join(root, m)); checked++; } catch (e) { failed.push({ file: m, error: 'require: ' + msg(e) }); }
}

out({ ok: failed.length === 0, checked, failed });
