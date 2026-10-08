// kasse-delivery-fee.js — يعرض للكاشير رسم التوصيل والحد الأدنى حسب الرمز البريدي (من /api/delivery/quote).
// عرض فقط في هاد الخطوة: ما بيغيّر مجموع الطلب المحفوظ ولا الفاتورة. أجور السائقين ما بتوصل لهون أبداً.
(function(){
  const $=s=>document.querySelector(s);
  const T={de:{fee:'Liefergebühr',min:'Mindestbestellwert',total:'Gesamt inkl. Lieferung',short:'Es fehlen noch',ok:'Mindestbestellwert erreicht',out:'Außerhalb des Liefergebiets',bad:'PLZ ungültig (5 Ziffern)',nocfg:'Zone nicht eingerichtet',err:'Gebühren nicht abrufbar (Server)',hint:'PLZ eingeben, dann erscheint die Liefergebühr.'},
    ar:{fee:'رسم التوصيل',min:'الحد الأدنى للطلب',total:'الإجمالي مع التوصيل',short:'ناقص',ok:'الحد الأدنى مكتمل',out:'خارج منطقة التوصيل',bad:'الرمز البريدي غير صالح (5 أرقام)',nocfg:'المنطقة غير مضبوطة',err:'تعذّر جلب الرسوم (السيرفر)',hint:'اكتب الرمز البريدي ليظهر رسم التوصيل.'},
    en:{fee:'Delivery fee',min:'Minimum order',total:'Total incl. delivery',short:'Still missing',ok:'Minimum order reached',out:'Outside delivery area',bad:'Invalid postcode (5 digits)',nocfg:'Zone not configured',err:'Fees unavailable (server)',hint:'Enter the postcode to see the delivery fee.'}};
  const lang=()=>{try{return localStorage.getItem('nara-kasse-language')||document.documentElement.lang||'de'}catch(e){return 'de'}};
  const tr=k=>(T[lang()]||T.de)[k]||T.de[k];
  const eur=c=>(c/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const cents=txt=>{const m=String(txt||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');return Math.round((parseFloat(m)||0)*100)};
  const card=$('.delivery-card'),total=$('#total');
  if(!card||!total)return;
  const box=document.createElement('div');box.id='nara-quote';box.className='nara-quote';card.appendChild(box);
  const line=document.createElement('div');line.id='nara-quote-total';line.className='cart-total nara-quote-total';line.hidden=true;
  total.closest('.cart-total').after(line);
  let seq=0;
  function isDelivery(){return !card.hidden}
  async function refresh(){
    if(!isDelivery()){line.hidden=true;return}
    const plz=($('#postal-code')||{}).value||'',sub=cents(total.textContent),mine=++seq;
    if(!plz.trim()){box.dataset.state='hint';box.textContent=tr('hint');line.hidden=true;return}
    let q;try{const r=await fetch('/api/delivery/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postalCode:plz,subtotalCents:sub,type:'delivery'})});q=await r.json()}catch(e){q=null}
    if(mine!==seq)return;
    if(!q){box.dataset.state='bad';box.textContent=tr('err');line.hidden=true;return}
    if(q.reason==='POSTAL_CODE_INVALID'||q.reason==='OUT_OF_AREA'||q.reason==='ZONE_NOT_CONFIGURED'){
      box.dataset.state='bad';box.textContent=tr(q.reason==='POSTAL_CODE_INVALID'?'bad':q.reason==='OUT_OF_AREA'?'out':'nocfg');line.hidden=true;return}
    const okMin=q.ok;
    box.dataset.state=okMin?'ok':'warn';
    box.innerHTML=`<div><span>${tr('fee')}</span><strong>${eur(q.customerFeeCents)}</strong></div><div><span>${tr('min')}</span><strong>${eur(q.minOrderCents)}</strong></div><div class="nq-status">${okMin?'✓ '+tr('ok'):'⚠ '+tr('short')+' '+eur(q.shortfallCents)}</div>`;
    line.hidden=false;line.innerHTML=`<span>${tr('total')}</span><strong>${eur(q.totalCents)}</strong>`;
  }
  const again=()=>setTimeout(refresh,0);
  ($('#postal-code')||card).addEventListener('input',refresh);
  document.querySelectorAll('[data-order-type]').forEach(b=>b.addEventListener('click',again));
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',again));
  new MutationObserver(refresh).observe(total,{childList:true,characterData:true,subtree:true});
  new MutationObserver(refresh).observe(card,{attributes:true,attributeFilter:['hidden']});
  refresh();
})();
