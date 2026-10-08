'use strict';
(function(){
  let archiveDate='ALL';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  async function refresh(){try{const r=await fetch('/api/kasse-state',{cache:'no-store'});if(!r.ok)return;const d=await r.json(),days=[...new Set((d.orders||[]).filter(o=>o.liveArchivedAt).map(o=>{const s=String(o.liveArchiveDay||o.orderDate||o.createdAt||'');const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:s.slice(0,10)}).filter(Boolean))].sort().reverse(),sel=$('#live-archive-date');if(!sel)return;sel.innerHTML='<option value="ALL">كل تواريخ الأرشيف</option>'+days.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');sel.value=days.includes(archiveDate)?archiveDate:'ALL';archiveDate=sel.value}catch{}}
  function mount(){const bar=document.querySelector('.toolbar');if(!bar||$('#live-archive-date'))return;const sel=document.createElement('select');sel.id='live-archive-date';sel.title='اختر تاريخ الأرشيف';sel.innerHTML='<option value="ALL">كل تواريخ الأرشيف</option>';bar.appendChild(sel);sel.onchange=async()=>{archiveDate=sel.value;const r=await fetch('/api/kasse-state',{cache:'no-store'}),d=await r.json(),ids=new Set((d.orders||[]).filter(o=>{const s=String(o.liveArchiveDay||o.orderDate||o.createdAt||'');const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);const day=m?m[3]+'-'+m[2]+'-'+m[1]:s.slice(0,10);return o.liveArchivedAt&&(archiveDate==='ALL'||day===archiveDate)}).map(o=>String(o.id)));document.querySelectorAll('.order-card').forEach(c=>c.style.display=archiveDate==='ALL'||ids.has(c.dataset.id)?'':'none')};refresh()}
  setInterval(mount,500);setInterval(refresh,5000);mount();
})();
