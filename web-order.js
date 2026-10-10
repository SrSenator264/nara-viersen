'use strict';
// web-order.js — طلبات الموقع (بلا عمولة): بيتحقق من السلة بالسيرفر وبيحسب الأسعار من بيانات NARA، ما منثق بأسعار المتصفح.
// نفس منطق مجموعات الخيارات تبع الكاشير (لحالو/منيو، مشروب، صوص، ديبس، إضافات).
const crypto = require('crypto');

const str = v => (v == null ? '' : String(v)).trim();
const clip = (v, n) => str(v).slice(0, n);

// نسخة من groups() بالكاشير: بترجع مجموعات الخيارات لمنتج
function groupsFor(p, catalog) {
  const a = Array.isArray(p.dips) ? p.dips.filter(o => !o.unavailable) : [];
  if (p.menuCents) {
    const ref = catalog.find(x => x.hidden && x.c === 'Burger-Menü' && str(x.n).toLowerCase().startsWith(str(p.n).toLowerCase()));
    const refOptions = Array.isArray(ref && ref.dips) ? ref.dips.filter(o => !o.unavailable) : [];
    const src = a.some(o => o.group === 'Ihr Getränk' || o.group === 'Ihre Sauce') ? a : refOptions;
    const unique = items => [...new Map(items.map(o => [o.id || o.name, o])).values()];
    const extras = unique(src.filter(o => o.group === 'Ihre Extras')).filter(o => !/(double|triple)/i.test(o.name || ''));
    const drinks = unique(src.filter(o => o.group === 'Ihr Getränk' || o.group === 'Ihr alkoholfreies Getränk'));
    const sauces = unique(src.filter(o => o.group === 'Ihre Sauce'));
    const dips = unique(src.filter(o => o.group === 'Dips'));
    const ordered = ['Ohne Sauce', 'Mit Mayonnaise', 'Mit Ketchup'].map(n => sauces.find(o => o.name === n)).filter(Boolean);
    return [
      { group: '__drink', options: drinks, required: true, menuOnly: true },
      { group: '__sauce', options: ordered.length ? ordered : sauces, required: true, menuOnly: true },
      { group: 'Dips', options: dips.filter(o => o.id !== 'no-dip' && o.name !== 'Ohne Dip'), required: false },
      { group: 'Ihre Extras', options: extras, required: false },
    ].filter(g => g.options.length);
  }
  const names = p.requiredGroups && p.requiredGroups.length ? p.requiredGroups : p.mealGroups && p.mealGroups.length ? p.mealGroups : [...new Set(a.map(o => o.group).filter(Boolean))];
  return names.map(group => ({ group, options: a.filter(o => o.group === group), required: a.some(o => o.required && o.group === group) || !!(p.requiredGroups && p.requiredGroups.includes(group)) })).filter(g => g.options.length);
}

// المنتج المتاح للزبون: من الكتالوج، والسعر/التوفر من إعدادات NARA (data.products) إذا موجودة
function productFor(id, catalog, products) {
  const p = catalog.find(x => String(x.id) === String(id) && !x.hidden);
  if (!p || p.unavailable === true) return null;
  const row = (products || []).find(x => String(x.sourceId) === String(id));
  if (row && (row.active === false || row.available === false || (row.channels && row.channels.customer === false))) return null;
  const cents = row && Number.isFinite(Number(row.priceCents)) ? Number(row.priceCents) : Number(p.cents) || 0;
  return { ...p, cents };
}

function priceLine(line, catalog, products) {
  const p = productFor(line && line.id, catalog, products);
  if (!p) throw Object.assign(Error('Produkt nicht verfügbar.'), { code: 'UNAVAILABLE', id: line && line.id });
  const qty = Math.trunc(Number(line.q));
  if (!(qty >= 1 && qty <= 30)) throw Object.assign(Error('Ungültige Menge.'), { code: 'QTY' });
  const menu = !!(line.m && p.menuCents);
  const groups = groupsFor(p, catalog).filter(g => !g.menuOnly || menu);
  const chosen = Array.isArray(line.o) ? line.o : [];
  if (chosen.length > 40) throw Object.assign(Error('Zu viele Optionen.'), { code: 'OPTS' });
  const chosenIds = new Set(chosen.map(c => str(c.i)));
  const cond = p.conditionalGroups || {};
  const visible = groups.filter(g => !cond[g.group] || cond[g.group].some(id => chosenIds.has(String(id))));
  const options = [];
  for (const c of chosen) {
    const g = visible.find(x => x.group === str(c.g));
    const o = g && g.options.find(x => String(x.id || x.name) === str(c.i));
    if (!o) throw Object.assign(Error('Unbekannte Option.'), { code: 'OPTION', id: p.id });
    options.push({ name: o.name, group: g.group, quantity: 1, cents: Number(o.cents) || 0, totalCents: Number(o.cents) || 0 });
  }
  for (const g of visible) {
    const n = options.filter(o => o.group === g.group).length;
    if (g.required && n !== 1) throw Object.assign(Error('Bitte Auswahl treffen: ' + g.group), { code: 'REQUIRED', id: p.id, group: g.group });
  }
  const base = menu ? Number(p.menuCents) : p.cents;
  const unit = base + options.reduce((s, o) => s + o.cents, 0);
  const note = clip(line.nt, 160);
  return {
    id: p.id, name: menu ? p.n + ' (Menü)' : p.n, category: menu ? 'Menü' : p.c, quantity: qty,
    unitCents: unit, totalCents: unit * qty,
    options: options.map(({ group, ...o }) => o), note, notes: note,
  };
}

