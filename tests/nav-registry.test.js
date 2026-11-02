'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const A = require('../auth.js');
const src = fs.readFileSync(path.join(root, 'flamo-nav.js'), 'utf8');
const L = (de, ar, en) => ({ de, ar, en });
const PAGES = new Function('L', 'return ' + src.match(/const PAGES = (\[[\s\S]*?\n  \]);/)[1])(L);

test('Navigation: jede Seite hat Name in de/ar/en, existiert und hat Rechte', () => {
  assert.ok(PAGES.length >= 20);
  const keys = new Set();
  for (const p of PAGES) {
    assert.ok(!keys.has(p.k), 'doppelter Schlüssel ' + p.k); keys.add(p.k);
    for (const l of ['de', 'ar', 'en']) assert.ok(p.n[l] && p.n[l].trim(), `${p.k}: Name ${l} fehlt`);
    const file = p.f.split('#')[0];
    assert.ok(fs.existsSync(path.join(root, file)), 'Datei fehlt: ' + file);
    if (!file.startsWith('web-prototype/')) assert.ok(A.PAGE_ROLES[file], 'kein PAGE_ROLES-Eintrag: ' + file);
  }
});

test('Navigation: kein Ziel doppelt, Gruppen übersichtlich, Altseiten weg', () => {
  const targets = PAGES.map(p => p.f);
  assert.equal(new Set(targets).size, targets.length, 'zwei Menüpunkte führen auf dieselbe Seite');
  assert.ok(!targets.some(f => f.includes('#')), 'Menüpunkte mit #Anker führen auf dieselbe Seite');
  const groups = src.match(/const GROUPS = (\{[\s\S]*?\n  \});/)[1];
  const keys = [...groups.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]);
  assert.equal(keys.length, 5, 'genau 5 Gruppen');
  for (const g of keys) { const n = PAGES.filter(p => p.g === g).length; assert.ok(n >= 1 && n <= 6, `Gruppe ${g}: ${n} Einträge`); }
  for (const p of PAGES) assert.ok(keys.includes(p.g), p.k + ': unbekannte Gruppe');
  assert.equal(targets.filter(f => f === 'inventory-foundation.html').length, 1, 'Lager/Einkauf/Rechnungen/Dokumente = EIN Menüpunkt (Tabs in der Seite)');
  for (const dead of ['admin.html', 'dashboard.html', 'driver-app-v2.html']) {
    assert.ok(!fs.existsSync(path.join(root, dead)), dead + ' sollte weg sein');
    assert.ok(!targets.includes(dead) && !(dead in A.PAGE_ROLES), dead + ' wird noch referenziert');
  }
});

test('Navigation: Server fügt Seitenleiste ein (nicht in Fahrer-/Kundenseiten)', () => {
  const inject = fs.readFileSync(path.join(root, 'server-auth.js'), 'utf8');
  assert.ok(inject.includes('/flamo-nav.js?v=') && inject.includes('NAV_SKIP'));
  const skip = inject.match(/NAV_SKIP = new Set\(\[([^\]]*)\]/)[1];
  for (const f of ['driver.html', 'delivery.html', 'nara-app.html']) assert.ok(skip.includes(f));
});

test('Aufräumen: gelöschte Altseiten werden nirgends mehr angesprungen', () => {
  for (const dead of ['driver-app.html', 'ledger.html', 'sales-report.html', 'nara-shell.js'])
    assert.ok(!fs.existsSync(path.join(root, dead)), dead + ' sollte weg sein');
  for (const f of Object.keys(A.PAGE_ROLES)) assert.ok(fs.existsSync(path.join(root, f)), 'PAGE_ROLES zeigt auf fehlende Datei: ' + f);
});

test('Sprachen: neue Seiten müssen dreisprachig sein (Altlast steht in i18n-todo.json und darf nur schrumpfen)', () => {
  const todo = JSON.parse(fs.readFileSync(path.join(root, 'i18n-todo.json'), 'utf8'));
  const supports = f => {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    const js = [...html.matchAll(/<script[^>]+src="\/?([^"?#]+\.js)/g)].map(m => m[1]).filter(x => fs.existsSync(path.join(root, x))).map(x => fs.readFileSync(path.join(root, x), 'utf8')).join('\n');
    return /nara-lang\.js|nara-i18n\.js|NARA_LANG|NARA_I18N/.test(html + js);
  };
  for (const f of Object.keys(A.PAGE_ROLES)) {
    if (todo.includes(f)) assert.ok(!supports(f), f + ' ist jetzt dreisprachig → aus i18n-todo.json entfernen');
    else assert.ok(supports(f), f + ' hat kein Sprachsystem (nara-lang.js) und steht nicht in i18n-todo.json');
  }
});
