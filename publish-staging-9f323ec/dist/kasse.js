'use strict';
const q=s=>document.querySelector(s), fiscal=NaraFiscal;
const provider=new fiscal.SimulationProvider();
const engine=new fiscal.Engine({journal:new fiscal.MemoryJournal(),provider});
const fixture=[{name:'TEST A',unitCents:1000,quantity:1,vat:'NORMAL'},{name:'TEST B',unitCents:500,quantity:1,vat:'REDUCED'}];
const euro=c=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(c/100);
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states={NEW:'بانتظار بدء العملية',ACTIVE:'مفتوحة — اختبار',FINISHED:'مكتملة — اختبار فقط',CANCELLED:'ملغاة — اختبار'};
const eventNames={CREATED:'إنشاء عملية اختبار',PROVIDER_INTENT:'تسجيل الطلب قبل الإرسال',PROVIDER_CONFIRMED:'تأكيد من المحاكي المحلي',PROVIDER_UNCERTAIN:'النتيجة غير مؤكدة — تحتاج تحقق',ITEMS_CONFIRMED:'تثبيت الأصناف والمبلغ',CANCEL_REQUESTED:'طلب إلغاء مع الاحتفاظ بالسجل',REVERSAL_CREATED:'إنشاء عملية عكس مستقلة',RECONCILIATION_UNCERTAIN:'التحقق لم يحسم النتيجة'};
let selected=null,busy=false;
function render(){
 const data=engine.snapshot(),tx=data.transactions.find(x=>x.id===selected),pending=data.transactions.some(x=>x.pending),open=data.transactions.some(x=>x.state==='ACTIVE');
 q('#begin').disabled=busy||pending||open;
 q('#finish').disabled=busy||!tx||tx.state!=='ACTIVE'||!!tx.pending||!!tx.originalId;
 q('#cancel').disabled=busy||!tx||tx.state!=='ACTIVE'||!!tx.pending;
 q('#reverse').disabled=busy||!tx||tx.state!=='FINISHED'||!!tx.originalId||!!tx.reversalId||pending||open;
 q('#reconcile').disabled=busy||!tx?.pending;
 q('#complete-reversal').disabled=busy||!tx?.originalId||tx.state!=='ACTIVE'||!!tx.pending;
 q('#payment').disabled=busy||!tx||tx.state!=='ACTIVE'||!!tx.pending||!!tx.originalId;
 q('#fault').disabled=busy;q('#reason').disabled=busy;
 q('#current-status').textContent=tx?(tx.pending?'نتيجة معلّقة: اضغط التحقق قبل أي إجراء آخر.':states[tx.state]):'ابدأ عملية لاختبار دورة التسجيل.';
 q('#totals').innerHTML='صافي العمليات التجريبية المكتملة <b>'+euro(engine.report().simulatedNetCents)+'</b>';
 q('#transactions').innerHTML=data.transactions.length?data.transactions.slice().reverse().map(x=>'<article class="transaction '+(x.id===selected?'active':'')+'"><span class="badge">'+(x.pending?'نتيجة غير مؤكدة':states[x.state])+'</span><p>'+(x.originalId?'عكس عملية سابقة':'عملية اختبار')+' · '+euro(fiscal.total(x.lines))+'</p><small>'+esc(x.id)+'</small>'+(x.reason?'<p>السبب: '+esc(x.reason)+'</p>':'')+(x.originalId?'<small>الأصل: '+esc(x.originalId)+'</small>':'')+'<p>لا يوجد توقيع TSE حقيقي</p><button class="secondary" data-select="'+x.id+'" '+(busy?'disabled':'')+'>عرض العملية</button></article>').join(''):'<p class="muted">ما في عمليات اختبار بعد.</p>';
 q('#events').innerHTML=data.events.slice().reverse().map(e=>'<li>'+esc(eventNames[e.type]||e.type)+'<time>'+esc(new Date(e.time).toLocaleString('ar'))+' · #'+e.sequence+'</time></li>').join('');
}
async function act(action){if(busy)return;busy=true;q('#message').textContent='';render();provider.fault=q('#fault').value;
 try{await action();const list=engine.snapshot().transactions;const pending=list.find(x=>x.pending);if(pending){selected=pending.id;q('#message').textContent='لم نعتبر العملية مكتملة. استخدم التحقق لحسم النتيجة بدون تكرار البيع.';}}
 catch(error){q('#message').textContent=error.message==='REASON_REQUIRED'?'اكتب سبب الإلغاء أو عكس العملية أولًا.':'لم يكتمل الإجراء. راجع العملية المفتوحة أو المعلّقة وحاول التحقق منها.';}
 finally{q('#fault').value='none';busy=false;render();}
}
q('#begin').onclick=()=>act(async()=>{selected=await engine.begin();});
q('#finish').onclick=()=>act(()=>engine.finish(selected,fixture,q('#payment').value));
q('#cancel').onclick=()=>act(()=>engine.cancel(selected,q('#reason').value));
q('#reverse').onclick=()=>act(async()=>{selected=await engine.reverse(selected,q('#reason').value);});
q('#reconcile').onclick=()=>act(()=>engine.reconcile(selected));
q('#complete-reversal').onclick=()=>act(()=>engine.completeReversal(selected));
q('#transactions').onclick=e=>{const b=e.target.closest('[data-select]');if(b&&!busy){selected=b.dataset.select;q('#message').textContent='';render();}};
q('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(engine.report(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='NARA-TEST-NOT-TAX-EXPORT.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
render();
