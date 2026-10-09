'use strict';
// reset-owner-pin.cjs — PIN vom Inhaber/Manager neu setzen, wenn er vergessen wurde.
// Läuft NUR lokal auf diesem PC (wer Zugriff auf den data-Ordner hat, ist der Besitzer).
// Der Server muss dabei aus sein (NARA-PIN-Reset.cmd stoppt und startet ihn).
const fs = require('node:fs'), path = require('node:path'), readline = require('node:readline');
const A = require('../auth.js');
const dir = path.join(__dirname, '..', 'data');
const authFile = path.join(dir, 'nara-auth.json'), adminFile = path.join(dir, 'nara-admin.json');

const store = JSON.parse(fs.readFileSync(authFile, 'utf8'));
let employees = [];
try { employees = JSON.parse(fs.readFileSync(adminFile, 'utf8')).employees || []; } catch { /* egal */ }
const nameOf = id => { const e = employees.find(x => x.id === id); return e ? (e.name || e.fullName || id) : id; };
const managers = Object.entries(store.accounts || {}).filter(([, a]) => A.MANAGERS.includes(a.role));
if (!managers.length) { console.log('Kein Inhaber/Manager gefunden. Bitte NARA öffnen und neu einrichten.'); process.exit(1); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = [], waiters = [];
rl.on('line', l => { const w = waiters.shift(); if (w) w(l.trim()); else lines.push(l.trim()); });
const ask = q => { process.stdout.write(q); return lines.length ? Promise.resolve(lines.shift()) : new Promise(r => waiters.push(r)); };
(async () => {
  console.log('\nKonten / الحسابات:');
  managers.forEach(([id, a], i) => console.log(`  ${i + 1}) ${nameOf(id)}  [${a.role}]`));
  const n = managers.length === 1 ? 1 : Number(await ask('\nNummer wählen / اختار الرقم: '));
  const pick = managers[n - 1];
  if (!pick) { console.log('Ungültig.'); process.exit(1); }
  const [id, acc] = pick;
  console.log(`\nNeuer PIN für ${nameOf(id)} (${acc.role}). Mindestens 6 Ziffern, nicht 123456 / 000000.`);
  const p1 = await ask('Neuer PIN / الرمز الجديد: ');
  const err = A.validatePin(acc.role, p1);
  if (err) { console.log('✗ ' + err); process.exit(1); }
  const p2 = await ask('Nochmal / أعد كتابته: ');
  if (p1 !== p2) { console.log('✗ Nicht gleich / مش متطابق'); process.exit(1); }
  fs.copyFileSync(authFile, authFile + '.bak-' + Date.now());
  acc.pin = A.hashPin(p1); acc.active = true;
  for (const [k, s] of Object.entries(store.sessions || {})) if (s.employeeId === id) delete store.sessions[k];
  fs.writeFileSync(authFile, JSON.stringify(store), { mode: 0o600 });
  console.log(`\n✓ PIN geändert für ${nameOf(id)}. Jetzt mit dem neuen PIN einloggen.`);
  rl.close();
})();
