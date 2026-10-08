'use strict';
(function(){
  const sentKey='nara-lieferando-live-sent-v7',clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function parse(code,text,total){
    const phone=(text.match(/(\+\d{8,15})/)||[])[1]||'';
    const addr=(text.match(/(\d{5})\s+([^,]+),\s*([\p{L} .-]+(?:straße|strasse|weg|platz|allee|ring|gasse))\s+(\d+[A-Za-z]?)/iu)||[]);
    const accepted=(text.match(/Order accepted at\s+([^#]+?)(?=\s+-\s+\d+\s+Items|\s+Floor:|\s+\d+\s+Items)/i)||[])[1]?.trim()||'';
    const verification=(text.match(/Verification code:\s*(\d{4,12})/i)||[])[1]||'';
    const name=(text.match(/(?:Delivery\s+)?([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+)+)\s+\+\d/iu)||[])[1]||'';
    const payment=/\bCash\b/i.test(text)?'CASH':/\bOnline\b/i.test(text)?'ONLINE':'UNKNOWN';
    const items=[];for(const m of text.matchAll(/(?:^|\s)(\d+)\s+([^€]{2,100}?)\s+EUR\s*([0-9]+[,.][0-9]{2})/gi)){const n=m[2].trim();if(!/^(subtotal|total|delivery fee|service fee|order accepted|verification code)$/i.test(n))items.push({id:'lieferando-'+code+'-'+items.length,name:n,quantity:+m[1],unitCents:Math.round(Number(m[3].replace(',','.'))*100)/(+m[1]||1),options:[],note:''})}
    const liveStage=/\bDone\b/i.test(text)&&!/\bHandover\b/i.test(text)?'DONE':/\bHandover\b/i.test(text)?'PREPARE':'HANDOVER';
    return {externalOrderCode:code,externalTotalCents:total,externalPaymentStatus:payment==='ONLINE'?'PAID_ON_PLATFORM':'UNKNOWN',paymentMethod:payment,acceptedAt:accepted,verificationCode:verification,type:/delivery|lieferung/i.test(text)?'delivery':'pickup',delivery:{name,phone,postal:addr[1]||'',city:(addr[2]||'').trim(),street:(addr[3]||'').trim(),address:[addr[3],addr[4],addr[1],addr[2]].filter(Boolean).join(' ')},cart:items,rawText:text,source:'LIEFERANDO',platform:'Lieferando',liveStage,statusUpdatedAt:new Date().toISOString()};
  }
  async function send(order){let sent=[];try{sent=(await chrome.storage.local.get(sentKey))[sentKey]||[]}catch{}const key=order.externalOrderCode+':'+order.externalTotalCents+':'+order.liveStage;if(sent.includes(key))return;try{const r=await fetch('http://localhost:4174/api/platform-orders/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'LIEFERANDO',order})}),j=await r.json();if(!r.ok&&!j.duplicate)throw Error(j.error||'NARA import failed');await chrome.storage.local.set({[sentKey]:[...sent.filter(x=>!x.startsWith(order.externalOrderCode+':')),key].slice(-1000)});console.info('[NARA][BRIDGE] synced structured order',order.externalOrderCode,order.liveStage)}catch(e){console.warn('[NARA][BRIDGE]',e.message)}}
  function scan(){
    const nodes=[...document.querySelectorAll('article,li,[role="listitem"],main section,main div')].filter(el=>{const t=clean(el.innerText||'');return /#[A-Z0-9]{5,12}\b/i.test(t)&&/(?:Total|Gesamt)\s+(?:EUR|€)?\s*[0-9]+[,.][0-9]{2}/i.test(t)&&t.length<7000});
    const seen=new Set();
    for(const el of nodes){const text=clean(el.innerText||''),cm=text.match(/#([A-Z0-9]{5,12})\b/i);if(!cm)continue;const code=cm[1].toUpperCase();if(seen.has(code))continue;seen.add(code);const m=text.match(/(?:Total|Gesamt)[\s\S]{0,120}?(?:EUR|€)\s*([0-9]+[,.][0-9]{2})/i),total=m?Math.round(Number(m[1].replace(',','.'))*100):0;if(total)send(parse(code,text,total))}
  }
  const badge=document.createElement('div');badge.textContent='NARA bridge active';badge.style='position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#0a7;color:#fff;padding:4px 7px;border-radius:4px;font:11px sans-serif;opacity:.8';document.documentElement.appendChild(badge);scan();new MutationObserver(()=>{clearTimeout(window.__naraBridgeTimer);window.__naraBridgeTimer=setTimeout(scan,500)}).observe(document.body,{childList:true,subtree:true,characterData:true});setInterval(scan,5000);
})();
