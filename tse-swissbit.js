'use strict';
// tse-swissbit.js — الـ Swissbit USB-TSE الحقيقي (نفس واجهة tse-sim.js). مبني على WormAPI.dll من Swissbit SDK 6.0.1 عبر koffi.
// الـ SDK ملكية خاصة: بمجلد tse-sdk/ (gitignored، ممنوع يرتفع على GitHub).
//
// قواعد أمان (فيرمويره 1.x: الـ PUK بيتبلوك للأبد بعد 3 محاولات غلط):
// - الـ driver ما بيعمل setup أبداً لحاله. الـ setup بس عبر scripts/tse-setup.mjs بموافقة صريحة.
// - إذا فشل تسجيل الدخول (PIN غلط) بنوقف كل المحاولات لحد ما يتعالج الموضوع، ما بنكرر أبداً.
// - كل الاستدعاءات متسلسلة (طابور واحد) وبدون تجميد Node (koffi async).
// - الـ TSE بيعمل self-test كل 25 ساعة بالأكتر وتحديث وقت كل 30 دقيقة بالأكتر: عنا 12 ساعة و10 دقايق.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const ALG_FALLBACK = 'ecdsa-plain-SHA384', TIME_FORMAT_FALLBACK = 'unixTime';
const SELF_TEST_EVERY_MS = 12 * 3600 * 1000, TIME_SYNC_EVERY_MS = 10 * 60 * 1000, MAINTAIN_EVERY_MS = 5 * 60 * 1000;
const AUTH_ERRORS = new Set([0x1100, 0x1201, 0x1203]);
const LOST_ERRORS = new Set([2, 3, 4, 13, 24, 20]); // ما في TSE / IO / timeout / power cycle / ما انلقى

class TseError extends Error { constructor(msg, code) { super(msg); this.name = 'TseError'; this.code = code; } }

const defaultSdkDir = path.join(__dirname, 'tse-sdk');
const defaultDll = (sdkDir) => process.env.NARA_TSE_DLL || [
  path.join(sdkDir, 'WormAPI.dll'),
  path.join(sdkDir, 'Swissbit_TSE_SDK_v6.0.1', 'sdk-offline', 'sdk', 'c', 'windows64', 'bin', 'WormAPI.dll'),
].find(p => fs.existsSync(p)) || path.join(sdkDir, 'WormAPI.dll');

