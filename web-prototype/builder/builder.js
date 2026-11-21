/* builder.js — Flamo "✏️ Anpassen / Bau deinen Burger" (Overlay auf der Kundenseite c.html).
   - Öffnen: Knopf ✏️ auf Burger-Karten (data-build="ID") oder Link #build-ID.
   - Ebenen: eingebaute SVG-Zeichnungen; echte Fotos später über builder/layers.json (src) ohne Code-Änderung.
   - Ergebnis = normale Warenkorb-Zeile (gleiche Optionen wie im Produktfenster, "ohne X" als Notiz). Preis rechnet der Server neu.
   Kern-Funktionen sind ohne DOM testbar (module.exports in Node). */
(function (root) {
  'use strict';

  // ───────────────────────── KERN (rein, testbar) ─────────────────────────
  var METRICS = {
    bunBottom: { vbW: 260, vbH: 64, baseY: 64, restY: 16 }, patty: { vbW: 260, vbH: 46, baseY: 40, restY: 14 }, chicken: { vbW: 264, vbH: 50, baseY: 44, restY: 12 },
    veggie: { vbW: 256, vbH: 44, baseY: 38, restY: 13 }, cheese: { vbW: 268, vbH: 40, baseY: 14, restY: 6 }, lettuce: { vbW: 280, vbH: 42, baseY: 30, restY: 12 },
    tomato: { vbW: 250, vbH: 30, baseY: 25, restY: 8 }, pickles: { vbW: 250, vbH: 26, baseY: 22, restY: 8 }, onion: { vbW: 250, vbH: 22, baseY: 18, restY: 7 },
    bacon: { vbW: 260, vbH: 26, baseY: 21, restY: 9 }, jalapeno: { vbW: 250, vbH: 22, baseY: 18, restY: 8 }, egg: { vbW: 250, vbH: 34, baseY: 26, restY: 10 },
    friedOnion: { vbW: 250, vbH: 24, baseY: 19, restY: 9 }, pineapple: { vbW: 250, vbH: 26, baseY: 21, restY: 8 }, camembert: { vbW: 250, vbH: 34, baseY: 28, restY: 9 },
    shrimp: { vbW: 250, vbH: 30, baseY: 24, restY: 10 }, sauce: { vbW: 240, vbH: 26, baseY: 14, restY: 10 }, bunTop: { vbW: 260, vbH: 104, baseY: 100, restY: 0 }
  };
  var SAUCES = [
    ['joppie', /joppie/i, '#f2b632', 'Joppie'], ['bbq', /bbq|barbecue/i, '#6b2a12', 'BBQ'], ['chili-cheese', /chili[- ]?cheese|chilli[- ]?cheese/i, '#f5a623', 'Chili-Cheese'],
    ['zinger', /zinger/i, '#d9531e', 'Zinger'], ['champignon', /champignon|pilz/i, '#bfa98a', 'Champignon'], ['guacamole', /guacamole/i, '#8db04a', 'Guacamole'],
    ['big', /big (burger )?sauce/i, '#ef9a55', 'Big Sauce'], ['burger', /burgers(o|ö)(ß|ss)e|burger ?sauce/i, '#ef9a55', 'Burgersoße'],
    ['ketchup', /ketchup/i, '#c8161d', 'Ketchup'], ['mayo', /mayo/i, '#f5edd2', 'Mayo']
  ];
  var EXTRA_MAP = {
    'extra-beef': { type: 'patty' }, 'extra-chicken': { type: 'chicken' }, 'extra-cheese': { type: 'cheese' }, 'extra-camembert': { type: 'camembert' }, 'extra-egg': { type: 'egg' },
    'extra-bacon': { type: 'bacon' }, 'extra-jalapenos': { type: 'jalapeno' }, 'extra-onions': { type: 'friedOnion' }, 'extra-pineapple': { type: 'pineapple' },
    'extra-sauce': { type: 'sauce', color: '#ef9a55' }, 'extra-mustard': { type: 'sauce', color: '#e0b21b' }, 'extra-aioli': { type: 'sauce', color: '#f3ead0' }, 'extra-bbq': { type: 'sauce', color: '#6b2a12' },
    'extra-cheese-sauce': { type: 'sauce', color: '#f5b52e' }, 'extra-hot-sauce': { type: 'sauce', color: '#c62a1a' }, 'extra-honey': { type: 'sauce', color: '#e7a91e' },
    'extra-cherry': { type: 'sauce', color: '#8e1230' }, 'extra-joppie': { type: 'sauce', color: '#f2b632' }
  };
  function extraLayer(opt) {
    var m = EXTRA_MAP[opt.i]; if (m) return m;
    var n = String(opt.n || '').toLowerCase();
    if (/beef|rind|patty/.test(n)) return { type: 'patty' }; if (/chicken|hähn/.test(n)) return { type: 'chicken' }; if (/käse|cheese|cheddar/.test(n) && !/sauce|soße/.test(n)) return { type: 'cheese' };
    if (/bacon/.test(n)) return { type: 'bacon' }; if (/jalap/.test(n)) return { type: 'jalapeno' }; if (/zwiebel|onion/.test(n)) return { type: 'friedOnion' }; if (/ei\b|egg/.test(n)) return { type: 'egg' };
    for (var i = 0; i < SAUCES.length; i++) if (SAUCES[i][1].test(n)) return { type: 'sauce', color: SAUCES[i][2] };
    return { type: 'sauce', color: '#ef9a55' };
  }
  // Basis-Zutaten aus Name + Beschreibung (unten → oben, Brötchen-Deckel kommt erst bei "Top it off")
  function parseBase(p) {
    var t = String((p.n0 || p.n || '') + ' ' + (p.d0 || p.d || '')).toLowerCase(), L = [];
    var meat = /pflanzlich|veggie/.test(t) ? 'veggie' : /hähnchen|haehnchen|chicken|chik|zinger/.test(t) ? 'chicken' : 'patty';
    var n = /(drei|3)\s*(lagen|rind|chicken|chik|hähnchen|patt)/.test(t) ? 3 : /(zwei|2)\s*(lagen|rind|chicken|chik|hähnchen|patt)|doppel/.test(t) ? 2 : 1;
    var cheeseN = /zweimal (cheddar|käse)|zwei chester|2x (cheddar|käse)/.test(t) ? 2 : /cheddar|chester|käse\b|cheese burger|camembert/.test(t.replace(/chil+i[- ]?cheese[- ]?(soße|sosse|sauce)/g, '')) ? 1 : 0;
    L.push({ type: 'bunBottom', base: true, key: 'bun' });
    if (/salat/.test(t)) L.push({ type: 'lettuce', base: true, key: 'Salat' });
    if (/tomate/.test(t)) L.push({ type: 'tomato', base: true, key: 'Tomaten' });
    for (var i = 0; i < n; i++) { L.push({ type: meat, base: true, key: 'meat' }); if (i < cheeseN) L.push({ type: 'cheese', base: true, key: 'Käse' }); }
    if (/bacon/.test(t)) L.push({ type: 'bacon', base: true, key: 'Bacon' });
    if (/garnele|shrimp/.test(t)) L.push({ type: 'shrimp', base: true, key: 'Garnelen' });
    if (/gurke/.test(t)) L.push({ type: 'pickles', base: true, key: 'Gurken' });
    if (/zwiebel/.test(t)) L.push({ type: /gegrillte zwiebel|röstzwiebel|knusprige zwiebel|gebratene zwiebel/.test(t) ? 'friedOnion' : 'onion', base: true, key: 'Zwiebeln' });
    if (/jalape/.test(t)) L.push({ type: 'jalapeno', base: true, key: 'Jalapeños' });
    var seen = {};
    SAUCES.forEach(function (s) { if (s[1].test(t) && !seen[s[0]] && !(s[0] === 'burger' && Object.keys(seen).some(function (k) { return k !== 'ketchup' && k !== 'mayo'; }))) { seen[s[0]] = 1; L.push({ type: 'sauce', color: s[2], base: true, key: s[3] }); } });
    return L;
  }
  function extrasGroup(p) { var g = (p.o || []).filter(function (g) { return g.g === 'Ihre Extras'; })[0]; return g ? g.x || [] : []; }
  function group(p, name) { return (p.o || []).filter(function (g) { return g.g === name; })[0] || null; }
  // Warenkorb-Zeile im Format der Kundenseite (lineKey/addLine): {id,q,m,o:[{g,i,n,c}],nt,u}
  function buildLine(p, st) {
    var o = [], u = st.menu && p.mc ? p.mc : p.p, ex = extrasGroup(p);
    (st.extras || []).forEach(function (id) { var x = ex.filter(function (y) { return y.i === id; })[0]; if (x) { o.push({ g: 'Ihre Extras', i: x.i, n: x.n, c: x.c || 0 }); u += x.c || 0; } });
    if (st.menu && p.mc) ['__drink', '__sauce'].forEach(function (gn) { var g = group(p, gn), id = gn === '__drink' ? st.drink : st.msauce; var x = g && g.x.filter(function (y) { return y.i === id; })[0]; if (x) { o.push({ g: gn, i: x.i, n: x.n, c: x.c || 0 }); u += x.c || 0; } });
    var nt = []; (st.removed || []).forEach(function (k) { if (k !== 'bun' && k !== 'meat' && nt.indexOf('ohne ' + k) < 0) nt.push('ohne ' + k); });
    return { id: p.id, q: 1, m: st.menu && p.mc ? 1 : 0, o: o, nt: nt.join(', ').slice(0, 160), u: u };
  }
  function menuReady(p, st) { return !(st.menu && p.mc) || (!!st.drink && !!st.msauce); }
  function isBuildable(p) { return !!p && !p.off && extrasGroup(p).length > 0 && (p.s === 'burger' || /burger/i.test(p.n0 || p.n || '')) && !/angebot|\(4 st/i.test(p.n0 || p.n || ''); }
  var CORE = { parseBase: parseBase, buildLine: buildLine, extraLayer: extraLayer, isBuildable: isBuildable, menuReady: menuReady, METRICS: METRICS };
  if (typeof module === 'object' && module.exports) { module.exports = CORE; return; }

  // ───────────────────────── ZEICHNUNGEN (SVG) ─────────────────────────
  var uidN = 0; function uid(p) { return (p || 'g') + (++uidN); }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function smooth(pts) { var n = pts.length, mid = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }; var m0 = mid(pts[n - 1], pts[0]), d = 'M' + m0[0].toFixed(1) + ',' + m0[1].toFixed(1); for (var i = 0; i < n; i++) { var p = pts[i], m = mid(p, pts[(i + 1) % n]); d += 'Q' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' ' + m[0].toFixed(1) + ',' + m[1].toFixed(1); } return d + 'Z'; }
  function band(r, x0, x1, top, bot, ampT, ampB, step) { var pts = [], x; for (x = x0 + 6; x <= x1 - 6; x += step) pts.push([x, top + (r() - .5) * 2 * ampT]); pts.push([x1, (top + bot) / 2 - 2]); for (x = x1 - 6; x >= x0 + 6; x -= step) pts.push([x, bot + (r() - .5) * 2 * ampB]); pts.push([x0, (top + bot) / 2]); return smooth(pts); }
  function svg(m, inner) { return '<svg viewBox="0 0 ' + m.vbW + ' ' + m.vbH + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>'; }
  function seeds(r, n, inside) { var s = '', k = 0, tries = 0; while (k < n && tries++ < 600) { var x = 30 + r() * 200, y = 14 + r() * 70; if (!inside(x, y)) continue; var a = (r() * 180) | 0; s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="3.6" ry="1.7" transform="rotate(' + a + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="#fff3d6" stroke="#c9a46a" stroke-width=".5"/>'; k++; } return s; }
  var DRAW = {
    bunTop: function () { var g = uid('bt'), h = uid('bh'), r = rng(7); return svg(METRICS.bunTop, '<defs><radialGradient id="' + g + '" cx="38%" cy="22%" r="85%"><stop offset="0" stop-color="#f9c37a"/><stop offset=".45" stop-color="#d9832f"/><stop offset=".85" stop-color="#a5541b"/><stop offset="1" stop-color="#7d3d12"/></radialGradient><linearGradient id="' + h + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dcae"/><stop offset="1" stop-color="#e6c08a"/></linearGradient></defs>'
      + '<path d="M14 92 C10 58 52 8 130 8 C208 8 250 58 246 92 C244 101 234 104 130 104 C26 104 16 101 14 92Z" fill="url(#' + g + ')"/><path d="M18 94 C40 100 220 100 242 94 L240 100 C200 106 60 106 20 100Z" fill="url(#' + h + ')" opacity=".9"/>'
      + seeds(r, 34, function (x, y) { return Math.pow((x - 130) / 108, 2) + Math.pow((y - 96) / 84, 2) < .82; }) + '<ellipse cx="96" cy="34" rx="46" ry="14" fill="#fff" opacity=".22" transform="rotate(-14 96 34)"/>'); },
    bunBottom: function () { var g = uid('bb'), c = uid('bc'); return svg(METRICS.bunBottom, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e09a4a"/><stop offset=".6" stop-color="#c06d28"/><stop offset="1" stop-color="#8f4a18"/></linearGradient><radialGradient id="' + c + '" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#f7dfb0"/><stop offset=".8" stop-color="#e2b46e"/><stop offset="1" stop-color="#b9772f"/></radialGradient></defs>'
      + '<path d="M10 22 C10 14 30 10 130 10 C230 10 250 14 250 22 L247 40 C243 58 210 63 130 63 C50 63 17 58 13 40Z" fill="url(#' + g + ')"/><ellipse cx="130" cy="16" rx="119" ry="8" fill="url(#' + c + ')"/><path d="M30 46 C70 54 190 54 230 46" stroke="#fff" stroke-opacity=".18" stroke-width="3" fill="none"/>'); },
    patty: function () { var r = rng(11 + uidN), g = uid('pt'), d = band(r, 6, 254, 12, 38, 4.5, 3.5, 11), d2 = band(rng(3 + uidN), 2, 258, 10, 40, 6, 4, 9); var spots = ''; for (var i = 0; i < 26; i++) { var x = 16 + r() * 228, y = 15 + r() * 20; spots += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + (2 + r() * 4).toFixed(1) + '" ry="' + (1 + r() * 1.6).toFixed(1) + '" fill="' + (r() > .5 ? '#8a4a24' : '#241008') + '" opacity=".7"/>'; }
      return svg(METRICS.patty, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b3519"/><stop offset=".5" stop-color="#4a2210"/><stop offset="1" stop-color="#2c1308"/></linearGradient></defs><path d="' + d2 + '" fill="#2a1207"/><path d="' + d + '" fill="url(#' + g + ')"/>' + spots + '<path d="M24 15 C90 9 170 9 236 15" stroke="#ffd8a8" stroke-opacity=".28" stroke-width="2.4" fill="none" stroke-linecap="round"/>'); },
    chicken: function () { var r = rng(21 + uidN), g = uid('ck'), d = band(r, 4, 260, 10, 42, 6, 5, 8); var crumbs = ''; for (var i = 0; i < 46; i++) { var x = 12 + r() * 240, y = 12 + r() * 28; crumbs += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (1 + r() * 2.4).toFixed(1) + '" fill="' + (r() > .45 ? '#f7c56a' : '#b8701f') + '" opacity=".85"/>'; }
      return svg(METRICS.chicken, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b450"/><stop offset=".6" stop-color="#d48a2a"/><stop offset="1" stop-color="#a0601b"/></linearGradient></defs><path d="' + d + '" fill="url(#' + g + ')"/>' + crumbs + '<path d="M26 13 C90 7 170 7 236 13" stroke="#fff3c8" stroke-opacity=".4" stroke-width="2.4" fill="none" stroke-linecap="round"/>'); },
    veggie: function () { var r = rng(31), g = uid('vg'), d = band(r, 8, 248, 12, 36, 3, 3, 12); return svg(METRICS.veggie, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c5a2e"/><stop offset="1" stop-color="#4f3115"/></linearGradient></defs><path d="' + d + '" fill="url(#' + g + ')"/><g fill="#6e9b3a" opacity=".6"><circle cx="60" cy="22" r="2.5"/><circle cx="120" cy="26" r="2"/><circle cx="180" cy="20" r="2.4"/><circle cx="210" cy="28" r="2"/></g>'); },
    cheese: function (o) { var g = uid('ch'), base = o && o.white ? ['#fff8e6', '#f1dfb4'] : ['#ffc23d', '#f08c00']; var drips = [[40, 16, 16], [96, 12, 22], [150, 18, 13], [204, 14, 19]]; var d = 'M4 6 Q134 -1 264 6 L266 12 L262 22 Q260 30 254 22 L250 13 '; drips.slice().reverse().forEach(function (q) { var c = q[0] + 28, w = q[1], L = q[2]; d += 'L' + (c + w / 2) + ' 13 C' + (c + w / 2) + ' ' + (13 + L * .6) + ' ' + (c + w * .35) + ' ' + (13 + L) + ' ' + c + ' ' + (13 + L) + ' C' + (c - w * .35) + ' ' + (13 + L) + ' ' + (c - w / 2) + ' ' + (13 + L * .6) + ' ' + (c - w / 2) + ' 13 '; }); d += 'L16 13 Q10 26 4 18 Z';
      return svg(METRICS.cheese, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + base[0] + '"/><stop offset="1" stop-color="' + base[1] + '"/></linearGradient></defs><path d="' + d + '" fill="url(#' + g + ')"/><path d="M14 6 Q134 1 254 6" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none"/>'); },
    lettuce: function () { var g = uid('lt'), g2 = uid('lt'); var top = 'M2 18', bot = ''; for (var x = 0; x <= 280; x += 14) top += ' Q' + (x + 7) + ' ' + (x % 28 ? 8 : 14) + ' ' + (x + 14) + ' 13'; for (var x2 = 280; x2 >= 0; x2 -= 16) bot += ' Q' + (x2 - 8) + ' ' + (x2 % 32 ? 40 : 26) + ' ' + (x2 - 16) + ' ' + (x2 % 32 ? 28 : 33); var d = top + ' L280 26' + bot + ' Z';
      return svg(METRICS.lettuce, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8ec7a"/><stop offset=".5" stop-color="#86c14a"/><stop offset="1" stop-color="#4f8f26"/></linearGradient><linearGradient id="' + g2 + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e9a2c"/><stop offset="1" stop-color="#2f6514"/></linearGradient></defs><path d="' + d + '" fill="url(#' + g2 + ')" transform="translate(4 3)"/><path d="' + d + '" fill="url(#' + g + ')"/><g stroke="#eaffc4" stroke-opacity=".55" stroke-width="1.2" fill="none"><path d="M40 16 Q46 24 40 32"/><path d="M110 15 Q118 24 112 34"/><path d="M180 16 Q186 24 182 30"/><path d="M240 15 Q246 22 242 30"/></g>'); },
    tomato: function () { var g = uid('tm'), pk = ''; [[46, 15], [100, 16], [154, 15], [206, 16]].forEach(function (q) { pk += '<ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="17" ry="6" fill="#f2694a"/><g fill="#f7d47a"><ellipse cx="' + (q[0] - 7) + '" cy="' + q[1] + '" rx="2.2" ry="1.4"/><ellipse cx="' + q[0] + '" cy="' + (q[1] + 2) + '" rx="2.2" ry="1.4"/><ellipse cx="' + (q[0] + 7) + '" cy="' + (q[1] - 1) + '" rx="2.2" ry="1.4"/></g>'; });
      return svg(METRICS.tomato, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8322a"/><stop offset="1" stop-color="#9c120d"/></linearGradient></defs><path d="M8 10 Q125 0 242 10 L244 20 Q125 32 6 20Z" fill="url(#' + g + ')"/>' + pk + '<path d="M20 8 Q125 1 230 8" stroke="#fff" stroke-opacity=".4" stroke-width="2" fill="none"/>'); },
    pickles: function () { var s = ''; [[36, 12], [86, 14], [140, 11], [192, 14], [226, 12]].forEach(function (q) { s += '<ellipse cx="' + q[0] + '" cy="' + (q[1] + 3) + '" rx="30" ry="8.5" fill="#3f6b1a"/><ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="29" ry="8" fill="#8db53e" stroke="#4f7a1e" stroke-width="2.4"/><ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="15" ry="4" fill="none" stroke="#d7e9a0" stroke-width="1.5" stroke-dasharray="2 3"/>'; }); return svg(METRICS.pickles, s); },
    onion: function () { var s = ''; [[40, 10], [92, 12], [140, 9], [190, 12], [222, 10]].forEach(function (q) { s += '<ellipse cx="' + q[0] + '" cy="' + (q[1] + 2) + '" rx="28" ry="7" fill="none" stroke="#5d1a4a" stroke-width="5"/><ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="28" ry="7" fill="none" stroke="#9b3d86" stroke-width="4.5"/><ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="25" ry="5.6" fill="none" stroke="#f6e3f1" stroke-width="1.4"/>'; }); return svg(METRICS.onion, s); },
    bacon: function () { var g = uid('bc'), s = ''; [0, 1].forEach(function (k) { var y = 8 + k * 6, dx = k * 18; var d = 'M' + (8 + dx) + ' ' + y; for (var x = 8; x <= 232; x += 28) d += ' Q' + (x + 14 + dx) + ' ' + (y + (x % 56 ? -6 : 6)) + ' ' + (x + 28 + dx) + ' ' + y; s += '<path d="' + d + '" stroke="#5a1a0e" stroke-width="12" fill="none" stroke-linecap="round"/><path d="' + d + '" stroke="url(#' + g + ')" stroke-width="9" fill="none" stroke-linecap="round"/><path d="' + d + '" stroke="#f5c3a0" stroke-width="2" fill="none" stroke-dasharray="14 10" opacity=".8"/>'; });
      return svg(METRICS.bacon, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d2553b"/><stop offset="1" stop-color="#8a2614"/></linearGradient></defs>' + s); },
    jalapeno: function () { var s = ''; [30, 70, 110, 150, 190, 224].forEach(function (x, i) { var y = 9 + (i % 2) * 3; s += '<ellipse cx="' + x + '" cy="' + (y + 2) + '" rx="15" ry="6" fill="#2f5d16"/><ellipse cx="' + x + '" cy="' + y + '" rx="14" ry="5.5" fill="#5b9e2a" stroke="#2f5d16" stroke-width="2"/><ellipse cx="' + x + '" cy="' + y + '" rx="6" ry="2.3" fill="#e9f3c4"/><circle cx="' + (x - 2) + '" cy="' + y + '" r="1" fill="#fff8d0"/><circle cx="' + (x + 2) + '" cy="' + y + '" r="1" fill="#fff8d0"/>'; }); return svg(METRICS.jalapeno, s); },
    egg: function () { return svg(METRICS.egg, '<path d="M14 18 C14 6 70 4 125 6 C190 4 238 8 236 18 C238 28 200 30 125 30 C50 30 12 28 14 18Z" fill="#fffdf4" stroke="#e8dcc0" stroke-width="1.5"/><ellipse cx="128" cy="15" rx="34" ry="10" fill="#ffb21f"/><ellipse cx="120" cy="12" rx="12" ry="3.5" fill="#fff" opacity=".5"/>'); },
    friedOnion: function () { var r = rng(55), s = ''; for (var i = 0; i < 40; i++) { var x = 14 + r() * 222, y = 8 + r() * 10; s += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' q6 -' + (2 + r() * 4).toFixed(1) + ' 12 0" stroke="' + (r() > .5 ? '#c27a26' : '#8a4a12') + '" stroke-width="3" fill="none" stroke-linecap="round"/>'; } return svg(METRICS.friedOnion, s); },
    pineapple: function () { var g = uid('pa'); return svg(METRICS.pineapple, '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#e6a91a"/></linearGradient></defs><ellipse cx="125" cy="15" rx="112" ry="9" fill="url(#' + g + ')" stroke="#c88b12" stroke-width="2"/><ellipse cx="125" cy="15" rx="20" ry="3.5" fill="#d18f13"/>'); },
    camembert: function () { return DRAW.cheese({ white: true }).replace(METRICS.cheese.vbH + '"', METRICS.camembert.vbH + '"'); },
    shrimp: function () { var s = ''; [55, 125, 195].forEach(function (x) { s += '<path d="M' + (x - 30) + ' 18 C' + (x - 30) + ' 2 ' + (x + 30) + ' 2 ' + (x + 30) + ' 16 C' + (x + 22) + ' 22 ' + (x + 8) + ' 12 ' + (x - 6) + ' 22 Z" fill="#f28b5a" stroke="#c4532a" stroke-width="2"/><path d="M' + (x - 20) + ' 12 q20 -8 40 0" stroke="#ffd2b8" stroke-width="2" fill="none"/>'; }); return svg(METRICS.shrimp, s); },
    sauce: function (o) { var c = (o && o.color) || '#ef9a55', r = rng(91 + uidN), d = 'M18 10'; for (var x = 18; x < 222; x += 22) d += ' q11 ' + (r() > .5 ? 10 : -6) + ' 22 ' + ((r() - .5) * 4).toFixed(1); var drips = ''; [60, 128, 190].forEach(function (x) { var L = 6 + r() * 8; drips += '<path d="M' + x + ' 10 q2 ' + L + ' 0 ' + (L + 2) + '" stroke="' + c + '" stroke-width="5" stroke-linecap="round" fill="none"/>'; });
      return svg(METRICS.sauce, '<path class="dz" d="' + d + '" stroke="' + c + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' + drips + '<path d="' + d + '" stroke="#fff" stroke-opacity=".35" stroke-width="1.5" fill="none" transform="translate(0 -1.5)"/>'); }
  };
  function bottleSvg(color, label) { var g = uid('bo'), light = /#f[0-9a-f]{5}/i.test(color) && parseInt(color.slice(1, 3), 16) > 230; return '<svg viewBox="0 0 70 170" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="' + g + '" x1="0" x2="1"><stop offset="0" stop-color="' + color + '"/><stop offset=".35" stop-color="' + color + '" stop-opacity=".85"/><stop offset=".6" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="' + color + '"/></linearGradient></defs>'
    + '<path d="M31 2 L39 2 L42 24 L28 24Z" fill="' + (light ? '#e3261c' : '#f4f1ea') + '"/><rect x="22" y="24" width="26" height="16" rx="4" fill="' + (light ? '#e3261c' : '#f4f1ea') + '"/><path d="M14 52 Q14 40 35 40 Q56 40 56 52 L58 156 Q58 166 35 166 Q12 166 12 156Z" fill="url(#' + g + ')" stroke="rgba(0,0,0,.18)"/>'
    + '<rect x="15" y="80" width="40" height="52" rx="6" fill="#fffaf0"/><text x="35" y="100" text-anchor="middle" font-family="Titan One,Arial Black,Arial" font-weight="900" font-size="11" fill="#e3261c">FLAMO</text><text x="35" y="118" text-anchor="middle" font-family="Inter,Arial" font-weight="800" font-size="' + (label.length > 8 ? 6.5 : 8) + '" fill="#2b2522">' + label.replace(/[<&]/g, '') + '</text><path d="M18 50 Q20 120 20 150" stroke="#fff" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'; }
  function bucketSvg(kind) { var g = uid('bk'), food = '', r = rng(kind.length * 13);
    if (kind === 'rings') { [[50, 40], [88, 34], [70, 22], [100, 52], [42, 58]].forEach(function (q) { food += '<ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="22" ry="12" fill="none" stroke="#a5651d" stroke-width="10"/><ellipse cx="' + q[0] + '" cy="' + q[1] + '" rx="22" ry="12" fill="none" stroke="#e9a849" stroke-width="7" stroke-dasharray="3 2"/>'; }); }
    else if (kind === 'curly') { for (var i = 0; i < 7; i++) { var x = 30 + i * 13, y = 18 + r() * 20; food += '<path d="M' + x + ' ' + (y + 46) + ' c-12 -8 12 -14 0 -22 c-12 -8 12 -14 0 -22" stroke="#9a5a18" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M' + x + ' ' + (y + 46) + ' c-12 -8 12 -14 0 -22 c-12 -8 12 -14 0 -22" stroke="#efb04e" stroke-width="5" fill="none" stroke-linecap="round"/>'; } }
    else { for (var j = 0; j < 12; j++) { var fx = 28 + j * 8 + r() * 4, rot = (r() - .5) * 34, h = 46 + r() * 22; food += '<rect x="' + fx.toFixed(1) + '" y="' + (74 - h).toFixed(1) + '" width="9" height="' + h.toFixed(1) + '" rx="2" fill="#f5c64f" stroke="#c98d22" stroke-width="1.4" transform="rotate(' + rot.toFixed(1) + ' ' + fx.toFixed(1) + ' 74)"/>'; } }
    return '<svg viewBox="0 0 140 170" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="' + g + '" x1="0" x2="1"><stop offset="0" stop-color="#b8170f"/><stop offset=".45" stop-color="#e3261c"/><stop offset="1" stop-color="#a3140c"/></linearGradient></defs>' + food
      + '<path d="M18 70 L122 70 L108 164 Q70 170 32 164Z" fill="url(#' + g + ')"/><path d="M18 70 L122 70 L120 80 L20 80Z" fill="#8f120a"/><path d="M26 98 L114 98 L111 122 L29 122Z" fill="#fff1d6"/><text x="70" y="116" text-anchor="middle" font-family="Titan One,Arial Black,Arial" font-weight="900" font-size="17" fill="#e3261c">FLAMO</text><path d="M30 84 L38 160" stroke="#fff" stroke-opacity=".18" stroke-width="5"/></svg>'; }

  // ───────────────────────── TEXTE ─────────────────────────
  var T = {
    de: { tag: 'SMASH BURGERS. GESTAPELT VON DIR.', close: 'Schließen', make: 'Mach ihn zu deinem.', better: 'Besser zusammen.', side: 'Noch was dazu?', incl: 'inklusive', startBun: 'Fang mit dem Brötchen an, dann staple los.', stack: 'Tippen oder ziehen — alles landet auf dem Burger. Antippen entfernt.', tasty: 'Sieht lecker aus. Mehr drauf oder Deckel drauf!', topped: 'Sieht gut aus. Beilage wählen oder weiter bauen.', topIt: 'Deckel drauf ↗', undo: 'Rückgängig', head: 'EIN SEHR GESTAPELTER BURGER', removed: 'ohne', menu: 'Menü (Pommes + Getränk + Sauce)', drink: 'Getränk', msauce: 'Sauce zum Menü', choose: 'bitte wählen', total: 'GESAMT', pickup: 'Abholen', delivery: 'Lieferung (Kosten nach PLZ)', toCart: 'In den Warenkorb ↗', back: '← Weiter bauen', added: 'Im Warenkorb!', addedSub: 'Dein Burger wartet im Warenkorb.', ok: 'Zum Warenkorb', foot: 'Bilder sind Illustrationen. Echte Burger sind noch leckerer.', original: 'Original', needMenu: 'Bitte Getränk und Sauce wählen.', free: 'gratis', lock: 'Erst das Brötchen!' },
    ar: { tag: 'سماش برغر. بتركّبو إنت.', close: 'سكّر', make: 'ركّبو على ذوقك.', better: 'أطيب سوا.', side: 'بدك شي جنبو؟', incl: 'مع البرغر', startBun: 'ابدأ بالخبزة، وبعدين كدّس فوقها.', stack: 'اضغط أو اسحب، كل شي بينزل عالبرغر. اضغط على طبقة لتشيلها.', tasty: 'شكلو طيب! زيد كمان أو سكّرو بالخبزة.', topped: 'تمام! اختار شي جنبو أو كمّل تركيب.', topIt: 'سكّرو بالخبزة ↗', undo: 'تراجع', head: 'برغر مكدّس كتير', removed: 'بدون', menu: 'منيو (بطاطا + مشروب + صوص)', drink: 'المشروب', msauce: 'صوص المنيو', choose: 'اختار', total: 'المجموع', pickup: 'استلام من المحل', delivery: 'توصيل (الرسوم حسب الرمز البريدي)', toCart: 'ضيف عالسلة ↗', back: '← رجوع للتركيب', added: 'انضاف عالسلة!', addedSub: 'برغرك ناطرك بالسلة.', ok: 'روح عالسلة', foot: 'الصور توضيحية. البرغر الحقيقي أطيب.', original: 'الأصلي', needMenu: 'اختار المشروب والصوص.', free: 'ببلاش', lock: 'الخبزة أول!' },
    en: { tag: 'SMASH BURGERS. STACKED BY YOU.', close: 'Close', make: 'Make it yours.', better: 'Better together.', side: 'A little something on the side?', incl: 'included', startBun: 'Start with your bun, then stack it up.', stack: 'Tap or drag — everything lands on the burger. Tap a layer to remove it.', tasty: 'Looking tasty. Add more or top it off.', topped: 'Looking good. Pick a side or make it yours again.', topIt: 'Top it off ↗', undo: 'Undo', head: 'ONE VERY STACKED ORDER', removed: 'no', menu: 'Meal (fries + drink + sauce)', drink: 'Drink', msauce: 'Meal sauce', choose: 'please choose', total: 'TOTAL', pickup: 'Pick up', delivery: 'Delivery (fee by postcode)', toCart: 'Add to cart ↗', back: '← Back to building', added: 'In your cart!', addedSub: 'Your burger is waiting in the cart.', ok: 'Go to cart', foot: 'Pictures are illustrations. Real burgers taste even better.', original: 'Original', needMenu: 'Please choose drink and sauce.', free: 'free', lock: 'Bun first!' }
  };
  var NAMES = { lettuce: { de: 'Salat', ar: 'خس', en: 'Lettuce' }, tomato: { de: 'Tomaten', ar: 'بندورة', en: 'Tomato' }, pickles: { de: 'Gurken', ar: 'خيار مخلل', en: 'Pickles' }, onion: { de: 'Rote Zwiebeln', ar: 'بصل أحمر', en: 'Red onion' }, cheese: { de: 'Cheddar', ar: 'شيدر', en: 'Cheddar' }, patty: { de: 'Beef-Patty', ar: 'لحمة', en: 'Beef patty' }, chicken: { de: 'Chicken', ar: 'دجاج', en: 'Chicken' }, veggie: { de: 'Veggie-Patty', ar: 'برغر نباتي', en: 'Veggie patty' }, bacon: { de: 'Bacon', ar: 'بيكون', en: 'Bacon' }, jalapeno: { de: 'Jalapeños', ar: 'هالبينو', en: 'Jalapeños' }, friedOnion: { de: 'Röstzwiebeln', ar: 'بصل مقرمش', en: 'Crispy onions' }, shrimp: { de: 'Garnelen', ar: 'قريدس', en: 'Shrimps' }, bunBottom: { de: 'Brioche-Bun', ar: 'خبزة', en: 'Brioche bun' } };

  // ───────────────────────── ZUSTAND & UI ─────────────────────────
  var W = root.NARA_WEB || null, LM = null, S = null, el = null;
  function lng() { try { var l = root.lang || localStorage.getItem('lang'); return T[l] ? l : 'de'; } catch (e) { return 'de'; } }
  function t(k) { var l = lng(); return (T[l] && T[l][k]) || T.de[k] || k; }
  function eur(c) { return (Math.round(c) / 100).toFixed(2).replace('.', ',') + ' €'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var KEY2TYPE = { Salat: 'lettuce', Tomaten: 'tomato', Gurken: 'pickles', Zwiebeln: 'onion', 'Käse': 'cheese', Bacon: 'bacon', Garnelen: 'shrimp', 'Jalapeños': 'jalapeno' };
  function keyName(k) { return KEY2TYPE[k] ? nm(KEY2TYPE[k]) : k; }
  function on(n) { var x = root.ON && root.ON[n]; return x ? (x[lng()] || x.de || n) : n; }
  function nm(type, fallback) { var x = NAMES[type]; return x ? (x[lng()] || x.de) : (fallback || type); }
  function metrics(type) { var m = (LM && LM[type]) || METRICS[type]; return m || METRICS.sauce; }
  function art(layer) { var m = metrics(layer.type); if (m.src) return '<img src="' + esc(m.src) + '" alt="">'; var f = DRAW[layer.type] || DRAW.sauce; return f(layer); }
  try { fetch('builder/layers.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) { LM = {}; for (var k in j) if (j[k] && typeof j[k] === 'object') { var m = Object.assign({}, METRICS[k] || {}, j[k]); if (m.src && !/^(https?:|\/)/.test(m.src)) m.src = 'builder/' + m.src; LM[k] = m; } } }).catch(function () {}); } catch (e) {}

  function menuList() { return (W && W.menu) || root.MENU || []; }
  function byId(id) { var m = (W && W.byId) || {}; if (m[id]) return m[id]; return menuList().filter(function (p) { return p.id === id; })[0]; }
  function sideProducts() { var all = menuList().filter(function (p) { return p.s === 'sides' && !p.off; }), pick = []; [/curly|twister/i, /onion ring/i, /double fries|pommes/i, /nuggets/i].forEach(function (re) { var x = all.filter(function (p) { return re.test(p.n0 || p.n); })[0]; if (x && pick.indexOf(x) < 0 && pick.length < 3) pick.push(x); }); return pick; }
  function bucketKind(p) { var n = String((p && (p.n0 || p.n)) || ''); return /ring/i.test(n) ? 'rings' : /curly|twister/i.test(n) ? 'curly' : 'fries'; }
  function scratchProduct() { return menuList().filter(function (p) { return /build your own|selbst bauen|bau deinen/i.test(p.n0 || p.n) && !p.off; })[0] || null; }

  function open(id) {
    var p = id ? byId(+id) : scratchProduct(); if (!p) return false;
    var scratch = !id;
    S = { p: p, scratch: scratch, layers: [], history: [], extras: [], removed: [], topped: false, menu: false, drink: '', msauce: '', side: null, pickup: (root.mode === 'pickup') };
    var base = scratch ? [] : parseBase(p);
    render();
    document.body.classList.add('fb-on');
    base.forEach(function (L, i) { setTimeout(function () { if (S && S.p === p) addLayer(L, { silent: true }); }, 140 + i * 110); });
    setTimeout(hint, 160 + base.length * 110);
    return true;
  }
  function close() { if (el) el.remove(); el = null; S = null; document.body.classList.remove('fb-on'); if (/^#build/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#burger'); }

  function render() {
    if (el) el.remove();
    var p = S.p, l = lng(), ex = extrasGroup(p), base = parseBase(p);
    el = document.createElement('div'); el.id = 'fb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', p.n); el.dir = l === 'ar' ? 'rtl' : 'ltr'; if (l === 'ar') el.classList.add('rtl');
    var tubs = '';
    if (S.scratch) tubs += tub({ type: 'bunBottom', key: 'bun', base: true }, nm('bunBottom'), eur(p.p), 'bun');
    else base.filter(function (L) { return L.type !== 'bunBottom' && L.type !== 'sauce' && L.key !== 'meat'; }).forEach(function (L) { if (!tubs.includes('data-base="' + L.type + '"')) tubs += tub(L, nm(L.type, L.key), t('incl'), 'base'); });
    ex.forEach(function (x) { var L = extraLayer(x); if (L.type === 'sauce') return; tubs += tub({ type: L.type, color: L.color, optId: x.i }, on(x.n), '+' + eur(x.c || 0), 'extra'); });
    var bottles = ex.filter(function (x) { return extraLayer(x).type === 'sauce'; }).slice(0, 5).map(function (x) { var L = extraLayer(x), short = String(x.n).replace(/sauce|soße|extra|,/gi, '').trim().slice(0, 12) || 'Sauce'; return '<button type="button" class="fb-bottle" data-opt="' + esc(x.i) + '" aria-label="' + esc(x.n + ' +' + eur(x.c || 0)) + '">' + bottleSvg(L.color, short) + '<span class="bp">+' + eur(x.c || 0) + '</span></button>'; }).join('');
    var buckets = '';
    if (p.mc) buckets += '<button type="button" class="fb-bucket" data-side="menu" aria-label="' + esc(t('menu')) + '">' + bucketSvg('fries') + '<span class="fb-tape"><b>' + esc(t('menu').split(' (')[0]) + '</b>+' + eur(p.mc - p.p) + '</span></button>';
    sideProducts().forEach(function (s) { buckets += '<button type="button" class="fb-bucket" data-side="' + s.id + '" aria-label="' + esc(s.n) + '">' + bucketSvg(bucketKind(s)) + '<span class="fb-tape"><b>' + esc(String(s.n).replace(/\s*\(.*\)/, '')) + '</b>+' + eur(s.p) + '</span></button>'; });
    el.innerHTML = '<div class="fb-top"><div><div class="fb-logo">Flamo</div><div class="fb-tag">' + esc(t('tag')) + '</div></div><div class="fb-langs">' + ['de', 'ar', 'en'].map(function (x) { return '<button type="button" data-lang="' + x + '" class="' + (x === l ? 'on' : '') + '">' + x.toUpperCase() + '</button>'; }).join('') + '</div><button type="button" class="fb-close" data-x="1">✕ ' + esc(t('close')) + '</button></div>'
      + '<div class="fb-main"><div class="fb-center"><div class="fb-bottles">' + bottles + '</div><div class="fb-tray"><div class="fb-liner build"><div class="fb-zone" id="fbZone"><div class="fb-shadow"></div><div class="fb-stack" id="fbStack"></div></div>'
      + (!S.scratch && p.img ? '<div class="fb-ref"><img src="' + esc(p.img) + '" alt="">' + esc(t('original')) + '</div>' : '') + '</div><div class="fb-liner side"><div class="fb-note" id="fbNote">' + esc(t('side')) + '</div><div class="fb-bucket-spot" id="fbSide"></div></div></div></div>'
      + '<div class="fb-shelves"><div class="fb-left"><div class="fb-paper">' + esc(t('make')) + '</div><div class="fb-grid">' + tubs + '</div></div><div class="fb-right"><div class="fb-paper">' + esc(t('better')) + '</div><div class="fb-buckets">' + buckets + '</div></div></div>'
      + '<div class="fb-receipt" id="fbRcpt" aria-live="polite"></div></div>'
      + '<div class="fb-bar"><button type="button" class="fb-undo" id="fbUndo">' + esc(t('undo')) + '</button><div class="fb-hint"><span id="fbHint"></span></div><button type="button" class="fb-top-it" id="fbTop">' + esc(t('topIt')) + '</button></div><div class="fb-foot">' + esc(t('foot')) + '</div>';
    document.body.appendChild(el);
    wire(); layout(false); refresh();
  }
  function tub(L, label, price, kind) { var data = kind === 'extra' ? 'data-opt="' + esc(L.optId) + '"' : kind === 'bun' ? 'data-bun="1"' : 'data-base="' + L.type + '"'; var one = art(L); return '<button type="button" class="fb-tub" ' + data + ' aria-label="' + esc(label + ' ' + price) + '"><span class="shell"></span><span class="fill">' + one + one + art(L) + '</span><span class="gloss"></span><span class="fb-tape"><b>' + esc(label) + '</b>' + esc(price) + '</span></button>'; }

  // Stapel-Geometrie
  function geo() { var z = el && el.querySelector('#fbZone'); if (!z) return null; var w = z.clientWidth, h = z.clientHeight; return { k: Math.min(300, w * .8) / 260, h: h }; }
  function layout(animateIdx) {
    var g = geo(); if (!g) return; var st = el.querySelector('#fbStack'), top = 0;
    S.layers.forEach(function (L, i) {
      var m = metrics(L.type), w = m.vbW * g.k, h = m.vbH * g.k, bottom = top - (m.vbH - m.baseY) * g.k;
      if (!L.el) { L.el = document.createElement('div'); L.el.className = 'fb-layer'; L.el.innerHTML = art(L); L.el.dataset.i = ''; L.dx = L.type === 'bunBottom' ? 0 : (Math.random() - .5) * 10; L.rot = L.type === 'bunBottom' || L.type === 'bunTop' ? (Math.random() - .5) * 1.2 : (Math.random() - .5) * 4; st.appendChild(L.el); }
      L.el.style.cssText = 'width:' + w + 'px;height:' + h + 'px;left:' + (-w / 2 + L.dx * g.k) + 'px;bottom:' + bottom + 'px;z-index:' + (i + 1) + ';transform:rotate(' + L.rot + 'deg)';
      L.el.dataset.i = i;
      if (L.type !== 'bunTop') top = bottom + (m.vbH - m.restY) * g.k;
      if (animateIdx === i) drop(L.el, L.rot, L.type === 'sauce');
    });
    var total = top + (S.topped ? 0 : 100 * g.k), scale = Math.min(1, (g.h * .86) / Math.max(1, total + 20));
    st.style.transform = 'scale(' + scale + ')';
  }
  function drop(node, rot, sauce) {
    if (!node.animate) return;
    if (sauce) { var p = node.querySelector('.dz'); if (p && p.getTotalLength) { var len = p.getTotalLength(); p.style.strokeDasharray = len; p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 650, easing: 'ease-out' }); } node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return; }
    var r = 'rotate(' + rot + 'deg)';
    node.animate([{ transform: 'translateY(-340px) ' + r, opacity: 0, offset: 0 }, { transform: 'translateY(-300px) ' + r, opacity: 1, offset: .08 }, { transform: 'translateY(0) ' + r + ' scale(1,1)', offset: .6, easing: 'ease-out' }, { transform: 'translateY(0) ' + r + ' scale(1.07,.84)', offset: .74 }, { transform: 'translateY(-6px) ' + r + ' scale(.98,1.04)', offset: .88 }, { transform: 'translateY(0) ' + r + ' scale(1,1)', offset: 1 }], { duration: 620, easing: 'cubic-bezier(.4,.0,.6,1)' });
    var sh = el.querySelector('.fb-shadow'); if (sh && sh.animate) sh.animate([{ opacity: .4 }, { opacity: .9, offset: .6 }, { opacity: 1 }], { duration: 620 });
  }

  function hasBun() { return S.layers.some(function (L) { return L.type === 'bunBottom'; }); }
  function fillings() { return S.layers.filter(function (L) { return L.type !== 'bunBottom' && L.type !== 'bunTop'; }).length; }
  function addLayer(L, opts) {
    opts = opts || {};
    if (S.topped) untop();
    if (L.type !== 'bunBottom' && !hasBun()) { say(t('lock')); return; }
    if (L.optId) { if (S.extras.indexOf(L.optId) >= 0) { removeAt(S.layers.findIndex(function (x) { return x.optId === L.optId; })); return; } S.extras.push(L.optId); }
    if (L.base && L.key && S.removed.indexOf(L.key) >= 0 && !S.layers.some(function (x) { return x.key === L.key; })) S.removed.splice(S.removed.indexOf(L.key), 1);
    var layer = Object.assign({}, L, { el: null }); S.layers.push(layer);
    if (!opts.silent) S.history.push({ kind: 'add', layer: layer });
    layout(S.layers.length - 1); refresh();
  }
  function removeAt(i) {
    if (i < 0) return; var L = S.layers[i]; if (!L || L.type === 'bunTop') return;
    if (L.type === 'bunBottom' && S.layers.length > 1) { say(t('lock')); return; }
    S.layers.splice(i, 1);
    if (L.optId) S.extras = S.extras.filter(function (x) { return x !== L.optId; });
    if (L.base && L.key && !S.layers.some(function (x) { return x.key === L.key; }) && S.removed.indexOf(L.key) < 0) S.removed.push(L.key);
    S.history.push({ kind: 'remove', layer: L, index: i });
    fly(L.el); L.el = null; layout(false); refresh();
  }
  function fly(node) { if (!node) return; if (node.animate) { var a = node.animate([{ transform: node.style.transform, opacity: 1 }, { transform: 'translate(160px,-220px) rotate(25deg)', opacity: 0 }], { duration: 420, easing: 'ease-in' }); a.onfinish = function () { node.remove(); }; } else node.remove(); }
  function undo() {
    var h = S.history.pop(); if (!h) return;
    if (h.kind === 'add') { var i = S.layers.indexOf(h.layer); if (i >= 0) { S.layers.splice(i, 1); fly(h.layer.el); h.layer.el = null; if (h.layer.optId) S.extras = S.extras.filter(function (x) { return x !== h.layer.optId; }); } }
    else if (h.kind === 'remove') { var L = Object.assign({}, h.layer, { el: null }); S.layers.splice(Math.min(h.index, S.layers.length), 0, L); if (L.optId && S.extras.indexOf(L.optId) < 0) S.extras.push(L.optId); if (L.key) S.removed = S.removed.filter(function (k) { return k !== L.key; }); layout(h.index); }
    else if (h.kind === 'top') { untop(true); }
    else if (h.kind === 'side') { S.side = h.prev.side; S.menu = h.prev.menu; drawSide(); }
    layout(false); refresh();
  }
  function topIt() {
    if (S.topped || !fillings()) return;
    S.topped = true; var L = { type: 'bunTop', el: null }; S.layers.push(L); S.history.push({ kind: 'top' });
    layout(S.layers.length - 1);
    setTimeout(function () { var r = el && el.querySelector('#fbRcpt'); if (r) { drawReceipt(); r.classList.add('open'); } }, 520);
    refresh();
  }
  function untop(fromUndo) {
    if (!S.topped) return; S.topped = false;
    var i = S.layers.findIndex(function (x) { return x.type === 'bunTop'; }); if (i >= 0) { fly(S.layers[i].el); S.layers.splice(i, 1); }
    if (!fromUndo) S.history = S.history.filter(function (h) { return h.kind !== 'top'; });
    var r = el && el.querySelector('#fbRcpt'); if (r) r.classList.remove('open');
    layout(false); refresh();
  }
  function setSide(v) {
    var prev = { side: S.side, menu: S.menu };
    if (v === 'menu') { S.menu = !S.menu; S.side = null; } else { var id = +v; S.side = S.side === id ? null : id; S.menu = false; }
    S.history.push({ kind: 'side', prev: prev }); drawSide(true); refresh(); if (S.topped) drawReceipt();
  }
  function drawSide(anim) {
    var spot = el.querySelector('#fbSide'), note = el.querySelector('#fbNote'), kind = S.menu ? 'fries' : S.side ? bucketKind(byId(S.side)) : null;
    note.hidden = !!kind; spot.innerHTML = kind ? bucketSvg(kind) : '';
    if (kind && anim && spot.firstChild && spot.firstChild.animate) spot.firstChild.animate([{ transform: 'translateY(-260px) rotate(-8deg)', opacity: 0 }, { transform: 'translateY(0) rotate(0)', opacity: 1, offset: .65 }, { transform: 'scale(1.05,.92)', offset: .8 }, { transform: 'none' }], { duration: 600, easing: 'ease-out' });
    el.querySelectorAll('.fb-bucket').forEach(function (b) { b.classList.toggle('on', (b.dataset.side === 'menu' && S.menu) || +b.dataset.side === S.side); });
  }
  function refresh() {
    if (!el) return; var bun = hasBun();
    el.querySelectorAll('.fb-tub').forEach(function (b) {
      var locked = !bun && !b.dataset.bun; b.classList.toggle('locked', locked); b.classList.toggle('glow', !!b.dataset.bun && !bun);
      var on = b.dataset.opt ? S.extras.indexOf(b.dataset.opt) >= 0 : b.dataset.bun ? bun : S.layers.some(function (L) { return L.type === b.dataset.base && L.base; });
      b.classList.toggle('on', on); var c = b.querySelector('.chk'); if (on && !c) b.insertAdjacentHTML('beforeend', '<span class="chk">✓</span>'); if (!on && c) c.remove();
    });
    el.querySelectorAll('.fb-bottle').forEach(function (b) { b.style.opacity = bun ? '' : '.5'; });
    el.querySelector('#fbTop').disabled = !fillings() || S.topped;
    el.querySelector('#fbUndo').disabled = !S.history.length;
    hint();
  }
  var lastHint = '';
  function hint() { if (!el || !S) return; var k = !hasBun() ? 'startBun' : S.topped ? 'topped' : fillings() > (S.scratch ? 0 : 99) || S.history.length ? 'tasty' : 'stack'; say(t(k), true); }
  function say(txt, quiet) { var h = el && el.querySelector('#fbHint'); if (!h) return; if (h.textContent !== txt) { h.textContent = txt; if (!quiet || lastHint) { h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); } lastHint = txt; } }

  function drawReceipt() {
    var p = S.p, r = el.querySelector('#fbRcpt'), line = buildLine(p, S), ex = extrasGroup(p), rows = '', counts = {};
    rows += '<div class="ln"><span>' + esc(p.n) + (S.menu && p.mc ? ' (' + esc(t('menu').split(' (')[0]) + ')' : '') + '</span><span class="num">' + eur(S.menu && p.mc ? p.mc : p.p) + '</span></div>';
    S.extras.forEach(function (id) { var x = ex.filter(function (y) { return y.i === id; })[0]; if (x) counts[x.n] = (counts[x.n] || 0) + (x.c || 0); });
    Object.keys(counts).forEach(function (n) { rows += '<div class="ln sm"><span>+ ' + esc(on(n)) + '</span><span class="num">' + eur(counts[n]) + '</span></div>'; });
    S.removed.filter(function (k) { return k !== 'bun' && k !== 'meat'; }).forEach(function (k) { rows += '<div class="ln sm"><span>− ' + esc(t('removed')) + ' ' + esc(keyName(k)) + '</span><span></span></div>'; });
    if (S.menu && p.mc) {
      ['__drink', '__sauce'].forEach(function (gn) { var g = group(p, gn); if (!g) return; var cur = gn === '__drink' ? S.drink : S.msauce; rows += '<div class="ln sm"><span>' + esc(t(gn === '__drink' ? 'drink' : 'msauce')) + '</span></div><select data-ms="' + gn + '"><option value="">— ' + esc(t('choose')) + ' —</option>' + g.x.map(function (x) { return '<option value="' + esc(x.i) + '"' + (x.i === cur ? ' selected' : '') + '>' + esc(on(x.n)) + (x.c ? ' (+' + eur(x.c) + ')' : '') + '</option>'; }).join('') + '</select>'; });
    }
    var sideP = S.side ? byId(S.side) : null, total = line.u + (sideP ? sideP.p : 0);
    if (sideP) rows += '<div class="ln"><span>' + esc(sideP.n) + '</span><span class="num">' + eur(sideP.p) + '</span></div>';
    var ready = menuReady(p, S);
    r.innerHTML = '<h3>FLAMO</h3><div class="sub">' + esc(t('head')) + '</div>' + rows + '<div class="dash"></div><div class="tot"><span>' + esc(t('total')) + '</span><span class="num">' + eur(total) + '</span></div>'
      + '<label><input type="radio" name="fbm" value="pickup"' + (S.pickup ? ' checked' : '') + '> ' + esc(t('pickup')) + '</label><label><input type="radio" name="fbm" value="delivery"' + (S.pickup ? '' : ' checked') + '> ' + esc(t('delivery')) + '</label>'
      + (ready ? '' : '<div class="warn">' + esc(t('needMenu')) + '</div>') + '<button type="button" class="go" id="fbGo"' + (ready ? '' : ' disabled') + '>' + esc(t('toCart')) + '</button><button type="button" class="back" id="fbBack">' + esc(t('back')) + '</button>';
    r.querySelectorAll('[data-ms]').forEach(function (s) { s.onchange = function () { if (s.dataset.ms === '__drink') S.drink = s.value; else S.msauce = s.value; drawReceipt(); }; });
    r.querySelectorAll('input[name=fbm]').forEach(function (x) { x.onchange = function () { S.pickup = x.value === 'pickup'; }; });
    r.querySelector('#fbBack').onclick = function () { untop(); };
    r.querySelector('#fbGo').onclick = checkout;
  }
  function checkout() {
    var p = S.p; if (!menuReady(p, S)) return;
    var line = buildLine(p, S), lines = [line]; if (S.side) { var sp = byId(S.side); if (sp) lines.push({ id: sp.id, q: 1, m: 0, o: [], nt: '', u: sp.p }); }
    var ok = false;
    try { if (root.mode !== undefined) root.mode = S.pickup ? 'pickup' : 'delivery'; } catch (e) {}
    if (W && W.addLines) { ok = W.addLines(lines) > 0; }
    var d = document.createElement('div'); d.className = 'fb-done'; d.innerHTML = '<div><svg width="70" height="70" viewBox="0 0 70 70" aria-hidden="true"><circle cx="35" cy="35" r="32" fill="#16884a"/><path d="M20 36 l10 10 l20 -22" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>' + esc(t('added')) + '</h2><p>' + esc(t('addedSub')) + '</p><button type="button">' + esc(t('ok')) + ' →</button></div>';
    el.appendChild(d);
    d.querySelector('button').onclick = function () { close(); if (ok && W && W.openCart) W.openCart(); };
  }

  // Eingaben: Klick, Ziehen (Pointer), Tastatur
  function wire() {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x],[data-lang],#fbUndo,#fbTop'); if (!b) return;
      if (b.dataset.x) close(); else if (b.dataset.lang) { try { localStorage.setItem('lang', b.dataset.lang); root.lang = b.dataset.lang; } catch (er) {} var keep = S; keep.layers.forEach(function (L) { L.el = null; }); render(); drawSide(false); if (keep.topped) { drawReceipt(); el.querySelector('#fbRcpt').classList.add('open'); } }
      else if (b.id === 'fbUndo') undo(); else if (b.id === 'fbTop') topIt();
    });
    el.querySelector('#fbStack').addEventListener('click', function (e) { var n = e.target.closest('.fb-layer'); if (n) removeAt(+n.dataset.i); });
    var drag = null;
    el.addEventListener('pointerdown', function (e) { var s = e.target.closest('.fb-tub,.fb-bucket,.fb-bottle'); if (!s || e.button > 0) return; drag = { s: s, x: e.clientX, y: e.clientY, on: false, id: e.pointerId }; });
    el.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on && Math.hypot(dx, dy) > 10 && (Math.abs(dy) > Math.abs(dx) || !matchMedia('(max-width:860px)').matches)) { drag.on = true; drag.g = document.createElement('div'); drag.g.className = 'fb-ghost'; var f = drag.s.querySelector('.fill > :first-child, svg'); drag.g.innerHTML = f ? f.outerHTML : ''; el.appendChild(drag.g); try { drag.s.setPointerCapture(e.pointerId); } catch (er) {} }
      if (drag.on) { drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; e.preventDefault(); }
    });
    function end(e, cancel) {
      if (!drag || e.pointerId !== drag.id) return; var d = drag; drag = null;
      if (!d.on) { if (!cancel) activate(d.s); return; }
      var tray = el.querySelector('.fb-tray').getBoundingClientRect(), inTray = e.clientX > tray.left && e.clientX < tray.right && e.clientY > tray.top - 60 && e.clientY < tray.bottom;
      if (d.g) d.g.remove(); if (inTray && !cancel) activate(d.s);
    }
    el.addEventListener('pointerup', function (e) { end(e, false); });
    el.addEventListener('pointercancel', function (e) { end(e, true); });
    el.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.fb-tub,.fb-bucket,.fb-bottle')) { e.preventDefault(); activate(e.target.closest('.fb-tub,.fb-bucket,.fb-bottle')); }
      if (e.key === 'Escape') close(); if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    });
    var rz; root.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (el && S) layout(false); }, 120); });
  }
  function activate(s) {
    if (!S) return;
    if (s.classList.contains('fb-bucket')) return setSide(s.dataset.side);
    if (s.classList.contains('fb-bottle')) { if (!hasBun()) { say(t('lock')); return; } s.classList.remove('squeeze'); void s.offsetWidth; s.classList.add('squeeze'); }
    if (s.dataset.bun) { if (!hasBun()) addLayer({ type: 'bunBottom', base: true, key: 'bun' }); return; }
    if (s.dataset.opt) { var x = extrasGroup(S.p).filter(function (y) { return y.i === s.dataset.opt; })[0]; if (!x) return; var L = extraLayer(x); return addLayer({ type: L.type, color: L.color, optId: x.i }); }
    if (s.dataset.base) { var b = parseBase(S.p).filter(function (L) { return L.type === s.dataset.base; })[0]; if (!b) return; var idx = S.layers.findIndex(function (L) { return L.base && L.type === b.type; }); if (idx >= 0) removeAt(idx); else addLayer(b); }
  }

  // Einbindung in die Kundenseite
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-build]'); if (!b) return; e.preventDefault(); e.stopPropagation(); if (open(+b.dataset.build)) { try { history.pushState(null, '', '#build-' + b.dataset.build); } catch (er) {} } }, true);
  function fromHash() { var m = /^#build-(\d+)$/.exec(location.hash); if (m && !el) open(+m[1]); else if (!m && el) close(); }
  root.addEventListener('hashchange', fromHash); setTimeout(fromHash, 300);
  root.FlamoBuilder = { open: open, close: close, core: CORE };
})(typeof window !== 'undefined' ? window : globalThis);
