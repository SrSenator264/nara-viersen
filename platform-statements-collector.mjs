// platform-statements-collector.mjs — Schritt 3: Plattform-Abrechnungen selbst abholen. Getrennt von den Bestell-Brücken.
//   • nutzt NUR gespeicherte Sitzungen (Playwright-storageState-Dateien pro Plattform), loggt sich nie selbst ein
//     und schreibt keine Sitzung zurück; eigenes, frisches Browser-Profil (die Live-Brücken werden nicht berührt)
//   • holt neue Abrechnungen (PDF/CSV) und schickt sie an POST /api/accounting/platform-statements/ingest
//     → der Inhaber gibt sie per Telegram frei (✅/✖), erst dann wird gebucht
//   • Sitzung abgelaufen / 2FA verlangt / keine Sitzung → für diese Plattform ruhig aufhören + Telegram-Hinweis über den Server
// Aufruf:  node platform-statements-collector.mjs [--config platform-collector.config.json] [--dry-run]
// Konfiguration: platform-collector.config.example.json kopieren (keine Geheimnisse darin; Service-Schlüssel nur per Umgebung NARA_SERVICE_KEY).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MIME = { '.pdf': 'application/pdf', '.csv': 'text/csv', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const rx = s => (s ? new RegExp(s, 'i') : null);

export function loadState(file) { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return { links: j.links || {}, hashes: j.hashes || {} }; } catch { return { links: {}, hashes: {} }; } }
export function saveState(file, st) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(st, null, 1)); fs.renameSync(file + '.tmp', file); }

function filenameOf(res, href, fallbackExt) {
  const cd = String((res.headers()['content-disposition']) || '');
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  let name = m ? decodeURIComponent(m[1]) : path.basename(new URL(href).pathname) || 'statement';
  if (!path.extname(name) && fallbackExt) name += fallbackExt;
  return name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
}
async function visible(page, selector) {
  if (!selector) return false;
  try { return await page.locator(selector).first().isVisible({ timeout: 800 }); } catch { return false; }
}