// ---------- طبقة الـ DLL (koffi). كل دالة بترجّع Promise وبترمي TseError برمز الـ SDK ----------
function makeApi(dll) {
  if (!fs.existsSync(dll)) throw new TseError('Swissbit-SDK fehlt (' + dll + '). Siehe plans/PLAN_TSE_SWISSBIT.md');
  const koffi = require('koffi');
  const lib = koffi.load(dll);
  koffi.opaque('WormContext'); koffi.opaque('WormInfo'); koffi.opaque('WormTransactionResponse');
  const fn = (sig) => lib.func(sig);
  const call = (f, ...a) => new Promise((res, rej) => f.async(...a, (e, r) => (e ? rej(e) : res(r))));
  const chk = (rc, what) => { if (rc !== 0) throw new TseError(what + ' fehlgeschlagen (Fehlercode ' + rc + ')', rc); };
  const buf = s => (Buffer.isBuffer(s) ? s : Buffer.from(String(s || ''), 'utf8'));

  const F = {
    init: fn('int worm_init(_Out_ WormContext **context, const char *mountPoint)'),
    cleanup: fn('int worm_cleanup(WormContext *context)'),
    infoNew: fn('WormInfo *worm_info_new(WormContext *context)'),
    infoFree: fn('void worm_info_free(WormInfo *info)'),
    infoRead: fn('int worm_info_read(WormInfo *info)'),
    startup: fn('int worm_tse_startup(WormContext *context, const char *clientId, const uint8_t *adminPin, int adminPinLength, int enableAutopilot)'),
    updateTime: fn('int worm_tse_updateTime(WormContext *context, uint64_t timestamp)'),
    selfTest: fn('int worm_tse_runSelfTest(WormContext *context, const char *clientId)'),
    setupExt: fn('int worm_tse_setup_ext(WormContext *context, const uint8_t *seed, int seedLength, const uint8_t *puk, int pukLength, const uint8_t *pin, int pinLength, const uint8_t *tPin, int tPinLength, const char *clientId, int enableAutopilot)'),
    rspNew: fn('WormTransactionResponse *worm_transaction_response_new(WormContext *context)'),
    rspFree: fn('void worm_transaction_response_free(WormTransactionResponse *response)'),
    txStart: fn('int worm_transaction_start(WormContext *context, const char *clientId, const uint8_t *processData, uint64_t processDataLength, const char *processType, WormTransactionResponse *response)'),
    txFinish: fn('int worm_transaction_finish(WormContext *context, const char *clientId, uint64_t transactionNumber, const uint8_t *processData, uint64_t processDataLength, const char *processType, WormTransactionResponse *response)'),
    txList: fn('int worm_transaction_listStartedTransactions(WormContext *context, const char *clientId, int toSkip, _Out_ uint64_t *transactionNumbers, int transactionNumbersLength, _Out_ int *storedTransactionNumbers)'),
    rspLogTime: fn('uint64_t worm_transaction_response_logTime(const WormTransactionResponse *response)'),
    rspSigCounter: fn('uint64_t worm_transaction_response_signatureCounter(const WormTransactionResponse *response)'),
    rspTxNumber: fn('uint64_t worm_transaction_response_transactionNumber(const WormTransactionResponse *response)'),
    rspSignature: fn('void worm_transaction_response_signature(const WormTransactionResponse *response, _Out_ uint8_t **signature, _Out_ uint64_t *length)'),
    exportTar: fn('int worm_export_tar(WormContext *context, void *callback, void *callbackData)'),
    sigAlg: fn('const char *worm_signatureAlgorithm(void)'),
    timeFmt: fn('const char *worm_logTimeFormat(void)'),
    sdkVersion: fn('const char *worm_getVersion(void)'),
  };
  const u32 = n => fn('uint32_t ' + n + '(const WormInfo *info)');
  const i32 = n => fn('int ' + n + '(const WormInfo *info)');
  const str = n => fn('const char *' + n + '(const WormInfo *info)');
  const byt = n => { const g = fn('void ' + n + '(const WormInfo *info, _Out_ uint8_t **data, _Out_ uint64_t *len)'); return info => { const p = [null], l = [0n]; g(info, p, l); return Buffer.from(koffi.decode(p[0], 'uint8_t', Number(l[0]))); }; };
  const I = {
    initializationState: u32('worm_info_initializationState'), hasValidTime: i32('worm_info_hasValidTime'), hasPassedSelfTest: i32('worm_info_hasPassedSelfTest'),
    registeredClients: u32('worm_info_registeredClients'), startedTransactions: u32('worm_info_startedTransactions'), createdSignatures: u32('worm_info_createdSignatures'),
    remainingSignatures: u32('worm_info_remainingSignatures'), capacity: u32('worm_info_capacity'), size: u32('worm_info_size'),
    softwareVersion: u32('worm_info_softwareVersion'), certificationId: str('worm_info_tseCertificationId'),
    serial: byt('worm_info_tseSerialNumber'), publicKey: byt('worm_info_tsePublicKey'),
  };
  const ver = v => ((v >> 16) & 0xffff) + '.' + ((v >> 8) & 0xff) + '.' + (v & 0xff);

  return {
    version: () => F.sdkVersion(),
    async init(mount) { const c = [null]; chk(await call(F.init, c, mount), 'worm_init(' + mount + ')'); return c[0]; },
    async cleanup(ctx) { try { await call(F.cleanup, ctx); } catch (e) { /* egal */ } },
    async readInfo(ctx) {
      const info = F.infoNew(ctx); if (!info) throw new TseError('Speicher (worm_info_new)');
      try {
        chk(await call(F.infoRead, info), 'worm_info_read');
        const sw = I.softwareVersion(info), cap = I.capacity(info), size = I.size(info);
        return {
          initializationState: I.initializationState(info), hasValidTime: !!I.hasValidTime(info), hasPassedSelfTest: !!I.hasPassedSelfTest(info),
          registeredClients: I.registeredClients(info), startedTransactions: I.startedTransactions(info), createdSignatures: I.createdSignatures(info),
          remainingSignatures: I.remainingSignatures(info), capacityUsedPercent: cap ? Math.round((size / cap) * 1000) / 10 : 0,
          firmware: ver(sw), certificationId: I.certificationId(info),
          serialHex: I.serial(info).toString('hex'), publicKeyB64: I.publicKey(info).toString('base64'),
          signatureAlgorithm: F.sigAlg() || ALG_FALLBACK, timeFormat: F.timeFmt() || TIME_FORMAT_FALLBACK,
        };
      } finally { F.infoFree(info); }
    },
    async startup(ctx, clientId, pin) { chk(await call(F.startup, ctx, clientId, buf(pin), buf(pin).length, 1), 'worm_tse_startup'); },
    async updateTime(ctx, sec) { chk(await call(F.updateTime, ctx, sec), 'worm_tse_updateTime'); },
    async selfTest(ctx, clientId) { chk(await call(F.selfTest, ctx, clientId), 'worm_tse_runSelfTest'); },
    async setup(ctx, { seed, puk, pin, timePin, clientId }) {
      const s = buf(seed), a = buf(puk), b = buf(pin), c = buf(timePin);
      chk(await call(F.setupExt, ctx, s, s.length, a, a.length, b, b.length, c, c.length, clientId, 1), 'worm_tse_setup_ext');
    },
    async tx(kind, ctx, { clientId, transactionNumber, processType, processData }) {
      const rsp = F.rspNew(ctx); if (!rsp) throw new TseError('Speicher (response_new)');
      try {
        const d = buf(processData);
        if (kind === 'start') chk(await call(F.txStart, ctx, clientId, d, d.length, processType, rsp), 'worm_transaction_start');
        else chk(await call(F.txFinish, ctx, clientId, transactionNumber, d, d.length, processType, rsp), 'worm_transaction_finish');
        const p = [null], l = [0n]; F.rspSignature(rsp, p, l);
        return { transactionNumber: Number(F.rspTxNumber(rsp)), logTimeSec: Number(F.rspLogTime(rsp)), signatureCounter: Number(F.rspSigCounter(rsp)),
          signature: Buffer.from(koffi.decode(p[0], 'uint8_t', Number(l[0]))) };
      } finally { F.rspFree(rsp); }
    },
    async listStarted(ctx, clientId) {
      const arr = new BigUint64Array(62), n = [0];
      chk(await call(F.txList, ctx, clientId, 0, arr, 62, n), 'worm_transaction_listStartedTransactions');
      return Array.from(arr.slice(0, n[0])).map(Number);
    },
    async exportTar(ctx, file) {
      const fd = fs.openSync(file, 'w');
      const proto = koffi.proto('int WormExportCb(const uint8_t *chunk, uint32_t len, void *data)');
      const cb = koffi.register((chunk, len) => { try { fs.writeSync(fd, Buffer.from(koffi.decode(chunk, 'uint8_t', len))); return 0; } catch (e) { return 1; } }, koffi.pointer(proto));
      try { chk(await call(F.exportTar, ctx, cb, null), 'worm_export_tar'); } finally { koffi.unregister(cb); fs.closeSync(fd); }
    },
  };
}

