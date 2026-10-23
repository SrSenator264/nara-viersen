// server-harness.mjs — بيشغّل نسخة معزولة من Flamo للاختبارات.
//   • بينسخ الكود لمجلد مؤقت (بدون data/.env/node_modules) → بيانات فاضية، ما بنلمس بيانات المطعم.
//   • منفذ 4199، بدون مراقبة/جيوكودينغ/مفاتيح AI، والطباعة بلا طابعات مضبوطة.
//   • بيضل شغال لحد ما Playwright يوقفه (webServer)، أو استعمله من الاختبارات: import { startTestServer }.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_PORT, E2E_KEY, E2E_BASE_URL, E2E_DRIVER_ID } from './e2e-env.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_TOP = new Set(['node_modules', '.git', 'data', 'logs', 'dist', 'web-prototype', 'android-app', 'tests', 'tunnel',
  'pw-profile', 'test-results', 'playwright-report', '.env', '.nara-ocr-venv', '.nara-ocr-venv-fixed', 'local-ocr-output']);
const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|GEMINI|GROQ|OPENAI|DEEPSEEK|FCM|WISE|QONTO|^NARA_|^AI_PROVIDER$/i;

export function prepareCopy() {
  const dir = path.join(os.tmpdir(), 'flamo-e2e-run');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(REPO, dir, {
    recursive: true,
    filter: src => {
      const rel = path.relative(REPO, src);
      if (!rel) return true;
      const top = rel.split(path.sep)[0];
      return !SKIP_TOP.has(top) && !/^checkpoint/.test(top) && !/^\.nara-ocr-venv/.test(top);
    },
  });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  // سائق تجريبي جاهز (بيانات فاضية غير هيك): بيطلع بخطوة التوزيع
  fs.writeFileSync(path.join(dir, 'data', 'nara-admin.json'), JSON.stringify({
    schemaVersion: 8,
    employees: [{ id: E2E_DRIVER_ID, name: 'E2E Fahrer', role: 'DRIVER', active: true }],
  }));
  return dir;
}

async function waitReady(timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(E2E_BASE_URL + '/kasse.html'); if (r.ok) return; } catch { /* لسا ما قام */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Flamo test server did not start in time');
}

export async function startTestServer() {
  const dir = prepareCopy();
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  Object.assign(env, {
    PORT: String(E2E_PORT), HOST: '127.0.0.1', NODE_ENV: 'test',
    NARA_MANAGER_KEY: E2E_KEY, NARA_NO_MONITOR: '1', NARA_GEOCODE: 'off',
  });
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  child.on('exit', code => { if (code) console.error('[e2e-server] exited', code, '\n' + log.slice(-1500)); });
  try { await waitReady(); } catch (e) { child.kill(); throw new Error(e.message + '\n' + log.slice(-1500)); }
  const stop = () => { try { child.kill(); } catch { /* ok */ } };
  return { dir, child, stop, baseUrl: E2E_BASE_URL };
}

// تشغيل مباشر (Playwright webServer): نضل شغالين لحد الإيقاف.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startTestServer();
  console.log('Flamo E2E server ready at ' + s.baseUrl + '  (data: ' + s.dir + ')');
  const bye = () => { s.stop(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
  s.child.on('exit', () => process.exit(1));
}
