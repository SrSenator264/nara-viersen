// scripts/tse-setup.mjs — التهيئة الأولى للـ Swissbit TSE (مرة وحدة بالعمر!).
// تشغيل:  node scripts/tse-setup.mjs --mount D: --seed <الـ seed من البائع/Swissbit>
// ⚠️ على فيرمويره 1.x الـ PUK بيتبلوك للأبد بعد 3 محاولات غلط. السكربت بيوقف عند أول خطأ وما بيكرر.
// بيولّد PIN/PUK عشوائيين، بيحفظهم بـ data/tse-credentials.json (خارج GitHub) قبل ما يلمس الـ USB، وبيطبعهم لتكتبهم على ورقة.
import { createRequire } from 'node:module';
import readline from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { setup, makeApi, defaultDll } = require(path.join(root, 'tse-swissbit.js'));

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const mount = arg('--mount') || process.env.NARA_TSE_PATH || '';
const seed = arg('--seed');
if (!mount || !seed) { console.error('Usage: node scripts/tse-setup.mjs --mount D: --seed <seed>'); process.exit(1); }

console.log('\n⚠️  TSE-Ersteinrichtung auf ' + mount);
console.log('   - Passiert nur EINMAL, nicht rückgängig zu machen (PIN/PUK werden gesetzt).');
console.log('   - Falscher Seed = ein verbrauchter PUK-Versuch von nur 3. Bei Fehler hört das Skript sofort auf.');
console.log('   - Danach PIN/PUK sofort auf Papier schreiben und die Datei data/tse-credentials.json sichern.\n');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ok = (await rl.question('Zum Fortfahren SETUP tippen: ')).trim();
rl.close();
if (ok !== 'SETUP') { console.log('Abgebrochen. Nichts geändert.'); process.exit(0); }

try {
  const api = makeApi(defaultDll(path.join(root, 'tse-sdk')));
  const { creds, info } = await setup({ api, mount, seed });
  console.log('\n✅ TSE eingerichtet. Seriennummer:', info.serialHex);
  console.log('\n===== AUF PAPIER SCHREIBEN (und Datei sichern) =====');
  console.log('Admin-PIN     :', creds.adminPin);
  console.log('Admin-PUK     :', creds.adminPuk);
  console.log('TimeAdmin-PIN :', creds.timeAdminPin);
  console.log('Kasse (Client):', creds.clientId);
  console.log('Datei         : data/tse-credentials.json');
  console.log('====================================================');
} catch (e) {
  console.error('\n❌ Abbruch:', e.message);
  console.error('Nichts wiederholen, bis die Ursache klar ist (PUK-Schutz). Zugangsdaten-Datei bleibt erhalten.');
  process.exit(1);
}
