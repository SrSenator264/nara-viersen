'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const TG = require('../telegram-actions.js');
const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '-100' };
const mk = (onAction, calls) => TG.create({ env, onAction, fetchFn: async (url, o) => { calls.push({ m: url.split('/').pop(), b: JSON.parse(o.body) }); return { ok: true, json: async () => ({ result: [] }) }; } });
const cq = (chat, data) => ({ update_id: 5, callback_query: { id: 'q1', data, from: { first_name: 'Sami', last_name: 'K' }, message: { message_id: 9, text: '🍞 تذكير', chat: { id: chat } } } });

test('ضغطة من الجروب الصحيح: بينفّذ، بيردّ، وبيعدّل الرسالة وبيشيل الأزرار', async () => {
  const calls = []; let got = null;
  const t = mk(async (d, who) => { got = [d, who]; return { answer: 'تم ✅', edit: '✅ انطلب — Sami K' }; }, calls);
  assert.equal(await t.handle(cq(-100, 'rem:done:bread')), true);
  assert.deepEqual(got, ['rem:done:bread', 'Sami K']);
  assert.deepEqual(calls.map(c => c.m), ['answerCallbackQuery', 'editMessageText']);
  assert.deepEqual(calls[1].b.reply_markup.inline_keyboard, []); assert.ok(calls[1].b.text.endsWith('✅ انطلب — Sami K'));
});

test('ضغطة من شات غريب مرفوضة بدون ما تنفّذ شي', async () => {
  const calls = []; let n = 0;
  const t = mk(async () => { n++; return { answer: 'x' }; }, calls);
  assert.equal(await t.handle(cq(-999, 'rem:done:bread')), false);
  assert.equal(n, 0); assert.equal(calls.length, 0);
});

test('"لسا" بيردّ بس بدون تعديل الرسالة، وفشل التنفيذ ما بيوقّف شي', async () => {
  let calls = [];
  const t = mk(async () => ({ answer: 'تمام' }), calls);
  await t.handle(cq(-100, 'rem:later:bread'));
  assert.deepEqual(calls.map(c => c.m), ['answerCallbackQuery']);
  const t2 = mk(async () => { throw new Error('boom'); }, calls = []);
  assert.equal(await t2.handle(cq(-100, 'rem:done:bread')), true);
});

test('pollOnce: بيتقدّم الـoffset، وبدون إعدادات تلغرام ما بيشتغل', async () => {
  const bodies = [];
  const t = TG.create({ env, onAction: async () => null, fetchFn: async (u, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ result: [{ update_id: 41 }, { update_id: 42 }] }) }; } });
  assert.equal(await t.pollOnce(), 2); await t.pollOnce();
  assert.equal(bodies[1].offset, 43);
  assert.equal(TG.create({ env: {}, onAction() {} }).configured(), false);
});

test('/id: البوت بيردّ برقم الشات من أي شات، ومن غير تنفيذ شي', async () => {
  const calls = [];
  const t = mk(async () => { throw new Error('no'); }, calls);
  assert.equal(await t.handle({ update_id: 1, message: { text: '/id', chat: { id: 555 } } }), true);
  assert.equal(calls[0].m, 'sendMessage'); assert.equal(calls[0].b.chat_id, 555); assert.ok(calls[0].b.text.includes('555'));
  assert.equal(await t.handle({ update_id: 2, message: { text: 'Hallo', chat: { id: 555 } } }), false);
});

test('أكتر من شات مضبوط (123,-100): ضغطات الاتنين مقبولة وغيرهم لا', async () => {
  const calls = [];
  const t = TG.create({ env: { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '123, -100' }, onAction: async () => ({ answer: 'ok' }), fetchFn: async (u, o) => { calls.push(1); return { ok: true, json: async () => ({}) }; } });
  assert.equal(await t.handle(cq(123, 'rem:done:bread')), true);
  assert.equal(await t.handle(cq(-100, 'rem:done:bread')), true);
  assert.equal(await t.handle(cq(77, 'rem:done:bread')), false);
});
