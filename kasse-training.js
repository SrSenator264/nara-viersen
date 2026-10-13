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

  // كلمة "Kasse/الكاشير" نفسها هي زر التدريب (بدون أيقونة). بس المالك/المدير بيقدر يبدّل. الموظف: كلمة عادية.
  const css = document.createElement('style');
  css.textContent = 'header strong[data-i18n="cashier"].can{cursor:pointer}body.nara-training header strong[data-i18n="cashier"]{background:#f59e0b;color:#111;border-radius:999px;padding:2px 10px}#nara-menu-edit{display:none}#nara-menu-edit.can{display:inline}';
  document.head.appendChild(css);
  const canToggle = () => { try { const u = window.NARA_AUTH && NARA_AUTH.user && NARA_AUTH.user(); return !!u && (u.role === 'OWNER' || u.role === 'MANAGER'); } catch (e) { return false; } };
  function paint() { document.body.classList.toggle('nara-training', window.NARA_TRAINING); const c = canToggle(); const l = document.querySelector('header strong'); if (l) l.classList.toggle('can', c); const m = document.getElementById('nara-menu-edit'); if (m) m.classList.toggle('can', c); }
  function init() {
    const label = document.querySelector('header strong[data-i18n="cashier"]') || document.querySelector('header strong');
    if (label) label.addEventListener('click', () => { if (!canToggle()) return; window.NARA_TRAINING = !window.NARA_TRAINING; set(window.NARA_TRAINING); paint(); });
    const acts = document.querySelector('header .header-actions');
    if (acts && !document.getElementById('nara-menu-edit')) { const a = document.createElement('a'); a.id = 'nara-menu-edit'; a.href = 'admin-foundation.html'; a.textContent = 'Menü ✎'; acts.insertBefore(a, acts.firstChild); }
    paint(); setInterval(paint, 2000);
  }
  document.body ? init() : document.addEventListener('DOMContentLoaded', init);
})();
