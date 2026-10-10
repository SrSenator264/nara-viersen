(function(){
if(!window.__THEME__||!window.__THEME__.guide)return;
var TIPS={
 home:{de:'Hey, ich bin Flamo! Such dir eine Farbe aus, ich zeig dir den Weg.',en:"Hey, I'm Flamo! Pick a colour, I'll show you around.",ar:'أهلا، أنا فلامو! اختار لون وأنا بدلّك عالطريق.'},
 burger:{de:'Mein Tipp: Smashed Beef Burger. Zwei Patties, richtig saftig!',en:'My tip: Smashed Beef Burger. Two patties, super juicy!',ar:'نصيحتي: سماشد بيف برغر. قطعتين لحمة، طريّة كتير!'},
 crispy:{de:'Korean Wings oder gleich ein Bucket für alle?',en:'Korean wings or a bucket for everyone?',ar:'وينغز كوري ولا باكيت للكل؟'},
 street:{de:'Hot Dog oder French Taco? Warum nicht beides!',en:'Hot dog or French taco? Why not both!',ar:'هوت دوغ ولا تاكو؟ ليش مو التنين!'},
 orient:{de:'Shawarma frisch vom Spieß, Falafel schön knusprig.',en:'Shawarma fresh off the spit, crispy falafel.',ar:'شاورما طازة عن السيخ، وفلافل مقرمش.'},
 sides:{de:'Pommes dazu? Ohne geht es nicht!',en:'Fries on the side? Of course!',ar:'بطاطا عالجنب؟ أكيد!'},
 drinks:{de:'Ein kaltes Frappé zum Abkühlen?',en:'An iced frappé to cool down?',ar:'فرابيه باردة تبرّد فيها؟'},
 sweet:{de:'Zum Schluss noch was Süßes?',en:'Something sweet to finish?',ar:'شي حلو عالآخر؟'},
 added:{de:'Lecker! Noch was dazu?',en:'Yum! Anything else?',ar:'يمّي! بدك شي كمان؟'}
};
var IMG={burger:1,crispy:1,street:1,orient:1,sides:1,drinks:1,sweet:1};
var g=document.createElement('div');g.className='guide welcome';g.id='guide';
g.innerHTML='<div class="g-bubble" id="gBubble" role="status" aria-live="polite"></div><button type="button" class="g-btn" id="gBtn" aria-label="Flamo"><img id="gImg" src="c/mascot.webp" alt=""></button>';
document.body.appendChild(g);
var bub=g.querySelector('#gBubble'),img=g.querySelector('#gImg'),timer=0,typing=0,cur='';
function lang(){return document.documentElement.lang||'de'}
function route(){var h=(location.hash||'#home').slice(1);return TIPS[h]&&h!=='added'?h:'home'}
var talkT=0;
function talk(ms){if(route()!=='home')return;clearTimeout(talkT);setTimeout(function(){if(route()==='home')img.src='c/flamo-talk.webp'},220);talkT=setTimeout(function(){if(route()==='home')img.src='c/mascot.webp'},ms)}
function say(key,keep){
 var txt=(TIPS[key][lang()]||TIPS[key].de);talk(Math.max(3500,txt.length*70));clearTimeout(timer);clearInterval(typing);
 bub.hidden=false;bub.textContent='';var i=0;
 typing=setInterval(function(){i+=2;bub.textContent=txt.slice(0,i);if(i>=txt.length)clearInterval(typing)},28);
 if(!keep)timer=setTimeout(function(){bub.hidden=true},6500);
}
function hop(){g.classList.remove('hop');void g.offsetWidth;g.classList.add('hop')}
function pose(r){var src='c/'+(IMG[r]?'m-'+r:'mascot')+'.webp';if(img.getAttribute('src')!==src){g.classList.add('swap');setTimeout(function(){img.src=src;g.classList.remove('swap')},180)}}
function dock(){if(g.classList.contains('welcome')){g.classList.remove('welcome');}}
function onRoute(){var r=route();g.classList.toggle('away',r==='burger');if(r!=='home')dock();pose(r);hop();say(r,g.classList.contains('welcome'));cur=r}
say('home',true);
setTimeout(function(){dock();say(route())},3600);
window.addEventListener('scroll',function(){if(window.scrollY>40)dock()},{passive:true});
window.addEventListener('hashchange',function(){setTimeout(onRoute,30)});
g.querySelector('#gBtn').addEventListener('click',function(){dock();hop();if(bub.hidden)say(route());else bub.hidden=true});
document.addEventListener('click',function(e){
 if(e.target.closest('[data-add]')){hop();say('added')}
 if(e.target.closest('[data-lang]'))setTimeout(function(){say(route())},40);
});
if(route()!=='home'){dock();pose(route());g.classList.toggle('away',route()==='burger')}
})();
