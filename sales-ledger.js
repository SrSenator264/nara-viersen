'use strict';
// sales-ledger.js — سجل المبيعات للمحاسب، قسمين منفصلين:
//   own      = مبيعات فلامو/NARA المحلية (كاشير + موقع): من الدفعات، مع حالة TSE وإيصال لكل عملية. هاد السجل القانوني (Kassen).
//   platform = طلبات المنصات (Lieferando, Uber Eats, Wolt, Lanch وطلبات Loco عبرهم): بدون ترحيل TSE، المرجع كشف المنصة.
// أيام العمل حسب business-day (05:00). طلبات التجربة/التدريب ما بتدخل أبداً.
// تنبيه: مو استشارة قانونية؛ المحاسب بيأكّد التفاصيل.

const bizDay = require('./business-day.js');
const PLATFORMS = new Set(['LIEFERANDO', 'UBER_EATS', 'WOLT', 'LANCH']);
const up = v => String(v == null ? '' : v).toUpperCase();
const eur = c => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
const iso = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

function platformOf(o) {
  const p = up(o.platform || o.source);
  if (/LIEFERANDO/.test(p)) return 'LIEFERANDO';
  if (/UBER/.test(p)) return 'UBER_EATS';
  if (/WOLT/.test(p)) return 'WOLT';
  if (/LANCH/.test(p)) return 'LANCH';
  const ch = up(o.channel); if (PLATFORMS.has(ch)) return ch; // طلبات Sides/Loco: القناة هي المنصة
  return null;
}
const brandOf = o => /loco/i.test(String(o.brand || o.brandName || '')) || up(o.station) === 'LOCO' ? 'Loco Chicken' : /smash/i.test(String(o.brand || o.brandName || '')) ? 'Just Smashed' : 'IU GENE';

function build(data, from, to) {
  const orders = data.orders || [], byId = new Map(orders.map(o => [String(o.id), o]));
  const inRange = d => { const day = bizDay.dayOf(d); return day >= from && day <= to; };
  const fisc = new Map((data.fiscalTransactions || []).filter(f => f.paymentId).map(f => [f.paymentId, f]));
  const rec = new Map((data.receipts || []).filter(r => r.paymentId).map(r => [r.paymentId, r]));

  const own = [];
  for (const p of data.payments || []) {
    if (p.isTest || p.status !== 'COMPLETED' || !inRange(p.createdAt)) continue;
    const o = byId.get(String(p.orderId)) || {};
    if (o.isTest || o.training || platformOf(o)) continue;
    const lines = Array.isArray(p.paymentLines) && p.paymentLines.length ? p.paymentLines : [{ method: p.method, amountCents: p.amountCents }];
    const sum = m => lines.filter(l => up(l.method) === m).reduce((s, l) => s + Number(l.amountCents || 0), 0);
    const f = fisc.get(p.id) || {}, r = rec.get(p.id) || {};
    own.push({
      date: iso(p.createdAt), businessDay: bizDay.dayOf(p.createdAt), orderCode: o.displayCode || '', orderId: String(p.orderId),
      channel: o.source === 'WEB' || /^WEB/.test(up(o.source)) ? 'Website' : 'Kasse', type: o.type || o.orderType || '',
      grossCents: Number(p.grossAmountCents ?? p.amountCents ?? 0), cashCents: sum('CASH'), cardCents: sum('CARD'), otherCents: Number(p.amountCents || 0) - sum('CASH') - sum('CARD'),
      tipCents: Number(p.tipCents || 0), receiptNumber: r.receiptNumber || '', tseStatus: f.status || '', tseTransaction: f.transactionNumber || f.tseTransactionNumber || '',
    });
  }

  const platform = [];
  for (const o of orders) {
    const pf = platformOf(o); if (!pf || o.isTest) continue;
    const at = o.placedAt || o.createdAt || o.acceptedAt; if (!inRange(at)) continue;
    const cancelled = up(o.status) === 'CANCELLED';
    platform.push({
      date: iso(at), businessDay: bizDay.dayOf(at), platform: pf, brand: brandOf(o), platformCode: String(o.externalOrderCode || ''), orderCode: o.displayCode || '',
      status: cancelled ? 'CANCELLED' : 'OK', grossCents: cancelled ? 0 : Number(o.totalCents || 0), deliveryFeeCents: Number(o.fees?.delivery ?? o.deliveryFeeCents ?? 0),
      discountCents: Number(o.discountsCents ?? o.discountCents ?? 0), serviceFeeCents: Number(o.fees?.service || 0), tipCents: Number(o.tipCents || 0),
      payment: up(o.payment?.method || o.paymentMethod || ''), cashDueCents: Number(o.cashDueCents || 0), paidOnPlatform: /PAID_ON_PLATFORM/.test(up(o.externalPaymentStatus || o.paymentStatus)),
    });
  }
  own.sort((a, b) => a.date.localeCompare(b.date)); platform.sort((a, b) => a.date.localeCompare(b.date));

  const sumBy = (rows, key, f) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + f(r); return m; }, {});
  return {
    from, to,
    own: { rows: own, totals: { count: own.length, grossCents: own.reduce((s, r) => s + r.grossCents, 0), cashCents: own.reduce((s, r) => s + r.cashCents, 0), cardCents: own.reduce((s, r) => s + r.cardCents, 0), tseMissing: own.filter(r => !r.tseTransaction).length } },
    platform: { rows: platform, totals: { count: platform.filter(r => r.status === 'OK').length, cancelled: platform.filter(r => r.status === 'CANCELLED').length, grossCents: platform.reduce((s, r) => s + r.grossCents, 0), byPlatform: sumBy(platform, 'platform', r => r.grossCents), byBrand: sumBy(platform, 'brand', r => r.grossCents) } },
  };
}


