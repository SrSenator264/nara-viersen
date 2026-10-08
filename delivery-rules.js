'use strict';
// delivery-rules.js — قواعد التوصيل: مناطق (PLZ)، رسوم الزبون، الحد الأدنى للطلب، وأجر السائق.
// يشتغل بالسيرفر (require) وبالمتصفح (window.NARA_DELIVERY_RULES). كل المبالغ بالسنت (أعداد صحيحة).
//
// فكرة التصميم:
//  - القواعد إعدادات (config) مو كود، وكل تعديل يرفع رقم النسخة (version).
//  - كل طلب بيخزّن سجل أجره (orderPayRecord) مع رقم نسخة القاعدة، فتغيير القاعدة ما بيأثر على الطلبات القديمة.
//  - عداد العدالة بيستعمل standardPay (الأجر القياسي) مو أجر السائق الشخصي، فاختلاف مستوى السائقين ما بيخرّب العدالة.
//  - أجر السائق ما بيظهر لتطبيق الموظفين (publicZones ما فيها أجور).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NARA_DELIVERY_RULES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PAY_RULES = ['zone', 'km'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const isCents = v => Number.isInteger(v) && v >= 0;

  // القيم الافتراضية من كلام صاحب المطعم (8 تشرين الأول 2026). كلها قابلة للتعديل من الإعدادات.
  function defaultConfig() {
    return {
      version: 1,
      updatedAt: null,
      payRule: 'zone', // 'zone' = أجر حسب المنطقة (الحالي) | 'km' = حسب شرائح الكيلومتر (لاحقاً)
      kmTiers: [
        { upToKm: 5, cents: 100 },
        { upToKm: 7, cents: 150 },
        { upToKm: 10, cents: 300 },
      ],
      zones: [
        // أجر السائق القياسي مفترض = رسم الزبون (يحتاج تأكيد). ممكن يتعدّل بشكل منفصل.
        { id: 'viersen-core', name: 'Viersen 41747 / 41748', postalCodes: ['41747', '41748'], customerFeeCents: 100, minOrderCents: 1500, driverPayCents: 100 },
        { id: 'viersen-41749', name: 'Viersen 41749', postalCodes: ['41749'], customerFeeCents: 200, minOrderCents: 2000, driverPayCents: 200 },
        { id: 'viersen-41751', name: 'Viersen 41751', postalCodes: ['41751'], customerFeeCents: 300, minOrderCents: 2500, driverPayCents: 300 },
        // منطقة واحدة من بداية مونشنغلادباخ. الـPLZ = 41063، رسم الزبون 4€، فما بتشتغل لحد ما تنضبط.
        { id: 'moenchengladbach-start', name: 'Mönchengladbach (Anfang)', postalCodes: ['41063'], customerFeeCents: 400, minOrderCents: 3000, driverPayCents: 400 },
      ],
    };
  }

  function normalizePostal(v) {
    const s = String(v ?? '').replace(/\s+/g, '');
    return /^\d{5}$/.test(s) ? s : '';
  }

  function validateConfig(cfg) {
    const errors = [];
    if (!cfg || typeof cfg !== 'object') return { ok: false, errors: ['config must be an object'] };
    if (!PAY_RULES.includes(cfg.payRule)) errors.push(`payRule must be one of ${PAY_RULES.join(', ')}`);
    if (!Array.isArray(cfg.zones) || !cfg.zones.length) errors.push('zones must be a non-empty array');
    const ids = new Set(), plzs = new Map();
    for (const z of Array.isArray(cfg.zones) ? cfg.zones : []) {
      const id = String(z?.id ?? '');
      if (!id) { errors.push('zone id is required'); continue; }
      if (ids.has(id)) errors.push(`duplicate zone id: ${id}`);
      ids.add(id);
      if (!Array.isArray(z.postalCodes)) errors.push(`zone ${id}: postalCodes must be an array`);
      for (const p of Array.isArray(z.postalCodes) ? z.postalCodes : []) {
        if (!/^\d{5}$/.test(String(p))) errors.push(`zone ${id}: invalid postal code "${p}"`);
        else if (plzs.has(p)) errors.push(`postal code ${p} is in both ${plzs.get(p)} and ${id}`);
        else plzs.set(p, id);
      }
      if (z.customerFeeCents !== null && !isCents(z.customerFeeCents)) errors.push(`zone ${id}: customerFeeCents must be a non-negative integer or null`);
      if (!isCents(z.minOrderCents)) errors.push(`zone ${id}: minOrderCents must be a non-negative integer`);
      if (!isCents(z.driverPayCents)) errors.push(`zone ${id}: driverPayCents must be a non-negative integer`);
    }
    if (!Array.isArray(cfg.kmTiers)) errors.push('kmTiers must be an array');
    else {
      let prev = 0;
      for (const t of cfg.kmTiers) {
        if (!(Number(t?.upToKm) > prev)) errors.push(`kmTiers must be strictly ascending (problem at ${t?.upToKm})`);
        else prev = Number(t.upToKm);
        if (!isCents(t?.cents)) errors.push(`kmTiers: cents must be a non-negative integer (tier ${t?.upToKm})`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function findZone(cfg, postalCode) {
    const plz = normalizePostal(postalCode);
    if (!plz) return null;
    return (cfg.zones || []).find(z => (z.postalCodes || []).includes(plz)) || null;
  }

  // عرض الزبون/الكاشير: رسم + حد أدنى. بدون أي أجور. الاستلام من المطعم بدون رسم ولا حد أدنى.
  function quote(cfg, { postalCode, subtotalCents, type } = {}) {
    const t = String(type || 'delivery').toLowerCase();
    const subtotal = Math.max(0, Math.round(Number(subtotalCents) || 0));
    if (t === 'pickup') return { ok: true, type: 'pickup', zone: null, customerFeeCents: 0, minOrderCents: 0, shortfallCents: 0, subtotalCents: subtotal, totalCents: subtotal, reason: null };
    const plz = normalizePostal(postalCode);
    if (!plz) return { ok: false, type: 'delivery', reason: 'POSTAL_CODE_INVALID', zone: null, subtotalCents: subtotal };
    const zone = findZone(cfg, plz);
    if (!zone) return { ok: false, type: 'delivery', reason: 'OUT_OF_AREA', postalCode: plz, zone: null, subtotalCents: subtotal };
    if (zone.customerFeeCents === null || zone.customerFeeCents === undefined) return { ok: false, type: 'delivery', reason: 'ZONE_NOT_CONFIGURED', postalCode: plz, zone: { id: zone.id, name: zone.name }, subtotalCents: subtotal };
    const shortfall = Math.max(0, zone.minOrderCents - subtotal);
    return {
      ok: shortfall === 0, type: 'delivery', reason: shortfall ? 'BELOW_MINIMUM' : null, postalCode: plz,
      zone: { id: zone.id, name: zone.name }, customerFeeCents: zone.customerFeeCents, minOrderCents: zone.minOrderCents,
      shortfallCents: shortfall, subtotalCents: subtotal, totalCents: subtotal + zone.customerFeeCents,
    };
  }

  function kmTier(cfg, km) {
    const k = Number(km);
    if (km === null || km === undefined || km === '' || !Number.isFinite(k) || k < 0) return { cents: null, reason: 'KM_MISSING' };
    const tier = (cfg.kmTiers || []).find(t => k <= t.upToKm);
    return tier ? { cents: tier.cents } : { cents: null, reason: 'OVER_MAX_KM' };
  }

  // الأجر القياسي لطلب (بدون أي تعديل شخصي). هاد اللي بيستعمله عداد العدالة.
  function standardPay(cfg, { zoneId, km } = {}) {
    if (cfg.payRule === 'km') return kmTier(cfg, km);
    const zone = (cfg.zones || []).find(z => z.id === zoneId);
    return zone ? { cents: zone.driverPayCents } : { cents: null, reason: 'ZONE_UNKNOWN' };
  }

  // أجر سائق محدد: تعديل شخصي لكل منطقة (employee.deliveryPay.zoneCents) أو معامل (factor)، وإلا الأجر القياسي.
  function driverPay(cfg, employee, { zoneId, km } = {}) {
    const pay = employee?.deliveryPay || {};
    if (cfg.payRule === 'zone' && pay.zoneCents && isCents(pay.zoneCents[zoneId])) return { cents: pay.zoneCents[zoneId], source: 'driver-override' };
    const base = standardPay(cfg, { zoneId, km });
    if (base.cents === null) return { cents: null, reason: base.reason, source: null };
    const factor = Number(pay.factor);
    if (Number.isFinite(factor) && factor > 0 && factor !== 1) return { cents: Math.round(base.cents * factor), source: 'driver-factor' };
    return { cents: base.cents, source: 'rule' };
  }

  // سجل الأجر اللي بينحفظ مع الطلب وقت إنشائه (ما بيتغير لو تغيّرت القاعدة بعدين).
  function orderPayRecord(cfg, employee, { postalCode, km } = {}) {
    const zone = findZone(cfg, postalCode), zoneId = zone ? zone.id : null;
    const kmNum = (km === null || km === undefined || km === '') ? null : (Number.isFinite(Number(km)) ? Number(km) : null);
    const std = standardPay(cfg, { zoneId, km: kmNum });
    const pay = driverPay(cfg, employee, { zoneId, km: kmNum });
    return {
      postalCode: normalizePostal(postalCode) || null, zoneId, km: kmNum,
      payRule: cfg.payRule, ruleVersion: cfg.version,
      standardPayCents: std.cents, driverPayCents: pay.cents, paySource: pay.source || null,
      payReason: pay.reason || std.reason || null,
    };
  }

  // تحديث الإعدادات: بيرفع النسخة وبيرفض أي إعداد غير صالح، وما بيعدّل الكائن القديم.
  function updateConfig(current, patch, now = new Date()) {
    const next = clone(current);
    for (const key of ['payRule', 'kmTiers', 'zones']) if (patch && patch[key] !== undefined) next[key] = clone(patch[key]);
    next.version = (Number(current.version) || 0) + 1;
    next.updatedAt = now.toISOString();
    const check = validateConfig(next);
    if (!check.ok) throw new Error('Invalid delivery config: ' + check.errors.join('; '));
    return next;
  }

  // المناطق للزبون وتطبيق الموظفين: بدون أجور السائقين، وبدون مناطق ما انضبطت بعد.
  function publicZones(cfg) {
    return (cfg.zones || [])
      .filter(z => (z.postalCodes || []).length && z.customerFeeCents !== null && z.customerFeeCents !== undefined)
      .map(z => ({ id: z.id, name: z.name, postalCodes: [...z.postalCodes], customerFeeCents: z.customerFeeCents, minOrderCents: z.minOrderCents }));
  }

  return { PAY_RULES, defaultConfig, validateConfig, normalizePostal, findZone, quote, kmTier, standardPay, driverPay, orderPayRecord, updateConfig, publicZones };
});
