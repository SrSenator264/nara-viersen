'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../customer-book.js');

const db = [
  { id: 'C-aaaaaaaaaa', name: 'Ali', phone: '01701234567', street: 'Hauptstr', house: '5', postal: '41747', city: 'Viersen', orders: 3, totalCents: 4500, avgCents: 1500, lastAt: '2026-10-29T18:00:00Z', mainSource: 'LIEFERANDO', sources: { LIEFERANDO: 2, UBER_EATS: 1 }, segment: 'REGULAR', favourites: [{ name: 'Cheese Burger', count: 4 }] },
  { id: 'C-bbbbbbbbbb', name: 'Sara', phone: '', street: 'Ring', house: '2', postal: '41747', city: 'Viersen', orders: 1, totalCents: 999, avgCents: 999, lastAt: null, mainSource: 'WEB', segment: 'NEW' },
];

test('clean: بياخد الحقول المعروفة بس، بينظّف ويقصّ، والمسح بيشتغل', () => {
  const c = B.clean({ name: '  Ali   Khan ', postal: '41-747x9', note: 'a  b\r\n\n\n\nc', evil: 'x', city: '' });
  assert.deepEqual(c, { name: 'Ali Khan', postal: '417479'.slice(0, 5), note: 'a b\n\nc', city: '' });
  assert.equal(B.clean({ name: 'x'.repeat(500) }).name.length, B.LIMITS.name);
  assert.deepEqual(B.clean(null), {});
});

test('merge: التعديلات بتغلب بيانات الطلبات، والباقي بيضل، واليدويين بينضافوا', () => {
  let r = B.update(B.emptyBook(), 'C-aaaaaaaaaa', { phone: '0215112233', note: 'يحب الصوص الحار' }, { user: 'Omar', now: 1000, knownIds: new Set(['C-aaaaaaaaaa']) });
  assert.ok(r.ok);
  const c = B.create(r.book, { name: 'Zaid', phone: '0170999' }, { user: 'Omar', now: 2000, rand: () => '0123456789' });
  assert.ok(c.ok); assert.equal(c.id, 'M-0123456789');
  const rows = B.merge(db, c.book);
  assert.equal(rows.length, 3);
  const ali = rows.find(x => x.id === 'C-aaaaaaaaaa');
  assert.equal(ali.phone, '0215112233'); assert.equal(ali.name, 'Ali'); assert.equal(ali.note, 'يحب الصوص الحار');
  assert.equal(ali.edited, true); assert.equal(ali.updatedBy, 'Omar'); assert.equal(ali.orders, 3);
  assert.equal(ali.favourites[0].n, 4);
  assert.equal(rows.find(x => x.id === 'C-bbbbbbbbbb').edited, false);
  const z = rows.find(x => x.manual);
  assert.equal(z.name, 'Zaid'); assert.equal(z.orders, 0); assert.equal(z.mainSource, 'MANUAL');
});

test('merge: تعديلاتك بتضل لما تتجدد قاعدة الزباين من الطلبات (اسم جديد بالطلبات ما بيمسح اسمك)', () => {
  const r = B.update(B.emptyBook(), 'C-aaaaaaaaaa', { name: 'Ali Mohammad' }, { knownIds: new Set(['C-aaaaaaaaaa']) });
  const rebuilt = db.map(c => c.id === 'C-aaaaaaaaaa' ? { ...c, name: 'ali', orders: 9 } : c);
  const ali = B.merge(rebuilt, r.book).find(x => x.id === 'C-aaaaaaaaaa');
  assert.equal(ali.name, 'Ali Mohammad'); assert.equal(ali.orders, 9);
});

test('update: اسم فاضي للزبون اليدوي ما بيتحفظ، id غلط أو زبون مجهول مرفوضين', () => {
  const c = B.create(B.emptyBook(), { name: 'Zaid' }, { rand: () => 'abcdef0123' });
  assert.equal(B.update(c.book, c.id, { name: '  ' }).error, 'name-required');
  assert.equal(B.update(c.book, 'M-ffffffffff', { name: 'x' }).error, 'not-found');
  assert.equal(B.update(c.book, '../etc', { name: 'x' }).error, 'bad-id');
  assert.equal(B.update(c.book, 'C-cccccccccc', { name: 'x' }, { knownIds: new Set(['C-aaaaaaaaaa']) }).error, 'not-found');
  assert.equal(B.update(c.book, c.id, { zzz: 1 }).error, 'empty');
  assert.equal(B.create(B.emptyBook(), { phone: '1' }).error, 'name-required');
});

test('update: تعديل زبون الطلبات بيقدر يمسح حقل (مثلاً التلفون) بدون ما يرجع من الطلبات', () => {
  const r = B.update(B.emptyBook(), 'C-aaaaaaaaaa', { phone: '' }, { knownIds: new Set(['C-aaaaaaaaaa']) });
  assert.equal(B.merge(db, r.book).find(x => x.id === 'C-aaaaaaaaaa').phone, '');
});

test('samePhone: بيحذّر من تلفون مكرر (بغض النظر عن الصيغة) وبيتجاهل الأرقام القصيرة', () => {
  const rows = B.merge(db, B.emptyBook());
  assert.deepEqual(B.samePhone(rows, 'C-bbbbbbbbbb', '+49 170 1234567'), ['Ali']);
  assert.deepEqual(B.samePhone(rows, 'C-aaaaaaaaaa', '01701234567'), []);
  assert.deepEqual(B.samePhone(rows, 'x', '123'), []);
});

test('load/write: كتابة ذرّية، وملف تالف أو ناقص بيرجّع دفتر فاضي', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cbook-')), 'sub', 'customer-book.json');
  assert.deepEqual(B.load(f), B.emptyBook());
  const c = B.create(B.emptyBook(), { name: 'Zaid' }, { rand: () => '0011223344' });
  B.write(f, c.book);
  assert.equal(B.load(f).manual['M-0011223344'].name, 'Zaid');
  assert.ok(!fs.existsSync(f + '.tmp'));
  fs.writeFileSync(f, '{broken');
  assert.deepEqual(B.load(f), B.emptyBook());
});

test('merge: كل منصة طلب منها الزبون بتنرجع بـ sources (للفلتر)، واليدوي = MANUAL', () => {
  const c = B.create(B.emptyBook(), { name: 'Zaid' }, { rand: () => '0123456789' });
  const rows = B.merge(db, c.book);
  assert.deepEqual(rows.find(x => x.id === 'C-aaaaaaaaaa').sources.sort(), ['LIEFERANDO', 'UBER_EATS']);
  assert.deepEqual(rows.find(x => x.id === 'C-bbbbbbbbbb').sources, []);
  assert.deepEqual(rows.find(x => x.manual).sources, ['MANUAL']);
});
