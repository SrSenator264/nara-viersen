// kasse-phone.js — شريط السلة السفلي على التلفون. بيقرأ #cart و #total وبيفتح/بيسكّر .cart-panel. ما بيغيّر منطق الطلبات.
(function(){
  const cart=document.querySelector('#cart'),total=document.querySelector('#total'),panel=document.querySelector('.cart-panel');
  if(!cart||!total||!panel)return;
  const L={de:'Warenkorb',ar:'السلة',en:'Cart'};
  const lang=()=>{try{return (window.NARA_LANG&&NARA_LANG.get())||localStorage.getItem('nara-kasse-language')||document.documentElement.lang||'de'}catch(e){return 'de'}};

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
})();
