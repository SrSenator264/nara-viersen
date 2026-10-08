(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NaraInvoiceReview=api;
})(typeof window!=='undefined'?window:globalThis, function(){
  const first=(...values)=>values.find(value=>value!==null&&value!==undefined&&String(value).trim()!=='');
  const asNumber=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
  const canonicalDate=value=>{
    if(!value)return null;
    const text=String(value).trim();
    const m=text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:text;
  };
  function normalizeInvoiceReview(payload={},meta={}){
    const source=payload.extraction||payload.document?.extraction||payload;
    const header=source.header&&typeof source.header==='object'?source.header:{};
    const value=(key)=>first(source[key],header[key],payload.document?.extraction?.[key],payload.document?.extraction?.header?.[key]);
    const rawLines=Array.isArray(header.lines)?header.lines:Array.isArray(source.lines)?source.lines:Array.isArray(payload.document?.extraction?.lines)?payload.document.extraction.lines:[];
    const lines=rawLines.map(line=>({
      supplierArticleCode:first(line.supplierArticleCode,line.articleNumber,line.code)||null,
      originalDescription:first(line.originalDescription,line.description)||'',
      suggestedInventoryName:first(line.suggestedInventoryName,line.shortName)||null,
      quantity:asNumber(line.quantity), packageUnit:first(line.packageUnit)||'',
      packageContent:asNumber(line.packageContent), packageContentUnit:first(line.packageContentUnit)||'',
      unitPrice:asNumber(line.unitPrice), lineTotal:asNumber(line.lineTotal), vatRate:asNumber(line.vatRate)
    }));
    return {
      invoiceNumber:String(value('invoiceNumber')||''), customerNumber:String(value('customerNumber')||''),
      invoiceDate:canonicalDate(value('invoiceDate')), deliveryDate:canonicalDate(value('deliveryDate')),
      supplierIdentity:String(first(value('supplierIdentity'),value('supplierName'))||''), supplierMapping:meta.supplierMapping||null,
      lines, net:asNumber(first(value('net'),value('netAmount'))), vat:asNumber(first(value('vat'),value('vatAmount'))),
      gross:asNumber(first(value('gross'),value('grossAmount'))), currency:String(value('currency')||'EUR'),
      route:meta.route||payload.extractionRoute||null, reviewRequired:!!(meta.reviewRequired??payload.reviewRequired??false),
      diagnostics:{sourceShape:payload.extraction?'extraction':payload.document?.extraction?'document.extraction':'payload',...(meta.diagnostics||{})}
    };
  }
  return {normalizeInvoiceReview,canonicalDate};
});
