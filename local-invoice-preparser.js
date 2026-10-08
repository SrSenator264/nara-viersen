'use strict';

// Controlled development hook. Disabled unless explicitly enabled.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const hybrid=require('./local-invoice-hybrid');
const {LocalOcrWorkerManager}=require('./local-ocr-worker-manager');
let workerManager=null;

function settings(){try{return JSON.parse(fs.readFileSync(path.join(__dirname,'local-preparser-settings.json'),'utf8'))}catch{return {}}}
function enabled(){const s=settings();return (s.developmentOnly===true&&s.enabled===true&&process.env.NODE_ENV!=='production')||process.env.NARA_LOCAL_PREPARSER_ENABLED==='1'}
function evidenceFor(documentId){
  const mapFile=process.env.NARA_LOCAL_PREPARSER_MAP;
  if(!mapFile||!fs.existsSync(mapFile))return null;
  let map;try{map=JSON.parse(fs.readFileSync(mapFile,'utf8'))}catch{return null}
  const value=map&&map[documentId];
  if(!Array.isArray(value)||!value.length||value.some(file=>!fs.existsSync(file)))return null;
  return value;
}
function runParser({documentId,evidence,invoiceNumber=null}){
  return new Promise((resolve,reject)=>{
    const python=process.env.NARA_LOCAL_PREPARSER_PYTHON||settings().python;
    const parser=path.resolve(__dirname,'local-invoice-parser-poc.py');
    if(!python||!fs.existsSync(python)||!fs.existsSync(parser)){console.info('[NARA][LOCAL_PREPARSER_ERROR]',{documentId,reason:'PYTHON_OR_PARSER_UNAVAILABLE',python,parser});return resolve(null)}
    const args=[parser,'--evidence',evidence[0],'--invoice',String(invoiceNumber||''),'--output',path.join(__dirname,'local-ocr-output','parser-poc','server-local-candidate.json')];
    const child=spawn(python,args,{cwd:__dirname,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});let out='',err='';
    child.stdout.on('data',chunk=>{out+=chunk});child.stderr.on('data',chunk=>{err+=chunk});
    child.on('error',error=>reject(error));
    child.on('close',code=>{
      if(code!==0){console.info('[NARA][LOCAL_PREPARSER_ERROR]',{documentId,code,error:err.slice(-500)});return resolve(null)}
      const candidate=path.join(__dirname,'local-ocr-output','parser-poc','server-local-candidate.json');
      try{const report=JSON.parse(fs.readFileSync(candidate,'utf8')).reports?.[0];if(!report)return resolve(null);const parsed={...report,...(report.header||{}),lines:(report.positions||report.lines||[]).map(row=>({supplierArticleCode:row.articleNumber||row.supplierArticleCode||null,originalDescription:row.description||row.originalDescription||null,quantity:row.quantity,packageUnit:row.unit||row.packageUnit||null,packageContent:null,packageContentUnit:null,unitPrice:row.unitPrice,lineTotal:row.lineTotal,vatRate:row.vatRate}))};return resolve({parsed,stdout:out.slice(-1000)})}catch(error){console.info('[NARA][LOCAL_PREPARSER_ERROR]',{documentId,code,error:error.message});return resolve(null)}finally{try{fs.rmSync(candidate,{force:true})}catch{}}
    });
  });
}
function runOcr({documentId,pagePaths}){
  return new Promise((resolve)=>{
    const python=process.env.NARA_LOCAL_PREPARSER_PYTHON||settings().python,script=path.resolve(__dirname,'local-ocr-test.py');
    if(!python||!fs.existsSync(python)||!fs.existsSync(script)||pagePaths.some(file=>path.extname(file).toLowerCase()!=='.jpeg'&&path.extname(file).toLowerCase()!=='.jpg'&&path.extname(file).toLowerCase()!=='.png'))return resolve(null);
    const output=path.join(__dirname,'local-ocr-output','runtime',`evidence-${documentId}-${process.pid}-${Date.now()}.json`);
    if(!workerManager)workerManager=new LocalOcrWorkerManager({python});
    const started=Date.now();console.info('[NARA][LOCAL_OCR_START]',{documentId,python,pages:pagePaths,mode:'persistent-worker'});
    workerManager.run(pagePaths).then(message=>{fs.mkdirSync(path.dirname(output),{recursive:true});const evidenceWriteStarted=Date.now();fs.writeFileSync(output,JSON.stringify(message.evidence),'utf8');const timings={...(message.timings||{}),evidenceWriteMs:Date.now()-evidenceWriteStarted};const ocrMs=message.ocrMs||Date.now()-started;console.info('[NARA][LOCAL_OCR_COMPLETE]',{documentId,code:0,ocrMs,evidence:output,mode:'persistent-worker',timings});resolve({files:[output],ocrMs,cleanup:output});}).catch(error=>{console.info('[NARA][LOCAL_PREPARSER_ERROR]',{documentId,code:null,ocrMs:Date.now()-started,error:error.message});resolve(null)});
  });
}
function safe(parsed){
  const validation=parsed&&parsed.validation||parsed&&parsed.totalsValidation||null;
  const lines=Array.isArray(parsed?.positions)?parsed.positions:[];
  const complete=lines.length>0&&lines.every(line=>line&&line.articleNumber&&Number.isFinite(Number(line.quantity))&&Number.isFinite(Number(line.unitPrice))&&Number.isFinite(Number(line.lineTotal))&&Number.isFinite(Number(line.vatRate)));
  const headerComplete=Boolean(parsed?.supplierName&&parsed?.invoiceNumber&&parsed?.invoiceDate)&&[parsed?.netAmount,parsed?.vatAmount,parsed?.grossAmount].every(value=>Number.isFinite(Number(value)));
  return complete&&headerComplete&&(!validation||validation.status==='VALID')&&parsed.requiresFallback!==true;
}
function routeFor(parsed){return safe(parsed)?'LOCAL_ACCEPTED':'LOCAL_FALLBACK_GEMINI'}
async function tryLocal({documentId,invoiceNumber,pagePaths=[]}){
  if(!enabled())return null;
  let evidence=evidenceFor(documentId);
  let ocrMs=null,cleanup=null;if(!evidence&&pagePaths.length){const run=await runOcr({documentId,pagePaths});if(run){evidence=run.files;ocrMs=run.ocrMs;cleanup=run.cleanup}}
  if(!evidence)return {route:'LOCAL_FAILED_GEMINI_USED',reason:'LOCAL_UNAVAILABLE'};
  let grouping=null;try{grouping=hybrid.assessGrouping(JSON.parse(fs.readFileSync(evidence[0],'utf8')));console.info('[NARA][LOCAL_GROUPING]',{documentId,status:grouping.status,invoices:grouping.identity.invoices,pages:grouping.identity.pages});}catch(error){console.info('[NARA][LOCAL_GROUPING_ERROR]',{documentId,message:error.message})}
  if(grouping?.status==='DOCUMENT_GROUPING_UNSAFE'){if(cleanup)try{fs.rmSync(cleanup,{force:true})}catch{}return {route:'LOCAL_FALLBACK_GEMINI',reason:'DOCUMENT_GROUPING_UNSAFE',result:null,timings:{ocrMs}};}
  const layout=hybrid.matchTemplate(hybrid.fingerprint(JSON.parse(fs.readFileSync(evidence[0],'utf8'))));
  const result=await runParser({documentId,evidence,invoiceNumber});
  const evidenceJson=JSON.parse(fs.readFileSync(evidence[0],'utf8')),partial=hybrid.partialFromEvidence(evidenceJson);partial.deliveryDate=null;
  if(result){
    for(const key of ['supplierName','invoiceNumber','invoiceDate','deliveryDate','customerNumber','netAmount','vatAmount','grossAmount','currency']){
      const missing=result.parsed[key]===null||result.parsed[key]===undefined||(key==='invoiceNumber'&&typeof result.parsed[key]==='string'&&!result.parsed[key].trim());
      if(missing)result.parsed[key]=partial[key];
    }
  }
  if(!result){console.info('[NARA][LOCAL_PARTIAL_RESULT]',{documentId,rows:partial.lines.length,invoiceNumber:partial.invoiceNumber,supplier:partial.supplierName});if(cleanup)try{fs.rmSync(cleanup,{force:true})}catch{}return {route:'LOCAL_FALLBACK_GEMINI',reason:'PARSER_UNAVAILABLE',result:{parsed:partial},timings:{ocrMs,parserMs:null}}}
  const routed=!safe(result.parsed)?{route:layout?'KNOWN_LAYOUT_REVIEW_REQUIRED':'LOCAL_FALLBACK_GEMINI',reason:'LOCAL_UNSAFE',layout:layout?.id||null,result,timings:{ocrMs,parserMs:result?.parsed?.parserSeconds?Math.round(result.parsed.parserSeconds*1000):null}}:{route:layout?'KNOWN_LAYOUT_LOCAL_ACCEPTED':'LOCAL_ACCEPTED',extraction:result.parsed,layout:layout?.id||null,result,timings:{ocrMs,parserMs:result.parsed.parserSeconds?Math.round(result.parsed.parserSeconds*1000):null}};
  if(cleanup)try{fs.rmSync(cleanup,{force:true})}catch{}return routed;
}
async function shutdown(){if(workerManager){await workerManager.shutdown();workerManager=null;}}
module.exports={tryLocal,safe,routeFor,settings,shutdown};
