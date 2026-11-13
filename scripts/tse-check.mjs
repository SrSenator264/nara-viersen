// scripts/tse-check.mjs — فحص للقراءة فقط للـ Swissbit TSE (بدون setup وبدون معاملات وبدون أي تغيير على الـ USB).
// تشغيل:  node scripts/tse-check.mjs D:
import koffi from 'koffi';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mount = process.argv[2] || process.env.NARA_TSE_PATH || 'D:';
const dll = process.env.NARA_TSE_DLL || path.join(root, 'tse-sdk', 'Swissbit_TSE_SDK_v6.0.1', 'sdk-offline', 'sdk', 'c', 'windows64', 'bin', 'WormAPI.dll');
if (!fs.existsSync(dll)) { console.error('❌ DLL مو موجود:', dll); process.exit(1); }
console.log('DLL  :', dll);
console.log('درايف:', mount);

const lib = koffi.load(dll);
koffi.opaque('WormContext');
koffi.opaque('WormInfo');
const f = {
  version: lib.func('const char *worm_getVersion(void)'),
  init: lib.func('int worm_init(_Out_ WormContext **context, const char *mountPoint)'),
  cleanup: lib.func('int worm_cleanup(WormContext *context)'),
  infoNew: lib.func('WormInfo *worm_info_new(WormContext *context)'),
  infoFree: lib.func('void worm_info_free(WormInfo *info)'),
  infoRead: lib.func('int worm_info_read(WormInfo *info)'),
};
const u32 = n => lib.func('uint32_t ' + n + '(const WormInfo *info)');
const i32 = n => lib.func('int ' + n + '(const WormInfo *info)');
const str = n => lib.func('const char *' + n + '(const WormInfo *info)');
const bytes = n => { const g = lib.func('void ' + n + '(const WormInfo *info, _Out_ uint8_t **data, _Out_ uint64_t *len)'); return info => { const p = [null], l = [0n]; g(info, p, l); return Buffer.from(koffi.decode(p[0], 'uint8_t', Number(l[0]))).toString('hex'); }; };

console.log('SDK  :', f.version());
const ctx = [null];
let err = f.init(ctx, mount);
if (err !== 0) { console.error('❌ worm_init فشل، رمز الخطأ:', err, '(2 = ما في TSE، 3 = IO، 24 = ما انلقى)'); process.exit(1); }
const info = f.infoNew(ctx[0]);
err = f.infoRead(info);
if (err !== 0) { console.error('❌ worm_info_read فشل، رمز الخطأ:', err); f.infoFree(info); f.cleanup(ctx[0]); process.exit(1); }

const fields = {
  initializationState: ['0 = جديد (ما انعمله setup)، 1 = جاهز، 2 = متوقف', u32('worm_info_initializationState')],
  hasChangedAdminPin: ['', i32('worm_info_hasChangedAdminPin')],
  hasChangedAdminPuk: ['', i32('worm_info_hasChangedAdminPuk')],
  hasPassedSelfTest: ['', i32('worm_info_hasPassedSelfTest')],
  hasValidTime: ['', i32('worm_info_hasValidTime')],
  isCtssInterfaceActive: ['', i32('worm_info_isCtssInterfaceActive')],
  registeredClients: ['', u32('worm_info_registeredClients')],
  maxRegisteredClients: ['', u32('worm_info_maxRegisteredClients')],
  startedTransactions: ['معاملات مفتوحة', u32('worm_info_startedTransactions')],
  createdSignatures: ['', u32('worm_info_createdSignatures')],
  remainingSignatures: ['', u32('worm_info_remainingSignatures')],
  maxSignatures: ['', u32('worm_info_maxSignatures')],
  capacity: ['', u32('worm_info_capacity')],
  size: ['', u32('worm_info_size')],
  maxTimeSynchronizationDelay: ['ثواني', u32('worm_info_maxTimeSynchronizationDelay')],
  softwareVersion: ['', u32('worm_info_softwareVersion')],
  tseCertificationId: ['', str('worm_info_tseCertificationId')],
  formFactor: ['', str('worm_info_formFactor')],
  tseSerialNumber: ['', bytes('worm_info_tseSerialNumber')],
  publicKey: ['', bytes('worm_info_tsePublicKey')],
};
for (const [k, [note, fn]] of Object.entries(fields)) {
  let v; try { v = fn(info); } catch (e) { v = '⚠️ ' + e.message; }
  console.log(k.padEnd(28), String(v).slice(0, 80), note ? '  (' + note + ')' : '');
}
console.log('signatureAlgorithm:', lib.func('const char *worm_signatureAlgorithm(void)')());
console.log('logTimeFormat     :', lib.func('const char *worm_logTimeFormat(void)')());
f.infoFree(info);
f.cleanup(ctx[0]);
console.log('✅ خلص — قراءة فقط، ما تغيّر شي على الـ USB.');
