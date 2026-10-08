'use strict';
(()=>{
 const external=new Set(['LIEFERANDO','WOLT','UBER_EATS','WHATSAPP','TELEFON']);
 const fees={LIEFERANDO:25,WOLT:25,UBER_EATS:25,WHATSAPP:0,TELEFON:0,NARA:0};
 const labels={NARA:'NARA / كاشير',LIEFERANDO:'Lieferando',WOLT:'Wolt',UBER_EATS:'Uber Eats',WHATSAPP:'WhatsApp',TELEFON:'Telefon',DINE_IN:'داخل المطعم',TAKEAWAY:'استلام'};
 const euro=c=>new Intl.NumberFormat(localStorage.getItem('nara-kasse-language')==='ar'?'ar-DE':'de-DE',{style:'currency',currency:'EUR'}).format((c||0)/100);
 let costStatus={ready:false,recipes:0,inventory:0};
 const orders=()=>{try{return JSON.parse(localStorage.getItem('nara-kasse-orders')||'[]')}catch{return[]}};
 const total=o=>(o.cart||[]).reduce((s,i)=>s+Number(i.unitCents||0)*Number(i.quantity||0),0);
 const render=()=>{
  const list=orders().filter(o=>!['CANCELLED','STORNIERT'].includes(String(o.status||''))&&total(o)>0);
  const rows={};let gross=0,fee=0;
  list.forEach(o=>{const source=String(o.source||'NARA').toUpperCase(),amount=total(o),rate=fees[source]??0;gross+=amount;const commission=Math.round(amount*rate/100);fee+=commission;if(!rows[source])rows[source]={amount:0,commission:0,count:0,rate};rows[source].amount+=amount;rows[source].commission+=commission;rows[source].count++});
  const taxRate=Number(document.querySelector('#tax-rate')?.value||19),tax=Math.round((gross-fee)*taxRate/(100+taxRate)),materials=Math.round(gross*.30),net=gross-fee-tax-materials;
  document.querySelector('#metric-gross').textContent=euro(gross);document.querySelector('#metric-fee').textContent=euro(fee);document.querySelector('#metric-tax').textContent=euro(tax);document.querySelector('#metric-profit').textContent=euro(net);
  document.querySelector('#settlement-rows').innerHTML=Object.entries(rows).map(([source,x])=>`<tr><td><strong>${labels[source]||source}</strong>${external.has(source)?'<small class="external-row">خارجي · الحسابات فقط</small>':''}</td><td>${x.count}</td><td>${euro(x.amount)}</td><td>${x.rate}%</td><td>${euro(x.commission)}</td><td class="profit">${euro(x.amount-x.commission)}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد طلبات بعد</td></tr>';
  document.querySelector('#settlement-note').textContent=costStatus.ready?`تكلفة المواد محسوبة من ${costStatus.recipes} وصفة مرتبطة بالمخزون.`:`تكلفة المواد حالياً تقديرية 30% للتجربة. يوجد ${costStatus.inventory} صنف مخزون لكن لا توجد وصفات مرتبطة بعد، لذلك لم يتم اختراع تكلفة غير مؤكدة.`;
 };
 const loadCostStatus=async()=>{try{const r=await fetch('/api/admin-data',{cache:'no-store'});if(!r.ok)throw Error('admin data '+r.status);const data=await r.json();const recipes=Array.isArray(data.recipes)?data.recipes:[],inventory=Array.isArray(data.inventoryItems)?data.inventoryItems:[];costStatus={ready:recipes.length>0,recipes:recipes.length,inventory:inventory.length};render()}catch(error){console.warn('[NARA][SETTLEMENT_COST_STATUS_FAILED]',error.message)}};
 document.querySelector('#tax-rate')?.addEventListener('input',render);document.querySelector('#refresh')?.addEventListener('click',()=>{render();loadCostStatus()});render();loadCostStatus();
})();
