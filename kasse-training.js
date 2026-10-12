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

  // رمز صغير بدون كتابة تحت كلمة "Kasse" بالهيدر. بس المالك/المدير بيقدر يبدّل، والموظف ما بيقدر.
  const css = document.createElement('style');
  css.textContent = '#nara-train-wrap{display:inline-flex;flex-direction:column;align-items:center;line-height:1}#nara-train-btn{border:0;background:none;padding:0;margin-top:2px;font-size:15px;line-height:1;opacity:.28;filter:grayscale(1);cursor:default}#nara-train-btn.can{cursor:pointer}body.nara-training #nara-train-btn{opacity:1;filter:none;background:#f59e0b;border-radius:999px;padding:2px 6px}';
  document.head.appendChild(css);
  const canToggle = () => { try { const u = window.NARA_AUTH && NARA_AUTH.user && NARA_AUTH.user(); return !!u && (u.role === 'OWNER' || u.role === 'MANAGER'); } catch (e) { return false; } };
  function paint() { document.body.classList.toggle('nara-training', window.NARA_TRAINING); const b = document.getElementById('nara-train-btn'); if (b) b.classList.toggle('can', canToggle()); }
  function init() {
    const label = document.querySelector('header strong[data-i18n="cashier"]') || document.querySelector('header strong');
    const btn = document.createElement('button'); btn.id = 'nara-train-btn'; btn.type = 'button'; btn.textContent = '🎓';
    btn.onclick = () => { if (!canToggle()) return; window.NARA_TRAINING = !window.NARA_TRAINING; set(window.NARA_TRAINING); paint(); };
    if (label && label.parentNode) { const w = document.createElement('span'); w.id = 'nara-train-wrap'; label.parentNode.insertBefore(w, label); w.appendChild(label); w.appendChild(btn); }
    else { btn.style.cssText = 'position:fixed;left:270px;bottom:10px;z-index:99998'; document.body.appendChild(btn); }
    paint(); setInterval(paint, 2000);
  }
  document.body ? init() : document.addEventListener('DOMContentLoaded', init);
})();
