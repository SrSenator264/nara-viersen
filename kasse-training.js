'use strict';
/* Übungsmodus: alles was in diesem Modus an der Kasse passiert ist Test (kein TSE, keine Statistik, kein Lager).
   Der Schalter schickt bei jedem Kassen-Event training:true; der Server markiert die Bestellung isTest. */
(function () {
  const KEY = 'nara-kasse-training';
  const lang = (() => { try { const l = (window.NARA_LANG && NARA_LANG.get()) || localStorage.getItem('nara-kasse-language') || 'de'; return ['de', 'ar', 'en'].includes(l) ? l : 'de'; } catch (e) { return 'de'; } })();
  const T = {
    de: { on: 'ÜBUNGSMODUS AN — nichts davon zählt, keine TSE', off: 'Übungsmodus', ask: 'Übungsmodus beenden?', btn: '🎓 Übung' },
    ar: { on: 'وضع التدريب شغّال — ولا شي منو بينحسب، بدون TSE', off: 'وضع التدريب', ask: 'بدك تنهي وضع التدريب؟', btn: '🎓 تدريب' },
    en: { on: 'TRAINING MODE ON — nothing counts, no TSE', off: 'Training mode', ask: 'End training mode?', btn: '🎓 Training' }
  }[lang];
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

  const css = document.createElement('style');
  css.textContent = '#nara-train-bar{position:fixed;left:0;right:0;top:0;z-index:99999;background:#f59e0b;color:#111;font:700 14px system-ui,sans-serif;text-align:center;padding:5px 8px;display:none}#nara-train-btn{position:fixed;left:270px;bottom:10px;z-index:99998;border:0;border-radius:999px;padding:8px 14px;background:#1f2937;color:#fff;font:600 13px system-ui,sans-serif;opacity:.8;cursor:pointer}body.nara-training{padding-top:30px}body.nara-training #nara-train-bar{display:block}body.nara-training #nara-train-btn{background:#f59e0b;color:#111;opacity:1}';
  document.head.appendChild(css);
  const bar = document.createElement('div'); bar.id = 'nara-train-bar'; bar.textContent = T.on;
  const btn = document.createElement('button'); btn.id = 'nara-train-btn'; btn.type = 'button'; btn.textContent = T.btn;
  function paint() { document.body.classList.toggle('nara-training', window.NARA_TRAINING); }
  btn.onclick = () => { if (window.NARA_TRAINING && !confirm(T.ask)) return; window.NARA_TRAINING = !window.NARA_TRAINING; set(window.NARA_TRAINING); paint(); };
  function init() { document.body.appendChild(bar); document.body.appendChild(btn); paint(); }
  document.body ? init() : document.addEventListener('DOMContentLoaded', init);
})();
