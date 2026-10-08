// kasse-receipt.js — فاتورة موحّدة للكاشير: نفس قالب nara-receipt-core (شكل ورقة Lieferando) لكل المصادر.
// بيحوّل طلب الكاشير للشكل الموحّد ثم بيبني HTML للطباعة 80mm. المطبخ لسا بقالبه القديم.
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const FEE='DELIVERY_FEE';
  const api={ready:false,core:null};
  function lang(){try{const l=localStorage.getItem('nara-kasse-language');return l==='en'?'en':'de'}catch(e){return 'de'}} // الفاتورة للزبون: ألماني (أو إنجليزي)، مو عربي

  // طلب الكاشير -> الشكل الموحّد
  function toReceiptOrder(o,kind){
    const d=o.delivery||{},cart=o.cart||[];
    const items=cart.filter(i=>i.kind!==FEE);
    const feeCents=cart.filter(i=>i.kind===FEE).reduce((s,i)=>s+(Number(i.unitCents)||0)*(Number(i.quantity)||0),0);
    const gross=cart.reduce((s,i)=>s+(Number(i.unitCents)||0)*(Number(i.quantity)||0),0);
    const discount=Number(o.discount&&o.discount.amountCents)||0;
    const type=o.type==='delivery'?'DELIVERY':o.type==='pickup'?'PICKUP':'DINE_IN';
    const code=o.displayCode||o.externalOrderCode||('NARA-'+String(o.id||'').replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase());
    const platform=String(o.platform||o.source||'').toUpperCase();
    const plat=/LIEFERANDO|UBER|WOLT|LANCH/.test(platform)?platform.replace('_',' '):'NARA';
    let method='OPEN';
    if(o.payment&&o.payment.method)method=o.payment.method;            // لو الطلب جاي ومعه طريقة دفع جاهزة (منصة)
    else if(o.status==='COMPLETED')method='PAID_CASH';
    else if(type==='DELIVERY')method='CASH';                              // طلب توصيل مباشر: بيتحصّل عند الزبون
    const noteParts=[d.bell&&('Klingel: '+d.bell),d.extra,d.notes].filter(Boolean);
    return {
      displayCode:code,externalOrderCode:code,placedAt:o.createdAt||o.placedAt||new Date().toISOString(),platform:plat,
      orderType:type,table:o.table||'',customerName:d.name||'',customerPhone:d.phone||'',
      delivery:{address:[d.street,d.house].filter(Boolean).join(' '),floor:d.floor||'',postalCode:d.postal||'',city:d.city||'',notes:noteParts.join(' · ')},
      cart:items.map(i=>({quantity:Number(i.quantity)||1,name:i.name,totalCents:(Number(i.unitCents)||0)*(Number(i.quantity)||0),
        options:(i.options||[]).map(x=>({name:String(x.name||'').split(' / ')[0].trim(),quantity:x.quantity||1,totalCents:0})).filter(x=>x.name&&!/^einzel$/i.test(x.name)),notes:i.note||'',category:''})),
      fees:{delivery:feeCents},discountsCents:discount,totalCents:gross-discount,cashDueCents:gross-discount,
      payment:{method},assignment:o.assignment||null,remarks:''
    };
  }

  function html(o,kind){
    const L=api.core.renderLines(toReceiptOrder(o,kind),{width:42,lang:lang(),header:'IU GENE, Gereonstraße 1, 41747 Viersen, Tel.: 02162 5013538'});
    const W=42,rows=L.map(l=>{
      if(l.qr){const src='https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data='+encodeURIComponent(l.qr);return '<div class="rc-qr"><img src="'+src+'" alt="" onerror="this.style.display=\'none\'"></div>'}
      const cls=['rc-line',l.align==='center'?'rc-c':l.align==='right'?'rc-r':'',l.bold?'rc-b':'',l.size===2?'rc-big':''].filter(Boolean).join(' ');
      return '<div class="'+cls+'">'+(esc(l.text)||'&nbsp;')+'</div>';
    });
    return '<div class="nara-rc">'+rows.join('')+'</div>';
  }
  api.toReceiptOrder=toReceiptOrder;api.html=html;
  window.NARA_RECEIPT=api;
  import('/nara-receipt-core.mjs').then(m=>{api.core=m;api.ready=true}).catch(e=>console.warn('[NARA][RECEIPT_CORE_LOAD_FAILED]',e.message));
})();
