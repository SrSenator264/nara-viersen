'use strict';
(()=>{
 const text={de:{title:'Kassenkontrolle',open:'Bestellstatus',audit:'Prüfung aktiv',settlement:'Tagesabschluss',external:'Externe Plattform: nur überwachen und für die Abrechnung vormerken. Keine Zahlung oder Steuerbuchung in NARA.'},ar:{title:'مراقبة الكاشير',open:'حالة الطلب',audit:'التدقيق شغّال',settlement:'سكّر اليوم',external:'طلب من برّا: بس للمتابعة والحسابات. ما في دفع ولا تسجيل ضريبة جوّا NARA.'},en:{title:'Cashier monitor',open:'Order status',audit:'Audit active',settlement:'Daily settlement',external:'External order: monitoring and accounting only. No payment or tax posting in NARA.'}};
 const lang=()=>(window.NARA_LANG&&NARA_LANG.get())||localStorage.getItem('nara-kasse-language')||'de';
 const ST={de:{OPEN:'offen',COMPLETED:'abgeschlossen',CANCELLED:'storniert',STORNIERT:'storniert',PAID:'bezahlt'},ar:{OPEN:'مفتوح',COMPLETED:'خالص',CANCELLED:'ملغى',STORNIERT:'ملغى',PAID:'مدفوع'},en:{OPEN:'open',COMPLETED:'completed',CANCELLED:'cancelled',STORNIERT:'voided',PAID:'paid'}};
 const external=new Set(['LIEFERANDO','WOLT','UBER_EATS','WHATSAPP','TELEFON']);
 const render=()=>{
  const t=text[lang()]||text.de,current=window.NARA_LEGACY_KASSE_STATE?.getCurrent?.();
  let host=document.querySelector('#nara-kasse-monitor');
  if(!host){host=document.createElement('section');host.id='nara-kasse-monitor';host.className='nara-kasse-monitor';document.querySelector('.order-strip')?.after(host)}
  if(!host)return;
  const status=current?.status||'OPEN',source=String(current?.source||'NARA').toUpperCase(),isExternal=external.has(source);
  host.innerHTML=`<strong>🛡️ ${t.title}</strong><span>● ${t.open}: ${(ST[lang()]||ST.de)[status]||status}</span><span>✓ ${t.audit}</span>${isExternal?`<em class="external-accounting">📊 ${t.external}</em>`:''}<a class="settlement-link" href="kasse-settlement.html">📊 ${t.settlement}</a>`;
 };
 const wait=setInterval(()=>{if(window.NARA_LEGACY_KASSE_STATE){clearInterval(wait);render();}},50);
 window.addEventListener('storage',render);window.addEventListener('nara-language-changed',render);
 document.addEventListener('change',e=>{if(e.target.closest('#order-source,#open-order'))setTimeout(render,30)});
 setTimeout(()=>{clearInterval(wait);render()},5000);
})();
