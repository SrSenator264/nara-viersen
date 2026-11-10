'use strict';
// tse-swissbit.js — الـ Swissbit USB-TSE الحقيقي (نفس واجهة tse-sim.js).
// ⏳ لسا مو مبني: بيستنى SDK تبع Swissbit (WormAPI.dll لويندوز، نسخة 6.0 أو أحدث) من البائع أو من Swissbit.
// مكتبة Swissbit ملكية خاصة: بتنحط بمجلد tse-sdk/ على كمبيوتر المحل، وهاد المجلد بـ .gitignore (ممنوع يرتفع على GitHub).
// لحد ما يجي الـ SDK: كل استدعاء بيرمي خطأ واضح، والكاشير بيكمل البيع بحالة "TSE ausgefallen" مع تنبيه Telegram.
//
// لما يوصل الـ SDK، هون بينكتب (حسب توثيق الـ SDK، مو من الذاكرة):
//   - تحميل WormAPI.dll (مثلاً عبر koffi) وفتح الـ TSE على حرف الدرايف (NARA_TSE_PATH أو بحث تلقائي عن الدرايف)
//   - info(): الرقم التسلسلي، المفتاح العام، عدّاد التواقيع، السعة الباقية
//   - startTransaction / finishTransaction / listStarted بنفس الشكل اللي برجّعه tse-sim.js
//   - تسجيل الكاشير (clientId)، تحديث الوقت، والـ self-test حسب متطلبات الـ SDK
const fs = require('node:fs'), path = require('node:path');

function create({ sdkDir = path.join(__dirname, 'tse-sdk'), devicePath = process.env.NARA_TSE_PATH || '' } = {}) {
  const dll = path.join(sdkDir, 'WormAPI.dll');
  const missing = () => {
    if (!fs.existsSync(dll)) return new Error('Swissbit-SDK fehlt (' + dll + '). Siehe plans/PLAN_TSE_SWISSBIT.md');
    return new Error('Swissbit-Anbindung noch nicht programmiert (SDK vorhanden, Treiber folgt).');
  };
  const fail = async () => { throw missing(); };
  return { provider: 'SWISSBIT', devicePath, info: fail, startTransaction: fail, finishTransaction: fail, listStarted: fail };
}

module.exports = { create };
