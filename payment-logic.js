'use strict';
// payment-logic.js — الدفع بالكاشير: خصم للزبون (٪ أو €)، خصم موظف (بكود)، تقسيم الفاتورة، كاش + كرت.
// - الخصم بيتحسب بالسيرفر (ما منصدّق المبلغ اللي جاي من المتصفح).
// - تقسيم الفاتورة: كل شخص بيدفع جزء (payload.partial). الطلب بيضل مفتوح لحتى ينْدفع كلّو.
//   كل جزء دفعة حقيقية (status COMPLETED) فيها split {index, of}. الطلب المكتمل: paymentIds = كل الأجزاء.
// - الخصم بيتثبّت على الطلب مع أول دفعة (billDiscount) وبيضل نفسو للأجزاء التانية.

const grossOf = order => (order.cart || []).reduce((s, i) => s + (Number(i.unitCents) || 0) * (Number(i.quantity) || 0), 0);

class PayError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

function findEmployee(employees, code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return null;
  return (employees || []).find(x => x.active !== false && [x.employeeCode, x.qrToken, x.id].some(v => String(v || '').trim().toLowerCase() === c)) || null;
}

// discount من المتصفح: {type:'PERCENT', value:10} | {type:'AMOUNT', value:200 (cents)} | employeeDiscountCode
function computeDiscount(gross, payload, employees) {
  const code = String(payload.employeeDiscountCode || (payload.discount && payload.discount.employeeCode) || '').trim();
  if (code) {
    const e = findEmployee(employees, code);
    if (!e) throw new PayError(422, 'Mitarbeiter für den Rabatt nicht gefunden oder inaktiv.', 'EMPLOYEE_NOT_FOUND');
    const percent = Math.max(0, Math.min(100, Number(e.employeeDiscountPercent ?? 20)));
    return { type: 'EMPLOYEE', value: percent, amountCents: Math.min(gross, Math.round(gross * percent / 100)), reason: 'Personalessen', employeeId: e.id, employeeName: e.name, employeeCode: e.employeeCode || e.qrToken || e.id };
  }
  const d = payload.discount;
  if (!d || !d.type) return null;
  const type = String(d.type).toUpperCase();
  if (type === 'PERCENT') {
    const v = Number(d.value);
    if (!(v > 0 && v <= 100)) throw new PayError(422, 'Rabatt in % muss zwischen 0 und 100 liegen.', 'BAD_DISCOUNT');
    return { type: 'PERCENT', value: v, amountCents: Math.min(gross, Math.round(gross * v / 100)), reason: String(d.reason || 'Kundenrabatt').slice(0, 120) };
  }
  if (type === 'AMOUNT') {
    const v = Math.round(Number(d.value));
    if (!(Number.isInteger(v) && v > 0)) throw new PayError(422, 'Rabattbetrag ungültig.', 'BAD_DISCOUNT');
    return { type: 'AMOUNT', value: v, amountCents: Math.min(gross, v), reason: String(d.reason || 'Kundenrabatt').slice(0, 120) };
  }
  throw new PayError(422, 'Unbekannte Rabattart.', 'BAD_DISCOUNT');
}

function paidSoFar(payments, orderId) {
  return (payments || []).filter(p => p.orderId === orderId && p.status === 'COMPLETED').reduce((s, p) => s + (Number(p.amountCents) || 0), 0);
}

// بيرجّع {payment, order, completed, remainingCents}. ما بيعدّل شي، المتّصل بيحفظ.
function finalize({ order, payments, payload, employees, now, newId }) {
  if (!order) throw new PayError(404, 'Bestellung nicht gefunden.');
  if (order.status === 'COMPLETED') throw new PayError(409, 'Zahlung wurde bereits abgeschlossen.', 'ALREADY_PAID');
  if (order.status === 'CANCELLED' || order.status === 'STORNIERT') throw new PayError(409, 'Bestellung ist storniert.');
  const gross = grossOf(order);
  const mine = (payments || []).filter(p => p.orderId === order.id && p.status === 'COMPLETED');
  // الخصم: إذا في دفعات قبل، الخصم تثبّت من أول دفعة
  const discount = mine.length ? (order.billDiscount || null) : computeDiscount(gross, payload || {}, employees);
  const discountCents = Math.min(gross, Math.max(0, Number(discount && discount.amountCents) || 0));
  const expected = gross - discountCents;
  const already = paidSoFar(payments, order.id);
  const remaining = expected - already;
  const raw = Array.isArray(payload.paymentLines) ? payload.paymentLines : [{ method: payload.method, amountCents: payload.amountCents }];
  const lines = raw.map(l => {
    const line = { method: String(l.method || '').toUpperCase(), amountCents: Number(l.amountCents) };
    if (line.method === 'CASH' && Number.isInteger(l.amountReceivedCents)) { line.amountReceivedCents = l.amountReceivedCents; line.changeCents = l.amountReceivedCents - line.amountCents; }
    return line;
  });
  if (!lines.length || lines.some(l => !['CASH', 'CARD'].includes(l.method) || !Number.isInteger(l.amountCents) || l.amountCents <= 0))
    throw new PayError(422, 'Zahlungsart oder Betrag ungültig.', 'BAD_LINES');
  const amount = lines.reduce((s, l) => s + l.amountCents, 0);
  const partial = !!payload.partial;
  if (partial ? (amount > remaining) : (amount !== remaining))
    throw new PayError(422, partial ? 'Teilbetrag ist größer als der offene Betrag.' : 'Zahlungsaufteilung muss exakt dem offenen Betrag entsprechen.', 'AMOUNT_MISMATCH');
  const completed = amount === remaining;
  const split = partial || mine.length ? { index: mine.length + 1, of: Number.isInteger(payload.splitOf) && payload.splitOf > 0 ? payload.splitOf : null, label: String(payload.splitLabel || '').slice(0, 40) } : null;
  const payment = {
    id: newId('payment'), orderId: order.id,
    method: lines.length === 1 ? lines[0].method : 'MIXED', paymentLines: lines,
    amountCents: amount, grossAmountCents: completed && !mine.length ? gross : amount,
    discount: mine.length ? null : discount, tipCents: Number.isInteger(payload.tipCents) ? payload.tipCents : 0,
    status: 'COMPLETED', createdAt: now, ...(split ? { split } : {}),
  };
  const ids = [...mine.map(p => p.id), payment.id];
  const next = { ...order, billDiscount: discount || null, paidCents: already + amount, paymentIds: ids };
  if (completed) Object.assign(next, { status: 'COMPLETED', completedAt: now, paymentId: payment.id });
  return { payment, order: next, completed, remainingCents: remaining - amount, expectedCents: expected, discount };
}

module.exports = { finalize, computeDiscount, grossOf, PayError, paidSoFar };
