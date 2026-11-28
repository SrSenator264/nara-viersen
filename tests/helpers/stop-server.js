'use strict';
// Windows: a killed test server keeps its temp folder locked for a moment (its cwd is inside it),
// so fs.rmSync right after proc.kill() fails with EPERM. Wait for the exit first, then delete.
// Temp cleanup never fails a test: after the retries the folder is simply left in %TEMP%.
const fs = require('node:fs');

function waitExit(proc, ms) {
  return new Promise(resolve => {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return resolve();
    const timer = setTimeout(resolve, ms);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
    try { proc.kill(); } catch { clearTimeout(timer); resolve(); }
  });
}

async function stopServer(proc, dir) {
  await waitExit(proc, 5000);
  if (!dir) return;
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch (e) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(e.code)) throw e;
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

module.exports = { stopServer };
