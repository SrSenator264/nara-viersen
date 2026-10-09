// uber-normalize.mjs — طلب Uber Eats Orders (merchants.ubereats.com/orders، GraphQL getActiveOrders) → شكل طلب NARA.
// - السعر بييجي كـ amountE5 (رقم 64-بت مخزّن كـ Buffer): القيمة ÷ 100000 = يورو.
// - سعر الصنف بدون الإضافات؛ الإضافات إلها أسعارها لحال. المجموع والخصم والتوصيل من payment.lineItems.
// - رمز QR تبع السائق (BYOC) بييجي بـ orderTrackingMetadata.url → deliveryQrUrl (متل Lieferando).

const S = v => (v == null ? '' : String(v)).trim();
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// amountE5 {type:'Buffer', data:[8 bytes big-endian]} → سنت
export function e5ToCents(p) {
  const a = p && (p.currencyAmount ? p.currencyAmount.amountE5 : p.amountE5);
  if (a == null) return null;
  if (typeof a === 'number' || typeof a === 'string') { const n = Number(a); return Number.isFinite(n) ? Math.round(n / 1000) : null; }
  const bytes = Array.isArray(a) ? a : (a && Array.isArray(a.data) ? a.data : null);
  if (!bytes) return null;
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b & 255);
  if (bytes.length === 8 && (bytes[0] & 128)) v -= 1n << 64n; // سالب
  return Math.round(Number(v) / 1000);
}

// "€29.46" / "(€6.90)" / "24,56 €" → سنت
export function moneyToCents(t) {
  const s = S(t);
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  let n = s.replace(/[^\d.,]/g, '');
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.'); else n = n.replace(/,/g, '');
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) * (neg ? -1 : 1) : null;
}

const richText = x => {
  try { return x.content.richTextElements.map(e => (e.text && e.text.text) || '').join(''); } catch { return ''; }
};

const STAGES = [
  ['CANCELLED', /cancel|reject|denied|fail|refund|unfulfilled/i],
  ['DONE', /complete|delivered|finished|done|fulfilled|picked_?up_by_customer|dined/i],
  ['HANDOVER', /ready|pick|handoff|handover|courier|en_?route|on_?the_?way|delivering|out_?for|dispatch|in_?transit/i],
  ['PREPARE', /prepar|accept|confirm|creat|^new$|offer|placed|pending|schedul/i],
];
export function stageOf(state) {
  const s = S(state);
  for (const [stage, re] of STAGES) if (re.test(s)) return { stage, known: true, raw: s };
  return { stage: 'PREPARE', known: false, raw: s };
}

function mapItem(it, warnings) {
  const qty = Math.max(1, num(it.quantity && it.quantity.amount) || 1);
  const base = e5ToCents(it.price);
  if (base == null) warnings.push('no price: ' + S(it.name));
  // الإضافات: سطور فيها itemID/quantity. سطور العناوين ("Wähle deinen Dip") ما إلها كمية.
  const options = (Array.isArray(it.modifiers) ? it.modifiers : [])
    .filter(m => m && m.quantity && S(m.name))
    .map(m => {
      const q = Math.max(1, num(m.quantity.amount) || 1);
      const c = e5ToCents(m.price) || 0;
      return { name: S(m.name), quantity: q, cents: c, totalCents: c };
    });
  const optCents = options.reduce((s, o) => s + o.totalCents, 0);
  // سعر الصنف من أوبر = لقطعة وحدة (بدون الإضافات)
  const unit = (base || 0) + optCents;
  // عرض خاص على الصنف: أوبر بيعطي السعر بعد الخصم (لقطعة، بدون الإضافات)
  const pm = it.price && it.price.priceModification;
  const after = pm && pm.discount ? moneyToCents(pm.discount.formattedDiscountedPrice) : null;
  const itemDiscount = after != null && base != null && after < base ? (base - after) * qty : 0;
  const note = (Array.isArray(it.notes) ? it.notes : []).map(n => richText(n.title)).map(t => t.replace(/^"\s*|\s*"$/g, '').trim()).filter(Boolean).join(' · ');
  return {
    id: S(it.itemID || it.id),
    name: S(it.name) || 'Artikel',
    quantity: qty,
    unitCents: unit,
    totalCents: unit * qty,
    // الخصم على هالسطر (للفاتورة: السعر الأصلي مشطوب وبعدو السعر بعد الخصم)
    ...(itemDiscount ? { discountCents: itemDiscount } : {}),
    options,
    note, notes: note,
    category: /men[üu]/i.test(S(it.name)) ? 'Menü' : '',
  };
}

