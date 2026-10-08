// nara-receipt.mjs — القالب الموحّد (من nara-receipt-core.mjs) + بايتات ESC/POS + الإرسال للطابعة بالشبكة.
import net from 'node:net';
export * from './nara-receipt-core.mjs';

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
