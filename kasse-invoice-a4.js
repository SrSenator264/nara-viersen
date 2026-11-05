(function () {
  'use strict';
  /* kasse-invoice-a4.js — Knopf "Rechnung A4" im Kassen-Druckbereich: Firmendaten eingeben → /api/sales-invoices → A4 drucken (Browser-Druckdialog wie die Tagesabrechnung). */
  const L = () => { try { return (window.NARA_LANG && NARA_LANG.get && NARA_LANG.get()) || 'de'; } catch (e) { return 'de'; } };
  const T = {
    de: { btn: '🧾 Rechnung A4', title: 'Rechnung A4 (Firma)', name: 'Firmenname', street: 'Straße + Nr.', zip: 'PLZ', city: 'Ort', vat: 'USt-IdNr (optional)', print: '🖨️ Rechnung drucken', cancel: 'Abbrechen', empty: 'Bitte zuerst Artikel hinzufügen.', busy: 'Wird erstellt …', exists: 'Für diese Bestellung gibt es schon die Rechnung {n}. Noch einmal drucken?', fail: 'Rechnung fehlgeschlagen' },
    ar: { btn: '🧾 فاتورة A4', title: 'فاتورة A4 (شركة)', name: 'اسم الشركة', street: 'الشارع + الرقم', zip: 'الرمز البريدي', city: 'المدينة', vat: 'USt-IdNr (اختياري)', print: '🖨️ اطبع الفاتورة', cancel: 'إلغاء', empty: 'ضيف أصناف أول.', busy: 'عم تنعمل …', exists: 'هالطلب إله فاتورة {n} من قبل. تطبعها مرة تانية؟', fail: 'فشلت الفاتورة' },
    en: { btn: '🧾 Invoice A4', title: 'Invoice A4 (company)', name: 'Company name', street: 'Street + no.', zip: 'ZIP', city: 'City', vat: 'VAT ID (optional)', print: '🖨️ Print invoice', cancel: 'Cancel', empty: 'Add an item first.', busy: 'Creating …', exists: 'This order already has invoice {n}. Print it again?', fail: 'Invoice failed' }
  };
  const t = k => (T[L()] || T.de)[k] || T.de[k];
  const cur = () => { try { return window.NARA_LEGACY_KASSE_STATE && NARA_LEGACY_KASSE_STATE.getCurrent && NARA_LEGACY_KASSE_STATE.getCurrent(); } catch (e) { return null; } };
  const msg = s => { const m = document.getElementById('message'); if (m) m.textContent = s; };
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.error || r.status); return j;
  };
  function printInvoice(id) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.src = '/api/sales-invoices/' + encodeURIComponent(id) + '/html?print=1'; document.body.appendChild(f); setTimeout(() => f.remove(), 120000);
  }
  function ask(o) {
    return new Promise(resolve => {
      const d = document.createElement('dialog'); d.style.cssText = 'border:0;border-radius:16px;padding:18px;max-width:420px;width:92vw;font:16px system-ui,sans-serif;direction:' + (L() === 'ar' ? 'rtl' : 'ltr');
      const fld = (id, k, ph) => '<label style="display:block;margin:8px 0 2px;font-weight:600">' + t(k) + '</label><input id="inv-' + id + '" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid #cbd5e1;border-radius:10px">';
      d.innerHTML = '<h3 style="margin:0 0 6px">' + t('title') + '</h3>' + fld('name', 'name') + fld('street', 'street') + '<div style="display:flex;gap:8px"><div style="flex:1">' + fld('zip', 'zip') + '</div><div style="flex:2">' + fld('city', 'city') + '</div></div>' + fld('vat', 'vat') +
        '<div id="inv-err" style="color:#b91c1c;min-height:20px;margin-top:8px"></div><div style="display:flex;gap:8px;margin-top:6px"><button id="inv-go" type="button" style="flex:2;padding:12px;border:0;border-radius:12px;background:#16a34a;color:#fff;font:inherit;font-weight:700">' + t('print') + '</button><button id="inv-x" type="button" style="flex:1;padding:12px;border:0;border-radius:12px;background:#e2e8f0;font:inherit">' + t('cancel') + '</button></div>';
      document.body.appendChild(d); d.showModal();
      const v = id => d.querySelector('#inv-' + id).value.trim(), done = r => { try { d.close(); } catch (e) {} d.remove(); resolve(r); };
      d.querySelector('#inv-x').onclick = () => done(null); d.addEventListener('cancel', () => done(null));
      d.querySelector('#inv-go').onclick = async () => {
        const b = d.querySelector('#inv-go'); b.disabled = true; b.textContent = t('busy'); d.querySelector('#inv-err').textContent = '';
        try { const j = await api('POST', '/api/sales-invoices', { orderId: o.id, customer: { name: v('name'), street: v('street'), zip: v('zip'), city: v('city'), vatId: v('vat') } }); done(j.invoice); }
        catch (e) { d.querySelector('#inv-err').textContent = e.message; b.disabled = false; b.textContent = t('print'); }
      };
    });
  }
  async function start() {
    const o = cur(); if (!o || !(o.cart || []).length) { msg(t('empty')); return; }
    try {
      try { if (window.NARA_SYNC && NARA_SYNC.pushOrders) await NARA_SYNC.pushOrders(); } catch (e) {}
      const l = await api('GET', '/api/sales-invoices?orderId=' + encodeURIComponent(o.id));
      const ex = (l.invoices || []).find(i => i.status === 'ISSUED');
      if (ex) { if (confirm(t('exists').replace('{n}', ex.number))) printInvoice(ex.id); return; }
      const inv = await ask(o); if (inv) printInvoice(inv.id);
    } catch (e) { msg('⚠ ' + t('fail') + ': ' + e.message); }
  }
  function mount() {
    const box = document.querySelector('#nara-print-tools .nara-print-actions'); if (!box || document.getElementById('nara-invoice-a4')) return !!box;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'nara-invoice-a4'; b.textContent = t('btn'); b.onclick = start; box.appendChild(b); return true;
  }
  const iv = setInterval(() => { if (mount()) clearInterval(iv); }, 400); setTimeout(() => clearInterval(iv), 20000);
  window.addEventListener('nara-lang', () => setTimeout(() => { const b = document.getElementById('nara-invoice-a4'); if (b) b.textContent = t('btn'); }, 0));
})();
