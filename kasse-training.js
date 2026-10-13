'use strict';
/* Übungsmodus: alles was in diesem Modus an der Kasse passiert ist Test (kein TSE, keine Statistik, kein Lager).
   Der Schalter schickt bei jedem Kassen-Event training:true; der Server markiert die Bestellung isTest. */
(function () {
  const KEY = 'nara-kasse-training';
  const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const set = v => { try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  window.NARA_TRAINING = get();

  const of = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (window.NARA_TRAINING && /\/api\/kasse\/events/.test(url) && init && init.body && typeof init.body === 'string') {
        const p = JSON.parse(init.body); p.training = true; if (p.order && typeof p.order === 'object') p.order.training = true;
        init = { ...init, body: JSON.stringify(p) };
      }
    } catch (e) { /* ignore */ }
    return of(input, init);
  };

  // 3 ضغطات سريعة على لوغو Flamo = تدريب (مالك/مدير فقط). حلقة برتقالية وقت التدريب. الكلمة مخفية.
  const css = document.createElement('style');
  css.textContent = 'header>strong[data-i18n="cashier"]{display:none}body.nara-training header .brand img{outline:4px solid #f59e0b;outline-offset:2px;border-radius:10px}#nara-menu-edit{display:none}#nara-menu-edit.can{display:inline}';
  document.head.appendChild(css);
  const canToggle = () => { try { const u = window.NARA_AUTH && NARA_AUTH.user && NARA_AUTH.user(); return !!u && (u.role === 'OWNER' || u.role === 'MANAGER'); } catch (e) { return false; } };
  function paint() { document.body.classList.toggle('nara-training', window.NARA_TRAINING); const c = canToggle(); const m = document.getElementById('nara-menu-edit'); if (m) m.classList.toggle('can', c); }
  function init() {
    // 3 schnelle Klicks auf das Flamo-Logo = Übungsmodus (nur OWNER/MANAGER); 1 Klick = normal zur Website.
    const brand = document.querySelector('header .brand');
    if (brand) { let n = 0, t; brand.addEventListener('click', e => { e.preventDefault(); n++; clearTimeout(t); t = setTimeout(() => { const c = n; n = 0; if (c >= 3 && canToggle()) { window.NARA_TRAINING = !window.NARA_TRAINING; set(window.NARA_TRAINING); paint(); } else location.href = brand.getAttribute('href'); }, 450); }); }
    const acts = document.querySelector('header .header-actions');
    if (acts && !document.getElementById('nara-menu-edit')) { const a = document.createElement('a'); a.id = 'nara-menu-edit'; a.href = 'admin-foundation.html'; a.textContent = 'Menü ✎'; acts.insertBefore(a, acts.firstChild); }
    paint(); setInterval(paint, 2000);
  }
  document.body ? init() : document.addEventListener('DOMContentLoaded', init);
})();
