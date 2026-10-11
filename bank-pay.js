'use strict';
// bank-pay.js — Zahlung per Banküberweisung (Pay-first). Reine Logik, ohne I/O, daher testbar.
// Bankquelle ist austauschbar: jede Quelle (API, CSV, CAMT) liefert nur {date, amountCents, description, reference, senderName}.

const PAY_WINDOW_MIN = 15;

const str = v => (v == null ? '' : String(v)).trim();

// IBAN prüfen (Mod-97) und normalisieren
function normalizeIban(v) { return str(v).replace(/\s+/g, '').toUpperCase(); }
function isValidIban(v) {
  const s = normalizeIban(v);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of r) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

// Verwendungszweck = Bestellcode (z. B. W1A2B3). Kurz, eindeutig, tippfehlerarm.
function transferRef(order) { return str(order.displayCode).toUpperCase(); }

// EPC-QR (GiroCode) Inhalt — von allen deutschen Banking-Apps lesbar.
function girocode({ payee, iban, bic, amountCents, ref }) {
  const eur = (Math.round(Number(amountCents)) / 100).toFixed(2);
  return ['BCD', '002', '1', 'SCT', str(bic), str(payee).slice(0, 70), normalizeIban(iban), 'EUR' + eur, '', str(ref).slice(0, 140), '', ''].join('\n');
}

// Zahlungsdaten für die Kundenseite (nur, was der Kunde sehen darf)
function payInfo(order, cfg, now = new Date()) {
  const ref = transferRef(order);
  const until = order.payUntil ? new Date(order.payUntil) : null;
  const remainingSec = until ? Math.max(0, Math.round((until - now) / 1000)) : 0;
  const state = order.paymentStatus === 'PAID' ? 'PAID'
    : order.paymentStatus === 'EXPIRED' || order.status === 'CANCELLED' ? 'EXPIRED'
    : remainingSec <= 0 ? 'EXPIRED' : 'WAITING';
  return {
    state, code: ref, amountCents: order.totalCents, remainingSec,
    payee: cfg.payee, iban: normalizeIban(cfg.iban), bic: str(cfg.bic), reference: ref,
    giro: girocode({ payee: cfg.payee, iban: cfg.iban, bic: cfg.bic, amountCents: order.totalCents, ref }),
  };
}

// Neue Online-Überweisungsbestellung vorbereiten (wird NICHT an Küche gegeben, bis bezahlt)
function markAwaitingTransfer(order, now = new Date(), windowMin = PAY_WINDOW_MIN) {
  const o = { ...order };
  o.paymentMethod = 'TRANSFER';
  o.payment = { method: 'TRANSFER', paid: false, raw: 'web' };
  o.paymentStatus = 'AWAITING_TRANSFER';
  o.externalPaymentStatus = 'TRANSFER_PENDING';
  o.cashDueCents = 0;
  o.payUntil = new Date(now.getTime() + windowMin * 60000).toISOString();
  o.status = 'AWAITING_PAYMENT';
  return o;
}

// Bestellcode im Text finden (Verwendungszweck / Beschreibung), tolerant gegen Leerzeichen/Bindestriche
function findCode(text, orders) {
  const hay = str(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!hay) return null;
  const hits = orders.filter(o => o.displayCode && hay.includes(str(o.displayCode).toUpperCase()));
  return hits.length === 1 ? hits[0] : hits.length > 1 ? 'AMBIGUOUS' : null;
}

// Eine Bankbuchung mit Bestellungen abgleichen. Gibt eine Entscheidung zurück, ändert nichts.
// result: MATCHED | LATE_PAID | AMOUNT_MISMATCH | AMBIGUOUS | NO_ORDER | NOT_INCOMING
function matchTransaction(tx, orders, now = new Date()) {
  if (!(Number(tx.amountCents) > 0)) return { result: 'NOT_INCOMING' };
  const cand = orders.filter(o => o.paymentMethod === 'TRANSFER');
  const o = findCode(str(tx.reference) + ' ' + str(tx.description), cand);
  if (!o) return { result: 'NO_ORDER' };
  if (o === 'AMBIGUOUS') return { result: 'AMBIGUOUS' };
  if (o.paymentStatus === 'PAID') return { result: 'NO_ORDER', note: 'ALREADY_PAID', orderId: o.id };
  if (Number(tx.amountCents) !== Number(o.totalCents)) return { result: 'AMOUNT_MISMATCH', orderId: o.id, expectedCents: o.totalCents, gotCents: tx.amountCents };
  const expired = o.paymentStatus === 'EXPIRED' || o.status === 'CANCELLED';
  return { result: expired ? 'LATE_PAID' : 'MATCHED', orderId: o.id };
}

