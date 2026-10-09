(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const state=()=>window.NARA_LEGACY_KASSE_STATE;
  const current=()=>state()?.getCurrent?.();
  const text={
    de:{print:'Drucken',kitchen:'Küche',customer:'Kunde',driver:'Lieferung',reprint:'Erneut drucken',code:'Bestellcode',empty:'Bitte zuerst Artikel hinzufügen',sent:'Druck protokolliert, Auftrag bleibt offen ✅',psTitle:'Drucker-Einstellungen',psSetup:'🖨️ Drucker einrichten',psHelp:'Jedem Drucker eine Aufgabe zuweisen. Den echten Windows-Drucker wählst du im Druckdialog des Browsers.',psName:'Druckername',psAdd:'+ Drucker hinzufügen',psClose:'Schließen',rKitchen:'Küche',rCustomer:'Kunde',rDriver:'Lieferung',auto:'Automatisch nach Zahlung drucken',ip:'IP-Adresse (z. B. 192.168.1.50)',port:'Port',net:'Netzwerk TCP/IP',remove:'Entfernen',notReady:'Druckvorlage noch nicht geladen – Seite neu laden (F5)'},
    ar:{print:'اطبع',kitchen:'المطبخ',customer:'نسخة الزبون',driver:'نسخة التوصيل',reprint:'اطبع مرة تانية',code:'رقم الطلب',empty:'زيد صنف قبل ما تطبع',sent:'انطبع وتسجّل، والطلب لسّا مفتوح ✅',psTitle:'إعدادات الطابعة',psSetup:'🖨️ ضبط الطابعات',psHelp:'حدّد شو بتطبع كل طابعة. الطابعة الحقيقية بتنقّيها من نافذة الطباعة بالمتصفح.',psName:'اسم الطابعة',psAdd:'+ زيد طابعة',psClose:'سكّر',rKitchen:'المطبخ',rCustomer:'الزبون',rDriver:'التوصيل',auto:'اطبع لحالو بعد الدفع',ip:'عنوان IP (مثلاً 192.168.1.50)',port:'Port',net:'شبكة TCP/IP',remove:'شيل',notReady:'شكل الفاتورة لسا ما تحمّل – حدّث الصفحة (F5)'},
    en:{print:'Print',kitchen:'Kitchen ticket',customer:'Customer copy',driver:'Driver copy',reprint:'Reprint',code:'Order code',empty:'Add an item before printing',sent:'Print logged; order remains open ✅',psTitle:'Printer settings',psSetup:'🖨️ Printer setup',psHelp:'Assign a printer route. The browser print dialog selects the real Windows printer.',psName:'Printer name',psAdd:'+ Add printer',psClose:'Close',rKitchen:'Kitchen',rCustomer:'Customer',rDriver:'Delivery',auto:'Print automatically after payment',ip:'IP address (e.g. 192.168.1.50)',port:'Port',net:'Network TCP/IP',remove:'Remove',notReady:'Receipt template not loaded yet – reload the page (F5)'}};
  function lang(){try{if(window.NARA_LANG)return window.NARA_LANG.get();const l=localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}}
  function t(k){return (text[lang()]||text.de)[k]||text.de[k]}
  // الورقة المطبوعة (فاتورة/تذكرة) بتضل ألماني أو إنجليزي، مو عربي
  function pt(k){return (lang()==='en'?text.en:text.de)[k]}
  window.NARA_PRINT_T=t;
  function code(o){if(!o)return '';if(o.displayCode)return o.displayCode;return 'NARA-'+String(o.id||'').replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase()}
  function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
  function total(o){return (o.cart||[]).reduce((s,x)=>s+(Number(x.unitCents)||0)*(Number(x.quantity)||0),0)}
  function platformBrand(o){const p=String(o?.platform||o?.source||'NARA').toUpperCase();if(p.includes('LIEFERANDO'))return {name:'LIEFERANDO',mark:'🟠'};if(p.includes('UBER'))return {name:'UBER EATS',mark:'🟩'};if(p.includes('WOLT'))return {name:'WOLT',mark:'🔵'};if(p.includes('LANCH'))return {name:'LANCH',mark:'🟣'};return {name:'NARA',mark:'🤖'}}

  function deliveryBlock(o,kind){const d=o.delivery||{};if(kind==='customer'&&o.type==='local')return '<div class="print-contact"><strong>TISCH</strong><br><b>Tisch '+esc(o.table||'1')+'</b></div>';if(kind==='customer'&&o.type==='pickup')return '<div class="print-contact"><strong>KUNDE / ABHOLUNG</strong><br><b>'+esc(d.name||'Kunde')+'</b></div>';if(kind!=='kitchen'&&kind!=='driver'&&!(kind==='customer'&&o.type==='delivery'))return '';const values=Object.values(d).filter(Boolean);if(!values.length)return '';return '<div class="print-contact"><strong>'+esc(kind==='kitchen'?'KUNDENKONTAKT / LIEFERUNG':'LIEFERADRESSE')+'</strong><br>'+esc(values.join(' · '))+'</div>'}
  function showSheet(o,kind){
    
    let sheet=document.getElementById('nara-print-sheet');if(!sheet){sheet=document.createElement('section');sheet.id='nara-print-sheet';document.body.appendChild(sheet)}
    if(kind==='kitchen'&&window.NARA_RECEIPT&&window.NARA_RECEIPT.kitchenHtml){sheet.innerHTML=window.NARA_RECEIPT.kitchenHtml(o);window.print();setTimeout(()=>sheet.remove(),500);return}
    // الفاتورة دايماً من kasse-receipt.js (QR محلي، بدون أي خدمة برّا، وبدون أرقام فاتورة أو ضريبة وهمية)
    if((kind==='customer'||kind==='driver')&&window.NARA_RECEIPT&&window.NARA_RECEIPT.html){sheet.innerHTML=window.NARA_RECEIPT.html(o,kind);window.print();setTimeout(()=>sheet.remove(),500);return}
    sheet.remove();$('#message').textContent='⚠ '+t('notReady');
  }
  async function log(o,action,kind){
    try{await fetch('/api/kasse/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,order:o,stage:kind})})}catch(e){console.warn('[NARA][PRINT_LOG_FAILED]',e.message)}
  }
  async function print(kind,action){const o=current();if(!o||!(o.cart||[]).length){$('#message').textContent=t('empty');return}
    log(o,action,kind);
    if(window.NARA_RECEIPT&&window.NARA_RECEIPT.print){
      // الكاشير بيستنى الطباعة قبل ما يعيد تحميل الصفحة بعد الدفع (حد أقصى 10 ثواني)
      const job=window.NARA_RECEIPT.print(o,kind);
      window.NARA_PRINT_PENDING=Promise.race([job.catch(()=>null),new Promise(r=>setTimeout(r,10000))]);
      const r=await job;$('#message').textContent=r&&r.error?'⚠ '+r.error:t('sent');return}
    showSheet(o,kind);$('#message').textContent=t('sent')}
  function mount(){
    const cart=$('#cart');if(!cart||document.getElementById('nara-print-tools'))return;
    const box=document.createElement('div');box.id='nara-print-tools';box.innerHTML='<div class="nara-order-identity"><span data-pl="code">'+esc(t('code'))+'</span><strong id="nara-order-code">—</strong></div><div class="nara-print-actions"><button type="button" data-print-kind="kitchen" data-pl="kitchen">'+esc(t('kitchen'))+'</button><button type="button" data-print-kind="customer" data-pl="customer">'+esc(t('customer'))+'</button><button type="button" data-print-kind="driver" data-pl="driver">'+esc(t('driver'))+'</button><button type="button" data-print-kind="reprint" data-pl="reprint">'+esc(t('reprint'))+'</button></div>';
    cart.parentElement.insertBefore(box,cart);box.addEventListener('click',e=>{const b=e.target.closest('[data-print-kind]');if(!b)return;const kind=b.dataset.printKind;print(kind==='reprint'?'customer':kind,kind==='reprint'?'REPRINT':kind==='kitchen'?'KITCHEN_PRINT':kind==='driver'?'DRIVER_PRINT':'CUSTOMER_PRINT')});
    const old=window.NARA_LEGACY_KASSE_STATE?.render;if(old)window.NARA_LEGACY_KASSE_STATE.render=()=>{old();const o=current();$('#nara-order-code').textContent=code(o)||'—'};
  }
  // تبديل اللغة: منحدّث نصوص أزرار الطباعة ولوحة الطابعات
  function relabel(){document.querySelectorAll('[data-pl]').forEach(el=>{el.textContent=t(el.dataset.pl)});document.querySelectorAll('[data-pl-ph]').forEach(el=>{el.placeholder=t(el.dataset.plPh)});document.querySelectorAll('[data-pl-title]').forEach(el=>{el.title=t(el.dataset.plTitle)});const p=document.getElementById('nara-printer-settings');if(p&&!p.hidden)p.dispatchEvent(new Event('nara-print-relabel'))}
  window.addEventListener('nara-lang',()=>setTimeout(relabel,0));document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-lang]'))setTimeout(relabel,0)});
  mount();const sound=document.createElement('script');sound.src='kasse-print-sound.js?v=20261001';document.body.appendChild(sound);const lanch=document.createElement('script');lanch.src='kasse-lanch-import.js?v=20261001';document.body.appendChild(lanch);const lanchFile=document.createElement('script');lanchFile.src='kasse-lanch-file-preview.js?v=20261001';document.body.appendChild(lanchFile);
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
    if(payload?.action==='FINALIZE_PAYMENT'&&response.ok&&window.NARA_PRINT_AUTO_PAY!==false){
      // تقسيم الفاتورة: منطبع بس لما تندفع كلها، مو بعد كل جزء
      let done=true;try{const j=await response.clone().json();const p=j&&(j.payment||j);if(p&&p.completed===false)done=false}catch(e){}
      const button=done&&document.querySelector('[data-print-kind="customer"]');
      if(button)button.click();
    }
    return response;
  };
})();

