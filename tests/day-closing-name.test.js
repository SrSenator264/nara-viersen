'use strict';
// الاسم العربي: "تقفيلة اليوم" (مو "تسكيرة"). الألماني Tagesabschluss والإنجليزي Daily closing بيضلوا.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist']);
const EXT = /\.(js|mjs|html|css|md|json|cmd|ps1|txt)$/i;
const OLD = 'تسكيرة'; // الكلمة القديمة (مكتوبة بالرموز عشان هالملف نفسو ما يحتويها)

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

test('ما بقي أي "تسكيرة" بالمستودع', () => {
  const hits = walk(root).filter(f => f !== __filename && fs.readFileSync(f, 'utf8').includes(OLD)).map(f => path.relative(root, f));
  assert.deepEqual(hits, []);
});

test('القائمة: de/ar/en للتقفيلة، والمفتاح close ما تغيّر', () => {
  const src = fs.readFileSync(path.join(root, 'flamo-nav.js'), 'utf8');
  const line = src.split('\n').find(l => l.includes("k: 'close'"));
  assert.ok(line, 'مفتاح close مفقود');
  assert.ok(line.includes("'Tagesabschluss'") && line.includes("'تقفيلة اليوم'") && line.includes("'Daily closing'"));
  assert.ok(line.includes('kasse-settlement.html'));
});

test('عنوان وعنوان رئيسي الصفحة بالعربي: تقفيلة اليوم', () => {
  const src = fs.readFileSync(path.join(root, 'kasse-settlement.js'), 'utf8');
  assert.ok(src.includes("title:'Flamo · تقفيلة اليوم'") && src.includes("h1:'تقفيلة اليوم والحساب"));
  assert.ok(src.includes("title:'Flamo · Tagesabschluss'") && src.includes("title:'Flamo · End of day'"));
});