// Bezahlt markieren → Bestellung geht an die Küche
function applyPaid(order, tx, now = new Date()) {
  return {
    ...order, paymentStatus: 'PAID', externalPaymentStatus: 'TRANSFER_PAID',
    payment: { ...(order.payment || {}), method: 'TRANSFER', paid: true, paidAt: now.toISOString(), bankTransactionId: tx.id || null },
    paidAt: now.toISOString(), status: 'OPEN', liveStage: 'PREPARE', platformStage: 'PREPARE', updatedAt: now.toISOString(),
  };
}

// Nach Ablauf der Frist automatisch stornieren (nur unbezahlte Überweisungsbestellungen)
function expireUnpaid(orders, now = new Date()) {
  const expiredIds = [];
  const next = orders.map(o => {
    if (o.paymentMethod === 'TRANSFER' && o.paymentStatus === 'AWAITING_TRANSFER' && o.payUntil && new Date(o.payUntil) <= now) {
      expiredIds.push(o.id);
      return { ...o, paymentStatus: 'EXPIRED', status: 'CANCELLED', cancelReason: 'PAYMENT_TIMEOUT', updatedAt: now.toISOString() };
    }
    return o;
  });
  return { orders: next, expiredIds };
}

// ── Türzahlung: bestehende Bar-Bestellung (liegt schon in orders) wird an der Tür per Überweisung bezahlt ──
const doorAmount = o => Number(o.cashDueCents) || Number(o.totalCents) || 0;
function isPaidOrder(o) { return o.paymentStatus === 'PAID' || !!(o.payment && o.payment.paid === true); }
function doorState(o) {
  if (isPaidOrder(o)) return 'PAID';
  return o.doorPay && o.doorPay.status === 'WAITING' ? 'WAITING' : 'CANCELLED';
}
function startDoorPay(o, token, now = new Date()) {
  if (isPaidOrder(o)) { const e = new Error('ALREADY_PAID'); e.status = 409; throw e; }
  if (!(o.doorPay && o.doorPay.status === 'WAITING' && o.doorPay.token)) {
    o.doorPay = { token, status: 'WAITING', startedAt: now.toISOString(), amountCents: doorAmount(o) };
  }
  o.updatedAt = now.toISOString();
  return o.doorPay;
}
function cancelDoorPay(o, now = new Date()) {
  if (o.doorPay && o.doorPay.status === 'WAITING') { o.doorPay.status = 'CANCELLED'; o.doorPay.cancelledAt = now.toISOString(); o.updatedAt = now.toISOString(); }
}
function doorInfo(o, cfg) {
  const ref = transferRef(o), c = cfg || {}, amount = (o.doorPay && o.doorPay.amountCents) || doorAmount(o);
  return { state: doorState(o), code: ref, amountCents: amount, payee: c.payee || '', iban: normalizeIban(c.iban), bic: str(c.bic), reference: ref,
    giro: cfg ? girocode({ payee: c.payee, iban: c.iban, bic: c.bic, amountCents: amount, ref }) : '' };
}
function matchDoor(tx, orders, now = new Date()) {
  if (!(Number(tx.amountCents) > 0)) return { result: 'NOT_INCOMING' };
  const cand = orders.filter(o => o.doorPay && o.doorPay.status === 'WAITING' && !isPaidOrder(o) && !(o.deliveredAt && now - new Date(o.deliveredAt) > 36e5));
  const o = findCode(str(tx.reference) + ' ' + str(tx.description), cand);
  if (!o) return { result: 'NO_ORDER' };
  if (o === 'AMBIGUOUS') return { result: 'AMBIGUOUS' };
  if (Number(tx.amountCents) !== Number(o.doorPay.amountCents)) return { result: 'AMOUNT_MISMATCH', orderId: o.id };
  return { result: 'MATCHED', orderId: o.id };
}
function applyDoorPaid(o, tx, now = new Date()) {
  o.doorPay = { ...o.doorPay, status: 'PAID', paidAt: now.toISOString() };
  o.paymentMethod = 'TRANSFER'; o.paymentStatus = 'PAID'; o.externalPaymentStatus = 'TRANSFER_PAID'; o.cashDueCents = 0;
  o.payment = { ...(o.payment || {}), method: 'TRANSFER', paid: true, paidAt: now.toISOString(), bankTransactionId: tx.id || null, atDoor: true };
  o.paidAt = now.toISOString(); o.updatedAt = now.toISOString();
  return o;
}

