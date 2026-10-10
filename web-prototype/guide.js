(function(){
if(!window.__THEME__||!window.__THEME__.guide)return;
var W=window.NARA_WEB;
var TIPS={
 home:{de:'Hey, ich bin Flamo! Such dir eine Farbe aus, ich zeig dir den Weg.',en:"Hey, I'm Flamo! Pick a colour, I'll show you around.",ar:'أهلا، أنا فلامو! اختار لون وأنا بدلّك عالطريق.'},
 burger:{de:'Mein Tipp: Smashed Beef Burger. Zwei Patties, richtig saftig!',en:'My tip: Smashed Beef Burger. Two patties, super juicy!',ar:'نصيحتي: سماشد بيف برغر. قطعتين لحمة، طريّة كتير!'},
 crispy:{de:'Korean Wings oder gleich ein Bucket für alle?',en:'Korean wings or a bucket for everyone?',ar:'وينغز كوري ولا باكيت للكل؟'},
 street:{de:'Hot Dog oder French Taco? Warum nicht beides!',en:'Hot dog or French taco? Why not both!',ar:'هوت دوغ ولا تاكو؟ ليش مو التنين!'},
 orient:{de:'Shawarma frisch vom Spieß, Falafel schön knusprig.',en:'Shawarma fresh off the spit, crispy falafel.',ar:'شاورما طازة عن السيخ، وفلافل مقرمش.'},
 sides:{de:'Pommes dazu? Ohne geht es nicht!',en:'Fries on the side? Of course!',ar:'بطاطا عالجنب؟ أكيد!'},
 drinks:{de:'Ein kaltes Frappé zum Abkühlen?',en:'An iced frappé to cool down?',ar:'فرابيه باردة تبرّد فيها؟'},
 sweet:{de:'Zum Schluss noch was Süßes?',en:'Something sweet to finish?',ar:'شي حلو عالآخر؟'},
 added:{de:'Lecker! Noch was dazu?',en:'Yum! Anything else?',ar:'يمّي! بدك شي كمان؟'},
 lunch:{de:'Mittagspause? Ich hab was Schnelles für dich.',en:'Lunch break? I have something quick for you.',ar:'استراحة غدا؟ عندي شي سريع إلك.'},
 evening:{de:'Feierabend! Zeit für was Richtiges.',en:'Day is done! Time for something proper.',ar:'خلص الدوام! وقت أكلة محرزة.'},
 late:{de:'Späthunger? Wir haben bis 2 Uhr offen.',en:'Late-night hunger? We are open until 2 am.',ar:'جوعان آخر الليل؟ نحنا فاتحين لـ ٢ بالليل.'}
};
var TPL={
 pick:{de:['Probier mal {n}, nur {p}!','Heute empfehle ich {n}. Kostet {p}.','{n} ist richtig beliebt. {p}!'],en:['Try the {n}, only {p}!','Today I recommend {n}. Just {p}.','{n} is a crowd favourite. {p}!'],ar:['جرّب {n}، بس بـ {p}!','اليوم بنصحك بـ {n}. سعرها {p}.','{n} كتير مطلوبة. {p}!']},
 fries:{de:['{n} dazu? Ohne Pommes ist es nur halb so gut.','Fehlt da nicht was? {n} für {p}.'],en:['Add {n}? It is only half as good without fries.','Missing something? {n} for {p}.'],ar:['بتضيف {n}؟ بلا بطاطا ما بتكمل.','ناقصك شي؟ {n} بـ {p}.']},
 drink:{de:['Und was zu trinken? {n} passt perfekt.','Durst? {n} für {p}.'],en:['Something to drink? {n} goes perfectly.','Thirsty? {n} for {p}.'],ar:['وشو بتشرب؟ {n} بيمشي تمام معها.','عطشان؟ {n} بـ {p}.']},
 sweet:{de:['Zum Schluss noch {n}?','Nachtisch? {n} für {p}.'],en:['Finish with {n}?','Dessert? {n} for {p}.'],ar:['وعالآخر {n}؟','بدك حلو؟ {n} بـ {p}.']},
 addBtn:{de:'Dazu nehmen',en:'Add it',ar:'ضيفها'},
 voiceOn:{de:'Stimme an',en:'Voice on',ar:'الصوت شغّال'},voiceOff:{de:'Stimme aus',en:'Voice off',ar:'الصوت مسكّر'}
};
var IMG={burger:1,crispy:1,street:1,orient:1,sides:1,drinks:1,sweet:1};
var g=document.createElement('div');g.className='guide welcome';g.id='guide';
g.innerHTML='<div class="g-bubble" id="gBubble" role="status" aria-live="polite"><span id="gText"></span><button type="button" class="g-act" id="gAct" hidden></button></div><div class="g-row"><button type="button" class="g-voice" id="gVoice" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="w" d="M16 9a4 4 0 0 1 0 6"/><path class="w" d="M18.5 6.5a8 8 0 0 1 0 11"/></svg></button><button type="button" class="g-btn" id="gBtn" aria-label="Flamo"><img id="gImg" src="c/mascot.webp" alt=""></button></div>';
document.body.appendChild(g);
var bub=g.querySelector('#gBubble'),txtEl=g.querySelector('#gText'),act=g.querySelector('#gAct'),img=g.querySelector('#gImg'),vbtn=g.querySelector('#gVoice');
var timer=0,typing=0,talkT=0,voice=false,lastPick={};
try{voice=localStorage.getItem('flamoVoice')==='1'}catch(e){}
function L(){return document.documentElement.lang||'de'}
function tr(o){return o[L()]||o.de}
function route(){var h=(location.hash||'#home').slice(1);return IMG[h]?h:'home'}
function rnd(a){return a[Math.floor(Math.random()*a.length)]}
function fill(t,p){return t.replace('{n}',p.n).replace('{p}',W.eur(p.p))}
function cartItems(){var c=W.cart(),out=[];for(var k in c)if(c[k]>0&&W.byId[k])out.push(W.byId[k]);return out}
function pool(f){return W.menu.filter(f)}
function pickFrom(list,key){if(!list.length)return null;var p,i=0;do{p=rnd(list);i++}while(list.length>1&&lastPick[key]===p.id&&i<5);lastPick[key]=p.id;return p}
// اقتراح ذكي: حسب السلة، وإلا منتج من القسم
function suggestion(){
 var items=cartItems(),r=route();
 var hasFood=items.some(function(p){return /burger|crispy|street|orient/.test(p.s)});
 var hasFries=items.some(function(p){return p.s==='sides'});
 var hasDrink=items.some(function(p){return p.s==='drinks'});
 var hasSweet=items.some(function(p){return p.s==='sweet'});
 if(hasFood&&!hasFries){var f=pickFrom(pool(function(p){return p.s==='sides'&&/pommes|fries|frit/i.test(p.n)&&p.img}),'fries');if(f)return{t:fill(rnd(tr(TPL.fries)),f),id:f.id}}
 if(hasFood&&!hasDrink){var d=pickFrom(pool(function(p){return p.s==='drinks'&&p.img}),'drink');if(d)return{t:fill(rnd(tr(TPL.drink)),d),id:d.id}}
 if(hasFood&&hasDrink&&!hasSweet){var s=pickFrom(pool(function(p){return p.s==='sweet'&&p.img}),'sweet');if(s)return{t:fill(rnd(tr(TPL.sweet)),s),id:s.id}}
 if(r!=='home'){var x=pickFrom(pool(function(p){return p.s===r&&p.img}),r);if(x)return{t:fill(rnd(tr(TPL.pick)),x),id:x.id}}
 return null;
}
function timeTip(){var h=new Date().getHours();return h>=5&&h<16?'lunch':h<22&&h>=16?'evening':'late'}
function speak(t){
 if(!voice||!window.speechSynthesis)return;
 try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t),l=L(),code=l==='ar'?'ar':l==='en'?'en':'de';
  var vs=speechSynthesis.getVoices().filter(function(v){return v.lang&&v.lang.toLowerCase().indexOf(code)===0});
  if(vs.length)u.voice=vs[0];u.lang=code==='ar'?'ar-SA':code==='en'?'en-US':'de-DE';u.rate=1.05;u.pitch=1.35;speechSynthesis.speak(u)}catch(e){}
}
function talk(ms){if(route()!=='home')return;clearTimeout(talkT);setTimeout(function(){if(route()==='home')img.src='c/flamo-talk.webp'},220);talkT=setTimeout(function(){if(route()==='home')img.src='c/mascot.webp'},ms)}
function show(text,keep,pid){
 clearTimeout(timer);clearInterval(typing);bub.hidden=false;txtEl.textContent='';
 act.hidden=!pid;if(pid){act.textContent=tr(TPL.addBtn);act.setAttribute('data-add',pid)}else act.removeAttribute('data-add');
 var i=0;typing=setInterval(function(){i+=2;txtEl.textContent=text.slice(0,i);if(i>=text.length)clearInterval(typing)},28);
 talk(Math.max(3500,text.length*70));speak(text);
 if(!keep)timer=setTimeout(function(){bub.hidden=true},pid?9000:6500);
}
function say(key,keep){show(tr(TIPS[key]),keep)}
function hop(){g.classList.remove('hop');void g.offsetWidth;g.classList.add('hop')}
function pose(r){var src='c/'+(IMG[r]?'m-'+r:'mascot')+'.webp';if(img.getAttribute('src')!==src){g.classList.add('swap');setTimeout(function(){img.src=src;g.classList.remove('swap')},180)}}
function dock(){g.classList.remove('welcome')}
function onRoute(){var r=route();g.classList.toggle('away',r==='burger');if(r!=='home')dock();pose(r);hop();
 if(r==='home'){say(g.classList.contains('welcome')?'home':timeTip());return}
 var s=Math.random()<.6?suggestion():null; if(s)show(s.t,false,s.id); else say(r);
}

