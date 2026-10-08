// kasse-phone-lookup.js — لما الكاشير يكتب رقم الهاتف بطلب توصيل، بتظهر اقتراحات من دفتر الزبائن (nara-customers)؛ بلمسة بتتعبّى البيانات.
// وبعد "Küche" أو الدفع بيتحدّث دفتر الزبائن تلقائياً (بدون ما تضغط حفظ).
// ملاحظة: الدفتر لسا محفوظ بمتصفح هالجهاز (localStorage)، ونقله للسيرفر خطوة قادمة.
(function(){
  const K='nara-customers',$=s=>document.querySelector(s);
  const load=()=>{try{const a=JSON.parse(localStorage.getItem(K)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}};
  const save=a=>{try{localStorage.setItem(K,JSON.stringify(a));return true}catch(e){return false}};
  const digits=s=>String(s||'').replace(/\D/g,'').replace(/^(0049|49)/,'0');
  const FIELDS={name:'customer-name',phone:'customer-phone',street:'street',house:'house-number',postal:'postal-code',city:'city',floor:'floor',bell:'bell-name',extra:'address-extra',notes:'driver-notes'};
  const T={de:{use:'Übernehmen',none:''},ar:{use:'استخدم',none:''},en:{use:'Use',none:''}};
  const lang=()=>{try{return localStorage.getItem('nara-kasse-language')||'de'}catch(e){return 'de'}};
  const phone=$('#customer-phone');if(!phone)return;
  const label=phone.closest('label');
  const box=document.createElement('div');box.id='phone-suggest';box.className='phone-suggest wide';box.hidden=true;
  (label&&label.parentElement?label.parentElement:phone.parentElement).insertBefore(box,label?label.nextSibling:null);
  const line=c=>[c.name||'—',[[c.street,c.house].filter(Boolean).join(' '),[c.postal,c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  function matches(){const d=digits(phone.value);if(d.length<4)return[];
    return load().filter(c=>digits(c.phone).includes(d)).sort((a,b)=>(digits(b.phone)===d)-(digits(a.phone)===d)||(b.lastOrderAt||'').localeCompare(a.lastOrderAt||'')).slice(0,3)}
  function show(){const m=matches();box.innerHTML='';if(!m.length){box.hidden=true;return}
    m.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='ps-item';b.innerHTML='<span class="ps-phone"></span><span class="ps-line"></span><span class="ps-use"></span>';
      b.querySelector('.ps-phone').textContent=c.phone||'';b.querySelector('.ps-line').textContent=line(c);b.querySelector('.ps-use').textContent=(T[lang()]||T.de).use;
      b.addEventListener('click',()=>apply(c));box.appendChild(b)});box.hidden=false}
  function apply(c){Object.entries(FIELDS).forEach(([k,id])=>{const el=document.getElementById(id);if(!el||c[k]===undefined)return;el.value=c[k];el.dispatchEvent(new Event('input',{bubbles:true}))});box.hidden=true}
  phone.addEventListener('input',show);phone.addEventListener('focus',show);
  document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==phone)box.hidden=true});

  // تحديث دفتر الزبائن عند الإرسال للمطبخ أو الدفع
  function remember(){
    const L=window.NARA_LEGACY_KASSE_STATE,o=L&&L.getCurrent&&L.getCurrent();if(!o||o.type!=='delivery')return;
    const d=o.delivery||{},pd=digits(d.phone);if(pd.length<6||!(d.name||d.street))return;
    const a=load();let c=a.find(x=>digits(x.phone)===pd);const now=new Date().toISOString();
    if(!c){c={id:'customer-'+Date.now(),orderCount:0};a.push(c)}
    Object.keys(FIELDS).forEach(k=>{if(d[k])c[k]=d[k]});
    if(c.lastOrderId!==o.id){c.orderCount=(c.orderCount||0)+1;c.lastOrderId=o.id}
    c.lastOrderAt=now;c.updatedAt=now;save(a);
  }
  ['#kitchen','#cash','#card'].forEach(sel=>{const b=$(sel);if(b)b.addEventListener('click',remember,true)});
})();
