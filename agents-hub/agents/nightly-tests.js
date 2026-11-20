'use strict';
// nightly-tests.js — startet jede Nacht die Tests (Standard: Playwright e2e) und schickt eine Zusammenfassung. Ohne Shell, mit Zeitlimit.
const { spawn } = require('child_process');
function runCmd(cmd, args, cwd, ms) {
  return new Promise(res => {
    let out = '', done = false; const p = spawn(cmd, args, { cwd, shell: false });
    const t = setTimeout(() => { if (!done) { p.kill('SIGKILL'); out += '\n[TIMEOUT]'; } }, ms);
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('error', e => { done = true; clearTimeout(t); res({ code: -1, out: String(e.message) }); });
    p.on('close', code => { done = true; clearTimeout(t); res({ code, out }); });
  });
}
function create({ cmd = 'npm run test:e2e', cwd = process.cwd(), dailyAt = '03:00', timeoutMs = 20 * 60000, run = runCmd } = {}) {
  const [bin, ...args] = cmd.trim().split(/\s+/);
  return {
    name: 'nightly-tests', title: 'المبرمج الليلي (اختبارات)', dailyAt, maxRunsPerDay: 2,
    async run(ctx) {
      const r = await run(bin, args, cwd, timeoutMs), tail = r.out.trim().split('\n').slice(-12).join('\n').slice(-1200);
      if (r.code === 0) { await ctx.notify('ok', '🌙 اختبارات الليل: كلها نجحت ✅', { force: true }); return { summary: 'pass' }; }
      await ctx.notify('fail', `🌙 اختبارات الليل فشلت ❌ (code ${r.code})\n${tail}`, { force: true });
      return { summary: 'fail' };
    },
  };
}
module.exports = { create, runCmd };
