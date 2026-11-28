// sprint-features.spec.mjs — E2E für die Features aus dem Nacht-Sprint 2026-11-28 (isolierter Test-Server, leere Daten):
// (a) Küchenkarte zeigt Extras + Allergie rot (.alg)  (b) reports.html: Gewinn-Gleichung + «Rechnung geht auf ✓»
// (c) Plattform-Abrechnung: ingest → Freigabe-Karte #pst-inbox → «Buchen» → APPROVED
// (d) Bank: Auszahlung = gespeicherte Abrechnung → «Alle sicheren Treffer bestätigen» verbindet sie
import { test, expect } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as F from './helpers/flow.mjs';

const CSV = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'uber-payments-sample.csv'));

function apiCaller(request) {
  return async (method, p, body) => {
    const r = await request.fetch(p, { method, data: body });
    let json = null; try { json = await r.json(); } catch { /* kein JSON */ }
    return [r.status(), json];
  };
}
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  return errors;
}
// Abrechnung einmal einspielen (gleiche Datei = Duplikat → gibt die vorhandene ID zurück)
async function ingestUber(call) {
  const [st, body] = await call('POST', '/api/accounting/platform-statements/ingest',
    { filename: 'uber-e2e.csv', mime: 'text/csv', data: CSV.toString('base64'), source: 'upload' });
  expect([200, 201], 'ingest status ' + JSON.stringify(body)).toContain(st);
  return body;
}
async function inbox(call) { return ((await call('GET', '/api/accounting/platform-statements/inbox'))[1] || {}).items || []; }

test.describe.configure({ mode: 'serial' });

test('(a) Küche: Extras sichtbar, Allergie rot', async ({ page, request }) => {
  const call = apiCaller(request), errors = watchErrors(page);
  const order = F.makeOrder({ kind: 'pickup' });
  order.remarks = 'Allergie: Erdnüsse';
  order.cart = [{ ...order.cart[0], options: [{ name: 'Extra Käse', quantity: 1, unitCents: 100, totalCents: 100 }] }];
  const id = await F.importOrder(call, order);
  expect((await F.getKitchenOrder(call, id))?.kitchenNotes).toContain('Erdnüsse');

  await page.goto('/kitchen.html', { waitUntil: 'domcontentloaded' });
  const card = page.locator('.card, [data-id], article').filter({ hasText: F.ITEM_NAME }).filter({ hasText: 'Erdnüsse' }).first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText('Extra Käse');
  const alg = card.locator('.alg').filter({ hasText: 'Erdnüsse' }).first();
  await expect(alg).toBeVisible();
  const color = await alg.evaluate(el => getComputedStyle(el).color);
  const [r, g, b] = color.match(/\d+/g).map(Number);
  expect(r > 120 && r > g * 2 && r > b * 2, 'Allergie rot: ' + color).toBe(true);
  expect(errors).toEqual([]);
});

test('(b) reports.html: «So entsteht der Gewinn» + «Rechnung geht auf ✓»', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { return /lang/i.test(String(k)) ? 'de' : orig.call(this, k); };
  });
  await page.goto('/reports.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('So entsteht der Gewinn').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Rechnung geht auf ✓').first()).toBeVisible();
  await expect(page.getByText('Rechnung geht nicht auf')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('(c) Plattform-Abrechnung: ingest → Karte #pst-inbox → Buchen → APPROVED', async ({ page, request }) => {
  const call = apiCaller(request), errors = watchErrors(page);
  const body = await ingestUber(call);
  const id = body.id;
  expect(id).toBeTruthy();
  expect((await inbox(call)).find(x => x.id === id)?.status).toBe('PENDING_APPROVAL');

  await page.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { return /lang/i.test(String(k)) ? 'de' : orig.call(this, k); };
  });
  await page.goto('/accounting-home.html', { waitUntil: 'domcontentloaded' });
  const box = page.locator('#pst-inbox');
  await expect(box).toBeVisible({ timeout: 20000 });
  page.once('dialog', d => d.accept());
  await box.locator(`[data-pst="approve"][data-id="${id}"]`).click();
  await expect.poll(async () => (await inbox(call)).find(x => x.id === id)?.status, { timeout: 15000 }).toBe('APPROVED');
  await expect(box).toBeHidden({ timeout: 10000 });
  expect(errors).toEqual([]);
});

test('(d) Bank: sichere Treffer mit gespeicherter Abrechnung in einem Klick verbinden', async ({ page, request }) => {
  const call = apiCaller(request), errors = watchErrors(page);
  // Abrechnung muss gespeichert sein (aus (c)); sonst hier selbst freigeben
  const body = await ingestUber(call);
  let rec = (await inbox(call)).find(x => x.id === body.id);
  if (rec && rec.status === 'PENDING_APPROVAL') {
    expect((await call('POST', '/api/accounting/platform-statements/inbox/decide', { id: rec.id, decision: 'approve' }))[0]).toBe(200);
    rec = (await inbox(call)).find(x => x.id === body.id);
  }
  expect(rec?.status).toBe('APPROVED');
  const st = (rec.items || []).map(i => i.statement || {}).find(s => s.payoutCents > 0 && s.periodTo);
  expect(st, 'Abrechnung mit Auszahlung').toBeTruthy();
  // Bankzeile: exakt dieser Betrag, Uber im Text, zwei Tage nach Periodenende
  const d = new Date(String(st.periodTo).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 2);
  const desc = 'Uber Payments B.V. E2E-' + Date.now().toString(36);
  const [bs] = await call('POST', '/api/accounting/bank-transactions',
    { transactions: [{ date: d.toISOString().slice(0, 10), amountCents: st.payoutCents, description: desc }] });
  expect(bs).toBe(201);
  const [, sug] = await call('GET', '/api/accounting/bank-suggestions');
  const tx = ((await call('GET', '/api/accounting/bank-transactions'))[1].transactions || []).find(x => x.description === desc);
  const cand = (sug.suggestions || []).find(s => s.transactionId === tx.id)?.candidates?.[0];
  expect(cand?.entityType).toBe('PLATFORM_STATEMENT');
  expect(cand?.confidence).toBe('high');

  await page.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { return /lang/i.test(String(k)) ? 'de' : orig.call(this, k); };
  });
  await page.goto('/banking.html', { waitUntil: 'domcontentloaded' });
  const btn = page.locator('#sureAll');
  await expect(btn).toBeVisible({ timeout: 20000 });
  await expect(btn).toContainText('Alle sicheren Treffer bestätigen');
  page.once('dialog', dl => dl.accept());
  await btn.click();
  await expect.poll(async () => {
    const t = ((await call('GET', '/api/accounting/bank-transactions'))[1].transactions || []).find(x => x.id === tx.id);
    return t && t.status + ':' + (t.matchedEntityType || '');
  }, { timeout: 15000 }).toBe('MATCHED:PLATFORM_STATEMENT');
  expect(errors).toEqual([]);
});
