// pages-audit.spec.mjs — die wichtigsten Seiten in DE · AR · EN (Desktop + Handy, siehe playwright.config.mjs):
// keine JS-Fehler, keine Console-Fehler, keine 4xx/5xx vom eigenen Server, Arabisch = RTL, Handy ohne seitliches Scrollen.
import { test, expect } from 'playwright/test';

const PAGES = ['kasse.html', 'kitchen.html', 'live-orders.html', 'accounting-home.html', 'accounting.html', 'accounting-agent.html',
  'banking.html', 'reports.html', 'kasse-settlement.html', 'manager.html', 'ai-control.html', 'inventory-foundation.html', 'web-prototype/c.html'];
// bewusst erlaubt: optionale Datei, die builder.js (web-prototype/builder/ — nicht anfassen) selbst nachlädt und still ignoriert
const ALLOWED_404 = [/\/web-prototype\/builder\/layers\.json$/];

test.beforeEach(async ({ page }) => {
  // Erinnerungen (Brot/Loco/Fleisch) legen sich sonst über die Kasse
  await page.addInitScript(() => { for (const id of ['bread', 'loco', 'meat']) localStorage.setItem('flamo-rem-snooze-' + id, String(Date.now() + 3600000)); });
});

for (const lang of ['de', 'ar', 'en']) {
  for (const name of PAGES) {
    test(`${name} · ${lang}: ohne Fehler`, async ({ page, baseURL }, info) => {
      await page.addInitScript(l => {
        const orig = Storage.prototype.getItem;
        Storage.prototype.getItem = function (k) { return /lang/i.test(String(k)) ? l : orig.call(this, k); };
      }, lang);
      const errors = [], consoleErrors = [], bad = [];
      page.on('pageerror', e => errors.push(String(e.message || e)));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
      page.on('response', r => {
        const u = r.url();
        if (u.startsWith(baseURL) && r.status() >= 400 && !ALLOWED_404.some(rx => rx.test(new URL(u).pathname))) bad.push(r.status() + ' ' + new URL(u).pathname);
      });
      const res = await page.goto('/' + name, { waitUntil: 'domcontentloaded' });
      expect(res && res.status(), 'HTTP').toBeLessThan(400);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); // manche Seiten pollen dauernd
      await page.waitForTimeout(800);
      expect(errors, 'JS-Fehler').toEqual([]);
      expect(consoleErrors, 'Console-Fehler').toEqual([]);
      expect(bad, 'eigene 4xx/5xx').toEqual([]);
      if (lang === 'ar') expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction), 'Arabisch = RTL').toBe('rtl');
      if (info.project.name === 'mobile') {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, 'Handy: seitliches Scrollen (px)').toBeLessThanOrEqual(2);
      }
    });
  }
}
