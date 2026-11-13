// Real-USB test: ONE test transaction (start + finish). Run: node scripts/tse-test-tx.mjs D:
// WARNING: the transaction stays in the TSE and appears in the Finanzamt export.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create } = require('../tse-swissbit.js');
const mount = process.argv[2] || process.env.NARA_TSE_PATH || 'D:';
const tse = create({ devicePath: mount, background: false });
try {
  const s = await tse.startTransaction({ processType: 'Kassenbeleg-V1', processData: '' });
  console.log('start  : tx', s.transactionNumber, s.logTime);
  const f = await tse.finishTransaction({
    transactionNumber: s.transactionNumber,
    processType: 'Kassenbeleg-V1',
    processData: 'Beleg^0.00_0.00_0.00_0.00_0.00^0.00:Bar',
  });
  console.log('finish : tx', f.transactionNumber, 'sigCounter', f.signatureCounter, f.logTime);
  console.log('signature (first 40):', f.signature.slice(0, 40) + '...');
  console.log('✅ معاملة تجريبية وحدة نجحت');
} catch (e) {
  console.error('❌', e.code || '', e.message);
  process.exitCode = 1;
} finally {
  try { await tse.close(); } catch {}
}
