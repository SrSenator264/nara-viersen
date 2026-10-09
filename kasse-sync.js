// kasse-sync.js — السيرفر هو المرجع: دفتر الزبائن والطلبات المفتوحة بتنحفظ عالسيرفر وبتظهر على كل الأجهزة.
// المتصفح (localStorage) بيضل نسخة محلية؛ لو السيرفر مقطوع الشغل مستمر وبيتزامن لما يرجع.
// قفل بين الأجهزة: كل طلب إله رقم نسخة (rev). إذا جهاز تاني عدّل قبلك، السيرفر بيرفض نسختك القديمة
// والكاشير بيحمّل آخر نسخة وبينبّهك. والطلبات اللي انعدّلت على جهاز تاني بتتحدث هون لحالها.
(function(){
  const CK='nara-customers',OK='nara-kasse-orders',HK='nara-customers-hashes',NK='nara-customers-known',BK='nara-customers-baseline';
  const ls=window.localStorage,rawSet=Storage.prototype.setItem;
  const closed=s=>['COMPLETED','CANCELLED','STORNIERT'].includes(String(s||''));
  const jget=(k,d)=>{try{const v=JSON.parse(ls.getItem(k));return v==null?d:v}catch(e){return d}};
  const jset=(k,v)=>{try{rawSet.call(ls,k,JSON.stringify(v))}catch(e){}};
  const hash=o=>{const x=Object.assign({},o);delete x.updatedAt;delete x.rev;return JSON.stringify(x)};
  const T2={de:'Bestellung wurde auf einem anderen Gerät geändert – neueste Version geladen.',ar:'الطلب انعدّل من جهاز تاني — حمّلت آخر نسخة.',en:'Order was changed on another device – latest version loaded.'};
  function note(){const m=document.querySelector('#message');if(m)m.textContent=T2[lang()]||T2.de}
  function replaceLocal(L,id,server){const list=L.getOrders(),i=list.findIndex(x=>String(x.id)===String(id));if(i<0)return false;const keep=list[i];Object.keys(keep).forEach(k=>delete keep[k]);Object.assign(keep,server);pushed[id]=hash(keep);return true}
  const T={de:{on:'Server verbunden',off:'Offline – lokal gespeichert'},ar:{on:'متصل بالسيرفر',off:'ما في اتصال — محفوظ عالجهاز'},en:{on:'Server connected',off:'Offline – saved locally'}};
  const lang=()=>{try{return (window.NARA_LANG&&NARA_LANG.get())||ls.getItem('nara-kasse-language')||'de'}catch(e){return 'de'}};

  // مؤشر الاتصال
  const dot=document.createElement('span');dot.id='nara-sync';dot.className='nara-sync';dot.dataset.state='off';dot.innerHTML='<i></i><span></span>';
  const host=document.querySelector('.header-actions')||document.querySelector('header');if(host)host.prepend(dot);
  function status(ok){dot.dataset.state=ok?'on':'off';dot.querySelector('span').textContent=(T[lang()]||T.de)[ok?'on':'off'];dot.title=dot.querySelector('span').textContent}
  status(false);

  // ───────── الزبائن ─────────
  let custBusy=false,custTimer=0;
  async function syncCustomers(){
    if(custBusy)return;custBusy=true;
    try{
      const local=jget(CK,[]).filter(c=>c&&c.id),hashes=jget(HK,{}),known=new Set(jget(NK,[])),baseline=ls.getItem(BK)==='1',now=new Date().toISOString();
      for(const c of local){const h=hash(c);if(hashes[c.id]!==undefined?hashes[c.id]!==h:baseline&&!c.updatedAt){c.updatedAt=now}}
      const ids=new Set(local.map(c=>c.id)),deleted={};known.forEach(id=>{if(!ids.has(id))deleted[id]=now});
      const r=await fetch('/api/customers/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customers:local,deleted})});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();status(true);
      const merged=d.customers||[],nh={};merged.forEach(c=>{nh[c.id]=hash(c)});
      jset(CK,merged);jset(HK,nh);jset(NK,merged.map(c=>c.id));rawSet.call(ls,BK,'1');
    }catch(e){status(false)}finally{custBusy=false}
  }
  const schedCust=()=>{clearTimeout(custTimer);custTimer=setTimeout(syncCustomers,1500)};

  // ───────── الطلبات المفتوحة ─────────
  const pushed={};let ordBusy=false,ordTimer=0;
  const hasContent=o=>(o.cart&&o.cart.length)||(o.delivery&&(o.delivery.phone||o.delivery.name));
  async function pushOrders(){
    const emp=ls.getItem('nara-cashier-employee-id')||'';
    for(const o of jget(OK,[])){
      if(!o||!o.id||closed(o.status)||!hasContent(o))continue;
      const h=hash(o);if(pushed[o.id]===h)continue;
      try{const r=await fetch('/api/kasse/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'ORDER_SYNC',clientId:(window.NARA_CLIENT_ID||''),employeeId:emp,order:Object.assign({},o,{employeeId:emp}),items:o.cart||[]})});
        const d=await r.json().catch(()=>({}));const L=window.NARA_LEGACY_KASSE_STATE;
        if(r.ok){pushed[o.id]=h;status(true);const lo=L&&L.getOrders().find(x=>String(x.id)===String(o.id));if(lo&&Number.isInteger(d.rev)&&lo.rev!==d.rev){lo.rev=d.rev;L.save()}}
        else if(r.status===409&&d.code==='ORDER_CONFLICT'&&d.order&&L){replaceLocal(L,o.id,d.order);L.save();L.render();note();status(true)}
        else if(r.status===409||r.status===422){pushed[o.id]=h;status(true)}else if(r.status>=500)throw new Error('HTTP '+r.status)}
      catch(e){status(false);return}
    }
  }
  async function pullOrders(){
    const L=window.NARA_LEGACY_KASSE_STATE;if(!L||!L.getOrders)return;
    try{
      const r=await fetch('/api/kasse/open-orders',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();status(true);
      const list=L.getOrders();let changed=false;
      for(const s of d.orders||[]){
        const local=list.find(x=>String(x.id)===String(s.id));
        if(local){
          // انعدّل على جهاز تاني ونحنا ما عدّلنا شي هون من آخر مزامنة: منحدّث نسختنا
          if(Number.isInteger(s.rev)&&s.rev>(Number(local.rev)||0)&&pushed[s.id]===hash(local)&&!closed(local.status)){replaceLocal(L,s.id,s);changed=true}
          continue;
        }
        const plat=String(s.platform||s.source||'NARA').toUpperCase();
        if(!['local','pickup','delivery'].includes(s.type)||/LIEFERANDO|UBER|WOLT|LANCH/.test(plat))continue;
        list.push(s);pushed[s.id]=hash(s);changed=true;
      }
      for(const c of d.closed||[]){const l=list.find(x=>String(x.id)===String(c.id));if(l&&!closed(l.status)){l.status=c.status;changed=true}}
      if(changed){L.save();L.render()}
    }catch(e){status(false)}
  }
  const schedOrd=()=>{clearTimeout(ordTimer);ordTimer=setTimeout(pushOrders,1200)};

  // أي كتابة محلية على المفتاحين بتحرّك المزامنة
  Storage.prototype.setItem=function(k,v){rawSet.call(this,k,v);if(this===ls){if(k===CK)schedCust();else if(k===OK)schedOrd()}};

  function tick(){syncCustomers();pushOrders().then(pullOrders)}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
  window.addEventListener('online',tick);
  setInterval(tick,20000);
  setTimeout(tick,600);
  window.NARA_SYNC={tick,syncCustomers,pushOrders,pullOrders};
})();
