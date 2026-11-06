'use strict';
// order-correction.js — Storno nach Zahlung + Korrekturbestellung ("✏️ تصحيح"). Reine Logik ohne I/O (wie payment-logic.js).
// - Storno gibt es NUR nach der Zahlung (Status COMPLETED), mit Pflicht-Grund. Vor der Zahlung ist Ändern/Löschen normal und wird nicht protokolliert.
// - Ein Storno ist ein NEUER Vorgang mit negativen Beträgen (Zahlung status 'STORNO' + Beleg + Fiskal-Eintrag); nichts wird gelöscht.
// - Das audit-Event 'STORNO' behält einen POSITIVEN amountCents (day-closing.js zieht ihn vom Umsatz ab);
//   die negative Zahlung hat status 'STORNO' (nicht 'COMPLETED'), damit day-closing sie nicht doppelt zählt.
// - Trainings-Bestellungen (training:true) werden frei wieder geöffnet: kein Storno, kein Grund, keine Korrekturnummer, nie gesperrt, nie in den Büchern.
// - Die Funktion verändert `data` direkt (der Aufrufer liest/schreibt die Admin-Daten) und gibt zurück was passiert ist.
const bizDay = require('./business-day.js');
const SL = require('./sales-ledger.js');

class CorrectionError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

const MIN_REASON = 3;
const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT']);
// Felder, die beim Kopieren in die neue Bestellung NICHT mitgehen (Zahlung, Küche, Lieferung, Sync-Stand gehören zur alten Bestellung)
const DROP = ['id', 'displayCode', 'status', 'rev', 'revBy', 'createdAt', 'updatedAt', 'completedAt', 'cancelledAt', 'paymentId', 'paymentIds', 'paidCents', 'billDiscount',
  'kitchenStatus', 'kitchenStatusAt', 'kitchenStatusBy', 'kitchenPrintedAt', 'kitchenPrintCount', 'customerPrintedAt', 'driverPrintedAt', 'lastReprintedAt', 'printCount',
  'preparingAt', 'readyAt', 'pickedUpAt', 'liveStage', 'liveStageSource', 'liveStageUpdatedAt', 'deliveryRouteId', 'driverId', 'assignment', 'assignmentStatus', 'outAt', 'deliveredAt',
  'deliveryProof', 'promisedMin', 'promisedDueAt', 'correctionId', 'correctedBy', 'correctedByCode', 'stornoAt', 'stornoReason', 'kitchenSent', 'changes', 'training', 'isTest'];

