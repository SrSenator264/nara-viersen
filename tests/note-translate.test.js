'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const NT = require('../note-translate.js');

const reply = obj => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const opts = fetchImpl => ({ key: 'k', model: 'gemini-3.8-flash', fetchImpl });

test('numbers are masked before sending and restored unchanged', async () => {
  let sent = '';
  const f = async (url, init) => { sent = init.body; return reply({ en: 'Children sleeping, please call ⟦0⟧', ar: 'الأطفال نايمين، رجاءً اتصل ⟦0⟧' }); };
  const r = await NT.translateNote('Kinder schlafen, bitte anrufen 01777968869', opts(f));
  assert.ok(!sent.includes('01777968869'), 'phone must not be sent to Gemini');
  assert.match(r.en, /01777968869/); assert.match(r.ar, /01777968869/);
});

test('a lost number discards that language; both lost = error', async () => {
  const one = async () => reply({ en: 'Call ⟦0⟧', ar: 'اتصل' });
  const r = await NT.translateNote('Bitte anrufen 0177 123', opts(one));
  assert.equal(r.ar, ''); assert.match(r.en, /0177 123/);
  const none = async () => reply({ en: 'Call', ar: 'اتصل' });
  await assert.rejects(NT.translateNote('Bitte anrufen 0177 123', opts(none)));
});

test('pending: skips empty notes, already translated, recent failures', () => {
  const t = 'Klingel kaputt', h = NT.hashOf(t), now = 1e12;
  const items = [
    { order: { id: 'a' }, text: '' },
    { order: { id: 'b', noteI18n: { src: h, en: 'x', ar: 'y' } }, text: t },
    { order: { id: 'c', noteI18n: { src: h, en: '', ar: '', failedAt: now - 1000 } }, text: t },
    { order: { id: 'd', noteI18n: { src: h, en: '', ar: '', failedAt: now - 11 * 60000 } }, text: t },
    { order: { id: 'e' }, text: t },
  ];
  assert.deepEqual(NT.pending(items, now).map(j => j.id), ['d', 'e']);
});

test('run: failure keeps order untouched; 429 pauses', async () => {
  const f = async () => ({ ok: false, status: 429 });
  const { results, quota } = await NT.run([{ id: 'a', text: 'Hallo', hash: 'h' }, { id: 'b', text: 'Hi', hash: 'h2' }], opts(f), 5);
  assert.equal(quota, true); assert.equal(results.length, 1); assert.equal(results[0].rec.en, '');
});

test('view: only when the translation matches the current note text', () => {
  const t = 'Bitte klingeln', o = { noteI18n: { src: NT.hashOf(t), en: 'Please ring', ar: 'رجاءً دق الجرس' } };
  assert.deepEqual(NT.view(o, t), { en: 'Please ring', ar: 'رجاءً دق الجرس' });
  assert.equal(NT.view(o, 'Anderer Text'), null);
  assert.equal(NT.view({}, t), null);
});
