// kasse-product-dialog.js — نافذة الصنف الجديدة بالكاشير (بدل القائمة الطويلة).
// - فوق ثابت: اسم الصنف + السعر. زرين كبار: لحالو / منيو.
// - المشروب والصوص: مربعات كبار (كبسة وحدة). الإجباري لازم ينقّى قبل الزيادة.
// - الديبس والإضافات: مسكّرين، بينفتحوا بكبسة. كل كبسة بتزيد قطعة، والـ − بتنقّص.
// - ملاحظة سريعة بأزرار (ohne Zwiebeln…) + كتابة حرة.
// - تحت ثابت: الكمية − 1 + وزر "زيد عالطلب · السعر" (بيتحدّث مع كل اختيار).
// بتستعمل نفس منطق الكاشير: groups(p) و add(p, options, index, note) من kasse.js.
(function(){
  'use strict';
  const T={
    de:{single:'Einzeln',menu:'Als Menü',add:'Hinzufügen',save:'Änderung speichern',required:'Pflicht',pick:'Bitte wählen: {x}',more:'anzeigen',less:'ausblenden',note:'Notiz',notePh:'Notiz für die Küche …',qty:'Menge',incl:'inkl.',close:'Schließen',
      groups:{__drink:'Getränk',__sauce:'Sauce',Dips:'Dips','Ihre Extras':'Extras'}},
    ar:{single:'لحالو',menu:'منيو',add:'زيد عالطلب',save:'احفظ التعديل',required:'لازم',pick:'لازم تنقّي: {x}',more:'فرجيني',less:'خبّي',note:'ملاحظة',notePh:'ملاحظة للمطبخ …',qty:'الكمية',incl:'ضمن السعر',close:'سكّر',
      groups:{__drink:'المشروب',__sauce:'الصوص',Dips:'الديبس','Ihre Extras':'إضافات'}},
    en:{single:'Single',menu:'As menu',add:'Add to order',save:'Save changes',required:'Required',pick:'Please choose: {x}',more:'show',less:'hide',note:'Note',notePh:'Note for the kitchen …',qty:'Qty',incl:'incl.',close:'Close',
      groups:{__drink:'Drink',__sauce:'Sauce',Dips:'Dips','Ihre Extras':'Extras'}}};
  // ملاحظات سريعة للمطبخ (ألماني لأنو بتنطبع)
  const QUICK=['ohne Zwiebeln','ohne Tomaten','ohne Gurke','ohne Salat','ohne Soße','extra scharf','gut durch'];
  const L=()=>{try{const l=window.NARA_LANG?NARA_LANG.get():localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
  const t=k=>(T[L()]||T.de)[k]??T.de[k];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur=c=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format((+c||0)/100);
  const K=()=>window.NARA_KASSE_PRODUCT||{};
  const oname=n=>{try{return K().optionName?K().optionName(n):String(n)}catch(e){return String(n)}};
  const gname=g=>(t('groups')||{})[g]||oname(g);
  const MULTI=new Set(['Ihre Extras']);   // إضافات: كمية؛ الباقي (Dips…) كبسة = تشغيل/إطفاء

  let S=null; // {p, gs, sel:{group:{id:{opt,qty}}}, open:{group:bool}, qty, note, index}

  function menuCents(p){return Number.isInteger(window.NARA_MENU_SURCHARGE)?window.NARA_MENU_SURCHARGE:Math.max(0,(p.menuCents||p.cents)-p.cents)}
  function isMenu(){return !!(S.p.menuCents&&S.sel.__order&&S.sel.__order.__menu)}
  function visible(g){
    if(g.group==='__order')return true;
    if((g.group==='__drink'||g.group==='__sauce')&&S.p.menuCents)return isMenu();
    const need=(S.p.conditionalGroups||{})[g.group];
    if(!need)return true;
    const chosen=new Set(Object.values(S.sel).flatMap(m=>Object.keys(m)));
    return need.some(id=>chosen.has(id));
  }
  function chosenOptions(){
    const out=[];
    for(const g of S.gs){if(!visible(g))continue;const m=S.sel[g.group]||{};
      for(const [id,v] of Object.entries(m))out.push({id,name:v.opt.name,cents:+v.opt.cents||0,group:g.group,quantity:v.qty||1})}
    return out;
  }
  const unitCents=()=>(S.p.cents||0)+chosenOptions().reduce((s,x)=>s+(x.cents||0)*(x.quantity||1),0);
  function missing(){return S.gs.filter(g=>g.required&&visible(g)&&!Object.keys(S.sel[g.group]||{}).length).map(g=>gname(g.group))}

  function tile(g,o){
    const id=o.id||o.name,v=(S.sel[g.group]||{})[id],on=!!v,multi=MULTI.has(g.group);
    const price=o.cents?'+'+eur(o.cents):(g.required?t('incl'):'');
    return '<button type="button" class="npd-tile'+(on?' on':'')+'" data-g="'+esc(g.group)+'" data-o="'+esc(id)+'">'
      +'<span class="n">'+esc(oname(o.name))+'</span><span class="pr">'+esc(price)+'</span>'
      +(multi&&on?'<span class="q"><i data-minus="1">−</i><b>'+v.qty+'</b></span>':'')+'</button>';
  }
  function draw(){
    const box=document.getElementById('npd');if(!box||!S)return;
    const p=S.p,menu=p.menuCents,miss=missing(),unit=unitCents();
    let body='';
    if(menu){
      const m=isMenu();
      body+='<div class="npd-seg"><button type="button" data-seg="__single" class="'+(m?'':'on')+'"><b>'+esc(t('single'))+'</b><span>'+eur(p.cents)+'</span></button>'
        +'<button type="button" data-seg="__menu" class="'+(m?'on':'')+'"><b>🍟 '+esc(t('menu'))+'</b><span>'+eur(p.cents+menuCents(p))+'</span></button></div>';
    }
    for(const g of S.gs){
      if(g.group==='__order'||!visible(g))continue;
      const n=Object.keys(S.sel[g.group]||{}).length,collapsible=!g.required&&g.options.length>6,open=!collapsible||S.open[g.group]||n>0&&S.open[g.group]!==false;
      body+='<section class="npd-g"><h4>'+esc(gname(g.group))+(g.required?' <em>'+esc(t('required'))+'</em>':'')+(n?' <small>✓ '+n+'</small>':'')
        +(collapsible?'<button type="button" class="npd-tg" data-tg="'+esc(g.group)+'">'+(open?'▴ '+esc(t('less')):'▾ '+esc(t('more'))+' ('+g.options.length+')')+'</button>':'')+'</h4>'
        +(open?'<div class="npd-grid">'+g.options.map(o=>tile(g,o)).join('')+'</div>':'')+'</section>';
    }
    body+='<section class="npd-g"><h4>'+esc(t('note'))+'</h4><div class="npd-chips">'+QUICK.map(q=>'<button type="button" data-q="'+esc(q)+'" class="'+(S.note.split(', ').includes(q)?'on':'')+'">'+esc(q)+'</button>').join('')+'</div>'
      +'<input class="npd-note" value="'+esc(S.note)+'" placeholder="'+esc(t('notePh'))+'"></section>';
    const cb=box.querySelector('.npd-body'),st=cb.scrollTop;
    box.querySelector('.npd-title').textContent=p.n;
    box.querySelector('.npd-price').textContent=eur(unit);
    cb.innerHTML=body;cb.scrollTop=st;
    box.querySelector('.npd-qty b').textContent=S.qty;
    const go=box.querySelector('.npd-go');
    go.disabled=miss.length>0;
    go.innerHTML=miss.length?esc(t('pick').replace('{x}',miss.join(', '))):esc(S.index>=0?t('save'):t('add'))+' · <b>'+eur(unit*S.qty)+'</b>';
  }
  function close(){const b=document.getElementById('npd');if(b)b.hidden=true;S=null}
  function commit(){
    if(!S||missing().length)return;
    const p=S.p,opts=chosenOptions(),note=S.note.trim(),q=S.qty,index=S.index;
    close();
    K().add(p,opts,index,note);
    // الكمية (add بيعمل 1)
    try{const st=window.NARA_LEGACY_KASSE_STATE,o=st&&st.getCurrent&&st.getCurrent();if(o&&q>1){const it=index>=0?o.cart[index]:o.cart[o.cart.length-1];if(it){it.quantity=q;st.save();st.render()}}}catch(e){}
  }
  function onClick(e){
    const el=e.target;
    if(el.id==='npd'){close();return}
    const btn=el.closest('button');if(!btn)return;
    if(btn.classList.contains('npd-x')){close();return}
    if(btn.classList.contains('npd-go')){commit();return}
    if(btn.dataset.qd){S.qty=Math.max(1,Math.min(50,S.qty+(+btn.dataset.qd)));draw();return}
    if(btn.dataset.seg){S.sel.__order={[btn.dataset.seg]:{opt:S.gs[0].options.find(o=>(o.id||o.name)===btn.dataset.seg),qty:1}};draw();return}
    if(btn.dataset.tg){const g=btn.dataset.tg,cur=S.open[g];const n=Object.keys(S.sel[g]||{}).length;S.open[g]=!(cur||(cur!==false&&n>0));draw();return}
    if(btn.dataset.q){const parts=S.note?S.note.split(', ').filter(Boolean):[];const i=parts.indexOf(btn.dataset.q);if(i>=0)parts.splice(i,1);else parts.push(btn.dataset.q);S.note=parts.join(', ');draw();return}
    if(btn.dataset.g){
      const g=S.gs.find(x=>x.group===btn.dataset.g);if(!g)return;
      const id=btn.dataset.o,o=g.options.find(x=>(x.id||x.name)===id);if(!o)return;
      const m=S.sel[g.group]||(S.sel[g.group]={});
      if(g.required){S.sel[g.group]={[id]:{opt:o,qty:1}}}
      else if(MULTI.has(g.group)){
        if(el.closest('[data-minus]')){if(m[id]&&--m[id].qty<=0)delete m[id]}
        else m[id]={opt:o,qty:(m[id]?m[id].qty:0)+1};
      }else{
        // "بدون ديب" بيلغي الباقي، وأي ديب بيلغي "بدون"
        const none=/^(ohne|no)\b/i.test(o.name)||id==='no-dip';
        if(m[id])delete m[id];else{if(none)S.sel[g.group]={};else for(const k of Object.keys(m)){const x=m[k].opt;if(/^(ohne|no)\b/i.test(x.name)||k==='no-dip')delete m[k]}(S.sel[g.group]||(S.sel[g.group]={}))[id]={opt:o,qty:1}}
      }
      draw();return}
  }
  function open(p,old=null,index=-1){
    const k=K();if(!k.groups||!k.add)return;
    let gs=k.groups(p);
    if(p.menuCents)gs=[{group:'__order',required:true,options:[{id:'__single',name:'Einzel / بدون منيو',cents:0},{id:'__menu',name:'Menü / إضافة كمنيو',cents:menuCents(p)}]},...gs];
    if(!gs.length)return k.add(p,[],index);
    S={p,gs,sel:{},open:{},qty:old?(+old.quantity||1):1,note:old?String(old.note||''):'',index};
    if(old&&Array.isArray(old.options))for(const x of old.options){const g=gs.find(y=>y.group===x.group);const o=g&&g.options.find(y=>(y.id||y.name)===x.id);if(o)(S.sel[g.group]||(S.sel[g.group]={}))[x.id]={opt:o,qty:x.quantity||1}}
    if(p.menuCents&&!S.sel.__order)S.sel.__order={__single:{opt:gs[0].options[0],qty:1}};
    // مجموعة إجبارية فيها خيار واحد بس: منختارو لحالو
    for(const g of gs)if(g.required&&g.options.length===1&&!S.sel[g.group])S.sel[g.group]={[g.options[0].id||g.options[0].name]:{opt:g.options[0],qty:1}};
    let box=document.getElementById('npd');
    if(!box){
      box=document.createElement('div');box.id='npd';box.hidden=true;
      box.innerHTML='<div class="npd-card" role="dialog" aria-modal="true"><div class="npd-head"><div><h3 class="npd-title"></h3><div class="npd-price"></div></div><button type="button" class="npd-x" aria-label="close">✕</button></div><div class="npd-body"></div>'
        +'<div class="npd-foot"><div class="npd-qty"><button type="button" data-qd="-1">−</button><b>1</b><button type="button" data-qd="1">+</button></div><button type="button" class="npd-go"></button></div></div>';
      document.body.appendChild(box);
      box.addEventListener('click',onClick);
      box.addEventListener('input',e=>{if(e.target.classList.contains('npd-note')&&S){S.note=e.target.value;const c=box.querySelector('.npd-chips');if(c)c.querySelectorAll('[data-q]').forEach(b=>b.classList.toggle('on',S.note.split(', ').includes(b.dataset.q)))}});
      document.addEventListener('keydown',e=>{if(!S)return;if(e.key==='Escape')close();if(e.key==='Enter'&&!e.target.classList.contains('npd-note'))commit()});
    }
    box.hidden=false;box.querySelector('.npd-body').scrollTop=0;draw();
  }
  window.NARA_PRODUCT_DIALOG={open,close};
  const css=document.createElement('style');
  css.textContent='#npd{position:fixed;inset:0;z-index:9000;background:#0009;display:flex;align-items:center;justify-content:center;padding:14px}#npd[hidden]{display:none}'
    +'.npd-card{background:#fff;color:#1d2327;border-radius:18px;width:min(760px,100%);max-height:calc(100vh - 28px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px #0006}'
    +'.npd-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 10px;border-bottom:1px solid #eceae4}.npd-head>div{flex:1;min-width:0}.npd-title{margin:0;font-size:1.45rem;line-height:1.2}.npd-price{font-size:1.15rem;font-weight:900;color:#e04a12;margin-top:2px;direction:ltr;text-align:start}'
    +'.npd-x{width:44px;height:44px;border-radius:12px;border:0;background:#f1efe9;font-size:1.2rem;cursor:pointer}'
    +'.npd-body{overflow:auto;padding:12px 18px 6px;flex:1}'
    +'.npd-seg{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px}.npd-seg button{min-height:72px;border-radius:14px;border:2px solid #e3e0d8;background:#faf9f6;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:inherit}.npd-seg button b{font-size:1.15rem}.npd-seg button span{font-weight:800;color:#6b6760;direction:ltr}.npd-seg button.on{background:#1d2327;border-color:#1d2327;color:#fff}.npd-seg button.on span{color:#ffd9c6}'
    +'.npd-g h4{display:flex;align-items:center;gap:8px;margin:14px 0 8px;font-size:1rem}.npd-g h4 em{font-style:normal;font-size:.72rem;background:#fde2d6;color:#b7400f;border-radius:6px;padding:1px 6px}.npd-g h4 small{color:#16a34a;font-weight:800}.npd-tg{margin-inline-start:auto;border:1px solid #e3e0d8;background:#fff;border-radius:999px;padding:4px 12px;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer}'
    +'.npd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}'
    +'.npd-tile{position:relative;min-height:64px;border-radius:12px;border:2px solid #e3e0d8;background:#fff;cursor:pointer;padding:8px 10px;display:flex;flex-direction:column;justify-content:center;gap:2px;text-align:start;font:inherit}.npd-tile .n{font-weight:700;font-size:.92rem;line-height:1.25}.npd-tile .pr{font-size:.8rem;color:#6b6760;font-weight:700;direction:ltr;text-align:start}.npd-tile.on{border-color:#1d2327;background:#1d2327;color:#fff}.npd-tile.on .pr{color:#ffd9c6}'
    +'.npd-tile .q{position:absolute;top:-8px;inset-inline-end:-6px;display:flex;align-items:center;gap:4px;background:#e04a12;color:#fff;border-radius:999px;padding:2px 4px 2px 8px;font-weight:900}.npd-tile .q i{font-style:normal;width:24px;height:24px;border-radius:50%;background:#fff;color:#e04a12;display:grid;place-items:center;font-weight:900}'
    +'.npd-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.npd-chips button{border:1px solid #e3e0d8;background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:.88rem;cursor:pointer}.npd-chips button.on{background:#fff3ec;border-color:#e04a12;color:#b7400f;font-weight:800}'
    +'.npd-note{width:100%;height:44px;border:1px solid #d9d6ce;border-radius:10px;padding:0 12px;font:inherit}'
    +'.npd-foot{display:flex;gap:10px;align-items:center;padding:12px 18px;border-top:1px solid #eceae4;background:#faf9f6}.npd-qty{display:flex;align-items:center;gap:6px}.npd-qty button{width:48px;height:56px;border-radius:12px;border:1px solid #d9d6ce;background:#fff;font-size:1.5rem;cursor:pointer}.npd-qty b{min-width:32px;text-align:center;font-size:1.3rem}'
    +'.npd-go{flex:1;min-height:56px;border-radius:14px;border:0;background:#e04a12;color:#fff;font:inherit;font-size:1.1rem;font-weight:800;cursor:pointer}.npd-go b{direction:ltr;unicode-bidi:isolate}.npd-go:disabled{background:#b9b4ab;cursor:default;font-size:.95rem}'
    +'@media (max-width:560px){.npd-grid{grid-template-columns:repeat(2,1fr)}.npd-card{max-height:100vh;border-radius:14px}}';
  document.head.appendChild(css);
})();
