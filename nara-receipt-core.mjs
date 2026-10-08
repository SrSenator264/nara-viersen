// nara-receipt-core.mjs — قالب الفاتورة الموحّد (بدون أي اعتماد على Node): يشتغل بالمتصفح (الكاشير) وبالسيرفر (الجسر/الطابعة).
// nara-receipt.mjs
// تنسيق فاتورة الطلب بنفس ترتيب ورقة Lieferando "Print order"
// - renderLines(order)  : يبني الأسطر مع خصائصها (محاذاة، خط عريض، حجم، QR)
// - toText(lines)       : نص عادي (للمعاينة، للتطبيق، للسيرفر)
// - toEscPos(lines)     : بايتات ESC/POS جاهزة للطابعة الحرارية
// - printTcp(...)       : إرسال البايتات للطابعة على الشبكة (المنفذ 9100)

export const DEFAULT_HEADER = 'IU GENE, Gereonstraße 1, 41747 Viersen, Tel.: 02162 5013538';
const TZ = 'Europe/Berlin';

const TXT = {
  en: {
    delivery: 'Delivery', pickup: 'Pickup', confirmed: 'Confirmed time', scheduled: 'Scheduled time', asap: 'ASAP',
    tel: 'Tel.', code: 'Verification code', floor: 'Floor', notes: 'Notes', remarks: 'Remarks',
    deliveryCosts: 'Delivery costs', service: 'Service fee', small: 'Small order fee',
    discount: 'Discount', stamp: 'Stamp card', total: 'Total',
    important: 'Important:', paidOnline: 'Order is paid online', payOnline: 'Payment Online',
    cash: 'CASH ORDER', collect: 'Collect from customer', check: 'CHECK PAYMENT',
    dineIn: 'Dine-in', table: 'Table', paidCard: 'PAID · CARD', paidCash: 'PAID · CASH', open: 'PAYMENT OPEN',
    verify: '!! CHECK ORDER IN PLATFORM APP !!',
    driver: 'Driver', round: 'Round', pickupAt: 'Pickup', etaAt: 'ETA',
    notBill: 'This is not a bill', scan: "Scan the QR code to open the order",
    kitchen: 'KITCHEN', readyBy: 'Ready by', since: 'Ordered',
  },
  de: {
    delivery: 'Lieferung', pickup: 'Abholung', confirmed: 'Bestätigte Zeit', scheduled: 'Geplante Zeit', asap: 'So bald wie möglich',
    tel: 'Tel.', code: 'Bestätigungscode', floor: 'Etage', notes: 'Hinweis', remarks: 'Bemerkung',
    deliveryCosts: 'Lieferkosten', service: 'Servicegebühr', small: 'Mindermengenzuschlag',
    discount: 'Rabatt', stamp: 'Stempelkarte', total: 'Gesamtbetrag',
    important: 'Wichtig:', paidOnline: 'Bestellung ist bezahlt', payOnline: 'Zahlung online',
    cash: 'BARZAHLUNG', collect: 'Beim Kunden kassieren', check: 'ZAHLART PRÜFEN',
    dineIn: 'Vor Ort', table: 'Tisch', paidCard: 'BEZAHLT · KARTE', paidCash: 'BEZAHLT · BAR', open: 'ZAHLUNG OFFEN',
    verify: '!! BESTELLUNG IN PLATTFORM PRÜFEN !!',
    driver: 'Fahrer', round: 'Tour', pickupAt: 'Abholung', etaAt: 'Ankunft',
    notBill: 'Das ist keine Rechnung', scan: 'QR-Code scannen, um die Bestellung zu öffnen',
    kitchen: 'KÜCHE', readyBy: 'Fertig bis', since: 'Bestellt',
  },
};