// o = value من getActiveOrders.result.orders[i]; store = {id, name} (اختياري)
export function normalizeUber(o, store = {}) {
  const warnings = [];
  const st = stageOf(o.state);
  if (!st.known) warnings.push(`unknown state "${st.raw}"`);
  const cust = (o.customers && o.customers[0]) || {};
  const del = (o.deliveries && o.deliveries[0]) || {};
  const loc = del.location || {};
  const phone = cust.phone || {};
  const delivery = /DELIVERY/i.test(S(o.fulfillmentType)) && !!S(loc.addressOne || loc.title);
  const cart = ((o.cartInfo && o.cartInfo.cartItems) || []).map(it => mapItem(it, warnings));

  // المبالغ من الفاتورة
  const lines = ((o.payment && o.payment.lineItems) || []).map(li => ({ label: richText(li.label), cents: moneyToCents(richText(li.value)) }));
  const find = re => { const l = lines.find(x => re.test(x.label)); return l ? l.cents : null; };
  const subtotal = find(/subtotal|zwischensumme/i);
  const fee = find(/delivery|liefer/i) || 0;
  const discount = lines.filter(l => /offer|discount|promo|rabatt|angebot|aktion/i.test(l.label)).reduce((s, l) => s + Math.abs(l.cents || 0), 0);
  const tip = Math.abs(find(/tip|trinkgeld/i) || 0);
  // Servicegebühr von Uber ("Marketplace fee (Uber's fees)"): zahlt der Kunde, geht an Uber – nicht an uns
  const service = Math.abs(find(/marketplace|service|uber.?s fee/i) || 0);
  // Barzahlung: Uber schreibt dann "Cash due" statt "Total"
  const cash = lines.some(l => /cash|bar(zahlung)?\b|zu zahlen/i.test(l.label));
  const itemsSum = cart.reduce((s, i) => s + i.totalCents, 0);
  // Manche Angebote (z. B. 1+1 gratis) zieht Uber schon vor der Zwischensumme ab → als Rabatt zählen
  const preSub = subtotal != null && itemsSum - subtotal > 1 ? itemsSum - subtotal : 0;
  if (subtotal != null && subtotal - itemsSum > 1) warnings.push(`items ${itemsSum} < subtotal ${subtotal}`);
  // Endbetrag: zuerst Ubers eigener orderTotal, dann die Zeile "Total"/"Cash due", sonst selbst rechnen
  let total = e5ToCents(o.payment && o.payment.orderTotal);
  if (total == null) total = find(/^total|^gesamt|^summe|cash due|bar/i);
  if (total == null) total = (subtotal != null ? subtotal : itemsSum) + fee + service - discount + tip;
  if (fee) cart.push({ name: 'Liefergebühr', kind: 'DELIVERY_FEE', quantity: 1, unitCents: fee, totalCents: fee, options: [] });

  const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
  const ts = x => (x && x.timestamp ? iso(x.timestamp) : null);
  const readyAt = ts(o.estimatedReadyTime);
  const dueAt = iso(del.estimatedDropOffTime) || ts(o.estimatedBYOCDeliveryTime) || ts(o.estimatedThirdPartyDeliveryTime);
  const sched = o.scheduledOrderInfo || null;
  const requestedAt = sched ? (iso(sched.scheduledTime || sched.deliveryTime || sched.startTime) || ts(sched)) : null;
  const prepMinutes = num(o.prepTimeSecs) ? Math.round(o.prepTimeSecs / 60) : null;
  const name = S(cust.name);

  return {
    externalOrderCode: 'UBER-' + S(o.id),
    uberOrderId: S(o.id),
    displayCode: S(o.displayID) || S(o.id).slice(0, 5).toUpperCase(),
    platform: 'UBER_EATS',
    ingestMethod: 'PLAYWRIGHT_UBER_GRAPHQL',
    brand: S(store.name), brandName: S(store.name), storeId: S(store.id),
    type: delivery ? 'delivery' : 'pickup',
    orderType: delivery ? 'DELIVERY' : 'PICKUP',
    fulfillmentType: S(o.fulfillmentType),
    liveStage: st.stage,
    platformStatus: st.raw,
    status: st.stage === 'CANCELLED' ? 'CANCELLED' : st.stage === 'DONE' ? 'DONE' : 'OPEN',
    customerName: name,
    customerPhone: S(phone.phoneNumber),
    verificationCode: S(phone.pinCode),       // رمز الوصول لرقم أوبر المخفي
    returningCustomerOrders: num(cust.orderHistory && cust.orderHistory.pastOrderCount),
    delivery: delivery ? {
      name, phone: S(phone.phoneNumber),
      address: S(loc.title) || S(loc.addressOne).split(',')[0],
      street: S(loc.title), postalCode: S(loc.postalCode), postal: S(loc.postalCode),
      city: S(loc.city).replace(/^\w/, c => c.toUpperCase()),
      floor: S(loc.aptOrSuite), extra: S(loc.businessName),
      lat: num(loc.latitude), lng: num(loc.longitude),
      notes: [S(del.deliveryInstructions), S(del.interactionType)].filter(Boolean).join(' · '),
    } : { name, phone: S(phone.phoneNumber) },
    deliveryQrUrl: S(o.orderTrackingMetadata && o.orderTrackingMetadata.url) || null,
    cart,
    subtotalCents: itemsSum,
    deliveryFeeCents: fee, discountsCents: discount + preSub, tipCents: tip,
    fees: { delivery: fee, service, small: 0 },
    totalCents: total,
    externalTotalCents: total,
    // Bar: alle Fahrer sind unsere eigenen → unser Fahrer kassiert den ganzen Betrag
    payment: cash ? { method: 'CASH', paid: false, raw: 'uber', collectedBy: 'DRIVER' } : { method: 'ONLINE', paid: true, raw: 'uber' },
    paymentMethod: cash ? 'CASH' : 'ONLINE',
    externalPaymentStatus: cash ? 'CASH_ON_DELIVERY' : 'PAID_ON_PLATFORM',
    cashDueCents: cash ? total : 0,
    asap: !requestedAt,
    requestedAt, platformReadyAt: readyAt, dueAt, etaAt: dueAt, prepMinutes,
    taxRate: Array.isArray(o.taxRateOptions) ? o.taxRateOptions.join(',') : '',
    parseStatus: warnings.length ? 'CHECK' : 'OK',
    warnings,
  };
}
