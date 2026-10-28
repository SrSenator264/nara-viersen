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
  const state = { orders, posts: [], tones: 0, lang, acceptStatus: 200 };
  const els = {}, intervals = [], winHandlers = {};
  const $ = s => (els[s] ||= new El());
  const document = { title: 'Plattformen · Flamo', documentElement: { lang: 'de' }, querySelector: s => $(s), querySelectorAll: () => [], addEventListener() {} };
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
    if (String(url).includes('/pending')) return { ok: true, status: 200, json: async () => ({ ok: true, count: state.orders.length, orders: state.orders }) };
    if (String(url).includes('/accept')) { state.posts.push(JSON.parse(opts.body)); if (state.acceptStatus < 400) { const o = state.orders.find(x => x.id === state.posts[state.posts.length - 1].orderId); if (o) o.state = 'ACCEPTING'; } return { ok: state.acceptStatus < 400, status: state.acceptStatus, json: async () => (state.acceptStatus < 400 ? { ok: true, state: 'ACCEPTING' } : { error: 'Wird bereits angenommen' }) }; }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const ctx = vm.createContext({ ...win, window: win, localStorage: win.localStorage, fetch: fetchStub, console, Date, JSON, Math, Number, String, Object, Array, Set, Promise,
    setInterval: f => { intervals.push(f); return intervals.length; }, setTimeout, clearInterval() {}, AudioContext: win.AudioContext });
  vm.runInContext(script, ctx);
  const click = async (act, id = 'o1') => {
    const card = { dataset: { id } }, btn = { dataset: { act }, disabled: false, closest: () => card };
    for (const h of $('#list').handlers.click || []) await h({ target: { closest: s => (s === 'button[data-act]' ? btn : null) } });
  };
  const poll = async () => { intervals[0](); await new Promise(r => setTimeout(r, 15)); };
  const tick = () => new Promise(r => setTimeout(r, 15));
  return { state, $, click, poll, tick, win, winHandlers, store };
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
  assert.deepEqual(p.state.posts, [{ orderId: 'o1', minutes: 20 }]);
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
