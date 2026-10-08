// nara-receipt.mjs
// تنسيق فاتورة الطلب بنفس ترتيب ورقة Lieferando "Print order"
// - renderLines(order)  : يبني الأسطر مع خصائصها (محاذاة، خط عريض، حجم، QR)
// - toText(lines)       : نص عادي (للمعاينة، للتطبيق، للسيرفر)
// - toEscPos(lines)     : بايتات ESC/POS جاهزة للطابعة الحرارية
// - printTcp(...)       : إرسال البايتات للطابعة على الشبكة (المنفذ 9100)

import net from 'node:net';

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
    verify: '!! CHECK ORDER IN PLATFORM APP !!',
    driver: 'Driver', round: 'Round', pickupAt: 'Pickup', etaAt: 'ETA',
    notBill: 'This is not a bill', scan: "Scan the QR code to open the order",
  },
  de: {
    delivery: 'Lieferung', pickup: 'Abholung', confirmed: 'Bestätigte Zeit', scheduled: 'Geplante Zeit', asap: 'So bald wie möglich',
    tel: 'Tel.', code: 'Bestätigungscode', floor: 'Etage', notes: 'Hinweis', remarks: 'Bemerkung',
    deliveryCosts: 'Lieferkosten', service: 'Servicegebühr', small: 'Mindermengenzuschlag',
    discount: 'Rabatt', stamp: 'Stempelkarte', total: 'Gesamtbetrag',
    important: 'Wichtig:', paidOnline: 'Bestellung ist bezahlt', payOnline: 'Zahlung online',
    cash: 'BARZAHLUNG', collect: 'Beim Kunden kassieren', check: 'ZAHLART PRÜFEN',
    verify: '!! BESTELLUNG IN PLATTFORM PRÜFEN !!',
    driver: 'Fahrer', round: 'Tour', pickupAt: 'Abholung', etaAt: 'Ankunft',
    notBill: 'Das ist keine Rechnung', scan: 'QR-Code scannen, um die Bestellung zu öffnen',
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
  big(o.orderType === 'PICKUP' ? t.pickup : t.delivery, { align: 'center', bold: true });
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
  if (o.orderType !== 'PICKUP') {
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

export function toText(lines, W = 42) {
  return lines.map(l => {
    if (l.qr) return ' '.repeat(Math.max(0, Math.floor((W - 12) / 2))) + `[QR: ${l.qr}]`;
    const len = l.text.length * (l.size === 2 ? 2 : 1);
    if (l.align === 'center') return ' '.repeat(Math.max(0, Math.floor((W - len) / 2))) + l.text;
    if (l.align === 'right') return ' '.repeat(Math.max(0, W - len)) + l.text;
    return l.text;
  }).join('\n');
}

// ───────────── ESC/POS ─────────────
const CP858 = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89,
  'è': 0x8a, 'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'Å': 0x8f, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93,
  'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9a, 'ø': 0x9b, '£': 0x9c, 'Ø': 0x9d,
  '×': 0x9e, 'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ß': 0xe1, '€': 0xd5,
};
function enc(str) {
  const out = [];
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { out.push(code); continue; }
    if (CP858[ch] !== undefined) { out.push(CP858[ch]); continue; }
    const base = ch.normalize('NFD')[0]; // ş → s ، ğ → g
    out.push(base && base.codePointAt(0) < 0x80 ? base.codePointAt(0) : 0x3f);
  }
  return Buffer.from(out);
}
function qrBytes(data, size = 6) {
  const d = Buffer.from(String(data), 'utf8');
  const n = d.length + 3;
  return Buffer.concat([
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([0x1d, 0x28, 0x6b, n & 255, n >> 8, 0x31, 0x50, 0x30]), d,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
  ]);
}
export function toEscPos(lines, { codepage = 19, cut = true } = {}) {
  const out = [Buffer.from([0x1b, 0x40, 0x1b, 0x74, codepage])];
  let align = 0, bold = false, big = false;
  const A = { left: 0, center: 1, right: 2 };
  for (const l of lines) {
    const a = A[l.align || 'left'];
    if (a !== align) { out.push(Buffer.from([0x1b, 0x61, a])); align = a; }
    if (l.qr) { out.push(qrBytes(l.qr), Buffer.from([0x0a])); continue; }
    const b = !!l.bold, g = l.size === 2;
    if (b !== bold) { out.push(Buffer.from([0x1b, 0x45, b ? 1 : 0])); bold = b; }
    if (g !== big) { out.push(Buffer.from([0x1d, 0x21, g ? 0x11 : 0x00])); big = g; }
    out.push(enc(l.text), Buffer.from([0x0a]));
  }
  out.push(Buffer.from([0x1b, 0x45, 0x00, 0x1d, 0x21, 0x00, 0x1b, 0x61, 0x00, 0x1b, 0x64, 0x04]));
  if (cut) out.push(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
  return Buffer.concat(out);
}

export function printTcp(host, port, buf, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    const to = setTimeout(() => { s.destroy(); reject(new Error('printer timeout')); }, timeoutMs);
    s.on('error', e => { clearTimeout(to); reject(e); });
    s.on('connect', () => s.write(buf, () => s.end()));
    s.on('close', () => { clearTimeout(to); resolve(); });
  });
}
