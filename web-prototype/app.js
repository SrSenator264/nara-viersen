(function(){
var MENU=window.__MENU__, THEME=window.__THEME__;
var SECS=[
 {k:'burger',c:'#E3262F',ink:'#FFF4E2',img:'c/b1.webp',name:{de:'Burger',en:'Burgers',ar:'برغر'},sub:{de:'Beef · Chicken · Menüs',en:'Beef · chicken · meals',ar:'لحمة · دجاج · وجبات'}},
 {k:'crispy',c:'#F2B10C',ink:'#2A1A00',img:'c/wings.webp',name:{de:'Crispy',en:'Crispy',ar:'كرسبي'},sub:{de:'Wings · Tenders · Buckets',en:'Wings · tenders · buckets',ar:'وينغز · تندرز · باكيت'}},
 {k:'street',c:'#FF6A13',ink:'#1A0A00',img:'c/hotdog.webp',name:{de:'Street',en:'Street',ar:'ستريت'},sub:{de:'Hot Dogs · French Tacos',en:'Hot dogs · French tacos',ar:'هوت دوغ · تاكو فرنسي'}},
 {k:'orient',c:'#55652A',ink:'#F7EFD9',img:'c/wrap-shawarma.webp',name:{de:'Orientalisch',en:'Oriental',ar:'شرقي'},sub:{de:'Shawarma · Falafel',en:'Shawarma · falafel',ar:'شاورما · فلافل'}},
 {k:'sides',c:'#1C1B1A',ink:'#FFF4E2',img:'c/fries.webp',name:{de:'Sides & Salate',en:'Sides & salads',ar:'مقبلات وسلطات'},sub:{de:'Pommes · Rings · Salate',en:'Fries · rings · salads',ar:'بطاطا · حلقات بصل · سلطات'}},
 {k:'drinks',c:'#8FD3EE',ink:'#06283A',img:'c/frappe.webp',name:{de:'Drinks',en:'Drinks',ar:'مشروبات'},sub:{de:'Frappés · Iced Coffee · Softdrinks',en:'Frappés · iced coffee · soft drinks',ar:'فرابيه · قهوة باردة · مشروبات غازية'}},
 {k:'sweet',c:'#F59BBE',ink:'#3A0B1F',img:null,name:{de:'Desserts',en:'Desserts',ar:'حلويات'},sub:{de:'Donuts · Cheesecake · Brownie',en:'Donuts · cheesecake · brownie',ar:'دونات · تشيز كيك · براوني'}}
];
var T={
 de:{cart:'Warenkorb',empty:'Dein Warenkorb ist leer. Such dir was Leckeres aus.',total:'Gesamt',order:'Bestellen',close:'Schließen',add:'Hinzufügen',added:'Im Warenkorb',back:'Alle Bereiche',items:'Artikel',from:'aus',stands:'Bereichen',demo:'Vorschau: Bestellungen werden noch nicht gesendet.',delivery:'Liefern',pickup:'Abholen',open:'Täglich 13:00 – 02:00',addr:'Gereonstraße 1, 41747 Viersen',all:'Alle',mascot:'Platzhalter: 3D-Maskottchen'},
 en:{cart:'Cart',empty:'Your cart is empty. Pick something tasty.',total:'Total',order:'Order now',close:'Close',add:'Add',added:'In cart',back:'All sections',items:'items',from:'from',stands:'sections',demo:'Preview: orders are not sent yet.',delivery:'Delivery',pickup:'Pickup',open:'Daily 1 pm – 2 am',addr:'Gereonstraße 1, 41747 Viersen',all:'All',mascot:'Placeholder: 3D mascot'},
 ar:{cart:'السلة',empty:'السلة فاضية. اختار شي طيّب.',total:'المجموع',order:'اطلب',close:'سكّر',add:'ضيف',added:'بالسلة',back:'كل الأقسام',items:'أغراض',from:'من',stands:'أقسام',demo:'نسخة تجربة: الطلبات لسا ما بتنبعت.',delivery:'توصيل',pickup:'استلام',open:'كل يوم 13:00 – 02:00',addr:'Gereonstraße 1, 41747 Viersen',all:'الكل',mascot:'مكان الشخصية الثري دي'}
};
var lang='de', cart={}, route='home', mode='delivery';
try{ lang=localStorage.getItem('lang')||'de'; cart=JSON.parse(localStorage.getItem('cart')||'{}')||{}; }catch(e){}
function t(k){return (T[lang]&&T[lang][k])||T.de[k]||k}
function tt(o){return o[lang]||o.de}
function th(k){var x=THEME.text[k];return x?(x[lang]||x.de):''}
function eur(c){return (c/100).toFixed(2).replace('.',',')+' €'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function save(){try{localStorage.setItem('cart',JSON.stringify(cart));localStorage.setItem('lang',lang)}catch(e){}}
var byId={};MENU.forEach(function(p){byId[p.id]=p});
window.NARA_WEB={cart:function(){return cart},setCart:function(o){cart=o||{};save();render()},openCart:function(){drawerOpen=true;render()},menu:MENU,byId:byId,eur:function(c){return eur(c)}};
function count(){var n=0;for(var k in cart)n+=cart[k];return n}
function sum(){var s=0;for(var k in cart)if(byId[k])s+=byId[k].p*cart[k];return s}
function secOf(k){for(var i=0;i<SECS.length;i++)if(SECS[i].k===k)return SECS[i]}
var MS={burger:1,crispy:1,street:1,orient:1,drinks:1,sweet:1,sides:1};
function mascot(size,k){return '<img class="mascot" src="c/'+(k&&MS[k]?'m-'+k:'mascot')+'.webp" alt="" width="'+size+'" height="'+Math.round(size*1.18)+'">'}
var ACC={burger:'<path d="M95 245 L205 245 L196 300 L104 300 Z" fill="#fff" stroke="#111" stroke-width="5"/>',crispy:'<rect x="96" y="178" width="108" height="36" rx="16" fill="#111"/>',street:'<path d="M88 112 Q150 70 212 112 L232 120 L88 120 Z" fill="#111"/>',orient:'<path d="M118 70 L182 70 L176 118 L124 118 Z" fill="#B3261E" stroke="#111" stroke-width="5"/><path d="M150 70 L168 52" stroke="#111" stroke-width="5"/>',sides:'',drinks:'<path d="M205 150 L240 60" stroke="#111" stroke-width="9" stroke-linecap="round"/>',sweet:'<circle cx="110" cy="120" r="7" fill="#F59BBE"/><circle cx="185" cy="135" r="7" fill="#8FD3EE"/><circle cx="150" cy="95" r="7" fill="#fff"/>'};

function header(){
 var nav=SECS.map(function(s){return '<a href="#'+s.k+'" class="chip'+(route===s.k?' on':'')+'" style="--c:'+s.c+';--ink:'+s.ink+'">'+esc(tt(s.name))+'</a>'}).join('');
 var langs=['de','en','ar'].map(function(l){return '<button type="button" class="lang'+(l===lang?' on':'')+'" data-lang="'+l+'" '+(l==='ar'?'lang="ar"':'')+'>'+(l==='ar'?'عربي':l.toUpperCase())+'</button>'}).join('');
 return '<header class="top"><a href="#home" class="brand" dir="ltr">'+THEME.brandHtml+'</a><nav class="chips" aria-label="Menu">'+nav+'</nav><div class="tools"><div class="langs" role="group" aria-label="Sprache">'+langs+'</div><button type="button" class="cartbtn" id="openCart">'+esc(t('cart'))+' <b>'+count()+'</b></button></div></header>';
}
function home(){
 var secs=SECS.map(function(s,i){
  var n=MENU.filter(function(p){return p.s===s.k}).length;
  return '<a href="#'+s.k+'" class="sec sec-'+s.k+'" style="--c:'+s.c+';--ink:'+s.ink+'"><span class="num">'+THEME.numLabel(i)+'</span><span class="name">'+esc(tt(s.name))+'</span><span class="sub">'+esc(tt(s.sub))+' · '+n+'</span>'+(s.img?'<img src="'+s.img+'" alt="" loading="lazy">':'<span class="noimg" aria-hidden="true">'+''+'</span>')+'</a>';
 }).join('');
 return '<section class="hero"><div class="hero-text"><p class="eyebrow">'+esc(t('addr'))+' · '+esc(t('open'))+'</p><h1>'+th('h1')+'</h1><p class="lede">'+esc(th('lede'))+'</p></div><div class="hero-art">'+(THEME.heroMascot?mascot(300):'<img src="c/b20.webp" alt="">')+'</div></section><section class="secs" aria-label="Bereiche">'+secs+'</section>'+footer();
}
function section(k){
 var s=secOf(k), items=MENU.filter(function(p){return p.s===k});
 var groups=[];items.forEach(function(p){if(groups.indexOf(p.g)<0)groups.push(p.g)});
 var cards=groups.map(function(g){
  return '<h3 class="grp">'+esc(g)+'</h3><div class="grid">'+items.filter(function(p){return p.g===g}).map(function(p){
   var q=cart[p.id]||0;
   return '<article class="card"><div class="ph">'+(p.img?'<img src="'+p.img+'" alt="" loading="lazy">':'<span class="ph-name">'+esc(p.n)+'</span>')+'</div><div class="info"><h4 dir="auto">'+esc(p.n)+'</h4>'+(p.d?'<p dir="auto">'+esc(p.d)+'</p>':'')+'<div class="row"><b class="price">'+eur(p.p)+'</b><button type="button" class="add'+(q?' has':'')+'" data-add="'+p.id+'" aria-label="'+esc(t('add')+': '+p.n)+'">'+(q?'<span>'+q+'</span>':'+')+'</button></div></div></article>';
  }).join('')+'</div>';
 }).join('');
 return '<section class="shero" style="--c:'+s.c+';--ink:'+s.ink+'"><div class="shero-in"><a href="#home" class="back">← '+esc(t('back'))+'</a><h1>'+esc(tt(s.name))+'</h1><p>'+esc(tt(s.sub))+'</p></div>'+(THEME.guide&&k==='burger'?'<div class="shero-bar"><img src="c/flamo-bar.webp" alt="Flamo sitzt auf der Burger-Bar"></div>':(s.img?'<img class="shero-img" src="'+s.img+'" alt="">':''))+(THEME.heroMascot?'<div class="shero-m">'+mascot(240,k)+'</div>':'')+'</section><section class="menu">'+cards+'</section>'+footer();
}
function footer(){return '<footer class="foot"><span>'+THEME.brandHtml+'</span><span>'+esc(t('addr'))+'</span><span>'+esc(t('open'))+'</span></footer>'}
function drawer(){
 var lines=Object.keys(cart).filter(function(k){return byId[k]&&cart[k]>0}).map(function(k){var p=byId[k];
  return '<li><span class="q">'+cart[k]+'×</span><span class="n" dir="auto">'+esc(p.n)+'</span><span class="p">'+eur(p.p*cart[k])+'</span><span class="pm"><button type="button" data-dec="'+k+'" aria-label="−">−</button><button type="button" data-add="'+k+'" aria-label="+">+</button></span></li>'}).join('');
 return '<div class="scrim" id="scrim" hidden></div><aside class="drawer" id="drawer" hidden aria-label="'+esc(t('cart'))+'"><div class="dh"><h2>'+esc(t('cart'))+'</h2><button type="button" id="closeCart" class="x">'+esc(t('close'))+'</button></div><div class="modes"><button type="button" data-mode="delivery" class="'+(mode==='delivery'?'on':'')+'">'+esc(t('delivery'))+'</button><button type="button" data-mode="pickup" class="'+(mode==='pickup'?'on':'')+'">'+esc(t('pickup'))+'</button></div>'+(lines?'<ul class="lines">'+lines+'</ul>':'<p class="empty">'+esc(t('empty'))+'</p>')+'<div class="dsum"><span>'+esc(t('total'))+'</span><b>'+eur(sum())+'</b></div><button type="button" class="orderbtn" id="orderBtn"'+(lines?'':' disabled')+'>'+esc(t('order'))+'</button><p class="note" id="note" hidden>'+esc(t('demo'))+'</p></aside>';
}
function bar(){var n=count();return n?'<button type="button" class="bar" id="bar"><span>'+n+' '+esc(t('items'))+'</span><b>'+eur(sum())+' →</b></button>':''}
var drawerOpen=false;
function render(){
 var app=document.getElementById('app');
 document.documentElement.lang=lang; document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 var s=secOf(route);
 document.body.setAttribute('data-route',route);
 app.innerHTML=header()+'<main>'+(s?section(route):home())+'</main>'+bar()+drawer();
 if(drawerOpen){document.getElementById('drawer').hidden=false;document.getElementById('scrim').hidden=false}
}
function go(){var h=(location.hash||'#home').slice(1);route=secOf(h)?h:'home';drawerOpen=false;render();window.scrollTo(0,0)}
document.addEventListener('click',function(e){
 var el=e.target.closest('[data-add],[data-dec],[data-lang],[data-mode],#openCart,#closeCart,#scrim,#bar,#orderBtn'); if(!el)return;
 if(el.dataset.add){cart[el.dataset.add]=(cart[el.dataset.add]||0)+1;save();render();return}
 if(el.dataset.dec){var k=el.dataset.dec;cart[k]=(cart[k]||0)-1;if(cart[k]<=0)delete cart[k];save();render();return}
 if(el.dataset.lang){lang=el.dataset.lang;save();render();return}
 if(el.dataset.mode){mode=el.dataset.mode;render();return}
 if(el.id==='openCart'||el.id==='bar'){drawerOpen=true;render();return}
 if(el.id==='closeCart'||el.id==='scrim'){drawerOpen=false;render();return}
 if(el.id==='orderBtn'){document.getElementById('note').hidden=false;try{localStorage.setItem('lastOrder',JSON.stringify(cart))}catch(e){}}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&drawerOpen){drawerOpen=false;render()}});
window.addEventListener('hashchange',go);
go();
})();
