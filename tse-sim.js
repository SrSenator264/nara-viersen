'use strict';
// tse-sim.js — محاكي TSE (نفس واجهة tse-swissbit.js) لحتى نبني ونختبر الربط قبل ما توصل مكتبة Swissbit.
// ⚠️ مو TSE حقيقي: كل نتيجة عليها simulated:true، والوصل بيكتب "TSE-SIMULATION". ممنوع نعتمده قانونياً.
// الحالة بتنحفظ بملف (data/tse-sim.json، مو على GitHub): العدّادات والمعاملات المفتوحة بتضل بعد إعادة التشغيل
// (هيك منقدر نجرّب "انقطعت الكهربا بنص معاملة").
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const ALG = 'ecdsa-plain-SHA384', TIME_FORMAT = 'unixTime';

function create({ file, now = () => new Date() } = {}) {
  if (!file) throw new Error('tse-sim: file fehlt');
  let st = null;
  const flags = { connected: true, failFinish: false };

  function load() {
    if (st) return st;
    try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { st = null; }
    if (!st || !st.privateKey) {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
      const pubRaw = publicKey.export({ format: 'der', type: 'spki' });
      st = {
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }),
        publicKey: pubRaw.toString('base64'),
        serial: crypto.createHash('sha256').update(pubRaw).digest('hex'),
        transactionCounter: 0, signatureCounter: 0, open: {}, clients: [],
      };
      save();
    }
    return st;
  }
  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
    fs.renameSync(tmp, file);
  }
  function check() {
    // ملف "offline" جنب الحالة = كأنو الـ USB انشال (للتجربة اليدوية بدون كود)
    if (!flags.connected || fs.existsSync(file + '.offline')) throw new Error('TSE nicht verbunden (Simulation)');
    return load();
  }
  const iso = () => now().toISOString();
  function sign(s, parts) {
    s.signatureCounter += 1;
    const msg = [s.serial, s.signatureCounter, ...parts].join('|');
    const sig = crypto.sign('sha384', Buffer.from(msg), { key: s.privateKey, dsaEncoding: 'ieee-p1363' });
    return { signatureCounter: s.signatureCounter, signature: sig.toString('base64'), signedMessage: msg };
  }

  return {
    provider: 'SIMULATION',
    async info() {
      const s = check();
      return { simulated: true, serial: s.serial, publicKey: s.publicKey, signatureAlgorithm: ALG, timeFormat: TIME_FORMAT,
        signatureCounter: s.signatureCounter, transactionCounter: s.transactionCounter, remainingSignatures: 20000000 - s.signatureCounter,
        capacityUsedPercent: 0, openTransactions: Object.keys(s.open).length };
    },
    async startTransaction({ clientId, processType = '', processData = '' }) {
      const s = check();
      s.transactionCounter += 1;
      const transactionNumber = s.transactionCounter, logTime = iso();
      if (!s.clients.includes(clientId)) s.clients.push(clientId);
      const sg = sign(s, ['StartTransaction', clientId, transactionNumber, processType, processData, logTime]);
      s.open[transactionNumber] = { clientId, startTime: logTime };
      save();
      return { transactionNumber, logTime, signatureCounter: sg.signatureCounter };
    },
    async finishTransaction({ clientId, transactionNumber, processType, processData }) {
      const s = check();
      if (flags.failFinish) throw new Error('Signatur fehlgeschlagen (Simulation)');
      const open = s.open[transactionNumber];
      if (!open) throw new Error('Transaktion ' + transactionNumber + ' ist nicht offen');
      if (open.clientId !== clientId) throw new Error('Transaktion gehört zu einer anderen Kasse');
      const logTime = iso();
      const sg = sign(s, ['FinishTransaction', clientId, transactionNumber, processType, processData, logTime]);
      delete s.open[transactionNumber];
      save();
      return { transactionNumber, startTime: open.startTime, logTime, signatureCounter: sg.signatureCounter, signature: sg.signature, signedMessage: sg.signedMessage };
    },
    async listStarted(clientId) {
      const s = check();
      return Object.entries(s.open).filter(([, v]) => !clientId || v.clientId === clientId).map(([n]) => Number(n));
    },
    // للاختبارات فقط
    _set(k, v) { flags[k] = v; },
  };
}

module.exports = { create, ALG, TIME_FORMAT };
