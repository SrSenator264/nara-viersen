const test=require('node:test'),assert=require('node:assert');
const a=require('../platform-accept.js');
const cfg=(pp,auto)=>({platformPrint:pp,auto:{kitchenOnPlatformOrder:false,receiptOnPlatformOrder:false,webOrder:true,kitchenOnAccept:true,receiptOnAccept:true,...auto}});
test('master off: nothing prints for platform orders even with old flags on',()=>{
  const c=cfg({kind:'kitchen',onAccept:false},{kitchenOnPlatformOrder:true,receiptOnPlatformOrder:true});
  for(const acc of [true,false]) assert.deepEqual(a.printJobs({source:'LIEFERANDO'},c,{onAccept:acc}),[]);
});
test('master on: chosen ticket prints on accept',()=>{
  assert.deepEqual(a.printJobs({source:'LIEFERANDO'},cfg({kind:'driver',onAccept:true}),{onAccept:true}),[['driver','autoDriverPrintedAt']]);
});
test('website orders keep their own setting',()=>{
  assert.equal(a.printJobs({source:'WEB'},cfg({kind:'kitchen',onAccept:false}),{onAccept:false}).length,2);
});
