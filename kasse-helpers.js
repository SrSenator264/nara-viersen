// kasse-helpers.js — مساعدات صغيرة للكاشير:
// 1) المدينة بتنكتب لحالها من الرمز البريدي (إذا الخانة فاضية أو كانت معبّاية تلقائياً).
// 2) وقت الجهوزية المتوقع وأنت عم تاخد الطلب (من تعلّم المطبخ + الطابور): "جاهز تقريباً 18:42".
// 3) بعد تسجيل الدخول، خانة "Mitarbeiter · Name / PIN" ما إلها داعي: الطلب بيتسجّل باسم اللي داخل.
// 4) زر "🛵 التوزيع" بالرأس بيفتح شاشة السواقين.
// 5) لمبة Lieferando بالرأس: 🟢 شغّال، 🟠 لازم تسجيل دخول / ما في طلبات عم توصل، 🔴 الجسر مسكّر.
(function(){
  const $=s=>document.querySelector(s);
  const lang=()=>{try{return localStorage.getItem('nara-kasse-language')||document.documentElement.lang||'de'}catch(e){return 'de'}};
  const T={de:{ready:'Fertig ca.',in:'in',min:'Min',queue:'vorher in der Küche',dispatch:'🛵 Fahrer',ok:'läuft',login:'Login nötig!',nodata:'keine Daten',down:'Bridge aus!',learn:'Schätzung lernt noch'},
    ar:{ready:'جاهز تقريباً',in:'بعد',min:'د',queue:'طلب قبله بالمطبخ',dispatch:'🛵 التوزيع',ok:'شغّال',login:'لازم تسجيل دخول!',nodata:'ما عم يوصل شي',down:'الجسر مسكّر!',learn:'التقدير لسا عم يتعلّم'},
    en:{ready:'Ready approx.',in:'in',min:'min',queue:'ahead in the kitchen',dispatch:'🛵 Drivers',ok:'running',login:'login needed!',nodata:'no data',down:'bridge off!',learn:'estimate still learning'}};
  const tr=k=>(T[lang()]||T.de)[k];
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
    try{const r=await fetch('/api/platform-orders/status',{cache:'no-store'});if(r.ok){const j=await r.json();platforms=j.platforms||[]}}catch(e){}
    drawPlatforms();
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
  setInterval(pollPlatforms,30000);setTimeout(pollPlatforms,1500);
  // 4) زر التوزيع
  function mount(){
    const h=document.querySelector('header .header-actions');if(!h)return;
    let a=document.getElementById('nara-dispatch-link');
    if(!a){a=document.createElement('a');a.id='nara-dispatch-link';a.href='dispatch.html';a.style.cssText='font-weight:800;color:#e85f12;text-decoration:none;margin-inline:8px';h.appendChild(a)}
    a.textContent=tr('dispatch');
    if(!document.getElementById('nara-platform-status'))drawPlatforms();
  }
  setInterval(mount,1000);mount();
  window.NARA_KASSE_HELPERS={cityFor,estimate,employeeField};
})();
