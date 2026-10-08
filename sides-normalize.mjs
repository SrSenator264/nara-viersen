// sides-normalize.mjs — بيحوّل طلب Sides (SimplyPOS: showSingleOrderdata) لشكل طلب NARA.
// Loco Chicken: إلها جهاز Sides لحالها ومطبخها لحالو، فالطلب بيتسجّل بـ NARA (brand: Loco Chicken، source: SIDES)
// بس ما بيطلع على تابلت مطبخنا (kitchen.js بيستثني brand Loco و source SIDES).

const S = v => (v == null ? '' : String(v)).trim();
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const cents = v => Math.round(num(v) * 100);
const yes = v => v === true || v === 1 || v === '1';

// "2026-10-08 18:33:04" (وقت ألمانيا) → ISO
export function berlinToIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(S(s));
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // فرق التوقيت لهداك اليوم (صيفي/شتوي)
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(asUtc)).map(x => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(asUtc - (shown - asUtc)).toISOString();
}

const PORTALS = [[/lieferando|takeaway|just ?eat/i, 'LIEFERANDO'], [/uber/i, 'UBER_EATS'], [/wolt/i, 'WOLT'], [/lanch/i, 'LANCH']];
export function channelOf(name) {
  for (const [re, c] of PORTALS) if (re.test(S(name))) return c;
  return S(name) ? 'SIDES_' + S(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_') : 'SIDES';
}

export function stageOf(dataset, listState) {
  if (yes(dataset && dataset.isCanceled)) return 'CANCELLED';
  const st = S((dataset && dataset.orderstatetype_constantname) || listState).toLowerCase();
  if (/cancel|storn/.test(st)) return 'CANCELLED';
  if (/finish|complet|closed|done|abgeschlossen|paid|delivered$/.test(st) && !/tostore/.test(st)) return 'DONE';
  if (/ontour|tour|driver|onway|ready/.test(st)) return 'HANDOVER';
  return 'PREPARE';
}

function partsOf(b) {
  const out = [];
  for (const p of [...(b.menuParts || []), ...(b.toppings || [])]) {
    const name = S(p.article_name || p.name || p.recipe_name || p.toppinggroup_name);
    if (!name) continue;
    const removed = yes(p.isRemovedArticle) || yes(p.isRemovedRecipe) || yes(p.isRemoveable);
    out.push({ name: (removed ? 'ohne ' : '') + name, quantity: Math.max(1, num(p.amount) || 1), cents: cents(p.value) });
    out.push(...partsOf(p).map(x => ({ ...x, name: '  ' + x.name })));
  }
  return out;
}

export function normalizeSides(detail, listOrder = {}) {
  const R = detail && detail.response ? detail.response : detail;
  const D = R.orderDataset || {}, C = R.customerDataset || {};
  const cart = [], warnings = [];
  let discountCents = 0, deliveryFeeCents = 0, tipCents = 0;
  for (const b of R.billposList || []) {
    const name = S(b.article_name || b.name || b.recipe_name);
    const qty = Math.max(1, num(b.amount) || 1);
    if (yes(b.isVoucher) || yes(b.isInstantDiscount) || yes(b.isRefund)) { discountCents += Math.abs(cents(b.totalPrice ?? b.value)); continue; }
    if (yes(b.isDeliveryFee)) { deliveryFeeCents += cents(b.totalPrice ?? b.value); cart.push({ name: name || 'Lieferkosten', kind: 'DELIVERY_FEE', quantity: 1, unitCents: cents(b.totalPrice ?? b.value), totalCents: cents(b.totalPrice ?? b.value), options: [] }); continue; }
    if (b.isTip === true || yes(b.isTip)) { tipCents += cents(b.totalPrice ?? b.value); continue; }
    if (yes(b.isComment)) { cart.length && (cart[cart.length - 1].note = [cart[cart.length - 1].note, name].filter(Boolean).join(' · ')); continue; }
    const total = cents(b.totalPrice ?? b.value);
    cart.push({ name, quantity: qty, unitCents: Math.round(total / qty), totalCents: total, options: partsOf(b), note: S(b.orderbillpositioncomment_name), category: yes(b.isMenue) ? 'Menü' : '' });
  }
  const totalCents = cents(D.amount ?? listOrder.amount);
  const sum = cart.reduce((s, i) => s + (i.totalCents || 0), 0) - discountCents + tipCents;
  if (Math.abs(sum - totalCents) > 2) warnings.push(`Summe ${sum} ≠ ${totalCents}`);

  const pays = R.paymentsList || [];
  const cash = pays.length ? pays.every(p => yes(p.paymenttypecategory_isCash)) : /bar|cash/i.test((listOrder.payments || []).join(' '));
  const portal = S(D.orderportal_name || D.deliveryPortalName);
  const channel = channelOf(portal);
  const reference = S((R.deliveryPortalInfo && R.deliveryPortalInfo.referenceId) || listOrder.referenceId);
  const type = /deliver/i.test(S(D.ordertype_constantname || listOrder.ordertypeConstantName)) ? 'delivery' : 'pickup';
  const createdAt = berlinToIso(D.billingdate || D.createdate || listOrder.billingDate);
  const readyAt = berlinToIso(listOrder.routing && listOrder.routing.expectedTourStart);
  const dueAt = berlinToIso(D.expectedDeliveryDate || (listOrder.routing && listOrder.routing.expectedDeliveryTime));
  const name = [S(C.user_name), S(C.user_surname)].filter(Boolean).join(' ') || S(listOrder.customer && listOrder.customer.name);
  const street = S(C.customer_street), house = S(C.customer_streetnumber), postal = S(C.customer_zip), city = S(C.customer_city);
  const notes = [S(C.customer_doorbell) && 'Klingel: ' + S(C.customer_doorbell), S(C.customer_locationDetails), S(C.customer_locationDetails2), S(C.customer_pathfinder)].filter(Boolean).join(' · ');
  const lat = num(C.geocoding_lat) || null, lng = num(C.geocoding_lng) || null;
  const liveStage = stageOf(D, listOrder.orderstatetypeConstantName);

  return {
    externalOrderCode: 'SIDES-' + S(D.id || listOrder.id),
    sidesOrderId: S(D.id || listOrder.id),
    billingNumber: S(D.billingnumber || listOrder.billingNumber),
    displayCode: reference || S(D.billingnumber || listOrder.billingNumber),
    platform: channel,
    channel,
    portalName: portal || 'Sides',
    brand: 'Loco Chicken',
    brandName: 'Loco Chicken',
    station: 'LOCO',
    type, orderType: type.toUpperCase(),
    liveStage,
    createdAt, placedAt: createdAt, dueAt, readyAt,
    customerName: name, customerPhone: S(C.customer_telephone),
    delivery: type === 'delivery' ? { name, phone: S(C.customer_telephone), street, house, houseNumber: house, postal, postalCode: postal, city, lat, lng, address: [street, house].filter(Boolean).join(' '), notes } : { name, phone: S(C.customer_telephone) },
    remarks: S(D.comment),
    cart,
    totalCents, discountCents, deliveryFeeCents, tipCents,
    cashDueCents: cash ? totalCents : 0,
    payment: { method: cash ? 'CASH' : 'ONLINE', label: pays.map(p => S(p.paymenttype_constantname)).filter(Boolean).join(', ') || (listOrder.payments || []).join(', ') },
    externalPaymentStatus: cash ? 'UNKNOWN' : 'PAID_ON_PLATFORM',
    sidesState: S(D.orderstatetype_constantname || listOrder.orderstatetypeConstantName),
    parseStatus: warnings.length ? 'CHECK' : 'OK',
    warnings,
  };
}
