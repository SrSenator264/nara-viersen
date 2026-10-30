'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = require('../reminders.js');
// محلي (نفس توقيت السيرفر): الجمعة 30.10.2026
const at = (d, h = 14, m = 0) => new Date(2026, 9, d, h, m).getTime();

test('الخبز: قبل 14:00 مو مستحق، بعدها مستحق، وبعد "انطلب" بيسكت لباقي اليوم', () => {
  const s0 = R.emptyState();
  assert.equal(R.status(s0, at(30, 13, 59)).bread.due, false);
  assert.equal(R.status(s0, at(30, 14, 0)).bread.due, true);
  const s1 = R.markDone(s0, 'bread', 'Ali', at(30, 14, 5)).state;
  assert.equal(R.status(s1, at(30, 16)).bread.due, false);
  assert.equal(R.status(s1, at(31, 14)).bread.due, true); // اليوم التالي بيرجع
});

test('الخبز: عدّاد الأسبوع من الاثنين (3 طلبيات)، وبيرجع صفر الاثنين', () => {
  let s = R.emptyState();
  for (const d of [26, 28, 30]) s = R.markDone(s, 'bread', 'x', at(d, 15)).state; // اثنين، أربعاء، جمعة
  assert.equal(R.status(s, at(30, 20)).bread.weekCount, 3);
  assert.equal(R.status(s, at(30, 20)).bread.weekTarget, 3);
  assert.equal(R.status(s, new Date(2026, 10, 2, 14).getTime()).bread.weekCount, 0); // الاثنين 2.11
  assert.equal(R.status(s, new Date(2026, 10, 1, 14).getTime()).bread.weekCount, 3); // الأحد لسا نفس الأسبوع
});

test('Loco: أول مرة مستحق، بعد "انطلب" بيسكت 3 أيام وبيرجع باليوم الرابع... أي اليوم الثالث بعده', () => {
  const s0 = R.emptyState();
  assert.equal(R.status(s0, at(30)).loco.due, true);
  const s1 = R.markDone(s0, 'loco', 'Omar', at(30, 15)).state;
  for (const d of [30, 31]) assert.equal(R.status(s1, at(d, 18)).loco.due, false);
  assert.equal(R.status(s1, new Date(2026, 10, 1, 14).getTime()).loco.due, false); // بعد يومين
  const day3 = R.status(s1, new Date(2026, 10, 2, 14).getTime()); // 3 أيام بعد
  assert.equal(day3.loco.due, true); assert.equal(day3.loco.daysSince, 3);
  const s2 = R.markDone(s1, 'loco', 'Omar', new Date(2026, 10, 2, 15).getTime()).state; // طلب مرة ثانية
  assert.equal(R.status(s2, new Date(2026, 10, 3, 14).getTime()).loco.due, false);
});

test('الإعدادات: وقت وأيام بتتنظّف، والقيم الغلط بترجع للافتراضي', () => {
  const s = R.setSettings(R.emptyState(), { time: '9:30', locoDays: 5 });
  assert.equal(s.settings.time, '09:30'); assert.equal(s.settings.locoDays, 5);
  const bad = R.setSettings(s, { time: '25:99', locoDays: 99, breadWeekly: 'x' });
  assert.deepEqual(bad.settings, R.DEFAULTS);
  assert.equal(R.status(s, at(30, 9, 29)).bread.due, false);
  assert.equal(R.status(s, at(30, 9, 30)).bread.due, true);
});

test('markDone: id غلط مرفوض', () => {
  assert.equal(R.markDone(R.emptyState(), 'milk').error, 'bad-id');
});

test('tick: بيبعت مرة وحدة باليوم لكل تذكير، وما بيبعت قبل الوقت أو بعد "انطلب"', async () => {
  const sent = [];
  const alerts = { send: async (key, text, o) => { sent.push({ key, text, o }); return { sent: true }; } };
  let st = R.emptyState();
  let r = await R.tick({ state: st, alerts, now: at(30, 13, 0) });
  assert.equal(sent.length, 0);
  r = await R.tick({ state: st, alerts, now: at(30, 14, 1) });
  assert.equal(sent.length, 2); assert.ok(sent[0].text.includes('الخبز')); assert.ok(sent[0].text.includes('0 من 3')); assert.ok(sent[1].text.includes('Loco')); assert.equal(sent[0].o.force, true);
  st = r.state;
  r = await R.tick({ state: st, alerts, now: at(30, 14, 2) });
  assert.equal(sent.length, 2); // ما في تكرار
  r = await R.tick({ state: st, alerts, now: at(31, 14, 1) });
  assert.equal(sent.length, 4); // اليوم التالي: الخبز + Loco (لسا ما انطلب) بيرجعوا يتذكّروا
});

test('tick: Loco بعد "انطلب" ما بيتبعت، والخبز اللي انطلب اليوم ما بيتبعت', async () => {
  const sent = [];
  const alerts = { send: async (k, t) => { sent.push(t); return { sent: true }; } };
  let st = R.markDone(R.markDone(R.emptyState(), 'bread', 'a', at(30, 10)).state, 'loco', 'a', at(30, 10)).state;
  await R.tick({ state: st, alerts, now: at(30, 14, 1) });
  assert.equal(sent.length, 0);
});

test('tick: إذا فشل الإرسال بيعيد المحاولة، وإذا تلغرام مو مضبوط ما بيعيد كل دقيقة', async () => {
  let ok = false;
  const alerts = { send: async () => (ok ? { sent: true } : { sent: false, reason: 'network' }) };
  let r = await R.tick({ state: R.emptyState(), alerts, now: at(30, 14, 1) });
  assert.deepEqual(r.state.sent, {}); assert.equal(r.changed, false);
  ok = true;
  r = await R.tick({ state: r.state, alerts, now: at(30, 14, 2) });
  assert.equal(r.state.sent.bread, '2026-10-30');
  const nc = { send: async () => ({ sent: false, reason: 'not-configured' }) };
  r = await R.tick({ state: R.emptyState(), alerts: nc, now: at(30, 14, 1) });
  assert.equal(r.state.sent.bread, '2026-10-30');
});

test('load/write: كتابة ذرّية وملف تالف بيرجّع حالة فاضية', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rem-')), 'sub', 'reminders.json');
  assert.deepEqual(R.load(f), R.emptyState());
  const s = R.markDone(R.emptyState(), 'bread', 'Ali', at(30)).state;
  R.write(f, s);
  assert.equal(R.load(f).log.bread[0].by, 'Ali'); assert.ok(!fs.existsSync(f + '.tmp'));
  fs.writeFileSync(f, '{bad'); assert.deepEqual(R.load(f), R.emptyState());
});
