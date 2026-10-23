// kasse-open-orders.js — الطلبات المفتوحة بالكاشير ككروت بلوحة جانبية بتنسحب من الحافة (ما بتغطي الكاشير).
// - الطلب بيضل ظاهر لحد ما يندفع أو يتلغى (مو لما ينبعت للمطبخ). مصدر البيانات: طلبات الكاشير المحلية + حالة المطبخ/التسليم من السيرفر.
// - ضغطة على كرت = بيفتح الطلب. ضغطة تانية على الكرت المفتوح = بيرجع لمربعه (بينفتح طلب فاضي).
// - توصيل: بدل كاش/كرت زر "للمطبخ · الدفع عند التسليم" لحد ما ينسلّم (البيع بيتسجّل لما تقبض، المحاسبة ما انغيّرت).
(function () {
  'use strict';
  const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'STORNIERT']);
  const TX = {
    de: { title: 'Offene Bestellungen', items: 'Artikel', kitchen: 'In der Küche', table: 'Tisch', pickup: 'Abholung', local: 'Im Restaurant', delivery: 'Lieferung', delivered: 'Geliefert – kassieren', stNew: 'Neu', stPrep: 'Wird zubereitet', stReady: 'Fertig', stDriver: 'Beim Fahrer', cod: '🛵 An Küche · Zahlung bei Lieferung', payNow: 'Jetzt kassieren', hint: 'Offene Bestellung nochmal tippen = zurück ins Kästchen', open: 'Offene Bestellungen', close: 'Schließen' },
    ar: { title: 'الطلبات المفتوحة', items: 'صنف', kitchen: 'بالمطبخ', table: 'طاولة', pickup: 'استلام', local: 'بالمحل', delivery: 'توصيل', delivered: 'انسلّم · اقبض', stNew: 'جديد', stPrep: 'عم يتجهّز', stReady: 'جاهز', stDriver: 'مع السواق', cod: '🛵 للمطبخ · الدفع عند التسليم', payNow: 'دفع الآن', hint: 'اضغط عالطلب المفتوح مرة تانية = بيرجع لمربعه', open: 'الطلبات المفتوحة', close: 'سكّر' },
    en: { title: 'Open orders', items: 'items', kitchen: 'In kitchen', table: 'Table', pickup: 'Pickup', local: 'Dine-in', delivery: 'Delivery', delivered: 'Delivered · collect', stNew: 'New', stPrep: 'Preparing', stReady: 'Ready', stDriver: 'With driver', cod: '🛵 To kitchen · pay on delivery', payNow: 'Pay now', hint: 'Tap the open order again to put it back in its box', open: 'Open orders', close: 'Close' },
  };
  const ICON = { local: '🍽️', pickup: '🛍️', delivery: '🛵' };
  const total = o => (o.cart || []).reduce((s, i) => s + (Number(i.unitCents) || 0) * (Number(i.quantity) || 0), 0);

  // مرحلة الطلب (دالة صافية): delivered > driver (استلمه السواق) > ready > prep > kitchen (انبعت للمطبخ) > new
  function stageOf(s) {
    s = s || {};
    if (s.delivered) return 'delivered';
    const k = String(s.kitchenStatus || '').toUpperCase();
    if (k === 'PICKED_UP') return 'driver';
    if (k === 'READY') return 'ready';
    if (k === 'PREPARING') return 'prep';
    return s.kitchen ? 'kitchen' : 'new';
  }
  const STAGE_ICON = { new: '🆕', kitchen: '🔥', prep: '👨‍🍳', ready: '✅', driver: '🛵', delivered: '📦' };
  // دالة صافية (بتنختبر): من الطلبات المحلية + حالة السيرفر → كروت جاهزة للعرض
  function cards(orders, srv, currentId, T) {
    return (Array.isArray(orders) ? orders : [])
      .filter(o => o && !CLOSED.has(String(o.status || '')) && !CLOSED.has(String((srv[o.id] && srv[o.id].status) || '')) && (o.cart || []).length > 0)
      .map(o => {
        const d = o.delivery || {}, type = o.type || '';
        const title = type === 'local' ? (o.table ? T.table + ' ' + o.table : T.local)
          : (String(d.name || '').trim() || String(d.street || '').trim() || (type === 'delivery' ? T.delivery : T.pickup));
        return { id: String(o.id), icon: ICON[type] || '🧾', title, items: (o.cart || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
          cents: total(o), stage: stageOf(srv[o.id]), kitchen: !!(srv[o.id] && srv[o.id].kitchen), delivered: !!(srv[o.id] && srv[o.id].delivered), active: String(o.id) === String(currentId) };
      });
  }
  // توصيل قبل التسليم: بدل كاش/كرت بيظهر "للمطبخ · الدفع عند التسليم" (السائق بيقبض). بعد التسليم أو "دفع الآن" بترجع الأزرار.
  function deliveryHold(o, s, payNowId) {
    return !!o && o.type === 'delivery' && (o.cart || []).length > 0 && !(s && s.delivered) && String(payNowId || '') !== String(o.id);
  }
  // ضغطة على كرت: غير المفتوح → افتحه. المفتوح → رجّعه لمربعه (افتح طلب فاضي موجود، أو طلب جديد)
  function cardAction(orders, currentId, clickedId) {
    if (String(clickedId) !== String(currentId)) return { type: 'select', id: String(clickedId) };
    const empty = (Array.isArray(orders) ? orders : []).find(o => o && String(o.id) !== String(currentId) && !CLOSED.has(String(o.status || '')) && !(o.cart || []).length);
    return empty ? { type: 'park', id: String(empty.id) } : { type: 'new' };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { cards, deliveryHold, cardAction, stageOf };
  if (typeof document === 'undefined') return;

  const L = (() => { try { const l = (window.NARA_LANG && NARA_LANG.get()) || localStorage.getItem('nara-kasse-language') || 'de'; return TX[l] ? l : 'de'; } catch (e) { return 'de'; } })();
  const T = TX[L];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = c => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((c || 0) / 100);
  let srv = {}, tab = null, drawer = null, last = '', payNowId = '', isOpen = false;

  async function pull() {
    try {
      const r = await fetch('/api/kasse-state?days=1', { cache: 'no-store' }), j = await r.json(), m = {};
      (j.orders || []).forEach(o => { m[String(o.id)] = { status: o.status, kitchen: !!(o.kitchenPrintedAt || o.kitchenSentAt || o.kitchenStatus), kitchenStatus: o.kitchenStatus, delivered: !!o.deliveredAt }; });
      srv = m;
    } catch (e) { /* offline: بنضل على آخر حالة */ }
  }

  function setOpen(v) {
    const was = isOpen; isOpen = !!v;
    if (isOpen && !was) refreshNow();
    if (drawer) drawer.classList.toggle('open', isOpen);
    if (tab) tab.classList.toggle('open', isOpen);
  }

  function deliveryPay(S) {
    const cash = document.querySelector('#cash'), card = document.querySelector('#card'); if (!cash || !card) return;
    const o = S.getCurrent && S.getCurrent(), hold = deliveryHold(o, o && srv[o.id], payNowId);
    let w = document.querySelector('#cod-wrap');
    if (!hold) { if (w) w.remove(); cash.style.display = ''; card.style.display = ''; return; }
    cash.style.display = 'none'; card.style.display = 'none';
    if (w) return;
    w = document.createElement('div'); w.id = 'cod-wrap';
    w.innerHTML = '<button type="button" id="cod-btn">' + esc(T.cod) + '</button><button type="button" id="cod-now">' + esc(T.payNow) + '</button>';
    cash.parentElement.insertBefore(w, cash);
    w.querySelector('#cod-btn').onclick = async () => {
      try { if (window.NARA_PRINT_KITCHEN) await window.NARA_PRINT_KITCHEN(); } catch (e) { /* ignore */ }
      pull().then(draw);
    };
    w.querySelector('#cod-now').onclick = () => { const c = S.getCurrent(); payNowId = c ? String(c.id) : ''; draw(); };
  }

  const stText = (st) => ({ new: T.stNew, kitchen: T.kitchen, prep: T.stPrep, ready: T.stReady, driver: T.stDriver, delivered: T.delivered }[st]);
  const chip = c => '<span class="oo-chip oo-st-' + c.stage + (c.stage === 'ready' || c.stage === 'delivered' ? ' oo-done' : '') + '">' + STAGE_ICON[c.stage] + ' ' + esc(stText(c.stage)) + '</span>';
  let prevStages = null;
  // تجديد فوري + كل 5 ثواني طول ما اللوحة مفتوحة (وكل 15 ثانية لما تنسكر)
  function refreshNow() { return pull().then(draw); }
  function setPoll() { clearInterval(setPoll.h); setPoll.h = setInterval(() => { if (isOpen) refreshNow(); }, 5000); }

  function draw() {
    const S = window.NARA_LEGACY_KASSE_STATE; if (!S || !drawer) return;
    deliveryPay(S);
    const list = cards(S.getOrders(), srv, S.getCurrentId(), T), sig = JSON.stringify(list);
    const cur = {}; list.forEach(c => { cur[c.id] = c.stage; });
    const changed = !!prevStages && list.some(c => prevStages[c.id] !== undefined && prevStages[c.id] !== c.stage);
    prevStages = cur;
    if (changed && tab) { tab.classList.add('pulse'); setTimeout(() => tab && tab.classList.remove('pulse'), 4000); }
    if (sig === last) return; last = sig;
    tab.hidden = !list.length; if (!list.length) setOpen(false);
    tab.classList.toggle('alert', list.some(c => c.delivered));
    tab.innerHTML = '<span class="oo-ico">📋</span><b class="oo-badge">' + list.length + '</b>';
    drawer.innerHTML = '<div class="oo-head"><b>' + esc(T.title) + ' · ' + list.length + '</b><button type="button" class="oo-x" aria-label="' + esc(T.close) + '">✕</button></div><div class="oo-list">' + list.map(c =>
      '<button type="button" class="oo-card' + (c.active ? ' on' : '') + '" data-oid="' + esc(c.id) + '"><span class="oo-top"><span class="oo-ic">' + c.icon + '</span><b>' + esc(c.title) + '</b></span>' +
      '<small>' + c.items + ' ' + esc(T.items) + ' · ' + euro(c.cents) + '</small>' +
      chip(c) + '</button>').join('') +
      '</div><p class="oo-hint">' + esc(T.hint) + '</p>';
  }

  const CSS = '#oo-tab{position:fixed;inset-inline-start:0;top:46%;z-index:900;display:flex;flex-direction:column;align-items:center;gap:6px;width:46px;min-height:92px;padding:12px 0;border:0;border-start-end-radius:16px;border-end-end-radius:16px;background:#16202a;color:#fff;box-shadow:0 6px 20px #0005;cursor:pointer;touch-action:none;font:inherit}' +
    '#oo-tab[hidden]{display:none}#oo-tab .oo-ico{font-size:1.4rem}#oo-tab .oo-badge{min-width:26px;padding:2px 6px;border-radius:999px;background:#ff7a1a;color:#1a0d02;font-size:.95rem;text-align:center}#oo-tab.alert{background:#16a34a}#oo-tab.alert .oo-badge{background:#fff;color:#166534}#oo-tab.pulse{animation:oo-pulse 1s ease-in-out 4}@keyframes oo-pulse{50%{background:#ff7a1a;transform:scale(1.12)}}#oo-tab.open{visibility:hidden}body.dl-open #oo-tab{display:none}' +
    '#oo-drawer{--ood:1;position:fixed;inset-block:0;inset-inline-start:0;z-index:950;width:min(340px,88vw);overflow:auto;padding:14px;background:#f6f7f3;color:#16202a;box-shadow:0 0 40px #0006;transform:translateX(calc(-105% * var(--ood)));visibility:hidden;transition:transform .25s ease,visibility 0s .25s}' +
    'html[dir="rtl"] #oo-drawer{--ood:-1}#oo-drawer.open{transform:none;visibility:visible;transition:transform .25s ease}' +
    '#oo-drawer .oo-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;font-size:1.05rem}#oo-drawer .oo-x{min-width:44px;min-height:44px;border:0;border-radius:12px;background:#e6e8e2;font-size:1.1rem;cursor:pointer}' +
    '#oo-drawer .oo-list{display:grid;gap:10px}.oo-card{display:grid;gap:5px;width:100%;text-align:start;padding:14px;border:2px solid #d8d5ca;border-radius:16px;background:#fff;color:#16202a;font:inherit;cursor:pointer;box-shadow:0 2px 8px #17202a14}' +
    '.oo-card.on{border-color:#ff7a1a;background:#fff4ea}.oo-card .oo-top{display:flex;align-items:center;gap:8px;font-size:1.1rem}.oo-card .oo-ic{font-size:1.35rem}.oo-card small{color:#6b7580;font-weight:700;font-size:.95rem}' +
    '.oo-chip{justify-self:start;background:#fff0d6;color:#b45309;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:800}.oo-done{background:#dcfce7!important;color:#166534!important}.oo-hint{margin:14px 2px 0;color:#6b7580;font-size:.85rem;font-weight:700}' +
    '#cod-wrap{grid-column:1/-1;display:grid;gap:6px;width:100%}#cod-btn{min-height:64px;border:0;border-radius:12px;background:#ff7a1a;color:#1a0d02;font:inherit;font-weight:900;font-size:1.05rem;cursor:pointer}#cod-now{border:0;background:none;color:#9aa4ad;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;min-height:32px}';

  function mount() {
    if (drawer) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    tab = document.createElement('button'); tab.id = 'oo-tab'; tab.type = 'button'; tab.hidden = true; tab.setAttribute('aria-label', T.open);
    drawer = document.createElement('aside'); drawer.id = 'oo-drawer'; drawer.setAttribute('aria-label', T.open);
    document.body.append(tab, drawer);
    // فتح: ضغطة على اللسان أو سحبة لجوّا (بالعربي الاتجاه معكوس)
    let x0 = null, swiped = false; const rtl = () => document.documentElement.dir === 'rtl';
    tab.addEventListener('pointerdown', e => { x0 = e.clientX; swiped = false; });
    tab.addEventListener('pointerup', e => { if (x0 == null) return; const dx = (e.clientX - x0) * (rtl() ? -1 : 1); x0 = null; if (dx > 24) { swiped = true; setOpen(true); } });
    tab.addEventListener('click', () => { if (swiped) { swiped = false; return; } setOpen(true); });
    // إغلاق: ✕، ضغطة برّا اللوحة، Esc، أو سحبة باتجاه الحافة
    let d0 = null;
    drawer.addEventListener('pointerdown', e => { d0 = e.clientX; });
    drawer.addEventListener('pointerup', e => { if (d0 == null) return; const dx = (e.clientX - d0) * (rtl() ? -1 : 1); d0 = null; if (dx < -70) setOpen(false); });
    document.addEventListener('click', e => { if (isOpen && !drawer.contains(e.target) && !tab.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    drawer.addEventListener('click', e => {
      if (e.target.closest('.oo-x')) { setOpen(false); return; }
      const b = e.target.closest('[data-oid]'), S = window.NARA_LEGACY_KASSE_STATE; if (!b || !S) return;
      const a = cardAction(S.getOrders(), S.getCurrentId(), b.dataset.oid);
      if (a.type === 'new') S.newOrder(); else S.setCurrentId(a.id);
      setOpen(false); draw();
    });
    document.addEventListener('click', e => { if (e.target.closest('#kitchen,[data-print-kind="kitchen"]')) setTimeout(() => pull().then(draw), 1500); }, true);
    setPoll(); pull().then(draw); setInterval(draw, 1200); setInterval(() => pull().then(draw), 15000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => { if (window.NARA_LEGACY_KASSE_STATE && document.querySelector('#cash')) { clearInterval(wait); mount(); } }, 100);
    setTimeout(() => clearInterval(wait), 6000);
  });
})();