const isTraining = o => !!o && (o.training === true || o.isTest === true);
const isPlatformOrder = o => !!SL.platformOf(o) || !!o.externalOrderCode;
const codeOf = o => String(o.displayCode || o.externalOrderCode || ('FLAMO-' + String(o.id || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()));
const clone = x => JSON.parse(JSON.stringify(x));
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

// Darf diese Bestellung korrigiert werden? Gibt null zurück wenn ja, sonst {status,message,code}. Für UI-Anzeige und Server gleich.
function blocker(data, o) {
  if (!o) return { status: 404, message: 'Bestellung nicht gefunden.', code: 'NOT_FOUND' };
  if (isTraining(o)) return null;
  if (isPlatformOrder(o)) return { status: 409, message: 'Plattform-Bestellungen werden bei der Plattform korrigiert.', code: 'PLATFORM_ORDER' };
  if (o.status === 'STORNIERT' || o.correctedBy || (data.auditEvents || []).some(e => e.type === 'STORNO' && e.orderId === o.id))
    return { status: 409, message: 'Für diese Zahlung existiert bereits ein Storno.', code: 'ALREADY_STORNO' };
  if (o.status !== 'COMPLETED') return { status: 409, message: 'Nur abgeschlossene Zahlungen können storniert werden.', code: 'NOT_COMPLETED' };
  const day = bizDay.dayOf(o.completedAt || o.createdAt || o.updatedAt || '');
  if ((data.dayClosings || []).some(s => s && s.mode !== 'TRAINING' && s.day === day))
    return { status: 409, message: 'Der Tag ' + day + ' ist bereits abgeschlossen (Tagesabschluss) — Korrektur nicht möglich.', code: 'DAY_CLOSED' };
  return null;
}

// Trainings-Bestellung wieder öffnen: gleiche ID, Zahlung/Beleg/Fiskal-Testdaten dieser Bestellung weg, Status OPEN. Kein Audit, kein Storno.
function reopenTraining(data, stored, now) {
  const keep = x => x.orderId !== stored.id;
  data.payments = (data.payments || []).filter(keep);
  data.receipts = (data.receipts || []).filter(keep);
  data.fiscalTransactions = (data.fiscalTransactions || []).filter(keep);
  const reopened = { ...stored, status: 'OPEN', rev: (Number.isInteger(stored.rev) ? stored.rev : 0) + 1, updatedAt: now };
  for (const k of ['completedAt', 'paymentId', 'paymentIds', 'paidCents', 'billDiscount']) delete reopened[k];
  data.orders = data.orders.map(x => x.id === stored.id ? reopened : x);
  return { mode: 'TRAINING_REOPEN', order: reopened };
}

// Neue OFFENE Bestellung aus der alten (gleiche Artikel), mit frischer ID und correctionOf.
function buildCorrectionOrder(data, stored, { newId, now, user }) {
  let id = newId('order'), tries = 0;
  const code = i => 'FLAMO-' + String(i).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  const taken = new Set((data.orders || []).flatMap(o => [String(o.id), String(o.displayCode || '')]));
  while ((taken.has(id) || taken.has(code(id))) && tries++ < 20) id = newId('order');
  const copy = clone(stored);
  for (const k of DROP) delete copy[k];
  return { ...copy, id, displayCode: code(id), status: 'OPEN', cart: clone(stored.cart || []), kitchenSent: [], changes: [],
    correctionOf: stored.id, correctionOfCode: codeOf(stored), rev: 1, createdAt: now, updatedAt: now,
    ...(user && user.id && user.id !== 'manager-key' ? { employeeId: user.id } : {}) };
}

// Hauptfunktion. opts: {orderId, reason, user, now, newId, suffix (Zufallsteil der Belegnummer), correct (true = auch neue Bestellung anlegen)}
function stornoOrder(data, opts) {
  for (const k of ['orders', 'payments', 'receipts', 'fiscalTransactions', 'auditEvents']) data[k] = data[k] || [];
  const { orderId, user, now, newId, suffix, correct } = opts;
  const stored = data.orders.find(x => x.id === String(orderId));
  const why = String(opts.reason || '').trim();
  const b = blocker(data, stored);
  if (b) throw new CorrectionError(b.status, b.message, b.code);
  if (isTraining(stored)) return reopenTraining(data, stored, now);          // Training: frei, ohne Grund
  if (why.length < MIN_REASON) throw new CorrectionError(422, 'Ein Grund ist Pflicht (mindestens ' + MIN_REASON + ' Zeichen).', 'REASON_REQUIRED');

  const ids = Array.isArray(stored.paymentIds) && stored.paymentIds.length ? stored.paymentIds : [stored.paymentId];
  const parts = data.payments.filter(p => ids.includes(p.id) && p.status === 'COMPLETED');
  if (!parts.length) throw new CorrectionError(409, 'Keine Zahlung zu dieser Bestellung gefunden.', 'NO_PAYMENT');
  const amount = sum(parts, p => Number(p.amountCents) || 0);
  const by = user ? { userId: user.id || null, userName: user.name || null, role: user.role || null } : {};

  const newOrder = correct ? buildCorrectionOrder(data, stored, { newId, now, user }) : null;
  const correction = { id: newId('correction'), type: 'STORNO', orderId: stored.id, originalPaymentId: parts[parts.length - 1].id, originalPaymentIds: parts.map(p => p.id),
    amountCents: amount, reason: why, createdAt: now, ...by, ...(newOrder ? { newOrderId: newOrder.id, newOrderCode: newOrder.displayCode } : {}) };

  // negative Gegenbuchung: Zahlung (status STORNO), Fiskal-Eintrag, Beleg — alles NEU, nichts wird verändert oder gelöscht
  const payment = { id: newId('payment'), orderId: stored.id, type: 'STORNO', status: 'STORNO', correctionId: correction.id, originalPaymentIds: correction.originalPaymentIds,
    method: parts.length === 1 ? parts[0].method : 'MIXED',
    paymentLines: parts.flatMap(p => (Array.isArray(p.paymentLines) && p.paymentLines.length ? p.paymentLines : [{ method: p.method, amountCents: p.amountCents }]).map(l => ({ method: l.method, amountCents: -(Number(l.amountCents) || 0) }))),
    amountCents: -amount, grossAmountCents: -amount, tipCents: 0, createdAt: now };
  const fiscal = { id: newId('fiscal'), paymentId: payment.id, orderId: stored.id, type: 'STORNO', status: 'DEVELOPMENT_NOT_CONFIGURED', provider: null, amountCents: -amount, createdAt: now };
  const receipt = { id: newId('receipt'), receiptNumber: 'STORNO-' + suffix(), type: 'STORNO', orderId: stored.id, paymentId: payment.id, fiscalTransactionId: fiscal.id, correctionId: correction.id,
    originalReceiptNumbers: data.receipts.filter(r => r.orderId === stored.id && ids.includes(r.paymentId)).map(r => r.receiptNumber),
    items: clone(stored.cart || []), paymentLines: payment.paymentLines, amountCents: -amount, reason: why, createdAt: now };

  data.payments.push(payment); data.fiscalTransactions.push(fiscal); data.receipts.push(receipt);
  data.auditEvents.push({ id: newId('audit'), type: 'STORNO', orderId: stored.id, createdAt: now, details: correction });
  if (newOrder) data.auditEvents.push({ id: newId('audit'), type: 'ORDER_CORRECTION_CREATED', orderId: newOrder.id, createdAt: now, details: { correctionOf: stored.id, correctionId: correction.id } });
  data.orders = data.orders.map(x => x.id === stored.id
    ? { ...x, status: 'STORNIERT', correctionId: correction.id, stornoAt: now, stornoReason: why, ...(newOrder ? { correctedBy: newOrder.id, correctedByCode: newOrder.displayCode } : {}) } : x);
  if (newOrder) data.orders.push(newOrder);
  // A4-Rechnung zu dieser Bestellung? → automatisch Stornorechnung (sonst bliebe eine gültige Rechnung mit USt. ohne Umsatz stehen)
  const invBy = user ? { id: user.id || null, name: user.name || '' } : null;
  const invoices = require('./sales-invoice.js').cancelForOrder(data, stored.id, { reason: 'Storno der Bestellung: ' + why, by: invBy, now });
  for (const inv of invoices) data.auditEvents.push({ id: newId('audit'), type: 'SALES_INVOICE_CANCELLED', orderId: stored.id, createdAt: now, details: { invoiceId: inv.id, number: inv.number, cancellationNumber: inv.cancellationNumber, reason: inv.cancelReason, auto: true } });
  return { mode: 'STORNO', correction, payment, receipt, fiscal, newOrder, cancelledInvoices: invoices.map(i => i.number) };
}

module.exports = { stornoOrder, blocker, buildCorrectionOrder, isTraining, isPlatformOrder, codeOf, CorrectionError, MIN_REASON, CLOSED };
