/* nara-auth.js — Anmeldung per Mitarbeiter-Kachel + PIN. Wird vom Server in geschützte Seiten injiziert. */
(function () {
  'use strict';
  var script = document.currentScript;
  var pageRoles = String((script && script.dataset.roles) || '').split(',').filter(Boolean);
  var ROLE_LABEL = { OWNER: 'Inhaber · المالك', MANAGER: 'Manager · مدير', CASHIER: 'Kasse · كاشير', KITCHEN: 'Küche · مطبخ', DRIVER: 'Fahrer · سائق', ACCOUNTANT: 'Buchhaltung · محاسب' };
  var ROLE_HUE = { OWNER: 262, MANAGER: 262, CASHIER: 152, KITCHEN: 28, DRIVER: 205, ACCOUNTANT: 335 };
  var state = { user: null, overlay: null, busy: false };
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function css() {
    if (document.getElementById('nara-auth-css')) return;
    var s = document.createElement('style'); s.id = 'nara-auth-css';
    s.textContent = [
      '#na-ov{position:fixed;inset:0;z-index:2147483000;background:#0f1419;color:#f3f5f7;display:flex;align-items:center;justify-content:center;font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;overflow:auto}',
      '#na-ov *{box-sizing:border-box}','.na-keys,.na-dots,#na-chip{direction:ltr}',
      '.na-card{width:min(720px,100%);display:flex;flex-direction:column;gap:20px}',
      '.na-h{font-size:28px;font-weight:700;margin:0}.na-sub{margin:4px 0 0;color:#9aa6b2;font-size:15px}',
      '.na-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}',
      '.na-tile{min-height:104px;border-radius:18px;border:2px solid transparent;background:hsl(var(--h) 38% 20%);color:#fff;text-align:start;padding:16px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;font:inherit;transition:background .15s,transform .1s,border-color .15s}',
      '.na-tile:hover,.na-tile:focus-visible{background:hsl(var(--h) 45% 28%);border-color:hsl(var(--h) 70% 62%);outline:none}.na-tile:active{transform:scale(.98)}',
      '.na-tile b{font-size:20px}.na-tile span{font-size:13px;color:hsl(var(--h) 60% 80%)}',
      '.na-pad{width:min(340px,100%);margin:0 auto;display:flex;flex-direction:column;gap:14px}',
      '.na-dots{display:flex;gap:10px;justify-content:center;min-height:22px}.na-dots i{width:16px;height:16px;border-radius:50%;background:#2c3742}.na-dots i.on{background:hsl(var(--h) 75% 62%)}',
      '.na-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
      '.na-key{height:72px;border-radius:16px;border:0;background:#1d2630;color:#fff;font:600 28px system-ui;cursor:pointer;transition:background .12s,transform .08s}.na-key:hover{background:#2a3644}.na-key:active{transform:scale(.96)}',
      '.na-key.ok{background:hsl(var(--h) 60% 38%)}.na-key.ok:hover{background:hsl(var(--h) 65% 46%)}.na-key.sm{font-size:17px;color:#9aa6b2}',
      '.na-err{color:#ff8a80;text-align:center;min-height:22px;font-size:15px}',
      '.na-link{background:none;border:0;color:#9aa6b2;font:inherit;cursor:pointer;padding:10px;text-decoration:underline}',
      '.na-in{width:100%;height:56px;border-radius:14px;border:2px solid #2c3742;background:#161d25;color:#fff;font:inherit;font-size:20px;padding:0 16px}.na-in:focus{border-color:#7aa7ff;outline:none}',
      '#na-chip{position:fixed;left:10px;bottom:10px;z-index:2147482000;display:flex;gap:8px;align-items:center;background:rgba(15,20,25,.88);color:#f3f5f7;border-radius:999px;padding:6px 8px 6px 14px;font:13px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.35)}',
      '#na-chip button{border:0;border-radius:999px;background:#2c3742;color:#fff;padding:7px 12px;font:inherit;cursor:pointer}#na-chip button:hover{background:#3d4b5a}',
      '@media print{#na-chip,#na-ov{display:none!important}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); }); else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function api(method, url, body) {
    return nativeFetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
  }
  function mount(card) {
    css();
    if (!state.overlay) { state.overlay = el('div', { id: 'na-ov' }); (document.body || document.documentElement).appendChild(state.overlay); }
    state.overlay.innerHTML = ''; state.overlay.appendChild(card);
  }
  function hideOverlay() { if (state.overlay) { state.overlay.remove(); state.overlay = null; } }

  function showTiles(msg) {
    api('GET', '/api/auth/employees').then(function (j) {
      if (j.setupNeeded) return showSetup();
      var list = (j.employees || []).filter(function (e) { return !pageRoles.length || pageRoles.indexOf(e.role) >= 0; });
      var grid = el('div', { class: 'na-grid' }, list.map(function (e) {
        var t = el('button', { class: 'na-tile', type: 'button', style: '--h:' + (ROLE_HUE[e.role] || 210), on: { click: function () { showPin(e); } } }, [el('b', { text: e.name }), el('span', { text: ROLE_LABEL[e.role] || e.role })]);
        return t;
      }));
      var kids = [el('div', {}, [el('h1', { class: 'na-h', text: 'Wer bist du? · مين أنت؟' }), el('p', { class: 'na-sub', text: msg || 'Tippe auf deinen Namen und gib deine PIN ein.' })])];
      kids.push(list.length ? grid : el('p', { class: 'na-sub', text: 'Für diese Seite ist kein passendes Konto vorhanden. Bitte den Manager fragen.' }));
      mount(el('div', { class: 'na-card' }, kids));
    }).catch(function () { mount(el('div', { class: 'na-card' }, [el('h1', { class: 'na-h', text: 'Server nicht erreichbar' }), el('button', { class: 'na-link', text: 'Erneut versuchen', on: { click: function () { showTiles(); } } })])); });
  }

  function showPin(emp) {
    var pin = '', h = ROLE_HUE[emp.role] || 210;
    var dots = el('div', { class: 'na-dots' }), err = el('div', { class: 'na-err' });
    function paint() { dots.innerHTML = ''; for (var i = 0; i < Math.max(4, pin.length); i++) dots.appendChild(el('i', { class: i < pin.length ? 'on' : '' })); }
    function add(d) { if (pin.length < 12) { pin += d; err.textContent = ''; paint(); } }
    function submit() {
      if (state.busy || pin.length < 4) return; state.busy = true;
      api('POST', '/api/auth/login', { employeeId: emp.id, pin: pin }).then(function (j) {
        state.busy = false;
        if (j.ok) return done(j.user);
        pin = ''; paint();
        err.textContent = j.__status === 429 ? (j.error || 'Gesperrt. Bitte kurz warten.') : 'PIN falsch · الرمز غير صحيح';
      }).catch(function () { state.busy = false; err.textContent = 'Server nicht erreichbar'; });
    }
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(function (d) { return el('button', { class: 'na-key', type: 'button', text: d, on: { click: function () { add(d); } } }); });
    keys.push(el('button', { class: 'na-key sm', type: 'button', text: '⌫', on: { click: function () { pin = pin.slice(0, -1); paint(); } } }));
    keys.push(el('button', { class: 'na-key', type: 'button', text: '0', on: { click: function () { add('0'); } } }));
    keys.push(el('button', { class: 'na-key ok', type: 'button', text: 'OK', on: { click: submit } }));
    paint();
    var card = el('div', { class: 'na-card', style: '--h:' + h }, [
      el('div', { style: 'text-align:center' }, [el('h1', { class: 'na-h', text: emp.name }), el('p', { class: 'na-sub', text: 'PIN eingeben · أدخل الرمز' })]),
      el('div', { class: 'na-pad' }, [dots, err, el('div', { class: 'na-keys' }, keys), el('button', { class: 'na-link', type: 'button', text: 'Anderer Mitarbeiter', on: { click: function () { showTiles(); } } })])
    ]);
    mount(card);
    state.keyHandler && document.removeEventListener('keydown', state.keyHandler);
    state.keyHandler = function (e) {
      if (!state.overlay) return;
      if (/^\d$/.test(e.key)) add(e.key); else if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); } else if (e.key === 'Enter') submit();
    };
    document.addEventListener('keydown', state.keyHandler);
  }

  function showSetup() {
    var name = el('input', { class: 'na-in', placeholder: 'Dein Name · اسمك', autocomplete: 'off' });
    var pin = el('input', { class: 'na-in', placeholder: 'PIN (mind. 6 Ziffern)', type: 'password', inputmode: 'numeric', autocomplete: 'new-password' });
    var err = el('div', { class: 'na-err' });
    var go = el('button', { class: 'na-key ok', type: 'button', style: '--h:262;width:100%', text: 'Inhaber-Konto erstellen', on: { click: function () {
      api('POST', '/api/auth/bootstrap', { name: name.value, pin: pin.value }).then(function (j) { if (j.ok) done(j.user); else err.textContent = j.error || 'Fehler'; });
    } } });
    mount(el('div', { class: 'na-card', style: 'max-width:420px;margin:auto' }, [
      el('div', {}, [el('h1', { class: 'na-h', text: 'Ersteinrichtung · الإعداد الأول' }), el('p', { class: 'na-sub', text: 'Noch kein Konto vorhanden. Lege das Inhaber-Konto an (nur am Geschäfts-PC möglich).' })]),
      name, pin, err, go
    ]));
  }

  function showDenied() {
    mount(el('div', { class: 'na-card', style: 'text-align:center' }, [
      el('h1', { class: 'na-h', text: 'Keine Berechtigung · غير مصرّح' }),
      el('p', { class: 'na-sub', text: (state.user ? state.user.name + ' (' + (ROLE_LABEL[state.user.role] || state.user.role) + ')' : '') + ' darf diese Seite nicht öffnen.' }),
      el('button', { class: 'na-key', type: 'button', style: 'height:56px;margin:0 auto;padding:0 28px', text: 'Anderer Mitarbeiter', on: { click: function () { logout(true); } } })
    ]));
  }

  function chip() {
    var old = document.getElementById('na-chip'); if (old) old.remove();
    if (!state.user) return;
    css();
    var c = el('div', { id: 'na-chip' }, [el('span', { text: state.user.name + ' · ' + (ROLE_LABEL[state.user.role] || state.user.role).split(' · ')[0] }), el('button', { type: 'button', text: 'Abmelden', on: { click: function () { logout(false); } } })]);
    (document.body || document.documentElement).appendChild(c);
  }
  function remember(u) { try { localStorage.setItem('nara-cashier-employee-id', u.id); localStorage.setItem('nara-user-role', u.role); } catch (e) { /* storage unavailable */ } }
  function done() { location.reload(); }
  function logout(thenTiles) {
    api('POST', '/api/auth/logout', {}).then(function () {
      try { localStorage.removeItem('nara-cashier-employee-id'); localStorage.removeItem('nara-user-role'); } catch (e) { /* ignore */ }
      state.user = null; var c = document.getElementById('na-chip'); if (c) c.remove();
      if (thenTiles) showTiles(); else location.reload();
    });
  }

  function start() {
    api('GET', '/api/auth/me').then(function (j) {
      if (j.user) {
        state.user = j.user; remember(j.user);
        if (pageRoles.length && pageRoles.indexOf(j.user.role) < 0) return showDenied();
        chip();
      } else showTiles();
    }).catch(function () { showTiles(); });
  }

  // أي 401 من أي طلب = الجلسة انتهت → شاشة الدخول
  if (nativeFetch) {
    window.fetch = function () {
      return nativeFetch.apply(window, arguments).then(function (r) {
        if (r.status === 401 && !state.overlay && String(r.url || '').indexOf('/api/auth/') < 0) { state.user = null; showTiles('Sitzung abgelaufen. Bitte neu anmelden.'); }
        return r;
      });
    };
  }
  window.NARA_AUTH = { user: function () { return state.user; }, logout: function () { logout(false); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
