// Development-only compact OCR parser/scoring harness. Reference is scoring-only.
const fs=require('fs');
const root=__dirname;
const evidence=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const admin=JSON.parse(fs.readFileSync(root+'\\data\\nara-admin.json','utf8'));
const invoice=process.argv[3];
const doc=admin.documents.find(d=>d.extraction?.header?.invoiceNumber===invoice);
const refs=doc?.extraction?.header?.lines||[];
const normArticle=v=>String(v??'').replace(/\s+/g,'').toUpperCase();
const money=/^\d+[,.]\d{2}$/;
const vat=/^(?:0|7|19)\s*%$/;
const qty=/^(\d+(?:[,.]\d+)?)\s*(Karton|Beutel|Packung|Kanister|Eimer|Tray|Flasche|Stück|Dose|Kiste|KG|Kg|g|ml|Liter|l)$/i;
const qtyNumber=/^\d+(?:[,.]\d+)?$/;
const num=v=>{let s=String(v).trim(); if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(',','.'); const n=Number(s); return Number.isFinite(n)?n:null};
function parsePage(page){
 const boxes=page.items.map(x=>{const p=x.polygon||[],xs=p.map(a=>a[0]),ys=p.map(a=>a[1]);return {...x,xc:(Math.min(...xs)+Math.max(...xs))/2,yc:(Math.min(...ys)+Math.max(...ys))/2}});
 const itemCodeIndex=boxes.findIndex(x=>x.text.trim().toLowerCase()==='itemcode');
 const start=(itemCodeIndex+1)||0;
 const firstAnchorIndex=boxes.findIndex((b,i)=>i>=start&&b.xc<260&&/^[A-Za-z]*\d{3,7}$|^\d{3,7}$/.test(b.text.trim()));
 const heading=name=>boxes.slice(0,firstAnchorIndex<0?start:firstAnchorIndex).find(b=>b.text.trim().toLowerCase()===name.toLowerCase());
 const qtyHead=heading('Menge ME'), descHead=heading('Artikelbezeichnung'), priceHead=heading('E-Preis'), totalHead=heading('G-Preis'), vatHead=heading('MW');
 const cols={qty:qtyHead?.xc??430,desc:descHead?.xc??650,price:priceHead?.xc??1180,total:totalHead?.xc??1300,vat:vatHead?.xc??1450};
 const nonArticles=new Set(['verkauf','itemcode','menge me','artikelbezeichnung','e-preis','g-preis','mw','pin','netto','trnr','beg','ende','tse','sigz','sign']);
 const anchors=boxes.filter((b,i)=>i>=start&&b.xc<260&&/^[A-Za-z0-9]{3,20}$/.test(b.text.trim())&&!nonArticles.has(b.text.trim().toLowerCase()));
 const priceBoxes=boxes.filter(b=>b.xc>=(cols.desc+cols.price)/2&&b.xc<((cols.price+cols.total)/2)&&money.test(b.text.trim())).sort((a,b)=>a.yc-b.yc);
 const totalBoxes=boxes.filter(b=>b.xc>=(cols.price+cols.total)/2&&b.xc<((cols.total+cols.vat)/2)&&money.test(b.text.trim())).sort((a,b)=>a.yc-b.yc);
 const vatBoxes=boxes.filter(b=>b.xc>=(cols.total+cols.vat)/2&&vat.test(b.text.trim())).sort((a,b)=>a.yc-b.yc);
 return anchors.map((anchor,anchorIndex)=>{const row=boxes.filter(b=>Math.abs(b.yc-anchor.yc)<=30),near=(fn,y=anchor.yc)=>row.filter(fn).sort((a,b)=>Math.abs(a.yc-y)-Math.abs(b.yc-y))[0];
  const columnPick=(list)=>list.length===anchors.length?list[anchorIndex]:near(b=>list.includes(b));
  const q=near(b=>b.xc>=cols.qty-130&&b.xc<((cols.qty+cols.desc)/2)&&(qty.test(b.text.trim())||qtyNumber.test(b.text.trim())));
  const up=columnPick(priceBoxes), total=columnPick(totalBoxes), vb=columnPick(vatBoxes), qm=q&&q.text.match(qty);
  return {articleNumber:anchor.text.trim(),quantity:qm?num(qm[1]):(q&&qtyNumber.test(q.text.trim())?num(q.text):null),unit:qm?qm[2]:null,unitPrice:up?num(up.text):null,lineTotal:total?num(total.text):null,vatRate:vb?num(vb.text.replace('%',''))/100:null,evidence:{article:anchor.index,quantity:q?.index,unitPrice:up?.index,lineTotal:total?.index,vat:vb?.index}};
 });
}
const candidates=evidence.pages.flatMap(parsePage).filter(x=>x.articleNumber);
const ref=new Map(refs.map(x=>[normArticle(x.supplierArticleCode),x]));
const rows=candidates.map(c=>{const r=ref.get(normArticle(c.articleNumber)); return {article:c.articleNumber,qty:c.quantity,refQty:r?.quantity,price:c.unitPrice,refPrice:r?.unitPrice,vat:c.vatRate,refVat:r?.vatRate,matched:!!r,evidence:c.evidence}});
const exact={article:rows.filter(x=>x.matched).length,quantity:0,price:0,vat:0}; for(const x of rows){if(x.matched&&x.qty===x.refQty)exact.quantity++;if(x.matched&&x.price===x.refPrice)exact.price++;if(x.matched&&x.vat===x.refVat/100)exact.vat++;}
const out={invoice,sourceRun:evidence.sourceRun,pages:evidence.pageCount,candidateRows:candidates.length,referenceRows:refs.length,exact,rows,requiresFallback:candidates.length!==refs.length||rows.some(x=>!x.matched||x.qty==null||x.price==null||x.vat==null),note:'Reference joined only by normalized article number after extraction.'};
fs.writeFileSync(root+'\\local-ocr-output\\benchmarks\\'+invoice+'\\score-audit.json',JSON.stringify(out,null,2)); console.log(JSON.stringify(out,null,2));
