'use strict';
/* flamo-home.js — زر 🏠 عائم للرجوع للرئيسية (nara-app.html) على كل الصفحات، حتى موقع الزبون.
   بيظهر بس إذا في جلسة موظف مفتوحة (/api/auth/me)، فالزبون العادي ما بيشوف شي. */
(function () {
  const HOME = '/nara-app.html', file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (['nara-app.html', 'index.html', 'delivery-print.html'].includes(file) || /[?&]app=1\b/.test(location.search)) return;
  function mount() {
    if (document.getElementById('flamo-home-btn') || !document.body) return;
    const a = document.createElement('a');
    a.id = 'flamo-home-btn'; a.href = HOME; a.setAttribute('aria-label', 'Startseite'); a.textContent = '🏠';
    a.style.cssText = 'position:fixed;bottom:10px;inset-inline-start:' + '10px' + ';z-index:2147483000;width:38px;height:38px;border-radius:50%;border:1px solid #0003;background:#fff;color:#000;font-size:1.1rem;line-height:38px;text-align:center;text-decoration:none;opacity:.55;box-shadow:0 2px 8px #0002;touch-action:manipulation';
    a.addEventListener('mouseenter', () => { a.style.opacity = '1'; }); a.addEventListener('mouseleave', () => { a.style.opacity = '.55'; });
    document.body.appendChild(a);
  }
  function start() {
    try { fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => { if (j && j.user) mount(); }).catch(() => {}); } catch (e) { /* ignore */ }
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
