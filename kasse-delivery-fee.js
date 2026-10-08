// kasse-delivery-fee.js — يعرض للكاشير رسم التوصيل والحد الأدنى حسب الرمز البريدي (من /api/delivery/quote).
// الرسم بيدخل كسطر 'Liefergebühr' (kind=DELIVERY_FEE) داخل سلة الطلب، فبيطلع تلقائياً بالمجموع والدفع والفاتورة.
// الحد الأدنى تحذير فقط (ما بيمنع). أجور السائقين ما بتوصل لهون أبداً.
(function(){
  const $=s=>document.querySelector(s);
  const T={de:{fee:'Liefergebühr',min:'Mindestbestellwert',total:'Gesamt inkl. Lieferung',short:'Es fehlen noch',ok:'Mindestbestellwert erreicht',out:'Außerhalb des Liefergebiets',bad:'PLZ ungültig (5 Ziffern)',nocfg:'Zone nicht eingerichtet',err:'Gebühren nicht abrufbar (Server)',hint:'PLZ eingeben, dann erscheint die Liefergebühr.',waived:'Liefergebühr erlassen'},
    ar:{fee:'رسم التوصيل',min:'الحد الأدنى للطلب',total:'الإجمالي مع التوصيل',short:'ناقص',ok:'الحد الأدنى مكتمل',out:'خارج منطقة التوصيل',bad:'الرمز البريدي غير صالح (5 أرقام)',nocfg:'المنطقة غير مضبوطة',err:'تعذّر جلب الرسوم (السيرفر)',hint:'اكتب الرمز البريدي ليظهر رسم التوصيل.',waived:'رسم التوصيل ملغى'},
    en:{fee:'Delivery fee',min:'Minimum order',total:'Total incl. delivery',short:'Still missing',ok:'Minimum order reached',out:'Outside delivery area',bad:'Invalid postcode (5 digits)',nocfg:'Zone not configured',err:'Fees unavailable (server)',hint:'Enter the postcode to see the delivery fee.',waived:'Delivery fee waived'}};
  const lang=()=>{try{return localStorage.getItem('nara-kasse-language')||document.documentElement.lang||'de'}catch(e){return 'de'}};
  const tr=k=>(T[lang()]||T.de)[k]||T.de[k];
  const eur=c=>(c/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const cents=txt=>{const m=String(txt||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');return Math.round((parseFloat(m)||0)*100)};
  const card=$('.delivery-card'),total=$('#total');
  if(!card||!total)return;
  const box=document.createElement('div');box.id='nara-quote';box.className='nara-quote';card.appendChild(box);
  let seq=0;
  function chipFee(text,state){const el=document.querySelector('#dl-chip .dl-fee');if(el){el.textContent=text||'';el.dataset.state=state||''}}
  const FEE='DELIVERY_FEE',legacy=()=>window.NARA_LEGACY_KASSE_STATE;
  const curOrder=()=>{const L=legacy();return L&&L.getCurrent?L.getCurrent():null};
  function isDelivery(){const o=curOrder();return o?o.type==='delivery':!card.hidden}
  // المجموع الفرعي بدون سطر الرسم (حتى ما يتحسب الحد الأدنى على الرسم نفسه)
  function subtotal(){const o=curOrder();return o?(o.cart||[]).filter(i=>i.kind!==FEE).reduce((s,i)=>s+(Number(i.unitCents)||0)*(Number(i.quantity)||0),0):cents(total.textContent)}
  // يزامن سطر الرسم مع السلة: null = ما في رسم (شيله). لو الموظف حذف السطر = إعفاء، ما نرجّعه تلقائياً.
  function syncFee(feeCents,quote){
    const L=legacy(),o=curOrder();if(!L||!o)return false;
    const cart=o.cart||(o.cart=[]),idx=cart.findIndex(i=>i.kind===FEE);let changed=false;
    const want=o.type==='delivery'&&Number.isInteger(feeCents)&&feeCents>0&&cart.some(i=>i.kind!==FEE);
    if(!want){if(idx>=0){cart.splice(idx,1);changed=true}if(o.deliveryFee){delete o.deliveryFee;changed=true}}
    else if(idx<0){
      if(o.deliveryFee&&o.deliveryFee.applied){o.deliveryFee={waived:true,zoneId:quote&&quote.zone?quote.zone.id:null,ruleVersion:quote&&quote.ruleVersion||null};changed=true}
      else if(!(o.deliveryFee&&o.deliveryFee.waived)){
        cart.push({id:'fee-'+Date.now(),name:'Liefergebühr',unitCents:feeCents,quantity:1,options:[],note:'',kind:FEE,zoneId:quote&&quote.zone?quote.zone.id:null});
        o.deliveryFee={applied:true,cents:feeCents,zoneId:quote&&quote.zone?quote.zone.id:null,ruleVersion:quote&&quote.ruleVersion||null};changed=true}
    }else{
      const it=cart[idx];
      if(it.unitCents!==feeCents||(quote&&quote.zone&&it.zoneId!==quote.zone.id)){it.unitCents=feeCents;it.zoneId=quote&&quote.zone?quote.zone.id:it.zoneId;o.deliveryFee={applied:true,cents:feeCents,zoneId:it.zoneId,ruleVersion:quote&&quote.ruleVersion||null};changed=true}
    }
    if(changed){L.save();L.render()}
    return changed;
  }
  async function refresh(){
    if(!isDelivery()){syncFee(null);chipFee('','');return}
    const plz=($('#postal-code')||{}).value||'',sub=subtotal(),mine=++seq;
    if(!plz.trim()){box.dataset.state='hint';box.textContent=tr('hint');syncFee(null);chipFee('','');return}
    let q;try{const r=await fetch('/api/delivery/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postalCode:plz,subtotalCents:sub,type:'delivery'})});q=await r.json()}catch(e){q=null}
    if(mine!==seq)return;
    if(!q){box.dataset.state='bad';box.textContent=tr('err');chipFee(tr('err'),'bad');return}
    if(q.reason==='POSTAL_CODE_INVALID'||q.reason==='OUT_OF_AREA'||q.reason==='ZONE_NOT_CONFIGURED'){
      box.dataset.state='bad';box.textContent=tr(q.reason==='POSTAL_CODE_INVALID'?'bad':q.reason==='OUT_OF_AREA'?'out':'nocfg');syncFee(null);chipFee(box.textContent,'bad');return}
    const okMin=q.ok;
    box.dataset.state=okMin?'ok':'warn';
    box.innerHTML=`<div><span>${tr('fee')}</span><strong>${eur(q.customerFeeCents)}</strong></div><div><span>${tr('min')}</span><strong>${eur(q.minOrderCents)}</strong></div><div class="nq-status">${okMin?'✓ '+tr('ok'):'⚠ '+tr('short')+' '+eur(q.shortfallCents)}</div>`;
    const o=curOrder(),waived=!!(o&&o.deliveryFee&&o.deliveryFee.waived);
    syncFee(q.customerFeeCents,q);
    const o2=curOrder(),nowWaived=waived||!!(o2&&o2.deliveryFee&&o2.deliveryFee.waived);
    chipFee((nowWaived?tr('waived'):tr('fee')+' '+eur(q.customerFeeCents))+' · '+(okMin?'✓ '+tr('ok'):'⚠ '+tr('short')+' '+eur(q.shortfallCents)),okMin?'ok':'warn');
  }
  const again=()=>setTimeout(refresh,0);
  ($('#postal-code')||card).addEventListener('input',refresh);
  document.querySelectorAll('[data-order-type]').forEach(b=>b.addEventListener('click',again));
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',again));
  new MutationObserver(refresh).observe(total,{childList:true,characterData:true,subtree:true});
  new MutationObserver(refresh).observe(card,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('nara-chip-ready',refresh);
  refresh();
})();
