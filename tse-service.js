'use strict';
// tse-service.js — الربط بين الكاشير والـ TSE (KassenSichV). واجهة وحدة، والـ "سائق" قابل للتبديل:
//   NARA_TSE_MODE=off       (الافتراضي) ما في TSE: السلوك القديم (DEVELOPMENT_NOT_CONFIGURED، وصل DEV-)
//   NARA_TSE_MODE=sim       محاكي (tse-sim.js) للتجربة فقط — الوصل بيكتب "TSE-SIMULATION"، مو قانوني
//   NARA_TSE_MODE=swissbit  الـ USB الحقيقي (tse-swissbit.js، بيستنى SDK تبع Swissbit)
//   NARA_TSE_CLIENT_ID      رقم الكاشير المسجّل بالـ TSE (الافتراضي FLAMO-KASSE-1)
// قواعد:
// - وضع التدريب ما بيمرّ على الـ TSE أبداً (القرار بالسيرفر، مو هون).
// - الـ TSE ما بيوقّف البيع: إذا فشل أو انفصل أو تأخر → الدفعة بتنحفظ بحالة TSE_FAILED + تنبيه Telegram.
// - Storno = معاملة جديدة بمبالغ سالبة، ما بينمسح شي.
// - صيغة processData حسب DSFinV-K (Kassenbeleg-V1): Beleg^19%_7%_10,7%_5,5%_0%^Betrag:Bar_Betrag:Unbar
const path = require('node:path');
const DC = require('./day-closing.js');

const PROCESS_TYPE = 'Kassenbeleg-V1';
const RATE_INDEX = new Map([[19, 0], [7, 1], [10.7, 2], [5.5, 3], [0, 4]]);
const int = v => Math.round(Number(v) || 0);
const up = v => String(v || '').toUpperCase();
const fmt = c => (c < 0 ? '-' : '') + (Math.abs(int(c)) / 100).toFixed(2);

// توزيع مبلغ الدفعة على نسب الضريبة حسب أصناف الطلب (نفس منطق تقفيلة اليوم، بيشمل تقسيم المنيو 7/19)
function vatSplit(data, order, amountCents) {
  const { rateOf, splitOf, food } = DC.rateResolver(data || {});
  const weights = DC.weightsOf(order, rateOf, splitOf);
  const alloc = DC.allocate(Math.abs(int(amountCents)), weights, food);
  const out = [0, 0, 0, 0, 0];
  for (const [rate, cents] of alloc) {
    const i = RATE_INDEX.get(Number(rate));
    out[i == null ? 0 : i] += cents;
  }
  return amountCents < 0 ? out.map(c => -c) : out;
}

// Steuersatz je Warenkorb-Zeile für den Kassenbon (A = 7 %, B = 19 %): Menü (Essen + Getränk) hat zwei Sätze.
// Rein für die Anzeige; die Steuer-Wahrheit bleibt vatSplit/day-closing. Trinkgeld-Zeilen bekommen keinen Satz.
function annotateRates(data, order) {
  if (!order || !Array.isArray(order.cart)) return order;
  const { rateOf, splitOf } = DC.rateResolver(data || {});
  const cart = order.cart.map(it => {
    if (!it || typeof it !== 'object' || /TIP/.test(up(it.kind))) return it;
    const sp = splitOf(it), r = Number(rateOf(it, order));
    return { ...it, vatRates: sp ? [r, Number(sp.rate)] : [r] };
  });
  return { ...order, cart };
}

function paymentPart(payment) {
  const lines = Array.isArray(payment.paymentLines) && payment.paymentLines.length ? payment.paymentLines : [{ method: payment.method, amountCents: payment.amountCents }];
  let bar = 0, unbar = 0;
  for (const l of lines) { if (up(l.method) === 'CASH') bar += int(l.amountCents); else unbar += int(l.amountCents); }
  const parts = [];
  if (bar) parts.push(fmt(bar) + ':Bar');
  if (unbar) parts.push(fmt(unbar) + ':Unbar');
  return parts.length ? parts.join('_') : '0.00:Bar';
}

