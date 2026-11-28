'use strict';
// مركز قيادة المدير الذكي (ai-control.html): ذاكرة المشروع، سجل القرارات، صحة الكود، مشاركة الشاشة، وتنفيذ تجريبي بموافقة.
// بثلاث لغات (de · ar · en). ما في تنفيذ تلقائي أبداً: كل شي بيغيّر بيانات بدو ضغطة «موافقة» من المالك.
(function(){
 const key='nara-manager-memory', logKey='nara-manager-decisions';
 const memory=JSON.parse(localStorage.getItem(key)||'{}'), decisions=JSON.parse(localStorage.getItem(logKey)||'[]');
 // كان في مفتاح «تنفيذ المهام الآمنة تلقائياً» — ما حدا كان يقراه، وبيخالف قاعدة «الوكلاء للقراءة والاقتراح بس»: انشال
 try{localStorage.removeItem('nara-safe-auto-actions')}catch(e){}
 const T={
  ar:{title:'مركز قيادة المدير الذكي',health:'صحة المشروع',checking:'عم نفحص…',memory:'🧠 ذاكرة المشروع',memoryPh:'قراراتك وتفضيلاتك: الضرائب، الطباعة، الطاولات…',saveMemory:'احفظ الذاكرة',log:'📋 سجل القرارات',noLog:'ما في قرارات مسجّلة.',clearLog:'امسح السجل',
   rights:'🛡 الصلاحيات',rightsText:'الوكلاء بيقرأوا وبيقترحوا بس. أي شي بيغيّر بيانات (دفع، حذف، ضرايب، مخزون، قيود) ما بيصير إلا بعد ضغطتك على «موافقة».',
   screen:'🖥 مراقبة المشروع',screenText:'مشاركة تبويب من صفحات Flamo بس، مش كل الكمبيوتر.',share:'شارك شاشة المشروع',stop:'وقّف المشاركة',pickTab:'اختار تبويب من صفحات Flamo بس.',
   healthFail:'ما قدرنا نفحص ملفات المشروع.',healthBad:'في {n} أخطاء بملفات JavaScript.',healthOk:'الفحص نجح؛ ما في أخطاء بالكود.',
   exec:'⚙ تنفيذ آمن',execText:'جرّب أمر تجريبي — بيتنفّذ بس بعد موافقتك.',preview:'معاينة فاتورة تجريبية',approve:'✅ موافقة وتنفيذ',previewFail:'ما قدرنا نعمل المعاينة.',previewReady:'المعاينة جاهزة: {p} — {c} €. ما بيتغيّر شي قبل ما تضغط «موافقة».',done:'تنفّذ بعد موافقتك: {n}',execFail:'ما تنفّذ.',memorySaved:'انحفظت ذاكرة المشروع'},
  de:{title:'Steuerzentrale des KI-Managers',health:'Projekt-Gesundheit',checking:'Wird geprüft…',memory:'🧠 Projekt-Gedächtnis',memoryPh:'Deine Entscheidungen und Vorlieben: Steuern, Drucken, Tische…',saveMemory:'Gedächtnis speichern',log:'📋 Entscheidungsprotokoll',noLog:'Noch keine Entscheidungen.',clearLog:'Protokoll leeren',
   rights:'🛡 Rechte',rightsText:'Die Agenten lesen und schlagen nur vor. Alles, was Daten ändert (Zahlung, Löschen, Steuern, Lager, Buchungen), passiert erst nach deinem Klick auf «Freigeben».',
   screen:'🖥 Projekt beobachten',screenText:'Nur einen Tab mit Flamo-Seiten teilen, nicht den ganzen Computer.',share:'Projekt-Bildschirm teilen',stop:'Teilen beenden',pickTab:'Bitte nur einen Tab mit Flamo-Seiten wählen.',
   healthFail:'Projektdateien konnten nicht geprüft werden.',healthBad:'{n} Fehler in JavaScript-Dateien.',healthOk:'Prüfung erfolgreich; keine Syntaxfehler.',
   exec:'⚙ Sicher ausführen',execText:'Test-Befehl ausprobieren — wird erst nach deiner Freigabe ausgeführt.',preview:'Test-Rechnung ansehen',approve:'✅ Freigeben und ausführen',previewFail:'Vorschau nicht möglich.',previewReady:'Vorschau bereit: {p} — {c} €. Nichts wird geändert, bevor du «Freigeben» drückst.',done:'Nach deiner Freigabe ausgeführt: {n}',execFail:'Nicht ausgeführt.',memorySaved:'Projekt-Gedächtnis gespeichert'},
  en:{title:'AI manager control centre',health:'Project health',checking:'Checking…',memory:'🧠 Project memory',memoryPh:'Your decisions and preferences: taxes, printing, tables…',saveMemory:'Save memory',log:'📋 Decision log',noLog:'No decisions recorded yet.',clearLog:'Clear log',
   rights:'🛡 Permissions',rightsText:'Agents only read and suggest. Anything that changes data (payment, deleting, taxes, stock, bookings) only happens after you click «Approve».',
   screen:'🖥 Watch the project',screenText:'Share one Flamo tab only, not the whole computer.',share:'Share project screen',stop:'Stop sharing',pickTab:'Please pick a tab with Flamo pages only.',
   healthFail:'Could not check the project files.',healthBad:'{n} errors in JavaScript files.',healthOk:'Check passed; no syntax errors.',
   exec:'⚙ Safe execution',execText:'Try a test command — it only runs after your approval.',preview:'Preview test invoice',approve:'✅ Approve and run',previewFail:'Could not create the preview.',previewReady:'Preview ready: {p} — {c} €. Nothing changes until you press «Approve».',done:'Run after your approval: {n}',execFail:'Not executed.',memorySaved:'Project memory saved'}
 };
 const lang=()=>{const l=localStorage.getItem('nara.language');return T[l]?l:'ar'};
 const t=(k,v)=>String((T[lang()]||T.ar)[k]||T.ar[k]||k).replace(/\{(\w+)\}/g,(_,x)=>v&&v[x]!=null?v[x]:'');
 const loc=()=>({ar:'ar-SY',de:'de-DE',en:'en-GB'}[lang()]);
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 const panel=document.createElement('section');panel.className='card manager-command-center';
 panel.innerHTML='<h2 data-cc="title"></h2><div class="manager-health"><b data-cc="health"></b><strong id="manager-health-score">—</strong><span id="manager-health-note"></span></div>'
  +'<div class="manager-command-grid">'
  +'<article><b data-cc="memory"></b><textarea id="manager-memory"></textarea><button id="save-manager-memory" data-cc="saveMemory"></button></article>'
  +'<article><b data-cc="log"></b><div id="manager-decision-log"></div><button id="clear-manager-log" data-cc="clearLog"></button></article>'
  +'<article class="cc-rights"><b data-cc="rights"></b><p data-cc="rightsText"></p></article>'
  +'<article><b data-cc="screen"></b><p data-cc="screenText"></p><button id="project-screen-share" data-cc="share"></button><button id="project-screen-stop" data-cc="stop" hidden></button><video id="project-screen-preview" muted autoplay playsinline hidden></video></article>'
  +'<article class="cc-exec"><b data-cc="exec"></b><p id="manager-exec-status"></p><button id="manager-demo-preview" data-cc="preview"></button><button id="manager-demo-confirm" class="cc-approve" data-cc="approve" hidden></button></article>'
  +'</div>';
 const style=document.createElement('style');
 style.textContent='.manager-command-center .cc-rights{border:2px solid #2f9e5b;background:#f0faf3}.manager-command-center .cc-approve{background:#2f9e5b!important;color:#fff!important;font-weight:800;border:0;border-radius:10px;min-height:44px;padding:0 16px;box-shadow:0 0 0 3px #2f9e5b33}';
 document.head.appendChild(style);
 const anchor=document.querySelector('#manager-chat');if(anchor)anchor.before(panel);
 const mem=panel.querySelector('#manager-memory');mem.value=Object.entries(memory).map(([k,v])=>k+': '+v).join('\n');
 let healthState=null,execState={key:'execText',vars:null};
 function renderLog(){const box=panel.querySelector('#manager-decision-log');box.innerHTML=decisions.length?decisions.slice(-8).reverse().map(x=>'<div><b>'+esc(x.at)+'</b> — '+esc(x.text)+'</div>').join(''):esc(t('noLog'))}
 function paint(){
  panel.querySelectorAll('[data-cc]').forEach(el=>{el.textContent=t(el.dataset.cc)});
  mem.placeholder=t('memoryPh');
  panel.querySelector('#manager-health-note').textContent=healthState?t(healthState.key,healthState.vars):t('checking');
  panel.querySelector('#manager-exec-status').textContent=t(execState.key,execState.vars);
  renderLog();
 }
 const stamp=()=>new Date().toLocaleString(loc(),{dateStyle:'short',timeStyle:'short'});
 const note=text=>{decisions.push({at:stamp(),text});localStorage.setItem(logKey,JSON.stringify(decisions));renderLog()};
 panel.querySelector('#save-manager-memory').onclick=()=>{const next={};mem.value.split(/\n/).map(x=>x.split(':')).forEach(([k,...v])=>{if(k&&v.length)next[k.trim()]=v.join(':').trim()});localStorage.setItem(key,JSON.stringify(next));note(t('memorySaved'))};
 panel.querySelector('#clear-manager-log').onclick=()=>{decisions.length=0;localStorage.setItem(logKey,'[]');renderLog()};
 const share=panel.querySelector('#project-screen-share'),stop=panel.querySelector('#project-screen-stop'),video=panel.querySelector('#project-screen-preview');let stream=null;
 share.onclick=async()=>{try{stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false});video.srcObject=stream;video.hidden=false;share.hidden=true;stop.hidden=false;stream.getVideoTracks()[0].addEventListener('ended',()=>stop.click())}catch(e){alert(t('pickTab'))}};
 stop.onclick=()=>{stream?.getTracks().forEach(x=>x.stop());stream=null;video.srcObject=null;video.hidden=true;share.hidden=false;stop.hidden=true};
 async function health(){let score=40;healthState={key:'healthFail'};try{const r=await fetch('/api/project-health',{cache:'no-store'}),j=await r.json();score=Number(j.score||0);healthState=j.issues?.length?{key:'healthBad',vars:{n:j.issues.length}}:{key:'healthOk'}}catch(e){}panel.querySelector('#manager-health-score').textContent=score+'/100';paint()}
 const status=panel.querySelector('#manager-exec-status'),preview=panel.querySelector('#manager-demo-preview'),confirm=panel.querySelector('#manager-demo-confirm');let pending=false;
 preview.onclick=async()=>{const r=await fetch('/api/manager-execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create-demo-invoice',confirm:false})}),j=await r.json().catch(()=>({}));if(!r.ok){execState={key:'previewFail'};status.textContent=j.error||t('previewFail');return}pending=true;execState={key:'previewReady',vars:{p:j.preview.product.name,c:(j.preview.product.priceCents/100).toFixed(2)}};confirm.hidden=false;paint()};
 // التنفيذ بس بهالزر (ضغطة المالك) — ما في أي طريق أوتوماتيك
 confirm.onclick=async()=>{if(!pending)return;const r=await fetch('/api/manager-execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create-demo-invoice',confirm:true})}),j=await r.json().catch(()=>({}));confirm.hidden=true;pending=false;if(r.ok){execState={key:'done',vars:{n:j.invoice.invoiceNumber}};paint();note(t('done',{n:j.invoice.invoiceNumber}))}else{execState={key:'execFail'};paint();if(j.error)status.textContent=j.error}};
 window.addEventListener('nara-language-changed',paint);
 paint();health();
})();