// ملخص شامل لكل المبيعات (محلي + منصات) للتقرير
function summary(data, l) {
  const days = {};
  const slot = d => (days[d] ||= { day: d, ownCents: 0, platformCents: 0, ownCount: 0, platformCount: 0, byPlat: {} });
  const addP = (x, k, c) => { const e = (x.byPlat[k] ||= { cents: 0, count: 0 }); e.cents += c; e.count++; };
  for (const r of l.own.rows) { const x = slot(r.businessDay); x.ownCents += r.grossCents; x.ownCount++; addP(x, r.channel === 'Website' ? 'WEBSITE' : 'KASSE', r.grossCents); }
  for (const r of l.platform.rows) if (r.status === 'OK') { const x = slot(r.businessDay); x.platformCents += r.grossCents; x.platformCount++; addP(x, r.brand === 'Loco Chicken' ? 'LOCO' : (r.platform || 'OTHER'), r.grossCents); }
  const byDay = Object.values(days).sort((a, b) => a.day.localeCompare(b.day)).map(x => ({ ...x, totalCents: x.ownCents + x.platformCents, count: x.ownCount + x.platformCount }));
  const ownCents = l.own.totals.grossCents, platCents = l.platform.totals.grossCents;
  const brand = {}; brand['IU GENE (Kasse/Web)'] = ownCents; for (const [k, v] of Object.entries(l.platform.totals.byBrand)) brand[k + ' (Plattformen)'] = v;
  const online = l.platform.rows.filter(r => r.status === 'OK' && r.paidOnPlatform).reduce((s, r) => s + r.grossCents, 0);
  const platCash = l.platform.rows.filter(r => r.status === 'OK').reduce((s, r) => s + r.cashDueCents, 0);
  // أكتر الأصناف مبيعاً (كل القنوات، بدون ملغي/تجربة)
  const ids = new Set([...l.own.rows.map(r => r.orderId)]); const items = {};
  const okPlat = new Set(l.platform.rows.filter(r => r.status === 'OK').map(r => r.orderCode));
  for (const o of data.orders || []) {
    if (o.isTest || up(o.status) === 'CANCELLED') continue;
    if (!(ids.has(String(o.id)) || okPlat.has(o.displayCode))) continue;
    for (const i of o.cart || []) { if (/FEE|TIP/.test(up(i.kind))) continue; const n = String(i.name || '').trim(); if (!n) continue; const q = Number(i.quantity) || 1; if (q > 50 || n.length > 70 || /^(lieferando |uber |wolt )?order\b|accepted at/i.test(n)) continue; (items[n] ||= { name: n, qty: 0, cents: 0 }); items[n].qty += q; items[n].cents += Number(i.totalCents) || (Number(i.unitCents) || 0) * q; }
  }
  const topItems = Object.values(items).sort((a, b) => b.qty - a.qty).slice(0, 20);
  const orders = l.own.totals.count + l.platform.totals.count, gross = ownCents + platCents;
  return {
    totals: { grossCents: gross, orders, avgCents: orders ? Math.round(gross / orders) : 0, ownCents, platformCents: platCents, cancelled: l.platform.totals.cancelled, ownTseMissing: l.own.totals.tseMissing },
    payment: { ownCashCents: l.own.totals.cashCents, ownCardCents: l.own.totals.cardCents, platformOnlineCents: online, platformCashCents: platCash },
    byPlatform: l.platform.totals.byPlatform, byBrand: brand, byDay, topItems,
  };
}

const q = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (head, rows) => '﻿' + [head.join(';')].concat(rows.map(r => r.map(q).join(';'))).join('\r\n') + '\r\n';
function csvOwn(l) {
  return toCsv(['Datum', 'Geschäftstag', 'Beleg/Bestellung', 'Kanal', 'Brutto EUR', 'Bar EUR', 'Karte EUR', 'Sonstige EUR', 'Trinkgeld EUR', 'Bonnummer', 'TSE-Status', 'TSE-Transaktion'],
    l.own.rows.map(r => [r.date, r.businessDay, r.orderCode, r.channel, eur(r.grossCents), eur(r.cashCents), eur(r.cardCents), eur(r.otherCents), eur(r.tipCents), r.receiptNumber, r.tseStatus, r.tseTransaction]));
}
function csvPlatform(l) {
  return toCsv(['Datum', 'Geschäftstag', 'Plattform', 'Marke', 'Plattform-Bestellnr.', 'Bestellcode', 'Status', 'Brutto EUR', 'Lieferkosten EUR', 'Rabatt EUR', 'Servicegebühr EUR', 'Trinkgeld EUR', 'Zahlung', 'Bar zu kassieren EUR', 'Online bezahlt'],
    l.platform.rows.map(r => [r.date, r.businessDay, r.platform, r.brand, r.platformCode, r.orderCode, r.status, eur(r.grossCents), eur(r.deliveryFeeCents), eur(r.discountCents), eur(r.serviceFeeCents), eur(r.tipCents), r.payment, eur(r.cashDueCents), r.paidOnPlatform ? 'ja' : 'nein']));
}
module.exports = { build, summary, csvOwn, csvPlatform, platformOf, brandOf };