// Gesamtabgleich über die Admin-Daten (mutiert `data`). Reihenfolge: erst abgelaufene aussortieren, dann Buchungen abgleichen.
// Bezahlte Bestellungen wandern von pendingTransfers nach orders (erst dann sehen Küche/Kasse/Live-Orders sie).
function reconcile(data, now = new Date()) {
  data.pendingTransfers ??= []; data.expiredTransfers ??= []; data.bankTransactions ??= []; data.orders ??= []; data.auditEvents ??= [];
  let changed = false; const paidIds = [], doorPaidIds = [];
  const audit = (type, details) => data.auditEvents.push({ id: 'audit-' + now.getTime() + '-' + data.auditEvents.length, type, createdAt: now.toISOString(), details });
  const ex = expireUnpaid(data.pendingTransfers, now);
  if (ex.expiredIds.length) {
    changed = true;
    data.expiredTransfers.push(...ex.orders.filter(o => ex.expiredIds.includes(o.id)));
    data.pendingTransfers = ex.orders.filter(o => !ex.expiredIds.includes(o.id));
    for (const id of ex.expiredIds) audit('TRANSFER_ORDER_EXPIRED', { orderId: id });
  }
  const keep = data.expiredTransfers.filter(o => now - new Date(o.updatedAt || now) < 7 * 864e5);
  if (keep.length !== data.expiredTransfers.length) { data.expiredTransfers = keep; changed = true; }
  for (const tx of data.bankTransactions) {
    if (tx.status !== 'UNMATCHED' || tx.reviewReason) continue;
    let m = matchTransaction(tx, [...data.pendingTransfers, ...data.expiredTransfers], now);
    if (m.result === 'NO_ORDER' && !m.note) {
      const dm = matchDoor(tx, data.orders, now);
      if (dm.result === 'MATCHED') {
        const o = data.orders.find(x => x.id === dm.orderId); applyDoorPaid(o, tx, now);
        Object.assign(tx, { status: 'MATCHED', matchedEntityType: 'ORDER', matchedEntityId: o.id, matchedAt: now.toISOString(), matchedBy: 'AUTO' });
        audit('DOOR_ORDER_PAID', { orderId: o.id, bankTransactionId: tx.id, amountCents: tx.amountCents });
        doorPaidIds.push(o.id); changed = true; continue;
      }
      if (dm.result === 'AMOUNT_MISMATCH' || dm.result === 'AMBIGUOUS') m = dm;
    }
    if (m.result === 'MATCHED') {
      const o = data.pendingTransfers.find(x => x.id === m.orderId);
      data.pendingTransfers = data.pendingTransfers.filter(x => x !== o);
      const paid = applyPaid(o, tx, now); data.orders.push(paid);
      Object.assign(tx, { status: 'MATCHED', matchedEntityType: 'ORDER', matchedEntityId: paid.id, matchedAt: now.toISOString(), matchedBy: 'AUTO' });
      audit('TRANSFER_ORDER_PAID', { orderId: paid.id, bankTransactionId: tx.id, amountCents: tx.amountCents });
      paidIds.push(paid.id); changed = true;
    } else if (['LATE_PAID', 'AMOUNT_MISMATCH', 'AMBIGUOUS'].includes(m.result)) {
      tx.reviewReason = m.result; tx.reviewOrderId = m.orderId || null; changed = true;
      audit('TRANSFER_NEEDS_REVIEW', { bankTransactionId: tx.id, reason: m.result, orderId: m.orderId || null });
    }
  }
  return { changed, paidIds, doorPaidIds };
}

module.exports = { doorAmount, doorState, startDoorPay, cancelDoorPay, doorInfo, matchDoor, applyDoorPaid, reconcile, PAY_WINDOW_MIN, normalizeIban, isValidIban, transferRef, girocode, payInfo, markAwaitingTransfer, findCode, matchTransaction, applyPaid, expireUnpaid };
