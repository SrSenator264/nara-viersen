'use strict';
// flamo-nav.js — EIN Navigations-System für alle internen Flamo-Seiten (Seitenleiste, Zurück-Knopf, Suche, Status).
// Wird vom Server automatisch in jede geschützte Seite eingefügt (server-auth.js → inject), nicht per Hand.
// Neue Seite? Nur in PAGES unten eintragen (+ PAGE_ROLES in auth.js) — Rechte kommen vom Server (data-roles-map).
(function () {
  if (window.__FLAMO_NAV__) return;
  window.__FLAMO_NAV__ = true;

  const L = (de, ar, en) => ({ de, ar, en });
  const GROUPS = {
    today: L('Heute', 'اليوم', 'Today'),
    delivery: L('Lieferung', 'التوصيل', 'Delivery'),
    money: L('Zahlen', 'الأرقام والمحاسبة', 'Money'),
    ops: L('Betrieb', 'التشغيل', 'Operations'),
    flamo: L('Flamo', 'فلامو', 'Flamo'),
  };
  // k = Schlüssel, f = Datei (+ #Hash), i = Icon, g = Gruppe
  const PAGES = [
    { k: 'kasse', f: 'kasse.html', i: '🧾', g: 'today', n: L('Kasse', 'الكاشير', 'Till') },
    { k: 'live', f: 'live-orders.html', i: '📋', g: 'today', n: L('Live Orders', 'الطلبات الحية', 'Live Orders') },
    { k: 'reception', f: 'reception.html', i: '📥', g: 'today', n: L('Plattformen', 'تجميع المنصات', 'Platform hub') },
    { k: 'kitchen', f: 'kitchen.html', i: '👨‍🍳', g: 'today', n: L('Küche', 'المطبخ', 'Kitchen') },
    { k: 'customers', f: 'customers.html', i: '👥', g: 'today', n: L('Kunden', 'الزباين', 'Customers') },
    { k: 'customer-book', f: 'customer-book.html', i: '📒', g: 'today', n: L('Kundenkartei', 'سجل الزباين', 'Customer book') },
    { k: 'dispatch', f: 'dispatch.html', i: '🛵', g: 'delivery', n: L('Fahrer-Plan', 'توزيع السواقين', 'Dispatch') },
    { k: 'delivery', f: 'driver-app-v2.html', i: '📦', g: 'delivery', n: L('Lieferaufträge', 'طلبات التوصيل', 'Delivery orders') },
    { k: 'delivery-print', f: 'delivery-print.html', i: '🖨️', g: 'delivery', n: L('Lieferzettel drucken', 'طباعة طلب توصيل', 'Print delivery slip') },
    { k: 'sales', f: 'sales.html', i: '💶', g: 'money', n: L('Umsätze', 'المبيعات', 'Sales') },
    { k: 'close', f: 'kasse-settlement.html', i: '📊', g: 'money', n: L('Tagesabschluss', 'تقفيلة اليوم', 'Daily closing') },
    { k: 'accounting', f: 'accounting.html', i: '📚', g: 'money', n: L('Buchhaltung', 'المحاسبة', 'Accounting') },
    { k: 'banking', f: 'banking.html', i: '🏦', g: 'money', n: L('Bank', 'البنك', 'Bank') },
    { k: 'reports', f: 'reports.html', i: '📈', g: 'money', n: L('Gewinn & Verlust', 'الربح والخسارة', 'Profit & loss') },
    { k: 'documents', f: 'inventory-foundation.html#documents', i: '🗂️', g: 'money', n: L('Dokumente', 'الأوراق والمستندات', 'Documents') },
    { k: 'reminders', f: 'reminders.html', i: '🔔', g: 'ops', n: L('Erinnerungen', 'تنبيهات', 'Reminders') },
    { k: 'menu', f: 'admin-foundation.html', i: '🍔', g: 'ops', n: L('Speisekarte', 'المنيو', 'Menu') },
    { k: 'stock', f: 'inventory-foundation.html#items', i: '🥬', g: 'ops', n: L('Lager', 'المخزن', 'Stock') },
    { k: 'suppliers', f: 'inventory-foundation.html#suppliers', i: '🚚', g: 'ops', n: L('Lieferanten', 'الموردين', 'Suppliers') },
    { k: 'invoices', f: 'inventory-foundation.html#invoices', i: '🧮', g: 'ops', n: L('Einkaufsrechnungen', 'فواتير الشراء', 'Purchase invoices') },
    { k: 'staff', f: 'staff.html', i: '🗓️', g: 'ops', n: L('Mitarbeiter & Schichten', 'الموظفين والورديات', 'Staff & shifts') },
    { k: 'team', f: 'team.html', i: '🔑', g: 'ops', n: L('Team & PINs', 'الفريق والرموز', 'Team & PINs') },
    { k: 'status', f: 'status.html', i: '🩺', g: 'flamo', n: L('Betriebsstatus', 'حالة الشغل', 'System status') },
    { k: 'dashboard', f: 'dashboard.html', i: '🏠', g: 'flamo', n: L('Dashboard', 'لوحة التحكم', 'Dashboard') },
    { k: 'ai', f: 'ai-control.html', i: '🤖', g: 'flamo', n: L('AI Manager', 'AI Manager', 'AI Manager') },
    { k: 'site', f: 'web-prototype/c.html', i: '🔥', g: 'flamo', n: L('Kundenseite', 'موقع الزبون', 'Customer site') },
  ];
  const HOME = { f: 'nara-app.html', i: '🏁', n: L('Start', 'الرئيسية', 'Home') };
  const T = {
    back: L('Zurück', 'رجوع', 'Back'),
    menu: L('Menü', 'القائمة', 'Menu'),
    search: L('Seite suchen…', 'دوّر على صفحة…', 'Find a page…'),
    searchHint: L('Strg+K', 'Ctrl+K', 'Ctrl+K'),
    logout: L('Abmelden', 'تسجيل خروج', 'Log out'),
    recent: L('Zuletzt besucht', 'آخر صفحات فتحتها', 'Recently visited'),
    none: L('Nichts gefunden', 'ما لقيت شي', 'Nothing found'),
    online: L('Verbunden', 'متصل', 'Online'),
    noServer: L('Server nicht erreichbar', 'السيرفر مو واصل', 'Server unreachable'),
    noNet: L('Kein Internet', 'ما في إنترنت', 'No internet'),
  };
  // Arbeitsbildschirme: Seitenleiste nur auf Knopfdruck (volle Breite für Kasse/Küche)
  const COMPACT = new Set(['kasse.html', 'reception.html', 'kitchen.html', 'live-orders.html', 'dispatch.html', 'driver-app-v2.html', 'connect.html']);
  // Seiten, deren Inhalt früher von nara-shell.js in .main gepackt wurde (Abstand/Breite bleibt gleich)
  const WRAP = new Set(['accounting.html', 'admin-foundation.html', 'ai-control.html', 'banking.html', 'dashboard.html', 'inventory-foundation.html', 'reports.html', 'sales.html', 'staff.html']);
  const MANAGERS = ['OWNER', 'MANAGER'];

  const me = document.currentScript;
  let rolesMap = {};
  try { rolesMap = JSON.parse((me && me.dataset.rolesMap) || '{}'); } catch (e) { /* ignore */ }
  const file = decodeURIComponent(location.pathname.split('/').pop() || '');
  const inWebProto = /\/web-prototype\//.test(location.pathname);
  const base = (function () { // relative Pfade immer ab Wurzel
    return '/';
  })();

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };
  const OK = ['de', 'ar', 'en'];
  const lang = () => {
    try { if (window.NARA_LANG && NARA_LANG.get) return NARA_LANG.get(); } catch (e) { /* ignore */ }
    for (const k of ['nara-lang-app', 'nara-language', 'nara.language']) { const v = store.get(k); if (OK.includes(v)) return v; }
    return 'de';
  };
  const tr = d => (d && (d[lang()] || d.de)) || '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const user = () => { try { return window.NARA_AUTH && NARA_AUTH.user && NARA_AUTH.user(); } catch (e) { return null; } };
  const allowedFor = (p, role) => {
    if (!role) return true; // noch nicht angemeldet / lädt → alles zeigen, der Server prüft sowieso
    const name = p.f.split('#')[0];
    const roles = rolesMap[name] || MANAGERS;
    return roles.includes(role);
  };
  const keyOfCurrent = () => {
    const h = location.hash || '';
    if (file === 'inventory-foundation.html') return h.includes('suppliers') ? 'suppliers' : h.includes('invoices') ? 'invoices' : h.includes('documents') ? 'documents' : 'stock';
    if (inWebProto && file === 'c.html') return 'site';
    const p = PAGES.find(x => x.f.split('#')[0] === file);
    return p ? p.k : '';
  };

  function init() {
    if (document.body.dataset.flamoNav === '1') return;
    // Plattformen-Tablet als eigene App (?app=1): keine Seitenleiste/Leiste, kein Zugang zu anderen Bereichen
    try { if (file === 'reception.html' && /[?&]app=1\b/.test(location.search)) return; } catch (e) { /* ignore */ }
    document.body.dataset.flamoNav = '1';
    const compact = COMPACT.has(file);
    document.body.classList.add('fn-on', compact ? 'fn-compact' : 'fn-full');
    if (!compact && store.get('flamo-nav-collapsed') === '1') document.body.classList.add('fn-collapsed');

    // alter Inhalt-Wrapper (nur Seiten, die ihn schon vorher hatten)
    if (WRAP.has(file)) {
      const header = document.querySelector('body > header');
      if (header && !document.querySelector('.main')) {
        const main = el('div', 'main');
        let n = header.nextSibling;
        while (n) { const nx = n.nextSibling; main.append(n); n = nx; }
        header.after(main);
      }
    }

    // ── Seitenleiste ──
    const side = el('aside', 'fn-side');
    side.setAttribute('aria-label', 'Flamo');
    const backdrop = el('div', 'fn-backdrop');
    // ── Kopfleiste ──
    const bar = el('div', 'fn-bar');
    document.body.prepend(bar);
    document.body.append(side, backdrop);

    const close = () => { side.classList.remove('open'); backdrop.classList.remove('open'); };
    // شاشة كبيرة: ☰ بيطوي/بيفتح السايدبار (محفوظ بالمتصفح). شاشة صغيرة: بيفتحه فوق الصفحة متل قبل.
    const desk = () => document.body.classList.contains('fn-full') && window.matchMedia('(min-width:1000px)').matches;
    const toggle = () => {
      if (desk()) {
        const c = document.body.classList.toggle('fn-collapsed');
        store.set('flamo-nav-collapsed', c ? '1' : '0');
        setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } }, 250); // الخرائط والجداول بتعيد قياسها
        return;
      }
      side.classList.toggle('open'); backdrop.classList.toggle('open', side.classList.contains('open'));
    };
    backdrop.onclick = close;

    function goBack() {
      let sameOrigin = false;
      try { sameOrigin = document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) { /* ignore */ }
      if (sameOrigin && history.length > 1) history.back();
      else location.href = base + HOME.f;
    }

    function renderSide() {
      const u = user(), role = u && u.role, cur = keyOfCurrent();
      const visible = PAGES.filter(p => allowedFor(p, role));
      let html = `<a class="fn-brand" href="${base}${HOME.f}" aria-label="Flamo"><img src="${base}brand/flamo-logo.svg" alt="Flamo"></a>`;
      html += `<a class="fn-link${file === HOME.f ? ' current' : ''}" href="${base}${HOME.f}"><i>${HOME.i}</i><span>${esc(tr(HOME.n))}</span></a>`;
      for (const g of Object.keys(GROUPS)) {
        const items = visible.filter(p => p.g === g);
        if (!items.length) continue;
        html += `<div class="fn-group">${esc(tr(GROUPS[g]))}</div>`;
        html += items.map(p => `<a class="fn-link${p.k === cur ? ' current' : ''}" href="${base}${p.f}"><i>${p.i}</i><span>${esc(tr(p.n))}</span></a>`).join('');
      }
      html += '<div class="fn-foot">';
      if (u) html += `<div class="fn-user"><b>${esc(u.name || '')}</b><small>${esc((window.NARA_AUTH && NARA_AUTH.roleLabel && NARA_AUTH.roleLabel(u.role)) || u.role || '')}</small></div>`;
      html += '<div class="fn-lang" role="group">' + OK.map(c => `<button type="button" data-l="${c}" class="${c === lang() ? 'on' : ''}">${c === 'ar' ? 'ع' : c.toUpperCase()}</button>`).join('') + '</div>';
      if (u) html += `<button type="button" class="fn-out">${esc(tr(T.logout))}</button>`;
      html += '</div>';
      side.innerHTML = html;
      side.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');
      side.querySelectorAll('.fn-lang button').forEach(b => b.onclick = () => setLang(b.dataset.l));
      const out = side.querySelector('.fn-out'); if (out) out.onclick = () => { try { NARA_AUTH.logout(); } catch (e) { /* ignore */ } };
      side.querySelectorAll('.fn-link').forEach(a => a.addEventListener('click', () => { remember(a.getAttribute('href')); close(); }));
    }

    function setLang(c) {
      if (!OK.includes(c) || c === lang()) return;
      store.set('nara-lang-app', c); store.set('nara-language', c); store.set('nara.language', c);
      try { if (window.NARA_LANG) NARA_LANG.set(c); } catch (e) { /* ignore */ }
      location.reload();
    }

    function renderBar() {
      const cur = PAGES.find(p => p.k === keyOfCurrent());
      const u = user();
      const crumb = cur ? `<span class="fn-crumb">${esc(tr(GROUPS[cur.g]))} <em>›</em> <b>${esc(tr(cur.n))}</b></span>` : '';
      bar.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');
      bar.innerHTML = `<button type="button" class="fn-burger" aria-label="${esc(tr(T.menu))}">☰</button>` +
        `<a class="fn-mini" href="${base}${HOME.f}" aria-label="Flamo"><img src="${base}brand/flamo-icon.svg" alt="Flamo"></a>` +
        (file === HOME.f ? '' : `<button type="button" class="fn-back"><span class="fn-arrow">←</span> ${esc(tr(T.back))}</button>`) +
        crumb + '<span class="fn-sp"></span>' +
        (file !== HOME.f ? `<a class="fn-menu" href="${base}${HOME.f}">🏠 <span>${esc(tr(HOME.n))}</span></a>` : '') +
        `<button type="button" class="fn-find" aria-label="${esc(tr(T.search))}">🔎 <span>${esc(tr(T.search))}</span> <kbd>${esc(tr(T.searchHint))}</kbd></button>` +
        (/\/kasse(\.html)?$/.test(location.pathname) ? '' : '<span class="fn-status" id="fn-status"></span>') +
        (u ? `<span class="fn-who"><b>${esc(u.name || '')}</b><button type="button" class="fn-out2">${esc(tr(T.logout))}</button></span>` : '');
      bar.querySelector('.fn-burger').onclick = toggle;
      const b = bar.querySelector('.fn-back'); if (b) b.onclick = goBack;
      bar.querySelector('.fn-find').onclick = openPalette;
      const o2 = bar.querySelector('.fn-out2'); if (o2) o2.onclick = () => { try { NARA_AUTH.logout(); } catch (e) { /* ignore */ } };
      paintStatus();
    }

    // ── Verbindungsstatus (Internet des Ladens fällt öfter aus) ──
    let srvOk = true;
    function paintStatus() {
      const s = document.getElementById('fn-status'); if (!s) return;
      const net = navigator.onLine !== false;
      const state = !srvOk ? 'srv' : !net ? 'net' : 'ok';
      s.className = 'fn-status ' + state;
      s.title = state === 'ok' ? tr(T.online) : state === 'srv' ? tr(T.noServer) : tr(T.noNet);
      s.innerHTML = `<i></i>${state === 'ok' ? '' : '<span>' + esc(s.title) + '</span>'}`;
    }
    function ping() {
      fetch(base + 'sw.js', { method: 'HEAD', cache: 'no-store' }).then(r => { srvOk = r.ok || r.status < 500; paintStatus(); }).catch(() => { srvOk = false; paintStatus(); });
    }
    
  // Höhe der oberen Leiste als CSS-Variable, damit Seitenpanels (z. B. Kunde) nicht darunter verschwinden
  function setBarVar(){try{const b=document.querySelector('.fn-bar');if(b)document.documentElement.style.setProperty('--fn-bar-h',b.offsetHeight+'px')}catch(e){}}
  window.addEventListener('resize',setBarVar);setBarVar();setTimeout(setBarVar,600);
    window.addEventListener('online', paintStatus); window.addEventListener('offline', paintStatus);
    setInterval(ping, 20000);

    // ── Zuletzt besucht + Suche (Strg+K) ──
    function remember(href) {
      try {
        const f = String(href || '').replace(/^\//, '');
        const list = JSON.parse(store.get('flamo-nav-recent') || '[]').filter(x => x !== f);
        list.unshift(f); store.set('flamo-nav-recent', JSON.stringify(list.slice(0, 6)));
      } catch (e) { /* ignore */ }
    }
    remember(file + (location.hash && file === 'inventory-foundation.html' ? location.hash : ''));

    let pal = null;
    function openPalette() {
      if (pal) return closePalette();
      const role = (user() || {}).role;
      const all = PAGES.filter(p => allowedFor(p, role));
      pal = el('div', 'fn-pal');
      pal.innerHTML = `<div class="fn-pal-box" dir="${lang() === 'ar' ? 'rtl' : 'ltr'}"><input type="search" autocomplete="off" placeholder="${esc(tr(T.search))}"><div class="fn-pal-list"></div></div>`;
      document.body.append(pal);
      const input = pal.querySelector('input'), list = pal.querySelector('.fn-pal-list');
      let sel = 0, shown = [];
      const norm = s => String(s).toLowerCase();
      function draw() {
        const q = norm(input.value.trim());
        if (q) shown = all.filter(p => [p.n.de, p.n.ar, p.n.en, p.k].some(x => norm(x).includes(q)));
        else {
          let rec = []; try { rec = JSON.parse(store.get('flamo-nav-recent') || '[]'); } catch (e) { /* ignore */ }
          const byF = f => all.find(p => p.f === f);
          shown = rec.map(byF).filter(Boolean).concat(all).filter((p, i, a) => a.indexOf(p) === i);
        }
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        list.innerHTML = (!q ? `<div class="fn-group">${esc(tr(T.recent))}</div>` : '') +
          (shown.length ? shown.map((p, i) => `<a class="fn-link${i === sel ? ' current' : ''}" data-i="${i}" href="${base}${p.f}"><i>${p.i}</i><span>${esc(tr(p.n))}</span><small>${esc(tr(GROUPS[p.g]))}</small></a>`).join('') : `<div class="fn-none">${esc(tr(T.none))}</div>`);
        list.querySelectorAll('a').forEach(a => a.addEventListener('click', () => remember(a.getAttribute('href'))));
      }
      input.addEventListener('input', () => { sel = 0; draw(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
        else if (e.key === 'Enter' && shown[sel]) { remember(shown[sel].f); location.href = base + shown[sel].f; }
        else if (e.key === 'Escape') closePalette();
      });
      pal.addEventListener('mousedown', e => { if (e.target === pal) closePalette(); });
      draw(); input.focus();
    }
    function closePalette() { if (pal) { pal.remove(); pal = null; } }
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      else if (e.key === 'Escape') { closePalette(); close(); }
    });

    const redraw = () => { renderSide(); renderBar(); };
    redraw(); ping();
    window.addEventListener('hashchange', redraw);
    window.addEventListener('nara-lang', redraw);
    window.addEventListener('nara-language-changed', redraw);
    // Anmeldung lädt asynchron → Menü neu zeichnen, sobald der Benutzer da ist (Rechte)
    let n = 0; const iv = setInterval(() => { if (user() || ++n > 30) { clearInterval(iv); redraw(); } }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
