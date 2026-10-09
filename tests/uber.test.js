'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const e5 = euros => { let v = BigInt(Math.round(euros * 100000)); const d = []; for (let i = 0; i < 8; i++) { d.unshift(Number(v & 255n)); v >>= 8n; } return { amount: '', currencyAmount: { amountE5: { type: 'Buffer', data: d }, currencyCode: 'EUR' } }; };
const rt = t => ({ content: { richTextElements: [{ text: { text: t } }] } });
// Testdaten (erfunden, keine echten Kunden)
const order = {
  id: '11111111-2222-3333-4444-555555555555', displayID: 'AB123', state: 'PREPARING', fulfillmentType: 'DELIVERY_THIRD_PARTY',
  customers: [{ name: 'Muster, M.', phone: { phoneNumber: '+49 30 000000', pinCode: '111 22 333' }, orderHistory: { pastOrderCount: 2 } }],
  deliveries: [{ estimatedDropOffTime: '2026-10-09T16:30:00+02:00', deliveryInstructions: 'Bitte klingeln', interactionType: 'Deliver to door', location: { latitude: '51.28', longitude: '6.35', title: 'Teststraße 1', addressOne: 'Teststraße 1, 41749 Viersen, Deutschland', postalCode: '41749', city: 'viersen' } }],
  cartInfo: { cartItems: [
    { itemID: 'a', name: 'Cheese Burger (Menü)', quantity: { amount: 2 }, price: e5(10), notes: [{ title: rt('"Ohne Zwiebeln "') }],
      modifiers: [{ name: 'Wähle deinen Dip' }, { name: 'Ketchup', quantity: { amount: 1 }, price: e5(0) }, { name: 'Röstzwiebeln', quantity: { amount: 1 }, price: e5(0.5) }] },
    { itemID: 'b', name: 'Taco', quantity: { amount: 1 }, price: { ...e5(6.99), priceModification: { type: 'discount', discount: { formattedDiscountedPrice: '4,99 €' } } }, modifiers: null },
  ] },
  payment: { lineItems: [
    { label: rt('Subtotal'), value: rt('€27.99') }, { label: rt('Delivery Fee'), value: rt('€2.00') },
    { label: rt('Special offer'), value: rt('(€5.00)') }, { label: rt('Total'), value: rt('€24.99') },
  ] },
  estimatedReadyTime: { timestamp: '2026-10-09T15:56:00+02:00' }, prepTimeSecs: 900,
  orderTrackingMetadata: { url: 'https://example.test/byoc?code=x' }, taxRateOptions: ['7%'],
};

test('Uber order → NARA: items with options, notes, totals, address, QR', async () => {
  const { normalizeUber, e5ToCents, moneyToCents } = await import('../uber-normalize.mjs');
  assert.equal(e5ToCents(e5(13.99)), 1399);
  assert.equal(moneyToCents('(€6.90)'), -690); assert.equal(moneyToCents('24,56 €'), 2456);
  const n = normalizeUber(order, { id: 's1', name: 'NARA' });
  assert.equal(n.externalOrderCode, 'UBER-' + order.id); assert.equal(n.displayCode, 'AB123');
  assert.equal(n.liveStage, 'PREPARE'); assert.equal(n.type, 'delivery');
  const burger = n.cart[0];
  assert.equal(burger.quantity, 2); assert.equal(burger.unitCents, 1050); assert.equal(burger.totalCents, 2100);
  assert.deepEqual(burger.options.map(o => o.name), ['Ketchup', 'Röstzwiebeln']);
  assert.equal(burger.note, 'Ohne Zwiebeln');
  assert.equal(n.cart[1].discountCents, 200); assert.equal(burger.discountCents, undefined);
  assert.equal(n.cart.at(-1).kind, 'DELIVERY_FEE');
  assert.equal(n.totalCents, 2499); assert.equal(n.discountsCents, 500); assert.equal(n.deliveryFeeCents, 200);
  assert.equal(n.delivery.city, 'Viersen'); assert.equal(n.delivery.lat, 51.28);
  assert.equal(n.verificationCode, '111 22 333'); assert.equal(n.deliveryQrUrl, 'https://example.test/byoc?code=x');
  assert.equal(n.payment.method, 'ONLINE'); assert.equal(n.parseStatus, 'OK');
});

test('Uber states map to NARA stages', async () => {
  const { stageOf } = await import('../uber-normalize.mjs');
  assert.equal(stageOf('PREPARING').stage, 'PREPARE');
  assert.equal(stageOf('READY_FOR_PICKUP').stage, 'HANDOVER');
  assert.equal(stageOf('CANCELED').stage, 'CANCELLED');
  assert.equal(stageOf('COMPLETED').stage, 'DONE');
  assert.equal(stageOf('SOMETHING_NEW').known, false);
});

test('Uber cash order with Uber courier: total from orderTotal, service fee separate, cash collected by courier', async () => {
  const { normalizeUber } = await import('../uber-normalize.mjs');
  const o = { ...order, id: 'cash-1', payment: {
    orderTotal: e5(21.98).currencyAmount,
    lineItems: [
      { label: rt('Subtotal'), value: rt('€32.46') }, { label: rt('Delivery Fee'), value: rt('€1.00') },
      { label: rt("Marketplace fee (Uber's fees)"), value: rt('€1.30') }, { label: rt('Special offer'), value: rt('(€12.14)') },
      { label: rt('Cash due'), value: rt('€21.98') },
    ] },
    cartInfo: { cartItems: [{ itemID: 'n', name: 'Nuggets', quantity: { amount: 2 }, price: e5(11.98) }, { itemID: 't', name: 'Taco', quantity: { amount: 1 }, price: e5(8.99) }, { itemID: 'b', name: 'Burger', quantity: { amount: 1 }, price: e5(11.49) }] } };
  const n = normalizeUber(o, {});
  assert.equal(n.totalCents, 2198);
  assert.equal(n.fees.service, 130); assert.equal(n.deliveryFeeCents, 100);
  assert.equal(n.discountsCents, 1214 + 1198);
  assert.equal(n.payment.method, 'CASH'); assert.equal(n.payment.collectedBy, 'UBER_COURIER'); assert.equal(n.cashDueCents, 0);
  const own = normalizeUber({ ...o, fulfillmentType: 'DELIVERY_BYOC' }, {});
  assert.equal(own.payment.collectedBy, 'DRIVER'); assert.equal(own.cashDueCents, 2198);
});
