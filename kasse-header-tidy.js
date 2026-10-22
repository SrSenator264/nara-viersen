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
  /* Vollbild-Knopf: ein Klick rein/raus (⛶ / ✖). Nur wenn der Browser Vollbild kann; sonst bleibt er weg. */
  function fullscreenBtn() {
    const acts = document.querySelector('header .header-actions'); if (!acts) return;
    const root = document.documentElement; if (!root.requestFullscreen || !document.exitFullscreen) return;
    let b = document.getElementById('nara-fs');
    if (!b) {
      b = document.createElement('button'); b.id = 'nara-fs'; b.type = 'button';
      b.style.cssText = 'min-height:44px;min-width:44px;border-radius:10px;background:#eef0e9;font-size:20px;font-weight:800;line-height:1';
      const sync = () => { const on = !!document.fullscreenElement; b.textContent = on ? '✖' : '⛶'; b.setAttribute('aria-label', on ? 'Vollbild beenden' : 'Vollbild'); };
      b.onclick = () => { try { const r = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) {} };
      document.addEventListener('fullscreenchange', sync); sync();
    }
    const more = document.getElementById('nara-more');
    if (b.parentNode !== acts) acts.insertBefore(b, more && more.parentNode === acts ? more : null);
  }
  function tidy() {
    const pop = build(); if (!pop) return;
    fullscreenBtn();
    const h = document.querySelector('header');
    document.querySelectorAll('header a[data-i18n="back"]').forEach(a => a.remove());
    ['header .language-switcher', '#nara-menu-edit', 'header > a[href="admin-foundation.html"]'].forEach(sel => {
      const el = document.querySelector(sel); if (el && !pop.contains(el)) pop.appendChild(el);
    });
    updateLink(pop);
    const mb = document.querySelector('#nara-more'); if (mb && mb.parentNode && mb !== mb.parentNode.lastElementChild) mb.parentNode.appendChild(mb);
  }
  /* „System aktualisieren“ — nur Inhaber/Manager (Seite update.html) */
  function updateLink(pop) {
    let u = null; try { u = window.NARA_AUTH && NARA_AUTH.user && NARA_AUTH.user(); } catch (e) { /* ignore */ }
    let a = document.getElementById('nara-update-link');
    if (!u || (u.role !== 'OWNER' && u.role !== 'MANAGER')) { if (a) a.remove(); return; }
    const L = window.NARA_LANG;
    const txt = L && L.t ? L.t({ de: '🔄 System aktualisieren', ar: '🔄 تحديث النظام', en: '🔄 Update system' }) : '🔄 System aktualisieren';
    if (!a) { a = document.createElement('a'); a.id = 'nara-update-link'; a.href = 'update.html'; a.style.cssText = 'display:block;padding:10px 14px;font-weight:700;color:inherit;text-decoration:none;white-space:nowrap'; }
    a.textContent = txt;
    if (a.parentNode !== pop) pop.appendChild(a);
  }
  window.addEventListener('nara-lang', () => { const pop = document.getElementById('nara-more-pop'); if (pop) updateLink(pop); });
  [1500, 4000, 9000].forEach(ms => setTimeout(() => { const pop = document.getElementById('nara-more-pop'); if (pop) updateLink(pop); }, ms));
  let t; const run = () => { clearTimeout(t); t = setTimeout(tidy, 150); };
  const start = () => { tidy(); const h = document.querySelector('header'); if (h) new MutationObserver(run).observe(h, { childList: true, subtree: true }); };
  document.body ? start() : document.addEventListener('DOMContentLoaded', start);
})();
