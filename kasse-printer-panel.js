// kasse-printer-panel.js — لوحة 🖨️ بالكاشير: الطابعات الحقيقية ومين بيطبع شو. كل شي قابل للتعديل ومحفوظ عالسيرفر.
// - طريقة كل طابعة: نافذة المتصفح · ويندوز مباشرة (USB، بلا نافذة) · شبكة (IP:9100)
// - التوزيع: فاتورة الكاشير · فاتورة المنصات (+ ورقة العرض) · ورقة المطبخ · ورقة السواق
// - طباعة لحالها: بعد الدفع · ورقة المطبخ لما يجي طلب منصة · فاتورة لما يجي طلب منصة
(function(){
  'use strict';
  const T={
    de:{title:'Drucker',printers:'Drucker',name:'Name',mode:'Art',mBrowser:'Druckfenster (Browser)',mWindows:'Windows direkt (USB, ohne Fenster)',mNetwork:'Netzwerk (IP)',win:'Windows-Drucker',pick:'– wählen –',ip:'IP-Adresse',port:'Port',width:'Papier',cut:'Schnitt',cPartial:'Teilschnitt',cFull:'Voll',cNone:'kein',test:'Testdruck',remove:'Entfernen',add:'+ Drucker',routes:'Wer druckt was?',rKasse:'Kassenbon (Kasse)',rPlatform:'Plattform-Bestellungen (+ Werbezettel)',rKitchen:'Küchenzettel',rDriver:'Fahrerzettel',copies:'Kopien',auto:'Automatisch drucken',aPay:'Bon nach Bezahlung',aKitchen:'Küchenzettel bei neuer Plattform-Bestellung',aReceipt:'Bon bei neuer Plattform-Bestellung',aWeb:'Küchenzettel + Bon bei neuer Website-Bestellung',promo:'Werbezettel (Herz-QR)',pOn:'unter Plattform-Bons drucken',pPct:'Rabatt %',pDays:'gültig (Tage)',pUrl:'Link zur App',save:'Speichern',saved:'Gespeichert ✓',close:'Schließen',noWin:'Keine Windows-Drucker gefunden (nur am Kassen-PC)',okTest:'Testdruck gesendet ✓',onlyMgr:'Nur Inhaber/Manager kann speichern.',hint:'„Windows direkt“ druckt sofort ohne Fenster auf einen USB-Drucker. Für die Epson im Netzwerk: Art „Netzwerk“ und IP eintragen.'},
    ar:{title:'الطابعات',printers:'الطابعات',name:'الاسم',mode:'الطريقة',mBrowser:'نافذة الطباعة (المتصفح)',mWindows:'ويندوز مباشرة (USB، بلا نافذة)',mNetwork:'شبكة (IP)',win:'طابعة الويندوز',pick:'– نقّي –',ip:'عنوان IP',port:'Port',width:'الورق',cut:'القصّ',cPartial:'نصّي',cFull:'كامل',cNone:'بلا',test:'ورقة تجربة',remove:'شيل',add:'+ طابعة',routes:'مين بيطبع شو؟',rKasse:'فاتورة الكاشير',rPlatform:'طلبات المنصات (+ ورقة العرض)',rKitchen:'ورقة المطبخ',rDriver:'ورقة السواق',copies:'نسخ',auto:'طباعة لحالها',aPay:'الفاتورة بعد الدفع',aKitchen:'ورقة المطبخ لما يجي طلب منصة',aReceipt:'الفاتورة لما يجي طلب منصة',aWeb:'ورقة المطبخ + الفاتورة لما يجي طلب من الموقع',promo:'ورقة العرض (QR القلب)',pOn:'اطبعها تحت فاتورة المنصات',pPct:'الخصم %',pDays:'صالحة (أيام)',pUrl:'رابط التطبيق',save:'احفظ',saved:'انحفظ ✓',close:'سكّر',noWin:'ما لقينا طابعات ويندوز (بس عكمبيوتر الكاشير)',okTest:'انبعتت ورقة التجربة ✓',onlyMgr:'بس صاحب المحل أو المدير بيقدر يحفظ.',hint:'"ويندوز مباشرة" بتطبع فوراً بلا نافذة عطابعة USB. للـ Epson عالشبكة: نقّي "شبكة" واكتب الـ IP.'},
    en:{title:'Printers',printers:'Printers',name:'Name',mode:'Type',mBrowser:'Print dialog (browser)',mWindows:'Windows direct (USB, no dialog)',mNetwork:'Network (IP)',win:'Windows printer',pick:'– choose –',ip:'IP address',port:'Port',width:'Paper',cut:'Cut',cPartial:'partial',cFull:'full',cNone:'none',test:'Test print',remove:'Remove',add:'+ Printer',routes:'Who prints what?',rKasse:'Till receipt',rPlatform:'Platform orders (+ promo slip)',rKitchen:'Kitchen ticket',rDriver:'Driver slip',copies:'Copies',auto:'Print automatically',aPay:'Receipt after payment',aKitchen:'Kitchen ticket on new platform order',aReceipt:'Receipt on new platform order',aWeb:'Kitchen ticket + receipt on new website order',promo:'Promo slip (heart QR)',pOn:'print under platform receipts',pPct:'Discount %',pDays:'valid (days)',pUrl:'App link',save:'Save',saved:'Saved ✓',close:'Close',noWin:'No Windows printers found (only on the till PC)',okTest:'Test print sent ✓',onlyMgr:'Only owner/manager can save.',hint:'"Windows direct" prints instantly without a dialog to a USB printer. For the Epson on the network: choose "Network" and enter the IP.'}};
  const lang=()=>{try{const l=window.NARA_LANG?NARA_LANG.get():localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
  const t=k=>(T[lang()]||T.de)[k]||T.de[k]||k;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cfg=null,winList=null,msg='';
  const ROLES=[['kasse','rKasse'],['platform','rPlatform'],['kitchen','rKitchen'],['driver','rDriver']];
  const PLATS=[['LIEFERANDO','Lieferando'],['UBER_EATS','Uber Eats'],['WOLT','Wolt']];

  async function load(){
    try{const r=await fetch('/api/printing/config',{cache:'no-store'});if(r.ok){cfg=(await r.json()).config;window.NARA_PRINT_AUTO_PAY=!!cfg.auto.afterPayment}}catch(e){}
  }
  async function loadWin(){
    try{const r=await fetch('/api/printing/windows-printers',{cache:'no-store'});const j=await r.json().catch(()=>({}));winList=Array.isArray(j.printers)?j.printers:[]}catch(e){winList=[]}
    draw();
  }
  const sel=(attrs,opts,val)=>'<select '+attrs+'>'+opts.map(([v,l])=>'<option value="'+esc(v)+'"'+(String(v)===String(val)?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>';
  function printerRow(p,i){
    const win=(winList||[]);const winOpts=[['',t('pick')]].concat(win.map(n=>[n,n]));if(p.winName&&!win.includes(p.winName))winOpts.push([p.winName,p.winName]);
    return '<div class="npp-card">'
      +'<div class="npp-row"><input data-f="name" data-i="'+i+'" value="'+esc(p.name)+'" placeholder="'+esc(t('name'))+'">'
      +sel('data-f="mode" data-i="'+i+'"',[['browser',t('mBrowser')],['windows',t('mWindows')],['network',t('mNetwork')]],p.mode)+'</div>'
      +(p.mode==='windows'?'<div class="npp-row"><label>'+esc(t('win'))+'</label>'+sel('data-f="winName" data-i="'+i+'"',winOpts,p.winName)+(winList&&!winList.length?'<small>'+esc(t('noWin'))+'</small>':'')+'</div>':'')
      +(p.mode==='network'?'<div class="npp-row"><label>'+esc(t('ip'))+'</label><input data-f="ip" data-i="'+i+'" value="'+esc(p.ip)+'" placeholder="192.168.178.45" dir="ltr"><label>'+esc(t('port'))+'</label><input data-f="port" data-i="'+i+'" type="number" value="'+esc(p.port)+'" style="width:80px" dir="ltr"></div>':'')
      +'<div class="npp-row"><label>'+esc(t('width'))+'</label>'+sel('data-f="width" data-i="'+i+'"',[['80','80 mm'],['58','58 mm']],p.width)
      +'<label>'+esc(t('cut'))+'</label>'+sel('data-f="cut" data-i="'+i+'"',[['partial',t('cPartial')],['full',t('cFull')],['none',t('cNone')]],p.cut)
      +'<span class="sp"></span><button type="button" data-test="'+esc(p.id)+'">🧾 '+esc(t('test'))+'</button>'
      +(cfg.printers.length>1?'<button type="button" data-rm="'+i+'" title="'+esc(t('remove'))+'">✕</button>':'')+'</div></div>';
  }
  function draw(){
    const m=document.getElementById('npp');if(!m||m.hidden||!cfg)return;
    const pOpts=cfg.printers.map(p=>[p.id,p.name]);
    m.querySelector('.npp-body').innerHTML=
      '<p class="npp-hint">'+esc(t('hint'))+'</p>'
      +'<h4>'+esc(t('printers'))+'</h4>'+cfg.printers.map(printerRow).join('')+'<button type="button" id="npp-add">'+esc(t('add'))+'</button>'
      +'<h4>'+esc(t('routes'))+'</h4>'+ROLES.map(([r,k])=>'<div class="npp-row"><label class="npp-wide">'+esc(t(k))+'</label>'+sel('data-route="'+r+'"',pOpts,cfg.routes[r])+'<label>'+esc(t('copies'))+'</label>'+sel('data-copies="'+r+'"',[[1,'1'],[2,'2'],[3,'3']],cfg.copies[r])+'</div>').join('')
      +'<h4>'+esc(t('auto'))+'</h4>'+[['afterPayment','aPay'],['kitchenOnPlatformOrder','aKitchen'],['receiptOnPlatformOrder','aReceipt'],['webOrder','aWeb']].map(([k,l])=>'<label class="npp-check"><input type="checkbox" data-auto="'+k+'"'+(cfg.auto[k]?' checked':'')+'> '+esc(t(l))+'</label>').join('')
      +'<h4>'+esc(t('promo'))+'</h4><label class="npp-check"><input type="checkbox" data-promo="enabled"'+(cfg.promo.enabled?' checked':'')+'> '+esc(t('pOn'))+'</label>'
      +'<div class="npp-row">'+PLATS.map(([v,l])=>'<label class="npp-check"><input type="checkbox" data-pplat="'+v+'"'+(cfg.promo.platforms.includes(v)?' checked':'')+'> '+esc(l)+'</label>').join('')+'</div>'
      +'<div class="npp-row"><label>'+esc(t('pPct'))+'</label><input type="number" data-promo="percent" value="'+esc(cfg.promo.percent)+'" style="width:70px"><label>'+esc(t('pDays'))+'</label><input type="number" data-promo="days" value="'+esc(cfg.promo.days)+'" style="width:70px"></div>'
      +'<div class="npp-row"><label>'+esc(t('pUrl'))+'</label><input data-promo="url" value="'+esc(cfg.promo.url)+'" dir="ltr" style="flex:1"></div>';
    m.querySelector('.npp-msg').textContent=msg;
  }
  function open(){
    let m=document.getElementById('npp');
    if(!m){
      m=document.createElement('div');m.id='npp';m.hidden=true;
      m.innerHTML='<div class="npp-box"><div class="npp-head"><h3>🖨️ <span class="npp-title"></span></h3><span class="sp"></span><button type="button" class="npp-x">✕</button></div><div class="npp-body"></div><div class="npp-foot"><span class="npp-msg"></span><span class="sp"></span><button type="button" class="npp-save"></button></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click',onClick);m.addEventListener('change',onChange);m.addEventListener('input',onInput);
    }
    m.querySelector('.npp-title').textContent=t('title');m.querySelector('.npp-save').textContent=t('save');
    m.hidden=false;msg='';
    load().then(()=>{draw();if(winList===null)loadWin()});
  }
  function onInput(e){const el=e.target;if(el.dataset.f&&el.tagName==='INPUT'){cfg.printers[+el.dataset.i][el.dataset.f]=el.type==='number'?Number(el.value):el.value}else if(el.dataset.promo&&el.type!=='checkbox'){cfg.promo[el.dataset.promo]=el.type==='number'?Number(el.value):el.value}}
  function onChange(e){
    const el=e.target;
    if(el.dataset.f){const p=cfg.printers[+el.dataset.i];p[el.dataset.f]=el.dataset.f==='width'?Number(el.value):el.value;if(el.dataset.f==='mode'){draw();if(el.value==='windows'&&winList===null)loadWin()}}
    else if(el.dataset.route)cfg.routes[el.dataset.route]=el.value;
    else if(el.dataset.copies)cfg.copies[el.dataset.copies]=Number(el.value);
    else if(el.dataset.auto)cfg.auto[el.dataset.auto]=el.checked;
    else if(el.dataset.promo==='enabled')cfg.promo.enabled=el.checked;
    else if(el.dataset.pplat){const s=new Set(cfg.promo.platforms);el.checked?s.add(el.dataset.pplat):s.delete(el.dataset.pplat);cfg.promo.platforms=[...s]}
  }
  async function save(){
    try{const r=await fetch('/api/printing/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});const j=await r.json().catch(()=>({}));
      if(r.status===403){msg=t('onlyMgr')}else if(!r.ok){msg='⚠ '+(j.error||r.status)}else{cfg=j.config;window.NARA_PRINT_AUTO_PAY=!!cfg.auto.afterPayment;window.NARA_PROMO={url:cfg.promo.url,percent:cfg.promo.percent,days:cfg.promo.days};msg=t('saved')}}catch(e){msg='⚠ '+e.message}
    draw();
  }
  async function onClick(e){
    const el=e.target.closest('button');if(!el){if(e.target.id==='npp'){e.target.hidden=true}return}
    if(el.classList.contains('npp-x')){document.getElementById('npp').hidden=true;return}
    if(el.classList.contains('npp-save')){await save();return}
    if(el.id==='npp-add'){cfg.printers.push({id:'p'+Date.now().toString(36),name:t('printers')+' '+(cfg.printers.length+1),mode:'browser',winName:'',ip:'',port:9100,width:80,cut:'full'});draw();return}
    if(el.dataset.rm!==undefined){const i=+el.dataset.rm,id=cfg.printers[i].id;cfg.printers.splice(i,1);for(const k of Object.keys(cfg.routes))if(cfg.routes[k]===id)cfg.routes[k]=cfg.printers[0].id;draw();return}
    if(el.dataset.test){
      // التجربة بتستعمل الإعدادات المحفوظة: احفظ أول
      await save();if(/⚠|Nur|بس صاحب|Only/.test(msg))return;
      el.disabled=true;
      try{const r=await fetch('/api/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'test',printerId:el.dataset.test})});const j=await r.json().catch(()=>({}));
        if(!r.ok)msg='⚠ '+(j.error||r.status);else if(j.mode==='browser'){const s=document.getElementById('nara-print-sheet')||document.body.appendChild(Object.assign(document.createElement('section'),{id:'nara-print-sheet'}));s.innerHTML='<div class="nara-rc"><div class="rc-brand">NARA</div><div class="rc-type">TESTDRUCK</div><div class="rc-c">'+new Date().toLocaleString('de-DE')+'</div></div>';window.print();msg=t('okTest')}else msg=t('okTest')}catch(err){msg='⚠ '+err.message}
      el.disabled=false;draw();return}
  }
  // زر 🖨️ بالرأس
  function mount(){
    const h=document.querySelector('header .header-actions')||document.querySelector('header');if(!h||document.getElementById('npp-toggle'))return;
    const b=document.createElement('button');b.id='npp-toggle';b.type='button';b.textContent='🖨️';b.title=t('title');b.onclick=open;h.appendChild(b);
  }
  const css=document.createElement('style');
  css.textContent='#npp{position:fixed;inset:0;z-index:9600;background:#0007;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}#npp[hidden]{display:none}'
    +'.npp-box{background:#fff;color:#14181c;border-radius:16px;width:min(720px,100%);padding:16px 18px}.npp-head,.npp-foot,.npp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.npp-head h3{margin:0}.sp{flex:1}'
    +'.npp-body h4{margin:14px 0 6px;font-size:.95rem}.npp-card{border:1px solid #e3e7eb;border-radius:12px;padding:8px 10px;margin-bottom:8px;display:grid;gap:6px}'
    +'.npp-row input,.npp-row select{height:36px;border:1px solid #d6dade;border-radius:8px;padding:0 8px;font:inherit}.npp-row label{font-size:.85rem;color:#555}.npp-wide{min-width:220px}'
    +'.npp-check{display:flex;align-items:center;gap:6px;margin:4px 0;font-weight:600}.npp-hint{font-size:.85rem;color:#555;background:#f6f7f9;border-radius:10px;padding:8px 10px;margin:8px 0 0}'
    +'#npp button{min-height:36px;border:1px solid #d6dade;border-radius:8px;background:#f4f6f8;font-weight:700;cursor:pointer;padding:0 10px}#npp .npp-save{background:#1d2327;color:#fff;border:0;min-width:120px}.npp-msg{font-weight:700}';
  document.head.appendChild(css);
  load();setInterval(mount,1000);mount();
  window.NARA_PRINTER_PANEL={open};
})();