// Eine Plattform: Seite mit Abrechnungen öffnen, Sitzung prüfen, neue Dateien hochladen.
export async function collectPlatform(browser, p, { post, alert, state, maxPerRun = 5, dryRun = false, log = () => {} }) {
  const id = String(p.id || '').toUpperCase();
  if (!p.session || !fs.existsSync(p.session)) { await alert(id, 'NO_SESSION'); return { id, status: 'NO_SESSION', sent: 0 }; }
  const ctx = await browser.newContext({ storageState: p.session, acceptDownloads: true });
  try {
    const page = await ctx.newPage();
    await page.goto(p.statementsUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    // 2FA zuerst (2FA-Seiten haben oft auch ein Passwort-ähnliches Feld), dann abgelaufene Sitzung
    if ((rx(p.twoFactorUrlPattern) && rx(p.twoFactorUrlPattern).test(page.url())) || await visible(page, p.twoFactorSelector)) { await alert(id, 'TWO_FACTOR'); return { id, status: 'TWO_FACTOR', sent: 0 }; }
    if ((rx(p.loginUrlPattern) && rx(p.loginUrlPattern).test(page.url())) || await visible(page, p.loginSelector)) { await alert(id, 'SESSION_EXPIRED'); return { id, status: 'SESSION_EXPIRED', sent: 0 }; }
    const links = await page.$$eval(p.linkSelector || 'a[href$=".pdf"],a[href$=".csv"]', els => els.map(e => ({ href: e.href || '', text: (e.textContent || '').trim().slice(0, 80) })).filter(x => x.href));
    let sent = 0, skipped = 0;
    for (const l of links) {
      if (sent >= maxPerRun) break;
      const key = id + '|' + l.href;
      if (state.links[key]) { skipped++; continue; }
      const res = await ctx.request.get(l.href, { timeout: 60000 });
      const type = String(res.headers()['content-type'] || '');
      if (!res.ok() || /text\/html/i.test(type)) { // Umleitung auf Login statt Datei = Sitzung abgelaufen
        if (/text\/html/i.test(type)) { await alert(id, 'SESSION_EXPIRED'); return { id, status: 'SESSION_EXPIRED', sent }; }
        log(`[${id}] ${l.href} → HTTP ${res.status()}`); continue;
      }
      const buf = Buffer.from(await res.body()), hash = sha256(buf);
      if (state.hashes[hash]) { state.links[key] = hash; skipped++; continue; }
      const ext = /pdf/i.test(type) ? '.pdf' : /csv/i.test(type) ? '.csv' : '';
      const filename = filenameOf(res, l.href, ext), mime = MIME[path.extname(filename).toLowerCase()] || type.split(';')[0] || 'application/octet-stream';
      if (dryRun) { log(`[${id}] würde senden: ${filename} (${buf.length} B)`); sent++; continue; }
      const r = await post({ filename, mime, data: buf.toString('base64'), platform: id, source: 'COLLECTOR' });
      if (r && (r.status === 200 || r.status === 201)) { state.links[key] = hash; state.hashes[hash] = new Date().toISOString(); sent++; }
      else log(`[${id}] Upload abgelehnt: ${filename} → ${r && r.status}`);
    }
    return { id, status: 'OK', sent, skipped, found: links.length };
  } catch (e) {
    await alert(id, 'ERROR');
    return { id, status: 'ERROR', sent: 0, error: String(e && e.message).slice(0, 200) };
  } finally { await ctx.close().catch(() => {}); }
}

export async function runCollector(cfg, { browser, fetchImpl = fetch, log = console.log, dryRun = false, serviceKey = process.env.NARA_SERVICE_KEY || '' } = {}) {
  const server = String(cfg.server || process.env.NARA_BASE_URL || 'http://127.0.0.1:4185').replace(/\/$/, '');
  const headers = { 'content-type': 'application/json', ...(serviceKey ? { 'x-nara-service-key': serviceKey } : {}) };
  const call = async (p, body) => { try { const r = await fetchImpl(server + p, { method: 'POST', headers, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; } catch (e) { log('Server nicht erreichbar: ' + e.message); return null; } };
  const post = body => call('/api/accounting/platform-statements/ingest', body);
  const alert = (platform, type) => (dryRun ? (log(`[${platform}] Hinweis: ${type}`), null) : call('/api/accounting/platform-statements/collector-alert', { platform, type }));
  const stateFile = path.resolve(cfg.baseDir || HERE, cfg.stateFile || 'data/collector-state.json');
  const state = loadState(stateFile), out = [];
  for (const p of (cfg.platforms || []).filter(x => x && x.enabled)) {
    const r = await collectPlatform(browser, p, { post, alert, state, maxPerRun: Number(cfg.maxPerRun) || 5, dryRun, log });
    log(`[${r.id}] ${r.status} · gesendet ${r.sent}${r.skipped ? ' · schon bekannt ' + r.skipped : ''}${r.error ? ' · ' + r.error : ''}`);
    out.push(r);
  }
  if (!dryRun) saveState(stateFile, state);
  return out;
}

// Kommandozeile
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), dryRun = args.includes('--dry-run');
  const ci = args.indexOf('--config'), cfgFile = path.resolve(ci >= 0 ? args[ci + 1] : path.join(HERE, 'platform-collector.config.json'));
  if (!fs.existsSync(cfgFile)) { console.error('Konfiguration fehlt: ' + cfgFile + ' (Vorlage: platform-collector.config.example.json)'); process.exit(2); }
  const cfg = { baseDir: path.dirname(cfgFile), ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) };
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.FLAMO_PW_CHANNEL ? { channel: process.env.FLAMO_PW_CHANNEL } : {}) });
  try { await runCollector(cfg, { browser, dryRun }); } finally { await browser.close(); }
}
