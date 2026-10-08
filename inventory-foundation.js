'use strict';
(function(){
  document.write('<script src="nara-i18n.js"><\/script><script src="invoice-review-model.js?v=20260930-review-model"><\/script>');
  const l=document.createElement('link');
  l.rel='stylesheet';
  l.href='nara-shell.css';
  document.head.appendChild(l);
  const invoiceLayout=document.createElement('style');
  invoiceLayout.textContent='html,body{max-width:100%;overflow-x:hidden}button{transition:transform .08s ease,background-color .15s ease,box-shadow .15s ease}button:active:not(:disabled){transform:translateY(2px) scale(.98);box-shadow:inset 0 2px 5px #0004}button.nara-clicked{background:#2f7d4a!important;box-shadow:0 0 0 3px #2f7d4a33}button.nara-working{position:relative;pointer-events:none;opacity:.8}button.nara-working:after{content:"";display:inline-block;width:12px;height:12px;margin-inline-start:8px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;vertical-align:-2px;animation:nara-spin .7s linear infinite}@keyframes nara-spin{to{transform:rotate(360deg)}}#invoice-review,#review-form,.review-lines-wrap{min-width:0;max-width:100%;overflow:hidden}#review-book:disabled{opacity:.45;background:#98a09a;color:#eef1ed;cursor:not-allowed}.review-table-scroll{display:block;width:100%;max-width:100%;overflow:visible}.review-table-scroll .table{width:100%;table-layout:fixed}.review-table-scroll thead{display:none}.review-table-scroll tbody{display:grid;gap:12px}.review-table-scroll tr{display:grid;grid-template-columns:minmax(0,2fr) minmax(150px,1fr) minmax(150px,1fr) auto;gap:10px;align-items:start;padding:14px;border:1px solid #e3e6df;border-radius:12px;background:#fff}.review-table-scroll td{display:flex;flex-direction:column;gap:4px;min-width:0;border:0;padding:0;white-space:normal}.review-table-scroll td:before{content:attr(data-label);font-size:.72rem;color:#697067;font-weight:700;text-transform:uppercase;letter-spacing:.03em}.review-table-scroll td:nth-child(1),.review-table-scroll td:nth-child(2){grid-column:span 2}.review-table-scroll td:nth-child(7){grid-column:1}.review-table-scroll td:nth-child(8){grid-column:2 / span 2}.review-table-scroll td:nth-child(9),.review-table-scroll td:nth-child(10),.review-table-scroll td:nth-child(11){font-size:.9rem;color:#596158}.review-table-scroll input,.review-table-scroll select{min-width:0;width:100%}.line-product{font-weight:700;font-size:1rem;color:#20231f}.line-code{font-size:.82rem;color:#697067}.line-total{font-weight:700;color:#20231f}.match-status{font-weight:700;color:#697067}.match-status[data-state="confirmed"],.match-status[data-state="saved"]{color:#2f7d4a}.match-status[data-state="suggested"]{color:#9a6700}.match-confirm{align-self:end;white-space:nowrap}.conversion-summary{display:grid;gap:3px;margin:.35rem 0;padding:.4rem .55rem;border-radius:6px;background:#f4f7f2;font-size:.78rem;line-height:1.35}.conversion-summary small{display:block}.duplicate-warning{display:grid;gap:4px;padding:.45rem;background:#fff6df;border:1px solid #e4c56e;border-radius:6px;font-size:.8rem}.duplicate-warning button{white-space:normal}@media(max-width:700px){.review-table-scroll tr{grid-template-columns:1fr 1fr}.review-table-scroll td:nth-child(1),.review-table-scroll td:nth-child(2),.review-table-scroll td:nth-child(7),.review-table-scroll td:nth-child(8){grid-column:1/-1}.match-confirm{grid-column:1/-1}}';
  document.head.appendChild(invoiceLayout);
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;button.classList.add('nara-clicked');setTimeout(()=>button.classList.remove('nara-clicked'),450)});
  const reviewPagesStyle=document.createElement('style');
  reviewPagesStyle.textContent='#review-pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:start;direction:ltr;padding:12px 0}.review-page-card{display:flex;flex-direction:column;gap:8px;align-items:center;padding:10px;border:1px solid #e3e6df;border-radius:10px;background:#fff;direction:rtl}.review-page-card img{display:block;width:100%;max-width:520px;height:auto;max-height:560px;object-fit:contain;border-radius:6px;background:#f4f5f2}.review-page-card a{display:block;width:100%;text-align:center}.review-page-card b{align-self:flex-start}';
  document.head.appendChild(reviewPagesStyle);
  const validationStyle=document.createElement('style');validationStyle.textContent='.validation-summary{margin:10px 0;padding:10px 12px;border:1px solid #dfe5dc;border-radius:8px;background:#f8faf7}.validation-summary h3{margin:0 0 4px}.validation-counts,.validation-totals{font-size:.85rem}.line-validation{display:block;margin-top:4px;font-weight:700}.line-validation[data-state="discrepancy"]{color:#a33b2b}.line-validation[data-state="valid"]{color:#2f7d4a}.line-validation[data-state="unknown"]{color:#8a6b22}';document.head.appendChild(validationStyle);
  const s=document.createElement('script');
  s.src='nara-shell.js';
  document.head.appendChild(s)
})();
const UI=(key,fallback)=>window.NARA_I18N?.t(key)||fallback;
const relabelReviewLines=()=>{document.querySelectorAll('#review-lines tr').forEach(tr=>{tr.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=UI(el.dataset.i18n,el.textContent)});tr.querySelectorAll('[data-label-i18n]').forEach(el=>{el.dataset.label=UI(el.dataset.labelI18n,el.dataset.label)});const editorLabels=tr.querySelectorAll('.new-ingredient-editor label');if(editorLabels.length===3){editorLabels[0].childNodes[0].textContent=UI('line.packageUnit','Gebinde')+' ';editorLabels[1].childNodes[0].textContent=UI('line.packageQuantity','Menge je Gebinde')+' ';editorLabels[2].childNodes[0].textContent=UI('line.inventoryUnit','Inventareinheit')+' '}const status=tr.querySelector('.match-status'),state=status?.dataset.state;if(status)status.textContent=state==='saved'?UI('status.saved','✓ Gespeichert'):state==='confirmed'?UI('status.confirmed','Bestätigt'):state==='suggested'?UI('status.suggested','Vorschlag'):UI('line.notAssigned','Nicht zugeordnet');const confirm=tr.querySelector('.match-confirm');if(confirm)confirm.textContent=UI('line.confirmSuggestion','Vorschlag bestätigen');const del=tr.querySelector('[data-delete-review]');if(del)del.textContent=UI('line.delete','Position löschen');const search=tr.querySelector('.ingredient-search');if(search)search.placeholder=UI('line.searchIngredient','Zutat suchen…');const warning=tr.querySelector('.duplicate-warning');if(warning)warning.dataset.prefix=UI('line.duplicateWarning','Mögliche vorhandene Zutat:')})};
const relabelReviewHeader=()=>{const keys={supplierName:'nav.suppliers',customerNumber:'review.customerNumber',invoiceNumber:'invoice.number',invoiceDate:'invoice.date',deliveryDate:'invoice.deliveryDate',netAmount:'invoice.net',vatAmount:'review.vat',grossAmount:'invoice.total',currency:'review.currency'};document.querySelectorAll('#review-form label').forEach(label=>{const input=label.querySelector('input'),key=label.dataset.i18nLabel||keys[input?.name];const text=[...label.childNodes].find(node=>node.nodeType===3);if(text&&key)text.textContent=UI(key,text.textContent.trim())+' '});const supplierButton=document.querySelector('#create-review-supplier');if(supplierButton)supplierButton.textContent=UI('review.newSupplier','+ Neuen Lieferanten anlegen');const s=document.querySelector('#review-validation-summary h3');if(s)s.textContent=UI('review.validationTitle','Rechnungsprüfung');};
window.addEventListener('nara-language-changed',()=>{document.querySelectorAll('.new-ingredient').forEach(el=>el.textContent=UI('ingredient.create','+ Neue Zutat'));document.querySelectorAll('.new-ingredient-create').forEach(el=>el.textContent=UI('ingredient.createConfirm','Zutat erstellen'));document.querySelectorAll('.new-ingredient-name').forEach(el=>el.placeholder=UI('ingredient.name','Name der Zutat'));const reviewTitle=document.querySelector('#invoice-review h2');if(reviewTitle)reviewTitle.textContent=UI('invoice.review.title','Rechnung prüfen');const reviewHelp=document.querySelector('#invoice-review .muted');if(reviewHelp)reviewHelp.textContent=UI('invoice.review.help','Automatisch erkannte Werte bitte prüfen und ergänzen');const extract=document.querySelector('#gemini-extract');if(extract)extract.textContent=UI('invoice.extract','Rechnung auslesen');const learn=document.querySelector('#learn-invoice-layout');if(learn)learn.textContent=UI('invoice.layoutLearn','Layout lernen');const optional=document.querySelector('#optional-gemini-extract');if(optional)optional.textContent=UI('invoice.geminiOptional','Mit Gemini versuchen');document.querySelectorAll('#review-pages b').forEach((el,index)=>el.textContent=UI('invoice.page','Seite')+' '+(index+1));const add=document.querySelector('#review-add-line');if(add)add.textContent=UI('invoice.addPosition','+ Position hinzufügen');const book=document.querySelector('#review-book');if(book)book.textContent=UI('invoice.postGoodsReceipt','Wareneingang buchen');relabelReviewHeader();relabelReviewLines();window.__naraRefreshReviewLanguage?.()});
const API='/api/admin-data', state={
};
const $=s=>document.querySelector(s), uid=p=>p+'_'+Date.now().toString(36), now=()=>new Date().toISOString();
const opts=(xs)=>'<option value="">—</option>'+xs.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
function dateInputValue(value){
  const text=String(value??'').trim();
  let m=text.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';
}
async function load(){
  const r=await fetch(API,{
    cache:'no-store'
  });
  Object.assign(state,await r.json());
  for(const k of ['inventoryItems','suppliers','supplierArticles','invoices','stockMovements'])state[k]??=[];
  render();
  // A successful state load must clear a stale prior extraction/server error.
  // It does not alter the review model or any persisted business data.
  const status=$('#status');
  const staleStatus=[UI('message.extractionFailed','Invoice extraction failed. Your existing review data remains unchanged.'),UI('message.serverUnavailable','NARA is currently unavailable. Please restart the NARA launcher.')];
  if(status&&staleStatus.includes(status.textContent||''))status.textContent='';
  window.__naraRefreshReviewSuppliers?.()
}
async function save(collection,items){
  const r=await fetch(API,{
    method:'POST',headers:{
      'Content-Type':'application/json'
    },body:JSON.stringify({
      collection,items
    })
  });
  if(!r.ok)throw Error((await r.json()).error||'Speichern fehlgeschlagen');
  Object.assign(state,await r.json());
  $('#status').textContent='Gespeichert ✓';
  render()
}
function render(){
  const af=$('#article-form'),iv=$('#invoice-form');
  const invoiceList=$('#invoices-list');
  if(invoiceList&&!document.querySelector('#invoice-archive-tools')){const tools=document.createElement('div');tools.id='invoice-archive-tools';tools.className='card';tools.innerHTML='<label>بحث في الأرشيف أو فواتير اليوم <input id="invoice-archive-search" placeholder="رقم الفاتورة أو المورد"></label><button type="button" id="invoice-archive-toggle">عرض الأرشيف</button><button type="button" id="invoice-archive-day">أرشفة فواتير اليوم</button><span id="invoice-archive-status" class="muted"></span>';invoiceList.closest('.card').prepend(tools);tools.querySelector('#invoice-archive-toggle').onclick=()=>{window.__invoiceArchiveMode=window.__invoiceArchiveMode==='archive'?'active':'archive';render()};tools.querySelector('#invoice-archive-day').onclick=async()=>{const date=new Date().toISOString().slice(0,10),r=await fetch('/api/invoices/archive-day',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date})}),j=await r.json();tools.querySelector('#invoice-archive-status').textContent=r.ok?`تمت أرشفة ${j.archivedCount} فاتورة`:j.error||'تعذر الأرشفة';if(r.ok)await load()};tools.querySelector('#invoice-archive-search').oninput=()=>render()}
  af.supplierId.innerHTML=opts(state.suppliers);
  af.inventoryItemId.innerHTML=opts(state.inventoryItems);
  iv.supplierId.innerHTML=opts(state.suppliers);
  $('#items-list').innerHTML=state.inventoryItems.map(x=>`<tr><td>${x.name}</td><td>${x.baseUnit||x.unit}</td><td>${x.currentStock||0}</td><td>${x.active===false?UI('status.inactive','Inaktiv'):UI('status.active','Aktiv')}</td><td><button data-edit-item="${x.id}">${UI('item.edit','Bearbeiten')}</button> <button type="button" data-toggle-item="${x.id}">${x.active===false?UI('item.enable','Aktivieren'):UI('item.disable','Deaktivieren')}</button> <button type="button" data-delete-item="${x.id}">${UI('item.delete','Löschen')}</button></td></tr>`).join('');
  document.querySelectorAll('#items-list button').forEach(button=>button.onclick=e=>{e.stopPropagation();console.info('[NARA][ITEM_BUTTON_CLICK]',{id:button.dataset.editItem||button.dataset.toggleItem||button.dataset.deleteItem||null,action:button.dataset.editItem?'edit':button.dataset.toggleItem?'toggle':'delete'});if(typeof document.body.onclick==='function')return document.body.onclick(e)});
  $('#suppliers-list').innerHTML=state.suppliers.map(x=>`<tr><td>${x.name}</td><td>${x.customerNumber||''}</td><td>${x.active===false?'Inaktiv':'Aktiv'}</td><td><button data-edit-supplier="${x.id}">Bearbeiten</button> <button type="button" data-delete-supplier="${x.id}">Löschen</button></td></tr>`).join('');
  $('#articles-list').innerHTML=state.supplierArticles.map(x=>{
    const s=state.suppliers.find(y=>y.id===x.supplierId),i=state.inventoryItems.find(y=>y.id===x.inventoryItemId);
    return `<tr><td>${s?.name||''}</td><td>${i?.name||''}</td><td>${x.packageQuantity} ${x.normalizedUnit} je ${x.packageUnit}</td><td>${x.name}</td></tr>`
  }).join('');
  const invoiceMode=window.__invoiceArchiveMode||'active',invoiceQuery=(document.querySelector('#invoice-archive-search')?.value||'').trim().toLowerCase(),today=new Date().toISOString().slice(0,10),visibleInvoices=state.invoices.filter(x=>{const archived=String(x.status||'').toUpperCase()==='ARCHIVED',day=String(x.invoiceDate||x.createdAt||'').slice(0,10),match=!invoiceQuery||[x.invoiceNumber,x.supplierName,x.supplierId,x.id].some(v=>String(v||'').toLowerCase().includes(invoiceQuery));return match&&(invoiceMode==='archive'?archived:!archived&&day===today)});
  const archiveToggle=document.querySelector('#invoice-archive-toggle');if(archiveToggle)archiveToggle.textContent=invoiceMode==='archive'?'عرض فواتير اليوم':'عرض الأرشيف';
  $('#invoices-list').innerHTML=visibleInvoices.map(x=>{
    const s=state.suppliers.find(y=>y.id===x.supplierId);
    const total=Number(x.totalAmount??(Number(x.totalCents||0)/100));
    return `<tr><td>${x.invoiceNumber}</td><td>${s?.name|| (x.source==='MANAGER_DEMO'?'NARA Manager · تجريبية':'')}</td><td>${x.invoiceDate||x.createdAt?.slice(0,10)||''}</td><td>${x.deliveryDate||''}</td><td>${total.toFixed(2)} €</td><td>${x.status==='POSTED'?'Gebucht':'Entwurf'}</td><td>${x.source==='MANAGER_DEMO'?'فاتورة مدير':(x.status==='POSTED'?'—':`<button data-post="${x.id}">Wareneingang buchen</button>`)}</td></tr>`
  }).join('')||'<tr><td colspan="7">لا توجد فواتير في العرض الحالي.</td></tr>';
  $('#movements-list').innerHTML=state.stockMovements.map(x=>`<tr><td>${x.createdAt||''}</td><td>${state.inventoryItems.find(y=>y.id===x.inventoryItemId)?.name||''}</td><td>${x.type}</td><td>${x.quantity||0} ${x.unit||''}</td><td>${x.referenceId||''}</td><td>${x.notes||''}</td></tr>`).join('');
  $('#summary').textContent=`${state.inventoryItems.length} Zutaten · ${state.suppliers.length} Lieferanten · ${state.invoices.length} Rechnungen · ${state.stockMovements.length} Bewegungen`
}
function addLine(){
  const d=document.createElement('div');
  d.className='line';
  const choices=state.supplierArticles.map(a=>{
    const i=state.inventoryItems.find(x=>x.id===a.inventoryItemId);
    return `<option value="${a.id}">${i?.name||a.name} · ${a.packageQuantity} ${a.normalizedUnit}/${a.packageUnit}</option>`
  }).join('');
  d.innerHTML='<select class="article-choice"><option value="">Zutat wählen</option>'+choices+'</select><input class="line-qty" type="number" min=".001" step=".001" placeholder="Menge"><input class="line-price" type="number" step=".01" placeholder="Einzelpreis"><input class="line-total" type="number" step=".01" placeholder="Gesamt"><button type="button" class="remove-line">Entfernen</button>';
  d.querySelectorAll('input,select').forEach(x=>x.oninput=preview);
  $('#invoice-lines').append(d)
}
function preview(){
  const out=[];
  document.querySelectorAll('#invoice-lines .line').forEach(d=>{
    const a=state.supplierArticles.find(x=>x.id===d.querySelector('.article-choice').value),i=state.inventoryItems.find(x=>x.id===a?.inventoryItemId),q=Number(d.querySelector('.line-qty').value)||0;
    if(a&&i&&q)out.push(`${i.name} · Aktuell: ${i.currentStock||0} ${i.baseUnit||i.unit} · Zugang: +${q*(Number(a.packageQuantity)||0)} ${a.normalizedUnit} · Danach: ${(Number(i.currentStock)||0)+q*(Number(a.packageQuantity)||0)} ${i.baseUnit||i.unit}`)
  });
  $('#preview').innerHTML=out.join('<br>')||'Vorschau: Positionen hinzufügen.'
}
function tabForHash(){
  const h=location.hash.replace('#','');
  return ['items','suppliers','invoices','documents','movements','overview'].includes(h)?(h==='documents'?'invoices':h):'overview'
}
function showTab(id,updateHash){
  const target=id||'overview';
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===target));
  document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===target));
  if(updateHash&&target!=='overview')history.pushState(null,'','#'+target);
  else if(updateHash&&target==='overview')history.pushState(null,'',location.pathname)
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab,true));
window.addEventListener('hashchange',()=>showTab(tabForHash(),false));
window.addEventListener('popstate',()=>showTab(tabForHash(),false));
$('#add-line').onclick=addLine;
$('#item-form').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target,x=state.inventoryItems.find(y=>y.id===f.id.value)||{
    id:uid('inv'),createdAt:now()
  };
  Object.assign(x,{
    name:f.name.value.trim(),unit:f.baseUnit.value,baseUnit:f.baseUnit.value,currentStock:Number(f.currentStock.value)||0,minimumStock:Number(f.minimumStock.value)||0,notes:f.notes.value,active:f.active.checked,updatedAt:now()
  });
  if(!state.inventoryItems.includes(x))state.inventoryItems.push(x);
  await save('inventoryItems',state.inventoryItems);
  f.reset()
};
$('#supplier-form').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target,x=state.suppliers.find(y=>y.id===f.id.value)||{
    id:uid('sup'),createdAt:now()
  };
  Object.assign(x,{
    name:f.name.value.trim(),customerNumber:f.customerNumber.value,contact:f.contact.value,notes:f.notes.value,active:f.active.checked,updatedAt:now()
  });
  if(!state.suppliers.includes(x))state.suppliers.push(x);
  await save('suppliers',state.suppliers);
  f.reset()
};
$('#article-form').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target,q=Number(f.packageQuantity.value)||0,i=state.inventoryItems.find(x=>x.id===f.inventoryItemId.value);
  if(!i||!q)return;
  state.supplierArticles.push({
    id:uid('art'),supplierId:f.supplierId.value,inventoryItemId:i.id,name:f.name.value.trim(),articleNumber:f.articleNumber.value,packageUnit:f.packageUnit.value,packageQuantity:q,normalizedUnit:f.normalizedUnit.value,normalizedQuantityPerPackage:q,lastPurchasePrice:Number(f.lastPurchasePrice.value)||0,active:true,createdAt:now()
  });
  await save('supplierArticles',state.supplierArticles);
  f.reset()
};
$('#invoice-form').onsubmit=async e=>{
  e.preventDefault();
  const f=e.target,items=[];
  document.querySelectorAll('#invoice-lines .line').forEach(d=>{
    const a=state.supplierArticles.find(x=>x.id===d.querySelector('.article-choice').value),q=Number(d.querySelector('.line-qty').value)||0;
    if(a&&q)items.push({
      inventoryItemId:a.inventoryItemId,supplierArticleId:a.id,quantity:q,packageQuantity:a.packageQuantity,normalizedQuantityPerPackage:a.packageQuantity,unitPrice:Number(d.querySelector('.line-price').value)||0,originalText:a.name
    })
  });
  if(!items.length)return;
  const x={
    id:uid('invoice'),supplierId:f.supplierId.value,invoiceNumber:f.invoiceNumber.value.trim(),invoiceDate:f.invoiceDate.value,deliveryDate:f.deliveryDate.value||null,documentReference:null,status:'DRAFT',totalAmount:Number(f.totalAmount.value)||0,notes:f.notes.value,lineItems:items,createdAt:now(),updatedAt:now()
  };
  if(state.invoices.some(y=>y.supplierId===x.supplierId&&y.invoiceNumber===x.invoiceNumber))return $('#status').textContent='Diese Rechnung existiert bereits.';
  state.invoices.push(x);
  await save('invoices',state.invoices);
  f.reset();
  $('#invoice-lines').innerHTML=''
};
document.body.onclick=async e=>{
  const p=e.target.closest('[data-post]');
  if(p&&confirm('Wareneingang wirklich buchen?')){
    const r=await fetch('/api/goods-receipt',{
      method:'POST',headers:{
        'Content-Type':'application/json'
      },body:JSON.stringify({
        invoiceId:p.dataset.post
      })
    });
    $('#status').textContent=r.ok?'Wareneingang gebucht ✓':(await r.json()).error;
    load()
  }
  const rm=e.target.closest('.remove-line');
  if(rm){
    rm.parentElement.remove();
    preview()
  }
  const it=e.target.closest('[data-edit-item]');
  if(it){
    const x=state.inventoryItems.find(y=>y.id===it.dataset.editItem),f=$('#item-form');
    f.id.value=x.id;
    f.name.value=x.name;
    f.baseUnit.value=x.baseUnit||x.unit;
    f.currentStock.value=x.currentStock||0;
    f.minimumStock.value=x.minimumStock||0;
    f.notes.value=x.notes||'';
    f.active.checked=x.active!==false
  }
  const toggleItem=e.target.closest('[data-toggle-item]');
  if(toggleItem){
    const item=state.inventoryItems.find(x=>x.id===toggleItem.dataset.toggleItem);
    if(!item)return;
    item.active=item.active===false;
    item.updatedAt=now();
    try{await save('inventoryItems',state.inventoryItems);$('#status').textContent=item.active?UI('message.itemEnabled','Zutat aktiviert ✓'):UI('message.itemDisabled','Zutat deaktiviert ✓');render()}catch(error){$('#status').textContent=error.message||UI('message.itemSaveFailed','Zutat konnte nicht gespeichert werden')}
  }
  const deleteItem=e.target.closest('[data-delete-item]');
  if(deleteItem){
    const item=state.inventoryItems.find(x=>x.id===deleteItem.dataset.deleteItem);
    if(!item)return;
    const used=state.supplierArticles.some(x=>x.inventoryItemId===item.id)||state.invoices.some(x=>(x.lineItems||[]).some(line=>line.inventoryItemId===item.id))||state.stockMovements.some(x=>x.inventoryItemId===item.id);
    if(used){item.active=false;item.updatedAt=now();await save('inventoryItems',state.inventoryItems);$('#status').textContent=UI('message.itemUsedDisabled','هذا الصنف مستخدم سابقاً، لذلك تم تعطيله بدلاً من حذفه.');render();return}
    if(!window.confirm(`${item.name} ${UI('message.itemDeleteConfirm','wirklich löschen?')}`))return;
    try{await save('inventoryItems',state.inventoryItems.filter(x=>x.id!==item.id));state.inventoryItems=state.inventoryItems.filter(x=>x.id!==item.id);$('#status').textContent=UI('message.itemDeleted','Zutat gelöscht ✓');render()}catch(error){$('#status').textContent=error.message||UI('message.itemDeleteFailed','Zutat konnte nicht gelöscht werden')}
  }
  const sp=e.target.closest('[data-edit-supplier]');
  if(sp){
    const x=state.suppliers.find(y=>y.id===sp.dataset.editSupplier),f=$('#supplier-form');
    f.id.value=x.id;
    f.name.value=x.name;
    f.customerNumber.value=x.customerNumber||'';
    f.contact.value=x.contact||'';
    f.notes.value=x.notes||'';
    f.active.checked=x.active!==false
  }
  const ds=e.target.closest('[data-delete-supplier]');
  if(ds){
    const supplier=state.suppliers.find(x=>x.id===ds.dataset.deleteSupplier);
    if(!supplier)return;
    const usedByArticles=state.supplierArticles.some(x=>x.supplierId===supplier.id),usedByInvoices=state.invoices.some(x=>x.supplierId===supplier.id);
    if(usedByArticles||usedByInvoices){$('#status').textContent='Lieferant kann nicht gelöscht werden, weil er bereits verwendet wird. Bitte deaktivieren.';return}
    if(!window.confirm(`Lieferant ${supplier.name} wirklich löschen?`))return;
    try{await save('suppliers',state.suppliers.filter(x=>x.id!==supplier.id));$('#status').textContent='Lieferant gelöscht ✓'}catch(error){$('#status').textContent=error.message||'Lieferant konnte nicht gelöscht werden'}
  }
};
const initAIControlCenter=()=>{if(document.querySelector('#ai-control'))return;const tabs=document.querySelector('.tabs'),main=document.querySelector('main');if(!tabs||!main)return;const tab=document.createElement('button');tab.type='button';tab.dataset.tab='ai-control';tab.textContent='AI Control Center';tabs.insertBefore(tab,tabs.firstElementChild);const panel=document.createElement('section');panel.id='ai-control';panel.className='panel';panel.innerHTML='<div class="card"><h2>AI Control Center</h2><p class="muted">إدارة وكلاء NARA ومراجعة اقتراحاتهم قبل تغيير البيانات.</p><div class="grid"><div class="card"><h3>📄 وكيل قراءة الفواتير</h3><p>Gemini · استخراج بيانات الفاتورة</p><strong>جاهز</strong></div><div class="card"><h3>🔗 وكيل ربط الأصناف</h3><p>مطابقة أرقام وأسماء الموردين</p><strong>جاهز</strong></div><div class="card"><h3>✨ وكيل اقتراح الأسماء</h3><p>اقتراح أسماء قصيرة ودالّة</p><strong>جاهز</strong></div></div><label class="wide">مهمة إلى NARA<input id="ai-command" placeholder="مثال: راجع آخر فاتورة واقترح الربط"></label><button type="button" id="ai-run-command">تنفيذ المهمة</button><div id="ai-agent-output" class="card muted">لم تُنفذ أي مهمة بعد.</div></div>';main.prepend(panel);tab.onclick=()=>showTab('ai-control',true);panel.querySelector('#ai-run-command').onclick=()=>{const command=panel.querySelector('#ai-command').value.trim();panel.querySelector('#ai-agent-output').textContent=command?'تم استلام المهمة: '+command+' — سيتم تحليلها وعرض الاقتراحات قبل الحفظ.':'اكتب مهمة أولاً.'};};
initAIControlCenter();
(()=>{const panel=document.querySelector('#ai-control'),card=panel?.querySelector('.card');if(!panel||!card||document.querySelector('#project-chat'))return;const chat=document.createElement('div');chat.id='project-chat';chat.className='card';chat.innerHTML='<h3>محادثة مساعد المشروع</h3><div id="project-chat-messages" style="min-height:140px;max-height:420px;overflow:auto;background:#f7f8fa;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:12px;direction:rtl"></div><div style="display:flex;gap:8px;align-items:flex-end;direction:rtl"><textarea id="project-chat-input" rows="2" placeholder="اكتب رسالتك هنا… (Enter للإرسال، Shift+Enter لسطر جديد)" style="flex:1;resize:none;border:1px solid #cfd5dd;border-radius:12px;padding:12px;font:inherit"></textarea><button type="button" id="project-chat-send" style="min-width:82px;border:0;border-radius:12px;padding:12px 16px;background:#2563eb;color:#fff;font:inherit;cursor:pointer">إرسال</button></div>';card.append(chat);const messages=[{role:'assistant',content:'أهلًا! أنا مساعد مشروع NARA. احكِ لي ما تريد، وسأراجع السياق وأدير الوكلاء معك.'}],box=chat.querySelector('#project-chat-messages'),input=chat.querySelector('#project-chat-input'),send=chat.querySelector('#project-chat-send');const voice=document.createElement('button');voice.type='button';voice.textContent='🎙️';voice.title='تحدث صوتيًا';voice.style.cssText='min-width:52px;border:0;border-radius:12px;padding:12px;background:#16a34a;color:#fff;font-size:20px;cursor:pointer';send.parentElement.insertBefore(voice,send);const call=document.createElement('button');call.type='button';call.textContent='📞 بدء اتصال';call.title='محادثة صوتية مستمرة';call.style.cssText='border:0;border-radius:12px;padding:12px 14px;background:#7c3aed;color:#fff;font:inherit;cursor:pointer';send.parentElement.insertBefore(call,voice);let callRec=null,callActive=false;call.onclick=()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){alert('المتصفح لا يدعم المحادثة الصوتية المستمرة. جرّب Chrome.');return}if(callActive){callActive=false;callRec?.stop();call.textContent='📞 بدء اتصال';return}callActive=true;call.textContent='⏹️ إنهاء الاتصال';callRec=new Recognition();callRec.lang='ar-SA';callRec.continuous=true;callRec.interimResults=false;callRec.onresult=e=>{const result=e.results[e.results.length-1];if(result.isFinal){input.value=result[0].transcript;send.click()}};callRec.onend=()=>{if(callActive)try{callRec.start()}catch{}};callRec.onerror=()=>{};callRec.start()};const speak=text=>{if('speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text).replace(/[*#]/g,''));u.lang=document.documentElement.lang||'ar-SA';speechSynthesis.speak(u)}};voice.onclick=()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){alert('المتصفح لا يدعم الإدخال الصوتي. جرّب Chrome.');return}const rec=new Recognition();rec.lang='ar-SA';rec.interimResults=false;rec.maxAlternatives=1;voice.textContent='🔴';rec.onresult=e=>{input.value=e.results[0][0].transcript;input.focus();send.click()};rec.onend=()=>{voice.textContent='🎙️'};rec.onerror=()=>{voice.textContent='🎙️'};rec.start()};const esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');const format=value=>esc(value).replace(/^### (.*)$/gm,'<h4 style="margin:12px 0 6px">$1</h4>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/^---$/gm,'<hr>').replace(/^- (.*)$/gm,'<div style="margin:3px 0">• $1</div>').replace(/\n/g,'<br>');const draw=()=>{box.innerHTML=messages.map(m=>`<div style="display:flex;justify-content:${m.role==='assistant'?'flex-start':'flex-end'};margin:8px 0"><div style="max-width:82%;padding:10px 14px;border-radius:16px;background:${m.role==='assistant'?'#fff':'#2563eb'};color:${m.role==='assistant'?'#17202a':'#fff'};box-shadow:0 1px 3px #00000012;line-height:1.65;white-space:normal"><div style="font-size:12px;opacity:.7;margin-bottom:3px">${m.role==='assistant'?'NARA':'أنت'}</div>${format(m.content)}</div></div>`).join('');box.scrollTop=box.scrollHeight};draw();send.onclick=async()=>{const content=input.value.trim();if(!content)return;messages.push({role:'user',content});input.value='';draw();send.disabled=true;send.style.opacity='.65';send.textContent='يفكر…';try{const r=await fetch('/api/project-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,voiceMode:callActive})}),j=await r.json();const answer=r.ok?j.reply:j.error||'تعذر الحصول على رد';messages.push({role:'assistant',content:''});draw();speak(answer);for(const ch of Array.from(answer)){messages[messages.length-1].content+=ch;draw();await new Promise(resolve=>setTimeout(resolve,Math.abs(ch==='\\n'?35:10)))}}catch(error){messages.push({role:'assistant',content:error.message||'تعذر الاتصال بالمساعد'});draw()}finally{send.disabled=false;send.style.opacity='1';send.textContent='إرسال'}};input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send.click()}})})();
document.querySelector('#ai-run-command')?.addEventListener('click',async()=>{const command=document.querySelector('#ai-command')?.value.trim(),button=document.querySelector('#ai-run-command'),output=document.querySelector('#ai-agent-output');if(!command)return;button.disabled=true;output.textContent='الوكلاء يحللون المهمة…';try{const r=await fetch('/api/ai-orchestrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})}),result=await r.json();if(!r.ok)throw Error(result.error||'تعذر تنفيذ المهمة');output.innerHTML='<strong>'+result.message+'</strong><br>'+result.agents.map(agent=>`<div><b>${agent.name}</b> — ${agent.status}<br><span>${agent.result}</span></div>`).join('')}catch(error){output.textContent=error.message||'تعذر تنفيذ المهمة.'}finally{button.disabled=false}});
showTab(tabForHash(),false);
load().catch(e=>{
  console.error('[NARA][PAGE_LOAD_ERROR]',{name:e?.name||'Error',message:e?.message||String(e)});
  $('#status').textContent=UI('message.serverUnavailable','NARA ist momentan nicht erreichbar. Bitte den NARA-Launcher neu starten.');
});
const invoiceCard=document.querySelector('#invoice-form')?.closest('.card');
if(invoiceCard){
  const box=document.createElement('div');
  box.className='card';
  box.innerHTML='<h3>Rechnung importieren</h3><p class="muted">Originaldokument zentral archivieren. Lokale OCR ist noch nicht aktiviert; nichts wird automatisch gebucht.</p><label>Kamera öffnen / Rechnung fotografieren<input id="invoice-camera" type="file" accept="image/*" capture="environment" multiple></label><label>Datei / PDF auswählen<input id="invoice-files" type="file" accept="image/jpeg,image/png,application/pdf" multiple></label><div id="document-preview">Keine Seiten ausgewählt.</div><button type="button" id="save-documents">Dokument speichern und Rechnung prüfen</button>';
  invoiceCard.prepend(box);
  let files=[];
  const addFiles=e=>{
    $('#status').textContent='';
    files=[...files,...e.target.files];
    document.querySelector('#document-preview').innerHTML=files.map((f,i)=>`<div>Seite ${i+1}: ${f.name} <button type="button" data-remove-page="${i}">${UI('line.delete','Löschen')}</button></div>`).join('')
  };
  document.querySelector('#invoice-camera').onchange=addFiles;
  document.querySelector('#invoice-files').onchange=addFiles;
  box.onclick=e=>{
    const b=e.target.closest('[data-remove-page]');
    if(b){
      files.splice(Number(b.dataset.removePage),1);
      document.querySelector('#document-preview').innerHTML=files.map((f,i)=>`<div>Seite ${i+1}: ${f.name} <button type="button" data-remove-page="${i}">${UI('line.delete','Löschen')}</button></div>`).join('')
    }
  };
  document.querySelector('#save-documents').onclick=async()=>{
    if(!files.length)return $('#status').textContent='Bitte ein Dokument auswählen.';
    const button=document.querySelector('#save-documents');
    const oldText=button.textContent;
    button.disabled=true;
    button.textContent='Speichere …';
    try{
      const pages=[];
      for(const f of files){
        const data=await new Promise((ok,no)=>{
          const r=new FileReader();
          r.onload=()=>ok(r.result);
          r.onerror=()=>no(Error('Datei konnte nicht gelesen werden.'));
          r.readAsDataURL(f)
        });
        pages.push({filename:f.name,mime:f.type,data})
      }
      const r=await fetch('/api/documents',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-nara-multipage':'1'},
        body:JSON.stringify({
          pages,
          source:document.querySelector('#invoice-camera').files.length?'CAMERA':'UPLOAD',
          capturedAt:new Date().toISOString()
        })
      });
      let result={};
      try{result=await r.json()}catch{}
      if(!r.ok)throw Error(result.error||`Upload fehlgeschlagen (${r.status})`);
      if(!result.document?.id||!Array.isArray(result.document.pageFiles)||result.document.pageFiles.length!==pages.length){
        throw Error('Server hat keine vollständige Dokumentseite zurückgegeben.')
      }
      window.__naraLastSavedDocument=result.document;
      $('#status').textContent=`${pages.length} Seite(n) archiviert. Bitte Rechnung prüfen.`;
      console.info('[NARA][DOCUMENT_SAVE_SUCCESS]',{id:result.document.id,pageFiles:result.document.pageFiles.length,showReviewType:typeof window.__naraShowInvoiceReview});
      if(typeof window.__naraShowInvoiceReview!=='function')console.error('[NARA][REVIEW_CALLBACK_MISSING]',new Error('window.__naraShowInvoiceReview is not a function').stack);
      else window.__naraShowInvoiceReview(result.document);
      files=[];
      document.querySelector('#document-preview').textContent='Gespeichert; noch nicht gebucht.'
    }catch(error){
      $('#status').textContent=`Fehler: ${error.message||'Dokument konnte nicht gespeichert werden.'}`
    }finally{
      button.disabled=false;
      button.textContent=oldText
    }
  }
};
// Draft review UI is initialized by the existing invoice/document page.
const initializeInvoiceReview=()=>{
  console.info('[NARA][REVIEW_INIT]',{readyState:document.readyState,existing:!!document.querySelector('#invoice-review'),script:document.currentScript?.src||'inventory-foundation.js'});
  const inv=document.querySelector('#invoices .card');
  if(!inv||document.querySelector('#invoice-review'))return;
  const review=document.createElement('section');
  review.id='invoice-review';
  review.className='card';
  review.hidden=true;
  review.innerHTML='<h2>'+UI('invoice.review.title','Rechnung prüfen')+'</h2><p class="muted">'+UI('invoice.review.help','Automatisch erkannte Werte bitte prüfen und ergänzen.')+'</p><div id="review-pages"></div><div id="review-validation-summary" class="validation-summary"><h3>'+UI('review.validationTitle','Rechnungsprüfung')+'</h3><div class="validation-counts"></div><div class="validation-totals"></div></div><form id="review-form" class="grid review-form"><label>Lieferant<input name="supplierName"></label><label data-i18n-label="review.customerNumber">Kundennummer<input name="customerNumber"></label><label>Rechnungsnummer<input name="invoiceNumber" required></label><label>Rechnungsdatum<input name="invoiceDate" type="date"></label><label>Lieferdatum<input name="deliveryDate" type="date"></label><label>Netto<input name="netAmount" type="number" step=".01"></label><label data-i18n-label="review.vat">MwSt<input name="vatAmount" type="number" step=".01"></label><label>Gesamtbetrag<input name="grossAmount" type="number" step=".01"></label><label data-i18n-label="review.currency">Währung<input name="currency" value="EUR"></label><div class="wide review-lines-wrap"><div class="review-lines-heading"><h3>Positionen</h3><strong id="review-summary">0 Positionen · 0 zugeordnet · 0 offen</strong></div><datalist id="ingredient-options"></datalist><div class="review-table-scroll"><table class="table"><tbody id="review-lines"></tbody></table></div><button type="button" id="review-add-line">+ Position</button></div><button type="button" id="review-save-draft" class="wide">'+UI('invoice.saveDraft','Als Entwurf speichern')+'</button></form>';
  inv.prepend(review);
  const supplierField=review.querySelector('[name="supplierName"]'),supplierLabel=supplierField?.closest('label');
  const normalizeSupplierName=value=>String(value||'').toLowerCase().replace(/[.,]/g,' ').replace(/\b(gmbh|ug|ag|kg|ltd|inc)\b/g,' ').replace(/\s+/g,' ').trim();
  const supplierOptions=()=>'<option value="">Lieferant zuordnen</option>'+(Array.isArray(state.suppliers)?state.suppliers:[]).filter(x=>x&&x.active!==false).map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  if(supplierField&&supplierLabel){supplierLabel.innerHTML='Lieferant<select id="review-supplier-select" name="supplierId">'+supplierOptions()+'</select><button type="button" id="create-review-supplier">+ Neuen Lieferanten anlegen</button><small id="supplier-resolution" class="muted"></small>'}
  const supplierSelect=()=>review.querySelector('#review-supplier-select');
  const logSupplierSelection=label=>{const select=supplierSelect(),supplier=state.suppliers.find(x=>x.id===select?.value);console.info(label,{value:select?.value||'',selectedText:select?.selectedOptions?.[0]?.textContent||'',supplierExists:!!supplier,supplierId:supplier?.id||null});};
  supplierSelect()?.addEventListener('change',()=>logSupplierSelection('[NARA][SUPPLIER_SELECT_CHANGE]'));
  window.__naraRefreshReviewSuppliers=()=>{const select=supplierSelect();if(!select)return;const current=select.value;select.innerHTML=supplierOptions();if([...select.options].some(option=>option.value===current))select.value=current;logSupplierSelection('[NARA][SUPPLIER_OPTIONS_REFRESH]')};
  const resolveSupplierName=name=>{const normalized=normalizeSupplierName(name),select=supplierSelect(),currentId=select?.value||'',currentIsValid=!!currentId&&state.suppliers.some(x=>x.id===currentId&&x.active!==false),aliases={melkaa:'meledi',melka:'meledi',melidia:'meledi'},base=normalized.split(' ')[0],canonical=aliases[normalized]||aliases[base]||normalized,matches=state.suppliers.filter(x=>{const supplierName=normalizeSupplierName(x.name),supplierBase=supplierName.split(' ')[0];return supplierName===canonical||supplierName===normalized||supplierBase===canonical||supplierBase===base});if(currentIsValid){review.querySelector('#supplier-resolution').textContent='Der manuell ausgewählte Lieferant bleibt erhalten.';return}if(matches.length===1){select.value=matches[0].id;review.querySelector('#supplier-resolution').textContent='Automatisch MELEDI zugeordnet';select.dispatchEvent(new Event('change',{bubbles:true}));}else{select.value='';review.querySelector('#supplier-resolution').textContent=normalized?'Bitte Lieferant zuordnen. Vorschlag: '+name:'';}};
  window.__naraResolveSupplierName=resolveSupplierName;
  review.querySelector('#create-review-supplier')?.addEventListener('click',async()=>{const name=window.prompt('Name des neuen Lieferanten');if(!name?.trim())return;const data=await fetch('/api/admin-data',{cache:'no-store'}).then(r=>r.json()),created={id:'supplier_'+Date.now().toString(36),name:name.trim(),customerNumber:'',contact:'',notes:'Manuell in der Rechnungsprüfung angelegt',active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};data.suppliers=[...(data.suppliers||[]),created];const r=await fetch('/api/admin-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'suppliers',items:data.suppliers})});if(!r.ok){$('#status').textContent='Lieferant konnte nicht angelegt werden';return}state.suppliers=data.suppliers;supplierSelect().innerHTML=supplierOptions();supplierSelect().value=created.id;review.querySelector('#supplier-resolution').textContent='Lieferant manuell angelegt und ausgewählt.'});
  const initialBook=document.createElement('button');
  initialBook.id='review-book';initialBook.type='button';initialBook.textContent='Wareneingang buchen';initialBook.disabled=true;review.append(initialBook);
  let currentDoc=null;
  let activeDraft=null;
  const reviewSnapshotKey=id=>`nara.invoiceReview.${id}`;
  const saveReviewSnapshot=review=>{if(!currentDoc?.id)return;try{localStorage.setItem(reviewSnapshotKey(currentDoc.id),JSON.stringify({version:1,status:'UNFINISHED',documentId:currentDoc.id,review,savedAt:new Date().toISOString()}))}catch(e){console.warn('[NARA][REVIEW_SNAPSHOT_WRITE_FAILED]',e.message)}};
  const readReviewSnapshot=id=>{try{const s=JSON.parse(localStorage.getItem(reviewSnapshotKey(id))||'null');return s?.status==='UNFINISHED'&&s.documentId===id?s:null}catch(e){return null}};
  review.querySelector('#review-form').noValidate=true;
  const ingredientOptions=()=>state.inventoryItems.filter(x=>x.active!==false).map(x=>`<option value="${x.name.replace(/"/g,'&quot;')} (${x.baseUnit||x.unit||'piece'})" data-id="${x.id}"></option>`).join('');
  const refreshIngredientOptions=()=>{const list=review.querySelector('#ingredient-options');if(list)list.innerHTML=ingredientOptions()};
  const lineReady=tr=>{const status=tr.querySelector('.match-status')?.textContent.replace(/^✓\s*/,'').trim(),item=state.inventoryItems.find(x=>x.id===tr.querySelector('[name="inventoryItemId"]')?.value),configuredUnit=tr.querySelector('[name="inventoryBaseUnit"]')?.value.trim().toLowerCase(),printedUnit=tr.querySelector('[name="packageContentUnit"]')?.value.trim().toLowerCase(),unit=configuredUnit||printedUnit,configuredQuantity=Number(tr.querySelector('[name="inventoryQuantityPerPackage"]')?.value),printedQuantity=Number(tr.querySelector('[name="packageContent"]')?.value),quantityPerPackage=configuredQuantity>0?configuredQuantity:printedQuantity;const itemUnit=String(item?.baseUnit||item?.unit||'').toLowerCase(),compatible=unit&&item&&(unit===itemUnit||(unit==='st'&&itemUnit==='piece')||(unit==='stück'&&itemUnit==='piece'));return ['Bestätigt','Gespeichert'].includes(status)&&!!item&&Number(tr.querySelector('[name="quantity"]')?.value)>0&&quantityPerPackage>0&&!!tr.querySelector('[name="packageUnit"]')?.value.trim()&&!!compatible};
  const roundCents=value=>Math.round(Number(value)*100)/100;
  const validateReview=()=>{const rows=[...review.querySelectorAll('#review-lines tr')],lineResults=rows.map(tr=>{const qty=Number(tr.querySelector('[name="quantity"]')?.value),price=Number(tr.querySelector('[name="unitPrice"]')?.value),total=Number(tr.querySelector('[name="lineTotal"]')?.value);if(![qty,price,total].every(Number.isFinite))return {status:'UNKNOWN'};const expected=roundCents(qty*price),actual=roundCents(total);return {status:Math.abs(expected-actual)<=.02?'VALID':'DISCREPANCY',expected,actual}});rows.forEach((tr,index)=>{const holder=tr.querySelector('.line-validation');if(!holder)return;const result=lineResults[index];holder.dataset.state=result.status.toLowerCase();holder.textContent=result.status==='VALID'?UI('review.checkedStatus','✓ Geprüft'):result.status==='DISCREPANCY'?UI('review.discrepancyStatus','⚠ Abweichung'):UI('review.unknownStatus','? Nicht prüfbar')});const h=review.querySelector('#review-form'),sum=roundCents(rows.reduce((total,tr)=>total+(Number(tr.querySelector('[name="lineTotal"]')?.value)||0),0)),net=Number(h.elements.netAmount?.value),vat=Number(h.elements.vatAmount?.value),gross=Number(h.elements.grossAmount?.value),checks=[];if(Number.isFinite(net))checks.push({label:'Netto',expected:sum,actual:roundCents(net)});if(Number.isFinite(net)&&Number.isFinite(vat)&&Number.isFinite(gross))checks.push({label:'Gesamt',expected:roundCents(net+vat),actual:roundCents(gross)});const byRate={};rows.forEach(tr=>{const total=Number(tr.querySelector('[name="lineTotal"]')?.value),rate=Number(tr.querySelector('[name="vatRate"]')?.value);if(Number.isFinite(total)&&Number.isFinite(rate))byRate[rate]=(byRate[rate]||0)+total*rate/100});const calculatedVat=roundCents(Object.values(byRate).reduce((a,b)=>a+b,0));if(Number.isFinite(vat)&&Object.keys(byRate).length)checks.push({label:'MwSt',expected:calculatedVat,actual:roundCents(vat)});const discrepancies=[...lineResults.filter(x=>x.status==='DISCREPANCY'),...checks.filter(x=>Math.abs(x.expected-x.actual)>.02)],correct=lineResults.filter(x=>x.status==='VALID').length+checks.filter(x=>Math.abs(x.expected-x.actual)<=.02).length,checked=lineResults.filter(x=>x.status!=='UNKNOWN').length+checks.length,summary=review.querySelector('#review-validation-summary');summary.querySelector('.validation-counts').textContent=`${rows.length} ${UI('review.checked','Positionen geprüft')} · ${correct} ${UI('review.correct','korrekt')} · ${discrepancies.length} ${UI('review.discrepancy','Abweichung')}`;summary.querySelector('.validation-totals').textContent=`${UI('review.expected','Expected:')} Netto ${Number.isFinite(net)?roundCents(sum).toFixed(2):UI('review.notVerifiable','Nicht prüfbar')} · MwSt ${Number.isFinite(vat)?roundCents(calculatedVat).toFixed(2):UI('review.notVerifiable','Nicht prüfbar')} · Gesamt ${Number.isFinite(gross)?roundCents(net+vat).toFixed(2):UI('review.notVerifiable','Nicht prüfbar')} | ${UI('review.extracted','Extracted:')} Netto ${Number.isFinite(net)?roundCents(net).toFixed(2):'—'} · MwSt ${Number.isFinite(vat)?roundCents(vat).toFixed(2):'—'} · Gesamt ${Number.isFinite(gross)?roundCents(gross).toFixed(2):'—'}`;review.dataset.validationBlocked=discrepancies.length?'true':'false';return {discrepancies,checked};};
  const updateReviewSummary=()=>{const rows=[...review.querySelectorAll('#review-lines tr')],assigned=rows.filter(tr=>['Bestätigt','Gespeichert'].includes(tr.querySelector('.match-status')?.textContent.replace(/^✓\s*/,'').trim())).length,ready=rows.length>0&&rows.every(lineReady);validateReview();review.querySelector('#review-summary').textContent=`${rows.length} ${UI('review.positions','Positionen')} · ${assigned} ${UI('review.assigned','zugeordnet')} · ${rows.length-assigned} ${UI('review.open','offen')}`;const book=review.querySelector('#review-book');if(book)book.disabled=!review.dataset.invoiceId||!ready||review.dataset.validationBlocked==='true';};
  window.__naraRefreshReviewLanguage=()=>{updateReviewSummary();relabelReviewHeader();relabelReviewLines()};
  const formatTotal=(qty,content,unit)=>{const total=Number(qty)*Number(content);if(!Number.isFinite(total)||total<=0)return '—';const clean=n=>Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');if(unit==='g'&&total>=1000)return `${clean(qty)} × ${clean(content)} g = ${clean(total/1000)} kg`;if(unit==='ml'&&total>=1000)return `${clean(qty)} × ${clean(content)} ml = ${clean(total/1000)} l`;return `${clean(qty)} × ${clean(content)} ${unit||''} = ${clean(total)} ${unit||''}`};
  const normalizeIngredientName=name=>String(name||'').toLocaleLowerCase('de').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const suggestIngredientName=description=>{const original=String(description||'').trim(),brandPrefixes=/^(ioniki|salomon|altan|lydia|elite|roots|p\s*&\s*w|real\s+american)\s+/i,stopwords=new Set(['tiefgefroren','tiefgekühlt','gegart','halal','nativ','extra','klasse','premium','original','mit','und','sowie','the','best','kg','g','ml','l','st','stück','stk']),cleaned=original.replace(/\b\d+(?:[,.]\d+)?\s*(?:kg|g|ml|l|st(?:ück)?|stück)\b/gi,' ').replace(/\bfeta[-\s]?käse\b/gi,'Feta').replace(brandPrefixes,'').replace(/[(),;:/]+/g,' ').replace(/\s+/g,' ').trim(),tokens=cleaned.split(' ').filter(Boolean).filter(token=>!stopwords.has(token.toLocaleLowerCase('de'))&&!/^\d+[a-z]*$/i.test(token)),name=tokens.slice(0,4).join(' ').trim();return name||original.split(/\s+/).slice(0,4).join(' ')};
  const lineMatch=(v={})=>{
    const savedLine=activeDraft?.lineItems?.find(line=>String(line.code||'').trim()===String(v.code||'').trim());
    if(savedLine?.inventoryItemId&&state.inventoryItems.some(item=>item.id===savedLine.inventoryItemId))return {id:savedLine.inventoryItemId,status:'Gespeichert',purchasePackageUnit:savedLine.purchasePackageUnit||savedLine.packageUnit,inventoryBaseUnit:savedLine.inventoryBaseUnit,inventoryQuantityPerPackage:savedLine.inventoryQuantityPerPackage};
    const supplierId=review.querySelector('[name="supplierId"]')?.value,supplier=state.suppliers.find(x=>x.id===supplierId);
    const article=state.supplierArticles.find(x=>supplier&&x.supplierId===supplier.id&&String(x.articleNumber||'').trim()===String(v.code||'').trim());
    if(article&&state.inventoryItems.some(x=>x.id===article.inventoryItemId))return {id:article.inventoryItemId,status:'Gespeichert',purchasePackageUnit:article.purchasePackageUnit||article.packageUnit,inventoryBaseUnit:article.inventoryBaseUnit,inventoryQuantityPerPackage:article.inventoryQuantityPerPackage};
    const words=String(v.description||'').toLowerCase().split(/[^a-z0-9äöüß]+/).filter(x=>x.length>2);
    const candidate=state.inventoryItems.map(x=>({x,score:words.filter(w=>x.name.toLowerCase().includes(w)).length})).sort((a,b)=>b.score-a.score)[0];
    return candidate?.score?{id:candidate.x.id,status:'Vorschlag'}:{id:'',status:'Nicht zugeordnet'};
  };
  const addLine=(v={
  })=>{
    const tr=document.createElement('tr');
    const match=lineMatch(v);v={...v,purchasePackageUnit:match.purchasePackageUnit||v.purchasePackageUnit,inventoryBaseUnit:match.inventoryBaseUnit||v.inventoryBaseUnit,inventoryQuantityPerPackage:match.inventoryQuantityPerPackage||v.inventoryQuantityPerPackage};const total=formatTotal(v.quantity,v.packageContent,v.packageContentUnit),matchedItem=state.inventoryItems.find(x=>x.id===match.id),searchValue=matchedItem?`${matchedItem.name} (${matchedItem.baseUnit||matchedItem.unit||'piece'})`:'';
    tr.innerHTML='<td data-label="Artikelcode"><div class="line-code">'+(v.code||'—')+'</div><input name="code" value="'+(v.code||'')+'" hidden></td><td data-label="Originalbezeichnung"><div class="line-product">'+(v.description||'—')+'</div><input name="description" value="'+(v.description||'')+'" hidden></td><td data-label="Menge"><input name="quantity" type="number" step=".001" value="'+(v.quantity||'')+'"></td><td data-label="ME/Gebinde"><input name="packageUnit" value="'+(v.packageUnit||'')+'"><input name="purchasePackageUnit" value="'+(v.purchasePackageUnit||'')+'" hidden></td><td data-label="Inhalt"><input name="packageContent" value="'+(v.packageContent||'')+'"><input name="inventoryQuantityPerPackage" value="'+(v.inventoryQuantityPerPackage||'')+'" hidden></td><td data-label="Einheit"><input name="packageContentUnit" value="'+(v.packageContentUnit||'')+'"><input name="inventoryBaseUnit" value="'+(v.inventoryBaseUnit||'')+'" hidden></td><td data-label="Gesamtmenge" class="total-quantity line-total">'+total+'</td><td data-label="Zutat zuordnen"><input class="ingredient-search" value="'+searchValue.replace(/"/g,'&quot;')+'" placeholder="Zutat suchen…"><select name="inventoryItemId" hidden><option value="'+(match.id||'')+'"></option></select><small class="match-status" data-state="'+(match.status==='Gespeichert'?'saved':match.status==='Vorschlag'?'suggested':match.status==='Bestätigt'?'confirmed':'open')+'">'+(match.status==='Gespeichert'?'✓ Gespeichert':match.status)+'</small><button type="button" class="match-confirm" '+(match.status==='Vorschlag'?'':'hidden')+'>Vorschlag bestätigen</button><button type="button" class="new-ingredient">+ Neue Zutat</button><div class="new-ingredient-editor" hidden><input class="new-ingredient-name"><div class="duplicate-warning" hidden></div><label>Gebinde<select class="new-ingredient-package"><option>Karton</option><option>Packung</option><option>Beutel</option><option>Dose</option><option>Kiste</option><option>Stück</option><option>Flasche</option><option>Tray</option><option>Eimer</option><option>Kanister</option><option>KG</option></select></label><label>Menge je Gebinde<input class="new-ingredient-quantity" type="number" min=".001" step=".001"></label><label>Inventareinheit<select class="new-ingredient-unit"><option value="piece">Stück</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option></select></label><small class="new-ingredient-example"></small><button type="button" class="new-ingredient-create">Zutat erstellen</button></div></td><td data-label="Einzelpreis"><input name="unitPrice" type="number" step=".01" value="'+(v.unitPrice||'')+'"></td><td data-label="Gesamtpreis"><input name="lineTotal" type="number" step=".01" value="'+(v.lineTotal||'')+'"></td><td data-label="MwSt"><input name="vatRate" type="number" step=".01" value="'+(v.vatRate||'')+'"></td><td data-label="Aktion"><button type="button" data-delete-review>Position löschen</button></td>';
    const labelKeys=['line.packageUnit','line.packageQuantity','line.inventoryUnit','line.totalQuantity','line.ingredient','line.unitPrice','line.lineTotal','line.vat','line.action'];[...tr.children].forEach((cell,index)=>{const key=labelKeys[index];if(key){cell.dataset.labelI18n=key;cell.dataset.label=UI(key,cell.dataset.label||'')}});const ingredientCell=tr.children[7];const conversion=document.createElement('div');conversion.className='conversion-summary';conversion.innerHTML='<small class="conversion-invoice"></small><small class="conversion-config"></small><small class="conversion-result"></small>';ingredientCell.prepend(conversion);const renderConversion=()=>{const qty=Number(tr.querySelector('[name="quantity"]')?.value),printed=Number(tr.querySelector('[name="packageContent"]')?.value),printedUnit=tr.querySelector('[name="packageContentUnit"]')?.value||'',packageUnit=tr.querySelector('[name="packageUnit"]')?.value||'—',configuredQty=Number(tr.querySelector('[name="inventoryQuantityPerPackage"]')?.value),configuredUnit=tr.querySelector('[name="inventoryBaseUnit"]')?.value||'';conversion.querySelector('.conversion-invoice').textContent=`${UI('line.invoiceData','INVOICE DATA')}: ${qty||'—'} ${packageUnit} × ${printed||'—'} ${printedUnit} = ${formatTotal(qty,printed,printedUnit)}`;conversion.querySelector('.conversion-config').textContent=configuredQty>0&&configuredUnit?`${UI('line.inventoryConversion','INVENTORY CONVERSION')}: 1 ${packageUnit} = ${configuredQty} ${configuredUnit}`:`${UI('line.inventoryConversion','INVENTORY CONVERSION')}: —`;conversion.querySelector('.conversion-result').textContent=configuredQty>0&&configuredUnit&&qty>0?`${UI('line.receiptResult','RESULTING STOCK RECEIPT')}: ${qty} × ${configuredQty} ${configuredUnit} = ${qty*configuredQty} ${configuredUnit}`:`${UI('line.receiptResult','RESULTING STOCK RECEIPT')}: —`};renderConversion();tr.querySelector('.new-ingredient').textContent=UI('ingredient.create','+ Neue Zutat');tr.querySelector('.new-ingredient-create').textContent=UI('ingredient.createConfirm','Zutat erstellen');tr.querySelector('.new-ingredient-name').placeholder=UI('ingredient.name','Name der Zutat');
    const validationBadge=document.createElement('small');validationBadge.className='line-validation';tr.children[6].append(validationBadge);tr.querySelector('[data-delete-review]').onclick=()=>{tr.remove();updateReviewSummary()};
    const hidden=tr.querySelector('[name="inventoryItemId"]'),search=tr.querySelector('.ingredient-search'),status=tr.querySelector('.match-status'),confirm=tr.querySelector('.match-confirm'),newIngredient=tr.querySelector('.new-ingredient'),editor=tr.querySelector('.new-ingredient-editor'),newName=tr.querySelector('.new-ingredient-name'),duplicateWarning=tr.querySelector('.duplicate-warning'),newPackage=tr.querySelector('.new-ingredient-package'),newQuantity=tr.querySelector('.new-ingredient-quantity'),newUnit=tr.querySelector('.new-ingredient-unit'),example=tr.querySelector('.new-ingredient-example'),createIngredient=tr.querySelector('.new-ingredient-create');editor.querySelectorAll('label')[0].childNodes[0].textContent=UI('line.packageUnit','Gebinde')+' ';editor.querySelectorAll('label')[1].childNodes[0].textContent=UI('line.packageQuantity','Menge je Gebinde')+' ';editor.querySelectorAll('label')[2].childNodes[0].textContent=UI('line.inventoryUnit','Inventareinheit')+' ';
    const setConfirmed=item=>{hidden.value=item.id;search.value=`${item.name} (${item.baseUnit||item.unit||'piece'})`;status.textContent=UI('status.confirmed','Bestätigt');status.dataset.state='confirmed';confirm.hidden=true;updateReviewSummary()};
    search.oninput=()=>{const item=state.inventoryItems.find(x=>`${x.name} (${x.baseUnit||x.unit||'piece'})`.toLowerCase()===search.value.trim().toLowerCase());if(item)setConfirmed(item);else{hidden.value='';status.textContent=UI('line.notAssigned','Nicht zugeordnet');status.dataset.state='open';confirm.hidden=true;updateReviewSummary()}};
    confirm.onclick=()=>{const item=state.inventoryItems.find(x=>x.id===match.id);if(item)setConfirmed(item)};
    const updateExample=()=>{example.textContent=newPackage.value&&newQuantity.value&&newUnit.value?`1 ${newPackage.value} = ${newQuantity.value} ${newUnit.value}`:''};
    newPackage.oninput=updateExample;newQuantity.oninput=updateExample;newUnit.oninput=updateExample;
    newIngredient.onclick=()=>{editor.hidden=false;editor.dataset.allowDuplicate='';duplicateWarning.hidden=true;duplicateWarning.textContent='';newName.value=v.suggestedInventoryName||suggestIngredientName(v.description);newPackage.value=v.packageUnit||'Karton';newQuantity.value=v.packageContent||'';newUnit.value=['g','ml'].includes(String(v.packageContentUnit||'').toLowerCase())?String(v.packageContentUnit).toLowerCase():'piece';updateExample();newName.focus()};
    const showDuplicateWarning=matches=>{duplicateWarning.hidden=false;duplicateWarning.innerHTML='';const prefix=document.createElement('strong');prefix.textContent=UI('line.duplicateWarning','Mögliche vorhandene Zutat:');duplicateWarning.append(prefix);matches.forEach(item=>{const button=document.createElement('button');button.type='button';button.textContent=UI('line.useExisting','Vorhandene Zutat verwenden')+': '+item.name+' ('+(item.baseUnit||item.unit||'piece')+')';button.onclick=()=>{setConfirmed(item);editor.hidden=true;newIngredient.hidden=true};duplicateWarning.append(button)});const separate=document.createElement('button');separate.type='button';separate.textContent=UI('line.createSeparate','Trotzdem separat erstellen');separate.onclick=()=>{editor.dataset.allowDuplicate='true';duplicateWarning.hidden=true;createIngredient.focus()};duplicateWarning.append(separate)};
    createIngredient.onclick=async()=>{const name=newName.value.trim(),quantity=Number(newQuantity.value);if(!name||!Number.isFinite(quantity)||quantity<=0){$('#status').textContent=UI('message.nameQuantityRequired','Bitte Name und Menge je Gebinde eingeben.');return}const normalized=normalizeIngredientName(name),matches=state.inventoryItems.filter(item=>normalizeIngredientName(item.name)===normalized||normalizeIngredientName(item.name).includes(normalized)||normalized.includes(normalizeIngredientName(item.name)));if(matches.length&&!editor.dataset.allowDuplicate){showDuplicateWarning(matches);return}createIngredient.disabled=true;const unit=newUnit.value,item={id:uid('inv'),name,unit,baseUnit:unit,currentStock:0,minimumStock:0,active:true,notes:'Aus Rechnung erstellt; Bestand erst bei Wareneingang buchen.',createdAt:now(),updatedAt:now()};try{tr.querySelector('[name="purchasePackageUnit"]').value=newPackage.value;tr.querySelector('[name="inventoryQuantityPerPackage"]').value=quantity;tr.querySelector('[name="inventoryBaseUnit"]').value=unit;state.inventoryItems.push(item);await save('inventoryItems',state.inventoryItems);setConfirmed(item);editor.hidden=true;newIngredient.hidden=true;$('#status').textContent='Neue Zutat erstellt und Position zugeordnet ✓'}catch(error){state.inventoryItems=state.inventoryItems.filter(x=>x.id!==item.id);$('#status').textContent=error.message||'Zutat konnte nicht erstellt werden'}finally{createIngredient.disabled=false}};
    tr.querySelectorAll('[name="quantity"],[name="packageContent"],[name="packageContentUnit"],[name="packageUnit"],[name="inventoryQuantityPerPackage"],[name="inventoryBaseUnit"]').forEach(input=>input.oninput=()=>{tr.querySelector('.total-quantity').textContent=formatTotal(tr.querySelector('[name="quantity"]').value,tr.querySelector('[name="packageContent"]').value,tr.querySelector('[name="packageContentUnit"]').value);renderConversion();updateReviewSummary()});
    $('#review-lines').append(tr)
    relabelReviewLines();refreshIngredientOptions();updateReviewSummary()
  };
  window.__naraAddReviewLine=addLine;
  $('#review-add-line').onclick=()=>addLine();
  const show=doc=>{
    console.info('[NARA][SHOW_REVIEW_CALLED]',{id:doc?.id,pageFiles:doc?.pageFiles?.length,reviewExists:!!document.querySelector('#invoice-review')});
    try{
    currentDoc=doc;
    review.dataset.documentId=doc.id;
    review.hidden=false;
    const pages=doc.pageFiles.map((f,i)=>`<div class="review-page-card"><b>${UI('invoice.page','Seite')} ${i+1}</b> ${f.endsWith('.pdf')?`<a target="_blank" href="/data/documents/${f}">PDF öffnen</a>`:`<a target="_blank" href="/data/documents/${f}"><img src="/data/documents/${f}" alt="${UI('invoice.page','Seite')} ${i+1}"></a>`}</div>`).join('');
    $('#review-pages').innerHTML=pages;
    $('#review-form').reset();
    const savedDraft=state.invoices.find(invoice=>invoice.id===doc.invoiceId)||state.invoices.find(invoice=>invoice.documentId===doc.id&&invoice.status==='DRAFT');
    activeDraft=savedDraft||null;
    console.info('[NARA][REVIEW_LINKED_DRAFT_FOUND]',{documentId:doc.id,invoiceId:savedDraft?.id||null,supplierId:savedDraft?.supplierId||null,lineCount:Array.isArray(savedDraft?.lineItems)?savedDraft.lineItems.length:0});
    console.info('[NARA][REVIEW_SUPPLIER_RESTORE_BEFORE]',{value:supplierSelect()?.value||'',savedSupplierId:savedDraft?.supplierId||null});
    if(savedDraft?.supplierId&&state.suppliers.some(supplier=>supplier.id===savedDraft.supplierId)){supplierSelect().value=savedDraft.supplierId;console.info('[NARA][REVIEW_DRAFT_SUPPLIER_RESTORED]',{invoiceId:savedDraft.id,supplierId:savedDraft.supplierId,supplierName:state.suppliers.find(supplier=>supplier.id===savedDraft.supplierId)?.name||''});}
    console.info('[NARA][REVIEW_SUPPLIER_RESTORE_AFTER]',{value:supplierSelect()?.value||'',selectedText:supplierSelect()?.selectedOptions?.[0]?.textContent||''});
    $('#review-lines').innerHTML='';
    if(Array.isArray(savedDraft?.lineItems)&&savedDraft.lineItems.length){savedDraft.lineItems.forEach(line=>addLine(line));console.info('[NARA][REVIEW_LINES_RESTORED]',{count:savedDraft.lineItems.length,confirmed: savedDraft.lineItems.filter(line=>line.inventoryItemId).length});}else addLine();
    review.scrollIntoView({
      behavior:'smooth'
    })
    console.info('[NARA][SHOW_REVIEW_FINISHED]',{hidden:review.hidden,reviewExists:!!document.querySelector('#invoice-review'),pages:document.querySelectorAll('#review-pages img,#review-pages a').length});
    }catch(error){console.error('[NARA][SHOW_REVIEW_EXCEPTION]',error,error?.stack);throw error}
  };
  window.__naraShowInvoiceReview=show;
  window.__naraRestoreLatestReview=async()=>{
    try{
      const docs=await fetch('/api/admin-data',{cache:'no-store'}).then(r=>r.json());
      const candidate=(docs.documents||[]).slice().reverse().find(doc=>readReviewSnapshot(doc.id)||(doc.extraction?.header?.invoiceNumber==='500282875'&&doc.extraction?.header?.lines?.[0]?.packageContent&&doc.extraction?.header?.lines?.[0]?.originalDescription));
      if(candidate){
        show(candidate);
        const replayDoc=candidate.extraction?.header?.invoiceNumber==='500282875'?{...candidate,extraction:{...candidate.extraction,header:{...candidate.extraction.header,deliveryDate:null}}}:candidate;
        const model=window.NaraInvoiceReview.normalizeInvoiceReview({document:replayDoc}, {route:'DEV_REPLAY',diagnostics:{documentId:candidate.id}}),form=review.querySelector('#review-form');
        const fields={customerNumber:model.customerNumber,invoiceNumber:model.invoiceNumber,invoiceDate:model.invoiceDate,deliveryDate:model.deliveryDate,netAmount:model.net,vatAmount:model.vat,grossAmount:model.gross,currency:model.currency};
        Object.entries(fields).forEach(([name,value])=>{if(form.elements[name]&&value!==null&&value!==undefined)form.elements[name].value=name==='invoiceDate'||name==='deliveryDate'?dateInputValue(value):String(value)});
        if(model.supplierIdentity)resolveSupplierName(model.supplierIdentity);
        review.querySelector('#review-lines').innerHTML='';model.lines.forEach(line=>addLine({code:line.supplierArticleCode,description:line.originalDescription,quantity:line.quantity,packageUnit:line.packageUnit,packageContent:line.packageContent,packageContentUnit:line.packageContentUnit,unitPrice:line.unitPrice,lineTotal:line.lineTotal,vatRate:line.vatRate}));
        $('#status').textContent='Entwurf aus lokaler Entwicklungsevidenz wiederhergestellt.';
        console.info('[NARA][REVIEW_DEV_REPLAY_RESTORED]',{documentId:candidate.id,invoiceNumber:model.invoiceNumber,rows:model.lines.length});return true
      }
    }catch(error){console.warn('[NARA][REVIEW_SNAPSHOT_AUTO_RESTORE_FAILED]',error.message)}
    return false
  };
  const saveBtn=document.querySelector('#save-documents');
  if(saveBtn){
    const old=saveBtn.onclick;
    saveBtn.onclick=async()=>{
      if(old)await old();
      const doc=window.__naraLastSavedDocument;
      if(doc&&!review.hidden)return;
      if(doc){
        let b=document.querySelector('#review-open');
        if(!b){
          b=document.createElement('button');
          b.id='review-open';
          b.type='button';
          b.textContent='Rechnung prüfen';
          saveBtn.after(b)
        }
        b.onclick=()=>show(doc);
        show(doc)
      }
    }
  }
  const saveDraft=async e=>{
    console.info('[NARA][SAVE_DRAFT_ENTER]',{documentId:currentDoc?.id||null});
    e.preventDefault();
    if(!currentDoc)return;
    console.info('[NARA][SAVE_DRAFT_COLLECT_START]');
    const f=e.target,reviewSupplier=supplierSelect(),resolvedSupplier=state.suppliers.find(x=>x.id===reviewSupplier?.value);console.info('[NARA][SUPPLIER_BEFORE_DRAFT]',{selectValue:reviewSupplier?.value||'',selectedText:reviewSupplier?.selectedOptions?.[0]?.textContent||'',stateSupplierId:resolvedSupplier?.id||null,resolvedSupplier:resolvedSupplier?.name||null});
    const lines=[...document.querySelectorAll('#review-lines tr')].map(tr=>{
      const o={
      };
      tr.querySelectorAll('input,select').forEach(x=>o[x.name]=x.value);
      o.normalizedQuantityPerPackage=Number(o.packageContent)||0;
      return o
    });
    console.info('[NARA][SAVE_DRAFT_COLLECT_FINISHED]',{lineCount:lines.length,confirmedCount:lines.filter(line=>line.inventoryItemId).length});
    const requiredFields=[['supplierId',reviewSupplier?.value,'Bitte Lieferant zuordnen.'],['invoiceNumber',f.invoiceNumber?.value?.trim(),'Bitte Rechnungsnummer eingeben.'],['invoiceDate',f.invoiceDate?.value,'Bitte Rechnungsdatum eingeben.']];
    const missing=requiredFields.find(([,value])=>!value);
    console.info('[NARA][SAVE_DRAFT_VALIDATION]',{supplierId:f.supplierId?.value||null,invoiceNumber:f.invoiceNumber?.value?.trim()||null,invoiceDate:f.invoiceDate?.value||null,missing:missing?.[0]||null});
    if(missing){$('#status').textContent=missing[2];document.querySelector('#status')?.scrollIntoView({behavior:'smooth',block:'center'});return}
    const data={...state,suppliers:[...state.suppliers],supplierArticles:[...state.supplierArticles],invoices:[...state.invoices],documents:[...(state.documents||[])]};
    const supplier=data.suppliers.find(s=>s.id===reviewSupplier?.value);
    if(!supplier){$('#status').textContent='Bitte Lieferant zuordnen.';document.querySelector('#status')?.scrollIntoView({behavior:'smooth',block:'center'});return}
    const existingDraft=activeDraft||data.invoices.find(x=>x.documentId===currentDoc.id&&x.status==='DRAFT')||data.invoices.find(x=>x.supplierId===supplier.id&&String(x.invoiceNumber||'').trim()===f.invoiceNumber.value.trim());
    const invoice={
      id:existingDraft?.id||'invoice_'+Date.now().toString(36),supplierId:supplier.id,documentId:currentDoc.id,invoiceNumber:f.invoiceNumber.value.trim(),invoiceDate:f.invoiceDate.value,deliveryDate:f.deliveryDate.value||null,totalAmount:Number(f.grossAmount.value)||0,netAmount:Number(f.netAmount.value)||null,vatAmount:Number(f.vatAmount.value)||null,currency:f.currency.value||'EUR',status:'DRAFT',lineItems:lines,createdAt:existingDraft?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
    };
    console.info('[NARA][SAVE_DRAFT_PAYLOAD]',{invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,supplierId:invoice.supplierId,lineCount:invoice.lineItems.length});
    const rows=[...document.querySelectorAll('#review-lines tr')];
    for(const line of lines){
      const row=rows.find(tr=>tr.querySelector('[name="code"]')?.value===line.code),status=row?.querySelector('.match-status')?.textContent.replace(/^✓\s*/,'').trim(),item=state.inventoryItems.find(x=>x.id&&x.id===line.inventoryItemId);
      if(!item||!['Bestätigt','Gespeichert'].includes(status))continue;
      const existing=data.supplierArticles.find(x=>x.supplierId===supplier?.id&&String(x.articleNumber||'')===String(line.code||''));
      if(existing){line.supplierArticleId=existing.id;existing.inventoryItemId=line.inventoryItemId;existing.purchasePackageUnit=existing.purchasePackageUnit||line.purchasePackageUnit||line.packageUnit;existing.inventoryQuantityPerPackage=existing.inventoryQuantityPerPackage||Number(line.inventoryQuantityPerPackage)||Number(line.packageContent);existing.inventoryBaseUnit=existing.inventoryBaseUnit||line.inventoryBaseUnit||line.packageContentUnit;}
      else if(supplier&&line.code){const created={id:'article_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),supplierId:supplier.id,inventoryItemId:line.inventoryItemId,name:line.description,articleNumber:line.code,packageUnit:line.packageUnit,packageQuantity:Number(line.packageContent),normalizedUnit:line.packageContentUnit,purchasePackageUnit:line.purchasePackageUnit||line.packageUnit,inventoryQuantityPerPackage:Number(line.inventoryQuantityPerPackage)||Number(line.packageContent),inventoryBaseUnit:line.inventoryBaseUnit||line.packageContentUnit,active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};data.supplierArticles.push(created);line.supplierArticleId=created.id;}
    }
    const duplicate=data.invoices.find(x=>x.supplierId===invoice.supplierId&&String(x.invoiceNumber||'').trim()===invoice.invoiceNumber&&x.id!==invoice.id);
    if(duplicate){review.dataset.invoiceId=duplicate.id;$('#status').textContent='هذه الفاتورة محفوظة مسبقاً كمسودة.';document.querySelector('#status')?.scrollIntoView({behavior:'smooth',block:'center'});return}
    const invoiceIndex=data.invoices.findIndex(x=>x.id===invoice.id);if(invoiceIndex>=0)data.invoices[invoiceIndex]=invoice;else data.invoices.push(invoice);
    console.info('[NARA][SAVE_DRAFT_FETCH_START]',{collection:'invoices',method:'POST'});
    const save=await fetch('/api/admin-data',{
      method:'POST',headers:{
        'Content-Type':'application/json'
      },body:JSON.stringify({
        collection:'invoices',items:data.invoices
      })
    });
    console.info('[NARA][SAVE_DRAFT_FETCH_RESPONSE]',{collection:'invoices',ok:save.ok,status:save.status});
    const savedData=await save.json().catch(()=>null);
    if(!save.ok||!savedData?.invoices?.some(x=>x.id===invoice.id)){ $('#status').textContent=savedData?.error||'Entwurf konnte nicht gespeichert werden';return }
    currentDoc.invoiceId=invoice.id;
    currentDoc.extractionStatus='NEEDS_REVIEW';
    data.documents=(data.documents||[]).map(d=>d.id===currentDoc.id?currentDoc:d);
    console.info('[NARA][SAVE_DRAFT_FETCH_START]',{collection:'supplierArticles',method:'POST'});
    const saveArticle=await fetch('/api/admin-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection:'supplierArticles',items:data.supplierArticles})});
    console.info('[NARA][SAVE_DRAFT_FETCH_RESPONSE]',{collection:'supplierArticles',ok:saveArticle.ok,status:saveArticle.status});
    if(!saveArticle.ok){$('#status').textContent='Entwurf gespeichert, aber Zutat-Zuordnung konnte nicht gespeichert werden';return}
    console.info('[NARA][SAVE_DRAFT_FETCH_START]',{collection:'documents',method:'POST'});
    const saveDocument=await fetch('/api/admin-data',{
      method:'POST',headers:{
        'Content-Type':'application/json'
      },body:JSON.stringify({
        collection:'documents',items:data.documents
      })
    });
    console.info('[NARA][SAVE_DRAFT_FETCH_RESPONSE]',{collection:'documents',ok:saveDocument.ok,status:saveDocument.status});
    if(!saveDocument.ok){$('#status').textContent='Entwurf gespeichert, aber Dokumentverknüpfung konnte nicht gespeichert werden';return}
    $('#status').textContent='Rechnung als Entwurf gespeichert. Zuordnungen bestätigt ✓';
    review.dataset.invoiceId=invoice.id;
    updateReviewSummary();
    let book=document.querySelector('#review-book');
    if(!book){book=document.createElement('button');book.id='review-book';book.type='button';book.textContent='Wareneingang buchen';review.append(book);}
    book.onclick=async()=>{book.disabled=true;const r=await fetch('/api/goods-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoiceId:invoice.id})});const result=await r.json();if(!r.ok){book.disabled=false;return $('#status').textContent=result.error||'Wareneingang fehlgeschlagen.'}$('#status').textContent='Wareneingang gebucht ✓';book.textContent='Wareneingang gebucht';};
    Object.assign(state,data);
    render();
    window.__naraRefreshReviewSuppliers?.();
    if(!state.invoices.some(x=>x.id===invoice.id)){
      $('#status').textContent='Entwurf wurde vom Server nicht bestätigt. Die Prüfung bleibt geöffnet.';
      return
    }
    console.info('[NARA][SAVE_DRAFT_SUCCESS]',{invoiceId:invoice.id,lineCount:invoice.lineItems.length});
    window.__naraAddReviewLine=addLine
  };
  const reviewForm=$('#review-form'),reviewSaveButton=reviewForm.querySelector('#review-save-draft');
  const logReviewDraftButtonState=()=>console.info('[NARA][REVIEW_DRAFT_BUTTON_STATE]',{disabled:!!reviewSaveButton?.disabled,id:reviewSaveButton?.id||'',type:reviewSaveButton?.type||'',connected:!!reviewSaveButton?.isConnected,pointerEvents:reviewSaveButton?getComputedStyle(reviewSaveButton).pointerEvents:'missing',formAssociation:reviewSaveButton?.form?.id||null,handlerAttached:!!reviewSaveButton?.onclick,duplicateButtons:document.querySelectorAll('#invoice-review button').length});
  if(!reviewSaveButton)throw new Error('Review draft button was not created');
  reviewSaveButton.disabled=false;
  reviewSaveButton.style.pointerEvents='auto';
  reviewForm.onsubmit=saveDraft;
  reviewSaveButton.type='button';
  reviewSaveButton.onclick=()=>{
    console.info('[NARA][REVIEW_DRAFT_CLICK]');
    logReviewDraftButtonState();
    reviewSaveButton.classList.add('nara-working');
    return saveDraft({preventDefault(){},target:reviewForm}).catch(error=>{
      console.error('[NARA][SAVE_DRAFT_ERROR]',{name:error?.name||'Error',message:error?.message||String(error),stack:error?.stack});
      $('#status').textContent=error?.message||'Entwurf konnte nicht gespeichert werden';
    }).finally(()=>reviewSaveButton.classList.remove('nara-working'));
  };
  logReviewDraftButtonState();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeInvoiceReview);else initializeInvoiceReview();
// Do not restore old development evidence automatically on page load.
// A review appears only after the user uploads and saves a new document.
document.addEventListener('DOMContentLoaded',()=>{
  const review=document.querySelector('#invoice-review');
  if(!review)return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.textContent=UI('invoice.geminiOptional','Mit Gemini lesen');
  btn.id='gemini-extract';
  const learnBtn=null;
  const geminiBtn=null;
  
  let localBadge=review.querySelector('#local-ocr-dev-status');if(!localBadge){localBadge=document.createElement('span');localBadge.id='local-ocr-dev-status';review.insertBefore(localBadge,btn.nextSibling)}localBadge.style.cssText='display:inline-block;margin-inline-start:10px;padding:4px 8px;border-radius:6px;background:#e7f4e8;color:#276b35;font-size:.85rem';localBadge.hidden=true;fetch('/api/local-preparser-status',{cache:'no-store'}).then(r=>r.json()).then(s=>{if(s.developmentOnly&&s.enabled){localBadge.textContent='Lokale OCR: Aktiv';localBadge.hidden=false}}).catch(()=>{});
  review.querySelector('h2').after(btn);
  btn.onclick=async()=>{
    const clientTotal=Date.now(),uploadStarted=Date.now();const forceGemini=true;$('#status').textContent='Gemini wird vorbereitet…';
    const docs=await fetch('/api/admin-data',{
      cache:'no-store'
    }).then(r=>r.json());console.info('[NARA][INVOICE_TIMING] upload='+(Date.now()-uploadStarted)+'ms adminDataRead=done');
    const currentId=review.dataset.documentId;
    const doc=docs.documents?.find(d=>d.id===currentId)||null;
    if(!doc)return $('#status').textContent='Bitte zuerst ein Dokument prüfen.';
    btn.disabled=true;
      btn.textContent=UI('invoice.geminiOptional','Mit Gemini lesen');
    try{
      const geminiStarted=Date.now();console.info('[NARA][INVOICE_TIMING] client_extract_start');
      const r=await fetch('/api/invoice-extract',{
        method:'POST',headers:{
          'Content-Type':'application/json'
        },body:JSON.stringify({
          documentId:doc.id,forceGemini:true
        })
      });
      console.info('[NARA][INVOICE_TIMING] client_gemini_response='+(Date.now()-geminiStarted)+'ms status='+r.status);const j=await r.json();if((j.reviewRequired||j.code==='INVOICE_REVIEW_REQUIRED')&&!j.extraction){btn.textContent='Rechnung auslesen';$('#status').textContent=UI('message.invoiceReviewRequired','Extraktion konnte nicht sicher geprüft werden. Bitte manuell prüfen.');return}if(!r.ok&&!j.extraction)throw Error(j.error||'Gemini-Extraktion fehlgeschlagen.');console.info('[NARA][INVOICE_TIMING] client_total='+(Date.now()-clientTotal)+'ms');const routeLabel={LOCAL_ACCEPTED:'Lokal akzeptiert',LOCAL_REVIEW_REQUIRED:'Lokale Prüfung erforderlich',LOCAL_FALLBACK_GEMINI:'Lokal unsicher → Gemini',LOCAL_FAILED_GEMINI_USED:'Lokale OCR fehlgeschlagen → Gemini'}[j.extractionRoute]||'Gemini';$('#status').textContent=routeLabel+' · Gesamt '+(Date.now()-clientTotal)+' ms';
      const reviewModel=window.NaraInvoiceReview.normalizeInvoiceReview(j,{route:j.extractionRoute,reviewRequired:j.reviewRequired,diagnostics:{documentId:doc.id}});
      const extractedLines=reviewModel.lines;
      console.info('[NARA][CANONICAL_REVIEW_MODEL]',{invoiceNumber:reviewModel.invoiceNumber,customerNumber:reviewModel.customerNumber,lines:reviewModel.lines.length,reviewRequired:reviewModel.reviewRequired});
      console.info('[NARA][RENDER_ITEMS_COUNT]',{count:extractedLines.length,firstArticleCode:extractedLines[0]?.supplierArticleCode||null,addLineType:typeof window.__naraAddReviewLine});
      const form=review.querySelector("#review-form");
      const canonicalFields={customerNumber:reviewModel.customerNumber,invoiceNumber:reviewModel.invoiceNumber,invoiceDate:reviewModel.invoiceDate,deliveryDate:reviewModel.deliveryDate,netAmount:reviewModel.net,vatAmount:reviewModel.vat,grossAmount:reviewModel.gross,currency:reviewModel.currency};
      Object.entries(canonicalFields).forEach(([name,value])=>{if(form.elements[name]&&value!==undefined&&value!==null)form.elements[name].value=(name==='invoiceDate'||name==='deliveryDate')?dateInputValue(value):String(value)});
      if(reviewModel.supplierIdentity)window.__naraResolveSupplierName?.(reviewModel.supplierIdentity);
      document.querySelector("#review-lines").innerHTML="";
      extractedLines.forEach((line,index)=>{
        try{
          window.__naraAddReviewLine({
            code:line.supplierArticleCode,description:line.originalDescription,suggestedInventoryName:line.suggestedInventoryName,quantity:line.quantity,packageUnit:line.packageUnit,packageContent:line.packageContent,packageContentUnit:line.packageContentUnit,unitPrice:line.unitPrice,lineTotal:line.lineTotal,vatRate:line.vatRate
          });
        }catch(error){
          console.error('[NARA][ADD_REVIEW_LINE_ERROR]',{index,supplierArticleCode:line?.supplierArticleCode||null,name:error?.name||'Error',message:error?.message||String(error),stack:error?.stack});
          throw error;
        }
      });
      console.info('[NARA][RENDER_ITEMS_FINISHED]',{domRows:document.querySelectorAll('#review-lines tr').length});
      if(!extractedLines.length)document.querySelector("#status").textContent="Keine Positionen aus Gemini erhalten. Bitte Ergebnis prüfen; es wurde keine leere Position angelegt.";
      saveReviewSnapshot(reviewModel);
      const meaningful=[reviewModel.supplierIdentity,reviewModel.invoiceNumber,reviewModel.invoiceDate,reviewModel.net,reviewModel.vat,reviewModel.gross,reviewModel.currency].some(value=>value!==null&&value!==undefined&&String(value).trim()!=="")||extractedLines.length>0;
      if(!meaningful){
        document.querySelector("#status").textContent="Gemini lieferte keine erkennbaren Rechnungsdaten. Bitte prüfen oder manuell eingeben.";
        return
      }
      $('#status').textContent='Extraktion abgeschlossen. Bitte prüfen.';
      btn.textContent='Rechnung auslesen';learnBtn.disabled=j.extractionRoute==='LOCAL_REVIEW_REQUIRED';
    }
    catch(e){
      const safeKey=e?.code==='GEMINI_UNAVAILABLE'||/Gemini-Anfrage fehlgeschlagen|temporarily unavailable|high demand/i.test(e?.message||'')?'message.extractionUnavailable':'message.extractionFailed';
      $('#status').textContent=UI(safeKey,safeKey==='message.extractionUnavailable'?'AI invoice reading is temporarily unavailable. Your invoice data has not been changed. Please try again shortly.':'Invoice extraction failed. Your existing review data remains unchanged.');
      btn.textContent='Rechnung auslesen'
    }
    finally{
      btn.disabled=false
    }
  }
});
