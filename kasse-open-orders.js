// kasse-open-orders.js — بطاقات الطلبات المفتوحة بالكاشير: ترجع لأي طلب بضغطة وحدة (بدل القائمة المنسدلة).
// الطلب بيضل ظاهر لحد ما يندفع أو يتلغى (مو لما ينبعت للمطبخ). مصدر البيانات: نفس طلبات الكاشير المحلية + حالة المطبخ من السيرفر.
(function () {
  'use strict';
  const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT']);
  const TX = {
    de: { title: 'Offene Bestellungen', items: 'Artikel', kitchen: 'In der Küche', table: 'Tisch', pickup: 'Abholung', local: 'Im Restaurant', delivery: 'Lieferung' },
    ar: { title: 'الطلبات المفتوحة', items: 'صنف', kitchen: 'بالمطبخ', table: 'طاولة', pickup: 'استلام', local: 'بالمحل', delivery: 'توصيل' },
    en: { title: 'Open orders', items: 'items', kitchen: 'In kitchen', table: 'Table', pickup: 'Pickup', local: 'Dine-in', delivery: 'Delivery' },
  };
  const ICON = { local: '🍽️', pickup: '🛍️', delivery: '🛵' };
  const total = o => (o.cart || []).reduce((s, i) => s + (Number(i.unitCents) || 0) * (Number(i.quantity) || 0), 0);

  // دالة صافية (بتنختبر): من الطلبات المحلية + حالة السيرفر → بطاقات جاهزة للعرض
  function cards(orders, srv, currentId, T) {
    return (Array.isArray(orders) ? orders : [])
      .filter(o => o && !CLOSED.has(String(o.status || '')) && !CLOSED.has(String((srv[o.id] && srv[o.id].status) || '')) && (o.cart || []).length > 0)
      .map(o => {
        const d = o.delivery || {}, type = o.type || '';
        const title = type === 'local' ? (o.table ? T.table + ' ' + o.table : T.local)
          : (String(d.name || '').trim() || String(d.street || '').trim() || (type === 'delivery' ? T.delivery : T.pickup));
        return { id: String(o.id), icon: ICON[type] || '🧾', title, items: (o.cart || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
          cents: total(o), kitchen: !!(srv[o.id] && srv[o.id].kitchen), active: String(o.id) === String(currentId) };
      });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { cards };
  if (typeof document === 'undefined') return;

  const L = (() => { try { const l = (window.NARA_LANG && NARA_LANG.get()) || localStorage.getItem('nara-kasse-language') || 'de'; return TX[l] ? l : 'de'; } catch (e) { return 'de'; } })();
  const T = TX[L];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = c => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((c || 0) / 100);
  let srv = {}, box = null, last = '';

  async function pull() {
    try {
      const r = await fetch('/api/kasse-state?days=1', { cache: 'no-store' }), j = await r.json(), m = {};
      (j.orders || []).forEach(o => { m[String(o.id)] = { status: o.status, kitchen: !!(o.kitchenPrintedAt || o.kitchenSentAt || o.kitchenStatus) }; });
      srv = m;
    } catch (e) { /* offline: بنضل على آخر حالة */ }
  }

  function draw() {
    const S = window.NARA_LEGACY_KASSE_STATE; if (!S || !box) return;
    const list = cards(S.getOrders(), srv, S.getCurrentId(), T), sig = JSON.stringify(list);
    if (sig === last) return; last = sig;
    box.hidden = !list.length;
    box.innerHTML = '<div class="oo-title">' + esc(T.title) + ' · ' + list.length + '</div><div class="oo-row">' + list.map(c =>
      '<button type="button" class="oo-card' + (c.active ? ' on' : '') + '" data-oid="' + esc(c.id) + '"><span class="oo-top"><span>' + c.icon + '</span><b>' + esc(c.title) + '</b></span>' +
      '<small>' + c.items + ' ' + esc(T.items) + ' · ' + euro(c.cents) + '</small>' + (c.kitchen ? '<span class="oo-chip">🔥 ' + esc(T.kitchen) + '</span>' : '') + '</button>').join('') + '</div>';
  }

  function mount() {
    if (box) return;
    const strip = document.querySelector('.order-strip'); if (!strip) return;
    const st = document.createElement('style');
    st.textContent = '#open-orders-cards{margin:0 0 16px}#open-orders-cards[hidden]{display:none}#open-orders-cards .oo-title{font-weight:800;color:#6b7580;font-size:.9rem;margin:0 2px 6px}' +
      '#open-orders-cards .oo-row{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 8px}' +
      '.oo-card{flex:0 0 auto;min-width:150px;max-width:230px;text-align:start;display:grid;gap:4px;padding:10px 12px;border:2px solid #d8d5ca;border-radius:14px;background:#fff;color:#16202a;font:inherit;cursor:pointer}' +
      '.oo-card.on{border-color:#ff7a1a;background:#fff4ea}.oo-card .oo-top{display:flex;align-items:center;gap:6px;font-size:1.02rem}.oo-card small{color:#6b7580;font-weight:700}' +
      '.oo-chip{justify-self:start;background:#fff0d6;color:#b45309;border-radius:999px;padding:1px 9px;font-size:.8rem;font-weight:800}';
    document.head.appendChild(st);
    box = document.createElement('section'); box.id = 'open-orders-cards'; box.hidden = true;
    strip.insertAdjacentElement('afterend', box);
    box.addEventListener('click', e => { const b = e.target.closest('[data-oid]'); const S = window.NARA_LEGACY_KASSE_STATE; if (b && S) { S.setCurrentId(b.dataset.oid); draw(); } });
    document.addEventListener('click', e => { if (e.target.closest('#kitchen')) setTimeout(() => pull().then(draw), 1500); }, true);
    pull().then(draw); setInterval(draw, 1200); setInterval(() => pull().then(draw), 15000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => { if (window.NARA_LEGACY_KASSE_STATE && document.querySelector('.order-strip')) { clearInterval(wait); mount(); } }, 100);
    setTimeout(() => clearInterval(wait), 6000);
  });
})();
