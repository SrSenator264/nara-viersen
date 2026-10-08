(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const state=()=>window.NARA_LEGACY_KASSE_STATE;
  const current=()=>state()?.getCurrent?.();
  const text={ar:{print:'طباعة',kitchen:'تذكرة المطبخ',customer:'نسخة العميل',driver:'نسخة التوصيل',reprint:'إعادة طباعة',code:'كود الطلب',empty:'أضف صنفاً قبل الطباعة',sent:'تم تسجيل الطباعة بدون إغلاق الطلب ✅'},de:{print:'Drucken',kitchen:'Küche',customer:'Kunde',driver:'Lieferung',reprint:'Erneut drucken',code:'Bestellcode',empty:'Bitte zuerst Artikel hinzufügen',sent:'Druck protokolliert, Auftrag bleibt offen ✅'},en:{print:'Print',kitchen:'Kitchen ticket',customer:'Customer copy',driver:'Driver copy',reprint:'Reprint',code:'Order code',empty:'Add an item before printing',sent:'Print logged; order remains open ✅'}};
  function lang(){return localStorage.getItem('nara-kasse-language')||'de'}
  function t(k){return (text[lang()]||text.de)[k]}
  function code(o){if(!o)return '';if(o.displayCode)return o.displayCode;return 'NARA-'+String(o.id||'').replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase()}
  function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
  function total(o){return (o.cart||[]).reduce((s,x)=>s+(Number(x.unitCents)||0)*(Number(x.quantity)||0),0)}
  function platformBrand(o){const p=String(o?.platform||o?.source||'NARA').toUpperCase();if(p.includes('LIEFERANDO'))return {name:'LIEFERANDO',mark:'🟠'};if(p.includes('UBER'))return {name:'UBER EATS',mark:'🟩'};if(p.includes('WOLT'))return {name:'WOLT',mark:'🔵'};if(p.includes('LANCH'))return {name:'LANCH',mark:'🟣'};return {name:'NARA',mark:'🤖'}}

  function deliveryBlock(o,kind){const d=o.delivery||{};if(kind==='customer'&&o.type==='local')return '<div class="print-contact"><strong>TISCH</strong><br><b>Tisch '+esc(o.table||'1')+'</b></div>';if(kind==='customer'&&o.type==='pickup')return '<div class="print-contact"><strong>KUNDE / ABHOLUNG</strong><br><b>'+esc(d.name||'Kunde')+'</b></div>';if(kind!=='kitchen'&&kind!=='driver'&&!(kind==='customer'&&o.type==='delivery'))return '';const values=Object.values(d).filter(Boolean);if(!values.length)return '';return '<div class="print-contact"><strong>'+esc(kind==='kitchen'?'KUNDENKONTAKT / LIEFERUNG':'LIEFERADRESSE')+'</strong><br>'+esc(values.join(' · '))+'</div>'}
  function showSheet(o,kind){
    const title=kind==='kitchen'?t('kitchen'):kind==='driver'?t('driver'):t('customer');const brand=platformBrand(o);const german=kind==='customer'||kind==='driver';const qrPayload=JSON.stringify({orderId:o.id||null,orderCode:code(o),source:o.platform||o.source||'NARA',delivery:o.delivery||{}});const qr=kind==='driver'?'\<div class=\"print-qr\"><img src=\"https://api.qrserver.com/v1/create-qr-code/?size=240x240&data='+encodeURIComponent(qrPayload)+'\" alt=\"Zum Liefern scannen\"><div>Zum Liefern scannen</div></div>':'';
    let sheet=document.getElementById('nara-print-sheet');if(!sheet){sheet=document.createElement('section');sheet.id='nara-print-sheet';document.body.appendChild(sheet)}
    sheet.innerHTML='<div class="print-platform-logo">'+esc(brand.mark)+' <strong>'+esc(brand.name)+'</strong></div><div class="print-brand">NARA · '+esc(title)+'</div>'+(german?'<div class="print-platform-status">PLATTFORMBESTELLUNG · ONLINE BEZAHLT</div>':'')+'<div class="print-code">'+esc(german?'Bestellcode':t('code'))+': <strong>'+esc(code(o))+'</strong></div><div class="print-meta">'+esc(german?(o.type==='delivery'?'Lieferung':'Abholung'):(o.type||''))+' · '+new Date().toLocaleString('de-DE')+'</div>'+deliveryBlock(o,kind)+'<hr>'+(o.cart||[]).map(x=>'<div class="print-line"><span>'+esc(x.name)+' × '+Number(x.quantity||0)+'</span><b>'+((Number(x.unitCents)||0)*(Number(x.quantity)||0)/100).toFixed(2)+' €</b></div>').join('')+'<hr><div class="print-total">'+(german?'Gesamtsumme: ':'')+((total(o))/100).toFixed(2)+' €</div>'+(german?'<div class="print-footnote">Online bezahlt · Keine Barzahlung an NARA</div>':'')+qr;
    const tax={food:0,drink:0};(o.cart||[]).forEach(x=>{const n=String(x.name||'').toLowerCase(),gross=(Number(x.unitCents)||0)*(Number(x.quantity)||0);if(/cola|coke|pepsi|fanta|sprite|wasser|water|drink|getränk|saft|juice|limo/i.test(n))tax.drink+=gross;else tax.food+=gross});const foodRate=Number(localStorage.getItem('nara-vat-food')||7),drinkRate=Number(localStorage.getItem('nara-vat-drinks')||19),taxFood=Math.round(tax.food*foodRate/(100+foodRate)),taxDrink=Math.round(tax.drink*drinkRate/(100+drinkRate)),discount=Number(o.discount?.amountCents)||0,gross=total(o),net=gross-discount;sheet.innerHTML+='<div class="print-details"><div>Rechnungsnummer: '+esc('DEV-'+String(o.id||Date.now()).slice(-8))+'</div>'+(o.type==='delivery'?'<div>Kundenangaben: '+esc(Object.values(o.delivery||{}).filter(Boolean).join(' · '))+'</div>':'')+'<div>Zwischensumme: '+(gross/100).toFixed(2)+' €</div>'+(discount?'<div>Rabatt: -'+(discount/100).toFixed(2)+' €</div>':'')+'<div>Netto/zu zahlen: '+(net/100).toFixed(2)+' €</div>'+(tax.food?'<div>MwSt '+foodRate+'%: '+(taxFood/100).toFixed(2)+' €</div>':'')+(tax.drink?'<div>MwSt '+drinkRate+'% Getränke: '+(taxDrink/100).toFixed(2)+' €</div>':'')+'</div>';window.print();setTimeout(()=>sheet.remove(),500);
  }
  async function log(o,action,kind){
    try{await fetch('/api/kasse/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,order:o,stage:kind})})}catch(e){console.warn('[NARA][PRINT_LOG_FAILED]',e.message)}
  }
  function print(kind,action){const o=current();if(!o||!(o.cart||[]).length){$('#message').textContent=t('empty');return}showSheet(o,kind);log(o,action,kind);$('#message').textContent=t('sent')}
  const printerDefaults=[{id:'system',name:'Windows / Systemdrucker',routes:['kitchen','customer','driver']},{id:'kitchen-1',name:'Küchen-Drucker',routes:['kitchen']},{id:'counter-1',name:'Kasse / Ausgabe',routes:['customer']},{id:'delivery-1',name:'Lieferung',routes:['driver']}];
  function printers(){try{return JSON.parse(localStorage.getItem('nara-printers')||'null')||printerDefaults}catch{return printerDefaults}}
  function savePrinters(v){localStorage.setItem('nara-printers',JSON.stringify(v))}
  function mountPrinterSettings(){if(document.getElementById('nara-printer-settings'))return;const host=document.querySelector('header .header-actions')||document.querySelector('header');if(!host)return;const button=document.createElement('button');button.id='nara-printer-settings-toggle';button.type='button';button.textContent='🖨️';button.title='Printer settings';host.appendChild(button);const panel=document.createElement('div');panel.id='nara-printer-settings';panel.hidden=true;panel.innerHTML='<h3>🖨️ Printer setup</h3><p>Assign a printer route. The browser print dialog selects the real Windows printer.</p><div id="nara-printer-list"></div><div class="nara-printer-add"><input id="nara-printer-name" placeholder="Printer name"><button type="button" id="nara-printer-add">+ Add printer</button></div><button type="button" id="nara-printer-close">Close</button>';document.body.appendChild(panel);const list=panel.querySelector('#nara-printer-list');function render(){const ps=printers();list.innerHTML=ps.map((p,i)=>`<div class="nara-printer-row"><input data-pname="${i}" value="${esc(p.name)}"><select data-prole="${i}"><option value="kitchen">Kitchen</option><option value="customer">Customer</option><option value="driver">Delivery</option></select><button type="button" data-premove="${i}">×</button></div>`).join('');ps.forEach((p,i)=>{const s=list.querySelector(`[data-prole="${i}"]`);s.value=p.routes?.[0]||'customer'})}button.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)render()};panel.querySelector('#nara-printer-close').onclick=()=>panel.hidden=true;panel.querySelector('#nara-printer-add').onclick=()=>{const n=panel.querySelector('#nara-printer-name').value.trim();if(!n)return;savePrinters([...printers(),{id:'custom-'+Date.now(),name:n,routes:['customer']}]);panel.querySelector('#nara-printer-name').value='';render()};list.addEventListener('input',e=>{const i=e.target.dataset.pname;if(i!==undefined){const ps=printers();ps[i].name=e.target.value;savePrinters(ps)}});list.addEventListener('change',e=>{const i=e.target.dataset.prole;if(i!==undefined){const ps=printers();ps[i].routes=[e.target.value];savePrinters(ps)}});list.addEventListener('click',e=>{const i=e.target.dataset.premove;if(i!==undefined){const ps=printers();ps.splice(Number(i),1);savePrinters(ps);render()}})}
  function mount(){
    const cart=$('#cart');if(!cart||document.getElementById('nara-print-tools'))return;
    const box=document.createElement('div');box.id='nara-print-tools';box.innerHTML='<div class="nara-order-identity"><span>'+esc(t('code'))+'</span><strong id="nara-order-code">—</strong></div><div class="nara-print-actions"><button type="button" data-print-kind="kitchen">'+esc(t('kitchen'))+'</button><button type="button" data-print-kind="customer">'+esc(t('customer'))+'</button><button type="button" data-print-kind="driver">'+esc(t('driver'))+'</button><button type="button" data-print-kind="reprint">'+esc(t('reprint'))+'</button></div>';
    cart.parentElement.insertBefore(box,cart);box.addEventListener('click',e=>{const b=e.target.closest('[data-print-kind]');if(!b)return;const kind=b.dataset.printKind;print(kind==='reprint'?'customer':kind,kind==='reprint'?'REPRINT':kind==='kitchen'?'KITCHEN_PRINT':kind==='driver'?'DRIVER_PRINT':'CUSTOMER_PRINT')});
    const old=window.NARA_LEGACY_KASSE_STATE?.render;if(old)window.NARA_LEGACY_KASSE_STATE.render=()=>{old();const o=current();$('#nara-order-code').textContent=code(o)||'—'};
  }
  mount();mountPrinterSettings();const sound=document.createElement('script');sound.src='kasse-print-sound.js?v=20261001';document.body.appendChild(sound);const lanch=document.createElement('script');lanch.src='kasse-lanch-import.js?v=20261001';document.body.appendChild(lanch);const lanchFile=document.createElement('script');lanchFile.src='kasse-lanch-file-preview.js?v=20261001';document.body.appendChild(lanchFile);
})();

