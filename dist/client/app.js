'use strict';
const $ = s => document.querySelector(s);
const money = cents => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let category='Beef Burger', mode='pickup', basket=[], current=null, returnFocus=null, toastTimer, editingIndex=null, draftExtras={};
const guideState={mood:'crispy',people:'solo',history:[],draft:[]};
let guideBusy=false;
const guideLanguage=()=>localStorage.getItem('nara-language')||'de';
const uiText={de:{menu:'Speisekarte',highlights:'Highlights',club:'NARA Club',location:'Viersen',cart:'Warenkorb',hunger:'WORAUF HAST DU LUST?',search:'Suchen',menuNote:'NARA Menüvorschau.',guide:'NARA Guide',guideTitle:'SAG MIR DEINEN HUNGER.',guideLead:'Ich nehme deine Bestellung Schritt für Schritt auf.',choose:'Auswählen +',details:'Details ansehen',unavailable:'Nicht verfügbar',noResults:'Kein passendes Gericht.'},en:{menu:'Menu',highlights:'Highlights',club:'NARA Club',location:'Viersen',cart:'Cart',hunger:'WHAT ARE YOU CRAVING?',search:'Search',menuNote:'NARA menu preview.',guide:'NARA Guide',guideTitle:'TELL ME YOUR CRAVING.',guideLead:'I’ll guide your order step by step.',choose:'Choose +',details:'View details',unavailable:'Unavailable',noResults:'No matching dish.'},ar:{menu:'القائمة',highlights:'الأبرز',club:'نادي NARA',location:'فيرسن',cart:'السلة',hunger:'ماذا تشتهي؟',search:'بحث',menuNote:'معاينة قائمة NARA.',guide:'دليل NARA',guideTitle:'أخبرني بما تشتهيه.',guideLead:'سأرشدك خطوة بخطوة.',choose:'اختيار +',details:'عرض التفاصيل',unavailable:'غير متوفر',noResults:'لا يوجد طبق مطابق.'}};const t=key=>uiText[guideLanguage()]?.[key]||uiText.de[key]||key;const localizedCategory=name=>({ 'Fried Chicken':{en:'Fried Chicken',ar:'دجاج مقلي'},'Beef Burger':{en:'Beef Burger',ar:'برغر اللحم'},'Chicken Burger':{en:'Chicken Burger',ar:'برغر الدجاج'},'French Tacos':{en:'French Tacos',ar:'تاكو فرنسي'},'Dips':{en:'Dips',ar:'صلصات'},'Desserts':{en:'Desserts',ar:'حلويات'} }[name]?.[guideLanguage()]||name);
function applyLanguage(value){const language=['de','ar','en'].includes(value)?value:'de';localStorage.setItem('nara-language',language);document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';const picker=$('#site-language');if(picker)picker.value=language;const prompt=$('#guide-prompt');if(prompt)prompt.placeholder=language==='ar'?'مثال: نحن ثلاثة أشخاص ونريد دجاجاً':language==='en'?'e.g. We are three people and want chicken':'z. B. Wir sind zu zweit und möchten Burger';document.querySelectorAll('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;if(t(key))el.textContent=t(key);});const title=$('#guide-title'),lead=$('.guide-lead');if(title)title.textContent=t('guideTitle');if(lead)lead.textContent=t('guideLead');renderMenu?.();}
const productPhoto=$('#product-photo');let productPhotoFrame=$('#product-photo-frame');
if(!productPhotoFrame){productPhotoFrame=document.createElement('div');productPhotoFrame.id='product-photo-frame';productPhotoFrame.className='product-image-wrap';productPhoto.parentElement.insertBefore(productPhotoFrame,productPhoto);productPhotoFrame.append(productPhoto);}
function extrasPrice(item,extras={}){return Object.entries(extras).reduce((sum,[id,q])=>{const dip=item.dips?.find(d=>d.id===id);if(!dip||dip.deposit===null||dip.unavailable||!Number.isInteger(q)||q<0||q>(dip.required?1:20))throw Error('INVALID_DIP');return sum+(dip.cents+(dip.deposit||0))*q;},0);}
function groupVisible(item,group,extras={},meal=false){const triggers=item.conditionalGroups?.[group];const triggerVisible=!triggers||triggers.some(id=>extras[id]===1);return triggerVisible&&(!item.mealGroups?.includes(group)||meal);}
function requiredComplete(item,extras={},meal=false){return (item.requiredGroups||[]).filter(group=>groupVisible(item,group,extras,meal)).every(group=>item.dips.filter(d=>d.group===group&&extras[d.id]===1&&!d.unavailable&&d.deposit!==null).length===1);}
function extrasKey(extras={}){return JSON.stringify(Object.entries(extras).filter(([,q])=>q>0).sort(([a],[b])=>a.localeCompare(b)));}
function unitPrice(item,meal,extras={}){return (meal&&Number.isInteger(item.menuCents)?item.menuCents:item.cents)+extrasPrice(item,extras);}
function extrasText(item,extras={}){return Object.entries(extras).filter(([,q])=>q>0).map(([id,q])=>{const d=item.dips.find(d=>d.id===id);return (d.group||'Dips')+': '+q+' × '+d.name+' (+'+money(d.cents*q)+(d.deposit?' + '+money(d.deposit*q)+' Pfand':'')+')';}).join(', ');}
function kitchenSummary(){return basket.map(line=>{
 const item=catalog.find(p=>p.id===line.id),rows=new Map();
 for(const [id,q] of Object.entries(line.extras||{})){if(!q)continue;const d=item.dips.find(d=>d.id===id);const included=id.startsWith('included-');const key=(included?'Inklusive':d.group||'Dips')+': '+d.name;const row=rows.get(key)||{quantity:0,cents:0};row.quantity+=q*line.quantity;row.cents+=(d.cents+(d.deposit||0))*q*line.quantity;rows.set(key,row);}
 return '<article class="kitchen-item"><h3>'+line.quantity+' × '+escapeHtml(item.n)+'</h3><ul>'+Array.from(rows,([label,row])=>'<li>'+row.quantity+' × '+escapeHtml(label)+' — '+money(row.cents)+'</li>').join('')+'</ul>'+(line.note?'<p>Wunsch: '+escapeHtml(line.note)+'</p>':'')+'</article>';
 }).join('');}
function depositTotal(){return basket.reduce((sum,line)=>{const item=catalog.find(p=>p.id===line.id);return sum+Object.entries(line.extras||{}).reduce((s,[id,q])=>s+(item.dips.find(d=>d.id===id).deposit||0)*q,0)*line.quantity;},0);}
function subtotal(){return basket.reduce((sum,line)=>sum+unitPrice(catalog.find(x=>x.id===line.id),line.meal,line.extras)*line.quantity,0);}
function renderDips(){
 const meal=$('#product-form').elements.variant.value==='meal',dips=current?.dips||[],groups=[...new Set(dips.map(d=>d.group||'Dips'))].filter(group=>groupVisible(current,group,draftExtras,meal));
 const opened=new Set(Array.from(document.querySelectorAll('#dip-options details[open]')).map(d=>d.dataset.group));
 $('#dip-options').innerHTML=groups.length?'<p class="caption">Auswahl pro Portion; die Anzahl der Gerichte multipliziert auch die Extras. Pflichtfelder: jeweils eine Auswahl, auch „Ohne“ ist möglich.</p>'+groups.map((group,i)=>{
 const required=current.requiredGroups?.includes(group)&&groupVisible(current,group,draftExtras,meal);
 return '<details data-group="'+group+'" '+(opened.has(group)?'open':'')+'><summary>'+group+' <small>'+(required?'1 Pflichtfeld':'Optional')+'</small></summary>'+dips.filter(d=>(d.group||'Dips')===group).map(d=>{
 const blocked=d.deposit===null||d.unavailable;
 const label='<b>'+escapeHtml(d.name)+'</b><span>'+(d.priceUnknown?'Preis nicht angegeben':d.cents?'+'+money(d.cents):'Ohne Aufpreis')+(d.deposit?' + '+money(d.deposit)+' Pfand':'')+'</span>'+(d.detail?'<small>'+escapeHtml(d.detail)+'</small>':'')+(blocked?'<small>'+(d.unavailable?'Nicht verfügbar':'Pfand noch zu bestätigen · nicht wählbar')+'</small>':'');
 if(required)return '<label class="dip-row"><div>'+label+'</div><input type="radio" name="'+escapeHtml(group)+'" data-choice="'+d.id+'" '+(draftExtras[d.id]?'checked ':'')+(blocked?'disabled ':'')+'required></label>';
 return '<div class="dip-row"><div>'+label+'</div><div class="qty"><button type="button" data-dip="'+d.id+'" data-step="-1" '+(!draftExtras[d.id]?'disabled':'')+' aria-label="'+escapeHtml(d.name)+' weniger">−</button><output aria-label="Menge '+escapeHtml(d.name)+'">'+(draftExtras[d.id]||0)+'</output><button type="button" data-dip="'+d.id+'" data-step="1" '+(draftExtras[d.id]>=20||blocked?'disabled':'')+' aria-label="'+escapeHtml(d.name)+' hinzufügen">+</button></div></div>';
 }).join('')+'</details>';
 }).join(''):'';
}
function selectRequired(id){const option=current?.dips?.find(d=>d.id===id&&d.required&&!d.unavailable&&d.deposit!==null);if(!option)return false;for(const d of current.dips.filter(d=>d.group===option.group))delete draftExtras[d.id];draftExtras[id]=1;const meal=$('#product-form').elements.variant.value==='meal';for(const group of Object.keys(current.conditionalGroups||{}))if(!groupVisible(current,group,draftExtras,meal))for(const d of current.dips.filter(d=>d.group===group))delete draftExtras[d.id];renderDips();updateProductPrice();return true;}
function openDialog(id){returnFocus=document.activeElement; const dialog=$(id); document.querySelectorAll('dialog[open]').forEach(x=>x.close());dialog.showModal();}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2500);}
function guideAllergenAnswer(item){return typeof allergenAnswerForItem==='function'?allergenAnswerForItem(item):'Für dieses Produkt liegen noch keine vom Lieferanten freigegebenen Allergenangaben vor. Ich kann deshalb keine sichere Zusage geben — bitte direkt im Restaurant nachfragen.';}
function guideAllergenStatus(item){return typeof allergenStatusForItem==='function'?allergenStatusForItem(item):'Allergenangaben noch nicht vom Lieferanten bestätigt.';}
function guideWords(value){return String(value||'').toLocaleLowerCase('de').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(word=>word.length>2);}
function guideItem(text,available){
 const words=guideWords(text);let best=null,bestScore=0;
 for(const item of available){const hay=(item.n+' '+item.d).toLocaleLowerCase('de');const name=item.n.toLocaleLowerCase('de');let score=0;
  if(name&&String(text).toLocaleLowerCase('de').includes(name))score+=20;
  for(const word of words)if(hay.includes(word))score+=word.length>4?3:1;
  if(score>bestScore){best=item;bestScore=score;}
 }
 return bestScore>=3?best:null;
}
function guideOption(item,text){
 const normalized=String(text||'').toLocaleLowerCase('de');
 return (item?.dips||[]).find(option=>option.name&&normalized.includes(option.name.toLocaleLowerCase('de')))||null;
}
function guideHas(text,terms){return terms.some(term=>text.includes(term));}
function guideLocalAnswer(match,text){
 const lower=String(text||'').toLocaleLowerCase('de');
 const allergenQuestion=guideHas(lower,['allerg','gluten','laktose','milch','ei ','eier','sesam','soja','senf','nuss','nüsse','حساس','غلوتين','حليب','بيض','سمسم','صويا','مكسر']);
 const sauceQuestion=guideHas(lower,['sauce','soße','sosse','dip','ketchup','mayo','mayonnaise','aioli','barbecue','bbq','صوص','مايونيز','كاتشاب']);
 const priceQuestion=guideHas(lower,['preis','kost','teuer','extra','hinzu','add','plus','كم','سعر','اضف','ضيف']);
 if(allergenQuestion)return {match,reply:guideAllergenAnswer(match),action:'Produktdetails öffnen'};
 if(sauceQuestion){
  const sauces=(match.dips||[]).filter(option=>/sauce|soße|sosse|dip|ketchup|mayo|aioli|bbq/i.test(option.name||''));
  const option=guideOption(match,lower);
  if(option){const extra=option.cents? ' Der Preis ändert sich um '+money(option.cents)+' pro Portion.':' Ohne Aufpreis.';return {match,reply:option.name+' ist bei '+match.n+' in der Auswahl verfügbar.'+extra+' Ich öffne die echte Auswahl, damit du bestätigst.',action:'Auswahl öffnen'};}
  if(sauces.length)return {match,reply:'Bei '+match.n+' kannst du diese Sauce-Optionen prüfen: '+sauces.map(option=>option.name+(option.cents?' (+'+money(option.cents)+')':'')).join(', ')+'. Ich öffne die Auswahl, damit du nur verfügbare Optionen siehst.',action:'Sauce auswählen'};
  return {match,reply:'Für '+match.n+' sind in der bestätigten Auswahl noch keine einzelnen Sauce-Optionen hinterlegt. Ich erfinde keine Änderung — bitte direkt im Restaurant nachfragen.',action:'Produktdetails öffnen'};
 }
 if(priceQuestion){const option=guideOption(match,lower);if(option)return {match,reply:match.n+' kostet '+money(match.cents)+'. '+option.name+' kostet '+(option.cents?'zusätzlich '+money(option.cents):'keinen Aufpreis')+' pro Portion. Zusammen: '+money(match.cents+(option.cents||0))+'.',action:'Auswahl öffnen'};}
 return null;
}
function fireMatch(askLive=false){
 const text=($('#guide-prompt')?.value||'').toLocaleLowerCase('de');
 const available=catalog.filter(item=>!item.hidden&&!item.unavailable&&!item.optionsPending);
 const includes=(words)=>words.some(word=>text.includes(word));
 const pick=(predicate)=>available.find(predicate);
 const spicy=item=>/(scharf|chili|jalapeno|hot)/i.test(item.n+' '+item.d);
 const chicken=item=>/(chicken|hähn|crispy|wings|tenders|nuggets)/i.test(item.n+' '+item.c);
 const beef=item=>/(beef|rind|smash)/i.test(item.n+' '+item.c);
 const sharing=item=>/(Chicken Buckets|Crispyburger Bundels)/.test(item.c);
 const veggie=item=>/(Veggie Burger|Falafel)/.test(item.c);
 const wantsChicken=includes(['chicken','hähn','دجاج','كريسبي','crispy']);
 const wantsBeef=includes(['beef','burger','burgers','hamburger','لحم','برغر','برجر']);
 const wantsVeggie=includes(['vegan','vegetar','falafel','نبات']);
 const wantsSpicy=guideState.mood==='spicy'||includes(['scharf','spicy','hot','حار']);
 const wantsSharing=guideState.people!=='solo'||includes(['zwei','sharing','famil','freunde','اثنين','شخصين','عائلة']);
 let match;
 if(wantsVeggie)match=pick(veggie);
 else if(wantsSharing)match=pick(item=>sharing(item)&&(wantsSpicy?spicy(item):true))||pick(sharing);
 else if(wantsSpicy)match=pick(item=>spicy(item)&&(wantsChicken?chicken(item):wantsBeef?beef(item):true))||pick(spicy);
 else if(wantsChicken)match=pick(chicken);
 else if(wantsBeef)match=pick(item=>item.c==='Beef Burger')||pick(beef);
 else if(guideState.mood==='comfort')match=pick(item=>item.c==='Beef Burger')||pick(beef);
 else match=pick(item=>item.c==='Fried Chicken')||pick(chicken)||available[0];
 const direct=guideItem(text,available);if(direct)match=direct;
 if(!match)return;
 const localAnswer=guideLocalAnswer(match,text);
 if(localAnswer){renderGuideResult(localAnswer.match,localAnswer.reply,localAnswer.action);return;}
 const why=wantsSharing?'Gemacht zum Teilen und direkt aus deinen echten Angeboten gewählt.':wantsSpicy?'Dein scharfer Match—mit echtem Fire-Faktor.':wantsChicken?'Knusprig, saftig und passend zu deinem Chicken-Moment.':'Ein echter NARA-Favorit, ausgewählt nach deinem Hunger.';
 renderGuideResult(match,why);
 if(askLive)askGeminiGuide(match);
}
function appendGuideMessage(role,text){const chat=$('#guide-chat');if(!chat||!text)return;const bubble=document.createElement('p');bubble.className=role==='user'?'user-bubble':'assistant-bubble';bubble.textContent=text;chat.appendChild(bubble);chat.scrollTop=chat.scrollHeight;}
function renderGuideDraft(){const box=$('#guide-draft');if(!box)return;if(!guideState.draft.length){box.hidden=true;box.innerHTML='';return;}const lines=guideState.draft.map(line=>{const item=catalog.find(entry=>entry.id===line.id);return item?'<li><span>'+line.quantity+' × '+escapeHtml(item.n)+'</span><b>'+money(unitPrice(item,false,{})*line.quantity)+'</b></li>':'';}).join('');const total=guideState.draft.reduce((sum,line)=>{const item=catalog.find(entry=>entry.id===line.id);return sum+(item?unitPrice(item,false,{})*line.quantity:0);},0);box.hidden=false;box.innerHTML='<span>DEIN BESTELLENTWURF</span><ol>'+lines+'</ol><div><b>Zwischensumme</b><b>'+money(total)+'</b></div><p>Du kannst alles noch anpassen. Erst nach Bestätigung kommt es in deinen Warenkorb.</p><button class="button orange" type="button" data-guide-confirm>Entwurf bestätigen →</button><button class="guide-text-button" type="button" data-guide-clear>Entwurf verwerfen</button>';}
function addGuideDraft(id){const item=catalog.find(entry=>entry.id===id&&!entry.hidden&&!entry.unavailable&&!entry.optionsPending);if(!item)return;const existing=guideState.draft.find(line=>line.id===id);if(existing)existing.quantity=Math.min(20,existing.quantity+1);else guideState.draft.push({id,quantity:1});renderGuideDraft();toast(item.n+' ist im Entwurf.');}
function confirmGuideDraft(){if(!guideState.draft.length)return;for(const line of guideState.draft){const item=catalog.find(entry=>entry.id===line.id);if(!item)continue;const existing=basket.find(entry=>entry.id===line.id&&!entry.meal&&!entry.drink&&!entry.note&&extrasKey(entry.extras||{})==='');if(existing)existing.quantity=Math.min(20,existing.quantity+line.quantity);else basket.push({id:line.id,quantity:line.quantity,meal:false,drink:'',note:'',extras:{}});}guideState.draft=[];renderGuideDraft();renderCart();$('#guide-dialog').close();openDialog('#cart-dialog');toast('Entwurf wurde in den Warenkorb übernommen.');}
function renderGuideResult(match,reply,action='Produkt anpassen'){const result=$('#guide-result');result.hidden=false;result.innerHTML='<span>NARA ANTWORT</span><h3>'+escapeHtml(match.n)+'</h3><p>'+escapeHtml(reply)+'<br><b>'+money(match.cents)+'</b></p><button class="button orange" type="button" data-guide-draft="'+match.id+'">Als Entwurf vormerken</button><button class="guide-text-button" type="button" data-recommend="'+match.id+'">'+escapeHtml(action)+' →</button>';}
async function askGeminiGuide(fallbackMatch){
 if(location.protocol==='file:')return;
 if(guideBusy)return;
 guideBusy=true;
 const result=$('#guide-result');result.hidden=false;result.innerHTML='<span>NARA LIVE GUIDE</span><h3>ICH FINDE DEINEN MATCH …</h3><p>Ich prüfe die echte NARA Karte.</p>';
 const prompt=$('#guide-prompt');
 const message=prompt.value.trim();
 if(!message){guideBusy=false;return;}
 prompt.value='';
 const askButton=$('#find-fire-match');if(askButton)askButton.disabled=true;
 const cart=basket.map(line=>{const item=catalog.find(entry=>entry.id===line.id);return item?{name:item.n,quantity:line.quantity,total:money(unitPrice(item,line.meal,line.extras)*line.quantity)}:null;}).filter(Boolean);
 const queryWords=message.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
 const needs={dips:/dip|sauce|ketchup|mayo|mayonnaise|aioli|صوص|مايونيز|كاتشاب/i.test(message),drinks:/drink|cola|fanta|water|red bull|getränk|شراب|مشروب/i.test(message),desserts:/dessert|donut|muffin|sweet|حلو|دونات/i.test(message)};
 const categorySignals={
  'French Tacos':/\btacos?\b|tortilla|تاكو/i,
  'Beef Burger':/beef|rind|smash|لحم/i,
  'Chicken Burger':/chicken|hähnchen|crispy|جاج|دجاج/i,
  'Fried Chicken':/nugget|fillet|fried|كريسبي|مقلي/i,
  'Korean & Fusion Wings':/wing|korean|وينغز|جناح/i,
  'Falafel':/falafel|فلافل/i,
  'Hot Dogs':/hot\s?dog|هوت\s?دوغ/i,
  'Sandwiches':/sandwich|shawarma|baguette|شاورما|سندويش/i
 };
 const candidates=catalog.filter(item=>!item.hidden&&!item.unavailable&&!item.optionsPending).map((item,index)=>{const text=(item.n+' '+item.c+' '+item.d).toLocaleLowerCase();let score=item.id===fallbackMatch.id?50:0;queryWords.forEach(word=>{if(text.includes(word.toLocaleLowerCase()))score+=word.length>4?5:2;});if(categorySignals[item.c]?.test(message))score+=120;if(needs.dips&&item.c==='Dips')score+=30;if(needs.drinks&&item.c==='Alkoholfreie Getränke')score+=30;if(needs.desserts&&item.c==='Desserts')score+=30;return {item,index,score};}).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,10).map(({item})=>{const record=typeof allergenRecord==='function'?allergenRecord('item',item.id):null;return {id:item.id,name:item.n,category:item.c,description:String(item.d||'').slice(0,180),price:money(item.cents),allergens:record?.status==='confirmed'?'confirmed: '+record.contains.join(', '):'not confirmed'};});
 appendGuideMessage('user',message);try{const response=await fetch('/api/nara-guide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,mood:guideState.mood,people:guideState.people,matchId:fallbackMatch.id,history:guideState.history.slice(-6),cart,candidates})});const data=await response.json();if(!response.ok)throw Error(data.error);const match=catalog.find(item=>item.id===data.matchId&&!item.hidden&&!item.unavailable);if(!match)throw Error('Invalid match');guideState.history.push({role:'user',text:message},{role:'assistant',text:data.reply});guideState.history=guideState.history.slice(-6);appendGuideMessage('assistant',data.reply);renderGuideResult(match,data.reply);}catch{const reply='Der Live Guide antwortet gerade nicht. Bitte versuche es gleich noch einmal.';appendGuideMessage('assistant',reply);renderGuideResult(fallbackMatch,reply);}finally{guideBusy=false;if(askButton)askButton.disabled=false;prompt.focus();}
}
const heroSlides=[
 {img:'assets/fried-menu.png',alt:'Crispy Chicken Menü',eyebrow:'NARA · CRISPY CHICKEN',title:'CRISPY.<br><em>CHICKEN.</em>',description:'Knusprig. Saftig. Heiß.<br>Dein NARA Moment.',caption:'CRISPY CHICKEN / WINGS / BUCKETS',cta:'Crispy Chicken entdecken',category:'Fried Chicken'},
 {img:'assets/wings-yangnyeom.png',alt:'Korean Wings',eyebrow:'NARA · KOREAN & FUSION',title:'WINGS.<br><em>WITH FIRE.</em>',description:'Koreanische Glaze. Echter Crunch.<br>Wähle deine Sauce.',caption:'KOREAN WINGS / FUSION / SAUCES',cta:'Wings entdecken',category:'Korean & Fusion Wings'},
 {img:'assets/bucket-40.png',alt:'Chicken Bucket',eyebrow:'NARA · ZUM TEILEN',title:'PASS.<br><em>THE BUCKET.</em>',description:'Mehr Crunch für alle.<br>Dips nach deiner Wahl.',caption:'BUCKETS / DEALS / SHARING',cta:'Buckets entdecken',category:'Chicken Buckets & Deals (New)'},
 {img:'assets/smashed-beef.png',alt:'Smashed Beef Burger',eyebrow:'NARA · BEEF BURGER',title:'SMASH.<br><em>BITE.</em>',description:'Saftiges Beef. Volles Feuer.<br>Als Burger oder Menü.',caption:'BEEF BURGER / CHICKEN BURGER / MENÜ',cta:'Burger entdecken',category:'Beef Burger'}
];
let heroIndex=0,heroTimer;
function setHeroSlide(index){heroIndex=(index+heroSlides.length)%heroSlides.length;const slide=heroSlides[heroIndex],image=$('#hero-image');image.classList.add('is-changing');setTimeout(()=>{image.src=slide.img;image.alt=slide.alt;image.classList.remove('is-changing');},140);$('#hero-eyebrow').textContent=slide.eyebrow;$('#hero-title').innerHTML=slide.title;$('#hero-description').innerHTML=slide.description;$('#hero-caption').textContent=slide.caption;$('#hero-link').firstChild.textContent=slide.cta+' ';$('#hero-link').dataset.category=slide.category;document.querySelectorAll('[data-hero-slide]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.heroSlide)===heroIndex)));}
function startHeroTimer(){if(typeof setInterval==='function'&&(typeof window==='undefined'||!window.matchMedia||window.matchMedia('(prefers-reduced-motion: no-preference)').matches)){clearInterval(heroTimer);heroTimer=setInterval(()=>setHeroSlide(heroIndex+1),5000);}}
function renderMenu(){
 const names=[...new Set(catalog.filter(x=>!x.hidden).map(x=>x.c).filter(name=>!['Angebot','Angebot 3 für 2'].includes(name)))];
 const categoryOrder=['Chicken Buckets & Deals (New)','Fried Chicken','Korean & Fusion Wings','Crispyburger Bundels','Beef Burger','Chicken Burger','Veggie Burger','Kindergerichte','French Tacos','Sandwiches','Hot Dogs','Falafel','Specials','Salate','Dips','Frappuccino Series','Desserts','Alkoholfreie Getränke'];
 names.sort((a,b)=>{const ai=categoryOrder.indexOf(a),bi=categoryOrder.indexOf(b);return (ai<0?categoryOrder.length:ai)-(bi<0?categoryOrder.length:bi);});
 $('#categories').innerHTML=names.map(x=>'<button data-category="'+x+'" aria-pressed="'+(category===x)+'">'+x+'</button>').join('');
 const term=$('#menu-search').value.toLocaleLowerCase('de');
 const results=catalog.filter(x=>!x.hidden&&(term||x.c===category)&&(x.n+' '+x.d).toLocaleLowerCase('de').includes(term));
 $('#menu-grid').innerHTML=results.map(x=>'<article class="food '+(x.unavailable?'is-unavailable':'')+'">'+(x.img?'<button class="food-picture" data-product="'+x.id+'" aria-label="'+escapeHtml(x.n)+' ansehen"><img src="'+x.img+'" alt="'+escapeHtml(x.n)+'" loading="lazy"></button>':'')+'<div class="food-body"><h3>'+escapeHtml(x.n)+'</h3><p>'+escapeHtml(x.d)+'</p><div class="food-bottom">'+(x.unavailable?'<strong class="unavailable">Nicht verfügbar</strong>':'<strong>'+(x.fromPrice?'ab ':'')+money(x.cents)+'</strong>')+'<button data-product="'+x.id+'" '+(x.unavailable?'disabled':'')+'>'+(x.unavailable?'Nicht verfügbar':x.optionsPending?'Details ansehen':'Auswählen +')+'</button></div></div></article>').join('')||'<div class="no-results">Kein passendes Gericht. <button id="reset-search">Suche zurücksetzen</button></div>';
}
function setMode(value){mode=value; document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mode===mode)));renderCart();}
function deliveryAddress(){return {street:$('#delivery-street')?.value.trim()||'',city:$('#delivery-city')?.value.trim()||''};}
function updateMapsCheck(){const link=$('#delivery-maps-check');if(!link)return;const address=deliveryAddress();const query=[address.street,address.city].filter(Boolean).join(', ')||'Gereonstraße 1, 41747 Viersen';link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);}
function renderCart(){
 $('#cart-count').textContent=basket.reduce((s,x)=>s+x.quantity,0);
 $('#mobile-count').textContent=$('#cart-count').textContent;
 $('#mobile-total').textContent=money(subtotal());
 $('#mobile-cart').hidden=!basket.length;
 $('#cart-total').textContent=money(subtotal());
 $('#deposit-note').textContent='Davon Pfand: '+money(depositTotal());
 $('#checkout').disabled=!basket.length;
 $('#delivery-panel').hidden=mode!=='delivery';
 updateMapsCheck();
 $('#delivery-note').textContent=mode==='pickup'?'Abholung · Gereonstraße 1, 41747 Viersen.':'Lieferung · bis 10 km rund um IUGENE · Gebühren und Termin werden beim Start bestätigt.';
 $('#cart-items').innerHTML=basket.length?basket.map((line,i)=>{
 const item=catalog.find(x=>x.id===line.id);
 return '<article class="basket-row">'+(item.img?'<img src="'+item.img+'" alt="">':'<span aria-hidden="true"></span>')+'<div><h3>'+item.n+'</h3><p>'+(line.meal?'Menü · Pommes · '+escapeHtml(line.drink):item.c==='Burger-Menü'?'Burger-Menü':'Einzelgericht')+'</p>'+(Object.keys(line.extras||{}).length?'<br>Auswahl pro Portion: '+escapeHtml(extrasText(item,line.extras)):'')+(line.note?'<p>Wunsch: '+escapeHtml(line.note)+'</p>':'')+'<div class="line-tools"><button data-edit="'+i+'">Anpassen</button><button data-remove="'+i+'" aria-label="'+item.n+' entfernen">Entfernen</button></div><div class="basket-actions"><div class="qty"><button data-line="'+i+'" data-delta="-1" aria-label="'+item.n+' weniger">−</button><span>'+line.quantity+'</span><button data-line="'+i+'" data-delta="1" '+(line.quantity>=20?'disabled':'')+' aria-label="'+item.n+' mehr">+</button></div><b>'+money(unitPrice(item,line.meal,line.extras)*line.quantity)+'</b></div></div></article>';
 }).join(''):'<div class="empty"><h3>Noch Platz für NARA.</h3><p>Wähle dein erstes Gericht aus der Speisekarte.</p><button class="button dark" data-close>Speisekarte ansehen</button></div>';
}
function mealAllowed(item){return Number.isInteger(item.menuCents);}
function productSelection(){
 const form=$('#product-form'); const meal=mealAllowed(current)&&form.elements.variant.value==='meal';
 const quantity=Number(form.elements.quantity.value);
 return {meal,quantity,drink:meal?form.elements.drink.value:'',note:form.elements.note.value.trim(),extras:{...draftExtras}};
}
function updateProductPrice(){const value=productSelection();const photo=value.meal&&current.menuImage?current.menuImage:current.img;if(photo)productPhoto.src=photo;$('#product-photo-frame').hidden=!photo;$('#drink-label').hidden=true;$('#meal-note').hidden=!value.meal;$('#add-product').disabled=!!current.optionsPending||!!current.unavailable||!requiredComplete(current,value.extras,value.meal);$('#product-total').textContent=money(unitPrice(current,value.meal,value.extras)*(Number.isInteger(value.quantity)&&value.quantity>0?value.quantity:1));}
function showProduct(id,index=null){
 current=catalog.find(x=>x.id===id);if(!current)return;
 editingIndex=index;
 draftExtras=index===null?{}:{...(basket[index].extras||{})};
 $('#product-form').reset();if(current.img)$('#product-photo').src=current.img;else $('#product-photo').removeAttribute('src');$('#product-photo').alt=current.n+'';
 $('#product-photo-frame').hidden=!current.img;
 $('#product-dialog').classList.toggle('text-product',!current.img);
 $('#source-status').textContent=current.unavailable?'Dieser Artikel ist derzeit nicht verfügbar.':(current.optionsPending?'Auswahloptionen und mögliche Aufpreise fehlen noch; nur Ansicht. ':'')+guideAllergenStatus(current);
 $('#add-product').disabled=!!current.optionsPending||!!current.unavailable;
 $('#product-name').textContent=current.n;$('#product-description').textContent=current.d;$('#single-price').textContent=(current.fromPrice?'ab ':'')+money(current.cents);
 $('#meal-option').hidden=!mealAllowed(current);$('#meal-note').hidden=true;if(mealAllowed(current)){$('#meal-price').textContent=money(current.menuCents);$('#meal-note').textContent='Als Menü: Bitte Getränk und Sauce auswählen.';}
 if(index!==null){const line=basket[index],form=$('#product-form');form.elements.variant.value=line.meal?'meal':'single';form.elements.quantity.value=line.quantity;form.elements.drink.value=line.drink||'Cola';form.elements.note.value=line.note;}
 $('#selection-label').textContent=index===null?'Hinzufügen':'Änderung speichern';
 renderDips();updateProductPrice();openDialog('#product-dialog');
}
function addSelection(){
 const value=productSelection();if(current.optionsPending||current.unavailable||!requiredComplete(current,value.extras,value.meal)||!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>20)return false;
 extrasPrice(current,value.extras);
 const match=basket.find((x,i)=>i!==editingIndex&&x.id===current.id&&x.meal===value.meal&&x.drink===value.drink&&x.note===value.note&&extrasKey(x.extras)===extrasKey(value.extras));
 if(match&&match.quantity+value.quantity>20){toast('Maximal 20 Stück pro Variante.');return false;}
 if(match){match.quantity+=value.quantity;if(editingIndex!==null)basket.splice(editingIndex,1);}else if(editingIndex!==null)basket[editingIndex]={id:current.id,...value};else basket.push({id:current.id,...value});
 editingIndex=null;
 renderCart();return true;
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a'); if(!target)return;
 if(target.hasAttribute('data-close'))target.closest('dialog').close();
 if(target.dataset.category){category=target.dataset.category==='Chicken'?'Korean & Fusion Wings':target.dataset.category;renderMenu();}
 if(target.dataset.heroSlide!==undefined){setHeroSlide(Number(target.dataset.heroSlide));startHeroTimer();}
 if(target.dataset.product)showProduct(Number(target.dataset.product));
 if(target.dataset.dip){const id=target.dataset.dip;if(current?.dips?.some(d=>d.id===id&&!d.required&&!d.unavailable&&d.deposit!==null)){const count=Math.max(0,Math.min(20,(draftExtras[id]||0)+Number(target.dataset.step)));if(count)draftExtras[id]=count;else delete draftExtras[id];renderDips();updateProductPrice();}}
 if(target.dataset.edit!==undefined){const index=Number(target.dataset.edit);if(basket[index])showProduct(basket[index].id,index);}
 if(target.dataset.remove!==undefined){basket.splice(Number(target.dataset.remove),1);renderCart();toast('Gericht entfernt.');}
 if(target.dataset.wish){const input=$('#product-form').elements.note;const text=[input.value.trim(),target.dataset.wish].filter(Boolean).join(', ');if(text.length<=120)input.value=text;else toast('Maximal 120 Zeichen für deinen Wunsch.');}
 if(target.dataset.mode)setMode(target.dataset.mode);
 if(target.dataset.delta){const line=basket[Number(target.dataset.line)];if(!line)return;line.quantity=Math.min(20,line.quantity+Number(target.dataset.delta));basket=basket.filter(x=>x.quantity>0);renderCart();}
 if(target.id==='reset-search'){$('#menu-search').value='';category='Beef Burger';renderMenu();}
 if(target.dataset.guide){category=target.dataset.guide==='Chicken'?'Korean & Fusion Wings':target.dataset.guide;$('#menu-search').value='';renderMenu();$('#guide-dialog').close();$('#menu').scrollIntoView();}
 if(target.dataset.guideChoice){guideState[target.dataset.guideChoice]=target.dataset.guideValue;document.querySelectorAll('[data-guide-choice="'+target.dataset.guideChoice+'"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guideValue===target.dataset.guideValue)));}
 if(target.id==='find-fire-match')fireMatch(true);
 if(target.dataset.guideDraft)addGuideDraft(Number(target.dataset.guideDraft));
 if(target.dataset.guideConfirm!==undefined)confirmGuideDraft();
 if(target.dataset.guideClear!==undefined){guideState.draft=[];renderGuideDraft();toast('Entwurf verworfen.');}
 if(target.dataset.recommend){$('#guide-dialog').close();showProduct(Number(target.dataset.recommend));}
 if(target.dataset.info)showInfo(target.dataset.info);
});
document.querySelectorAll('dialog').forEach(dialog=>{
 dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
});
$('#menu-search').addEventListener('input',renderMenu);
['#delivery-street','#delivery-city'].forEach(selector=>$(selector)?.addEventListener('input',updateMapsCheck));
$('#guide-prompt')?.addEventListener('input',event=>{if(event.target.value.trim().length>=4)fireMatch(false);});
$('#guide-prompt')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();fireMatch(true);}});
$('#site-language')?.addEventListener('change',event=>applyLanguage(event.target.value));applyLanguage(guideLanguage());
$('#open-cart').onclick=()=>openDialog('#cart-dialog');
$('#mobile-cart').onclick=()=>openDialog('#cart-dialog');
$('#product-form').addEventListener('input',updateProductPrice);
$('#product-form').addEventListener('change',event=>{if(event.target.dataset.choice)selectRequired(event.target.dataset.choice);if(event.target.name==='variant'){renderDips();updateProductPrice();}});
$('#product-form').onsubmit=event=>{event.preventDefault();if(addSelection()){openDialog('#cart-dialog');}};
$('#checkout').onclick=()=>{
 if(!basket.length)return;
 const address=deliveryAddress();
 $('#review-mode').textContent=mode==='pickup'?'Abholung · Gereonstraße 1, Viersen':(address.street&&address.city?'Lieferung · '+address.street+', '+address.city+' · bis 10 km werden beim Start geprüft':'Lieferung · Adresse und 10-km-Radius werden beim Start bestätigt');
 $('#review-items').innerHTML=basket.map(line=>{const item=catalog.find(x=>x.id===line.id);return '<div class="review-line"><span>'+line.quantity+' × '+item.n+(line.meal?' · Menü / '+escapeHtml(line.drink):'')+(Object.keys(line.extras||{}).length?'<br>Auswahl pro Portion: '+escapeHtml(extrasText(item,line.extras)):'')+(line.note?'<br>'+escapeHtml(line.note):'')+'</span><b>'+money(unitPrice(item,line.meal,line.extras)*line.quantity)+'</b></div>';}).join('')+'<div class="review-line"><strong>Zwischensumme</strong><b>'+money(subtotal())+'</b></div>';
 $('#review-items').innerHTML+='<div class="review-line"><span>Davon Pfand (bereits enthalten)</span><b>'+money(depositTotal())+'</b></div><section class="kitchen-summary"><h2>Küchenbon · Vorschau</h2><p>Gesamtmengen für die Küche. Nicht gesendet · keine steuerliche Rechnung.</p>'+kitchenSummary()+'</section>';openDialog('#checkout-dialog');
};
$('#back-cart').onclick=()=>openDialog('#cart-dialog');
const info={
 club:['NARA CLUB','Unser geplantes Club-Konzept:\n\n• Gutscheine für deinen nächsten Besuch\n• Vorteile für wiederkehrende Bestellungen\n• Freunde empfehlen und gemeinsam profitieren\n\nDer Club ist noch nicht aktiv. Punktewerte, Bedingungen und Angebote werden vor dem Start veröffentlicht.'],
 legal:['IMPRESSUM','Private Website-Vorschau für NARA. Anbieterangaben, Verantwortlicher und Kontakt werden vor dem öffentlichen Start ergänzt und geprüft.'],
 privacy:['DATENSCHUTZ','In dieser Vorschau werden keine Bestellungen oder Kundendaten an das Restaurant gesendet. Die Auswahl bleibt während dieser Sitzung im Browser. Produktbilder sind lokal eingebunden. Schriftarten werden von Google geladen. Eine vollständige Datenschutzerklärung wird vor dem öffentlichen Start ergänzt.'],
 allergens:['ALLERGENE','NARA zeigt Allergeninformationen erst, wenn sie aus einer Lieferantenspezifikation oder dem Original-Produktetikett bestätigt wurden. Fehlt die Bestätigung, sagt der Guide klar „nicht bestätigt“ und gibt keine Vermutung ab. Bitte bei einer Allergie immer direkt im Restaurant nachfragen.']
};
function showInfo(key){$('#info-title').textContent=info[key][0];$('#info-text').textContent=info[key][1];openDialog('#info-dialog');}
$('#club-details').onclick=()=>showInfo('club');$('#ask-ai').onclick=()=>openDialog('#guide-dialog');
$('.hero').addEventListener('mouseenter',()=>clearInterval(heroTimer));
$('.hero').addEventListener('mouseleave',startHeroTimer);
$('.hero').addEventListener('focusin',()=>clearInterval(heroTimer));
$('.hero').addEventListener('focusout',startHeroTimer);
startHeroTimer();
function syncVisibleLanguage(){const l=guideLanguage(),labels={de:{nav:['Speisekarte','Highlights','NARA Club','Viersen'],menu:'WORAUF HAST DU LUST?',search:'Suchen',note:'NARA Menüvorschau. Preise, Allergene und Verfügbarkeit werden vor dem Start bestätigt.',guide:'NARA Guide',vibe:'DEIN VIBE',who:'FÜR WEN?',ask:'NARA FRAGEN ✦',close:'Schließen'},en:{nav:['Menu','Highlights','NARA Club','Viersen'],menu:'WHAT ARE YOU CRAVING?',search:'Search',note:'NARA menu preview. Prices, allergens and availability will be confirmed before launch.',guide:'NARA Guide',vibe:'YOUR VIBE',who:'FOR WHOM?',ask:'ASK NARA ✦',close:'Close'},ar:{nav:['القائمة','الأبرز','نادي NARA','فيرسن'],menu:'ماذا تشتهي؟',search:'بحث',note:'معاينة قائمة NARA. سيتم تأكيد الأسعار ومعلومات الحساسية والتوفر قبل الإطلاق.',guide:'دليل NARA',vibe:'مزاجك',who:'لمن؟',ask:'اسأل NARA ✦',close:'إغلاق'}}[l]||labels.de;const nav=document.querySelectorAll('.top nav a');nav.forEach((e,i)=>{if(labels.nav[i])e.textContent=labels.nav[i]});const h=document.querySelector('#menu h2');if(h)h.textContent=labels.menu;const s=document.querySelector('#menu .search>span');if(s)s.textContent=labels.search;const n=document.querySelector('#menu>.caption');if(n)n.textContent=labels.note;const g=document.querySelector('#ask-ai span');if(g)g.textContent=labels.guide;const gl=document.querySelector('.guide-launch');if(gl&&!g)gl.textContent='✦ '+labels.guide;const gt=document.querySelector('#guide-title');if(gt)gt.textContent=t('guideTitle');const lead=document.querySelector('.guide-lead');if(lead)lead.textContent=t('guideLead');const legends=document.querySelectorAll('.fire-choices legend');if(legends[0])legends[0].textContent=labels.vibe;if(legends[1])legends[1].textContent=labels.who;const ask=document.querySelector('#find-fire-match');if(ask)ask.textContent=labels.ask;document.querySelectorAll('dialog .close').forEach(e=>e.setAttribute('aria-label',labels.close));document.querySelectorAll('#categories button').forEach(e=>{const key=e.dataset.category;e.textContent=localizedCategory(key)});}
document.querySelector('#site-language')?.addEventListener('change',()=>setTimeout(syncVisibleLanguage,0));syncVisibleLanguage();
const arabicMenuWords=[['Smashed Beef Burger','برغر لحم سماشد'],['Cheese Beef Burger','برغر لحم بالجبنة'],['Guacamole Beef Burger','برغر لحم بالغواكامولي'],['Original Korean Wings','أجنحة كورية أصلية'],['Cheese Chicken Burger','برغر دجاج بالجبنة'],['Taco Pollo','تاكو الدجاج'],['Falafel Menu','وجبة فلافل'],['Crispy Chicken','دجاج مقرمش'],['Chicken','دجاج'],['Beef','لحم بقري'],['Burger','برغر'],['Wings','أجنحة'],['Nuggets','ناجتس'],['Fries','بطاطا مقلية'],['Sauce','صلصة'],['Cheddar','شيدر'],['Salat','خس'],['Tomaten','طماطم'],['rote Zwiebeln','بصل أحمر'],['Zwiebeln','بصل'],['Gurken','مخلل'],['Pommes','بطاطا'],['Getränk','مشروب'],['Desserts','حلويات'],['Alkoholfreie Getränke','مشروبات'],['Scharf','حار'],['Auswählen','اختيار'],['Details ansehen','عرض التفاصيل']];
function localizeArabicCatalog(){catalog.forEach(item=>{item._originalN??=item.n;item._originalD??=item.d;if(guideLanguage()!=='ar'){item.n=item._originalN;item.d=item._originalD;return;}let n=item._originalN,d=item._originalD;arabicMenuWords.forEach(([from,to])=>{n=n.split(from).join(to);d=d.split(from).join(to)});item.n=n;item.d=d});if(typeof renderMenu==='function')renderMenu();}
document.querySelector('#site-language')?.addEventListener('change',()=>setTimeout(localizeArabicCatalog,0));localizeArabicCatalog();
renderMenu();renderCart();