var INTRO={h:{de:'Hey, ich bin Flamo.',en:"Hey, I'm Flamo.",ar:'أهلا، أنا فلامو.'},
 p:{de:'Schön, dass du da bist. Worauf hast du heute Hunger?',en:'Glad you stopped by. What are you hungry for today?',ar:'منوّر! شو جاي عبالك اليوم؟'},
 surprise:{de:'Überrasch mich',en:'Surprise me',ar:'فاجئني'},menu:{de:'Direkt zur Speisekarte →',en:'Straight to the menu →',ar:'خدني عالمنيو ←'}};
var SNAMES=[['burger',{de:'Burger',en:'Burgers',ar:'برغر'}],['crispy',{de:'Crispy',en:'Crispy',ar:'كرسبي'}],['street',{de:'Street',en:'Street',ar:'ستريت'}],['orient',{de:'Orientalisch',en:'Oriental',ar:'شرقي'}],['sides',{de:'Sides',en:'Sides',ar:'مقبلات'}],['drinks',{de:'Drinks',en:'Drinks',ar:'مشروبات'}],['sweet',{de:'Desserts',en:'Desserts',ar:'حلويات'}]];
var intro=null;
function introHTML(){var l=L();return '<div class="in-glow" aria-hidden="true"></div><div class="in-top"><span class="in-brand" dir="ltr">'+(window.__THEME__.brandHtml||'')+'</span><div class="in-langs">'+['de','en','ar'].map(function(x){return '<button type="button" data-ilang="'+x+'" class="'+(x===l?'on':'')+'">'+(x==='ar'?'عربي':x.toUpperCase())+'</button>'}).join('')+'</div></div><div class="in-text"><h1>'+tr(INTRO.h)+'</h1><p id="inP"></p><div class="in-chips">'+SNAMES.map(function(s){return '<button type="button" data-go="'+s[0]+'">'+tr(s[1])+'</button>'}).join('')+'<button type="button" class="hot" data-go="surprise">'+tr(INTRO.surprise)+'</button></div><button type="button" class="in-skip" data-go="home">'+tr(INTRO.menu)+'</button></div>'}
function typeP(){var el=intro.querySelector('#inP'),t=tr(INTRO.p),i=0;clearInterval(typing);el.textContent='';typing=setInterval(function(){i+=2;el.textContent=t.slice(0,i);if(i>=t.length)clearInterval(typing)},30);speak(tr(INTRO.h)+' '+t)}
function openIntro(){intro=document.createElement('div');intro.id='intro';intro.setAttribute('role','dialog');intro.setAttribute('aria-label','Flamo');intro.innerHTML=introHTML();document.body.appendChild(intro);document.documentElement.classList.add('intro-on');g.classList.add('intro');bub.hidden=true;img.src='c/flamo-talk.webp';setTimeout(typeP,350);
 intro.addEventListener('click',function(e){var b=e.target.closest('[data-go],[data-ilang]');if(!b)return;
  if(b.dataset.ilang){var lb=document.querySelector('[data-lang="'+b.dataset.ilang+'"]');if(lb)lb.click();setTimeout(function(){intro.innerHTML=introHTML();typeP()},60);return}
  var go=b.dataset.go;if(go==='surprise'){go=SNAMES[Math.floor(Math.random()*SNAMES.length)][0]}
  closeIntro(go)})}