function processDataOf(data, order, payment) {
  return 'Beleg^' + vatSplit(data, order, int(payment.amountCents)).map(fmt).join('_') + '^' + paymentPart(payment);
}

// QR-Code nach DSFinV-K Anhang I
function qrOf(t) {
  return ['V0', t.clientId, t.processType || PROCESS_TYPE, t.processData || '', t.transactionNumber, t.signatureCounter,
    t.startTime, t.logTime, t.signatureAlgorithm, t.timeFormat, t.signature, t.publicKey].join(';');
}

function summaryOf(f) {
  if (f.status !== 'SIGNED') return { status: f.status, error: f.error || '', clientId: f.clientId || '', processData: f.processData || '' };
  return { status: 'SIGNED', processData: f.processData || '', simulated: !!f.simulated, clientId: f.clientId, serial: f.tseSerialNumber, transactionNumber: f.transactionNumber,
    signatureCounter: f.signatureCounter, start: f.startTime, finish: f.logTime, signature: f.signature, algorithm: f.signatureAlgorithm,
    timeFormat: f.timeFormat, publicKey: f.publicKey, qr: qrOf(f) };
}

// نتيجة التوقيع → سجل fiscal + الوصل (بيعدّل data مباشرة، المتصل بيقرأ ويكتب)
function applyResult(data, fiscalId, result, nowIso = new Date().toISOString()) {
  const f = (data.fiscalTransactions || []).find(x => x.id === fiscalId);
  if (!f) return {};
  if (result && result.ok) {
    Object.assign(f, { status: 'SIGNED', provider: result.provider, simulated: !!result.simulated, clientId: result.clientId,
      tseSerialNumber: result.serial, publicKey: result.publicKey, signatureAlgorithm: result.signatureAlgorithm, timeFormat: result.timeFormat,
      transactionNumber: result.transactionNumber, signatureCounter: result.signatureCounter, signature: result.signature,
      startTime: result.startTime, logTime: result.logTime, processType: result.processType, processData: result.processData, signedAt: nowIso });
    delete f.error;
  } else {
    Object.assign(f, { status: 'TSE_FAILED', error: String((result && result.error) || 'TSE nicht erreichbar').slice(0, 300), failedAt: nowIso });
    if (result && result.transactionNumber) f.openTransactionNumber = result.transactionNumber;
  }
  const receipt = (data.receipts || []).find(x => x.fiscalTransactionId === fiscalId);
  if (receipt) receipt.tse = summaryOf(f);
  return { fiscal: f, receipt };
}

// بعد إعادة التشغيل: دفعات بقيت PENDING (انقطعت الكهربا قبل التوقيع) → TSE_FAILED، ما بنضيّعها
function failPending(data, nowIso = new Date().toISOString()) {
  let n = 0;
  for (const f of data.fiscalTransactions || []) if (f.status === 'PENDING') { applyResult(data, f.id, { ok: false, error: 'Unterbrochen (Neustart/Stromausfall) — ohne Signatur' }, nowIso); n++; }
  return n;
}

// للطباعة: بيانات الـ TSE لكل وصل بهالطلب (الفاتورة المقسومة = أكتر من وصل)
function receiptsTseOf(data, orderId) {
  return (data.receipts || []).filter(r => String(r.orderId) === String(orderId) && r.tse && !r.training && !r.demo)
    .map(r => ({ receiptNumber: r.receiptNumber, type: r.type || 'SALE', amountCents: r.amountCents, ...r.tse }));
}

