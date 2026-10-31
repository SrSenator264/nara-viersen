'use strict';
(()=>{
 const external=new Set(['LIEFERANDO','WOLT','UBER_EATS','WHATSAPP','TELEFON','LOCO','LANCH']);
 const fees={LIEFERANDO:25,WOLT:25,UBER_EATS:25,WHATSAPP:0,TELEFON:0,Flamo:0};
 const lang=()=>{try{if(window.NARA_LANG)return window.NARA_LANG.get();const l=localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
 const T={
  de:{title:'Flamo · Tagesabschluss',h1:'Tagesabschluss & Abrechnung 📊',intro:'Übersicht über Umsatz, Plattformen, Provisionen und Gewinn — Kassendaten bleiben unverändert.',back:'Zurück zur Kasse',refresh:'Aktualisieren',taxRate:'Steuersatz (Test)',day:'Geschäftstag',from:'Von',to:'Bis',pToday:'Heute',pYesterday:'Gestern',pWeek:'Diese Woche',pMonth:'Dieser Monat',sumOne:a=>`Geschäftstag ${a}`,sumRange:(a,b,n)=>`Von ${a} bis ${b} · ${n} Tage mit Umsatz`,errRange:'„Von“ liegt nach „Bis“ — bitte die Daten korrigieren.',gross:'Gesamtumsatz',fees:'Plattform-Provisionen',tax:'Steuer',profit:'Geschätzter Nettogewinn',bySource:'Aufteilung nach Quelle',source:'Quelle',orders:'Bestellungen',sales:'Umsatz',rate:'Provision',commission:'Provisionsbetrag',after:'Nach Provision',external:'extern · nur Abrechnung',empty:'Noch keine Bestellungen',Flamo:'Flamo Kasse',TELEFON:'Telefon',DINE_IN:'Vor Ort',TAKEAWAY:'Abholung',ready:n=>`Materialkosten berechnet aus ${n} Rezepten mit Lagerbezug.`,estimate:n=>`Materialkosten vorerst mit 30 % geschätzt (Test). Es gibt ${n} Lagerartikel, aber noch keine verknüpften Rezepte – deshalb wird keine unsichere Kostenzahl erfunden.`},
  ar:{title:'Flamo · تقفيلة اليوم',h1:'تقفيلة اليوم والحساب 📊',intro:'ملخص المبيعات والمنصات والعمولات والربح — بدون ما نغيّر شي ببيانات الكاشير.',back:'رجوع عالكاشير',refresh:'حدّث',taxRate:'نسبة الضريبة (تجربة)',day:'يوم الشغل',from:'من تاريخ',to:'إلى تاريخ',pToday:'اليوم',pYesterday:'أمس',pWeek:'هالأسبوع',pMonth:'هالشهر',sumOne:a=>`يوم الشغل ${a}`,sumRange:(a,b,n)=>`من ${a} إلى ${b} · ${n} أيام فيها مبيعات`,errRange:'تاريخ "من" أكبر من "إلى" — صحّح التواريخ.',gross:'كل المبيعات',fees:'عمولات المنصات',tax:'الضريبة',profit:'الربح الصافي التقريبي',bySource:'حسب المصدر',source:'المصدر',orders:'الطلبات',sales:'المبيعات',rate:'العمولة',commission:'قيمة العمولة',after:'بعد العمولة',external:'خارجي · للحساب بس',empty:'لسّا ما في طلبات',Flamo:'Flamo كاشير',TELEFON:'تلفون',DINE_IN:'جوّا المطعم',TAKEAWAY:'استلام',ready:n=>`كلفة المواد محسوبة من ${n} وصفة مربوطة بالمخزون.`,estimate:n=>`كلفة المواد هلق تقديرية 30% للتجربة. في ${n} صنف بالمخزون بس لسّا ما في وصفات مربوطة، فما اخترعنا كلفة مو أكيدة.`},
  en:{title:'Flamo · End of day',h1:'End of day & settlement 📊',intro:'Summary of sales, platforms, commissions and profit — cashier data stays unchanged.',back:'Back to cashier',refresh:'Refresh',taxRate:'Tax rate (test)',day:'Business day',from:'From',to:'To',pToday:'Today',pYesterday:'Yesterday',pWeek:'This week',pMonth:'This month',sumOne:a=>`Business day ${a}`,sumRange:(a,b,n)=>`From ${a} to ${b} · ${n} days with sales`,errRange:'"From" is after "To" — please fix the dates.',gross:'Gross sales',fees:'Platform commissions',tax:'Tax',profit:'Estimated net profit',bySource:'Breakdown by source',source:'Source',orders:'Orders',sales:'Sales',rate:'Commission',commission:'Commission amount',after:'After commission',external:'external · accounting only',empty:'No orders yet',Flamo:'Flamo cashier',TELEFON:'Phone',DINE_IN:'Dine-in',TAKEAWAY:'Pickup',ready:n=>`Material cost calculated from ${n} recipes linked to inventory.`,estimate:n=>`Material cost is a 30% estimate for now (test). There are ${n} inventory items but no linked recipes yet, so no uncertain cost is made up.`}};
const X={de:{all:'Alle',pick:'Quelle wählen',orders:'Bestellungen',avg:'Ø Bestellung',share:'Anteil am Umsatz',perDay:'Pro Tag',chart:'Umsatz pro Tag',parts:'Verteilung der Quellen',day:'Tag',none:'Keine Umsätze im Zeitraum.'},ar:{all:'الكل',pick:'اختار المصدر',orders:'الطلبات',avg:'متوسط الطلب',share:'حصتها من المبيعات',perDay:'لكل يوم',chart:'المبيعات لكل يوم',parts:'توزيع المصادر',day:'اليوم',none:'ما في مبيعات بهالفترة.'},en:{all:'All',pick:'Choose source',orders:'Orders',avg:'Avg. order',share:'Share of sales',perDay:'Per day',chart:'Sales per day',parts:'Source split',day:'Day',none:'No sales in this period.'}};
 const xt=k=>(X[lang()]||X.de)[k];
 const COL={LIEFERANDO:'#ff8000',UBER_EATS:'#06c167',LOCO:'#d62828',KASSE:'#1d2327',WEBSITE:'#7c3aed',WOLT:'#009de0',LANCH:'#8a857c'};
 const col=k=>COL[k]||'#8a857c';
 let sel='ALL';
 const tr=k=>(T[lang()]||T.de)[k]??T.de[k];
 const labels={LIEFERANDO:'Lieferando',WOLT:'Wolt',UBER_EATS:'Uber Eats',WHATSAPP:'WhatsApp',LOCO:'Loco Chicken',LANCH:'Lanch',KASSE:'Kasse',WEBSITE:'Website'};
 const label=source=>labels[source]||(T.de[source]&&typeof T.de[source]==='string'&&/^[A-Z_]+$/.test(source)?tr(source):source);
 document.title=tr('title');document.querySelectorAll('[data-st]').forEach(el=>{el.textContent=tr(el.dataset.st)});
 if(window.NARA_LANG){const host=document.querySelector('#settlement-lang');if(host)window.NARA_LANG.mountSwitcher(host)}
 const euro=c=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format((c||0)/100);
 let costStatus={ready:false,recipes:0,inventory:0};
 let srv=null,led=null;const D=window.NARA_DAY;
 const localOrders=()=>{try{return JSON.parse(localStorage.getItem('nara-kasse-orders')||'[]')}catch{return[]}};
 const stamp=o=>o.createdAt||o.placedAt||o.updatedAt||'';
 const todayStr=()=>D?D.today():'';
 const selFrom=()=>(document.querySelector('#sd-from')?.value)||todayStr();
 const selTo=()=>(document.querySelector('#sd-to')?.value)||todayStr();
 const rangeOk=()=>{const f=selFrom(),t=selTo();return !!f&&!!t&&f<=t};
 const orders=()=>{const from=selFrom(),to=selTo(),seen=new Set(),out=[];const all=(srv||[]).concat(localOrders());
  all.forEach(o=>{if(!o||o.isTest)return;const id=o.id||o.displayCode||'';if(id&&seen.has(id))return;if(id)seen.add(id);
   const t=stamp(o),d=t&&D?D.day(t):'';if(d?(d>=from&&d<=to):(D&&D.today()>=from&&D.today()<=to))out.push(o)});return out};
 const total=o=>(o.cart||[]).reduce((s,i)=>s+Number(i.unitCents||0)*Number(i.quantity||0),0);
const bar=(pct,c)=>`<span class="pbar"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:${c}"></i></span>`;
 function drawPick(keys,from,to,byDay){
  const SLG=window.NARA_SETTLEMENT_LEDGER;let chips=document.querySelector('#plat-chips'),det=document.querySelector('#plat-detail');
  const grid=document.querySelector('.settlement-grid');if(!grid)return;
  if(!chips){chips=document.createElement('section');chips.id='plat-chips';chips.className='settlement-card';grid.parentNode.insertBefore(chips,grid)}
  if(!det){det=document.createElement('section');det.id='plat-detail';det.className='settlement-card';grid.parentNode.insertBefore(det,grid.nextSibling)}
  const ks=(byDay&&SLG?SLG.keysIn(byDay,from,to):keys);
  chips.hidden=!ks.length;
  chips.innerHTML='<div class="pk-title">🧭 '+xt('pick')+'</div><div class="range-presets">'+['ALL'].concat(ks).map(k=>`<button type="button" class="chip${k===sel?' on':''}" data-pk="${k}"${k!=='ALL'?` style="${k===sel?`background:${col(k)};border-color:${col(k)};color:#fff`:`border-color:${col(k)}`}"`:''}>${k==='ALL'?'🍽️ '+xt('all'):label(k)}</button>`).join('')+'</div>';
  chips.querySelectorAll('[data-pk]').forEach(b=>b.onclick=()=>{sel=b.dataset.pk;render()});
  if(!byDay||!SLG){det.hidden=true;return}
  const d=SLG.detail(byDay,from,to,sel);
  det.hidden=false;
  if(!d.days.length){det.innerHTML='<p>'+xt('none')+'</p>';return}
  const c=sel==='ALL'?'#1d2327':col(sel);
  const parts=Object.keys(d.parts).filter(k=>d.parts[k]>0).sort((a,b)=>d.parts[b]-d.parts[a]);
  const stack=`<div class="pstack">`+parts.map(k=>`<i title="${label(k)}" style="width:${d.parts[k]/d.totalGross*100}%;background:${col(k)}"></i>`).join('')+`</div><div class="plegend">`+parts.map(k=>`<span><b style="background:${col(k)}"></b>${label(k)} ${Math.round(d.parts[k]/d.totalGross*100)}%</span>`).join('')+`</div>`;
  det.innerHTML=`<div class="pk-title">📊 ${sel==='ALL'?xt('all'):label(sel)}</div>
  <div class="pcards"><div class="pc"><span>🧾 ${xt('orders')}</span><strong>${d.count}</strong></div><div class="pc"><span>🛵 ${xt('avg')}</span><strong>${euro(d.avg)}</strong></div><div class="pc"><span>🥧 ${xt('share')}</span><strong>${d.share}%</strong></div></div>
  <div class="pk-sub">${xt('parts')}</div>${stack}
  <div class="pk-sub">${xt('chart')}</div><div class="pdays">`+d.days.map(x=>`<div class="pday"><span>${x.day.slice(8)}.${x.day.slice(5,7)}.</span>${bar(d.maxDay?x.cents/d.maxDay*100:0,c)}<b>${euro(x.cents)}</b><em>${x.count}</em></div>`).join('')+`</div>`;
 }
  const render=()=>{
  const ok=rangeOk(),from=selFrom(),to=selTo(),err=document.querySelector('#range-error'),sum=document.querySelector('#range-summary');
  if(err){err.hidden=ok;err.textContent=ok?'':tr('errRange')}
  const list=ok?orders().filter(o=>!['CANCELLED','STORNIERT'].includes(String(o.status||''))&&total(o)>0):[];
  let rows={};let gross=0,fee=0,days=0;const SLG=window.NARA_SETTLEMENT_LEDGER,LG=ok&&SLG&&led&&led.from===from&&led.to===to?SLG.rowsRange(led.byDay,from,to):null;
  if(LG){rows=LG.rows;gross=LG.gross;fee=LG.fee;days=LG.days}else list.forEach(o=>{const source=String(o.source||'NARA').toUpperCase(),amount=total(o),rate=fees[source]??0;gross+=amount;const commission=Math.round(amount*rate/100);fee+=commission;if(!rows[source])rows[source]={amount:0,commission:0,count:0,rate};rows[source].amount+=amount;rows[source].commission+=commission;rows[source].count++});
  const allKeys=Object.keys(rows);
  if(sel!=='ALL'&&!rows[sel])sel='ALL';
  if(sel!=='ALL'){rows={[sel]:rows[sel]};gross=rows[sel].amount;fee=rows[sel].commission}
  drawPick(allKeys,from,to,LG?led.byDay:null);
  if(!LG)days=new Set(list.map(o=>{const t=stamp(o);return t&&D?D.day(t):todayStr()})).size;
  if(sum)sum.textContent=!ok?'':from===to?tr('sumOne')(from):tr('sumRange')(from,to,days);
  const taxRate=Number(document.querySelector('#tax-rate')?.value||19),tax=Math.round((gross-fee)*taxRate/(100+taxRate)),materials=Math.round(gross*.30),net=gross-fee-tax-materials;
  document.querySelector('#metric-gross').textContent=euro(gross);document.querySelector('#metric-fee').textContent=euro(fee);document.querySelector('#metric-tax').textContent=euro(tax);document.querySelector('#metric-profit').textContent=euro(net);
  document.querySelector('#settlement-rows').innerHTML=Object.entries(rows).map(([source,x])=>`<tr><td><strong>${label(source)}</strong>${external.has(source)?'<small class="external-row">'+tr('external')+'</small>':''}</td><td>${x.count}</td><td>${euro(x.amount)}</td><td>${x.rate}%</td><td>${euro(x.commission)}</td><td class="profit">${euro(x.amount-x.commission)}</td></tr>`).join('')||'<tr><td colspan="6">'+tr('empty')+'</td></tr>';
  document.querySelector('#settlement-note').textContent=costStatus.ready?tr('ready')(costStatus.recipes):tr('estimate')(costStatus.inventory);
 };
 const loadLedger=async()=>{const from=selFrom(),to=selTo();if(!from||!to||from>to){led=null;render();return}try{const r=await fetch('/api/reports/sales-ledger?from='+from+'&to='+to,{cache:'no-store'});if(!r.ok)throw Error(r.status);const j=await r.json();led={from,to,byDay:(j.summary&&j.summary.byDay)||[]}}catch(e){led=null}render()};
 const loadCostStatus=async()=>{try{const r=await fetch('/api/admin-data',{cache:'no-store'});if(!r.ok)throw Error('admin data '+r.status);const data=await r.json();srv=Array.isArray(data.orders)?data.orders:null;if(D&&data.settings&&data.settings.businessDayStartHour!=null)D.setStartHour(data.settings.businessDayStartHour);const recipes=Array.isArray(data.recipes)?data.recipes:[],inventory=Array.isArray(data.inventoryItems)?data.inventoryItems:[];costStatus={ready:recipes.length>0,recipes:recipes.length,inventory:inventory.length};render()}catch(error){console.warn('[NARA][SETTLEMENT_COST_STATUS_FAILED]',error.message)}};
 {const fi=document.querySelector('#sd-from'),ti=document.querySelector('#sd-to');
  const setRange=(f,t)=>{if(fi)fi.value=f;if(ti)ti.value=t;render();loadLedger()};
  if(D&&fi&&ti){fi.value=D.today();ti.value=D.today();[fi,ti].forEach(i=>i.addEventListener('input',()=>{render();loadLedger()}))}
  const SLG0=window.NARA_SETTLEMENT_LEDGER;
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const p=SLG0&&SLG0.preset(b.dataset.preset,todayStr());if(p)setRange(p.from,p.to)}));}document.querySelector('#tax-rate')?.addEventListener('input',render);document.querySelector('#refresh')?.addEventListener('click',()=>{render();loadCostStatus();loadLedger()});render();loadCostStatus();loadLedger();
})();
