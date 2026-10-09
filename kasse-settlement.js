'use strict';
(()=>{
 const external=new Set(['LIEFERANDO','WOLT','UBER_EATS','WHATSAPP','TELEFON']);
 const fees={LIEFERANDO:25,WOLT:25,UBER_EATS:25,WHATSAPP:0,TELEFON:0,NARA:0};
 const lang=()=>{try{if(window.NARA_LANG)return window.NARA_LANG.get();const l=localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}};
 const T={
  de:{title:'NARA · Tagesabschluss',h1:'Tagesabschluss & Abrechnung 📊',intro:'Übersicht über Umsatz, Plattformen, Provisionen und Gewinn — Kassendaten bleiben unverändert.',back:'Zurück zur Kasse',refresh:'Aktualisieren',taxRate:'Steuersatz (Test)',gross:'Gesamtumsatz',fees:'Plattform-Provisionen',tax:'Steuer',profit:'Geschätzter Nettogewinn',bySource:'Aufteilung nach Quelle',source:'Quelle',orders:'Bestellungen',sales:'Umsatz',rate:'Provision',commission:'Provisionsbetrag',after:'Nach Provision',external:'extern · nur Abrechnung',empty:'Noch keine Bestellungen',NARA:'NARA Kasse',TELEFON:'Telefon',DINE_IN:'Vor Ort',TAKEAWAY:'Abholung',ready:n=>`Materialkosten berechnet aus ${n} Rezepten mit Lagerbezug.`,estimate:n=>`Materialkosten vorerst mit 30 % geschätzt (Test). Es gibt ${n} Lagerartikel, aber noch keine verknüpften Rezepte – deshalb wird keine unsichere Kostenzahl erfunden.`},
  ar:{title:'NARA · تسكيرة اليوم',h1:'تسكيرة اليوم والحساب 📊',intro:'ملخص المبيعات والمنصات والعمولات والربح — بدون ما نغيّر شي ببيانات الكاشير.',back:'رجوع عالكاشير',refresh:'حدّث',taxRate:'نسبة الضريبة (تجربة)',gross:'كل المبيعات',fees:'عمولات المنصات',tax:'الضريبة',profit:'الربح الصافي التقريبي',bySource:'حسب المصدر',source:'المصدر',orders:'الطلبات',sales:'المبيعات',rate:'العمولة',commission:'قيمة العمولة',after:'بعد العمولة',external:'خارجي · للحساب بس',empty:'لسّا ما في طلبات',NARA:'NARA كاشير',TELEFON:'تلفون',DINE_IN:'جوّا المطعم',TAKEAWAY:'استلام',ready:n=>`كلفة المواد محسوبة من ${n} وصفة مربوطة بالمخزون.`,estimate:n=>`كلفة المواد هلق تقديرية 30% للتجربة. في ${n} صنف بالمخزون بس لسّا ما في وصفات مربوطة، فما اخترعنا كلفة مو أكيدة.`},
  en:{title:'NARA · End of day',h1:'End of day & settlement 📊',intro:'Summary of sales, platforms, commissions and profit — cashier data stays unchanged.',back:'Back to cashier',refresh:'Refresh',taxRate:'Tax rate (test)',gross:'Gross sales',fees:'Platform commissions',tax:'Tax',profit:'Estimated net profit',bySource:'Breakdown by source',source:'Source',orders:'Orders',sales:'Sales',rate:'Commission',commission:'Commission amount',after:'After commission',external:'external · accounting only',empty:'No orders yet',NARA:'NARA cashier',TELEFON:'Phone',DINE_IN:'Dine-in',TAKEAWAY:'Pickup',ready:n=>`Material cost calculated from ${n} recipes linked to inventory.`,estimate:n=>`Material cost is a 30% estimate for now (test). There are ${n} inventory items but no linked recipes yet, so no uncertain cost is made up.`}};
 const tr=k=>(T[lang()]||T.de)[k]??T.de[k];
 const labels={LIEFERANDO:'Lieferando',WOLT:'Wolt',UBER_EATS:'Uber Eats',WHATSAPP:'WhatsApp'};
 const label=source=>labels[source]||(T.de[source]&&typeof T.de[source]==='string'&&/^[A-Z_]+$/.test(source)?tr(source):source);
 document.title=tr('title');document.querySelectorAll('[data-st]').forEach(el=>{el.textContent=tr(el.dataset.st)});
 if(window.NARA_LANG){const host=document.querySelector('#settlement-lang');if(host)window.NARA_LANG.mountSwitcher(host)}
 const euro=c=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format((c||0)/100);
 let costStatus={ready:false,recipes:0,inventory:0};
 const orders=()=>{try{return JSON.parse(localStorage.getItem('nara-kasse-orders')||'[]')}catch{return[]}};
 const total=o=>(o.cart||[]).reduce((s,i)=>s+Number(i.unitCents||0)*Number(i.quantity||0),0);
 const render=()=>{
  const list=orders().filter(o=>!['CANCELLED','STORNIERT'].includes(String(o.status||''))&&total(o)>0);
  const rows={};let gross=0,fee=0;
  list.forEach(o=>{const source=String(o.source||'NARA').toUpperCase(),amount=total(o),rate=fees[source]??0;gross+=amount;const commission=Math.round(amount*rate/100);fee+=commission;if(!rows[source])rows[source]={amount:0,commission:0,count:0,rate};rows[source].amount+=amount;rows[source].commission+=commission;rows[source].count++});
  const taxRate=Number(document.querySelector('#tax-rate')?.value||19),tax=Math.round((gross-fee)*taxRate/(100+taxRate)),materials=Math.round(gross*.30),net=gross-fee-tax-materials;
  document.querySelector('#metric-gross').textContent=euro(gross);document.querySelector('#metric-fee').textContent=euro(fee);document.querySelector('#metric-tax').textContent=euro(tax);document.querySelector('#metric-profit').textContent=euro(net);
  document.querySelector('#settlement-rows').innerHTML=Object.entries(rows).map(([source,x])=>`<tr><td><strong>${label(source)}</strong>${external.has(source)?'<small class="external-row">'+tr('external')+'</small>':''}</td><td>${x.count}</td><td>${euro(x.amount)}</td><td>${x.rate}%</td><td>${euro(x.commission)}</td><td class="profit">${euro(x.amount-x.commission)}</td></tr>`).join('')||'<tr><td colspan="6">'+tr('empty')+'</td></tr>';
  document.querySelector('#settlement-note').textContent=costStatus.ready?tr('ready')(costStatus.recipes):tr('estimate')(costStatus.inventory);
 };
 const loadCostStatus=async()=>{try{const r=await fetch('/api/admin-data',{cache:'no-store'});if(!r.ok)throw Error('admin data '+r.status);const data=await r.json();const recipes=Array.isArray(data.recipes)?data.recipes:[],inventory=Array.isArray(data.inventoryItems)?data.inventoryItems:[];costStatus={ready:recipes.length>0,recipes:recipes.length,inventory:inventory.length};render()}catch(error){console.warn('[NARA][SETTLEMENT_COST_STATUS_FAILED]',error.message)}};
 document.querySelector('#tax-rate')?.addEventListener('input',render);document.querySelector('#refresh')?.addEventListener('click',()=>{render();loadCostStatus()});render();loadCostStatus();
})();
