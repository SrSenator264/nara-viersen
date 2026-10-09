'use strict';
// print-service.js — الطباعة من السيرفر مباشرة، بلا نافذة طباعة.
// - الفاتورة/ورقة المطبخ/ورقة العرض بتنرسم بنفس شكل الشاشة (kasse-receipt.js) بمتصفح مخفي (Playwright)،
//   بتتحوّل لصورة أبيض/أسود وبتنبعت للطابعة كـ ESC/POS (بتمشي مع أي طابعة فواتير: Epson أو الرخيصة).
// - طرق الإرسال: windows (طابعة USB مركّبة بالويندوز، بالاسم) · network (IP:9100) · browser (نافذة المتصفح متل قبل).
// - الإعدادات بـ data.settings.printing وكلها قابلة للتعديل من لوحة 🖨️ بالكاشير.

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');

const ROOT = __dirname;
const ROLES = ['kasse', 'platform', 'kitchen', 'driver']; // فاتورة الكاشير · فاتورة المنصات (+العرض) · المطبخ · السواق

function defaults() {
  return {
    printers: [
      { id: 'kasse', name: 'Kasse (USB)', mode: 'browser', winName: '', ip: '', port: 9100, width: 80, cut: 'full' },
      { id: 'epson', name: 'Epson TM-m30II', mode: 'browser', winName: '', ip: '', port: 9100, width: 80, cut: 'partial' },
    ],
    routes: { kasse: 'kasse', platform: 'epson', kitchen: 'epson', driver: 'epson' },
    auto: { afterPayment: true, kitchenOnPlatformOrder: false, receiptOnPlatformOrder: false },
    promo: { enabled: true, platforms: ['LIEFERANDO', 'UBER_EATS', 'WOLT'], percent: 20, days: 30, url: 'https://nara-viersen.de/a' },
    copies: { kasse: 1, platform: 1, kitchen: 1, driver: 1 },
  };
}

// يدمج الإعدادات المحفوظة مع الافتراضية (كي ما ينقص شي بعد تحديث)
function config(data) {
  const d = defaults(), s = (data && data.settings && data.settings.printing) || {};
  const printers = Array.isArray(s.printers) && s.printers.length ? s.printers.map(p => ({ ...d.printers[0], ...p })) : d.printers;
  return {
    printers,
    routes: { ...d.routes, ...(s.routes || {}) },
    auto: { ...d.auto, ...(s.auto || {}) },
    promo: { ...d.promo, ...(s.promo || {}) },
    copies: { ...d.copies, ...(s.copies || {}) },
  };
}

