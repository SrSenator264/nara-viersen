'use strict';
// flamo-t.js — kleine Übersetzungshilfe für Seiten mit eigenem Wörterbuch (de · ar · en).
//   <script src="/nara-lang.js" data-section="sales"></script><script src="/flamo-t.js"></script>
//   FT.init({ key: { de:'…', ar:'…', en:'…' } , ...}, { onChange(){ /* neu zeichnen */ } })
//   HTML: data-t="key" (Text) · data-t-ph="key" (placeholder) · data-t-title="key" (title)
//   JS:   FT.t('key', { n: 3 })  → "{n}" im Text wird ersetzt.   FT.locale() → 'de-DE' | 'ar' | 'en-GB'
//   Fehlt ein Eintrag in einer Sprache, fällt FT auf Deutsch zurück — und tests/i18n-pages.test.js schlägt an.
(function () {
  const OK = ['de', 'ar', 'en'];
  let DICT = {};
  const lang = () => {
    try { if (window.NARA_LANG && NARA_LANG.get) return NARA_LANG.get(); } catch (e) { /* ignore */ }
    for (const k of ['nara-lang-app', 'nara-language', 'nara.language']) { try { const v = localStorage.getItem(k); if (OK.includes(v)) return v; } catch (e) { /* ignore */ } }
    return 'de';
  };
  const t = (key, vars) => {
    const e = DICT[key]; let s = e ? (e[lang()] != null ? e[lang()] : (e.de != null ? e.de : key)) : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  const locale = () => ({ de: 'de-DE', ar: 'ar', en: 'en-GB' }[lang()]);
  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    root.querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = t(el.dataset.tPh); });
    root.querySelectorAll('[data-t-title]').forEach(el => { el.title = t(el.dataset.tTitle); });
    try { document.documentElement.lang = lang(); document.documentElement.dir = lang() === 'ar' ? 'rtl' : 'ltr'; } catch (e) { /* ignore */ }
    if (DICT.title) document.title = 'Flamo · ' + t('title');
  }
  function init(dict, opts) {
    DICT = Object.assign(DICT, dict); apply();
    window.addEventListener('nara-lang', () => { apply(); if (opts && opts.onChange) opts.onChange(); });
  }
  window.FT = { init, t, apply, lang, locale, dict: () => DICT };
})();
