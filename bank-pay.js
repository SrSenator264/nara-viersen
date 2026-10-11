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

module.exports = { PAY_WINDOW_MIN, normalizeIban, isValidIban, transferRef, girocode, payInfo, markAwaitingTransfer, findCode, matchTransaction, applyPaid, expireUnpaid };