function closeIntro(go){if(!intro)return;try{sessionStorage.setItem('flamoIntro','1')}catch(e){}
 intro.classList.add('out');document.documentElement.classList.remove('intro-on');g.classList.remove('intro');dock();
 setTimeout(function(){if(intro){intro.remove();intro=null}},700);
 if(go&&go!=='home'){location.hash=go}else{img.src='c/mascot.webp';setTimeout(function(){say(timeTip())},900)}}
function setVoice(on){voice=on;vbtn.setAttribute('aria-pressed',on?'true':'false');vbtn.setAttribute('aria-label',tr(on?TPL.voiceOn:TPL.voiceOff));vbtn.title=tr(on?TPL.voiceOn:TPL.voiceOff);try{localStorage.setItem('flamoVoice',on?'1':'0')}catch(e){}if(!on&&window.speechSynthesis)speechSynthesis.cancel()}
setVoice(voice);
if(!window.speechSynthesis)vbtn.hidden=true;
var seen=false;try{seen=sessionStorage.getItem('flamoIntro')==='1'}catch(e){}
if(route()==='home'&&!seen){openIntro()}else{dock();if(route()==='home')setTimeout(function(){say(timeTip())},600)}
window.addEventListener('scroll',function(){if(window.scrollY>40&&!intro)dock()},{passive:true});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&intro)closeIntro('home')});
window.addEventListener('hashchange',function(){setTimeout(onRoute,30)});
vbtn.addEventListener('click',function(){setVoice(!voice);if(voice)speak(txtEl.textContent||tr(TIPS.home))});
g.querySelector('#gBtn').addEventListener('click',function(){dock();hop();var s=suggestion();if(s)show(s.t,false,s.id);else say(route()==='home'?timeTip():route())});
document.addEventListener('click',function(e){
 var a=e.target.closest('[data-add]');
 if(a){hop();setTimeout(function(){var s=suggestion();if(s&&a.id!=='gAct')show(tr(TIPS.added)+' '+s.t,false,s.id);else show(tr(TIPS.added),false)},60)}
 if(e.target.closest('[data-lang]'))setTimeout(function(){setVoice(voice);say(route()==='home'?timeTip():route())},40);
});
if(route()!=='home'){dock();pose(route());g.classList.toggle('away',route()==='burger')}
})();
