'use strict';
// reception.html (Annahme-Tablet): Logik der Seite ohne Browser – kleines Fake-DOM in einer vm, keine Abhängigkeiten.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'reception.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

class El {
  constructor() { this.textContent = ''; this.innerHTML = ''; this.style = {}; this.dataset = {}; this.value = ''; this.disabled = false; this.handlers = {}; this.cls = new Set(); }
  get classList() { return { toggle: (c, f) => ((f === undefined ? !this.cls.has(c) : f) ? this.cls.add(c) : this.cls.delete(c)), contains: c => this.cls.has(c) }; }
  addEventListener(t, f) { (this.handlers[t] ||= []).push(f); }
  querySelector() { return new El(); }
}

function boot({ lang = 'de', orders = [] } = {}) {
  const state = { orders, posts: [], times: [], stages: [], tones: 0, lang, acceptStatus: 200 };
  const els = {}, intervals = [], winHandlers = {}, docHandlers = {};
  const $ = s => (els[s] ||= new El());
  const document = { title: 'Plattformen · Flamo', documentElement: { lang: 'de' }, querySelector: s => $(s), querySelectorAll: () => [], addEventListener: (t, f) => { (docHandlers[t] ||= []).push(f); } };
  const store = {};
  const win = {
    document, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    NARA_LANG: { get: () => state.lang, mountSwitcher() {}, pick: s => s },
    AudioContext: class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); }
      createOscillator() { state.tones++; return { frequency: {}, connect() {}, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; } },
    addEventListener: (t, f) => { (winHandlers[t] ||= []).push(f); },
  };
  win.window = win;
  const fetchStub = async (url, opts) => {
    const u = String(url), body = opts && opts.body ? JSON.parse(opts.body) : {};
    const find = id => state.orders.find(x => x.id === id);
    const res = (ok, status, json) => ({ ok, status, json: async () => json });
    if (u.includes('/board')) {
      const counts = { WAIT: 0, PREPARE: 0, HANDOVER: 0, DONE: 0 }; for (const o of state.orders) counts[o.stage || 'WAIT']++;
      return res(true, 200, { ok: true, counts, count: counts.WAIT, orders: state.orders.map(o => ({ stage: 'WAIT', ...o })) });
    }
    if (u.includes('/accept')) { state.posts.push(body); if (state.acceptStatus < 400) { const o = find(body.orderId); if (o) o.state = 'ACCEPTING'; } return res(state.acceptStatus < 400, state.acceptStatus, state.acceptStatus < 400 ? { ok: true, state: 'ACCEPTING' } : { error: 'Wird bereits angenommen' }); }
    if (u.includes('/times')) { state.times.push(body); const o = find(body.orderId); if (o) { o.prepMinutes = body.prepMinutes; o.deliveryMinutes = body.deliveryMinutes; } return res(true, 200, { ok: true }); }
    if (u.includes('/stage')) { state.stages.push(body); const o = find(body.orderId); if (o) o.stage = body.stage; return res(true, 200, { ok: true }); }
    return res(false, 404, {});
  };
  const ctx = vm.createContext({ ...win, window: win, localStorage: win.localStorage, fetch: fetchStub, console, Date, JSON, Math, Number, String, Object, Array, Set, Promise,
    setInterval: f => { intervals.push(f); return intervals.length; }, setTimeout, clearTimeout, clearInterval() {}, AudioContext: win.AudioContext });
  vm.runInContext(script, ctx);
  const click = async (act, id = 'o1') => {
    const card = { dataset: { id } }, btn = { dataset: { act }, disabled: false, closest: () => card };
    for (const h of $('#list').handlers.click || []) await h({ target: { closest: s => (s === 'button[data-act]' ? btn : null) } });
  };
  const tab = t => { for (const h of docHandlers.click || []) h({ target: { closest: sel => (sel === '[data-tab]' ? { dataset: { tab: t } } : null) } }); };
  const poll = async () => { intervals[0](); await new Promise(r => setTimeout(r, 15)); };
  const tick = () => new Promise(r => setTimeout(r, 15));
  return { state, $, click, poll, tick, tab, win, winHandlers, store };
}
const order = (over = {}) => ({ id: 'o1', displayCode: 'B68HFC', source: 'LIEFERANDO', brand: '', type: 'delivery', state: 'PENDING', error: '', suggestedMinutes: 25, queue: 3,
  placedAt: new Date().toISOString(), pendingSince: new Date().toISOString(), asap: true, customerName: 'Max', city: '41747 Viersen', notes: 'Zweite Klingel',
  items: [{ name: 'Smashed Beef Burger', quantity: 2, options: [{ name: 'Ohne Zwiebeln', quantity: 1 }], note: 'gut durch', category: 'Burger' }], payment: { method: 'ONLINE', cashDueCents: 0 }, ...over });