const eur = c => (Math.round(Number(c) || 0) / 100).toFixed(2);

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parts(d) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}
export function fmtDateTime(v) {
  const d = toDate(v); if (!d) return '';
  const p = parts(d);
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
}
export function fmtTime(v) {
  const d = toDate(v); if (!d) return '';
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

export function wrap(text, width) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out = [];
  let line = '';
  for (let w of words) {
    while (w.length > width) {
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if ((line + ' ' + w).length <= width) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

// سطر بعمودين: النص يسار، السعر يمين. النص الطويل يلتف على أسطر إضافية.
function row(left, right, W, indent = '') {
  if (!right) return wrap(left, W - indent.length).map((s, i) => (i ? indent + '   ' : indent) + s);
  const room = Math.max(8, W - right.length - 1 - indent.length);
  const ws = wrap(left, room);
  const out = [(indent + ws[0]).padEnd(W - right.length) + right];
  for (const s of ws.slice(1)) out.push(indent + '   ' + s);
  return out;
}

export function renderLines(o, opt = {}) {
  const W = opt.width || 42;
  const t = TXT[opt.lang] || TXT.en;
  const L = [];
  const add = (text, st = {}) => L.push({ text: String(text), ...st });
  const big = (text, st = {}) => { for (const s of wrap(text, Math.floor(W / 2))) add(s, { size: 2, ...st }); };
  const sep = () => add('-'.repeat(W));

  // ── الترويسة: المطعم، رقم الطلب، وقت الطلب، المنصة
  for (const s of wrap(opt.header || DEFAULT_HEADER, W)) add(s, { align: 'center' });
  big(o.displayCode || o.externalOrderCode || '', { align: 'center', bold: true });
  const placed = fmtDateTime(o.placedAt);
  if (placed) add(placed, { align: 'center' });
  if (o.platform) add(o.platform, { align: 'center', bold: true });
  sep();

  // ── نوع الطلب والوقت
  big(o.orderType === 'PICKUP' ? t.pickup : o.orderType === 'DINE_IN' ? `${t.dineIn}${o.table ? ' · ' + t.table + ' ' + o.table : ''}` : t.delivery, { align: 'center', bold: true });
  const dueAt = o.requestedAt || o.dueAt || o.etaAt;
  if (fmtTime(dueAt)) {
    add(o.requestedAt ? t.scheduled : t.confirmed, { align: 'center' });
    big(fmtTime(dueAt), { align: 'center', bold: true });
  } else if (!o.requestedAt) {
    add(t.asap, { align: 'center' });
  }
  add('');

  // ── الزبون
  const d = o.delivery || {};
  if (o.customerName) add(o.customerName, { bold: true });
  if (o.orderType !== 'PICKUP' && o.orderType !== 'DINE_IN') {
    if (d.address) for (const s of wrap(d.address, W)) add(s);
    if (d.floor) for (const s of wrap(`${t.floor}: ${d.floor}`, W)) add(s);
    const cityLine = [d.postalCode, d.city].filter(Boolean).join(' ');
    if (cityLine) add(cityLine);
  }
  if (o.customerPhone) add(`${t.tel}: ${o.customerPhone}`);
  if (o.verificationCode) add(`${t.code}: ${o.verificationCode}`);
  if (d.notes) for (const s of wrap(`${t.notes}: ${d.notes}`, W)) add(s, { bold: true });
  sep();

  // ── الأصناف مجمّعة حسب الفئة
  const groups = new Map();
  for (const it of o.cart || []) {
    const k = it.category || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  for (const [cat, items] of groups) {
    if (cat) add(cat, { bold: true });
    for (const it of items) {
      for (const s of row(`${it.quantity}x ${it.name}`, `${eur(it.totalCents)} EUR`, W)) add(s);
      for (const op of it.options || []) {
        const lab = `+ ${op.quantity > 1 ? op.quantity + 'x ' : ''}${op.name}`;
        for (const s of row(lab, op.totalCents > 0 ? `${eur(op.totalCents)} EUR` : '', W, '  ')) add(s);
      }
      if (it.notes) for (const s of wrap(`! ${it.notes}`, W - 2)) add('  ' + s, { bold: true });
    }
  }
  sep();

  // ── الرسوم والإجمالي
  const f = o.fees || {};
  const line = (label, cents, bold = false) => { for (const s of row(label, `${eur(cents)} EUR`, W)) add(s, { bold }); };
  if (f.delivery) line(t.deliveryCosts, f.delivery);
  if (f.service) line(t.service, f.service);
  if (f.small) line(t.small, f.small);
  if (o.discountsCents) line(t.discount, -Math.abs(o.discountsCents));
  if (o.stampCents) line(t.stamp, -Math.abs(o.stampCents));
  line(t.total, o.totalCents, true);
  sep();

  // ── الدفع
  add(t.important);
  const p = o.payment || {};
  if (p.method === 'ONLINE') {
    big(t.paidOnline, { align: 'center', bold: true });
    add(t.payOnline, { align: 'center' });
  } else if (p.method === 'PAID_CARD') {
    big(t.paidCard, { align: 'center', bold: true });
  } else if (p.method === 'PAID_CASH') {
    big(t.paidCash, { align: 'center', bold: true });
  } else if (p.method === 'OPEN') {
    big(t.open, { align: 'center', bold: true });
    big(`${eur(o.totalCents)} EUR`, { align: 'center', bold: true });
  } else if (p.method === 'CASH') {
    big(t.cash, { align: 'center', bold: true });
    big(`${eur(o.cashDueCents || o.totalCents)} EUR`, { align: 'center', bold: true });
    add(t.collect, { align: 'center' });
  } else {
    big(t.check, { align: 'center', bold: true });
    if (p.raw) add(`(${p.raw})`, { align: 'center' });
  }
  if (o.remarks) for (const s of wrap(`${t.remarks}: ${o.remarks}`, W)) add(s, { bold: true });
  if (o.parseStatus === 'CHECK') { add(''); add(t.verify, { align: 'center', bold: true }); }

  // ── الموظف المسؤول (يُضاف من نظامك عند الإسناد)
  const a = o.assignment;
  if (a && (a.driverName || a.roundId)) {
    sep();
    if (a.driverName) big(`${t.driver}: ${a.driverName}`, { bold: true });
    if (a.roundId) add(`${t.round}: ${a.roundId}`, { bold: true });
    if (a.pickupAt) add(`${t.pickupAt}: ${fmtTime(a.pickupAt)}`);
    if (a.etaAt) add(`${t.etaAt}: ${fmtTime(a.etaAt)}`);
  }

  // ── التذييل
  sep();
  add(t.notBill, { align: 'center' });
  L.push({ text: '', qr: `NARA|${o.platform || ''}|${o.displayCode || o.externalOrderCode}`, align: 'center' });
  for (const s of wrap(t.scan, W)) add(s, { align: 'center' });
  sep();
  return L;
}

// تذكرة المطبخ: نفس ترتيب الفاتورة الموحّدة لكن بدون أي مبلغ أو دفع أو عنوان.
// الأصناف بخط كبير، والخيارات والملاحظات واضحة.
export function renderKitchenLines(o, opt = {}) {
  const W = opt.width || 42;
  const t = TXT[opt.lang] || TXT.de;
  const L = [];
  const add = (text, st = {}) => L.push({ text: String(text), ...st });
  const big = (text, st = {}) => { for (const s of wrap(text, Math.floor(W / 2))) add(s, { size: 2, ...st }); };
  const sep = () => add('-'.repeat(W));

  big(t.kitchen, { align: 'center', bold: true });
  big(o.displayCode || o.externalOrderCode || '', { align: 'center', bold: true });
  if (o.platform && o.platform !== 'NARA') add(o.platform, { align: 'center', bold: true });
  sep();
  big(o.orderType === 'PICKUP' ? t.pickup : o.orderType === 'DINE_IN' ? `${t.dineIn}${o.table ? ' ' + o.table : ''}` : t.delivery, { align: 'center', bold: true });
  const placed = fmtTime(o.placedAt);
  if (placed) add(`${t.since}: ${placed}`, { align: 'center' });
  const ready = fmtTime(o.readyBy || o.requestedAt || o.dueAt);
  if (ready) big(`${t.readyBy} ${ready}`, { align: 'center', bold: true });
  else add(t.asap, { align: 'center' });
  if (o.customerName) add(o.customerName, { align: 'center' });
  const notes = [o.delivery && o.delivery.notes, o.remarks].filter(Boolean).join(' · ');
  if (notes) { sep(); for (const s of wrap(`${t.notes}: ${notes}`, W)) add(s, { bold: true }); }
  sep();
  for (const it of o.cart || []) {
    for (const s of wrap(`${it.quantity}x ${it.name}`, Math.floor(W / 2))) add(s, { size: 2, bold: true });
    for (const op of it.options || []) for (const s of wrap(`+ ${op.quantity > 1 ? op.quantity + 'x ' : ''}${op.name}`, W - 2)) add('  ' + s);
    if (it.notes) for (const s of wrap(`! ${it.notes}`, W - 2)) add('  ' + s, { bold: true });
    add('');
  }
  sep();
  return L;
}

export function toText(lines, W = 42) {
  return lines.map(l => {
    if (l.qr) return ' '.repeat(Math.max(0, Math.floor((W - 12) / 2))) + `[QR: ${l.qr}]`;
    const len = l.text.length * (l.size === 2 ? 2 : 1);
    if (l.align === 'center') return ' '.repeat(Math.max(0, Math.floor((W - len) / 2))) + l.text;
    if (l.align === 'right') return ' '.repeat(Math.max(0, W - len)) + l.text;
    return l.text;
  }).join('\n');
}

