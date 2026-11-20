'use strict';
// nightly-e2e.cjs — كل ليلة بيشغّل اختبارات Playwright (سيرفر تجريبي معزول، ما بيلمس النظام الحقيقي) وبيبعت الملخص على Telegram.
// التشغيل اليدوي: node scripts/nightly-e2e.cjs     الجدولة: Flamo-Nightly-Tests-Einrichten.cmd
// بيقرأ TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID من .env (نفس تنبيهات المحل). بدون إعدادات: بس طباعة.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..');
try { for (const l of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_) {}
const alerts = require('../alerts.js').create();
const isWin = process.platform === 'win32';
let out = '';
const p = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'test:e2e'], { cwd: root, shell: isWin });
const kill = setTimeout(() => { out += '\n[TIMEOUT 20 min]'; p.kill(); }, 20 * 60000);
p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
p.on('error', e => { out += String(e.message); });
p.on('close', async code => {
  clearTimeout(kill);
  const tail = out.trim().split(/\r?\n/).slice(-12).join('\n').slice(-1200);
  const text = code === 0 ? '🌙 اختبارات الليل (Flamo): كلها نجحت ✅' : `🌙 اختبارات الليل (Flamo) فشلت ❌ (code ${code})\n${tail}`;
  console.log(text);
  await alerts.send('nightly-e2e', text, { force: true, level: code === 0 ? 'info' : 'warn' });
  process.exit(code === 0 ? 0 : 1);
});
