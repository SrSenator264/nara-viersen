'use strict';
(function(){
  const external=new Set(['LIEFERANDO','WOLT','UBER_EATS','UBEREATS','LANCH','WHATSAPP','TAKEAWAY']);
  const read=()=>window.NARA_LEGACY_KASSE_STATE?.getOrders?.()||[];
  const current=()=>window.NARA_LEGACY_KASSE_STATE?.getCurrent?.()||null;
  const result=(id,name,status,message,details={})=>({id,name,status,message,details,mode:'monitor-only',requiresApproval:true});
  const agents={
    order(){const o=current();return result('order','Order Agent',o?'ready':'waiting',o?`الطلب الحالي ${o.id} ويحتوي ${(o.cart||[]).length} أصناف`:'لا يوجد طلب حالي')},
    customer(){const o=current(),d=o?.delivery||{};return result('customer','Customer Agent',o?.type==='delivery'?(d.name||d.phone?'ready':'needs_review'):'waiting',o?.type==='delivery'?(d.name||d.phone?'بيانات العميل موجودة':'بيانات العميل ناقصة'):'لا ينطبق على هذا النوع')},
    payment(){const o=current(),sum=(o?.cart||[]).reduce((s,x)=>s+Number(x.unitCents||0)*Number(x.quantity||0),0);return result('payment','Payment Agent',o&&sum>0?'ready':'needs_review',o?`المجموع ${(sum/100).toFixed(2)} €؛ التأكيد اليدوي مطلوب`:'لا يوجد مبلغ', {paid:!!o?.paid,status:o?.status||'OPEN'})},
    tax(){const o=current(),lines=o?.cart||[],drinks=lines.filter(x=>/cola|coke|pepsi|fanta|sprite|wasser|water|drink|getränk|saft|juice|limo/i.test(x.name||''));return result('tax','Tax Agent',o?'ready':'waiting',o?`7% للأطعمة و19% للمشروبات؛ ${drinks.length} مشروبات مصنفة`:'لا يوجد طلب',{pricesIncludeTax:true})},
    print(){return result('print','Print Agent',document.querySelector('#nara-print-tools')?'ready':'needs_review',document.querySelector('#nara-print-tools')?'أزرار طباعة العميل والمطبخ والتوصيل موجودة':'أدوات الطباعة غير ظاهرة')},
    platform(){const a=read(),bad=a.filter(o=>external.has(String(o.source||o.platform||'').toUpperCase()));return result('platform','Platform Agent',bad.length?'needs_review':'ready',bad.length?`${bad.length} طلبات منصات يجب أن تبقى خارج الكاشير`:'لا توجد طلبات منصات في الكاشير',{externalOrders:bad.length})},
    table(){const o=current();return result('table','Table Agent',o?.type==='local'?(o.table?'ready':'needs_review'):'waiting',o?.type==='local'?(o.table?`الطلب على Tisch ${o.table}`:'رقم الطاولة ناقص'):'لا ينطبق على طلب غير محلي')},
    inventory(){const o=current();return result('inventory','Inventory Agent',o?.cart?.length?'ready':'waiting',o?.cart?.length?'يراقب الأصناف بدون خصم تلقائي من المخزون':'لا توجد أصناف',{posted:false})},
    notification(){return result('notification','Notification Agent','ready','نظام التنبيه جاهز، ولا يطلب إذناً للدفع أو الإغلاق')},
    audit(){const a=read(),issues=a.filter(o=>!o.id||(!o.cart?.length&&o.status==='COMPLETED'));return result('audit','Audit Agent',issues.length?'needs_review':'ready',issues.length?`${issues.length} ملاحظات تحتاج مراجعة`:'لا توجد ملاحظات أساسية',{issues:issues.map(o=>o.id)})}
  };
  function run(){const out=Object.values(agents).map(fn=>fn());const summary={runAt:new Date().toISOString(),mode:'monitor-only',agents:out,mutations:0,requiresApproval:true};console.info('[NARA][CASHIER_AGENTS]',summary);return summary}
  window.NARA_CASHIER_AGENTS={run,agents,debug:()=>({orders:read().length,current:current()?.id||null,localStorageKeys:Object.keys(localStorage).filter(k=>k.startsWith('nara-'))})};
  setTimeout(run,1200);setInterval(run,15000);
})();
