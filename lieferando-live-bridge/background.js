'use strict';
chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
  if(message?.type!=='NARA_IMPORT_LIEFERANDO')return;
  fetch('http://localhost:4174/api/platform-orders/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'LIEFERANDO',order:message.order})})
    .then(async response=>({ok:response.ok||response.status===409,status:response.status,data:await response.json().catch(()=>({}))}))
    .then(result=>sendResponse(result))
    .catch(error=>sendResponse({ok:false,error:error.message||'NARA local bridge unavailable'}));
  return true;
});
