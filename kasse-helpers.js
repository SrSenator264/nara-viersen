// kasse-helpers.js — مساعدات صغيرة للكاشير:
// 1) المدينة بتنكتب لحالها من الرمز البريدي (إذا الخانة فاضية أو كانت معبّاية تلقائياً).
// 2) وقت الجهوزية المتوقع وأنت عم تاخد الطلب (من تعلّم المطبخ + الطابور): "جاهز تقريباً 18:42".
// 3) بعد تسجيل الدخول، خانة "Mitarbeiter · Name / PIN" ما إلها داعي: الطلب بيتسجّل باسم اللي داخل.
// 4) زر "🛵 التوزيع" بالرأس بيفتح شاشة السواقين.
// 5) لمبة Lieferando بالرأس: 🟢 شغّال، 🟠 لازم تسجيل دخول / ما في طلبات عم توصل، 🔴 الجسر مسكّر.
// 6) طلب جديد من المنصات: كرت "اقبل بـ X دقيقة" (حجم الطلب + المسافة + شغل المطبخ)، وللطلب المجدول: منلحق ولا لأ.
(function(){
  const $=s=>document.querySelector(s);
  const lang=()=>{try{if(window.NARA_LANG)return window.NARA_LANG.get();const l=localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
  const T={de:{ready:'Fertig ca.',in:'in',min:'Min',queue:'vorher in der Küche',dispatch:'🛵 Fahrer',ok:'läuft',login:'Login nötig!',nodata:'keine Daten',down:'Bridge aus!',learn:'Schätzung lernt noch',connect:'Tablet / Handy verbinden',qAccept:'Annehmen mit',qPlat:'Plattform',qAdd:'+{x} Min eintragen',qOk:'Zeit passt',qReady:'fertig',qDrive:'Fahrt',qNoAddr:'Adresse unbekannt',qPickup:'Abholung',qSched:'Geplant für',qCan:'✅ schaffen wir — Start {x}',qCannot:'⚠️ schaffen wir nicht — vorschlagen: {x}',qItems:'Artikel',qQueue:'in der Küche',qDone:'Erledigt',qEnough:'{x} Min reichen',qRaise:'auf {x} Min erhöhen',qReal:'realistisch: {x} Min',qDetails:'Details',qOn:'Zeit-Vorschläge einschalten',qOff:'Zeit-Vorschläge ausschalten',qChipHint:'Zeit wählen, die du bei der Plattform einträgst (Küche & Fahrer richten sich danach)'},
    ar:{ready:'جاهز تقريباً',in:'بعد',min:'د',queue:'طلب قبلو بالمطبخ',dispatch:'🛵 السواقين',ok:'شغّال',login:'بدّو تسجيل دخول!',nodata:'ما عم يوصل شي',down:'الجسر مسكّر!',learn:'التقدير لسّا عم يتعلّم',connect:'وصّل تابلت / موبايل',qAccept:'اقبل بـ',qPlat:'المنصة',qAdd:'زيد +{x} د',qOk:'الوقت مزبوط',qReady:'جاهز',qDrive:'سواقة',qNoAddr:'العنوان مو معروف',qPickup:'استلام',qSched:'مجدول لـ',qCan:'✅ منلحق — بلّشوا {x}',qCannot:'⚠️ ما منلحق — اقترح: {x}',qItems:'قطعة',qQueue:'بالمطبخ',qDone:'تمام',qEnough:'{x} د بتكفي',qRaise:'زيد لـ {x} د',qReal:'بالحقيقة بيوصل بـ {x} د',qDetails:'التفاصيل',qOn:'شغّل اقتراحات الوقت',qOff:'طفّي اقتراحات الوقت',qChipHint:'نقّي الوقت اللي كتبتو عالمنصة (المطبخ والسواق بيمشوا عليه)'},
    en:{ready:'Ready approx.',in:'in',min:'min',queue:'ahead in the kitchen',dispatch:'🛵 Drivers',ok:'running',login:'login needed!',nodata:'no data',down:'bridge off!',learn:'estimate still learning',connect:'Connect tablet / phone',qAccept:'Accept with',qPlat:'Platform',qAdd:'add +{x} min',qOk:'time is fine',qReady:'ready',qDrive:'drive',qNoAddr:'address unknown',qPickup:'Pickup',qSched:'Scheduled for',qCan:'✅ we can make it — start {x}',qCannot:'⚠️ we can\'t make it — suggest: {x}',qItems:'items',qQueue:'in the kitchen',qDone:'Done',qEnough:'{x} min is enough',qRaise:'raise to {x} min',qReal:'realistic: {x} min',qDetails:'Details',qOn:'Turn time suggestions on',qOff:'Turn time suggestions off',qChipHint:'Pick the time you set on the platform (kitchen & driver follow it)'}};
  const tr=k=>(T[lang()]||T.de)[k]||T.de[k];
  const L=()=>window.NARA_LEGACY_KASSE_STATE;
  const cur=()=>{const l=L();return l&&l.getCurrent?l.getCurrent():null};

  // 1) المدينة من الرمز البريدي
  function cityFor(plz){
    const n=Number(plz);if(!/^\d{5}$/.test(plz))return '';
    if(n>=41747&&n<=41751)return 'Viersen';
    if(n>=41061&&n<=41239)return 'Mönchengladbach';
    if(n>=47906&&n<=47929)return 'Kempen';
    if(n>=41334&&n<=41366)return 'Nettetal';
    if(n===41379)return 'Brüggen';
    if(n===47929)return 'Grefrath';
    if(n===41366)return 'Schwalmtal';
    if(n===47918)return 'Tönisvorst';
    return '';
  }
  const plz=$('#postal-code'),city=$('#city');
  if(plz&&city){
    plz.addEventListener('input',()=>{
      const c=cityFor(plz.value.trim());
      if(c&&(!city.value.trim()||city.dataset.auto==='1')){city.value=c;city.dataset.auto='1';city.dispatchEvent(new Event('input',{bubbles:true}))}
    });
    city.addEventListener('input',e=>{if(e.isTrusted)city.dataset.auto='0'});
  }

  // 2) وقت الجهوزية المتوقع
  const total=$('#total'),box=document.createElement('div');box.id='nara-eta';box.className='nara-eta';box.hidden=true;
  if(total){const t=total.closest('.cart-total')||total.parentElement;t.after(box)}
  let seq=0,timer=0;
  const hm=v=>{const d=new Date(v);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
  async function estimate(){
    const o=cur(),cart=(o&&o.cart||[]).filter(i=>i.kind!=='DELIVERY_FEE');
    if(!cart.length){box.hidden=true;return}
    const mine=++seq;
    try{
      const r=await fetch('/api/kitchen/estimate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cart})});
      if(!r.ok||mine!==seq)return;const j=await r.json();
      box.hidden=false;
      box.innerHTML='⏱ <b>'+tr('ready')+' '+hm(j.readyAt)+'</b> · '+tr('in')+' '+j.minutes+' '+tr('min')+(j.queue?' · '+j.queue+' '+tr('queue'):'')+(j.learnedFrom<10?'<small>'+tr('learn')+'</small>':'');
    }catch(e){/* بدون سيرفر: ما منعرض شي */}
  }
  const later=()=>{clearTimeout(timer);timer=setTimeout(estimate,700)};
  if(total)new MutationObserver(later).observe(total,{childList:true,characterData:true,subtree:true});
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',later));
  setInterval(estimate,60000);later();

  // 3) خانة الموظف بعد الدخول
  function employeeField(){
    const auth=window.NARA_AUTH,u=auth&&auth.user&&auth.user();if(!u)return false;
    const inp=$('#order-employee');if(!inp)return false;
    const lab=inp.closest('label')||inp;lab.hidden=true;lab.style.display='none';
    if(inp.value!==u.name){inp.value=u.name;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}))}
    try{localStorage.setItem('nara-cashier-employee-id',u.id)}catch(e){}
    return true;
  }
  const empTimer=setInterval(()=>{employeeField()},1000);employeeField();

  // 5) حالة جسور المنصات
  const NAMES={LIEFERANDO:'Lieferando',UBER_EATS:'Uber Eats',WOLT:'Wolt',LANCH:'Lanch',SIDES:'Loco (Sides)'};
  const COLORS={ok:'#16a34a',login:'#f59e0b',nodata:'#f59e0b',down:'#dc2626'};
  let platforms=[];
  async function pollPlatforms(){
    try{const r=await fetch('/api/platform-orders/status',{cache:'no-store'});if(r.ok){const j=await r.json();platforms=j.platforms||[];quotes=j.quotes||[]}}catch(e){}
    drawPlatforms();drawQuotes();
  }
  function drawPlatforms(){
    const h=document.querySelector('header .header-actions');if(!h)return;
    let box=document.getElementById('nara-platform-status');
    if(!box){box=document.createElement('span');box.id='nara-platform-status';box.style.cssText='display:inline-flex;gap:6px;margin-inline:8px;align-items:center';h.appendChild(box)}
    box.innerHTML='';
    for(const p of platforms){
      const el=document.createElement('span'),c=COLORS[p.state]||'#999';
      el.style.cssText='display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-weight:800;font-size:.85rem;border:2px solid '+c+';color:'+(p.state==='ok'?'inherit':c);
      el.innerHTML='<i style="width:9px;height:9px;border-radius:50%;background:'+c+'"></i>';
      el.appendChild(document.createTextNode((NAMES[p.source]||p.source)+(p.state==='ok'?'':' · '+tr(p.state))));
      el.title=(NAMES[p.source]||p.source)+': '+tr(p.state)+(p.lastOkAt?' · '+new Date(p.lastOkAt).toLocaleTimeString():'');
      box.appendChild(el);
    }
  }
  setInterval(pollPlatforms,10000);setTimeout(pollPlatforms,1500);
  // 6) اقتراح وقت التسليم لطلبات المنصات الجديدة
  let quotes=[];const PCOL={LIEFERANDO:'#ff8000',UBER_EATS:'#06c167',WOLT:'#00c2e8',LANCH:'#222'};
  const seenKey='nara-quote-done';
  const done=()=>{try{return JSON.parse(localStorage.getItem(seenKey)||'[]')}catch(e){return []}};
  const markDone=id=>{try{localStorage.setItem(seenKey,JSON.stringify([String(id),...done()].slice(0,200)))}catch(e){}};
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fill=(k,x)=>tr(k).replace('{x}',x);
  // تشغيل/إطفاء الاقتراحات (لكل جهاز): زر 🔔/🔕 جنب لمبات المنصات
  const offKey='nara-quotes-off';
  const quotesOff=()=>{try{return localStorage.getItem(offKey)==='1'}catch(e){return false}};
  const setQuotesOff=v=>{try{localStorage.setItem(offKey,v?'1':'0')}catch(e){}drawQuotes();bellBtn()};
  function bellBtn(){
    const box=document.getElementById('nara-platform-status');if(!box)return;
    let b=document.getElementById('nara-quote-bell');
    if(!b){b=document.createElement('button');b.id='nara-quote-bell';b.type='button';b.style.cssText='border:1px solid #0002;background:#fff;border-radius:999px;min-width:34px;height:30px;cursor:pointer;font-size:1rem';b.onclick=()=>setQuotesOff(!quotesOff());box.appendChild(b)}
    b.textContent=quotesOff()?'🔕':'🔔';b.title=tr(quotesOff()?'qOn':'qOff');
  }
  const CHIPS=[45,60,75,90];
  let openQ=null;
  async function promise(id,min){
    try{const r=await fetch('/api/platform-orders/promise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id,minutes:min})});
      if(r.ok){const q=quotes.find(x=>String(x.orderId)===String(id));if(q){q.promisedMin=min;q.promisedSet=true;q.addMin=Math.max(0,q.recommendMin-min);q.setMin=Math.max(q.recommendMin,min)}}}catch(e){}
    drawQuotes();
  }
  function chips(q){
    if(q.scheduled)return '';
    return '<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">'+CHIPS.concat(CHIPS.includes(q.setMin)?[]:[q.setMin]).sort((a,b)=>a-b).map(m=>{
      const on=q.promisedMin===m,tooShort=m<q.recommendMin;
      return '<button data-qmin="'+m+'" data-qid="'+esc(q.orderId)+'" style="flex:1;min-width:48px;height:34px;border-radius:8px;font-weight:900;cursor:pointer;border:2px solid '+(on?'#1d2327':tooShort?'#fca5a5':'#d6dade')+';background:'+(on?'#1d2327':'#fff')+';color:'+(on?'#fff':tooShort?'#dc2626':'#1d2327')+'">'+m+'</button>'}).join('')+'</div>'
      +'<div style="font-size:.72rem;color:#666;margin-top:3px">'+tr('qChipHint')+'</div>';
  }
  function head(q){
    const c=PCOL[q.source]||'#555';
    return '<div style="display:flex;align-items:center;gap:6px"><b dir="ltr" style="font-size:1.05rem">'+esc(q.code)+'</b><span style="background:'+c+';color:#fff;border-radius:5px;padding:1px 6px;font-size:.72rem;font-weight:800">'+esc(String(q.source).replace('_',' '))+'</span><span style="margin-inline-start:auto;font-size:.8rem;color:#666">'+q.items+' '+tr('qItems')+'</span></div>';
  }
  function mainLine(q,big){
    if(q.scheduled)return '<div style="margin-top:4px;font-weight:800">'+tr('qSched')+' '+hm(q.requestedAt)+'</div><div style="font-weight:900;font-size:1.05rem;color:'+(q.feasible?'#16a34a':'#dc2626')+'">'+(q.feasible?fill('qCan',hm(q.startAt)):fill('qCannot',hm(q.suggestedAt)))+'</div>';
    const enough=!(q.addMin>0);
    return '<div style="margin-top:4px;font-size:'+(big?'1.6rem':'1.3rem')+';font-weight:900;color:'+(enough?'#16a34a':'#dc2626')+'">'+(enough?'✅ '+fill('qEnough',q.promisedMin):'⚠️ '+fill('qRaise',q.setMin))+'</div>'
      +'<div style="font-size:.85rem;font-weight:700;color:#444">'+fill('qReal',q.recommendMin)+'</div>';
  }
  function det(q){
    return '<div style="font-size:.82rem;color:#444;margin-top:3px">'+[q.scheduled?'':tr('qReady')+' '+hm(q.readyAt),q.type==='pickup'?tr('qPickup'):(q.distanceKnown?tr('qDrive')+' '+q.driveMin+' '+tr('min')+' · <bdi dir="ltr">'+q.km+' km</bdi>':tr('qNoAddr')),q.queue&&!q.scheduled?q.queue+' '+tr('qQueue'):''].filter(Boolean).join(' · ')+'</div>';
  }
  function drawQuotes(){
    let box=document.getElementById('nara-quotes');
    if(!box){box=document.createElement('div');box.id='nara-quotes';box.style.cssText='position:fixed;bottom:70px;inset-inline-start:14px;z-index:9000;display:flex;flex-direction:column;gap:8px;max-width:360px;max-height:calc(100vh - 160px);overflow:auto';document.body.appendChild(box)}
    const gone=new Set(done()),list=quotesOff()?[]:quotes.filter(q=>!gone.has(String(q.orderId)));
    box.innerHTML=list.map(q=>'<div style="background:#fff;color:#14181c;border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px #0004;border-inline-start:6px solid '+(PCOL[q.source]||'#555')+'">'+head(q)+mainLine(q)+det(q)+chips(q)
      +'<div style="display:flex;gap:6px;margin-top:6px"><button data-qopen="'+esc(q.orderId)+'" style="flex:1;min-height:36px;border:1px solid #d6dade;border-radius:8px;background:#f4f6f8;font-weight:800;cursor:pointer">🔍 '+tr('qDetails')+'</button><button data-qdone="'+esc(q.orderId)+'" style="flex:1;min-height:36px;border:0;border-radius:8px;background:#1d2327;color:#fff;font-weight:800;cursor:pointer">✓ '+tr('qDone')+'</button></div></div>').join('');
    drawModal();
  }
  // الكرت الكبير: كل تفاصيل الطلب لتقرّر
  function drawModal(){
    let m=document.getElementById('nara-quote-modal');
    const q=openQ&&quotes.find(x=>String(x.orderId)===openQ);
    if(!q){if(m)m.remove();return}
    if(!m){m=document.createElement('div');m.id='nara-quote-modal';m.style.cssText='position:fixed;inset:0;z-index:9500;background:#0007;display:flex;align-items:center;justify-content:center;padding:14px';m.onclick=e=>{if(e.target===m){openQ=null;drawModal()}};document.body.appendChild(m)}
    const lines=(q.lines||[]).map(l=>'<div style="padding:5px 0;border-top:1px dashed #e3e7eb"><b>'+l.q+'×</b> <bdi>'+esc(l.name)+'</bdi>'+(l.opts&&l.opts.length?'<div style="font-size:.85rem;color:#555;padding-inline-start:1.6em">+ '+l.opts.map(esc).join(', ')+'</div>':'')+(l.note?'<div style="font-size:.85rem;color:#dc2626;font-weight:800;padding-inline-start:1.6em">! <bdi>'+esc(l.note)+'</bdi></div>':'')+'</div>').join('');
    m.innerHTML='<div style="background:#fff;color:#14181c;border-radius:16px;padding:16px 18px;width:min(520px,100%);max-height:90vh;overflow:auto;border-top:8px solid '+(PCOL[q.source]||'#555')+'">'
      +'<div style="display:flex;align-items:center;gap:8px">'+head(q)+'<button data-qclose style="margin-inline-start:8px;border:0;background:#f4f6f8;border-radius:8px;width:36px;height:36px;font-size:1.1rem;cursor:pointer">✕</button></div>'
      +mainLine(q,true)+det(q)
      +(q.customerName||q.address?'<div style="margin-top:8px;padding:8px 10px;background:#f6f7f9;border-radius:10px"><b><bdi>'+esc(q.customerName)+'</bdi></b><div><bdi dir="ltr">'+esc(q.address)+'</bdi></div>'+(q.notes?'<div style="margin-top:4px;color:#92400e">📝 <bdi>'+esc(q.notes)+'</bdi></div>':'')+'</div>':'')
      +'<div style="margin-top:8px">'+lines+'</div>'
      +(q.platformMin&&!q.scheduled?'<div style="font-size:.8rem;color:#666;margin-top:6px">'+tr('qPlat')+': '+q.platformMin+' '+tr('min')+'</div>':'')
      +chips(q)
      +'<button data-qdone="'+esc(q.orderId)+'" style="margin-top:10px;width:100%;min-height:44px;border:0;border-radius:10px;background:#1d2327;color:#fff;font-weight:900;font-size:1rem;cursor:pointer">✓ '+tr('qDone')+'</button></div>';
  }
  document.addEventListener('click',e=>{
    const t=e.target.closest&&e.target;if(!t)return;
    const d=t.closest('[data-qdone]');if(d){markDone(d.dataset.qdone);if(openQ===d.dataset.qdone)openQ=null;drawQuotes();return}
    const o=t.closest('[data-qopen]');if(o){openQ=o.dataset.qopen;drawModal();return}
    if(t.closest('[data-qclose]')){openQ=null;drawModal();return}
    const c=t.closest('[data-qmin]');if(c){promise(c.dataset.qid,Number(c.dataset.qmin));return}
  });
  setInterval(bellBtn,1500);
  // 4) زر التوزيع
  function mount(){
    const h=document.querySelector('header .header-actions');if(!h)return;
    let a=document.getElementById('nara-dispatch-link');
    if(!a){a=document.createElement('a');a.id='nara-dispatch-link';a.href='dispatch.html';a.style.cssText='font-weight:800;color:#e85f12;text-decoration:none;margin-inline:8px';h.appendChild(a)}
    a.textContent=tr('dispatch');
    if(!document.getElementById('nara-connect-link')){const c=document.createElement('a');c.id='nara-connect-link';c.href='connect.html';c.textContent='📱';c.style.cssText='font-size:1.2rem;text-decoration:none;margin-inline:6px';h.appendChild(c)}
    const cl=document.getElementById('nara-connect-link');if(cl)cl.title=tr('connect');
    if(!document.getElementById('nara-platform-status'))drawPlatforms();
  }
  setInterval(mount,1000);mount();
  window.addEventListener('nara-lang',()=>{mount();drawPlatforms();drawQuotes();later()});
  window.NARA_KASSE_HELPERS={cityFor,estimate,employeeField};
})();
