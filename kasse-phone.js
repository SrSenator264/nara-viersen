// kasse-phone.js — الكاشير على التلفون.
// - html.km (عرض ≤ 640px، بينحط بـkasse.html): الوضع الجديد «طلب سريع بإيد وحدة» — شكل kasse-mobile.css.
//   الأقسام تحت للإبهام، كروت أصناف كبار، شريط سفلي «🛒 عدد · مجموع | 💶 كاش | 💳 كرت»، الدفع بـكبستين.
// - kasse.html?m=0: الشكل القديم (legacy() تحت، نفس الكود اللي كان، مع kasse-phone.css).
// - 🔗 / 📱: «لحالو» = الطلبات المفتوحة الجديدة من هالجهاز ما بتنبعت للسيرفر لحد الدفع أو المطبخ.
// ما بيغيّر أي منطق طلبات/دفع/ضرايب: كل الأزرار بتكبس على نفس الأزرار الموجودة (#cash, #card, #cod-btn…).
(function(){
  'use strict';
  const LS=window.localStorage;
  const lang=()=>{try{const l=(window.NARA_LANG&&NARA_LANG.get())||LS.getItem('nara-kasse-language')||document.documentElement.lang||'de';return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
  const ST=()=>window.NARA_LEGACY_KASSE_STATE;
  const CLOSED=new Set(['COMPLETED','CANCELLED','STORNIERT']);

  // ───────── 🔗 / 📱: طلبات هالجهاز لحالها ─────────
  // بيشتغل بالمتصفح بس. قائمة أرقام الطلبات «لحالها» محفوظة عالجهاز (flamo-device-only-ids):
  // - المزامنة التلقائية (kasse-sync.js) لهالطلبات بتتوقّف (جواب 404 وهمي: ما بتنعلّم «انبعتت»، فبتنبعت لحالها لما ترجع 🔗).
  // - الطلب الجديد الفاضي (kasse.js) ما بينبعت وهو على 📱.
  // - الدفع والمطبخ والإلغاء (kasse-domain.js، الطباعة) بيمرقوا دايماً، والطلب بيطلع من القائمة لأنو صار عالسيرفر.
  const DK='flamo-device-only',IK='flamo-device-only-ids';
  const devOnly=()=>{try{return LS.getItem(DK)==='1'}catch(e){return false}};
  const ids=()=>{try{const a=JSON.parse(LS.getItem(IK)||'[]');return new Set(Array.isArray(a)?a.map(String):[])}catch(e){return new Set()}};
  const saveIds=s=>{try{if(s.size)LS.setItem(IK,JSON.stringify([...s]));else LS.removeItem(IK)}catch(e){}};
  const addId=id=>{if(id==null)return;const s=ids();if(!s.has(String(id))){s.add(String(id));saveIds(s)}};
  const dropId=id=>{const s=ids();if(s.delete(String(id)))saveIds(s)};
  // لما ينشغّل 📱: الطلبات المفتوحة اللي السيرفر ما بيعرفها (بلا rev) أو اللي لسا فاضية بتصير «لحالها»
  function markOwn(){const L=ST();if(!L||!L.getOrders)return;const s=ids();L.getOrders().forEach(o=>{if(o&&o.id!=null&&!CLOSED.has(String(o.status||''))&&(!Number.isInteger(o.rev)||!(o.cart||[]).length))s.add(String(o.id))});saveIds(s)}
  function setDevOnly(on){
    try{if(on)LS.setItem(DK,'1');else LS.removeItem(DK)}catch(e){}
    if(on)markOwn();else{saveIds(new Set());if(window.NARA_SYNC)NARA_SYNC.pushOrders()}
  }
  (function guard(){
    const real=window.fetch;if(typeof real!=='function')return;
    const skip=()=>Promise.resolve(new Response('{}',{status:404,headers:{'content-type':'application/json'}}));
    window.fetch=function(input,init){
      try{
        const url=typeof input==='string'?input:(input&&input.url)||'';
        if(url.indexOf('/api/kasse/events')>=0&&init&&typeof init.body==='string'){
          const mine=ids();
          if(devOnly()||mine.size){
            const b=JSON.parse(init.body),o=b&&b.order,id=o&&o.id!=null?String(o.id):'';
            if(b&&b.action==='ORDER_SYNC'&&o){
              const st=String(new Error().stack||'');
              if(/\/kasse-sync\.js[?:]/.test(st)&&mine.has(id))return skip();            // مزامنة تلقائية لطلب «لحالو»
              if(/\/kasse\.js[?:]/.test(st)&&devOnly()&&!(o.cart||[]).length){addId(id);return skip()} // طلب جديد فاضي
            }
            if(id&&mine.has(id)){
              // طريق مسموح (دفع، مطبخ، إلغاء): الطلب بيطلع من «لحالو» لأنو صار عالسيرفر
              dropId(id);
              // مطبخ/طباعة بلا ORDER_SYNC قبلها (kasse-print-lifecycle بيعتمد عالمزامنة): منبعت الطلب أول، بعدين العملية
              if(b.action!=='ORDER_SYNC'&&window.NARA_SYNC&&NARA_SYNC.pushOrders){const self=this,args=arguments;return Promise.resolve().then(()=>NARA_SYNC.pushOrders()).catch(()=>{}).then(()=>real.apply(self,args))}
            }
          }
        }
      }catch(e){}
      return real.apply(this,arguments);
    };
    // طلبات جديدة وهو على «📱»: بتنضاف للقائمة
    const hook=()=>{const L=ST();if(!L||!L.newOrder)return false;if(L.newOrder.__km)return true;const nO=L.newOrder;L.newOrder=function(){const n=nO.apply(this,arguments);if(devOnly()&&n)addId(n.id);return n};L.newOrder.__km=1;if(devOnly())markOwn();return true};
    if(!hook()){const h=setInterval(()=>{if(hook())clearInterval(h)},100);setTimeout(()=>clearInterval(h),8000)}
  })();
  window.FLAMO_DEVICE_ONLY={get:devOnly,set:setDevOnly,ids:()=>[...ids()]};

  if(document.documentElement.classList.contains('km'))mobile();else legacy();

  // ───────── الوضع الجديد ─────────
  function mobile(){
    const $=s=>document.querySelector(s);
    const cart=$('#cart'),total=$('#total'),panel=$('.cart-panel'),cats=$('#categories'),prods=$('#products'),strip=$('.order-strip'),types=strip&&strip.querySelector('.order-types');
    if(!cart||!total||!panel||!cats||!prods||!strip||!types)return;
    const T={
      de:{cart:'Warenkorb',cash:'💶 Bar',card:'💳 Karte',cod:'🛵 An Küche',back:'⌄ Zurück zum Menü',newOrder:'Neuer Auftrag',table:'Tisch',more:'⋯ Mehr (Rabatt, Teilen)',less:'⌃ Weniger',allCats:'Alle Kategorien',close:'Schließen',lang:'Sprache',mode:'Diese Bestellungen',linked:'🔗 Mit dem Laden verbunden',linkedTxt:'Offene Bestellungen von diesem Handy erscheinen auch an der Kasse im Laden.',alone:'📱 Nur auf diesem Handy',aloneTxt:'Offene Bestellungen bleiben nur hier. Nach dem Bezahlen (oder „An Küche“) gehen sie normal an den Server. Handy weg = offene Bestellungen weg.',classic:'🖥️ Alte Ansicht',classicTxt:'Zur bisherigen Handy-Ansicht wechseln (zurück: Seite neu öffnen).',openOrders:'Offene Bestellungen',search:'Suchen'},
      ar:{cart:'السلة',cash:'💶 كاش',card:'💳 كرت',cod:'🛵 للمطبخ',back:'⌄ رجوع للمنيو',newOrder:'طلب جديد',table:'طاولة',more:'⋯ أكتر (خصم، تقسيم)',less:'⌃ أقل',allCats:'كل الأقسام',close:'سكّر',lang:'اللغة',mode:'طلبات هالتلفون',linked:'🔗 مربوط بالمحل',linkedTxt:'الطلبات المفتوحة من هالتلفون بتطلع كمان عند الكاشير بالمحل.',alone:'📱 لحالو',aloneTxt:'الطلبات المفتوحة بتضل عالتلفون بس. بعد الدفع (أو «للمطبخ») بتروح للسيرفر عادي. إذا ضاع التلفون، الطلبات المفتوحة بتروح.',classic:'🖥️ الشكل القديم',classicTxt:'ارجع لشكل التلفون القديم (لترجع للجديد: افتح الصفحة من جديد).',openOrders:'الطلبات المفتوحة',search:'دوّر'},
      en:{cart:'Cart',cash:'💶 Cash',card:'💳 Card',cod:'🛵 To kitchen',back:'⌄ Back to menu',newOrder:'New order',table:'Table',more:'⋯ More (discount, split)',less:'⌃ Less',allCats:'All categories',close:'Close',lang:'Language',mode:'This phone’s orders',linked:'🔗 Linked to the shop',linkedTxt:'Open orders from this phone also show at the shop cashier.',alone:'📱 This phone only',aloneTxt:'Open orders stay on this phone only. After payment (or “To kitchen”) they go to the server as usual. Phone lost = open orders lost.',classic:'🖥️ Old view',classicTxt:'Switch to the previous phone view (back: reopen the page).',openOrders:'Open orders',search:'Search'}};
    const tr=k=>(T[lang()]||T.de)[k]||T.de[k];
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const euro=c=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format((+c||0)/100);
    const body=document.body;
    document.querySelectorAll('#phone-cart-bar,#phone-strip-toggle').forEach(e=>e.remove());

    // 1) سطر تحت نوع الطلب: ملخّص ▾ · 📋 · 🔗/📱 · ⋯
    const row=document.createElement('div');row.id='km-row';
    row.innerHTML='<button type="button" id="km-details"><span class="km-sum"></span><span class="km-arr">⌄</span></button><button type="button" id="km-oo" data-n="0">📋<b>0</b></button><button type="button" id="km-mode"><span></span><i></i></button><button type="button" id="km-more" aria-label="more">⋯</button>';
    types.after(row);
    const sum=row.querySelector('.km-sum'),ooBtn=row.querySelector('#km-oo'),modeBtn=row.querySelector('#km-mode');
    ooBtn.setAttribute('aria-label',tr('openOrders'));
    const selTxt=id=>{const s=$(id);return s&&s.selectedOptions&&s.selectedOptions[0]?s.selectedOptions[0].textContent.trim():''};
    function summary(){const tp=$('.table-picker'),parts=[];if(tp&&!tp.hidden){const x=selTxt('#table-number');if(x)parts.push(x)}const o=selTxt('#open-order');parts.push(o||tr('newOrder'));const v=parts.join(' · ');if(sum.textContent!==v)sum.textContent=v}
    row.querySelector('#km-details').onclick=()=>body.classList.toggle('km-details-open');
    ooBtn.onclick=()=>{const t=$('#oo-tab');if(t&&!t.hidden)t.click()};
    function ooSync(){const t=$('#oo-tab'),b=t&&t.querySelector('.oo-badge'),n=t&&!t.hidden&&b?parseInt(b.textContent,10)||0:0;ooBtn.dataset.n=String(n);ooBtn.querySelector('b').textContent=String(n)}
    function modeSync(){const d=devOnly();modeBtn.dataset.mode=d?'dev':'linked';modeBtn.querySelector('span').textContent=d?'📱':'🔗';const s=$('#nara-sync');modeBtn.dataset.sync=s?s.dataset.state||'off':'off';modeBtn.title=d?tr('alone'):tr('linked')}
    strip.addEventListener('change',summary);
    new MutationObserver(summary).observe(strip,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});

    // 2) شريط الأقسام تحت: ▦ كل الأقسام · 🔍 · الأقسام (نفس #categories، بس منقول)
    const catbar=document.createElement('div');catbar.id='km-catbar';
    catbar.innerHTML='<button type="button" id="km-all" aria-label="'+esc(tr('allCats'))+'">▦</button><button type="button" id="km-find" aria-label="'+esc(tr('search'))+'">🔍</button>';
    catbar.appendChild(cats);body.appendChild(catbar);
    const search=$('#menu-search');
    catbar.querySelector('#km-find').onclick=()=>{const on=!body.classList.contains('km-search');body.classList.toggle('km-search',on);if(search){if(on)search.focus();else if(search.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}))}}};
    function catScroll(){const s=cats.querySelector('.category.selected');if(s)s.scrollIntoView({block:'nearest',inline:'center'})}
    cats.addEventListener('click',e=>{if(e.target.closest('[data-category]')){prods.scrollTop=0}});

    // لوحة كل الأقسام
    const sheet=(id)=>{const s=document.createElement('div');s.id=id;s.className='km-sheet';s.hidden=true;s.addEventListener('click',e=>{if(e.target===s||e.target.closest('.km-x'))s.hidden=true});body.appendChild(s);return s};
    const catSheet=sheet('km-cats');
    catbar.querySelector('#km-all').onclick=()=>{
      const list=[...cats.querySelectorAll('.category')];
      catSheet.innerHTML='<div class="km-panel"><h3>'+esc(tr('allCats'))+'</h3><div class="km-catgrid">'+list.map(b=>'<button type="button" data-kc="'+esc(b.dataset.category)+'" class="'+(b.classList.contains('selected')?'on':'')+'" style="--c:'+esc(getComputedStyle(b).getPropertyValue('--c')||'#999')+'">'+esc(b.textContent)+'</button>').join('')+'</div><button type="button" class="km-x">'+esc(tr('close'))+'</button></div>';
      catSheet.hidden=false;
    };
    catSheet.addEventListener('click',e=>{const b=e.target.closest('[data-kc]');if(!b)return;const t=[...cats.querySelectorAll('.category')].find(x=>x.dataset.category===b.dataset.kc);if(t)t.click();catSheet.hidden=true;prods.scrollTop=0;body.classList.remove('km-search')});

    // 3) لوحة ⋯: اللغة · 🔗/📱 · الشكل القديم
    const more=sheet('km-sheet');
    function openMore(){
      const d=devOnly(),l=lang();
      more.innerHTML='<div class="km-panel"><h3>'+esc(tr('lang'))+'</h3><div class="km-langs">'+[['de','Deutsch'],['ar','العربية'],['en','English']].map(([k,n])=>'<button type="button" class="km-opt'+(k===l?' on':'')+'" data-kl="'+k+'"><b>'+n+'</b></button>').join('')+'</div>'
        +'<h3>'+esc(tr('mode'))+'</h3><button type="button" class="km-opt'+(d?'':' on')+'" data-dev="0"><b>'+esc(tr('linked'))+'</b><span>'+esc(tr('linkedTxt'))+'</span></button><button type="button" class="km-opt'+(d?' on':'')+'" data-dev="1"><b>'+esc(tr('alone'))+'</b><span>'+esc(tr('aloneTxt'))+'</span></button>'
        +'<button type="button" class="km-opt" data-classic="1"><b>'+esc(tr('classic'))+'</b><span>'+esc(tr('classicTxt'))+'</span></button><button type="button" class="km-x">'+esc(tr('close'))+'</button></div>';
      more.hidden=false;
    }
    row.querySelector('#km-more').onclick=openMore;modeBtn.onclick=openMore;
    more.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.kl){const x=document.querySelector('header [data-lang="'+b.dataset.kl+'"]');if(x)x.click();return}
      if(b.dataset.dev){setDevOnly(b.dataset.dev==='1');modeSync();openMore();return}
      if(b.dataset.classic){const u=new URL(location.href);u.searchParams.set('m','0');location.href=u.pathname+u.search+u.hash}
    });

    // 4) شارة العدد على كروت الأصناف (كم قطعة منو بالسلة) + ومضة عند الكبس
    const pidOf=it=>String(it.id||'').replace(/-\d+$/,'');
    function badges(){
      const L=ST(),o=L&&L.getCurrent&&L.getCurrent(),n={};
      ((o&&o.cart)||[]).forEach(it=>{if(it.kind)return;const k=pidOf(it);n[k]=(n[k]||0)+(Number(it.quantity)||0)});
      prods.querySelectorAll('.product[data-product]').forEach(c=>{const q=n[c.dataset.product]||0;let i=c.querySelector('.km-q');c.classList.toggle('km-in',q>0);if(!q){if(i)i.remove();return}if(!i){i=document.createElement('i');i.className='km-q';c.appendChild(i)}if(i.textContent!==String(q))i.textContent=String(q)});
    }
    prods.addEventListener('click',e=>{const c=e.target.closest('.product');if(!c)return;c.classList.add('km-hit');setTimeout(()=>c.classList.remove('km-hit'),160);if(navigator.vibrate)try{navigator.vibrate(12)}catch(x){}},true);

    // ضغطة وحدة: صنف ما فيه شي ينقّى (بس «لحالو» منقّى لحالو) بينضاف بلا نافذة — بنفس الخيار اللي النافذة كانت بتحطو.
    // المنيو بعدين بزر «🍟 زيد منيو» بالسلة. أي صنف فيه خيارات أو لحالو/منيو أصلي (menuCents) بيفتح النافذة متل قبل.
    const PD=window.NARA_PRODUCT_DIALOG,K=window.NARA_KASSE_PRODUCT;
    if(PD&&PD.open&&K&&K.groups&&K.add&&!PD.open.__km){
      const realOpen=PD.open;
      PD.open=function(p,old,index){
        try{
          const mOK=!!(window.NARA_MENU_OK&&NARA_MENU_OK(p)),cond=(p&&p.conditionalGroups)||{};
          // اللي لازم ينقّى فعلاً: مجموعات إجبارية ظاهرة (المشروب/الصوص بيظهروا بس بالمنيو، والشرطية بس بعد اختيار)
          const must=p?(K.groups(p)||[]).filter(g=>g.required&&(g.options||[]).length>1&&!(mOK&&(g.group==='__drink'||g.group==='__sauce'))&&!cond[g.group]):[1];
          if(p&&old==null&&!(index>=0)&&!must.length&&!Number(p.menuCents)){
            const opts=mOK?[{id:'__single',name:'Einzel / بدون منيو',cents:0,group:'__order',quantity:1}]:[];
            // إجباري بخيار واحد: النافذة كانت بتنقّيه لحالها — منحطّو متلها
            (K.groups(p)||[]).forEach(g=>{if(!g.required||(g.options||[]).length!==1||cond[g.group]||(mOK&&(g.group==='__drink'||g.group==='__sauce')))return;const o=g.options[0],id=o.id||o.name,dip=g.group==='Dips'&&!/^(ohne|no)\b/i.test(o.name)&&id!=='no-dip';opts.push({id,name:(dip?'Dip: ':'')+o.name,cents:+o.cents||0,group:g.group,quantity:1})});
            return K.add(p,opts,-1,'');
          }
        }catch(e){}
        return realOpen.apply(this,arguments);
      };
      PD.open.__km=1;
    }

    // 5) شريط السلة: 🛒 عدد · مجموع | 💶 | 💳  (توصيل قبل الدفع: 🛵 للمطبخ)
    const bar=document.createElement('div');bar.id='km-bar';
    bar.innerHTML='<button type="button" class="km-cart"><span class="km-n">0</span><b class="km-tot">0,00 €</b></button><button type="button" class="km-cash"></button><button type="button" class="km-card"></button><button type="button" class="km-cod" hidden></button>';
    body.appendChild(bar);
    const bCash=bar.querySelector('.km-cash'),bCard=bar.querySelector('.km-card'),bCod=bar.querySelector('.km-cod'),bN=bar.querySelector('.km-n'),bTot=bar.querySelector('.km-tot');
    bCash.textContent=tr('cash');bCard.textContent=tr('card');bCod.textContent=tr('cod');bar.querySelector('.km-cart').setAttribute('aria-label',tr('cart'));
    const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.id='km-close';closeBtn.textContent=tr('back');panel.prepend(closeBtn);
    const openCart=()=>{body.classList.add('km-cart-open');panel.scrollTop=0},closeCart=()=>body.classList.remove('km-cart-open');
    bar.querySelector('.km-cart').onclick=openCart;closeBtn.onclick=closeCart;
    const fire=sel=>{const b=$(sel);if(b&&!b.disabled)b.click()};
    bCash.onclick=()=>fire('#cash');bCard.onclick=()=>fire('#card');bCod.onclick=()=>fire('#cod-btn');
    let lastTot='';
    function barSync(){
      const L=ST(),o=L&&L.getCurrent&&L.getCurrent(),items=((o&&o.cart)||[]);
      const n=items.reduce((s,it)=>s+(it.kind==='DELIVERY_FEE'?0:(Number(it.quantity)||0)),0);
      bN.textContent=String(n);bar.dataset.empty=n?'0':'1';
      const t=total.textContent.trim();if(bTot.textContent!==t)bTot.textContent=t;
      if(lastTot&&t!==lastTot){bar.classList.remove('bump');void bar.offsetWidth;bar.classList.add('bump')}lastTot=t;
      const cod=!!$('#cod-btn'),c=$('#cash'),hiddenPay=c&&c.style.display==='none';
      bCod.hidden=!cod;bCash.hidden=cod||hiddenPay;bCard.hidden=cod||hiddenPay;
      bCash.disabled=bCard.disabled=bCod.disabled=!n;
    }
    function all(){barSync();badges();summary();ooSync();modeSync()}
    new MutationObserver(()=>{barSync();badges()}).observe(cart,{childList:true,subtree:true,characterData:true});
    new MutationObserver(barSync).observe(total,{childList:true,subtree:true,characterData:true});
    new MutationObserver(badges).observe(prods,{childList:true});
    new MutationObserver(catScroll).observe(cats,{childList:true});
    const pa=$('.pay-actions');if(pa)new MutationObserver(barSync).observe(pa,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
    setInterval(()=>{ooSync();modeSync()},1500);

    // 6) شاشة الدفع: «⋯ أكتر» بيفتح الخصم والتقسيم (بس عرض)
    function decoratePay(d){
      if(!d.querySelector('.km-more-btn')){
        const b=document.createElement('button');b.type='button';b.className='km-more-btn';
        b.textContent=d.classList.contains('km-more')?tr('less'):tr('more');
        b.onclick=()=>{d.classList.toggle('km-more');b.textContent=d.classList.contains('km-more')?tr('less'):tr('more')};
        const pay=d.querySelector('.np-pay');if(pay)pay.after(b);else d.appendChild(b);
      }
      // خصم أو تقسيم شغّال (أو دفعة جزئية): منفرجيه دايماً
      if(!d.classList.contains('km-more')&&(d.querySelector('.np-parts')||d.querySelector('.np-row[disabled]')&&d.querySelector('.np-disc'))){d.classList.add('km-more');const b=d.querySelector('.km-more-btn');if(b)b.textContent=tr('less')}
    }
    new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.id==='np-dialog'){closeCart();decoratePay(n);new MutationObserver(()=>decoratePay(n)).observe(n,{childList:true})}}}).observe(body,{childList:true});

    // 7) سلوك صغير: بعد ما يخلص الدفع أو يتبدّل الطلب، منسكّر السلة
    document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!more.hidden)more.hidden=true;else if(!catSheet.hidden)catSheet.hidden=true;else closeCart()});
    document.addEventListener('click',e=>{if(e.target.closest('[data-order-type]'))setTimeout(all,0)},true);
    window.addEventListener('pageshow',all);
    all();setTimeout(all,600);setTimeout(()=>{all();catScroll()},1800);
  }

  // ───────── الشكل القديم (?m=0) — كما كان ─────────
  function legacy(){
  const cart=document.querySelector('#cart'),total=document.querySelector('#total'),panel=document.querySelector('.cart-panel');
  if(!cart||!total||!panel)return;
  const L={de:'Warenkorb',ar:'السلة',en:'Cart'};

  const bar=document.createElement('button');bar.id='phone-cart-bar';bar.type='button';
  bar.innerHTML='<span class="pcb-count"><span class="pcb-badge">0</span><span class="pcb-label"></span></span><span class="pcb-total"></span>';
  document.body.appendChild(bar);
  const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.className='pcb-close';closeBtn.textContent='⌄';closeBtn.setAttribute('aria-label','close');
  panel.prepend(closeBtn);

  const badge=bar.querySelector('.pcb-badge'),label=bar.querySelector('.pcb-label'),tot=bar.querySelector('.pcb-total');
  let lastTotal='';
  function count(){
    const items=[...cart.querySelectorAll('.cart-item:not(.fee-line)')];
    return items.reduce((n,it)=>{const b=it.querySelector('.cart-controls b');const q=b?parseInt(b.textContent,10):1;return n+(q>0?q:1)},0);
  }
  function sync(){
    const n=count();badge.textContent=String(n);bar.dataset.empty=n?'0':'1';
    label.textContent=L[lang()]||L.de;
    const t=total.textContent.trim();tot.textContent=t;
    if(t!==lastTotal&&lastTotal!==''){bar.classList.remove('bump');void bar.offsetWidth;bar.classList.add('bump')}
    lastTotal=t;
  }
  // معلومات الطلب المطوية: سطر ملخّص (طاولة · طلب مفتوح) بينفتح/بينطوي
  const strip=document.querySelector('.order-strip'),types=strip&&strip.querySelector('.order-types');
  if(strip&&types){
    const tg=document.createElement('button');tg.id='phone-strip-toggle';tg.type='button';
    tg.innerHTML='<span class="pst-sum"></span><span class="pst-arrow">⌄</span>';
    types.after(tg);
    const sum=tg.querySelector('.pst-sum');
    const selTxt=id=>{const s=document.querySelector(id);return s&&s.selectedOptions&&s.selectedOptions[0]?s.selectedOptions[0].textContent.trim():''};
    const upd=()=>{
      const t=document.querySelector('.table-picker');
      const parts=[];
      if(t&&!t.hidden){const x=selTxt('#table-number');if(x)parts.push(x)}
      const o=selTxt('#open-order');if(o)parts.push(o);
      const v=parts.join(' · ')||'⋯';if(sum.textContent!==v)sum.textContent=v;
    };
    tg.addEventListener('click',()=>document.body.classList.toggle('phone-strip-open'));
    strip.addEventListener('change',upd);
    new MutationObserver(upd).observe(strip,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','selected']});
    upd();setTimeout(upd,1500);
  }
  const open=()=>document.body.classList.add('phone-cart-open');
  const close=()=>document.body.classList.remove('phone-cart-open');
  bar.addEventListener('click',open);
  closeBtn.addEventListener('click',close);
  document.addEventListener('click',e=>{
    if(!document.body.classList.contains('phone-cart-open'))return;
    if(e.target===document.body||e.target===document.documentElement)close();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  new MutationObserver(sync).observe(cart,{childList:true,subtree:true,characterData:true});
  new MutationObserver(sync).observe(total,{childList:true,subtree:true,characterData:true});
  document.addEventListener('nara-lang-change',sync);
  sync();
  }
})();