const str = v => (v == null ? '' : String(v)).trim();
function sanitize(input) {
  const c = config({ settings: { printing: input || {} } });
  c.printers = c.printers.slice(0, 8).map((p, i) => ({
    id: str(p.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'p' + (i + 1),
    name: str(p.name).slice(0, 40) || 'Drucker ' + (i + 1),
    mode: ['browser', 'windows', 'network'].includes(p.mode) ? p.mode : 'browser',
    winName: str(p.winName).slice(0, 120),
    ip: /^[0-9.]{7,15}$/.test(str(p.ip)) ? str(p.ip) : '',
    port: Math.min(65535, Math.max(1, Number(p.port) || 9100)),
    width: Number(p.width) === 58 ? 58 : 80,
    cut: ['partial', 'full', 'none'].includes(p.cut) ? p.cut : 'full',
  }));
  const ids = new Set(c.printers.map(p => p.id));
  for (const r of ROLES) if (!ids.has(c.routes[r])) c.routes[r] = c.printers[0].id;
  for (const k of Object.keys(c.auto)) c.auto[k] = !!c.auto[k];
  c.promo.enabled = !!c.promo.enabled;
  c.promo.percent = Math.min(50, Math.max(5, Math.round(Number(c.promo.percent) || 20)));
  c.promo.days = Math.min(365, Math.max(1, Math.round(Number(c.promo.days) || 30)));
  c.promo.url = /^https?:\/\/[^\s"'<>]{3,200}$/.test(str(c.promo.url)) ? str(c.promo.url) : defaults().promo.url;
  c.promo.platforms = (Array.isArray(c.promo.platforms) ? c.promo.platforms : []).map(x => str(x).toUpperCase()).filter(x => /^(LIEFERANDO|UBER_EATS|WOLT|LANCH)$/.test(x));
  for (const r of ROLES) c.copies[r] = Math.min(3, Math.max(1, Math.round(Number(c.copies[r]) || 1)));
  return c;
}

const isPlatform = o => /LIEFERANDO|UBER|WOLT|LANCH/i.test(str(o && (o.platform || o.source)));
// أي دور للطلب: فاتورة الزبون لطلب منصة → platform، غير هيك → kasse
function roleFor(o, kind) {
  if (kind === 'kitchen') return 'kitchen';
  if (kind === 'driver') return 'driver';
  return isPlatform(o) ? 'platform' : 'kasse';
}
function printerFor(cfg, role) {
  return cfg.printers.find(p => p.id === cfg.routes[role]) || cfg.printers[0];
}

// ───────── الرسم (متصفح مخفي) ─────────
let browserP = null;
async function browser() {
  if (!browserP) browserP = require('playwright').chromium.launch({ headless: true }).catch(e => { browserP = null; throw e; });
  const b = await browserP;
  if (!b.isConnected()) { browserP = null; return browser(); }
  return b;
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// بيرجّع [{width,height,bits(Buffer)}] لكل ورقة (الفاتورة، ورقة العرض…)
async function rasterize(o, kind, printer, cfg, extra = {}) {
  const dots = printer.width === 58 ? 384 : 576;
  const scale = printer.width === 58 ? 1.5 : 2;          // css px → نقاط الطابعة
  const cssW = Math.floor(dots / scale);
  const b = await browser();
  const page = await b.newPage({ viewport: { width: cssW, height: 800 }, deviceScaleFactor: scale });
  try {
    const css = read('kasse-print-lifecycle.css');
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' + css + '\nhtml,body{margin:0;background:#fff;color:#000}.sheet{width:' + cssW + 'px;padding:0 4px;box-sizing:border-box}</style></head><body></body></html>');
    await page.addScriptTag({ content: read('vendor/qrcode.bundle.js') });
    await page.addScriptTag({ content: 'window.NARA_PROMO=' + JSON.stringify({ url: cfg.promo.url, percent: cfg.promo.percent, days: cfg.promo.days }) + ';' + read('kasse-receipt.js').replace(/import\('\/nara-receipt-core\.mjs'\)/, 'Promise.reject(new Error("offline"))') });
    const sheets = await page.evaluate(({ o, kind, promo }) => {
      const R = window.NARA_RECEIPT, out = [];
      if (kind === 'test') out.push('<div class="nara-rc"><div class="rc-brand">NARA</div><div class="rc-type">TESTDRUCK</div><div class="rc-c">' + new Date().toLocaleString('de-DE') + '</div><div class="rc-c rc-small">Drucker funktioniert ✓</div></div>');
      else if (kind === 'kitchen') out.push(R.kitchenHtml(o));
      else out.push(R.html(o, kind === 'driver' ? 'driver' : 'customer'));
      if (promo) out.push(R.promoHtml(o));
      return out;
    }, { o, kind, promo: !!extra.promo });
    const result = [];
    for (const html of sheets) {
      await page.evaluate(h => { document.body.innerHTML = '<div class="sheet">' + h + '</div>'; }, html);
      await page.waitForTimeout(30);
      const png = await page.locator('.sheet').screenshot({ type: 'png' });
      // PNG → أبيض/أسود (عتبة) → صفوف بتّات للطابعة
      const r = await page.evaluate(async ({ b64, dots }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const w = dots, h = Math.round(img.height * dots / img.width);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        const px = g.getImageData(0, 0, w, h).data, bw = w / 8, bits = new Uint8Array(bw * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, lum = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
          if (lum < 150) bits[y * bw + (x >> 3)] |= 0x80 >> (x & 7);
        }
        let s = ''; for (let i = 0; i < bits.length; i += 8192) s += String.fromCharCode.apply(null, bits.subarray(i, i + 8192));
        return { width: w, height: h, b64: btoa(s) };
      }, { b64: png.toString('base64'), dots });
      result.push({ width: r.width, height: r.height, bits: Buffer.from(r.b64, 'base64') });
    }
    return result;
  } finally { await page.close().catch(() => {}); }
}

// ───────── ESC/POS ─────────
function escposRaster(img) {
  const bw = img.width / 8, out = [], CH = 128;
  for (let y = 0; y < img.height; y += CH) {
    const h = Math.min(CH, img.height - y);
    out.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bw & 255, bw >> 8, h & 255, h >> 8]), img.bits.subarray(y * bw, (y + h) * bw));
  }
  return Buffer.concat(out);
}
function cutBytes(kind) {
  if (kind === 'none') return Buffer.from([0x1b, 0x64, 0x05]);
  return Buffer.from([0x1b, 0x64, 0x04, 0x1d, 0x56, kind === 'partial' ? 0x42 : 0x41, 0x00]);
}
// الفاتورة → قصّ (نصّي إذا في ورقة عرض بعدها) → ورقة العرض → قصّ كامل
function buildJob(images, printer) {
  const parts = [Buffer.from([0x1b, 0x40])];
  images.forEach((img, i) => {
    parts.push(escposRaster(img));
    const last = i === images.length - 1;
    parts.push(cutBytes(last ? (printer.cut === 'none' ? 'none' : 'full') : (printer.cut === 'none' ? 'none' : 'partial')));
  });
  return Buffer.concat(parts);
}

// ───────── الإرسال ─────────
function sendTcp(host, port, buf, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    const to = setTimeout(() => { s.destroy(); reject(new Error('Drucker antwortet nicht (' + host + ':' + port + ')')); }, timeoutMs);
    s.on('error', e => { clearTimeout(to); reject(e); });
    s.on('connect', () => s.write(buf, () => s.end()));
    s.on('close', () => { clearTimeout(to); resolve(); });
  });
}
function powershell(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' ')));
      resolve(String(stdout || ''));
    });
  });
}
async function sendWindows(printerName, buf) {
  if (process.platform !== 'win32') throw new Error('Windows-Druck nur auf dem Kassen-PC');
  const f = path.join(os.tmpdir(), 'nara-print-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.bin');
  fs.writeFileSync(f, buf);
  try { await powershell(path.join(ROOT, 'scripts', 'raw-print.ps1'), ['-Printer', printerName, '-File', f]); }
  finally { fs.unlink(f, () => {}); }
}
async function windowsPrinters() {
  if (process.platform !== 'win32') return [];
  const out = await powershell(path.join(ROOT, 'scripts', 'list-printers.ps1'));
  return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// طباعة طلب. kind: customer | kitchen | driver | test. بيرجّع {mode:'browser'} إذا الطابعة على نافذة المتصفح.
async function printOrder(data, o, kind, opts = {}) {
  const cfg = config(data);
  const role = opts.role || roleFor(o, kind);
  const printer = opts.printerId ? (cfg.printers.find(p => p.id === opts.printerId) || printerFor(cfg, role)) : printerFor(cfg, role);
  const promo = kind === 'customer' && role === 'platform' && cfg.promo.enabled && cfg.promo.platforms.includes(str(o.platform || o.source).toUpperCase().replace(/^UBER$/, 'UBER_EATS'));
  if (printer.mode === 'browser') return { ok: true, mode: 'browser', printer: printer.id, role, promo };
  const images = await rasterize(o, kind, printer, cfg, { promo });
  const job = buildJob(images, printer);
  const copies = kind === 'test' ? 1 : (cfg.copies[role] || 1);
  for (let i = 0; i < copies; i++) {
    if (printer.mode === 'network') { if (!printer.ip) throw new Error('IP-Adresse fehlt'); await sendTcp(printer.ip, printer.port, job); }
    else if (printer.mode === 'windows') { if (!printer.winName) throw new Error('Windows-Drucker nicht gewählt'); await sendWindows(printer.winName, job); }
  }
  return { ok: true, mode: printer.mode, printer: printer.id, role, promo, sheets: images.length };
}

module.exports = { defaults, config, sanitize, roleFor, printerFor, printOrder, rasterize, buildJob, escposRaster, windowsPrinters, ROLES };
