// kasse-touch.js — سلوك واجهة اللمس: ألوان الأقسام، درج بيانات التوصيل، شريحة العنوان، نبضة المجموع.
// ما بيغيّر أي منطق للطلبات أو الدفع؛ بس بيقرأ العناصر الموجودة وبيضيف عناصر عرض.
(function(){
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const card=$('.delivery-card'),cats=$('#categories'),prods=$('#products'),cart=$('.cart-panel');
  if(!card||!cats||!prods||!cart)return;
  const T={de:{done:'Fertig',enter:'Lieferdaten eingeben'},ar:{done:'خلصت',enter:'دخّل معلومات التوصيل'},en:{done:'Done',enter:'Enter delivery details'}};
  const lang=()=>{try{return (window.NARA_LANG&&NARA_LANG.get())||localStorage.getItem('nara-kasse-language')||document.documentElement.lang||'de'}catch(e){return 'de'}};
  const tr=k=>(T[lang()]||T.de)[k];

  // 1) لون لكل قسم، والأصناف بتاخد لون القسم المختار
  function hues(){let sel=0;[...cats.querySelectorAll('.category')].forEach((b,i)=>{b.dataset.hue=String(i%8);if(b.classList.contains('selected'))sel=i});prods.dataset.hue=String(sel%8)}
  new MutationObserver(hues).observe(cats,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});hues();

  // 2) درج بيانات التوصيل
  const scrim=document.createElement('div');scrim.id='dl-scrim';document.body.appendChild(scrim);
  const done=document.createElement('button');done.id='dl-done';done.type='button';
  const head=card.querySelector('.section-head');if(head)head.appendChild(done);
  const chip=document.createElement('button');chip.id='dl-chip';chip.type='button';chip.hidden=true;
  chip.innerHTML='<span class="dl-addr"></span><span class="dl-fee"></span>';
  const ch=cart.querySelector('.section-head');if(ch)ch.after(chip);else cart.prepend(chip);
  function labels(){done.textContent=tr('done');updateChip()}
  function open(){if(card.hidden)return;card.classList.add('is-open');document.body.classList.add('dl-open');setTimeout(()=>{const p=$('#customer-phone');if(p&&card.classList.contains('is-open'))p.focus({preventScroll:true})},260)}
  function close(){card.classList.remove('is-open');document.body.classList.remove('dl-open');if(document.activeElement&&card.contains(document.activeElement))document.activeElement.blur()}
  function updateChip(){
    chip.hidden=card.hidden;
    const addr=(($('#address-preview')||{}).textContent||'').trim(),name=(($('#customer-name')||{}).value||'').trim();
    chip.querySelector('.dl-addr').textContent=addr?((name?name+' · ':'')+addr):tr('enter');
  }
  done.addEventListener('click',close);scrim.addEventListener('click',close);chip.addEventListener('click',open);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&card.classList.contains('is-open'))close()});
  $$('[data-order-type]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{if(b.dataset.orderType==='delivery')open();else close();updateChip()},0)));
  $$('[data-lang]').forEach(b=>b.addEventListener('click',()=>setTimeout(labels,0)));
  new MutationObserver(()=>{if(card.hidden)close();updateChip()}).observe(card,{attributes:true,attributeFilter:['hidden']});
  const ap=$('#address-preview');if(ap)new MutationObserver(updateChip).observe(ap,{childList:true,characterData:true,subtree:true});
  card.addEventListener('input',updateChip);
  labels();
  document.dispatchEvent(new Event('nara-chip-ready'));

  // 3) سطر رسم التوصيل بالسلة: بدون + - تعديل؛ زر الحذف صار "إعفاء"
  const waiveLabel={de:'Erlassen',ar:'إعفاء',en:'Waive'};
  function decorateFee(){const L=window.NARA_LEGACY_KASSE_STATE,o=L&&L.getCurrent&&L.getCurrent();if(!o)return;const rows=[...document.querySelectorAll('#cart .cart-item')];(o.cart||[]).forEach((it,i)=>{const row=rows[i];if(!row||it.kind!=='DELIVERY_FEE')return;row.classList.add('fee-line');const rm=row.querySelector('[data-act=remove]');if(rm)rm.textContent=waiveLabel[lang()]||waiveLabel.de})}
  const cartEl=$('#cart');if(cartEl){new MutationObserver(decorateFee).observe(cartEl,{childList:true});decorateFee()}

  // 4) نبضة صغيرة للمجموع لما يتغير (ردّ على ضغطة المستخدم)
  const total=$('#total');
  if(total){let last=total.textContent,tm=0;new MutationObserver(()=>{if(total.textContent===last)return;last=total.textContent;total.classList.remove('bump');void total.offsetWidth;total.classList.add('bump');clearTimeout(tm);tm=setTimeout(()=>total.classList.remove('bump'),400)}).observe(total,{childList:true,characterData:true,subtree:true})}
})();
