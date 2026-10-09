// kasse-quick-extras.js — زرّين سريعين بالكاشير:
// 1) "🍟 Menü +4 €" على كل صنف بالسلة: أي صنف بيصير منيو بكبسة (حتى لو ما إله منيو بالقائمة). كبسة تانية بتلغيه.
// 2) "➕ Extra" تحت السلة: شي مش موجود بالمنيو (بندورة زيادة، كاسة بلاستيك…): سعر بكبسة، والاسم والملاحظة والصنف كلهم اختياري،
//    إما سطر لحاله أو ملزوق على صنف معيّن (بيطلع تحته بالمطبخ والفاتورة).
// سعر المنيو بيجي من إعدادات السيرفر (/api/kasse/settings)، الافتراضي 4 €.
(function(){
  const $=s=>document.querySelector(s);
  const cartEl=$('#cart'),panel=$('.cart-panel');
  if(!cartEl||!panel)return;
  const L=()=>window.NARA_LEGACY_KASSE_STATE;
  const cur=()=>{const l=L();return l&&l.getCurrent?l.getCurrent():null};
  const lang=()=>{try{if(window.NARA_LANG)return window.NARA_LANG.get();const l=localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
  const T={
    de:{menu:'Menü',extra:'➕ Extra',title:'Extra hinzufügen',what:'Was genau? (optional)',ph:'z. B. extra Tomate, Plastikbecher',price:'Preis',note:'Notiz (optional)',for:'Für welchen Artikel? (optional)',alone:'Eigene Zeile',add:'Hinzufügen',cancel:'Abbrechen',per:'Preis pro Stück',need:'Bitte eingeben, was der Kunde möchte',other:'Anderer Preis',bad:'Ungültiger Preis'},
    ar:{menu:'منيو',extra:'➕ إكسترا',title:'زيد شي مش بالمنيو',what:'شو بالزبط؟ (مش ضروري)',ph:'مثلاً بندورة زيادة، كاسة بلاستيك',price:'السعر',note:'ملاحظة (مش ضروري)',for:'لأي صنف؟ (مش ضروري)',alone:'سطر لحالو',add:'زيد',cancel:'إلغاء',per:'السعر للقطعة',need:'اكتب شو بدّو الزبون',other:'سعر تاني',bad:'السعر مو مزبوط'},
    en:{menu:'Menu',extra:'➕ Extra',title:'Add extra',what:'What exactly? (optional)',ph:'e.g. extra tomato, plastic cup',price:'Price',note:'Note (optional)',for:'For which item? (optional)',alone:'Separate line',add:'Add',cancel:'Cancel',per:'Price per piece',need:'Type what the customer wants',other:'Other price',bad:'Invalid price'}};
  const tr=k=>(T[lang()]||T.de)[k]||T.de[k];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur=c=>(c/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const SKIP=new Set(['DELIVERY_FEE','EXTRA']);
  let menuCents=450;window.NARA_MENU_SURCHARGE=menuCents; // نفس سعر المنيو لكل الأصناف (من الإعدادات)
  fetch('/api/kasse/settings',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(j&&Number.isInteger(j.menuSurchargeCents)){menuCents=j.menuSurchargeCents;window.NARA_MENU_SURCHARGE=menuCents;decorate()}}).catch(()=>{});

  const isMenu=it=>(it.options||[]).some(x=>x.id==='__menu'||x.id==='__quickmenu');
  // زر المنيو بس للأصناف اللي إلها نسخة منيو بالقائمة (برغر، ساندويش…). المنيوهات والعروض والمشروبات ما إلها.
  const productOf=it=>{const list=(typeof catalog!=='undefined'&&Array.isArray(catalog))?catalog:[];const pid=String(it.id||'').replace(/-\d+$/,'');return list.find(p=>p.id===pid)||list.find(p=>p.n===it.name)||null};
  const canMenu=it=>{if(isMenu(it))return true;const p=productOf(it);return !!(p&&p.menuCents>0)&&!/men[uü]/i.test(String(it.name||''))};
  function commit(){const l=L();if(l){l.save();l.render()}}

  // منيو: تشغيل/إطفاء على سطر بالسلة
  function toggleMenu(index){
    const o=cur();if(!o)return;const it=o.cart[index];if(!it||SKIP.has(it.kind)||!canMenu(it))return;
    it.options=it.options||[];
    const quick=it.options.findIndex(x=>x.id==='__quickmenu'),native=it.options.findIndex(x=>x.id==='__menu');
    if(quick>=0){it.unitCents-=Number(it.options[quick].cents)||0;it.options.splice(quick,1)}
    else if(native>=0){it.unitCents-=Number(it.options[native].cents)||0;it.options.splice(native,1,{id:'__single',name:'Einzel / بدون منيو',cents:0,group:'__order',quantity:1})}
    else{it.options=it.options.filter(x=>x.id!=='__single');it.options.push({id:'__quickmenu',name:'Menü',cents:menuCents,group:'__quick',quantity:1});it.unitCents+=menuCents}
    commit();
  }

  // زر المنيو على كل سطر
  function decorate(){
    const o=cur();if(!o)return;
    const rows=[...cartEl.querySelectorAll('.cart-item')];
    (o.cart||[]).forEach((it,i)=>{
      const row=rows[i];if(!row)return;
      if(it.kind==='EXTRA'){const ed=row.querySelector('[data-act=edit]');if(ed)ed.remove();return} // سطر "أكتر" ما إله منتج يتعدّل
      if(SKIP.has(it.kind)||!canMenu(it))return;
      const ctr=row.querySelector('.cart-controls');if(!ctr||ctr.querySelector('.qx-menu'))return;
      const b=document.createElement('button');b.type='button';b.className='qx-menu'+(isMenu(it)?' on':'');b.dataset.index=String(i);
      b.textContent=isMenu(it)?'🍟 '+tr('menu')+' ✓':'🍟 '+tr('menu')+' +'+eur(menuCents);
      ctr.insertBefore(b,ctr.querySelector('[data-act=edit]')||null);
    });
  }
  cartEl.addEventListener('click',e=>{const b=e.target.closest('.qx-menu');if(!b)return;e.stopPropagation();toggleMenu(Number(b.dataset.index))},true);
  new MutationObserver(decorate).observe(cartEl,{childList:true});

  // زر "أكتر"
  const extraBtn=document.createElement('button');extraBtn.type='button';extraBtn.id='qx-extra';
  cartEl.after(extraBtn); // مباشرة تحت أصناف الطلب
  const modal=document.createElement('div');modal.id='qx-modal';modal.hidden=true;document.body.appendChild(modal);
  const PRICES=[0,50,100,150,200,300,400,500];
  let price=100;
  function openExtra(){
    const o=cur();if(!o)return;price=100;
    const items=(o.cart||[]).map((it,i)=>({it,i})).filter(x=>!SKIP.has(x.it.kind));
    modal.innerHTML=`<div class="qx-card" role="dialog" aria-modal="true"><h2>${esc(tr('title'))}</h2>
      <label class="qx-l">${esc(tr('what'))}<input id="qx-what" maxlength="80" placeholder="${esc(tr('ph'))}" autocomplete="off"></label>
      <div class="qx-l">${esc(tr('price'))}<div class="qx-prices">${PRICES.map(c=>`<button type="button" data-c="${c}" class="${c===price?'on':''}">${eur(c)}</button>`).join('')}<input id="qx-custom" inputmode="decimal" placeholder="${esc(tr('other'))}"></div></div>
      ${items.length?`<label class="qx-l">${esc(tr('for'))}<select id="qx-for"><option value="">${esc(tr('alone'))}</option>${items.map(x=>`<option value="${x.i}">${esc(x.it.quantity+'× '+x.it.name)}</option>`).join('')}</select><small id="qx-per" hidden>${esc(tr('per'))}</small></label>`:''}
      <label class="qx-l">${esc(tr('note'))}<input id="qx-note" maxlength="120"></label>
      <p id="qx-err" class="qx-err"></p>
      <div class="qx-acts"><button type="button" id="qx-cancel">${esc(tr('cancel'))}</button><button type="button" id="qx-add" class="go">${esc(tr('add'))}</button></div></div>`;
    modal.hidden=false;setTimeout(()=>{const w=$('#qx-what');if(w)w.focus()},50);
  }
  function closeExtra(){modal.hidden=true;modal.innerHTML=''}
  function customCents(){const v=($('#qx-custom')||{}).value||'';if(!v.trim())return null;const n=parseFloat(v.replace(/[^\d,.]/g,'').replace(',','.'));return Number.isFinite(n)&&n>=0&&n<=100?Math.round(n*100):NaN}
  modal.addEventListener('click',e=>{
    if(e.target===modal||e.target.id==='qx-cancel')return closeExtra();
    const pb=e.target.closest('.qx-prices button');if(pb){price=Number(pb.dataset.c);modal.querySelectorAll('.qx-prices button').forEach(b=>b.classList.toggle('on',b===pb));const c=$('#qx-custom');if(c)c.value='';return}
    if(e.target.id==='qx-add'){
      const what=($('#qx-what').value||'').trim(),note=($('#qx-note').value||'').trim(),cc=customCents(),cents=cc==null?price:cc;
      if(!Number.isInteger(cents)){$('#qx-err').textContent=tr('bad');return}
      const o=cur();if(!o)return closeExtra();o.cart=o.cart||[];
      const sel=$('#qx-for'),idx=sel&&sel.value!==''?Number(sel.value):-1,target=idx>=0?o.cart[idx]:null;
      if(target){target.options=target.options||[];target.options.push({id:'__extra-'+Date.now(),name:(what||'Extra')+(note?' ('+note+')':''),cents,group:'__extra',quantity:1});target.unitCents+=cents}
      else{const fee=o.cart.findIndex(i=>i.kind==='DELIVERY_FEE'),line={id:'extra-'+Date.now(),name:what?'Extra: '+what:'Extra',unitCents:cents,quantity:1,options:[],note,kind:'EXTRA'};if(fee>=0)o.cart.splice(fee,0,line);else o.cart.push(line)}
      closeExtra();commit();
    }
  });
  modal.addEventListener('change',e=>{if(e.target.id==='qx-for'){const p=$('#qx-per');if(p)p.hidden=e.target.value===''}});
  modal.addEventListener('input',e=>{if(e.target.id==='qx-custom'&&e.target.value)modal.querySelectorAll('.qx-prices button').forEach(b=>b.classList.remove('on'))});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeExtra();if(e.key==='Enter'&&!modal.hidden&&e.target.tagName==='INPUT'){const a=$('#qx-add');if(a)a.click()}});
  extraBtn.addEventListener('click',openExtra);

  function labels(){extraBtn.textContent=tr('extra');cartEl.querySelectorAll('.qx-menu').forEach(b=>b.remove());decorate()}
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>setTimeout(labels,0)));
  window.addEventListener('nara-lang',()=>setTimeout(labels,0));
  labels();
  window.NARA_QUICK_EXTRAS={toggleMenu,menuCents:()=>menuCents};
})();
