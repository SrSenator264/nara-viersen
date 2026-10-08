'use strict';
const fs=require('node:fs');
const path=require('node:path');

const templatesFile=path.join(__dirname,'local-invoice-templates.json');
function text(v){return String(v||'').replace(/\s+/g,' ').trim()}
function fingerprint(evidence){
  const all=(evidence?.pages||[]).flatMap(p=>p.items||[]).map(x=>text(x.text).toLowerCase());
  const supplier=all.find(x=>/meledi|melkaa/.test(x))||null;
  const labels=all.filter(x=>/itemcode|artikel|menge|e-?preis|g-?preis|rechnungsbetrag|netto|ust|mwst/.test(x)).slice(0,12);
  return {supplier,labels,pageCount:evidence?.pageCount||0};
}
function pageIdentity(evidence){
  const ids=[];
  for(const page of evidence?.pages||[]){
    const values=(page.items||[]).map(x=>text(x.text));
    const invoice=values.find(x=>/^\d{6,}$/.test(x))||null;
    const supplier=values.find(x=>/meledi|melkaa/i.test(x))||null;
    ids.push({invoice,supplier});
  }
  const distinct=new Set(ids.map(x=>x.invoice).filter(Boolean));
  return {pages:ids,consistent:distinct.size<=1,invoices:[...distinct]};
}
function readTemplates(){try{return JSON.parse(fs.readFileSync(templatesFile,'utf8'))}catch{return {version:1,templates:[]}}}
function saveTemplate(template){const current=readTemplates();const next={version:1,templates:Array.isArray(current.templates)?current.templates:[]};const key=JSON.stringify(template.fingerprint);const found=next.templates.find(x=>JSON.stringify(x.fingerprint)===key);if(found){found.history=found.history||[];found.history.push({savedAt:new Date().toISOString(),template});}else next.templates.push({...template,history:[]});fs.writeFileSync(templatesFile,JSON.stringify(next,null,2));return template}
function normalizeFingerprint(fp){return JSON.stringify({supplier:fp?.supplier||null,labels:(fp?.labels||[]).map(x=>String(x).toLowerCase()).sort()})}
function matchTemplate(fp){const templates=readTemplates().templates||[],key=normalizeFingerprint(fp);let best=null;for(const t of templates){const candidate=normalizeFingerprint(t.fingerprint);if(candidate===key)best=t}return best}
function learnTemplate({fingerprint,confirmed,documentId}){if(!fingerprint||!confirmed)return {ok:false,reason:'MISSING_EVIDENCE_OR_CONFIRMATION'};const template={id:'tpl_'+Date.now().toString(36),version:1,createdAt:new Date().toISOString(),documentId,fingerprint,anchors:{headerFields:['supplierName','customerNumber','invoiceNumber','invoiceDate','deliveryDate'],tableFields:['articleNumber','description','quantity','unit','unitPrice','lineTotal','vatRate'],totalsFields:['netAmount','vatAmount','grossAmount']},rules:{coordinateRelative:true,parser:'local-invoice-parser-poc.py'},confirmedFields:Object.keys(confirmed).filter(k=>k!=='lines')};return {ok:true,template:saveTemplate(template)}}
function extractPdfText(file){if(path.extname(file).toLowerCase()!=='.pdf')return null;const raw=fs.readFileSync(file,'latin1');const matches=[...raw.matchAll(/\(([^()]{2,200})\)\s*T[Jj]/g)].map(m=>text(m[1])).filter(Boolean);return matches.length?{type:'PDF_TEXT',text:matches.join('\n'),source:file}:null}
function inspectDigital(pagePaths){const evidence=[];for(const file of pagePaths){const found=extractPdfText(file);if(found)evidence.push(found)}return evidence.length?{sources:evidence}:null}
function assessGrouping(evidence){const identity=pageIdentity(evidence);return identity.consistent?{status:'CONSISTENT',identity}:{status:'DOCUMENT_GROUPING_UNSAFE',identity}}
function numberValue(v){const n=Number(String(v||'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:null}
function partialFromEvidence(evidence){const items=(evidence?.pages||[]).flatMap((p,pi)=>(p.items||[]).map((x,i)=>({...x,page:pi,index:i}))),values=items.map(x=>text(x.text)),invoiceNumber=values.find(x=>/^\d{6,}$/.test(x))||null,date=(values.find(x=>/^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/.test(x))||'').replace(/[./]/g,'-'),supplier=values.find(x=>/meledi|melkaa|www\.meledi/i.test(x))||null,customer=items.find(x=>/kunden-?nr/i.test(text(x.text))),customerNumber=customer?items.find(x=>(x.polygon?.[0]?.[1]||0)>=(customer.polygon?.[0]?.[1]||0)&&Math.abs((x.polygon?.[0]?.[0]||0)-(customer.polygon?.[0]?.[0]||0))>150&&/^\d{6,}$/.test(text(x.text)))?.text:null,footer=items.filter(x=>(x.polygon?.[0]?.[1]||0)>1100),netLabel=footer.find(x=>/^netto$/i.test(text(x.text))),vatLabel=footer.find(x=>/^ust\./i.test(text(x.text))),grossLabel=footer.find(x=>/^rechnungsbetrag/i.test(text(x.text))),nearAmount=(label)=>label?footer.filter(x=>Math.abs((x.polygon?.[0]?.[1]||0)-(label.polygon?.[0]?.[1]||0))<24&&(x.polygon?.[0]?.[0]||0)>(label.polygon?.[0]?.[0]||0)).filter(x=>/^\d+[,.]\d{2}$/.test(text(x.text))).sort((a,b)=>Math.abs((a.polygon?.[0]?.[1]||0)-(label.polygon?.[0]?.[1]||0))-Math.abs((b.polygon?.[0]?.[1]||0)-(label.polygon?.[0]?.[1]||0)))[0]?.text:null,articles=items.filter(x=>{const x0=x.polygon?.[0]?.[0]||0,y=x.polygon?.[0]?.[1]||0;return x0<350&&y>500&&y<1000&&/^\d{5,}[A-Za-z0-9-]*$/.test(text(x.text))}),positions=articles.map(article=>{const y=article.polygon?.[0]?.[1]||0,near=items.filter(x=>Math.abs((x.polygon?.[0]?.[1]||0)-y)<34),nums=near.filter(x=>/\d/.test(text(x.text))),qty=nums.find(x=>/\d+[,.]\d+\s+[A-Za-zÄÖÜäöü]+/.test(text(x.text))),prices=nums.filter(x=>/^\d+[,.]\d{2}$/.test(text(x.text))).sort((a,b)=>(a.polygon?.[0]?.[0]||0)-(b.polygon?.[0]?.[0]||0)),vat=near.find(x=>/^\d{1,2}%$/.test(text(x.text)));return {supplierArticleCode:article.text,originalDescription:near.find(x=>(x.polygon?.[0]?.[0]||0)>450&&/[A-Za-zÄÖÜäöü]/.test(text(x.text)))?.text||null,quantity:qty?numberValue(qty.text.match(/\d+[,.]\d+/)?.[0]):null,packageUnit:qty?text(qty.text).replace(/^[\d,.]+\s*/,''):null,unitPrice:prices[0]?numberValue(prices[0].text):null,lineTotal:prices[1]?numberValue(prices[1].text):null,vatRate:vat?numberValue(vat.text):null}});return {supplierName:supplier,invoiceNumber,invoiceDate:date||null,deliveryDate:date||null,customerNumber,netAmount:numberValue(nearAmount(netLabel)),vatAmount:numberValue(nearAmount(vatLabel)),grossAmount:numberValue(nearAmount(grossLabel)),currency:'EUR',lines:positions,positions,warnings:['LOCAL_REVIEW_REQUIRED'],requiresFallback:true}}
module.exports={fingerprint,pageIdentity,assessGrouping,inspectDigital,partialFromEvidence,readTemplates,saveTemplate,matchTemplate,learnTemplate};
