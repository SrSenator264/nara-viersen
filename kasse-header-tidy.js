'use strict';
/* Kasse-Header aufräumen: Sprache, Menü-Bearbeiten, Verwaltung in ein „⋯“-Menü; „Zur Website“ entfällt (Seitenleiste).
   Die Elemente werden nur verschoben (Handler bleiben); späte Mounts fängt ein Observer ab. */
(function () {
  const css = document.createElement('style');
  css.textContent = '#nara-more{position:relative;display:inline-block}#nara-more>button{min-height:44px;min-width:44px;border-radius:10px;background:#eef0e9;font-size:22px;font-weight:800;line-height:1}#nara-more-pop{position:absolute;inset-inline-end:0;top:calc(100% + 6px);z-index:99990;background:#fff;border:1px solid #dce0d7;border-radius:12px;box-shadow:0 8px 28px #0003;padding:10px;display:none;flex-direction:column;gap:10px;min-width:200px}#nara-more.open #nara-more-pop{display:flex}#nara-more-pop a{display:block;padding:10px 12px;border-radius:8px;background:#f6f7f3;color:#20231f;font-weight:700;text-decoration:none;margin:0!important}#nara-more-pop .language-switcher{justify-content:center}#nara-more-pop #nara-menu-edit:not(.can){display:none}header .brand img{height:56px!important}';
  document.head.appendChild(css);
  function build() {
    const acts = document.querySelector('header .header-actions'); if (!acts) return null;
    let more = document.getElementById('nara-more');
    if (!more) {
      more = document.createElement('div'); more.id = 'nara-more';
      more.innerHTML = '<button type="button" aria-label="Mehr" aria-expanded="false">⋯</button><div id="nara-more-pop"></div>';
      acts.appendChild(more);
      more.firstChild.onclick = e => { e.stopPropagation(); const o = more.classList.toggle('open'); more.firstChild.setAttribute('aria-expanded', o); };
      document.addEventListener('click', e => { if (!more.contains(e.target)) more.classList.remove('open'); });
    }
    return more.querySelector('#nara-more-pop');
  }
  function tidy() {
    const pop = build(); if (!pop) return;
    const h = document.querySelector('header');
    document.querySelectorAll('header a[data-i18n="back"]').forEach(a => a.remove());
    ['header .language-switcher', '#nara-menu-edit', 'header > a[href="admin-foundation.html"]'].forEach(sel => {
      const el = document.querySelector(sel); if (el && !pop.contains(el)) pop.appendChild(el);
    });
    const mb = document.querySelector('#nara-more'); if (mb && mb.parentNode && mb !== mb.parentNode.lastElementChild) mb.parentNode.appendChild(mb);
  }
  let t; const run = () => { clearTimeout(t); t = setTimeout(tidy, 150); };
  const start = () => { tidy(); const h = document.querySelector('header'); if (h) new MutationObserver(run).observe(h, { childList: true, subtree: true }); };
  document.body ? start() : document.addEventListener('DOMContentLoaded', start);
})();
