'use strict';
const {safe,routeFor}=require('./local-invoice-preparser');
const valid={requiresFallback:false,positions:[{articleNumber:'TEST',quantity:1,unitPrice:2,lineTotal:2,vatRate:.19}],totalsValidation:{status:'VALID'}};
const discrepancy={...valid,requiresFallback:true,totalsValidation:{status:'ARITHMETIC_MISMATCH'}};
const cases=[
  ['synthetic-valid',routeFor(valid)],
  ['synthetic-discrepancy',routeFor(discrepancy)],
  ['local-unavailable','LOCAL_FAILED_GEMINI_USED']
];
console.log(JSON.stringify({mode:'DRY_RUN_NO_GEMINI_NO_WRITE',cases},null,2));