// Print the customer copy immediately after a successful local payment.
(function(){
  'use strict';
  if(window.__naraPaymentPrintHook)return;
  window.__naraPaymentPrintHook=true;
  const nativeFetch=window.fetch;
  window.fetch=async function(input,init){
    const body=typeof init?.body==='string'?init.body:null;
    let payload=null;try{payload=body?JSON.parse(body):null}catch{}
    const response=await nativeFetch.apply(this,arguments);
    if(payload?.action==='FINALIZE_PAYMENT'&&response.ok&&localStorage.getItem('nara-auto-print-payment')!=='false'){
      const button=document.querySelector('[data-print-kind="customer"]');
      if(button)button.click();
    }
    return response;
  };
})();

(function(){
  setTimeout(()=>{
    const panel=document.querySelector('#nara-printer-settings');
    if(!panel||panel.querySelector('#nara-auto-print-payment'))return;
    const label=document.createElement('label');label.style.cssText='display:flex;gap:8px;align-items:center;margin:12px 0;font-weight:700';
    label.innerHTML='<input id="nara-auto-print-payment" type="checkbox" style="width:auto;margin:0"> Automatisch nach Zahlung drucken';
    const input=label.querySelector('input');input.checked=localStorage.getItem('nara-auto-print-payment')!=='false';input.onchange=()=>localStorage.setItem('nara-auto-print-payment',String(input.checked));
    panel.querySelector('h3')?.after(label);
  },500);
})();

