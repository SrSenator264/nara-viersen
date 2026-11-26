'use strict';
// Telegram: Rechnungen/Abrechnungen anfordern und als Datei bekommen; Rollen Inhaber / Partner / Personal.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const TD = require('../telegram-documents.js'), TA = require('../telegram-accounting.js'), TG = require('../telegram-actions.js');

const now = new Date('2026-11-26T12:00:00Z');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nara-tgdocs-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const put = (name, bytes = 'x') => fs.writeFileSync(path.join(dir, name), bytes);
put('lief10.pdf', 'L10'); put('lief11.pdf', 'L11'); put('mel_1.jpg', 'p1'); put('mel_2.jpg', 'p2'); put('bank.pdf', 'B'); put('js.pdf', 'J');

const data = {
  suppliers: [{ id: 'sup_m', name: 'MELEDI' }],
  invoices: [],
  documents: [
    { id: 'pd10', type: 'PLATFORM_STATEMENT', pageFiles: ['lief10.pdf'], originalFilenames: ['TAKEAWAY_10.pdf'] },
    { id: 'pd11', type: 'PLATFORM_STATEMENT', pageFiles: ['lief11.pdf'] },
    { id: 'pdjs', type: 'PLATFORM_STATEMENT', pageFiles: ['js.pdf'] },
    { id: 'sd1', type: 'SUPPLIER_INVOICE', pageFiles: ['mel_1.jpg', 'mel_2.jpg'], extraction: { header: { supplierName: 'MELKAA GmbH', invoiceNumber: '500', invoiceDate: '17-11-2026' } } },
    { id: 'sd2', type: 'SUPPLIER_INVOICE', pageFiles: ['gone.jpg'], supplierId: 'sup_m', createdAt: '2026-11-03T10:00:00Z' },
    { id: 'bd', type: 'BANK_STATEMENT', pageFiles: ['bank.pdf'], bankName: 'Wise', periodFrom: '2026-10-01', periodTo: '2026-10-31' },
    { id: 'evil', type: 'SUPPLIER_INVOICE', pageFiles: ['../../etc/passwd'], extraction: { header: { supplierName: 'MELEDI', invoiceDate: '2026-11-20' } } },
  ],
  platformStatements: [
    { platform: 'LIEFERANDO', periodFrom: '2026-10-25', periodTo: '2026-10-31', invoiceNumber: 'A1', documentId: 'pd10' },
    { platform: 'LIEFERANDO', periodFrom: '2026-11-01', periodTo: '2026-11-07', invoiceNumber: 'A2', documentId: 'pd11' },
    { platform: 'LIEFERANDO', periodFrom: '2026-11-08', periodTo: '2026-11-14', invoiceNumber: 'A3' },
    { platform: 'JUST_VIRTUAL', periodFrom: '2026-11-01', periodTo: '2026-11-07', invoiceNumber: '7502', documentId: 'pdjs' },
  ],
};

async function run(text, role) {
  const sent = [], audits = [];
  const out = await TD.handleRequest({ text, role, who: 'X', chatId: '55', data, docsDir: dir, now, audit: (type, details) => audits.push({ type, details }), sendDocument: async f => { sent.push({ name: f.filename, body: String(f.buffer), caption: f.caption }); return true; } });
  return { out, sent, audits };
}

test('Anfrage erkennen', () => {
  for (const t of ['ابعتلي فواتير Lieferando لشهر 11', 'فاتورة MELEDI', 'فواتير Just Smashed', 'بدي كشف البنك اكتوبر', 'schick mir die Rechnung von Meledi']) assert.equal(TD.isRequest(t), true, t);
  for (const t of ['كم مجموع فواتير شهر 10؟', 'شو الربح هالشهر', 'مرحبا']) assert.equal(TD.isRequest(t), false, t);
});

test('Monat, Plattform, Lieferant aus dem Text', () => {
  assert.equal(TD.parseMonth('شهر 11', now), '2026-11'); assert.equal(TD.parseMonth('اكتوبر', now), '2026-10');
  assert.equal(TD.parseMonth('Dezember', now), '2025-12'); assert.equal(TD.parseMonth('11/2026', now), '2026-11'); assert.equal(TD.parseMonth('شهر ١١', now), '2026-11');
  assert.deepEqual(TD.parseRequest('فواتير Just Smashed', now).platforms, ['JUST_VIRTUAL']);
  assert.deepEqual(TD.parseRequest('فاتورة MELEDI', now).supplierTerms, ['meledi']);
  assert.equal(TD.parseRequest('كشف البنك', now).bank, true);
});

