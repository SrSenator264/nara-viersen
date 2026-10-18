// Prüft, welche Seiten dreisprachig sind (DE · AR · EN). Nutzung: node scripts/i18n-audit.mjs [--json]
// Eine Seite zählt als „dreisprachig“, wenn sie (selbst oder über ihre eigenen Skripte) nara-lang.js / nara-i18n.js benutzt.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const { PAGE_ROLES } = require('../auth.js');
const NO_NAV = new Set(['driver.html', 'delivery.html', 'join.html', 'pay.html']); // Fahrer-/Kunden-Seiten: eigene Oberfläche
const AR = /[؀-ۿ]/g, DE = /\b(und|nicht|oder|für|Bestellung|Speichern|Löschen|Zurück|Datum|Betrag|Rechnung)\b/g;
const read = f => { try { return readFileSync(new URL(f, root), 'utf8'); } catch { return ''; } };
const scriptsOf = html => [...html.matchAll(/<script[^>]+src="\/?([^"?#]+\.js)/g)].map(m => m[1]).filter(f => existsSync(new URL(f, root)));
const rows = [];
for (const page of Object.keys(PAGE_ROLES).sort()) {
  const html = read(page); if (!html) { rows.push({ page, missing: true }); continue; }
  const code = html + scriptsOf(html).map(read).join('\n');
  const lang = /nara-lang\.js|nara-i18n\.js|NARA_LANG|NARA_I18N/.test(code);
  rows.push({ page, lang, arabicRuns: (code.match(AR) || []).length, germanWords: (code.match(DE) || []).length, nav: !NO_NAV.has(page) });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log((r.missing ? '❌ FEHLT  ' : r.lang ? '✅ 3 Sprachen' : '⚠️  ohne Sprachsystem').padEnd(22), r.page.padEnd(28), r.missing ? '' : `ar-Zeichen:${r.arabicRuns}  de-Wörter:${r.germanWords}`);