// ---------- مسار الدرايف ----------
function detectDrive() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve('');
    execFile('powershell', ['-NoProfile', '-Command', "(Get-Volume | Where-Object { $_.FileSystemLabel -eq 'SWISSBIT' } | Select-Object -First 1).DriveLetter"],
      { timeout: 8000, windowsHide: true }, (e, out) => { const l = String(out || '').trim().slice(0, 1); resolve(!e && /^[A-Za-z]$/.test(l) ? l.toUpperCase() + ':' : ''); });
  });
}

// ---------- بيانات الدخول (بملف خارج git: data/tse-credentials.json) ----------
const credFileDefault = () => process.env.NARA_TSE_CREDENTIALS || path.join(__dirname, 'data', 'tse-credentials.json');
function readCreds(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeCreds(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp', fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, JSON.stringify(obj, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const digits = n => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

// ---------- الـ driver ----------
function create({ sdkDir = defaultSdkDir, devicePath = process.env.NARA_TSE_PATH || '', api = null, credFile = credFileDefault(),
  clientId = String(process.env.NARA_TSE_CLIENT_ID || 'FLAMO-KASSE-1').slice(0, 30), now = () => Date.now(), background = true, detect = detectDrive, log = console.error } = {}) {
  let ctx = null, started = false, lastSelfTest = 0, lastTimeSync = 0, locked = '', lastError = null, chain = Promise.resolve(), cached = null;
  const getApi = () => api || (api = makeApi(defaultDll(sdkDir)));
  const run = (f) => { const p = chain.then(f, f); chain = p.catch(() => {}); return p; };

  async function reset() { const c = ctx; ctx = null; started = false; cached = null; if (c) await getApi().cleanup(c); }
  async function open() {
    if (ctx) return;
    const tried = [];
    for (const m of [devicePath, await detect()].filter((x, i, a) => x && a.indexOf(x) === i)) {
      try { ctx = await getApi().init(m); return; } catch (e) { tried.push(m + ': ' + e.message); }
    }
    throw new TseError('Swissbit-TSE nicht gefunden (' + (tried.join('; ') || 'kein Laufwerk, NARA_TSE_PATH setzen') + ')', 24);
  }
  async function ensure() {
    if (locked) throw new TseError('TSE gesperrt: ' + locked, 0x1100);
    try {
      await open();
      const a = getApi();
      if (!started) {
        const creds = readCreds(credFile);
        if (!creds || !creds.adminPin) throw new TseError('TSE-Zugangsdaten fehlen (' + credFile + '). Erst scripts/tse-setup.mjs ausführen.');
        const st = (await a.readInfo(ctx)).initializationState;
        if (st !== 1) throw new TseError('TSE ist nicht eingerichtet (Status ' + st + '). scripts/tse-setup.mjs ausführen.');
        await a.startup(ctx, clientId, creds.adminPin);
        started = true; lastSelfTest = lastTimeSync = now();
      } else if (now() - lastSelfTest > SELF_TEST_EVERY_MS) {
        const creds = readCreds(credFile);
        await a.startup(ctx, clientId, creds.adminPin); lastSelfTest = lastTimeSync = now();
      } else if (now() - lastTimeSync > TIME_SYNC_EVERY_MS) {
        await a.updateTime(ctx, Math.floor(now() / 1000)); lastTimeSync = now();
      }
      lastError = null;
    } catch (e) {
      lastError = e;
      if (e && AUTH_ERRORS.has(e.code)) locked = e.message + ' — keine weiteren Versuche (PUK-Schutz). Neustart nach Klärung nötig.';
      if (!e || LOST_ERRORS.has(e.code) || /nicht gefunden/.test(e.message)) await reset();
      throw e;
    }
  }
  const guard = async (f) => { try { return await f(); } catch (e) { if (e && LOST_ERRORS.has(e.code)) await reset(); throw e; } };
  const iso = sec => new Date(sec * 1000).toISOString();

  if (background && api === null && fs.existsSync(defaultDll(sdkDir))) {
    setImmediate(() => run(ensure).catch(e => log('[NARA][TSE] Start:', e.message)));
    setInterval(() => run(ensure).catch(e => log('[NARA][TSE] Wartung:', e.message)), MAINTAIN_EVERY_MS).unref();
  }

  return {
    provider: 'SWISSBIT', devicePath,
    info: () => run(() => guard(async () => {
      await ensure();
      const i = await getApi().readInfo(ctx);
      cached = { simulated: false, serial: i.serialHex, publicKey: i.publicKeyB64, signatureAlgorithm: i.signatureAlgorithm, timeFormat: i.timeFormat,
        signatureCounter: i.createdSignatures, remainingSignatures: i.remainingSignatures, capacityUsedPercent: i.capacityUsedPercent,
        openTransactions: i.startedTransactions, firmware: i.firmware, certificationId: i.certificationId };
      return cached;
    })),
    startTransaction: ({ clientId: c = clientId, processType = '', processData = '' } = {}) => run(() => guard(async () => {
      await ensure();
      const r = await getApi().tx('start', ctx, { clientId: c, processType, processData });
      return { transactionNumber: r.transactionNumber, logTime: iso(r.logTimeSec), signatureCounter: r.signatureCounter };
    })),
    finishTransaction: ({ clientId: c = clientId, transactionNumber, processType = '', processData = '' } = {}) => run(() => guard(async () => {
      await ensure();
      const r = await getApi().tx('finish', ctx, { clientId: c, transactionNumber, processType, processData });
      return { transactionNumber: r.transactionNumber, logTime: iso(r.logTimeSec), signatureCounter: r.signatureCounter, signature: r.signature.toString('base64') };
    })),
    listStarted: (c = clientId) => run(() => guard(async () => { await ensure(); return getApi().listStarted(ctx, c); })),
    exportTar: (file) => run(() => guard(async () => { await ensure(); await getApi().exportTar(ctx, file); return { file }; })),
    state: () => ({ started, locked, lastError: lastError ? lastError.message : '' }),
    close: () => run(reset),
  };
}

// ---------- أول تهيئة (بس من scripts/tse-setup.mjs) ----------
// بتحفظ الـ PIN/PUK بالملف قبل أي استدعاء، وبتوقف عند أول خطأ. نفس الوسائط لازم بكل إعادة محاولة (شرط الـ SDK).
async function setup({ api, mount, seed, clientId = 'FLAMO-KASSE-1', credFile = credFileDefault(), log = console.log }) {
  if (!seed) throw new TseError('Seed fehlt');
  let creds = readCreds(credFile);
  if (creds && creds.seed !== seed) throw new TseError('Seed passt nicht zur vorhandenen Datei ' + credFile + ' — nichts getan. Falls der erste Versuch am falschen Seed scheiterte: Datei von Hand löschen und mit dem richtigen Seed neu starten.');
  const ctx = await api.init(mount);
  try {
    const info = await api.readInfo(ctx);
    if (info.initializationState === 1) throw new TseError('TSE ist schon eingerichtet — nichts getan.');
    if (info.initializationState !== 0) throw new TseError('TSE-Status ' + info.initializationState + ' (stillgelegt?) — nichts getan.');
    if (!creds) {
      creds = { clientId, seed, adminPuk: digits(6), adminPin: digits(5), timeAdminPin: digits(5), tseSerial: info.serialHex, createdAt: new Date().toISOString() };
      writeCreds(credFile, creds);
      log('Zugangsdaten gespeichert in ' + credFile);
    } else log('Vorhandene Zugangsdaten wiederverwendet (Fortsetzung): ' + credFile);
    await api.setup(ctx, { seed: creds.seed, puk: creds.adminPuk, pin: creds.adminPin, timePin: creds.timeAdminPin, clientId: creds.clientId });
    const after = await api.readInfo(ctx);
    return { creds, info: after };
  } finally { await api.cleanup(ctx); }
}

module.exports = { create, setup, makeApi, detectDrive, readCreds, TseError, defaultDll };
