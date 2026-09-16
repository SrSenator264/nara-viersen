(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const error=m=>{throw Error(m);};
 const closed=['delivered','cancelled'];
 const next={new:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['delivered','cancelled'],out:['delivered']};
 class DemoOperations {
  #data;#catalog;
  constructor(catalog){
   this.#catalog=copy(catalog);
   this.#data={testOnly:true,orders:[],purchases:[],events:[],staff:[
    {id:'s1',name:'مدير تجريبي',role:'owner',active:true},
    {id:'s2',name:'كاشير تجريبي',role:'cashier',active:true},
    {id:'s3',name:'طباخ تجريبي',role:'kitchen',active:true},
    {id:'s4',name:'سائق 01',role:'driver',active:true},
    {id:'s5',name:'سائق 02',role:'driver',active:true}
   ],vehicles:[{id:'v1',name:'سيارة 01',available:true},{id:'v2',name:'سيارة 02',available:true}]};
   this.create({source:'website',method:'delivery',items:[{id:1,quantity:2},{id:8,quantity:1}],externalId:'SAMPLE-WEB-01',prepaid:true});
   this.create({source:'lieferando',method:'delivery',items:[{id:5,quantity:2}],externalId:'SAMPLE-LIEF-01',prepaid:true});
   this.create({source:'counter',method:'pickup',items:[{id:6,quantity:1},{id:8,quantity:1}],externalId:'SAMPLE-POS-01'});
   this.create({source:'ubereats',method:'delivery',items:[{id:1,quantity:1},{id:7,quantity:1}],externalId:'SAMPLE-UBER-01',prepaid:true});
   this.transition('D-1002','preparing');this.transition('D-1002','ready');
   this.transition('D-1003','preparing');this.transition('D-1004','preparing');
  }
  snapshot(){return copy(this.#data);}
  #order(id){const o=this.#data.orders.find(o=>o.id===id);if(!o)error('ORDER_NOT_FOUND');return o;}
  #event(type,id){this.#data.events.push({sequence:this.#data.events.length+1,time:new Date().toISOString(),type,id,testOnly:true});}
  create({source,method,items,externalId,prepaid=false}){
   if(!['website','lieferando','ubereats','counter'].includes(source)||!['pickup','delivery'].includes(method))error('INVALID_ORDER');
   if(typeof externalId!=='string'||!externalId||externalId.length>100)error('EXTERNAL_ID_REQUIRED');
   const existing=this.#data.orders.find(o=>o.source===source&&o.externalId===externalId);
   if(existing)return existing.id;
   if(!Array.isArray(items)||!items.length||items.length>50)error('EMPTY_ORDER');
   if(source==='counter'&&prepaid)error('COUNTER_CANNOT_BE_PLATFORM_PAID');
   const lines=items.map(x=>{const p=this.#catalog.find(p=>p.id===x.id);
    if(!p||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>20)error('INVALID_ITEM');
    return {productId:p.id,name:p.n,unitCents:p.cents,quantity:x.quantity,image:p.img};
   });
   const id='D-'+(1001+this.#data.orders.length);
   this.#data.orders.push({id,source,method,externalId,lines,totalCents:lines.reduce((s,x)=>s+x.unitCents*x.quantity,0),state:'new',payment:prepaid?'platform_paid':'unpaid',paymentRef:prepaid?externalId:null,createdAt:new Date().toISOString(),driverId:null,vehicleId:null,fiscalId:null,testOnly:true});
   this.#event('created',id);return id;
  }
  transition(id,state){
   const order=this.#order(id);
   if(!next[order.state]?.includes(state))error('INVALID_TRANSITION');
   if(state==='delivered'&&order.method==='delivery'&&order.state!=='out')error('DISPATCH_REQUIRED');
   if(state==='delivered'&&order.payment==='unpaid')error('PAYMENT_REQUIRED');
   if(state==='cancelled'&&order.payment!=='unpaid')error('REFUND_WORKFLOW_REQUIRED');
   order.state=state;this.#event(state,id);
  }
  dispatch(id,driverId,vehicleId){
   const order=this.#order(id),driver=this.#data.staff.find(s=>s.id===driverId&&s.role==='driver'),vehicle=this.#data.vehicles.find(v=>v.id===vehicleId);
   if(order.state!=='ready'||order.method!=='delivery')error('NOT_READY_FOR_DELIVERY');
   if(!driver?.active||!vehicle?.available)error('DRIVER_OR_VEHICLE_UNAVAILABLE');
   if(this.#data.orders.some(o=>o.state==='out'&&(o.driverId===driverId||o.vehicleId===vehicleId)))error('DRIVER_OR_VEHICLE_BUSY');
   Object.assign(order,{driverId,vehicleId,state:'out'});this.#event('dispatched',id);
  }
  recordTestPayment(id,{fiscalId,fiscalState,payment}){
   const order=this.#order(id);
   if(order.payment!=='unpaid')error('ALREADY_PAID');
   if(closed.includes(order.state))error('CLOSED_ORDER');
   if(fiscalState!=='FINISHED'||!fiscalId||!['cash_test','card_test'].includes(payment))error('FISCAL_TEST_NOT_CONFIRMED');
   if(this.#data.orders.some(o=>o.fiscalId===fiscalId))error('FISCAL_REFERENCE_REUSED');
   order.payment=payment;order.fiscalId=fiscalId;order.paymentRef=fiscalId;this.#event('test_payment',id);
  }
  setStaffActive(id,active){
   const staff=this.#data.staff.find(s=>s.id===id);if(!staff||typeof active!=='boolean')error('INVALID_STAFF');
   if(!active&&this.#data.orders.some(o=>o.state==='out'&&o.driverId===id))error('DRIVER_BUSY');
   staff.active=active;this.#event(active?'shift_open':'shift_closed',id);
  }
  setVehicleAvailable(id,available){
   const vehicle=this.#data.vehicles.find(v=>v.id===id);if(!vehicle||typeof available!=='boolean')error('INVALID_VEHICLE');
   if(!available&&this.#data.orders.some(o=>o.state==='out'&&o.vehicleId===id))error('VEHICLE_BUSY');
   vehicle.available=available;this.#event('vehicle_status',id);
  }
  addSamplePurchase(){
   const id='DEMO-INV-001';if(this.#data.purchases.some(p=>p.id===id))return id;
   this.#data.purchases.push({id,supplier:'مورد تجريبي — مواد تغليف',description:'100 علبة برغر + 100 كيس',grossCents:8500,state:'due',testOnly:true});this.#event('purchase_added',id);return id;
  }
  paySamplePurchase(id){const p=this.#data.purchases.find(p=>p.id===id);if(!p||p.state!=='due')error('PURCHASE_NOT_DUE');p.state='paid_test';this.#event('purchase_paid',id);}
  metrics(){
   const orders=this.#data.orders.filter(o=>o.state!=='cancelled');
   return {active:orders.filter(o=>!closed.includes(o.state)).length,ready:orders.filter(o=>o.state==='ready').length,out:orders.filter(o=>o.state==='out').length,
    valueCents:orders.reduce((s,o)=>s+o.totalCents,0),platformCents:orders.filter(o=>o.payment==='platform_paid').reduce((s,o)=>s+o.totalCents,0),
    shopCents:orders.filter(o=>['cash_test','card_test'].includes(o.payment)).reduce((s,o)=>s+o.totalCents,0),
    unpaidCents:orders.filter(o=>o.payment==='unpaid').reduce((s,o)=>s+o.totalCents,0),
    purchasesCents:this.#data.purchases.reduce((s,p)=>s+p.grossCents,0),dueCents:this.#data.purchases.filter(p=>p.state==='due').reduce((s,p)=>s+p.grossCents,0)};
  }
 }
 const api={DemoOperations};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NaraOperations=api;
})(globalThis);
