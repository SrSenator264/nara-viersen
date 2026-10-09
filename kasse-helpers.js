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
  const T={de:{ready:'Fertig ca.',in:'in',min:'Min',queue:'vorher in der Küche',dispatch:'🛵 Fahrer',ok:'läuft',login:'Login nötig!',nodata:'keine Daten',down:'Bridge aus!',learn:'Schätzung lernt noch',connect:'Tablet / Handy verbinden',qAccept:'Annehmen mit',qPlat:'Plattform',qAdd:'+{x} Min eintragen',qOk:'Zeit passt',qReady:'fertig',qDrive:'Fahrt',qNoAddr:'Adresse unbekannt',qPickup:'Abholung',qSched:'Geplant für',qCan:'✅ schaffen wir — Start {x}',qCannot:'⚠️ schaffen wir nicht — vorschlagen: {x}',qItems:'Artikel',qQueue:'in der Küche',qDone:'Erledigt',qEnough:'{x} Min reichen',qRaise:'auf {x} Min erhöhen',qReal:'realistisch: {x} Min'},
    ar:{ready:'جاهز تقريباً',in:'بعد',min:'د',queue:'طلب قبلو بالمطبخ',dispatch:'🛵 السواقين',ok:'شغّال',login:'بدّو تسجيل دخول!',nodata:'ما عم يوصل شي',down:'الجسر مسكّر!',learn:'التقدير لسّا عم يتعلّم',connect:'وصّل تابلت / موبايل',qAccept:'اقبل بـ',qPlat:'المنصة',qAdd:'زيد +{x} د',qOk:'الوقت مزبوط',qReady:'جاهز',qDrive:'سواقة',qNoAddr:'العنوان مو معروف',qPickup:'استلام',qSched:'مجدول لـ',qCan:'✅ منلحق — بلّشوا {x}',qCannot:'⚠️ ما منلحق — اقترح: {x}',qItems:'قطعة',qQueue:'بالمطبخ',qDone:'تمام',qEnough:'{x} د بتكفي',qRaise:'زيد لـ {x} د',qReal:'بالحقيقة بيوصل بـ {x} د'},
    en:{ready:'Ready approx.',in:'in',min:'min',queue:'ahead in the kitchen',dispatch:'🛵 Drivers',ok:'running',login:'login needed!',nodata:'no data',down:'bridge off!',learn:'estimate still learning',connect:'Connect tablet / phone',qAccept:'Accept with',qPlat:'Platform',qAdd:'add +{x} min',qOk:'time is fine',qReady:'ready',qDrive:'drive',qNoAddr:'address unknown',qPickup:'Pickup',qSched:'Scheduled for',qCan:'✅ we can make it — start {x}',qCannot:'⚠️ we can\'t make it — suggest: {x}',qItems:'items',qQueue:'in the kitchen',qDone:'Done',qEnough:'{x} min is enough',qRaise:'raise to {x} min',qReal:'realistic: {x} min'}};
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
  function drawQuotes(){
    let box=document.getElementById('nara-quotes');
    if(!box){box=document.createElement('div');box.id='nara-quotes';box.style.cssText='position:fixed;bottom:70px;inset-inline-start:14px;z-index:9000;display:flex;flex-direction:column;gap:8px;max-width:340px';document.body.appendChild(box)}
    const gone=new Set(done()),list=quotes.filter(q=>!gone.has(String(q.orderId)));
    box.innerHTML=list.map(q=>{
      const c=PCOL[q.source]||'#555';
      const head='<div style="display:flex;align-items:center;gap:6px"><b dir="ltr" style="font-size:1.05rem">'+esc(q.code)+'</b><span style="background:'+c+';color:#fff;border-radius:5px;padding:1px 6px;font-size:.72rem;font-weight:800">'+esc(String(q.source).replace('_',' '))+'</span><span style="margin-inline-start:auto;font-size:.8rem;color:#666">'+q.items+' '+tr('qItems')+'</span></div>';
      const det='<div style="font-size:.82rem;color:#444;margin-top:3px">'+[q.scheduled?'':tr('qReady')+' '+hm(q.readyAt),q.type==='pickup'?tr('qPickup'):(q.distanceKnown?tr('qDrive')+' '+q.driveMin+' '+tr('min')+' · <bdi dir="ltr">'+q.km+' km</bdi>':tr('qNoAddr')),q.queue&&!q.scheduled?q.queue+' '+tr('qQueue'):''].filter(Boolean).join(' · ')+'</div>';
      let main;
      if(q.scheduled){
        main='<div style="margin-top:4px;font-weight:800">'+tr('qSched')+' '+hm(q.requestedAt)+'</div><div style="font-weight:900;font-size:1.05rem;color:'+(q.feasible?'#16a34a':'#dc2626')+'">'+(q.feasible?fill('qCan',hm(q.startAt)):fill('qCannot',hm(q.suggestedAt)))+'</div>';
      }else{
        // الوقت الثابت (60 د) بيكفي؟ إذا لأ: زيد. ومنعرض كمان قديش فينا نكون أسرع.
        const enough=!(q.addMin>0);
        main='<div style="margin-top:4px;font-size:1.4rem;font-weight:900;color:'+(enough?'#16a34a':'#dc2626')+'">'+(enough?'✅ '+fill('qEnough',q.platformMin):'⚠️ '+fill('qRaise',q.setMin))+'</div>'
          +'<div style="font-size:.85rem;font-weight:700;color:#444">'+fill('qReal',q.recommendMin)+'</div>';
      }
      return '<div style="background:#fff;color:#14181c;border-radius:12px;padding:10px 12px;box-shadow:0 6px 24px #0004;border-inline-start:6px solid '+c+'">'+head+main+det
        +'<button data-qdone="'+esc(q.orderId)+'" style="margin-top:6px;width:100%;min-height:36px;border:0;border-radius:8px;background:#1d2327;color:#fff;font-weight:800;cursor:pointer">✓ '+tr('qDone')+'</button></div>';
    }).join('');
  }
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-qdone]');if(b){markDone(b.dataset.qdone);drawQuotes()}});
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
