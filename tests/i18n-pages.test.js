'use strict';
// Seiten mit eigenem Wörterbuch (FT.init): jeder Eintrag muss DE, AR und EN haben, jeder benutzte Schlüssel muss existieren,
// und außerhalb des Wörterbuchs darf kein arabischer Text mehr im Code stehen.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const PAGES = { 'sales.html': [], 'reports.html': ['reports.js'], 'banking.html': [], 'delivery-print.html': [], 'driver-app-v2.html': [], 'dashboard.html': [], 'admin-foundation.html': ['admin-foundation.js','admin-menu-translations.js'], 'accounting.html': ['accounting.js'] };
const S = "'((?:\\\\'|[^'])*)'";
const ENTRY = new RegExp(`(\\w+):\\{de:${S},ar:${S},en:${S}\\}`, 'g');

for (const [page, extra] of Object.entries(PAGES)) {
  test(`i18n ${page}: Wörterbuch vollständig, Schlüssel vorhanden, kein Rest-Arabisch`, () => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /nara-lang\.js/, 'nara-lang.js fehlt');
    assert.match(html, /flamo-t\.js/, 'flamo-t.js fehlt');
    assert.doesNotMatch(html, /<html[^>]*dir="rtl"/, 'dir=rtl darf nicht fest stehen');
    const code = html + extra.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
    const total = (code.match(/\w+:\{de:/g) || []).length;
    const entries = [...code.matchAll(ENTRY)];
    assert.ok(total > 3, 'kein Wörterbuch gefunden');
    assert.equal(entries.length, total, 'Eintrag ohne alle 3 Sprachen (de, ar, en in dieser Reihenfolge)');
    for (const m of entries) for (const i of [2, 3, 4]) assert.ok(m[i].trim(), `leerer Text bei ${m[1]}`);
    const keys = new Set(entries.map(m => m[1]));
    const used = new Set([...code.matchAll(/data-t(?:-ph|-title)?="(\w+)"/g)].map(m => m[1]));
    for (const m of code.matchAll(/(?:FT\.t|[^\w.]t)\('(\w+)'/g)) used.add(m[1]);
    for (const k of used) assert.ok(keys.has(k), `Schlüssel "${k}" fehlt im Wörterbuch`);
    const stripped = code.replace(ENTRY, '');
    const left = stripped.split('\n').filter(l => /[؀-ۿ]/.test(l));
    assert.deepEqual(left, [], 'arabischer Text außerhalb des Wörterbuchs');
  });
}