test('Seite: Zähler, Karte mit Artikeln, Vorschlag und Ton bei neuer Bestellung', async () => {
  const p = boot({ orders: [order()] }); await p.tick();
  assert.equal(String(p.$('#cntN').textContent), '1'); assert.ok(p.$('#cnt').cls.has('hot'));
  const h = p.$('#list').innerHTML;
  assert.match(h, /Smashed Beef Burger/); assert.match(h, /Ohne Zwiebeln/); assert.match(h, /gut durch/); assert.match(h, /Zweite Klingel/); assert.match(h, /#B68HFC/); assert.match(h, /Lieferando/);
  assert.match(h, /<b>25 Min<\/b>/); assert.match(h, /Küche aktuell: 3/);
  assert.ok(p.state.tones > 0, 'Ton für neue Bestellung'); assert.match(p.win.document.title, /^\(1\) /);
});

test('Seite: ±5 Min, Wert bleibt nach dem nächsten Abruf; Annehmen schickt die gewählten Minuten genau einmal', async () => {
  const p = boot({ orders: [order()] }); await p.tick();
  await p.click('plus'); assert.match(p.$('#list').innerHTML, /<b>30 Min<\/b>/);
  await p.click('minus'); await p.click('minus'); assert.match(p.$('#list').innerHTML, /<b>20 Min<\/b>/);
  await p.poll(); assert.match(p.$('#list').innerHTML, /<b>20 Min<\/b>/);
  for (let i = 0; i < 40; i++) await p.click('minus'); assert.match(p.$('#list').innerHTML, /<b>5 Min<\/b>/);
  for (let i = 0; i < 60; i++) await p.click('plus'); assert.match(p.$('#list').innerHTML, /<b>240 Min<\/b>/);
  for (let i = 0; i < 44; i++) await p.click('minus'); // 240 → 20
  await p.click('accept'); await p.tick();
  assert.deepEqual(p.state.posts, [{ orderId: 'o1', minutes: 20, deliveryMinutes: 15 }]);
  assert.match(p.$('#list').innerHTML, /disabled[^>]*>Wird angenommen/);
});

test('Seite: Fehler vom Server → Meldung auf der Karte; fehlgeschlagene Annahme → rote Karte mit „Nochmal versuchen“', async () => {
  const p = boot({ orders: [order()] }); await p.tick();
  p.state.acceptStatus = 422; await p.click('accept'); await p.tick();
  assert.match(p.$('#list').innerHTML, /class="err"/); assert.doesNotMatch(p.$('#list').innerHTML, /disabled/);
  p.state.orders = [order({ state: 'FAILED', error: 'Accept-Button nicht gefunden' })]; await p.poll();
  const h = p.$('#list').innerHTML;
  assert.match(h, /class="card FAILED"/); assert.match(h, /Accept-Button nicht gefunden/); assert.match(h, /class="go retry"/); assert.match(h, /Nochmal versuchen/);
});

test('Seite: Leerzustand, mehrere Karten, andere Sprache (AR/RTL-Texte)', async () => {
  const p = boot({ orders: [order(), order({ id: 'o2', displayCode: 'ZZZ', source: 'UBER_EATS', brand: 'Just Smashed' })] }); await p.tick();
  assert.equal(String(p.$('#cntN').textContent), '2'); assert.equal((p.$('#list').innerHTML.match(/<article/g) || []).length, 2); assert.match(p.$('#list').innerHTML, /Just Smashed/);
  p.state.orders = []; await p.poll(); assert.match(p.$('#list').innerHTML, /Keine Bestellung wartet/); assert.equal(String(p.$('#cntN').textContent), '0'); assert.ok(!p.$('#cnt').cls.has('hot'));
  p.state.lang = 'ar'; for (const h of p.winHandlers['nara-lang'] || []) h(); assert.match(p.$('#list').innerHTML, /ما في طلبات بانتظار الموافقة/);
});

test('Seite: Töne – eigener Standardton je Plattform, einstellbar, Lautstärke, stumm', async () => {
  const p = boot({ orders: [] }); await p.tick();
  const set = p.$('#setRows'); p.$('#openSet').onclick(); assert.match(set.innerHTML, /id="t-LIEFERANDO"/); assert.match(set.innerHTML, /<option value="rising" selected>/);
  assert.match(set.innerHTML, /id="t-UBER_EATS"[^]*?<option value="bell" selected>/);
  for (const h of set.handlers.change || []) h({ target: { closest: () => ({ dataset: { p: 'LIEFERANDO' }, value: 'off' }) } });
  assert.equal(p.store['nara-sound-LIEFERANDO'], 'off');
  const before = p.state.tones; for (const h of set.handlers.click || []) h({ target: { closest: () => ({ dataset: { test: 'LIEFERANDO' } }) } }); assert.equal(p.state.tones, before, 'stumm = kein Ton');
  for (const h of set.handlers.click || []) h({ target: { closest: () => ({ dataset: { test: 'WOLT' } }) } }); assert.ok(p.state.tones > before, 'Test-Ton Wolt');
  p.$('#vol').oninput({ target: { value: '55' } }); assert.equal(p.store['nara-sound-volume'], '55');
  p.$('#rep').onchange({ target: { value: '20' } }); assert.equal(p.store['nara-reception-repeat'], '20');
});

test('Seite: Ton wiederholt sich solange etwas wartet (nach der eingestellten Zeit), nicht für bereits angenommene', async () => {
  const p = boot({ orders: [order()] }); await p.tick();
  const t0 = p.state.tones; await p.poll(); assert.equal(p.state.tones, t0, 'noch innerhalb der Wiederholzeit');
  const realNow = Date.now; Date.now = () => realNow() + 11000;
  try { await p.poll(); assert.ok(p.state.tones > t0, 'Wiederholung nach 10 s'); const t1 = p.state.tones; p.state.orders[0].state = 'ACCEPTING'; Date.now = () => realNow() + 30000; await p.poll(); assert.equal(p.state.tones, t1, 'kein Ton während ACCEPTING'); }
  finally { Date.now = realNow; }
});

test('App-Modus: eigenes Manifest (Start ?app=1) und keine Seitenleiste', () => {
  assert.ok(/rel="manifest" href="icons\/platforms\.webmanifest"/.test(html));
  const m = JSON.parse(fs.readFileSync(path.join(root, 'icons', 'platforms.webmanifest'), 'utf8'));
  assert.equal(m.start_url, '/reception.html?app=1'); assert.equal(m.display, 'standalone'); assert.equal(m.scope, '/reception.html');
  assert.match(fs.readFileSync(path.join(root, 'flamo-nav.js'), 'utf8'), /reception\.html' && \/\[\?&\]app=1/);
});

const acc = (over = {}) => order({ stage: 'PREPARE', state: 'ACCEPTED', prepMinutes: 25, deliveryMinutes: 15, dueAt: new Date(Date.now() + 22 * 60000).toISOString(), acceptedAt: new Date().toISOString(), stageAt: new Date().toISOString(), ...over });

test('Seite: Reiter mit Zählern; Zubereitung zeigt Restminuten-Ring und Zeiten; Standard-Reiter ohne wartende = Zubereitung', async () => {
  const p = boot({ orders: [acc(), acc({ id: 'o2', displayCode: 'H2', stage: 'HANDOVER' }), acc({ id: 'o3', displayCode: 'D3', stage: 'DONE' })] }); await p.tick();
  assert.deepEqual([p.$('#cntN').textContent, p.$('#cntP').textContent, p.$('#cntH').textContent, p.$('#cntD').textContent].map(String), ['0', '1', '1', '1']);
  let h = p.$('#list').innerHTML;
  assert.match(h, /#B68HFC/); assert.doesNotMatch(h, /#H2/); assert.match(h, /class="ring/); assert.match(h, /<b>2[12]<\/b><small>Min/);
  assert.match(h, /<b>25 Min<\/b>/); assert.match(h, /<b>15 Min<\/b>/); assert.match(h, /Handover<\/button>/);
  p.tab('HANDOVER'); h = p.$('#list').innerHTML; assert.match(h, /#H2/); assert.match(h, /Fertig<\/button>/);
  p.tab('DONE'); h = p.$('#list').innerHTML; assert.match(h, /#D3/); assert.doesNotMatch(h, /data-act="next"/); assert.doesNotMatch(h, /class="ring/);
});

test('Seite: Zubereitungs- und Lieferzeit ±5 werden gespeichert (entprellt, genau eine Anfrage)', async () => {
  const p = boot({ orders: [acc()] }); await p.tick();
  await p.click('plus'); await p.click('plus'); await p.click('dminus');
  assert.match(p.$('#list').innerHTML, /<b>35 Min<\/b>/); assert.match(p.$('#list').innerHTML, /<b>10 Min<\/b>/);
  assert.equal(p.state.times.length, 0, 'noch nicht gesendet (entprellt)');
  await new Promise(r => setTimeout(r, 1100));
  assert.deepEqual(p.state.times, [{ orderId: 'o1', prepMinutes: 35, deliveryMinutes: 10 }]);
  assert.match(p.$('#list').innerHTML, /gespeichert/);
});

test('Seite: Handover-Knopf ändert die Stufe; Karte wandert in den nächsten Reiter; Fehler vom Plattform-Abgleich sichtbar', async () => {
  const p = boot({ orders: [acc(), acc({ id: 'o2', displayCode: 'S2', sync: { state: 'FAILED', error: 'HTTP 401' } })] }); await p.tick();
  assert.match(p.$('#list').innerHTML, /Auf der Plattform nicht übernommen: HTTP 401/);
  await p.click('next'); await p.tick();
  assert.deepEqual(p.state.stages, [{ orderId: 'o1', stage: 'HANDOVER' }]);
  assert.equal(String(p.$('#cntP').textContent), '1'); assert.equal(String(p.$('#cntH').textContent), '1');
  p.tab('HANDOVER'); await p.click('next'); await p.tick();
  assert.deepEqual(p.state.stages[1], { orderId: 'o1', stage: 'DONE' });
});

test('Seite: neue wartende Bestellung schaltet auf den Reiter „Wartend“ um', async () => {
  const p = boot({ orders: [acc()] }); await p.tick();
  p.state.orders.push(order({ id: 'n1', displayCode: 'NEW1' })); await p.poll();
  assert.match(p.$('#list').innerHTML, /#NEW1/); assert.ok(p.$('#cnt').cls.has('hot'));
});