function validateCustomer(c, type) {
  const name = clip(c && c.name, 60), phone = str(c && c.phone).replace(/[^\d+]/g, '');
  if (name.length < 2) throw Object.assign(Error('Bitte Namen angeben.'), { code: 'NAME' });
  if (phone.replace(/\D/g, '').length < 6 || phone.length > 20) throw Object.assign(Error('Bitte gültige Telefonnummer angeben.'), { code: 'PHONE' });
  const out = { name, phone };
  if (type === 'delivery') {
    const street = clip(c.street, 80), house = clip(c.house, 10), postal = str(c.postalCode).replace(/\s/g, ''), city = clip(c.city, 40) || 'Viersen';
    if (street.length < 3 || !house) throw Object.assign(Error('Bitte Straße und Hausnummer angeben.'), { code: 'ADDRESS' });
    if (!/^\d{5}$/.test(postal)) throw Object.assign(Error('Bitte PLZ angeben.'), { code: 'POSTAL' });
    Object.assign(out, { street, house, postalCode: postal, city, floor: clip(c.floor, 30), bell: clip(c.bell, 40) });
  }
  return out;
}

// payload = {type, cart:[{id,q,m,o:[{g,i}],nt}], customer, note, payment:'CASH'|'CARD'}
function buildOrder(payload, { catalog, products, rules, deliveryConfig, now = new Date() }) {
  const type = payload && payload.type === 'pickup' ? 'pickup' : 'delivery';
  const lines = Array.isArray(payload && payload.cart) ? payload.cart : [];
  if (!lines.length || lines.length > 40) throw Object.assign(Error('Warenkorb ist leer.'), { code: 'EMPTY' });
  const cart = lines.map(l => priceLine(l, catalog, products));
  const subtotal = cart.reduce((s, i) => s + i.totalCents, 0);
  const customer = validateCustomer(payload.customer || {}, type);
  let fee = 0, zone = null;
  if (type === 'delivery') {
    const q = rules.quote(deliveryConfig, { postalCode: customer.postalCode, subtotalCents: subtotal, type: 'delivery' });
    if (!q.ok) { const min = q.reason === 'BELOW_MINIMUM'; throw Object.assign(Error(min ? 'Mindestbestellwert nicht erreicht.' : 'Wir liefern leider nicht in diese PLZ.'), { code: min ? 'MINIMUM' : 'ZONE', quote: q }); }
    fee = q.customerFeeCents || 0; zone = q.zone;
  }
  const method = str(payload.payment).toUpperCase() === 'CARD' ? 'CARD' : 'CASH';
  const total = subtotal + fee;
  const token = crypto.randomBytes(12).toString('base64url');
  const code = 'W' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  const iso = now.toISOString(), promisedMin = type === 'delivery' ? 45 : 20;
  const items = cart.slice();
  if (fee) items.push({ name: 'Liefergebühr', kind: 'DELIVERY_FEE', quantity: 1, unitCents: fee, totalCents: fee, options: [] });
  const remarks = clip(payload.note, 200);
  return {
    source: 'WEB', platform: 'WEB', ingestMethod: 'WEBSITE',
    externalOrderCode: 'WEB-' + code, displayCode: code, webToken: token,
    type, orderType: type === 'delivery' ? 'DELIVERY' : 'PICKUP',
    customerName: customer.name, customerPhone: customer.phone,
    delivery: type === 'delivery' ? {
      name: customer.name, phone: customer.phone,
      address: customer.street + ' ' + customer.house, street: customer.street, house: customer.house,
      postalCode: customer.postalCode, postal: customer.postalCode, city: customer.city,
      floor: customer.floor, bell: customer.bell, notes: remarks, zone: zone && zone.id,
    } : { name: customer.name, phone: customer.phone },
    remarks, cart: items,
    subtotalCents: subtotal, deliveryFeeCents: fee, discountsCents: 0, tipCents: 0,
    totalCents: total, externalTotalCents: total,
    payment: { method, paid: false, raw: 'web' }, paymentMethod: method,
    externalPaymentStatus: method === 'CASH' ? 'CASH_ON_DELIVERY' : 'CARD_ON_DELIVERY',
    paymentStatus: 'UNPAID', cashDueCents: method === 'CASH' ? total : 0,
    asap: true, promisedMin, promisedDueAt: new Date(now.getTime() + promisedMin * 60000).toISOString(),
    dueAt: new Date(now.getTime() + promisedMin * 60000).toISOString(),
    status: 'OPEN', liveStage: 'PREPARE', platformStage: 'PREPARE',
    placedAt: iso, createdAt: iso, updatedAt: iso,
  };
}

// اللي بيشوفو الزبون عن طلبو (بدون أي بيانات تانية)
function publicStatus(o) {
  const st = str(o.status).toUpperCase(), stage = str(o.liveStage).toUpperCase();
  const kitchen = str(o.kitchenStatus).toUpperCase();
  let step = 'received';
  if (o.kitchenPrintedAt || o.autoKitchenPrintedAt || kitchen === 'COOKING' || kitchen === 'PREPARING') step = 'cooking';
  if (kitchen === 'READY' || stage === 'HANDOVER') step = o.type === 'pickup' ? 'ready' : 'onTheWay';
  if (stage === 'DONE' || st === 'COMPLETED' || o.deliveredAt) step = 'done';
  if (st === 'CANCELLED') step = 'cancelled';
  return { code: o.displayCode, type: o.type, step, promisedDueAt: o.promisedDueAt || o.dueAt || null, totalCents: o.totalCents };
}

module.exports = { groupsFor, productFor, priceLine, validateCustomer, buildOrder, publicStatus };
