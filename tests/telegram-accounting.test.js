'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const TA = require('../telegram-accounting.js');
const TG = require('../telegram-actions.js');

test('Telegram-Buchhaltung: Foto/PDF wird gespeichert, falsches Format abgelehnt, Text nur vom Inhaber', async () => {
  const saved = []; const deps = { saveDocument: x => { saved.push(x); return { id: 'doc_abcdef123456' }; }, askAgent: async t => 'Antwort: ' + t };
  const dl = async id => ({ buffer: Buffer.from('img-' + id) });
  let r = await TA.handleMessage({ chat: { id: 1 }, photo: [{ file_id: 'small' }, { file_id: 'big', file_size: 100 }], caption: 'Metro' }, { download: dl, isOwner: false, who: 'Ali' }, deps);
  assert.match(r, /وصلت الفاتورة/); assert.equal(saved[0].buffer.toString(), 'img-big'); assert.equal(saved[0].ext, '.jpg'); assert.equal(saved[0].caption, 'Metro');
  r = await TA.handleMessage({ chat: { id: 1 }, document: { file_id: 'p', mime_type: 'application/pdf', file_name: 'RE.pdf' } }, { download: dl, isOwner: false }, deps);
  assert.equal(saved[1].ext, '.pdf'); assert.equal(saved[1].filename, 'RE.pdf');
  assert.match(await TA.handleMessage({ chat: { id: 1 }, document: { file_id: 'z', mime_type: 'application/zip' } }, { download: dl }, deps), /PDF أو صورة/);
  assert.match(await TA.handleMessage({ chat: { id: 1 }, photo: [{ file_id: 'x', file_size: 30e6 }] }, { download: dl }, deps), /20 MB/);
  assert.equal(await TA.handleMessage({ chat: { id: 1 }, text: 'Umsatz?' }, { download: dl, isOwner: false }, deps), null);
  assert.equal(await TA.handleMessage({ chat: { id: 1 }, text: 'Umsatz?' }, { download: dl, isOwner: true }, deps), 'Antwort: Umsatz?');
});

test('telegram-actions: Nachrichten gehen an onMessage nur aus erlaubten Chats, /id bleibt, Antwort wird gesendet', async () => {
  const calls = [];
  const fetchFn = async (url, o) => { calls.push({ url, body: o && o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true, result: [] }) }; };
  const seen = [];
  const bot = TG.create({ env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '10', TELEGRAM_OWNER_CHAT_ID: '99' }, fetchFn, onAction: async () => null, onMessage: async (m, x) => { seen.push([m.chat.id, x.isOwner]); return 'ok'; } });
  await bot.handle({ message: { message_id: 1, chat: { id: 10 }, text: 'hi' } });
  await bot.handle({ message: { message_id: 2, chat: { id: 99 }, text: 'frage' } });
  await bot.handle({ message: { message_id: 3, chat: { id: 55 }, text: 'fremd' } });
  await bot.handle({ message: { message_id: 4, chat: { id: 55 }, text: '/id' } });
  assert.deepEqual(seen, [[10, false], [99, true]]);
  const sends = calls.filter(c => /sendMessage$/.test(c.url)).map(c => c.body);
  assert.equal(sends.length, 3); assert.equal(sends[0].text, 'ok'); assert.equal(sends[0].reply_to_message_id, 1); assert.match(sends[2].text, /55/);
  assert.equal(TG.create({ env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_OWNER_CHAT_ID: '99' }, fetchFn }).configured(), true);
});

test('Gedächtnis: letzte 6 Nachrichten pro Chat', () => {
  const m = TA.memory(); for (let i = 0; i < 8; i++) m.push('c', i % 2 ? 'assistant' : 'user', 'm' + i);
  assert.equal(m.get('c').length, 6); assert.equal(m.get('c')[0].text, 'm2'); assert.deepEqual(m.get('x'), []);
});
