'use strict';
/* Plattform-Lieferbestellung bekommt Fahrer-QR-Token; /api/delivery/scan liefert Hinweise + Barzahlung */
const test=require('node:test'),assert=require('node:assert');
const fs=require('fs'),src=fs.readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');
test('server hat naraEnsureDeliveryQr und nutzt es beim Import',()=>{
  assert.match(src,/function naraEnsureDeliveryQr\(o\)/);
  assert.match(src,/naraEnsureDeliveryQr\(next\);data\.orders\.push\(next\)/);
  assert.match(src,/naraEnsureDeliveryQr\(duplicate\)/);
});
test('scan liefert Hinweise und CASH für Barzahlung',()=>{
  assert.match(src,/notes:\[delivery\.notes,order\.remarks\]/);
  assert.match(src,/paymentStatus:\(\['CASH','OPEN'\]\.includes/);
});
