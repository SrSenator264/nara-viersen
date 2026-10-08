// kasse-receipt.js — فاتورة موحّدة للكاشير: نفس قالب nara-receipt-core (شكل ورقة Lieferando) لكل المصادر.
// بيحوّل طلب الكاشير للشكل الموحّد ثم بيبني HTML للطباعة 80mm. تذكرة المطبخ بنفس الشكل بدون أي مبلغ (kitchenHtml).
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
      deliveryQrUrl:o.deliveryQrUrl||'',displayCode:code,externalOrderCode:code,placedAt:o.createdAt||o.placedAt||new Date().toISOString(),platform:plat,
      orderType:type,table:o.table||'',customerName:d.name||'',customerPhone:d.phone||'',
      delivery:{address:[d.street,d.house].filter(Boolean).join(' '),floor:d.floor||'',postalCode:d.postal||'',city:d.city||'',notes:noteParts.join(' · ')},
      cart:items.map(i=>({quantity:Number(i.quantity)||1,name:i.name,totalCents:(Number(i.unitCents)||0)*(Number(i.quantity)||0),
        options:(i.options||[]).map(x=>({name:String(x.name||'').split(' / ')[0].trim(),quantity:x.quantity||1,totalCents:0})).filter(x=>x.name&&!/^einzel$/i.test(x.name)),notes:i.note||'',category:''})),
      fees:{delivery:feeCents},discountsCents:discount,totalCents:gross-discount,cashDueCents:gross-discount,
      payment:{method},assignment:o.assignment||null,remarks:''
    };
  }

  // ───────── الفاتورة المطبوعة (HTML لورق 80mm): مرتّبة وواضحة، أسود/أبيض فقط (طابعة حرارية) ─────────
  const TX={
    de:{delivery:'LIEFERUNG',pickup:'ABHOLUNG',dine:'VOR ORT',table:'TISCH',asap:'So bald wie möglich',tel:'Tel.',floor:'Etage',note:'Hinweis',
      sub:'Zwischensumme',deliv:'Lieferkosten',disc:'Rabatt',total:'GESAMT',cash:'BARZAHLUNG',collect:'Beim Kunden kassieren',open:'ZAHLUNG OFFEN',
      paidCard:'BEZAHLT · KARTE',paidCash:'BEZAHLT · BAR',paidOnline:'BEZAHLT · ONLINE',driver:'Fahrer',round:'Tour',eta:'Ankunft',notBill:'Das ist keine Rechnung',scan:'QR-Code scannen, um die Bestellung zu öffnen',scanDeliver:'Zum Liefern scannen',thanks:'Guten Appetit!'},
    en:{delivery:'DELIVERY',pickup:'PICKUP',dine:'DINE-IN',table:'TABLE',asap:'As soon as possible',tel:'Tel.',floor:'Floor',note:'Note',
      sub:'Subtotal',deliv:'Delivery',disc:'Discount',total:'TOTAL',cash:'CASH',collect:'Collect from customer',open:'PAYMENT OPEN',
      paidCard:'PAID · CARD',paidCash:'PAID · CASH',paidOnline:'PAID · ONLINE',driver:'Driver',round:'Round',eta:'ETA',notBill:'This is not a bill',scan:'Scan the QR code to open the order',scanDeliver:'Scan to deliver',thanks:'Enjoy your meal!'}
  };
  const eur=c=>(Math.round(Number(c)||0)/100).toFixed(2).replace('.',',')+' €';
  const pad=n=>String(n).padStart(2,'0');
  function stamp(v){const d=new Date(v);if(isNaN(d))return '';return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear()+' · '+pad(d.getHours())+':'+pad(d.getMinutes())}
  function hhmm(v){const d=new Date(v);return isNaN(d)?'':pad(d.getHours())+':'+pad(d.getMinutes())}

  function html(o,kind){
    const r=toReceiptOrder(o,kind),t=TX[lang()]||TX.de,d=r.delivery||{},isDel=r.orderType==='DELIVERY',pm=r.payment.method;
    const subtotal=r.cart.reduce((s,i)=>s+i.totalCents,0);
    const type=r.orderType==='PICKUP'?t.pickup:r.orderType==='DINE_IN'?(t.dine+(r.table?' · '+t.table+' '+esc(r.table):'')):t.delivery;
    const rows=[];
    // الترويسة
    rows.push('<div class="rc-brand">IU GENE</div><div class="rc-small rc-c">Gereonstraße 1 · 41747 Viersen</div><div class="rc-small rc-c">'+t.tel+' 02162 5013538</div>');
    // رقم الطلب + المنصة + الوقت
    rows.push('<div class="rc-code">'+esc(r.displayCode)+'</div>');
    rows.push('<div class="rc-small rc-c">'+esc(stamp(r.placedAt))+(r.platform&&r.platform!=='NARA'?' · <b>'+esc(r.platform)+'</b>':'')+'</div>');
    // نوع الطلب (شريط معكوس)
    rows.push('<div class="rc-type">'+esc(type)+'</div>');
    const due=r.requestedAt||r.dueAt||r.etaAt;
    rows.push('<div class="rc-c rc-when">'+(hhmm(due)?esc(hhmm(due)):esc(t.asap))+'</div>');
    // الزبون
    const cust=[];
    if(r.customerName)cust.push('<div class="rc-name">'+esc(r.customerName)+'</div>');
    if(isDel){
      if(d.address)cust.push('<div class="rc-addr">'+esc(d.address)+'</div>');
      const city=[d.postalCode,d.city].filter(Boolean).join(' ');if(city)cust.push('<div class="rc-addr">'+esc(city)+'</div>');
      if(d.floor)cust.push('<div class="rc-addr">'+esc(t.floor)+': '+esc(d.floor)+'</div>');
    }
    if(r.customerPhone)cust.push('<div class="rc-phone">'+esc(t.tel)+' '+esc(r.customerPhone)+'</div>');
    if(cust.length)rows.push('<div class="rc-box">'+cust.join('')+'</div>');
    if(isDel&&d.notes)rows.push('<div class="rc-note"><b>'+esc(t.note)+':</b> '+esc(d.notes)+'</div>');
    // الأصناف
    const items=r.cart.map(i=>{
      let h='<div class="rc-item"><span class="rc-qty">'+esc(i.quantity)+'×</span><span class="rc-iname">'+esc(i.name)+'</span><span class="rc-price">'+eur(i.totalCents)+'</span></div>';
      (i.options||[]).forEach(op=>{h+='<div class="rc-opt">+ '+(op.quantity>1?esc(op.quantity)+'× ':'')+esc(op.name)+'</div>'});
      if(i.notes)h+='<div class="rc-inote">! '+esc(i.notes)+'</div>';
      return h});
    rows.push('<div class="rc-items">'+items.join('')+'</div>');
    // المجاميع
    let tot='<div class="rc-line2"><span>'+t.sub+'</span><span>'+eur(subtotal)+'</span></div>';
    if(r.fees&&r.fees.delivery)tot+='<div class="rc-line2"><span>'+t.deliv+'</span><span>'+eur(r.fees.delivery)+'</span></div>';
    if(r.discountsCents)tot+='<div class="rc-line2"><span>'+t.disc+'</span><span>−'+eur(r.discountsCents)+'</span></div>';
    tot+='<div class="rc-total"><span>'+t.total+'</span><span>'+eur(r.totalCents)+'</span></div>';
    rows.push('<div class="rc-totals">'+tot+'</div>');
    // الدفع
    let pay;
    if(pm==='CASH')pay='<div class="rc-pay"><div class="rc-pay-l">'+t.cash+'</div><div class="rc-pay-amt">'+eur(r.cashDueCents||r.totalCents)+'</div><div class="rc-small rc-c">'+t.collect+'</div></div>';
    else if(pm==='PAID_CARD')pay='<div class="rc-pay rc-paid"><div class="rc-pay-l">✓ '+t.paidCard+'</div></div>';
    else if(pm==='PAID_CASH')pay='<div class="rc-pay rc-paid"><div class="rc-pay-l">✓ '+t.paidCash+'</div></div>';
    else if(pm==='ONLINE')pay='<div class="rc-pay rc-paid"><div class="rc-pay-l">✓ '+t.paidOnline+'</div></div>';
    else pay='<div class="rc-pay"><div class="rc-pay-l">'+t.open+'</div><div class="rc-pay-amt">'+eur(r.totalCents)+'</div></div>';
    rows.push(pay);
    // السائق
    const a=r.assignment;
    if(a&&(a.driverName||a.roundId))rows.push('<div class="rc-driver">'+(a.driverName?'<div><b>'+esc(t.driver)+':</b> '+esc(a.driverName)+'</div>':'')+(a.roundId?'<div><b>'+esc(t.round)+':</b> '+esc(a.roundId)+'</div>':'')+(a.etaAt?'<div><b>'+esc(t.eta)+':</b> '+esc(hhmm(a.etaAt))+'</div>':'')+'</div>');
    // QR محلي (بدون إنترنت)
    // Lieferando: نفس QR تبعهم ("Zum Liefern scannen")؛ غير هيك QR داخلي
    const payload=r.deliveryQrUrl||('NARA|'+(r.platform||'')+'|'+r.displayCode);
    let qr='';try{if(window.NARA_QR)qr='<div class="rc-qr">'+window.NARA_QR.svg(payload,{level:'M',quiet:1})+'</div>'}catch(e){console.warn('[NARA][RECEIPT_QR_FAILED]',e.message)}
    rows.push(qr+'<div class="rc-small rc-c">'+esc(r.deliveryQrUrl?t.scanDeliver:t.scan)+'</div><div class="rc-small rc-c rc-nb">'+esc(t.notBill)+'</div><div class="rc-thanks">'+esc(t.thanks)+'</div>');
    return '<div class="nara-rc">'+rows.join('')+'</div>';
  }

  // ───────── تذكرة المطبخ: نفس الشكل، بدون أسعار ولا دفع ولا عنوان ─────────
  const KT={de:{kitchen:'KÜCHE',delivery:'LIEFERUNG',pickup:'ABHOLUNG',dine:'VOR ORT',table:'TISCH',since:'Bestellt',ready:'Fertig bis',note:'Hinweis'},
    en:{kitchen:'KITCHEN',delivery:'DELIVERY',pickup:'PICKUP',dine:'DINE-IN',table:'TABLE',since:'Ordered',ready:'Ready by',note:'Note'}};
  // يقبل طلب كاشير/منصة أو شكل شاشة المطبخ ({items,...}) ويرجّع شكل المطبخ
  function toKitchen(o){
    if(Array.isArray(o.items))return o;
    const d=o.delivery||{},r=toReceiptOrder(o,'kitchen'),created=o.acceptedAt||o.createdAt||o.placedAt||new Date().toISOString();
    const prep=Number(o.preparationMinutes||d.preparationMinutes||o.prepMinutes)||20,start=Date.parse(o.kitchenStartAt||created);
    return {displayCode:r.displayCode,source:r.platform,type:o.type==='pickup'?'pickup':o.type==='local'?'local':'delivery',table:o.table||'',customerName:d.name||o.customerName||'',
      notes:[d.notes,d.extra,o.remarks].filter(Boolean).join(' · '),createdAt:created,readyBy:isNaN(start)?'':new Date(start+prep*60000).toISOString(),
      items:r.cart.map(i=>({name:i.name,quantity:i.quantity,options:i.options,note:i.notes}))};
  }
  function kitchenHtml(o){
    const k=toKitchen(o),t=KT[lang()]||KT.de;
    const type=k.type==='pickup'?t.pickup:k.type==='local'?(t.dine+(k.table?' · '+t.table+' '+esc(k.table):'')):t.delivery;
    const rows=['<div class="rc-brand">'+t.kitchen+'</div>','<div class="rc-code">'+esc(k.displayCode)+'</div>'];
    if(k.source&&k.source!=='NARA')rows.push('<div class="rc-small rc-c"><b>'+esc(String(k.source).replace('_',' '))+'</b></div>');
    rows.push('<div class="rc-type">'+esc(type)+'</div>');
    rows.push('<div class="rc-c rc-small">'+esc(t.since)+' '+esc(hhmm(k.createdAt))+'</div>');
    if(hhmm(k.readyBy))rows.push('<div class="rc-c rc-when">'+esc(t.ready)+' '+esc(hhmm(k.readyBy))+'</div>');
    if(k.customerName)rows.push('<div class="rc-c rc-name">'+esc(k.customerName)+'</div>');
    if(k.notes)rows.push('<div class="rc-note"><b>'+esc(t.note)+':</b> '+esc(k.notes)+'</div>');
    rows.push('<div class="rc-items">'+k.items.map(i=>{
      let h='<div class="rc-item rc-kitem"><span class="rc-qty">'+esc(i.quantity)+'×</span><span class="rc-iname">'+esc(i.name)+'</span></div>';
      (i.options||[]).forEach(op=>{h+='<div class="rc-opt rc-kopt">+ '+(op.quantity>1?esc(op.quantity)+'× ':'')+esc(op.name)+'</div>'});
      if(i.note)h+='<div class="rc-inote">! '+esc(i.note)+'</div>';
      return h}).join('')+'</div>');
    return '<div class="nara-rc nara-rc-kitchen">'+rows.join('')+'</div>';
  }
  api.toKitchen=toKitchen;api.kitchenHtml=kitchenHtml;
  api.toReceiptOrder=toReceiptOrder;api.html=html;
  window.NARA_RECEIPT=api;
  import('/nara-receipt-core.mjs').then(m=>{api.core=m;api.ready=true}).catch(e=>console.warn('[NARA][RECEIPT_CORE_LOAD_FAILED]',e.message));
})();
