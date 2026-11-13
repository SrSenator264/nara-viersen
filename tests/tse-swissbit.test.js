'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { create, setup, TseError } = require('../tse-swissbit.js');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tse-')), 'creds.json');
function fakeApi(over = {}) {
  const calls = [];
  const api = { calls,
    init: async m => { calls.push('init ' + m); return { m }; }, cleanup: async () => { calls.push('cleanup'); },
    readInfo: async () => ({ initializationState: 1, createdSignatures: 5, remainingSignatures: 19999995, capacityUsedPercent: 0, startedTransactions: 0, firmware: '1.1.0', certificationId: 'BSI', serialHex: 'ab', publicKeyB64: 'cGs=', signatureAlgorithm: 'ecdsa-plain-SHA384', timeFormat: 'unixTime' }),
    startup: async (c, id, pin) => { calls.push('startup ' + id + ' ' + pin); }, updateTime: async () => { calls.push('updateTime'); },
    tx: async (kind, c, a) => { calls.push(kind + ' ' + a.processType); return { transactionNumber: 7, logTimeSec: 1700000000, signatureCounter: 9, signature: Buffer.from('sig') }; },
    listStarted: async () => [3, 4], setup: async () => { calls.push('setup'); }, ...over };
  return api;
}
const mk = (api, cf) => create({ api, devicePath: 'D:', credFile: cf, background: false, detect: async () => '' });

test('start/finish liefern Format wie tse-sim und lösen Startup einmal aus', async () => {
  const cf = tmp(); fs.writeFileSync(cf, JSON.stringify({ adminPin: '12345' }));
  const api = fakeApi(), d = mk(api, cf);
  const s = await d.startTransaction({ clientId: 'K1', processType: 'Kassenbeleg-V1', processData: '' });
  assert.deepEqual(s, { transactionNumber: 7, logTime: '2023-11-14T22:13:20.000Z', signatureCounter: 9 });
  const f = await d.finishTransaction({ clientId: 'K1', transactionNumber: 7, processType: 'Kassenbeleg-V1', processData: 'Beleg^x' });
  assert.equal(f.signature, Buffer.from('sig').toString('base64'));
  assert.equal(api.calls.filter(c => c.startsWith('startup')).length, 1);
  assert.deepEqual(await d.listStarted(), [3, 4]);
});

test('info(): Serial hex, PublicKey base64, nicht simuliert', async () => {
  const cf = tmp(); fs.writeFileSync(cf, JSON.stringify({ adminPin: '12345' }));
  const i = await mk(fakeApi(), cf).info();
  assert.equal(i.simulated, false); assert.equal(i.serial, 'ab'); assert.equal(i.publicKey, 'cGs='); assert.equal(i.signatureAlgorithm, 'ecdsa-plain-SHA384');
});

test('ohne Zugangsdaten: klarer Fehler, kein Startup', async () => {
  const api = fakeApi(); const d = mk(api, tmp());
  await assert.rejects(d.info(), /Zugangsdaten fehlen/);
  assert.equal(api.calls.some(c => c.startsWith('startup')), false);
});

test('nicht eingerichtete TSE: kein Startup, kein Setup', async () => {
  const cf = tmp(); fs.writeFileSync(cf, JSON.stringify({ adminPin: '12345' }));
  const api = fakeApi({ readInfo: async () => ({ initializationState: 0 }) });
  await assert.rejects(mk(api, cf).info(), /nicht eingerichtet/);
  assert.equal(api.calls.some(c => c === 'setup' || c.startsWith('startup')), false);
});

test('Login-Fehler sperrt alle weiteren Versuche (PUK-Schutz)', async () => {
  const cf = tmp(); fs.writeFileSync(cf, JSON.stringify({ adminPin: '12345' }));
  let n = 0; const api = fakeApi({ startup: async () => { n++; throw new TseError('login', 0x1100); } });
  const d = mk(api, cf);
  await assert.rejects(d.info()); await assert.rejects(d.info(), /gesperrt/); await assert.rejects(d.startTransaction(), /gesperrt/);
  assert.equal(n, 1);
});

test('USB getrennt: Verbindung wird zurückgesetzt und neu geöffnet', async () => {
  const cf = tmp(); fs.writeFileSync(cf, JSON.stringify({ adminPin: '12345' }));
  let fail = true; const api = fakeApi({ tx: async () => { if (fail) { fail = false; throw new TseError('io', 3); } return { transactionNumber: 1, logTimeSec: 1, signatureCounter: 1, signature: Buffer.from('s') }; } });
  const d = mk(api, cf);
  await assert.rejects(d.startTransaction(), /io/);
  assert.equal((await d.startTransaction()).transactionNumber, 1);
  assert.equal(api.calls.filter(c => c.startsWith('init')).length, 2);
});

test('setup speichert Zugangsdaten VOR dem Setup, stoppt bei Fehler, nutzt gleiche Daten beim Wiederholen', async () => {
  const cf = tmp(); let saved = null;
  const api = fakeApi({ readInfo: async () => ({ initializationState: 0, serialHex: 'ab' }), setup: async () => { saved = JSON.parse(fs.readFileSync(cf, 'utf8')); throw new TseError('puk', 0x1100); } });
  await assert.rejects(setup({ api, mount: 'D:', seed: 'S', credFile: cf, log() {} }), /puk/);
  assert.match(saved.adminPuk, /^\d{6}$/); assert.match(saved.adminPin, /^\d{5}$/); assert.match(saved.timeAdminPin, /^\d{5}$/);
  const api2 = fakeApi({ readInfo: async () => ({ initializationState: 0, serialHex: 'ab' }) });
  await setup({ api: api2, mount: 'D:', seed: 'S', credFile: cf, log() {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(cf, 'utf8')).adminPuk, saved.adminPuk);
  await assert.rejects(setup({ api: api2, mount: 'D:', seed: 'ANDERS', credFile: cf, log() {} }), /Seed passt nicht/);
});

test('setup weigert bei bereits eingerichteter TSE', async () => {
  const api = fakeApi(); await assert.rejects(setup({ api, mount: 'D:', seed: 'S', credFile: tmp(), log() {} }), /schon eingerichtet/);
  assert.equal(api.calls.includes('setup'), false);
});
