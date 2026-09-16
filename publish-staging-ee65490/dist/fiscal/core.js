(function (root) {
 'use strict';
 const clone = value => JSON.parse(JSON.stringify(value));
 const fail = message => { throw new Error(message); };
 const uuid = () => globalThis.crypto.randomUUID();
 const terminal = ['FINISHED','CANCELLED'];
 const initial = () => ({version:0, transactions:[], events:[]});
 function validateLines(lines, negative=false) {
  if (!Array.isArray(lines) || !lines.length || lines.length>100) fail('EMPTY_OR_TOO_LARGE');
  const result=lines.map(line=>{
   if (typeof line.name!=='string'||!line.name.trim()||line.name.length>160) fail('INVALID_NAME');
   if (!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>100) fail('INVALID_QUANTITY');
   if (!Number.isSafeInteger(line.unitCents)||Math.abs(line.unitCents)>1000000|| (negative?line.unitCents>=0:line.unitCents<=0)) fail('INVALID_AMOUNT');
   if (!['NORMAL','REDUCED','NULL'].includes(line.vat)) fail('VAT_REQUIRED');
   return {name:line.name.trim(),quantity:line.quantity,unitCents:line.unitCents,vat:line.vat};
  });
  if (Math.abs(total(result))>100000000) fail('TOTAL_TOO_LARGE');
  return result;
 }
 function total(lines) { return lines.reduce((s,x)=>s+x.unitCents*x.quantity,0); }
 function receiptPayload(tx) {
  const groups={};
  for(const line of tx.lines) groups[line.vat]=(groups[line.vat]||0)+line.quantity*line.unitCents;
  return {standard_v1:{receipt:{receipt_type:'RECEIPT',
   amounts_per_vat_rate:Object.entries(groups).map(([vat_rate,cents])=>({vat_rate,amount:(cents/100).toFixed(2)})),
   amounts_per_payment_type:[{payment_type:tx.payment,amount:(total(tx.lines)/100).toFixed(2)}]
  }}};
 }
 // Only synthetic browser demonstrations use this repository. Server development uses SQLite.
 class MemoryJournal {
  #data=initial();
  load(){return clone(this.#data);}
  commit(expected,next){if(this.#data.version!==expected)fail('CONCURRENT_CHANGE');this.#data=clone(next);}
 }
 class SimulationProvider {
  mode='TEST'; name='LOCAL_SIMULATOR'; fault='none'; #rows=new Map();
  async apply(operation){
   const existing=this.#rows.get(operation.id);
   if(existing?.revision===operation.revision) {
    if(JSON.stringify(existing.operation)!==JSON.stringify(operation))fail('REVISION_CONFLICT');
    return clone(existing);
   }
   if(operation.revision!==(existing?.revision||0)+1)fail('REVISION_CONFLICT');
   if(existing&&terminal.includes(existing.state))fail('ALREADY_CLOSED');
   if(this.fault==='before'){this.fault='none';fail('SIMULATED_CONNECTION_LOSS');}
   const result={id:operation.id,revision:operation.revision,state:operation.state,simulated:true,operation:clone(operation),signature:null};
   this.#rows.set(operation.id,result);
   if(this.fault==='after'){this.fault='none';fail('SIMULATED_RESPONSE_LOSS');}
   return clone(result);
  }
  async retrieve(id){return clone(this.#rows.get(id)||null);}
 }
 class Engine {
  #journal; #provider; #busy=false;
  constructor({journal,provider,mode='TEST'}) {
   if(mode!=='TEST'||provider.mode!=='TEST')fail('LIVE_MODE_DISABLED');
   this.#journal=journal;this.#provider=provider;
  }
  snapshot(){return this.#journal.load();}
  #change(mutator,type,id,detail={}){
   const data=this.snapshot(), expected=data.version;
   mutator(data);
   data.events.push({sequence:data.events.length+1,time:new Date().toISOString(),type,transactionId:id,detail:clone(detail),testOnly:true});
   data.version=expected+1;
   this.#journal.commit(expected,data);
  }
  async #lock(action){if(this.#busy)fail('BUSY');this.#busy=true;try{return await action();}finally{this.#busy=false;}}
  #get(id){const tx=this.snapshot().transactions.find(x=>x.id===id);if(!tx)fail('NOT_FOUND');return tx;}
  #pending(){return this.snapshot().transactions.some(x=>x.pending);}
  async begin(){return this.#lock(async()=>{
   if(this.#pending()||this.snapshot().transactions.some(x=>x.state==='ACTIVE'))fail('RESOLVE_OPEN_TRANSACTION');
   const id=uuid();
   this.#change(data=>data.transactions.push({id,state:'NEW',revision:0,lines:[],payment:null,createdAt:new Date().toISOString(),testOnly:true,provider:this.#provider.name}),'CREATED',id);
   await this.#send(id,'ACTIVE');return id;
  });}
  async finish(id,lines,payment){return this.#lock(async()=>{
   const tx=this.#get(id);
   if(tx.state!=='ACTIVE'||tx.pending)fail('NOT_EDITABLE');
   if(tx.originalId)fail('REVERSAL_MUST_USE_APPROVED_SNAPSHOT');
   if(!['CASH','NON_CASH'].includes(payment))fail('INVALID_PAYMENT');
   const checked=validateLines(lines);
   this.#change(data=>Object.assign(data.transactions.find(x=>x.id===id),{lines:checked,payment}),'ITEMS_CONFIRMED',id);
   await this.#send(id,'FINISHED');
  });}
  async cancel(id,reason){return this.#lock(async()=>{
   if(typeof reason!=='string'||!reason.trim()||reason.length>160)fail('REASON_REQUIRED');
   const tx=this.#get(id);if(tx.state!=='ACTIVE'||tx.pending)fail('NOT_EDITABLE');
   this.#change(data=>{data.transactions.find(x=>x.id===id).reason=reason.trim();},'CANCEL_REQUESTED',id);
   await this.#send(id,'CANCELLED');
  });}
  async reverse(id,reason){return this.#lock(async()=>{
   const tx=this.#get(id);
   if(tx.state!=='FINISHED'||tx.originalId||tx.reversalId||this.#pending()||this.snapshot().transactions.some(x=>x.state==='ACTIVE'))fail('REVERSAL_NOT_ALLOWED');
   if(typeof reason!=='string'||!reason.trim()||reason.length>160)fail('REASON_REQUIRED');
   const reversalId=uuid(), lines=validateLines(tx.lines.map(x=>({...x,unitCents:-x.unitCents})),true);
   this.#change(data=>{
    data.transactions.find(x=>x.id===id).reversalId=reversalId;
    data.transactions.push({id:reversalId,originalId:id,state:'NEW',revision:0,lines,payment:tx.payment,reason:reason.trim(),createdAt:new Date().toISOString(),testOnly:true,provider:this.#provider.name});
   },'REVERSAL_CREATED',reversalId,{originalId:id});
   await this.#send(reversalId,'ACTIVE');
   if(this.#get(reversalId).state==='ACTIVE'&&!this.#get(reversalId).pending)await this.#send(reversalId,'FINISHED');
   return reversalId;
  });}
  async completeReversal(id){return this.#lock(async()=>{
   const tx=this.#get(id);if(!tx.originalId||tx.state!=='ACTIVE'||tx.pending)fail('REVERSAL_NOT_READY');
   await this.#send(id,'FINISHED');
  });}
  async #send(id,state){
   const tx=this.#get(id);
   const operation={id,revision:tx.revision+1,state};
   if(state==='FINISHED')operation.schema=receiptPayload(tx);
   this.#change(data=>{data.transactions.find(x=>x.id===id).pending=operation;},'PROVIDER_INTENT',id,{revision:operation.revision,state});
   try{this.#accept(id,await this.#provider.apply(operation));}
   catch(error){
    this.#change(data=>{data.transactions.find(x=>x.id===id).attention=true;},'PROVIDER_UNCERTAIN',id,{message:'Provider response unavailable or not confirmed; reconcile before proceeding.'});
   }
  }
  #accept(id,result){
   const tx=this.#get(id),pending=tx.pending;
   if(!pending||!result||result.id!==id||result.revision!==pending.revision||result.state!==pending.state)fail('PROVIDER_RESPONSE_MISMATCH');
   // The adapter is responsible for validating real TEST provider response fields.
   if(!result.simulated&&terminal.includes(result.state)&&!result.signature)fail('SIGNATURE_MISSING');
   this.#change(data=>{
    const record=data.transactions.find(x=>x.id===id);
    record.state=result.state;record.revision=result.revision;record.providerResult=clone(result);
    record.attention=false;record.pending=null;
    if(terminal.includes(result.state))record.closedAt=new Date().toISOString();
    if(record.originalId&&record.state==='CANCELLED')data.transactions.find(x=>x.id===record.originalId).reversalId=null;
   },'PROVIDER_CONFIRMED',id,{state:result.state,revision:result.revision,simulated:result.simulated===true});
  }
  async reconcile(id){return this.#lock(async()=>{
   const tx=this.#get(id);if(!tx.pending)fail('NOT_PENDING');
   const result=await this.#provider.retrieve(id);
   if(result?.revision===tx.pending.revision){this.#accept(id,result);return;}
   if((result?.revision||0)!==tx.revision||(result&&result.state!==tx.state))fail('PROVIDER_CONFLICT');
   // The provider did not apply the pending revision. Repeat the exact saved intent.
   try{this.#accept(id,await this.#provider.apply(clone(tx.pending)));}
   catch(error){this.#change(()=>{},'RECONCILIATION_UNCERTAIN',id);throw error;}
  });}
  report(){
   const data=this.snapshot(), closed=data.transactions.filter(x=>x.state==='FINISHED');
   return {format:'NARA-DEVELOPMENT-JOURNAL-1',testOnly:true,dsfinvk:false,warning:'NOT A TAX EXPORT / KEIN STEUEREXPORT',
    simulatedNetCents:closed.reduce((s,x)=>s+total(x.lines),0),...data};
  }
 }
 const api={Engine,MemoryJournal,SimulationProvider,validateLines,total,receiptPayload,initial};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NaraFiscal=api;
})(typeof globalThis!=='undefined'?globalThis:this);