test('Inhaber: Lieferando Monat 11 → nur die Nov-Datei, Abrechnung ohne Datei wird genannt', async () => {
  const r = await run('ابعتلي فواتير Lieferando لشهر 11', 'OWNER');
  assert.deepEqual(r.sent.map(s => s.body), ['L11']);
  assert.match(r.sent[0].caption, /Lieferando · 2026-11-01 → 2026-11-07 · #A2/);
  assert.match(r.out, /بلا ملف: Lieferando 2026-11-08→2026-11-14 #A3/);
  assert.equal(r.audits[0].type, 'DOCUMENTS_SENT_TELEGRAM'); assert.deepEqual(r.audits[0].details.documentIds, ['pd11']); assert.equal(r.audits[0].details.role, 'OWNER');
});

test('Lieferant MELEDI (auch als MELKAA): alle Seiten, fehlende Datei und fremder Pfad werden übersprungen', async () => {
  const r = await run('فاتورة MELEDI شهر 11', 'OWNER');
  assert.deepEqual(r.sent.map(s => s.body).sort(), ['p1', 'p2']);
  assert.equal(TD.filesOf(data.documents.find(d => d.id === 'evil'), dir, fs)[0].error, 'BAD_PATH'); // ../ never leaves the archive
  assert.match(r.out, /الملف مفقود/);
  assert.match(r.sent[0].caption, /1\/2/);
});

test('Just Smashed und Bank für den Inhaber', async () => {
  assert.deepEqual((await run('فواتير Just Smashed', 'OWNER')).sent.map(s => s.body), ['J']);
  assert.deepEqual((await run('ابعتلي كشف البنك اكتوبر', 'OWNER')).sent.map(s => s.body), ['B']);
});

test('Partner: Lieferantenrechnung ja, Plattform/Bank nein (Audit)', async () => {
  const ok = await run('فاتورة MELEDI شهر 11', 'PARTNER');
  assert.equal(ok.sent.length, 2); assert.equal(ok.audits[0].details.role, 'PARTNER');
  for (const q of ['ابعتلي فواتير Lieferando لشهر 11', 'ابعتلي كشف البنك اكتوبر']) {
    const r = await run(q, 'PARTNER');
    assert.equal(r.sent.length, 0); assert.match(r.out, /للمالك بس/); assert.equal(r.audits[0].type, 'TELEGRAM_REQUEST_DENIED');
  }
});

test('nichts gefunden / zu ungenau / maximal 10 Dateien', async () => {
  assert.match((await run('فاتورة Jacob', 'OWNER')).out, /ما لقيت ملفات لـ jacob/);
  assert.match((await run('ابعتلي الفواتير شهر 11', 'OWNER')).out, /شو بدك بالزبط/);
  const many = { ...data, documents: Array.from({ length: 14 }, (_, i) => ({ id: 'm' + i, type: 'SUPPLIER_INVOICE', pageFiles: ['bank.pdf'], extraction: { header: { supplierName: 'MELEDI', invoiceDate: `2026-11-${String(i + 1).padStart(2, '0')}` } } })) };
  const sent = [];
  const out = await TD.handleRequest({ text: 'فاتورة MELEDI', role: 'OWNER', data: many, docsDir: dir, now, audit: () => {}, sendDocument: async f => { sent.push(f); return true; } });
  assert.equal(sent.length, 10); assert.match(out, /لقيت 14، بعتت أحدث 10/);
  assert.match(sent[0].caption, /2026-11-14/); // neueste zuerst
});

test('telegram-accounting: Rollen leiten richtig weiter', async () => {
  const calls = [];
  const deps = { saveDocument: x => { calls.push(['save', x.uploadedBy]); return { id: 'doc_abcdef' }; }, askAgent: async () => { calls.push(['agent']); return 'A'; }, documentRequest: async (t, ctx) => { calls.push(['req', ctx.role]); return 'R'; } };
  const tools = role => ({ role, isOwner: role === 'OWNER', who: 'Ali', chatId: '9', download: async () => ({ buffer: Buffer.from('img') }) });
  assert.equal(await TA.handleMessage({ chat: { id: 9 }, text: 'فاتورة MELEDI' }, tools('PARTNER'), deps), 'R');
  assert.match(await TA.handleMessage({ chat: { id: 9 }, text: 'شو الربح؟' }, tools('PARTNER'), deps), /فيك ترفع/);
  assert.equal(await TA.handleMessage({ chat: { id: 9 }, text: 'شو الربح؟' }, tools('OWNER'), deps), 'A');
  assert.equal(await TA.handleMessage({ chat: { id: 9 }, text: 'فاتورة MELEDI' }, tools('STAFF'), deps), null);
  await TA.handleMessage({ chat: { id: 9 }, photo: [{ file_id: 'f', file_size: 3 }] }, tools('PARTNER'), deps);
  assert.deepEqual(calls.filter(c => c[0] !== 'save').map(c => c.join(':')), ['req:PARTNER', 'agent']);
  assert.deepEqual(calls.find(c => c[0] === 'save')[1], { chatId: '9', name: 'Ali', role: 'PARTNER' });
});

test('telegram-actions: Partner-Chat bekommt role PARTNER, Inhaber gewinnt, sendDocument multipart', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1', TELEGRAM_OWNER_CHAT_ID: '2', TELEGRAM_PARTNER_CHAT_ID: '3, 2' };
  const posts = [], seen = [];
  const t = TG.create({ env, onAction: async () => null, onMessage: async (m, o) => { seen.push(o.role); await o.sendDocument({ buffer: Buffer.from('PDF'), filename: 'a.pdf', caption: 'c' }); return null; },
    fetchFn: async (url, o) => { posts.push({ m: url.split('/').pop(), body: o.body }); return { ok: true, json: async () => ({}) }; } });
  assert.equal(t.roleOf('2'), 'OWNER'); assert.equal(t.roleOf('3'), 'PARTNER'); assert.equal(t.roleOf('1'), 'STAFF'); assert.equal(t.roleOf('4'), null);
  await t.handle({ message: { chat: { id: 3 }, text: 'x', message_id: 1 } });
  await t.handle({ message: { chat: { id: 4 }, text: 'x', message_id: 2 } });
  assert.deepEqual(seen, ['PARTNER']);
  const sd = posts.find(p => p.m === 'sendDocument');
  assert.ok(sd.body instanceof FormData); assert.equal(sd.body.get('chat_id'), '3'); assert.equal(sd.body.get('document').name, 'a.pdf');
});