// Future-ready network printer fields and an explicit kitchen print fallback.
(function(){
  'use strict';
  const read=()=>{try{return JSON.parse(localStorage.getItem('nara-printers')||'[]')}catch{return []}};
  const write=v=>localStorage.setItem('nara-printers',JSON.stringify(v));
  const enhance=()=>{
    const panel=document.querySelector('#nara-printer-settings');
    if(!panel||panel.dataset.enhanced)return;
    panel.dataset.enhanced='1';
    const add=panel.querySelector('.nara-printer-add');
    if(add){const fields=document.createElement('div');fields.className='nara-printer-network-fields';fields.innerHTML='<input id="nara-printer-ip" placeholder="IP-Adresse (z.B. 192.168.1.50)"><input id="nara-printer-port" type="number" placeholder="Port" value="9100"><select id="nara-printer-connection"><option value="windows">Windows / Chrome</option><option value="network">Netzwerk TCP/IP</option><option value="usb">USB</option><option value="bluetooth">Bluetooth</option></select>';add.before(fields);panel.querySelector('#nara-printer-add').addEventListener('click',()=>{const name=panel.querySelector('#nara-printer-name')?.value.trim();if(!name)return;const list=read();const item=list[list.length-1];if(item){item.ip=panel.querySelector('#nara-printer-ip')?.value.trim()||'';item.port=Number(panel.querySelector('#nara-printer-port')?.value||9100);item.connection=panel.querySelector('#nara-printer-connection')?.value||'windows';write(list)}})}
  };
  const last=()=>{const sheet=document.querySelector('#nara-print-sheet');if(sheet)localStorage.setItem('nara-last-print',JSON.stringify({kind:sheet.dataset.kind,at:new Date().toISOString()}))};
  setTimeout(()=>{enhance();last()},200);
})();

