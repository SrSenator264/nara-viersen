// kasse-receipt.js — فاتورة موحّدة للكاشير: نفس قالب nara-receipt-core (شكل ورقة Lieferando) لكل المصادر.
// بيحوّل طلب الكاشير للشكل الموحّد ثم بيبني HTML للطباعة 80mm. تذكرة المطبخ بنفس الشكل بدون أي مبلغ (kitchenHtml).
(function(){
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const FEE='DELIVERY_FEE';
  const api={ready:false,core:null};
  function lang(){try{const l=window.NARA_LANG?window.NARA_LANG.get():(localStorage.getItem('nara-kasse-language'));return l==='en'?'en':'de'}catch(e){return 'de'}} // الفاتورة للزبون: ألماني (أو إنجليزي)، مو عربي

  // طلب الكاشير -> الشكل الموحّد
  function toReceiptOrder(o,kind){
    const d=o.delivery||{},cart=o.cart||[];
    const items=cart.filter(i=>i.kind!==FEE);
    const feeCents=cart.filter(i=>i.kind===FEE).reduce((s,i)=>s+(Number(i.unitCents)||0)*(Number(i.quantity)||0),0);
    const gross=cart.reduce((s,i)=>s+(Number(i.unitCents)||0)*(Number(i.quantity)||0),0);
    // الخصم: من الكاشير (discount / billDiscount) أو من المنصة (عرض خاص، كوبون، ستامبات)
    const discount=(Number((o.billDiscount||o.discount||{}).amountCents)||0)
      +(Number(o.discountsCents)||0)+(Number(o.discountCents)||0)+(Number(o.stampCents)||0);
    // طلب منصة: المجموع الرسمي من المنصة نفسها (إذا موجود) أدق من حسابنا
    const official=Number(o.externalTotalCents)||(/LIEFERANDO|UBER|WOLT|LANCH|SIDES/i.test(String(o.platform||o.source||''))?Number(o.totalCents)||0:0);
    const total=official||Math.max(0,gross-discount);
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
      cart:items.map(i=>({quantity:Number(i.quantity)||1,name:i.name,totalCents:(Number(i.unitCents)||0)*(Number(i.quantity)||0),discountCents:Number(i.discountCents)||0,
        options:(i.options||[]).map(x=>({name:String(x.name||'').split(' / ')[0].trim(),quantity:x.quantity||1,totalCents:0})).filter(x=>x.name&&!/^einzel$/i.test(x.name)),notes:i.note||'',category:''})),
      fees:{delivery:feeCents},discountsCents:discount,totalCents:total,cashDueCents:Number(o.cashDueCents)||total,
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
    // خصم على الأصناف (عرض المنصة): السعر الأصلي مشطوب + السعر الجديد؛ والباقي من الخصم بسطر "Rabatt"
    const itemDisc=r.cart.reduce((s,i)=>s+(i.discountCents||0),0);
    const subtotal=r.cart.reduce((s,i)=>s+i.totalCents-(i.discountCents||0),0);
    const restDisc=Math.max(0,(r.discountsCents||0)-itemDisc);
    const type=r.orderType==='PICKUP'?t.pickup:r.orderType==='DINE_IN'?(t.dine+(r.table?' · '+t.table+' '+esc(r.table):'')):t.delivery;
    const rows=[];
    // الترويسة
    rows.push('<div class="rc-brand">IU GENE</div><div class="rc-small rc-c">Gereonstraße 1 · 41747 Viersen</div><div class="rc-small rc-c">'+t.tel+' 02162 5013538</div>');
    // رقم الطلب + المنصة + الوقت
    const pb=platBox(r.platform);if(pb)rows.push(pb);
    rows.push('<div class="rc-code">'+esc(r.displayCode)+'</div>');
    rows.push('<div class="rc-small rc-c">'+esc(stamp(r.placedAt))+'</div>');
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
      let h='<div class="rc-item"><span class="rc-qty">'+esc(i.quantity)+'×</span><span class="rc-iname">'+esc(i.name)+'</span><span class="rc-price">'+(i.discountCents?'<s class="rc-old">'+eur(i.totalCents)+'</s> '+eur(i.totalCents-i.discountCents):eur(i.totalCents))+'</span></div>';
      (i.options||[]).forEach(op=>{h+='<div class="rc-opt">+ '+(op.quantity>1?esc(op.quantity)+'× ':'')+esc(op.name)+'</div>'});
      if(i.notes)h+='<div class="rc-inote">! '+esc(i.notes)+'</div>';
      return h});
    rows.push('<div class="rc-items">'+items.join('')+'</div>');
    // المجاميع
    let tot='<div class="rc-line2"><span>'+t.sub+'</span><span>'+eur(subtotal)+'</span></div>';
    if(r.fees&&r.fees.delivery)tot+='<div class="rc-line2"><span>'+t.deliv+'</span><span>'+eur(r.fees.delivery)+'</span></div>';
    if(restDisc)tot+='<div class="rc-line2"><span>'+t.disc+'</span><span>−'+eur(restDisc)+'</span></div>';
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
  // اسم المنصة كبير وواضح بإطار (للفاتورة وورقة المطبخ)
  function platBox(src){
    const P={LIEFERANDO:'LIEFERANDO','UBER EATS':'UBER EATS',UBER_EATS:'UBER EATS',WOLT:'WOLT',LANCH:'LANCH'};
    const n=P[String(src||'').toUpperCase()];
    return n?'<div class="rc-plat">'+esc(n)+'</div>':'';
  }
  function kitchenHtml(o){
    const k=toKitchen(o),t=KT[lang()]||KT.de;
    const type=k.type==='pickup'?t.pickup:k.type==='local'?(t.dine+(k.table?' · '+t.table+' '+esc(k.table):'')):t.delivery;
    const rows=['<div class="rc-brand">'+t.kitchen+'</div>'];
    const pb=platBox(k.source);if(pb)rows.push(pb);
    rows.push('<div class="rc-code">'+esc(k.displayCode)+'</div>');
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
  // ───────── ورقة العرض (تحت الفاتورة، بعد قصّة نصّية): QR بقلب → تحميل تطبيقنا + خصم أول طلب ─────────
  // الإعدادات: window.NARA_PROMO = {url, percent, days}  (الرابط لازم يتظبط لما ينشر التطبيق)
  const PROMO_TX={
    de:{hi:'Hat’s geschmeckt?',off:'RABATT',first:'auf deine erste Bestellung direkt bei uns',scan:'Scannen · App laden · sparen',same:'Gleiches Essen. Besserer Preis.',direct:'Direkt von uns – ohne Umweg.',code:'Dein Code',valid:'Gültig {d} Tage · nur für die erste Bestellung in der App'},
    en:{hi:'Enjoyed it?',off:'OFF',first:'your first order directly with us',scan:'Scan · get the app · save',same:'Same food. Better price.',direct:'Straight from us.',code:'Your code',valid:'Valid {d} days · first app order only'}};
  // كود قصير لكل طلب (منعرف منين إجا الزبون: المنصة + رقم الطلب)
  function promoCode(o){
    const src=String(o.platform||o.source||'').toUpperCase(),p=/UBER/.test(src)?'U':/LIEFERANDO/.test(src)?'L':/WOLT/.test(src)?'W':'N';
    let h=0;const k=String(o.externalOrderCode||o.displayCode||o.id||'');for(let i=0;i<k.length;i++)h=(h*31+k.charCodeAt(i))>>>0;
    return 'HERZ'+p+h.toString(36).toUpperCase().slice(-4).padStart(4,'0');
  }
  const HEART='M50 92C22 72 2 55 2 30 2 14 14 2 29 2c10 0 17 5 21 13C54 7 61 2 71 2c15 0 27 12 27 28 0 25-20 42-48 62z';
  // QR بإطار قلب: المربع نفسو بيضل QR عادي (تصحيح أخطاء H) كي يقراه أي موبايل، وبالنص قلب زغير
  function heartQr(url){
    const m=window.NARA_QR.make(url,'H'),n=m.size,q=2,S=n+2*q;
    let d='';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(m.isDark(r,c))d+='M'+(c+q)+' '+(r+q)+'h1v1h-1z';
    // قلب زغير بالنص (≈ 6% من المساحة)
    const hw=Math.max(5,Math.round(n*0.2)),hx=(S-hw)/2,hy=(S-hw)/2,sc=hw/100;
    const mid='<rect x="'+(hx-0.6)+'" y="'+(hy-0.6)+'" width="'+(hw+1.2)+'" height="'+(hw+1.2)+'" fill="#fff"/><path transform="translate('+hx+' '+(hy+hw*0.04)+') scale('+sc+')" d="'+HEART+'" fill="#000"/>';
    const qr='<svg x="23.5" y="13" width="53" height="53" viewBox="0 0 '+S+' '+S+'" shape-rendering="crispEdges"><rect width="'+S+'" height="'+S+'" fill="#fff"/><path d="'+d+'" fill="#000"/>'+mid+'</svg>';
    return '<svg class="rc-heart" xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 104 98"><path d="'+HEART+'" fill="#fff" stroke="#000" stroke-width="4.5" stroke-linejoin="round"/>'+qr+'</svg>';
  }
  function promoHtml(o,cfg){
    const c=Object.assign({url:'https://nara-viersen.de/a',percent:20,days:30},window.NARA_PROMO||{},cfg||{});
    const t=PROMO_TX[lang()]||PROMO_TX.de,code=promoCode(o);
    const url=c.url+(c.url.includes('?')?'&':'?')+'c='+encodeURIComponent(code); // كود قصير = QR أوضح (المنصة مخبّاية بالحرف الخامس: U/L/W)
    let qr='';try{qr=heartQr(url)}catch(e){console.warn('[NARA][PROMO_QR_FAILED]',e.message)}
    return '<div class="nara-rc nara-promo">'
      +'<div class="pr-hi">'+esc(t.hi)+'</div>'
      +'<div class="pr-big">'+esc(c.percent)+' %</div><div class="pr-off">'+esc(t.off)+'</div>'
      +'<div class="pr-first">'+esc(t.first)+'</div>'
      +qr
      +'<div class="pr-scan">'+esc(t.scan)+'</div>'
      +'<div class="pr-code">'+esc(t.code)+': <b>'+esc(code)+'</b></div>'
      +'<div class="pr-same"><b>'+esc(t.same)+'</b><br>'+esc(t.direct)+'</div>'
      +'<div class="rc-small rc-c">'+esc(t.valid.replace('{d}',c.days))+'</div>'
      +'<div class="rc-brand pr-brand">IU GENE ♥ Viersen</div></div>';
  }
  api.promoHtml=promoHtml;api.promoCode=promoCode;
  // الطباعة: السيرفر بيقرر أي طابعة (حسب إعدادات 🖨️). إذا الطابعة على "نافذة المتصفح" بنطبع هون.
  // o: طلب (أو {id}) · kind: customer | kitchen | driver
  api.print=async function(o,kind){
    kind=kind||'customer';
    let r=null;
    try{
      const body=o&&o.id&&!o.cart?{orderId:o.id,kind}:{orderId:o&&o.id,order:o,kind};
      const res=await fetch('/api/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      r=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(r.error||('HTTP '+res.status));
    }catch(e){
      // السيرفر ما قدر يطبع (طابعة مطفية…): منطبع من المتصفح كي ما يضيع الطلب
      console.warn('[NARA][PRINT]',e.message);r={mode:'browser',error:e.message,promo:false};
    }
    if(r.mode==='browser'){
      let sheet=document.getElementById('nara-print-sheet');
      if(!sheet){sheet=document.createElement('section');sheet.id='nara-print-sheet';document.body.appendChild(sheet)}
      sheet.innerHTML=kind==='kitchen'?kitchenHtml(o):(html(o,kind==='driver'?'driver':'customer')+(r.promo?'<div style="break-before:page;page-break-before:always"></div>'+promoHtml(o):''));
      window.print();setTimeout(()=>{if(sheet.parentNode)sheet.innerHTML=''},500);
    }
    return r;
  };
  // إعدادات ورقة العرض من السيرفر (النسبة، الرابط، الأيام)
  try{fetch('/api/printing/config',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(j&&j.config)window.NARA_PROMO={url:j.config.promo.url,percent:j.config.promo.percent,days:j.config.promo.days}}).catch(()=>{})}catch(e){}
  api.toKitchen=toKitchen;api.kitchenHtml=kitchenHtml;
  api.toReceiptOrder=toReceiptOrder;api.html=html;
  window.NARA_RECEIPT=api;
  import('/nara-receipt-core.mjs').then(m=>{api.core=m;api.ready=true}).catch(e=>console.warn('[NARA][RECEIPT_CORE_LOAD_FAILED]',e.message));
})();
