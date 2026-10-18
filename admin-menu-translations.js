'use strict';
// Übersetzungen der Speisekarte prüfen & freigeben (EN · AR). Entwürfe stammen aus menu-translations.json; nur freigegebene Texte erscheinen an der Kasse und auf der Website.
(function () {
  const TT = {
    trBtn:{de:'🌐 Übersetzungen',ar:'🌐 الترجمات',en:'🌐 Translations'},
    trTitle:{de:'Übersetzungen prüfen',ar:'مراجعة الترجمات',en:'Review translations'},
    trHelp:{de:'Namen bleiben bei Marken/erfundenen Gerichten lateinisch. Ein Text erscheint erst nach „Freigeben“. Wer den Text ändert, muss neu freigeben.',ar:'أسماء الأصناف المخترعة والماركات بتضل لاتينية. النص ما بيظهر للزبون إلا بعد "اعتماد". إذا عدّلت نص لازم تعتمده من جديد.',en:'Names of brands/invented dishes stay Latin. A text only appears after “Approve”. If you edit it, approve it again.'},
    trShow:{de:'Anzeigen',ar:'عرض',en:'Show'},
    fAll:{de:'Alle',ar:'الكل',en:'All'}, fReview:{de:'Zu prüfen (Entwurf)',ar:'بدها مراجعة (مسودة)',en:'Needs review (draft)'}, fApproved:{de:'Freigegeben',ar:'معتمد',en:'Approved'}, fMissing:{de:'Fehlt',ar:'ناقص',en:'Missing'},
    trCat:{de:'Alle Kategorien',ar:'كل الفئات',en:'All categories'},
    trDrafts:{de:'Entwürfe laden',ar:'تحميل المسودات',en:'Load drafts'}, trDraftsDone:{de:'{n} Entwürfe angelegt',ar:'انحمّلت {n} مسودة',en:'{n} drafts created'},
    trApproveAll:{de:'Sichtbare freigeben',ar:'اعتماد المعروض',en:'Approve shown'},
    trSave:{de:'Speichern',ar:'حفظ',en:'Save'}, trClose:{de:'Schließen',ar:'إغلاق',en:'Close'},
    trSaved:{de:'Übersetzungen gespeichert ✓',ar:'انحفظت الترجمات ✓',en:'Translations saved ✓'}, trFail:{de:'Speichern fehlgeschlagen',ar:'فشل الحفظ',en:'Saving failed'},
    trApproved:{de:'Freigegeben',ar:'معتمد',en:'Approved'}, trName:{de:'Name',ar:'الاسم',en:'Name'}, trDesc:{de:'Beschreibung',ar:'الوصف',en:'Description'},
    trStat:{de:'Arabisch {a}/{n} · Englisch {e}/{n} freigegeben',ar:'عربي {a}/{n} · إنجليزي {e}/{n} معتمد',en:'Arabic {a}/{n} · English {e}/{n} approved'},
    trCats:{de:'Kategorien',ar:'الفئات',en:'Categories'}, trProds:{de:'Produkte',ar:'المنتجات',en:'Products'},
    trNone:{de:'Keine Einträge für diesen Filter.',ar:'ما في نتائج لهالفلتر.',en:'No entries for this filter.'}, trDirty:{de:'Ungespeicherte Änderungen verwerfen?',ar:'تتجاهل التعديلات غير المحفوظة؟',en:'Discard unsaved changes?'}
  };
  FT.init(TT, { onChange: () => { if (dlg && dlg.open) draw(); } });
  const t = (k, v) => FT.t(k, v), $$ = (s, r) => (r || document).querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'open-translations'; btn.dataset.t = 'trBtn'; btn.textContent = t('trBtn');
  const dlg = document.createElement('dialog'); dlg.id = 'tr-dialog';
  dlg.innerHTML = '<div class="tr-box"><header class="tr-head"><h2 data-t="trTitle"></h2><button type="button" id="tr-x" aria-label="×">×</button></header><p class="muted" data-t="trHelp"></p>' +
    '<div class="tr-bar"><label><span data-t="trShow"></span> <select id="tr-filter"><option value="all" data-t="fAll"></option><option value="review" data-t="fReview"></option><option value="approved" data-t="fApproved"></option><option value="missing" data-t="fMissing"></option></select></label>' +
    '<select id="tr-cat"></select><input id="tr-q" type="search"><button type="button" id="tr-drafts" data-t="trDrafts"></button><button type="button" id="tr-approve" data-t="trApproveAll"></button><button type="button" id="tr-save" class="primary" data-t="trSave"></button></div>' +
    '<p id="tr-stat" class="muted"></p><p id="tr-msg" role="status"></p><div id="tr-body"></div></div>';
  const css = document.createElement('style');
  css.textContent = '#tr-dialog{border:0;border-radius:16px;width:min(1200px,calc(100% - 20px))!important;max-width:none!important;max-height:92vh;padding:0}#tr-msg:empty{display:none}#tr-dialog::backdrop{background:#10182099}.tr-box{padding:16px 18px;display:grid;gap:10px}.tr-head{display:flex;justify-content:space-between;align-items:center}.tr-head h2{margin:0}#tr-x{width:38px;height:38px;border-radius:50%;font-size:22px}' +
    '.tr-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tr-bar input[type=search]{flex:1;min-width:160px}#tr-body{overflow:auto;max-height:62vh;border:1px solid #dce0d7;border-radius:12px}' +
    '.tr-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(220px,1.3fr) minmax(220px,1.3fr);gap:10px;padding:10px 12px;border-bottom:1px solid #e8ebe3;align-items:start}.tr-row:last-child{border:0}.tr-row h3{margin:0 0 4px;font-size:1rem}.tr-row small{color:#62675f;display:block}' +
    '.tr-cell{display:grid;gap:5px}.tr-cell input[type=text],.tr-cell textarea{width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccd4cb;border-radius:8px;font:inherit}.tr-cell textarea{min-height:58px;resize:vertical}.tr-ok{display:flex;gap:6px;align-items:center;font-size:.85rem}.tr-cell.approved input[type=text],.tr-cell.approved textarea{background:#f0faf3}.tr-cell.draft input[type=text],.tr-cell.draft textarea{background:#fffaf0}' +
    '.tr-sec{position:sticky;top:0;background:#f5f2e8;padding:8px 12px;font-weight:800;z-index:1}@media(max-width:800px){.tr-row{grid-template-columns:1fr}}';
  document.head.appendChild(css); document.body.appendChild(dlg);
  const anchor = $$('#new-product'); if (anchor) anchor.before(btn);
  let dirty = false, edits = {};  // edits: key "p:id:lang" / "c:id:lang" → {name,description,approved}
  const entry = (o, l) => (o.translations && o.translations[l] && typeof o.translations[l] === 'object') ? o.translations[l] : null;
  const cur = (kind, o, l) => { const k = kind + ':' + o.id + ':' + l; if (edits[k]) return edits[k]; const e = entry(o, l); return e ? { name: e.name || '', description: e.description || '', approved: e.status === 'approved', has: true } : { name: '', description: '', approved: false, has: false }; };
  function statusOf(kind, o) { const a = cur(kind, o, 'ar'), e = cur(kind, o, 'en'); return { review: (a.has && !a.approved) || (e.has && !e.approved), approved: a.approved && e.approved, missing: !a.has || !e.has }; }
  function cell(kind, o, l, withDesc) {
    const c = cur(kind, o, l), id = kind + ':' + o.id + ':' + l, cls = c.approved ? 'approved' : c.has ? 'draft' : '';
    return '<div class="tr-cell ' + cls + '" data-k="' + esc(id) + '"><input type="text" data-f="name" dir="' + (l === 'ar' ? 'rtl' : 'ltr') + '" placeholder="' + esc(t('trName')) + '" value="' + esc(c.name) + '">' +
      (withDesc ? '<textarea data-f="description" dir="' + (l === 'ar' ? 'rtl' : 'ltr') + '" placeholder="' + esc(t('trDesc')) + '">' + esc(c.description) + '</textarea>' : '') +
      '<label class="tr-ok"><input type="checkbox" data-f="approved"' + (c.approved ? ' checked' : '') + '> ' + esc(t('trApproved')) + '</label></div>';
  }
  function visible() {
    const f = $$('#tr-filter').value, cat = $$('#tr-cat').value, q = ($$('#tr-q').value || '').trim().toLowerCase();
    const pass = (kind, o, text) => { const s = statusOf(kind, o); return (f === 'all' || (f === 'review' && s.review) || (f === 'approved' && s.approved) || (f === 'missing' && s.missing)) && (!q || text.toLowerCase().includes(q)); };
    return {
      cats: cat ? [] : (state.categories || []).filter(c => pass('c', c, c.name || '')),
      prods: (state.products || []).filter(p => (!cat || p.categoryId === cat) && pass('p', p, (p.name || '') + ' ' + (p.description || '') + ' ' + ((p.translations && p.translations.ar && p.translations.ar.name) || '')))
    };
  }
  function stat() {
    const ps = state.products || [], n = ps.length;
    const cnt = l => ps.filter(p => cur('p', p, l).approved).length;
    $$('#tr-stat').textContent = t('trStat', { a: cnt('ar'), e: cnt('en'), n });
  }
  function draw() {
    const sel = $$('#tr-cat'), v = sel.value;
    sel.innerHTML = '<option value="">' + esc(t('trCat')) + '</option>' + (state.categories || []).map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join(''); sel.value = v;
    $$('#tr-q').placeholder = t('search'); FT.apply(dlg);
    const { cats, prods } = visible(); let h = '';
    if (cats.length) h += '<div class="tr-sec">' + esc(t('trCats')) + '</div>' + cats.map(c => '<div class="tr-row"><div><h3>' + esc(c.name) + '</h3></div>' + cell('c', c, 'ar', false) + cell('c', c, 'en', false) + '</div>').join('');
    if (prods.length) h += '<div class="tr-sec">' + esc(t('trProds')) + ' (' + prods.length + ')</div>' + prods.map(p => '<div class="tr-row"><div><h3>' + esc(p.name) + '</h3><small>' + esc(p.description || '') + '</small></div>' + cell('p', p, 'ar', true) + cell('p', p, 'en', true) + '</div>').join('');
    $$('#tr-body').innerHTML = h || '<p style="padding:14px">' + esc(t('trNone')) + '</p>'; stat();
  }
  function find(k) { const [kind, id, l] = k.split(':'); const list = kind === 'c' ? state.categories : state.products; return { kind, id, l, o: list.find(x => x.id === id) }; }
  $$('#tr-body').addEventListener('input', e => {
    const c = e.target.closest('.tr-cell'); if (!c) return; const k = c.dataset.k, { kind, o, l } = find(k), f = e.target.dataset.f; if (!o) return;
    const base = Object.assign({}, cur(kind, o, l)); if (f === 'approved') base.approved = e.target.checked; else { base[f] = e.target.value; base.approved = false; const cb = c.querySelector('[data-f=approved]'); if (cb) cb.checked = false; }
    base.has = true; edits[k] = base; dirty = true; c.className = 'tr-cell ' + (base.approved ? 'approved' : 'draft'); stat();
  });
  ['tr-filter', 'tr-cat'].forEach(i => $$('#' + i).addEventListener('change', draw)); $$('#tr-q').addEventListener('input', draw);
  $$('#tr-approve').onclick = () => { const { cats, prods } = visible(); const mark = (kind, o) => ['ar', 'en'].forEach(l => { const c = cur(kind, o, l); if (c.has && (c.name || c.description)) { edits[kind + ':' + o.id + ':' + l] = Object.assign({}, c, { approved: true }); dirty = true; } }); cats.forEach(c => mark('c', c)); prods.forEach(p => mark('p', p)); draw(); };
  $$('#tr-drafts').onclick = async () => { try { const r = await fetch('/api/menu/translations/drafts', { method: 'POST' }), j = await r.json(); if (!r.ok) throw Error(j.error); await load(); $$('#tr-msg').textContent = t('trDraftsDone', { n: j.added }); draw(); } catch (e) { $$('#tr-msg').textContent = e.message; } };
  $$('#tr-save').onclick = async () => {
    try {
      for (const k of Object.keys(edits)) { const { kind, o, l } = find(k); if (!o) continue; const c = edits[k]; o.translations = (o.translations && typeof o.translations === 'object') ? o.translations : {}; o.translations[l] = kind === 'c' ? { name: c.name, status: c.approved ? 'approved' : 'draft' } : { name: c.name, description: c.description, status: c.approved ? 'approved' : 'draft' }; }
      const cats = state.categories, prods = state.products; await save('categories', cats); await save('products', prods); edits = {}; dirty = false; $$('#tr-msg').textContent = t('trSaved'); draw();
    } catch (e) { $$('#tr-msg').textContent = t('trFail') + ': ' + (e.message || e); }
  };
  const close = () => { if (dirty && !confirm(t('trDirty'))) return; edits = {}; dirty = false; dlg.close(); };
  $$('#tr-x').onclick = close; dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  btn.onclick = () => { $$('#tr-msg').textContent = ''; draw(); dlg.showModal(); };
})();
