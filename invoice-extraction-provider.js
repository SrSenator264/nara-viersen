'use strict';

const schema={type:'object',properties:{supplierName:{type:'string',nullable:true},customerNumber:{type:'string',nullable:true},invoiceNumber:{type:'string',nullable:true},invoiceDate:{type:'string',nullable:true},deliveryDate:{type:'string',nullable:true},netAmount:{type:'number',nullable:true},vatAmount:{type:'number',nullable:true},grossAmount:{type:'number',nullable:true},currency:{type:'string',nullable:true},lines:{type:'array',items:{type:'object',properties:{supplierArticleCode:{type:'string',nullable:true},originalDescription:{type:'string',nullable:true},suggestedInventoryName:{type:'string',nullable:true},quantity:{type:'number',nullable:true},packageUnit:{type:'string',nullable:true},packageContent:{type:'number',nullable:true},packageContentUnit:{type:'string',nullable:true},unitPrice:{type:'number',nullable:true},lineTotal:{type:'number',nullable:true},vatRate:{type:'number',nullable:true}},required:['supplierArticleCode','originalDescription','suggestedInventoryName','quantity','packageUnit','packageContent','packageContentUnit','unitPrice','lineTotal','vatRate']}}},required:['supplierName','customerNumber','invoiceNumber','invoiceDate','deliveryDate','netAmount','vatAmount','grossAmount','currency','lines']};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transientStatus=status=>status===408||status===429||status===503||(status>=500&&status<=599);
const cents=value=>Math.round(Number(value)*100)/100;
function validateExtraction(parsed){
  const lines=Array.isArray(parsed?.lines)?parsed.lines:[],lineChecks=lines.map(line=>{const qty=Number(line?.quantity),price=Number(line?.unitPrice),total=Number(line?.lineTotal);if(![qty,price,total].every(Number.isFinite))return {status:'UNVERIFIABLE'};return {status:Math.abs(cents(qty*price)-cents(total))<=0.02?'VALID':'DISCREPANCY',expected:cents(qty*price),extracted:cents(total)}}),lineTotalSum=cents(lines.reduce((sum,line)=>sum+(Number.isFinite(Number(line?.lineTotal))?Number(line.lineTotal):0),0)),net=Number(parsed?.netAmount),vat=Number(parsed?.vatAmount),gross=Number(parsed?.grossAmount),netCheck=Number.isFinite(net)?{status:Math.abs(lineTotalSum-cents(net))<=0.02?'VALID':'DISCREPANCY',expected:lineTotalSum,extracted:cents(net)}:{status:'UNVERIFIABLE'},grossCheck=Number.isFinite(net)&&Number.isFinite(vat)&&Number.isFinite(gross)?{status:Math.abs(cents(net+vat)-cents(gross))<=0.02?'VALID':'DISCREPANCY',expected:cents(net+vat),extracted:cents(gross)}:{status:'UNVERIFIABLE'},vatByRate={};for(const line of lines){const rate=Number(line?.vatRate),total=Number(line?.lineTotal);if(Number.isFinite(rate)&&Number.isFinite(total))vatByRate[rate]=cents((vatByRate[rate]||0)+total*rate/100)}const calculatedVat=cents(Object.values(vatByRate).reduce((sum,value)=>sum+value,0)),vatCheck=Number.isFinite(vat)?{status:Math.abs(calculatedVat-cents(vat))<=0.02?'VALID':'DISCREPANCY',expected:calculatedVat,extracted:cents(vat)}:{status:'UNVERIFIABLE'};return {lineChecks,lineTotalSum,netCheck,grossCheck,vatCheck,suspicious:lineChecks.filter(x=>x.status==='DISCREPANCY').length>Math.max(1,Math.ceil(lines.length*.2))||[netCheck,grossCheck,vatCheck].some(x=>x.status==='DISCREPANCY')};
}
async function requestModel(model,body,key,attempt){
  const started=Date.now(),bodyBytes=Buffer.byteLength(JSON.stringify(body));
  console.log('[NARA][INVOICE_TIMING] gemini_attempt_start model='+model+' attempt='+attempt+' bodyBytes='+bodyBytes);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:controller.signal});
    let payload=null;try{payload=await r.json()}catch{}
    if(!r.ok){console.log('[NARA][INVOICE_TIMING] gemini_attempt_end model='+model+' attempt='+attempt+' status='+r.status+' ms='+(Date.now()-started));const e=new Error('Gemini-Anfrage fehlgeschlagen ('+r.status+')'+(payload?.error?.message?': '+payload.error.message:''));e.status=r.status;e.transient=transientStatus(r.status);throw e}
    console.log('[NARA][INVOICE_TIMING] gemini_attempt_end model='+model+' attempt='+attempt+' status='+r.status+' ms='+(Date.now()-started));
    return payload;
  }catch(error){
    if(error.name==='AbortError'){console.log('[NARA][INVOICE_TIMING] gemini_attempt_timeout model='+model+' attempt='+attempt+' ms='+(Date.now()-started));throw Object.assign(new Error('Gemini-Anfrage Timeout nach 20 Sekunden.'),{code:'GEMINI_TIMEOUT',transient:false})}
    if(Number.isInteger(error?.status)){
      console.info('[NARA][GEMINI_PROVIDER_STATUS]',{model,attempt,status:error.status,ms:Date.now()-started});
      throw error;
    }
    const cause=error?.cause||{};
    console.info('[NARA][INVOICE_TIMING] gemini_attempt_'+attempt+'='+(Date.now()-started)+'ms status=NETWORK_ERROR code='+(cause.code||error.code||'UNKNOWN'));
    console.info('[NARA][GEMINI_NETWORK_ERROR]',{name:error?.name||'Error',message:error?.message||'fetch failed',causeCode:cause.code||null,errno:cause.errno||null,syscall:cause.syscall||null,hostname:cause.hostname||null,address:cause.address||null,port:cause.port||null,causeMessage:cause.message||null});
    error.code=error.code||'GEMINI_NETWORK';error.transient=true;throw error;
  }finally{clearTimeout(timer)}
}
async function requestWithRetry(model,body,key,maxAttempts=2){
  let last;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    try{return await requestModel(model,body,key,attempt+1)}catch(error){last=error;const retryableStatus=error.status===503||(error.status>=500&&error.status<=599);if(!error.transient||error.status===429||(!retryableStatus&&error.code!=='GEMINI_NETWORK')||attempt===maxAttempts-1)throw error;const delay=250+Math.floor(Math.random()*500);console.log('[NARA][INVOICE_TIMING] retry model='+model+' nextAttempt='+(attempt+2)+' delayMs='+delay);await sleep(delay)}
  }
  throw last;
}
async function extract({files=[],mimeTypes=[]}){
  const totalStarted=Date.now(),prepStarted=Date.now();
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw Object.assign(new Error('Gemini API ist noch nicht konfiguriert.'),{code:'MISSING_KEY'});
  const parts=[{text:'Extrahiere ausschließlich sichtbare Rechnungsdaten. Erfinde niemals Werte. Fehlende Werte null. Bewahre Artikelcodes und Originalbeschreibungen. Erzeuge zusätzlich pro Zeile suggestedInventoryName: einen kurzen, eindeutigen und aussagekräftigen Inventarnamen aus 2 bis 5 Wörtern ohne Marke, Werbewörter, Halal- oder Tiefkühlhinweise und ohne Packungsgröße. Deutsche Dezimalzahlen als JSON-Zahlen. Konvertiere 2.5 kg explizit zu 2500 g und 10 L explizit zu 10000 ml, niemals kg zu ml. Antworte nur JSON gemäß Schema.'}];
  files.forEach((data,i)=>parts.push({inline_data:{mime_type:mimeTypes[i],data}}));
  const body={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseSchema:schema}};
  console.log('[NARA][INVOICE_TIMING] preprocessing='+(Date.now()-prepStarted)+'ms files='+files.length+' base64Bytes='+files.reduce((sum,file)=>sum+String(file||'').length,0));
  // Use stable multimodal models available on the Gemini API free tier.
  const primary=process.env.GEMINI_FAST_MODEL||'gemini-flash-lite-latest',escalation=process.env.GEMINI_ESCALATION_MODEL||'gemini-flash-latest';
  const parseResponse=response=>{const txt=response?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'';const parseStarted=Date.now();try{const parsed=JSON.parse(txt);Object.defineProperty(parsed,'__validation',{value:validateExtraction(parsed),enumerable:false});console.info('[NARA][GEMINI_ITEMS_COUNT]',Array.isArray(parsed?.lines)?parsed.lines.length:0);console.log('[NARA][INVOICE_TIMING] parsing='+(Date.now()-parseStarted)+'ms');return parsed}catch{console.log('[NARA][INVOICE_TIMING] parsing='+(Date.now()-parseStarted)+'ms error=json');return null}};
  const usable=parsed=>Array.isArray(parsed?.lines)&&parsed.lines.length>0&&parsed.lines.every(line=>line&&typeof line==='object');
  let parsed=null,fastError=null,primaryCandidate=null;
  try{parsed=parseResponse(await requestWithRetry(primary,body,key));}catch(error){fastError=error}
  primaryCandidate=parsed;
  console.info('[NARA][GEMINI_CANDIDATE]',{stage:'PRIMARY',model:primary,rows:Array.isArray(parsed?.lines)?parsed.lines.length:0,validation:parsed?.__validation?.suspicious?'SUSPICIOUS':parsed?'VALID':'UNAVAILABLE',reasons:parsed?.__validation?.reasons||[]});
  // The free lightweight model can extract all rows correctly while totals
  // still need human review. Keep that useful result instead of escalating
  // to a less-available model and turning a successful extraction into 503.
  if(usable(parsed)){console.log('[NARA][INVOICE_TIMING] primary='+primary+' total='+(Date.now()-totalStarted)+'ms reviewRequired='+(parsed.__validation.suspicious?'true':'false'));return parsed}
  console.log('[NARA][INVOICE_TIMING] escalation primary='+primary+' model='+escalation+' reason='+(fastError?.status===429?'HTTP_429':fastError?.code||(!parsed?'PRIMARY_FAILED':parsed?.__validation?.suspicious?'VALIDATION_SUSPICIOUS':'INVALID_OR_INCOMPLETE_JSON')));
  try{parsed=parseResponse(await requestWithRetry(escalation,body,key));}catch(error){throw Object.assign(new Error('AI invoice reading is temporarily unavailable. Your invoice data has not been changed. Please try again shortly.'),{code:'GEMINI_UNAVAILABLE',cause:error})}
  const fallbackRows=Array.isArray(parsed?.lines)?parsed.lines.length:0,primaryRows=Array.isArray(primaryCandidate?.lines)?primaryCandidate.lines.length:0;
  const drasticDrop=primaryRows>=8&&fallbackRows<primaryRows&&fallbackRows/primaryRows<0.75;
  const fallbackUnsafe=!usable(parsed)||parsed.__validation?.suspicious||drasticDrop;
  console.info('[NARA][GEMINI_CANDIDATE]',{stage:'FALLBACK',model:escalation,rows:fallbackRows,validation:parsed?.__validation?.suspicious?'SUSPICIOUS':usable(parsed)?'VALID':'INVALID',drasticDrop,reasons:[...(parsed?.__validation?.reasons||[]),...(drasticDrop?['LINE_COUNT_DROPPED_SHARPLY']:[])]});
  if(fallbackUnsafe){const error=Object.assign(new Error('Die Rechnung konnte nicht sicher geprüft werden.'),{code:'INVOICE_REVIEW_REQUIRED',reviewRequired:true,diagnostics:{primary:{model:primary,rows:primaryRows,validation:primaryCandidate?.__validation||null},fallback:{model:escalation,rows:fallbackRows,validation:parsed?.__validation||null},reason:drasticDrop?'LINE_COUNT_DROPPED_SHARPLY':'FALLBACK_VALIDATION_FAILED'}});console.info('[NARA][FINAL_SELECTION]',{selection:'REVIEW_REQUIRED',reason:error.diagnostics.reason});throw error}
  console.log('[NARA][FINAL_SELECTION]',{selection:'FALLBACK',model:escalation});
  console.log('[NARA][INVOICE_TIMING] total='+(Date.now()-totalStarted)+'ms');return parsed;
}
async function extractDeepSeek({files=[],mimeTypes=[]}){
  const started=Date.now(),key=process.env.DEEPSEEK_API_KEY;
  if(!key)throw Object.assign(new Error('DeepSeek API ist noch nicht konfiguriert.'),{code:'DEEPSEEK_MISSING_KEY'});
  if(mimeTypes.some(type=>type==='application/pdf'))throw Object.assign(new Error('DeepSeek Vision unterstützt in diesem Experiment nur Bildseiten.'),{code:'DEEPSEEK_UNSUPPORTED_MEDIA'});
  const prompt='Extrahiere ausschließlich sichtbare Rechnungsdaten. Erfinde niemals Werte. Fehlende Werte null. Bewahre Artikelcodes und Originalbeschreibungen. Deutsche Dezimalzahlen als JSON-Zahlen. Konvertiere kg zu g und L zu ml. Antworte ausschließlich als JSON-Objekt mit diesen Feldern: supplierName, customerNumber, invoiceNumber, invoiceDate, deliveryDate, netAmount, vatAmount, grossAmount, currency, lines. Jede line enthält supplierArticleCode, originalDescription, quantity, packageUnit, packageContent, packageContentUnit, unitPrice, lineTotal, vatRate.';
  const content=[{type:'text',text:prompt},...files.map((data,i)=>({type:'image_url',image_url:{url:'data:'+(mimeTypes[i]||'image/jpeg')+';base64,'+data,detail:'original'}}))];
  const body={model:process.env.DEEPSEEK_MODEL||'deepseek-flash',messages:[{role:'user',content}],response_format:{type:'json_object'},stream:false};
  console.log('[NARA][DEEPSEEK_TIMING] start model='+body.model+' pages='+files.length+' bodyBytes='+Buffer.byteLength(JSON.stringify(body)));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(body),signal:controller.signal});
    let payload=null;try{payload=await r.json()}catch{}
    const ms=Date.now()-started;console.log('[NARA][DEEPSEEK_TIMING] end status='+r.status+' ms='+ms);
    if(!r.ok){const providerError=payload?.error||{};console.error('[NARA][DEEPSEEK_PROVIDER_STATUS]',{status:r.status,type:providerError.type||null,code:providerError.code||null,message:typeof providerError.message==='string'?providerError.message.slice(0,240):null});const e=Object.assign(new Error('DeepSeek HTTP '+r.status),{status:r.status,code:'DEEPSEEK_PROVIDER_ERROR'});throw e}
    const text=payload?.choices?.[0]?.message?.content||'';const parsed=JSON.parse(String(text).replace(/^```json\s*|\s*```$/g,''));Object.defineProperty(parsed,'__validation',{value:validateExtraction(parsed),enumerable:false});Object.defineProperty(parsed,'__usage',{value:payload?.usage||null,enumerable:false});
    console.log('[NARA][DEEPSEEK_RESULT]',{items:Array.isArray(parsed.lines)?parsed.lines.length:0,validation:parsed.__validation.suspicious?'SUSPICIOUS':'OK',promptTokens:payload?.usage?.prompt_tokens??null,completionTokens:payload?.usage?.completion_tokens??null,totalTokens:payload?.usage?.total_tokens??null,ms});
    return parsed;
  }catch(error){if(error.name==='AbortError')error=Object.assign(new Error('DeepSeek Timeout'),{code:'DEEPSEEK_TIMEOUT'});console.error('[NARA][DEEPSEEK_ERROR]',{code:error.code||null,status:error.status||null,message:error.message||null});throw error}
  finally{clearTimeout(timer)}
}
module.exports={extract,extractDeepSeek,validateExtraction};
