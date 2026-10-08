'use strict';
function runInvoiceAgents(data){
 const invoices=Array.isArray(data.invoices)?data.invoices:[],latest=[...invoices].filter(x=>x.status==='DRAFT').pop()||null,lines=latest?.lineItems||[],items=Array.isArray(data.inventoryItems)?data.inventoryItems:[],suppliers=Array.isArray(data.suppliers)?data.suppliers:[];
 const unmapped=lines.filter(x=>!x.inventoryItemId),lowStock=items.filter(x=>Number(x.currentStock||0)<=Number(x.minimumStock||0));
 return {runAt:new Date().toISOString(),mode:'proposal-only',invoice:latest?{id:latest.id,number:latest.invoiceNumber||null}:null,agents:[
  {id:'invoice-reader',name:'وكيل قراءة الفواتير',status:latest?'ready':'waiting',confidence:latest?'high':'none',result:latest?'تم استخراج الفاتورة للمراجعة':'لا توجد مسودة فاتورة'},
  {id:'item-matcher',name:'وكيل ربط الأصناف',status:unmapped.length?'needs_review':'ready',confidence:unmapped.length?'medium':'high',result:unmapped.length+' بند غير مربوط من أصل '+lines.length,proposals:unmapped.slice(0,30).map(x=>({lineId:x.id,name:x.description||x.name||'بدون اسم'}))},
  {id:'name-suggester',name:'وكيل اقتراح الأسماء',status:lines.length?'ready':'waiting',confidence:lines.length?'medium':'none',result:lines.length?'اقتراحات الأسماء جاهزة للمراجعة':'لا توجد بنود'},
  {id:'stock-guardian',name:'وكيل مراقبة المخزون',status:lowStock.length?'needs_review':'ready',confidence:'high',result:lowStock.length+' صنف عند الحد الأدنى أو أقل',proposals:lowStock.slice(0,30).map(x=>({itemId:x.id,name:x.name,currentStock:x.currentStock,minimumStock:x.minimumStock}))},
  {id:'posting-guard',name:'وكيل تدقيق الترحيل',status:'ready',confidence:'high',result:'لن يتم ترحيل أي حركة دون موافقة صريحة'}
 ],safety:{dataChanged:false,stockPosted:false,requiresApproval:true}};
}
function runAccountingAgents(data,orders=[]){
 const recipes=Array.isArray(data.recipes)?data.recipes:[],items=Array.isArray(data.inventoryItems)?data.inventoryItems:[],list=Array.isArray(orders)?orders:[];
 const usableRecipes=recipes.filter(x=>Array.isArray(x.ingredientLines)&&x.ingredientLines.length>0&&!x.needsReview);
 const completed=list.filter(x=>!['CANCELLED','STORNIERT'].includes(String(x.status||''))&&(x.cart||[]).length);
 const sources={};completed.forEach(order=>{const source=String(order.source||'NARA').toUpperCase(),amount=(order.cart||[]).reduce((s,line)=>s+Number(line.unitCents||0)*Number(line.quantity||0),0);if(!sources[source])sources[source]={orders:0,grossCents:0};sources[source].orders++;sources[source].grossCents+=amount});
 const emptyOrDraft=recipes.filter(x=>x.needsReview||x.status==='DRAFT').length;
 const accountingArmy=[
  ['ledger-agent','وكيل دفتر القيود','يفحص توازن Soll/Haben والقيود المنشورة'],
  ['vat-agent','وكيل Umsatzsteuer وVorsteuer','يراجع ضريبة المبيعات والمشتريات وصافي الضريبة'],
  ['cashbook-agent','وكيل Kassenbuch','يراجع الرصيد الافتتاحي والإيداعات والسحوبات ويمنع Kassenminus'],
  ['bank-reconciliation-agent','وكيل التسوية البنكية','يراجع الحركات غير المطابقة ويقترح الربط بالمستندات'],
  ['document-audit-agent','وكيل Belegarchiv وGoBD','يراجع اكتمال المستندات ومسار التدقيق وعدم تعديل الأصل'],
  ['payroll-accounting-agent','وكيل رواتب وأجور','يربط ساعات العمل بالأجور والمدفوعات والرصيد المتبقي'],
  ['fixed-asset-agent','وكيل الأصول والإهلاك','يراجع سعر الأصل والعمر والإهلاك والقيمة المتبقية'],
  ['platform-settlement-agent','وكيل تسويات المنصات','يفصل المبيعات والعمولات والحساب الوسيط لكل منصة وعلامة'],
  ['tax-report-agent','وكيل التقارير الضريبية','يجهز ملخص VAT وGuV وEÜR للمراجعة والتصدير'],
  ['accounting-review-agent','وكيل المراجعة النهائية','يجمع التحذيرات ويحدد ما يحتاج موافقة المستخدم أو Steuerberater']
 ].map(([id,name,result])=>({id,name,status:'ready',confidence:'medium',result,mode:'proposal-only'}));
 return {runAt:new Date().toISOString(),mode:'proposal-only',agents:[
  {id:'recipe-cost-agent',name:'وكيل تكلفة الوصفات',status:usableRecipes.length?'ready':'needs_review',confidence:usableRecipes.length?'medium':'none',result:usableRecipes.length?`تم العثور على ${usableRecipes.length} وصفة قابلة للحساب`:`لا توجد وصفة مكتملة؛ ${emptyOrDraft} مسودة بانتظار المكونات والكميات`,proposals:recipes.filter(x=>x.needsReview).slice(0,20).map(x=>({productId:x.productId,productName:x.productName,action:'أكمل مكونات الوصفة'}))},
  {id:'settlement-agent',name:'وكيل التسوية اليومية',status:completed.length?'ready':'waiting',confidence:completed.length?'high':'none',result:`تم تحليل ${completed.length} طلب فعلي`,sources},
  {id:'profit-agent',name:'وكيل مراقبة الربح',status:usableRecipes.length?'ready':'needs_review',confidence:usableRecipes.length?'medium':'none',result:usableRecipes.length?'يراقب هامش الربح بعد توفر التكلفة الفعلية':'لا يمكن حساب الربح الحقيقي قبل اعتماد الوصفات',proposals:usableRecipes.length?[]:[{action:'ربط تكلفة المواد بالوصفات',priority:'high'}]},
  {id:'cashier-audit-agent',name:'وكيل مراقبة الكاشير',status:'ready',confidence:'high',result:'يراجع الطلبات الفارغة والدفع المكرر ومصادر المنصات',proposals:completed.filter(x=>!(x.source)||String(x.source).toUpperCase()==='TAKEAWAY').slice(0,20).map(x=>({orderId:x.id,action:'راجع مصدر الطلب'}))}
  ,...accountingArmy
 ],safety:{dataChanged:false,stockPosted:false,requiresApproval:true}};
}
function runSmartRoutePlanner(data,orders=[],options={}){
 const list=(Array.isArray(orders)?orders:[]).filter(x=>!['CANCELLED','STORNIERT','COMPLETED'].includes(String(x.status||'').toUpperCase())&&(x.type==='delivery'||x.delivery||x.address));
 const employees=(Array.isArray(data?.employees)?data.employees:[]).filter(x=>x.active!==false&&(x.internalProfileEnabled!==false||x.officialProfileEnabled===true));
 const maxMinutes=Math.min(30,Math.max(20,Number(options.maxMinutes)||20)),maxOrders=Math.min(3,Math.max(1,Number(options.maxOrders)||3));
 const groups=[];const used=new Set();
 for(const order of list){if(used.has(order.id))continue;const area=String(order.delivery?.area||order.delivery?.district||order.area||order.address?.area||'').trim().toLowerCase(),group=[order];used.add(order.id);for(const candidate of list){if(group.length>=maxOrders||used.has(candidate.id))continue;const nextArea=String(candidate.delivery?.area||candidate.delivery?.district||candidate.area||candidate.address?.area||'').trim().toLowerCase();if(area&&nextArea&&area===nextArea){group.push(candidate);used.add(candidate.id);}}groups.push(group);}
 const suggestions=groups.map(group=>{const assigned=group.find(x=>x.employeeId)?.employeeId||null;const employee=employees.find(x=>x.id===assigned)||employees[0]||null;const distanceKm=group.reduce((s,x)=>s+Number(x.delivery?.distanceKm||x.distanceKm||0),0)||null;const estimatedMinutes=group.reduce((s,x)=>s+Number(x.delivery?.estimatedMinutes||x.estimatedMinutes||0),0)||null;const tooLong=estimatedMinutes!=null&&estimatedMinutes>maxMinutes;return {recommendedEmployeeId:employee?.id||null,recommendedOrderIds:group.map(x=>x.id),routeDirection:String(group[0].delivery?.area||group[0].area||'غير محدد'),estimatedDistanceKm:distanceKm,estimatedDurationMinutes:estimatedMinutes,capacityCheck:group.length<=maxOrders?'PASS':'REVIEW',rejectedOrders:tooLong?group.slice(1).map(x=>x.id):[],reasoningSummary:tooLong?'الجولة تتجاوز الحد الزمني؛ تحتاج موافقة أو تقسيم الجولة':group.length>1?'الطلبات على نفس المسار ويمكن دمجها':'لا توجد طلبات متوافقة أخرى',confidence:area?'medium':'low',requiresApproval:true};});
 return {runAt:new Date().toISOString(),mode:'proposal-only',agentId:'smart-route-planner',maxMinutes,maxOrders,suggestions,safety:{dataChanged:false,autoAssignment:false,requiresApproval:true}};
}
function runDispatchCoordinator(data,orders=[],options={}){const now=Date.now(),maxMinutes=Math.min(30,Math.max(20,Number(options.maxMinutes)||20)),list=(Array.isArray(orders)?orders:[]).filter(x=>!['CANCELLED','STORNIERT','COMPLETED'].includes(String(x.status||'').toUpperCase())&&(x.type==='delivery'||x.delivery||x.address)),employees=(data?.employees||[]).filter(x=>x.active!==false),groups=[],used=new Set();for(const order of list){if(used.has(order.id))continue;const d=order.delivery||{},area=String(d.area||d.district||order.area||'').trim().toLowerCase(),prep=Number(order.preparationMinutes??d.preparationMinutes??20),eta=Number(d.driverEtaMinutes??order.driverEtaMinutes??10),age=Math.max(0,(now-Date.parse(order.createdAt||now))/60000),minutesUntilReady=Math.max(0,prep-age),urgency=minutesUntilReady<=eta?'START_NOW':minutesUntilReady<=eta+10?'START_SOON':'QUEUED',group=[order];used.add(order.id);for(const candidate of list){if(group.length>=3||used.has(candidate.id))continue;const cd=candidate.delivery||{},ca=String(cd.area||cd.district||candidate.area||'').trim().toLowerCase(),sameArea=area&&ca&&area===ca;if(sameArea){group.push(candidate);used.add(candidate.id)}}groups.push({area:area||'غير محدد',orders:group,urgency,minutesUntilReady,estimatedMinutes:Number(d.estimatedMinutes||order.estimatedMinutes||prep+eta),reason:urgency==='START_NOW'?'وقت التحضير المتبقي يساوي أو يقل عن وصول الموظف':'يمكن جدولة الطلب دون خطر مباشر'})}const suggestions=groups.map(g=>{const compatible=g.orders.length<=3&&g.estimatedMinutes<=maxMinutes,employee=employees.find(e=>e.id===g.orders.find(o=>o.employeeId)?.employeeId)||employees[0]||null;return {kitchenPriority:g.urgency,routeDirection:g.area,orderIds:g.orders.map(o=>o.id),recommendedEmployeeId:employee?.id||null,estimatedMinutes:g.estimatedMinutes,compatible,reason:g.reason,requiresApproval:true}});return {runAt:new Date().toISOString(),agentId:'dispatch-coordinator',mode:'proposal-only',maxMinutes,suggestions,alerts:suggestions.filter(x=>x.kitchenPriority==='START_NOW'||!x.compatible).map(x=>({type:x.kitchenPriority==='START_NOW'?'KITCHEN_START_NOW':'ROUTE_REVIEW',orderIds:x.orderIds,message:x.kitchenPriority==='START_NOW'?'ابدأ تحضير الطلب الآن قبل وصول الموظف':'الجولة تحتاج مراجعة قبل التثبيت'})),safety:{dataChanged:false,autoAssignment:false,requiresApproval:true}}}
function runCashierAgents(orders=[]){const list=Array.isArray(orders)?orders:[],current=list.find(x=>x.id===orders.currentId)||list[0]||null,external=new Set(['LIEFERANDO','WOLT','UBER_EATS','UBEREATS','LANCH','WHATSAPP','TAKEAWAY']),cart=current?.cart||[],sum=cart.reduce((s,x)=>s+Number(x.unitCents||0)*Number(x.quantity||0),0),delivery=current?.type==='delivery',local=current?.type==='local';return {runAt:new Date().toISOString(),mode:'monitor-only',agents:[
 {id:'order',name:'وكيل الطلبات',status:current?'ready':'waiting',result:current?`الطلب الحالي ${current.id}`:'لا يوجد طلب حالي'},
 {id:'customer',name:'وكيل العملاء',status:delivery&&(current.delivery?.name||current.delivery?.phone)?'ready':delivery?'needs_review':'waiting',result:delivery?(current.delivery?.name||current.delivery?.phone?'بيانات العميل موجودة':'بيانات العميل ناقصة'):'لا ينطبق'},
 {id:'payment',name:'وكيل الدفع',status:sum>0?'ready':'needs_review',result:`المجموع ${(sum/100).toFixed(2)} €؛ التأكيد اليدوي مطلوب`},
 {id:'tax',name:'وكيل الضريبة',status:current?'ready':'waiting',result:'الأسعار شاملة الضريبة؛ 7% للطعام و19% للمشروبات'},
 {id:'print',name:'وكيل الطباعة',status:'ready',result:'مسارات طباعة العميل والمطبخ والتوصيل متاحة'},
 {id:'platform',name:'وكيل المنصات',status:list.some(o=>external.has(String(o.source||o.platform||'').toUpperCase()))?'needs_review':'ready',result:'طلبات المنصات تبقى خارج الكاشير'},
 {id:'table',name:'وكيل الطاولات',status:local?(current.table?'ready':'needs_review'):'waiting',result:local?`Tisch ${current.table||'غير محدد'}`:'لا ينطبق'},
 {id:'inventory',name:'وكيل المخزون',status:cart.length?'ready':'waiting',result:'مراقبة فقط بدون خصم تلقائي'},
 {id:'notification',name:'وكيل التنبيهات',status:'ready',result:'يراقب وصول الطلبات وتغيّر المرحلة'},
 {id:'audit',name:'وكيل التدقيق',status:'ready',result:'يتحقق من الطلبات الفارغة والدفع والتعارضات'}],requiresApproval:true,mutations:0};}
module.exports={runInvoiceAgents,runAccountingAgents,runCashierAgents,runSmartRoutePlanner,runDispatchCoordinator};
