// Flamo: مسح مبيعات الكاشير (طلبات + دفعات + إيصالات + سجلات TSE التجريبية) قبل اليوم.
// يبقّي: طلبات المنصات (Lieferando/Uber/Loco/Sides/Lanch/Web)، الزبائن، المنيو، الموظفين، المخزون، الإغلاقات.
// الاستعمال:  node scripts/reset-cashier-sales.mjs            (معاينة فقط، بدون أي تغيير)
//             node scripts/reset-cashier-sales.mjs --apply    (ينفّذ، بعد نسخة احتياطية، والسيرفر لازم يكون موقوف)
//             --before YYYY-MM-DD  (بدل "اليوم" بتوقيت برلين)
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = path.join(root, 'data', 'nara-admin.json');
const apply = process.argv.includes('--apply');
const bi = process.argv.indexOf('--before');
const TZ = 'Europe/Berlin';
const PLATFORMS = new Set(['LIEFERANDO', 'UBER_EATS', 'UBER', 'UBER EATS', 'LOCO', 'SIDES', 'LANCH', 'WEB', 'WOLT']);

function berlinDay(ms) { return new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ }); }
function offsetMin(ms) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find(x => x.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(p); if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}
function cutoffMs(day) {
  const utcMid = Date.parse(day + 'T00:00:00Z');
  return utcMid - offsetMin(utcMid) * 60000;
}

const day = bi > -1 ? process.argv[bi + 1] : berlinDay(Date.now());
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { console.error('❌ تاريخ غلط: ' + day); process.exit(1); }
const cutoff = cutoffMs(day);

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const isPlatform = o => ['source', 'channel', 'platform'].some(k => PLATFORMS.has(String(o[k] || '').toUpperCase()));
const when = o => Date.parse(o.updatedAt || o.completedAt || '') || NaN;

const orders = data.orders || [];
const delOrders = new Set(orders.filter(o => !isPlatform(o) && when(o) < cutoff).map(o => o.id));
const noDate = orders.filter(o => !isPlatform(o) && Number.isNaN(when(o))).length;

const payments = data.payments || [], receipts = data.receipts || [], fiscal = data.fiscalTransactions || [];
const delPay = new Set(payments.filter(p => delOrders.has(p.orderId)).map(p => p.id));
const delRec = new Set(receipts.filter(r => delOrders.has(r.orderId) || delPay.has(r.paymentId)).map(r => r.id));
const delFiscalIds = new Set(receipts.filter(r => delRec.has(r.id) && r.fiscalTransactionId).map(r => r.fiscalTransactionId));
const delFisc = new Set(fiscal.filter(f => delOrders.has(f.orderId) || delPay.has(f.paymentId) || delFiscalIds.has(f.id)).map(f => f.id));

const keepPlatform = orders.filter(isPlatform).length;
console.log('قبل تاريخ: ' + day + ' (برلين)  =>  ' + new Date(cutoff).toISOString());
console.log('طلبات الكاشير يلي رح تنمسح : ' + delOrders.size + '  (من أصل ' + orders.filter(o => !isPlatform(o)).length + ' طلب كاشير)');
console.log('دفعات                       : ' + delPay.size + ' من ' + payments.length);
console.log('إيصالات                     : ' + delRec.size + ' من ' + receipts.length);
console.log('سجلات TSE التجريبية         : ' + delFisc.size + ' من ' + fiscal.length);
console.log('طلبات المنصات (بتضل كلها)   : ' + keepPlatform);
console.log('الزبائن (بتضل)              : ' + (data.customers || []).length);
if (noDate) console.log('⚠️ طلبات كاشير بدون تاريخ (بتضل): ' + noDate);

if (!apply) { console.log('\nمعاينة فقط، ما تغيّر شي. للتنفيذ: node scripts/reset-cashier-sales.mjs --apply'); process.exit(0); }

let port = 4185;
try { const m = /^\s*PORT\s*=\s*(\d+)\s*$/m.exec(fs.readFileSync(path.join(root, '.env'), 'utf8')); if (m) port = Number(m[1]); } catch {}
const running = await new Promise(res => {
  const s = net.connect({ port, host: '127.0.0.1' }, () => { s.destroy(); res(true); });
  s.on('error', () => res(false)); s.setTimeout(1500, () => { s.destroy(); res(false); });
});
if (running) { console.error('\n❌ السيرفر شغال على البورت ' + port + '. أوقفه أولاً (NARA-Stop) وبعدها أعد التشغيل.'); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = dataFile + '.before-sales-reset-' + stamp + '.bak';
fs.copyFileSync(dataFile, backup);
console.log('\n✅ نسخة احتياطية: ' + path.relative(root, backup));

const before = { orders: orders.length, customers: (data.customers || []).length, platform: keepPlatform };
data.orders = orders.filter(o => !delOrders.has(o.id));
data.payments = payments.filter(p => !delPay.has(p.id));
data.receipts = receipts.filter(r => !delRec.has(r.id));
data.fiscalTransactions = fiscal.filter(f => !delFisc.has(f.id));
data.updatedAt = new Date().toISOString();

if ((data.customers || []).length !== before.customers || data.orders.filter(isPlatform).length !== before.platform) {
  console.error('❌ فحص السلامة فشل (الزبائن أو طلبات المنصات تغيّروا). ما كتبت شي.'); process.exit(3);
}
const tmp = dataFile + '.tmp-' + process.pid;
fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.renameSync(tmp, dataFile);
console.log('✅ تم المسح. طلبات المنصات والزبائن بنفس العدد. شغّل السيرفر هلق.');
