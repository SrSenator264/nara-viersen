'use strict';
// restore-owner.cjs — حساب مدير بيرجع "صاحب المحل" (يشتغل محلياً على جهاز المحل والسيرفر مطفي).
// بيشتغل بس إذا ما في ولا صاحب مفعّل. الاستعمال: node scripts/restore-owner.cjs [مجلد-البيانات]
const fs = require('node:fs'), path = require('node:path'), readline = require('node:readline');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'data');
const authFile = path.join(dir, 'nara-auth.json'), adminFile = path.join(dir, 'nara-admin.json');
const store = JSON.parse(fs.readFileSync(authFile, 'utf8'));
let admin = null; try { admin = JSON.parse(fs.readFileSync(adminFile, 'utf8')); } catch { /* egal */ }
const nameOf = id => { const e = ((admin && admin.employees) || []).find(x => x.id === id); return e ? (e.name || e.fullName || id) : id; };
const accounts = Object.entries(store.accounts || {});
if (accounts.some(([, a]) => a.role === 'OWNER' && a.active !== false)) { console.log('Es gibt schon einen Inhaber / في صاحب محل مفعّل أصلاً. ما تغيّر شي.'); process.exit(0); }
const managers = accounts.filter(([, a]) => a.role === 'MANAGER' && a.active !== false);
if (!managers.length) { console.log('Kein Manager gefunden / ما في مدير.'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = [], waiters = [];
rl.on('line', l => { const w = waiters.shift(); if (w) w(l.trim()); else lines.push(l.trim()); });
const ask = q => { process.stdout.write(q); return lines.length ? Promise.resolve(lines.shift()) : new Promise(r => waiters.push(r)); };
(async () => {
  console.log('\nمين بدك يصير صاحب المحل؟ / Wer wird Inhaber?');
  managers.forEach(([id], i) => console.log(`  ${i + 1}) ${nameOf(id)}`));
  const n = managers.length === 1 ? 1 : Number(await ask('\nالرقم / Nummer: '));
  const pick = managers[n - 1];
  if (!pick) { console.log('Ungültig.'); process.exit(1); }
  const [id, acc] = pick;
  fs.copyFileSync(authFile, authFile + '.bak-' + Date.now());
  acc.role = 'OWNER'; acc.active = true;
  for (const [k, s] of Object.entries(store.sessions || {})) if (s.employeeId === id) delete store.sessions[k];
  fs.writeFileSync(authFile, JSON.stringify(store), { mode: 0o600 });
  if (admin && Array.isArray(admin.employees)) {
    const e = admin.employees.find(x => x.id === id);
    if (e) { try { fs.copyFileSync(adminFile, adminFile + '.bak-' + Date.now()); e.role = 'OWNER'; e.updatedAt = new Date().toISOString(); fs.writeFileSync(adminFile, JSON.stringify(admin, null, 2)); } catch (err) { console.log('(سجل الموظف ما انحدّث، مو مشكلة: ' + err.message + ')'); } }
  }
  console.log(`\n✓ ${nameOf(id)} صار صاحب المحل. سجّل دخول من جديد بنفس الـ PIN.`);
  rl.close();
})();
