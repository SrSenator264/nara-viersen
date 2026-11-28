// pages-audit-more.spec.mjs — zweite Runde Seiten-Check (gleiches Muster wie pages-audit.spec.mjs) in DE · AR · EN, Desktop + Handy:
// keine JS-Fehler, keine Console-Fehler, keine 4xx/5xx vom eigenen Server, Arabisch = RTL, Handy ohne seitliches Scrollen,
// und die Schrift fällt nicht auf Serif zurück (flamo-font.css Sicherheitsnetz).
import { test, expect } from 'playwright/test';

const PAGES = ['dispatch.html', 'driver.html', 'delivery.html', 'customers.html', 'customer-book.html', 'reminders.html',
  'team.html', 'staff.html', 'status.html', 'sales.html', 'admin-foundation.html', 'reception.html', 'update.html',
  'anleitung.html', 'menu-anleitung.html'];
const ALLOWED_404 = [/\/web-prototype\/builder\/layers\.json$/];

test.beforeEach(async ({ page }) => {
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
      // CORS-/Netz-Meldungen fremder Dienste (z. B. OSRM-Routen in dispatch.html, mit Rückfall auf Luftlinie) zählen nicht als eigener Fehler
      const foreign = t => /has been blocked by CORS policy/.test(t) && !t.includes("fetch at '" + baseURL);
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !foreign(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
      page.on('response', r => {
        const u = r.url();
        if (u.startsWith(baseURL) && r.status() >= 400 && !ALLOWED_404.some(rx => rx.test(new URL(u).pathname))) bad.push(r.status() + ' ' + new URL(u).pathname);
      });
      const res = await page.goto('/' + name, { waitUntil: 'domcontentloaded' });
      expect(res && res.status(), 'HTTP').toBeLessThan(400);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(800);
      expect(errors, 'JS-Fehler').toEqual([]);
      expect(consoleErrors, 'Console-Fehler').toEqual([]);
      expect(bad, 'eigene 4xx/5xx').toEqual([]);
      if (lang === 'ar') expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction), 'Arabisch = RTL').toBe('rtl');
      const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      expect(font, 'Schrift ohne Serif-Rückfall').not.toMatch(/^\s*(FlamoAr\s*,\s*)?serif\s*$/i);
      if (info.project.name === 'mobile') {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, 'Handy: seitliches Scrollen (px)').toBeLessThanOrEqual(2);
      }
    });
  }
}
