(function(){
var MENU=window.__MENU__, THEME=window.__THEME__, ON=window.__ON__||{};
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
 de:{cart:'Warenkorb',empty:'Dein Warenkorb ist leer. Such dir was Leckeres aus.',total:'Gesamt',order:'Bestellen',close:'Schließen',add:'Hinzufügen',added:'Im Warenkorb',back:'Alle Bereiche',items:'Artikel',demo:'Vorschau: Bestellungen werden noch nicht gesendet.',delivery:'Liefern',pickup:'Abholen',open:'Täglich 13:00 – 02:00',addr:'Gereonstraße 1, 41747 Viersen',
  single:'Einzeln',menu:'Als Menü',menuSub:'mit Pommes, Getränk & Dip',required:'Pflicht',optional:'optional',choose:'Bitte wählen',showAll:'Alle anzeigen',showLess:'Weniger',notes:'Wünsche',notePh:'Noch etwas? z. B. Soße extra',qty:'Menge',missing:'Bitte noch wählen:',upsell:'Als Menü nur +{d}: Pommes, Getränk & Dip dazu?',upsellBtn:'Ja, als Menü',edit:'Ändern',
  qn:['Ohne Zwiebeln','Ohne Tomaten','Ohne Salat','Ohne Gurken','Extra scharf']},
 en:{cart:'Cart',empty:'Your cart is empty. Pick something tasty.',total:'Total',order:'Order now',close:'Close',add:'Add',added:'In cart',back:'All sections',items:'items',demo:'Preview: orders are not sent yet.',delivery:'Delivery',pickup:'Pickup',open:'Daily 1 pm – 2 am',addr:'Gereonstraße 1, 41747 Viersen',
  single:'Single',menu:'As a meal',menuSub:'with fries, drink & dip',required:'required',optional:'optional',choose:'Please choose',showAll:'Show all',showLess:'Show less',notes:'Requests',notePh:'Anything else? e.g. extra sauce',qty:'Quantity',missing:'Still to choose:',upsell:'Make it a meal for just +{d}: fries, drink & dip?',upsellBtn:'Yes, as a meal',edit:'Edit',
  qn:['No onions','No tomatoes','No lettuce','No pickles','Extra spicy']},
 ar:{cart:'السلة',empty:'السلة فاضية. اختار شي طيّب.',total:'المجموع',order:'اطلب',close:'سكّر',add:'ضيف',added:'بالسلة',back:'كل الأقسام',items:'أغراض',demo:'نسخة تجربة: الطلبات لسا ما بتنبعت.',delivery:'توصيل',pickup:'استلام',open:'كل يوم 13:00 – 02:00',addr:'Gereonstraße 1, 41747 Viersen',
  single:'لحالو',menu:'منيو',menuSub:'مع بطاطا ومشروب وديب',required:'لازم',optional:'اختياري',choose:'اختار',showAll:'شوف الكل',showLess:'أقل',notes:'طلبات خاصة',notePh:'شي تاني؟ مثلاً صوص زيادة',qty:'العدد',missing:'لسا لازم تختار:',upsell:'خليها منيو بس بـ +{d}: بطاطا ومشروب وديب؟',upsellBtn:'إي، منيو',edit:'عدّل',
  qn:['بلا بصل','بلا بندورة','بلا خس','بلا خيار','حار زيادة']}
};
var QN_DE=T.de.qn;
var lang='de', cart={}, route='home', mode='delivery';
try{ lang=localStorage.getItem('lang')||'de'; cart=JSON.parse(localStorage.getItem('cart')||'{}')||{}; }catch(e){}
function t(k){return (T[lang]&&T[lang][k])||T.de[k]||k}
function tt(o){return o[lang]||o.de}
function th(k){var x=THEME.text[k];return x?(x[lang]||x.de):''}
function eur(c){return (c/100).toFixed(2).replace('.',',')+' €'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function save(){try{localStorage.setItem('cart',JSON.stringify(cart));localStorage.setItem('lang',lang)}catch(e){}}
var byId={};MENU.forEach(function(p){byId[p.id]=p});
// السلة: سطر لكل منتج مع خياراتو (نفس فكرة الكاشير)
function normCart(c){var out={};for(var k in c){var v=c[k];if(typeof v==='number'){if(byId[k]&&v>0)out[k]={id:+k,q:v,m:0,o:[],nt:'',u:byId[k].p}}else if(v&&byId[v.id]&&v.q>0)out[k]=v}return out}
cart=normCart(cart);
function hasOpts(p){return !!(p.mc||(p.o&&p.o.length))}
function lineKey(l){return [l.id,l.m,l.o.map(function(x){return x.g+':'+x.i}).sort().join(','),l.nt].join('|')}
function addLine(l){var k=lineKey(l);if(cart[k])cart[k].q+=l.q;else cart[k]=l;save();render();try{window.dispatchEvent(new CustomEvent('nara-added',{detail:{id:l.id}}))}catch(e){}}
function addSimple(id){var p=byId[id];if(!p)return;if(hasOpts(p)){openProduct(p);return}addLine({id:p.id,q:1,m:0,o:[],nt:'',u:p.p})}
function qtyOf(id){var n=0;for(var k in cart)if(cart[k].id===id)n+=cart[k].q;return n}
function count(){var n=0;for(var k in cart)n+=cart[k].q;return n}
function sum(){var s=0;for(var k in cart)s+=cart[k].u*cart[k].q;return s}
function secOf(k){for(var i=0;i<SECS.length;i++)if(SECS[i].k===k)return SECS[i]}
function gName(g){var x=ON[g];return x?(x[lang]||x.de):g.replace(/^__/,'')}
function oName(n){var x=ON[n];return x?(x[lang]||x.de):n}
window.NARA_WEB={cart:function(){return cart},setCart:function(o){cart=normCart(o||{});save();render()},openCart:function(){drawerOpen=true;render()},add:addSimple,menu:MENU,byId:byId,eur:function(c){return eur(c)}};
var MS={burger:1,crispy:1,street:1,orient:1,drinks:1,sweet:1,sides:1};
function mascot(size,k){return '<img class="mascot" src="c/'+(k&&MS[k]?'m-'+k:'mascot')+'.webp" alt="" width="'+size+'" height="'+Math.round(size*1.18)+'">'}

function header(){
 var nav=SECS.map(function(s){return '<a href="#'+s.k+'" class="chip'+(route===s.k?' on':'')+'" style="--c:'+s.c+';--ink:'+s.ink+'">'+esc(tt(s.name))+'</a>'}).join('');
 var langs=['de','en','ar'].map(function(l){return '<button type="button" class="lang'+(l===lang?' on':'')+'" data-lang="'+l+'" '+(l==='ar'?'lang="ar"':'')+'>'+(l==='ar'?'عربي':l.toUpperCase())+'</button>'}).join('');
 return '<header class="top"><a href="#home" class="brand" dir="ltr">'+THEME.brandHtml+'</a><nav class="chips" aria-label="Menu">'+nav+'</nav><div class="tools"><div class="langs" role="group" aria-label="Sprache">'+langs+'</div><button type="button" class="cartbtn" id="openCart">'+esc(t('cart'))+' <b>'+count()+'</b></button></div></header>';
}
function home(){
 var secs=SECS.map(function(s,i){
  var n=MENU.filter(function(p){return p.s===s.k}).length;
  return '<a href="#'+s.k+'" class="sec sec-'+s.k+'" style="--c:'+s.c+';--ink:'+s.ink+'"><span class="num">'+THEME.numLabel(i)+'</span><span class="name">'+esc(tt(s.name))+'</span><span class="sub">'+esc(tt(s.sub))+' · '+n+'</span>'+(s.img?'<img src="'+s.img+'" alt="" loading="lazy">':'')+'</a>';
 }).join('');
 return '<section class="hero"><div class="hero-text"><p class="eyebrow">'+esc(t('addr'))+' · '+esc(t('open'))+'</p><h1>'+th('h1')+'</h1><p class="lede">'+esc(th('lede'))+'</p></div><div class="hero-art">'+(THEME.heroMascot?mascot(300):'<img src="c/b20.webp" alt="">')+'</div></section><section class="secs" aria-label="Bereiche">'+secs+'</section>'+footer();
}
function section(k){
 var s=secOf(k), items=MENU.filter(function(p){return p.s===k});
 var groups=[];items.forEach(function(p){if(groups.indexOf(p.g)<0)groups.push(p.g)});
 var cards=groups.map(function(g){
  return '<h3 class="grp">'+esc(g)+'</h3><div class="grid">'+items.filter(function(p){return p.g===g}).map(function(p){
   var q=qtyOf(p.id);
   return '<article class="card"><button type="button" class="ph" data-open="'+p.id+'" aria-label="'+esc(p.n)+'">'+(p.img?'<img src="'+p.img+'" alt="" loading="lazy">':'<span class="ph-name">'+esc(p.n)+'</span>')+'</button><div class="info"><h4 dir="auto">'+esc(p.n)+'</h4>'+(p.d?'<p dir="auto">'+esc(p.d)+'</p>':'')+'<div class="row"><b class="price">'+(p.mc?'<small>'+esc(t('single'))+'</small> ':'')+eur(p.p)+'</b><button type="button" class="add'+(q?' has':'')+'" data-add="'+p.id+'" aria-label="'+esc(t('add')+': '+p.n)+'">'+(q?'<span>'+q+'</span>':'+')+'</button></div></div></article>';
  }).join('')+'</div>';
 }).join('');
 return '<section class="shero" style="--c:'+s.c+';--ink:'+s.ink+'"><div class="shero-in"><a href="#home" class="back">← '+esc(t('back'))+'</a><h1>'+esc(tt(s.name))+'</h1><p>'+esc(tt(s.sub))+'</p></div>'+(THEME.guide&&k==='burger'?'<div class="shero-bar"><img src="c/flamo-bar.webp" alt="Flamo sitzt auf der Burger-Bar"></div>':(s.img?'<img class="shero-img" src="'+s.img+'" alt="">':''))+(THEME.heroMascot?'<div class="shero-m">'+mascot(240,k)+'</div>':'')+'</section><section class="menu">'+cards+'</section>'+footer();
}
function footer(){return '<footer class="foot"><span>'+THEME.brandHtml+'</span><span>'+esc(t('addr'))+'</span><span>'+esc(t('open'))+'</span></footer>'}
function lineDesc(l){var parts=[];if(l.m)parts.push(t('menu'));l.o.forEach(function(o){parts.push(oName(o.n)+(o.c?' (+'+eur(o.c)+')':''))});if(l.nt)parts.push(l.nt);return parts.join(' · ')}
function drawer(){
 var lines=Object.keys(cart).map(function(k){var l=cart[k],p=byId[l.id],d=lineDesc(l);
  return '<li><span class="q">'+l.q+'×</span><span class="n" dir="auto">'+esc(p.n)+(d?'<small dir="auto">'+esc(d)+'</small>':'')+'</span><span class="p">'+eur(l.u*l.q)+'</span><span class="pm"><button type="button" data-dec="'+esc(k)+'" aria-label="−">−</button><button type="button" data-inc="'+esc(k)+'" aria-label="+">+</button></span></li>'}).join('');
 return '<div class="scrim" id="scrim" hidden></div><aside class="drawer" id="drawer" hidden aria-label="'+esc(t('cart'))+'"><div class="dh"><h2>'+esc(t('cart'))+'</h2><button type="button" id="closeCart" class="x">'+esc(t('close'))+'</button></div><div class="modes"><button type="button" data-mode="delivery" class="'+(mode==='delivery'?'on':'')+'">'+esc(t('delivery'))+'</button><button type="button" data-mode="pickup" class="'+(mode==='pickup'?'on':'')+'">'+esc(t('pickup'))+'</button></div>'+(lines?'<ul class="lines">'+lines+'</ul>':'<p class="empty">'+esc(t('empty'))+'</p>')+'<div class="dsum"><span>'+esc(t('total'))+'</span><b>'+eur(sum())+'</b></div><button type="button" class="orderbtn" id="orderBtn"'+(lines?'':' disabled')+'>'+esc(t('order'))+'</button><p class="note" id="note" hidden>'+esc(t('demo'))+'</p></aside>';
}
function bar(){var n=count();return n?'<button type="button" class="bar" id="bar"><span>'+n+' '+esc(t('items'))+'</span><b>'+eur(sum())+' →</b></button>':''}

// ── نافذة المنتج: لحالو/منيو، الخيارات، الطلبات الخاصة، العدد ──
var pd=null; // {p, menu, sel:{group:[ids]}, q, nt:[], note, open:{group:true}}
function visibleGroups(){var p=pd.p,gs=(p.o||[]).filter(function(g){
  if(g.g==='__drink'||g.g==='__sauce')return !!pd.menu;
  var need=p.cg&&p.cg[g.g];if(need){var chosen=[];for(var k in pd.sel)chosen=chosen.concat(pd.sel[k]);return need.some(function(i){return chosen.indexOf(i)>=0})}
  return true});return gs}
function isReq(g){return g.r||g.g==='__drink'||g.g==='__sauce'}
function missing(){return visibleGroups().filter(function(g){return isReq(g)&&!(pd.sel[g.g]&&pd.sel[g.g].length)})}
function pdUnit(){var p=pd.p,u=pd.menu&&p.mc?p.mc:p.p;visibleGroups().forEach(function(g){(pd.sel[g.g]||[]).forEach(function(i){var o=g.x.filter(function(x){return x.i===i})[0];if(o)u+=o.c})});return u}
function openProduct(p){pd={p:p,menu:false,sel:{},q:1,nt:[],note:'',open:{}};renderPd();try{window.dispatchEvent(new CustomEvent('nara-product',{detail:{id:p.id}}))}catch(e){}}
function closePd(){pd=null;var el=document.getElementById('pd');if(el)el.remove();document.documentElement.classList.remove('pd-on')}
function renderPd(focusSel){
 var el=document.getElementById('pd');if(!el){el=document.createElement('div');el.id='pd';document.body.appendChild(el)}
 document.documentElement.classList.add('pd-on');
 var p=pd.p,img=pd.menu&&p.mi?p.mi:p.img,miss=missing(),u=pdUnit();
 var html='<div class="pd-scrim" data-pd="close"></div><div class="pd-sheet" role="dialog" aria-modal="true" aria-label="'+esc(p.n)+'"><button type="button" class="pd-x" data-pd="close" aria-label="'+esc(t('close'))+'">×</button>';
 html+='<div class="pd-body"><div class="pd-img">'+(img?'<img src="'+img+'" alt="">':'')+'</div><div class="pd-head"><h2 dir="auto">'+esc(p.n)+'</h2>'+(p.d?'<p dir="auto">'+esc(pd.menu&&p.md?p.md:p.d)+'</p>':'')+'</div>';
 if(p.mc){
  html+='<div class="pd-seg" role="radiogroup"><button type="button" role="radio" aria-checked="'+(!pd.menu)+'" data-pd="single"><b>'+esc(t('single'))+'</b><span>'+eur(p.p)+'</span></button><button type="button" role="radio" aria-checked="'+(!!pd.menu)+'" data-pd="menu"><b>'+esc(t('menu'))+'</b><span>'+eur(p.mc)+' · '+esc(t('menuSub'))+'</span></button></div>';
  if(!pd.menu&&THEME.guide)html+='<div class="pd-flamo"><img src="c/m-burger.webp" alt=""><p>'+esc(t('upsell').replace('{d}',eur(p.mc-p.p)))+'</p><button type="button" data-pd="menu">'+esc(t('upsellBtn'))+'</button></div>';
 }
 visibleGroups().forEach(function(g){
  var req=isReq(g),sel=pd.sel[g.g]||[],many=g.x.length>6&&!pd.open[g.g],opts=many?g.x.slice(0,6):g.x,isMiss=req&&!sel.length;
  html+='<fieldset class="pd-grp'+(isMiss&&focusSel?' miss':'')+'" data-grp="'+esc(g.g)+'"><legend><b>'+esc(gName(g.g))+'</b><span class="'+(req?'req':'')+'">'+esc(req?t('required'):t('optional'))+'</span></legend><div class="pd-opts">';
  opts.forEach(function(o){var on=sel.indexOf(o.i)>=0;
   html+='<button type="button" class="pd-opt'+(on?' on':'')+'" role="'+(req?'radio':'checkbox')+'" aria-checked="'+on+'" data-g="'+esc(g.g)+'" data-o="'+esc(o.i)+'"><span class="dot" aria-hidden="true"></span><span class="on" dir="auto">'+esc(oName(o.n))+'</span>'+(o.c?'<span class="pc">+'+eur(o.c)+'</span>':'')+'</button>'});
  if(g.x.length>6)html+='<button type="button" class="pd-more" data-more="'+esc(g.g)+'">'+esc(pd.open[g.g]?t('showLess'):t('showAll')+' ('+g.x.length+')')+'</button>';
  html+='</div></fieldset>';
 });
 if(/burger|street|orient/.test(p.s)){
  html+='<fieldset class="pd-grp"><legend><b>'+esc(t('notes'))+'</b><span>'+esc(t('optional'))+'</span></legend><div class="pd-qn">'+t('qn').map(function(q,i){var on=pd.nt.indexOf(i)>=0;return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" data-qn="'+i+'">'+esc(q)+'</button>'}).join('')+'</div><label class="pd-note"><span class="sr">'+esc(t('notes'))+'</span><input id="pdNote" type="text" maxlength="120" placeholder="'+esc(t('notePh'))+'" value="'+esc(pd.note)+'"></label></fieldset>';
 }
 html+='</div><div class="pd-foot">'+(miss.length&&focusSel?'<p class="pd-miss">'+esc(t('missing'))+' '+esc(miss.map(function(g){return gName(g.g)}).join(', '))+'</p>':'')+'<div class="pd-row"><div class="pd-q" role="group" aria-label="'+esc(t('qty'))+'"><button type="button" data-pd="dec" aria-label="−">−</button><b>'+pd.q+'</b><button type="button" data-pd="inc" aria-label="+">+</button></div><button type="button" class="pd-add'+(miss.length?' dim':'')+'" data-pd="add">'+esc(t('add'))+' · '+eur(u*pd.q)+'</button></div></div></div>';
 var sc=el.querySelector('.pd-body');var top=sc?sc.scrollTop:0;
 el.innerHTML=html;
 var nb=el.querySelector('.pd-body');if(nb)nb.scrollTop=top;
 if(focusSel){var m=el.querySelector('.pd-grp.miss');if(m)m.scrollIntoView({block:'center',behavior:'smooth'})}
 var ni=el.querySelector('#pdNote');if(ni)ni.addEventListener('input',function(){pd.note=ni.value});
}
document.addEventListener('click',function(e){
 if(!pd)return;var el=e.target.closest('#pd [data-pd],#pd [data-g],#pd [data-more],#pd [data-qn]');if(!el)return;
 var a=el.dataset.pd;
 if(a==='close'){closePd();return}
 if(a==='single'){pd.menu=false;renderPd();return}
 if(a==='menu'){pd.menu=true;renderPd();return}
 if(a==='inc'){pd.q=Math.min(20,pd.q+1);renderPd();return}
 if(a==='dec'){pd.q=Math.max(1,pd.q-1);renderPd();return}
 if(el.dataset.more){pd.open[el.dataset.more]=!pd.open[el.dataset.more];renderPd();return}
 if(el.dataset.qn!=null){var i=+el.dataset.qn,ix=pd.nt.indexOf(i);if(ix>=0)pd.nt.splice(ix,1);else pd.nt.push(i);renderPd();return}
 if(el.dataset.g){var g=(pd.p.o||[]).filter(function(x){return x.g===el.dataset.g})[0],cur=pd.sel[g.g]||[],id=el.dataset.o;
  if(isReq(g))pd.sel[g.g]=[id];else{var k=cur.indexOf(id);if(k>=0)cur.splice(k,1);else cur.push(id);pd.sel[g.g]=cur}
  renderPd();return}
 if(a==='add'){if(missing().length){renderPd(true);return}
  var p=pd.p,o=[];visibleGroups().forEach(function(g){(pd.sel[g.g]||[]).forEach(function(i){var x=g.x.filter(function(y){return y.i===i})[0];if(x)o.push({g:g.g,i:x.i,n:x.n,c:x.c})})});
  var nt=pd.nt.slice().sort().map(function(i){return QN_DE[i]});if(pd.note.trim())nt.push(pd.note.trim());
  var line={id:p.id,q:pd.q,m:pd.menu&&p.mc?1:0,o:o,nt:nt.join(', '),u:pdUnit()};closePd();addLine(line)}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&pd)closePd()});

var drawerOpen=false;
function render(){
 var app=document.getElementById('app');
 document.documentElement.lang=lang; document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 var s=secOf(route);
 document.body.setAttribute('data-route',route);
 app.innerHTML=header()+'<main>'+(s?section(route):home())+'</main>'+bar()+drawer();
 if(drawerOpen){document.getElementById('drawer').hidden=false;document.getElementById('scrim').hidden=false}
 if(pd)renderPd();
}
function go(){var h=(location.hash||'#home').slice(1);route=secOf(h)?h:'home';drawerOpen=false;if(pd)closePd();render();window.scrollTo(0,0)}
document.addEventListener('click',function(e){
 if(e.target.closest('#pd'))return;
 var el=e.target.closest('[data-add],[data-open],[data-inc],[data-dec],[data-lang],[data-mode],#openCart,#closeCart,#scrim,#bar,#orderBtn'); if(!el)return;
 if(el.dataset.add){addSimple(+el.dataset.add);return}
 if(el.dataset.open){openProduct(byId[+el.dataset.open]);return}
 if(el.dataset.inc){var l=cart[el.dataset.inc];if(l){l.q++;save();render()}return}
 if(el.dataset.dec){var k=el.dataset.dec,l2=cart[k];if(l2){l2.q--;if(l2.q<=0)delete cart[k];save();render()}return}
 if(el.dataset.lang){lang=el.dataset.lang;save();render();return}
 if(el.dataset.mode){mode=el.dataset.mode;render();return}
 if(el.id==='openCart'||el.id==='bar'){drawerOpen=true;render();return}
 if(el.id==='closeCart'||el.id==='scrim'){drawerOpen=false;render();return}
 if(el.id==='orderBtn'){document.getElementById('note').hidden=false;try{localStorage.setItem('lastOrder',JSON.stringify(cart))}catch(e){}}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&drawerOpen&&!pd){drawerOpen=false;render()}});
window.addEventListener('hashchange',go);
go();
})();
