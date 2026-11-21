'use strict';
// kassenbuch.js — Kassenbuch (دفتر الصندوق) لشهر، مبني من التقفيلات المحفوظة (سجلات ثابتة ما بتتعدّل). قراءة بس.
// لكل يوم: البداية، المبيعات النقدية، البقشيش النقدي، المرتجعات، الإيداعات، المصاريف/السحوبات، المتوقع، المعدود، الفرق، المسحوب، الباقي.
const pad = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const int = v => Math.round(Number(v) || 0);
const eur = c => (int(c) / 100).toFixed(2).replace('.', ',');

function build(data, { year, month }) {
  const from = `${year}-${pad(month)}-01`, to = `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
  const closings = (data.dayClosings || []).filter(s => s && s.mode !== 'TRAINING' && s.type === 'CLOSING' && s.day >= from && s.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1));
  const rows = closings.map(s => {
    const c = (s.report && s.report.cash) || {};
    return { day: s.day, number: s.number || '', openingCents: int(c.openingCents), salesCents: int(c.salesCents), tipCents: int(c.tipCents), refundsCents: int(c.refundsCents), depositsCents: int(c.depositsCents), withdrawalsCents: int(c.withdrawalsCents), expectedCents: int(c.expectedCents), countedCents: int(c.countedCents), differenceCents: int(c.differenceCents), takeOutCents: int(c.takeOutCents), leaveCents: int(c.leaveCents) };
  });
  // أيام فيها بيع نقدي بالكاشير بس ما في تقفيلة
  const closed = new Set(rows.map(r => r.day)), missing = new Set();
  const orders = new Map((data.orders || []).map(o => [String(o.id), o]));
  const bizDay = require('./business-day.js');
  for (const p of data.payments || []) {
    if (p.isTest || p.status !== 'COMPLETED') continue;
    const o = orders.get(String(p.orderId)) || {}; if (o.isTest || o.training) continue;
    const d = bizDay.dayOf(p.createdAt); if (d >= from && d <= to && !closed.has(d)) missing.add(d);
  }
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  return { year, month, from, to, rows, missingDays: [...missing].sort(), totals: { salesCents: sum('salesCents'), tipCents: sum('tipCents'), refundsCents: sum('refundsCents'), depositsCents: sum('depositsCents'), withdrawalsCents: sum('withdrawalsCents'), differenceCents: sum('differenceCents'), takeOutCents: sum('takeOutCents') }, openingCents: rows.length ? rows[0].openingCents : null, closingCents: rows.length ? rows[rows.length - 1].leaveCents : null };
}

function csv(k) {
  const head = ['Datum', 'Z-Nr', 'Anfangsbestand', 'Bareinnahmen', 'Trinkgeld bar', 'Storno/Erstattung bar', 'Einlagen', 'Ausgaben/Entnahmen', 'Soll-Bestand', 'Ist-Bestand', 'Differenz', 'Abschöpfung', 'Endbestand'];
  const lines = k.rows.map(r => [r.day, r.number, eur(r.openingCents), eur(r.salesCents), eur(r.tipCents), eur(r.refundsCents), eur(r.depositsCents), eur(r.withdrawalsCents), eur(r.expectedCents), eur(r.countedCents), eur(r.differenceCents), eur(r.takeOutCents), eur(r.leaveCents)].join(';'));
  return '﻿' + [head.join(';'), ...lines].join('\r\n') + '\r\n';
}

module.exports = { build, csv };