function create({ env = process.env, alerts = null, dataDir = path.join(__dirname, 'data'), driver = null, timeoutMs = 5000, log = console.error, now = () => new Date() } = {}) {
  const mode = String(env.NARA_TSE_MODE || 'off').toLowerCase();
  const clientId = String(env.NARA_TSE_CLIENT_ID || 'FLAMO-KASSE-1').slice(0, 30);
  const active = ['sim', 'swissbit'].includes(mode);
  if (active && !driver) driver = mode === 'sim' ? require('./tse-sim.js').create({ file: path.join(dataDir, 'tse-sim.json'), now }) : require('./tse-swissbit.js').create();
  let info = null;
  const alert = (key, text) => { try { if (alerts) alerts.send(key, text); else log('[NARA][TSE]', text); } catch (e) { /* Alarm darf nie den Verkauf stoppen */ } };
  const within = (p, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ': Zeitüberschreitung (' + timeoutMs + ' ms)')), timeoutMs))]);
  const msg = e => String((e && e.message) || e || 'Fehler').slice(0, 300);

  async function sign({ processType = PROCESS_TYPE, processData = '' } = {}) {
    if (!active) return { ok: false, error: 'TSE ist aus (NARA_TSE_MODE=off)' };
    let tx = null;
    try {
      if (!info) info = await within(driver.info(), 'TSE-Info');
      tx = await within(driver.startTransaction({ clientId, processType, processData: '' }), 'TSE-Start');
      const fin = await within(driver.finishTransaction({ clientId, transactionNumber: tx.transactionNumber, processType, processData }), 'TSE-Signatur');
      return { ok: true, provider: driver.provider, simulated: !!info.simulated, clientId, serial: info.serial, publicKey: info.publicKey,
        signatureAlgorithm: info.signatureAlgorithm, timeFormat: info.timeFormat, transactionNumber: tx.transactionNumber,
        signatureCounter: fin.signatureCounter, signature: fin.signature, startTime: fin.startTime || tx.logTime, logTime: fin.logTime, processType, processData };
    } catch (e) {
      info = null; // نقرأ الحالة من جديد بالمرة الجاية (ممكن الـ USB انشال وانرجع)
      alert('tse-sign', '⚠️ Flamo TSE: Beleg OHNE Signatur — ' + msg(e) + '\nDie Kasse läuft weiter. Bitte TSE-USB prüfen.');
      return { ok: false, error: msg(e), transactionNumber: tx && tx.transactionNumber };
    }
  }

  // معاملات بقيت مفتوحة بالـ TSE (انقطاع بنص البيع) → منسكّرها كـ "SonstigerVorgang" بدون مبلغ
  async function recover() {
    if (!active) return { closed: 0 };
    try {
      const open = await within(driver.listStarted(clientId), 'TSE-Liste');
      for (const n of open) await within(driver.finishTransaction({ clientId, transactionNumber: n, processType: 'SonstigerVorgang', processData: '' }), 'TSE-Abschluss');
      return { closed: open.length };
    } catch (e) { return { closed: 0, error: msg(e) }; }
  }

  async function status() {
    const base = { mode, active, clientId, provider: driver ? driver.provider : null };
    if (!active) return { ...base, connected: false };
    try { info = await within(driver.info(), 'TSE-Info'); return { ...base, connected: true, ...info }; }
    catch (e) { info = null; return { ...base, connected: false, error: msg(e) }; }
  }

  async function health() {
    const s = await status();
    if (!s.active) return s;
    if (!s.connected) alert('tse-offline', '⚠️ Flamo TSE nicht erreichbar: ' + (s.error || '') + '\nVerkäufe laufen ohne Signatur weiter. Bitte USB-Stick prüfen.');
    else if ((Number.isFinite(s.remainingSignatures) && s.remainingSignatures < 100000) || Number(s.capacityUsedPercent) >= 90)
      alert('tse-full', '⚠️ Flamo TSE ist fast voll (' + (s.capacityUsedPercent || '?') + ' %, ' + (s.remainingSignatures ?? '?') + ' Signaturen übrig). Bitte Export machen / Ersatz bestellen.');
    return s;
  }

  return { mode, active, clientId, provider: () => (driver ? driver.provider : null), sign, recover, status, health };
}

module.exports = { create, annotateRates, processDataOf, vatSplit, paymentPart, qrOf, summaryOf, applyResult, failPending, receiptsTseOf, PROCESS_TYPE, fmt };
