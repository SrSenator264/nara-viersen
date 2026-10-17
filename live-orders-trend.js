'use strict';
/* Live Orders: Umsatz-Vergleich (Woche/Monat/Wochentag) + Vorschlag. Nur für OWNER/MANAGER.
   Daten: /api/reports/sales-ledger (summary.byDay, Geschäftstag ab 05:00). Rechenlogik rein & testbar (compute). */
(function (root) {
  const D = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const S = ms => new Date(ms).toISOString().slice(0, 10);
  const DAY = 86400000;
  const add = (s, n) => S(D(s) + n * DAY);
  const dow = s => (new Date(D(s)).getUTCDay() + 6) % 7; // Montag=0
  const pct = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 1000) / 10 : null);

  function val(r, key) { return key && key !== 'ALL' ? Number(r.byPlat && r.byPlat[key] && r.byPlat[key].cents) || 0 : Number(r.totalCents) || 0; }
  function keys(byDay) { const k = {}; for (const r of byDay || []) for (const p of Object.keys(r.byPlat || {})) k[p] = (k[p] || 0) + (r.byPlat[p].cents || 0); return Object.keys(k).sort((a, b) => k[b] - k[a]); }

  function compute(byDay, today, key) {
    const m = {}; for (const r of byDay || []) m[r.day] = (m[r.day] || 0) + val(r, key);
    const sum = (a, b) => { let s = 0, has = false; for (let t = D(a); t <= D(b); t += DAY) { const v = m[S(t)]; if (v) { s += v; has = true; } } return { s, has }; };
    const out = {};
    // 1) heute (läuft noch) vs. gleicher Wochentag letzte Woche (ganzer Tag)
    const cur = m[today] || 0, lw = add(today, -7), prev = m[lw] || 0;
    // Schnitt der letzten 4 gleichen Wochentage (nur Tage mit Umsatz)
    const same = [1, 2, 3, 4].map(i => m[add(today, -7 * i)] || 0).filter(v => v > 0);
    const avg = same.length ? Math.round(same.reduce((a, b) => a + b, 0) / same.length) : 0;
    out.day = { cur, prev, pct: pct(cur, prev), prevDate: lw, avg, remaining: Math.max(0, avg - cur), above: avg > 0 && cur >= avg };
    // 2) Woche: Montag..gestern (abgeschlossene Tage) vs. Vorwoche gleiche Tage
    const yest = add(today, -1), mon = add(today, -dow(today));
    if (D(yest) >= D(mon)) { const a = sum(mon, yest), off = (D(yest) - D(mon)) / DAY, pm = add(mon, -7), b = sum(pm, add(pm, off)); out.week = { cur: a.s, prev: b.s, pct: pct(a.s, b.s), days: off + 1 }; } else out.week = null;
    // 3) Monat: 1..gestern vs. Vormonat 1..gleicher Tag (begrenzt auf Monatslänge)
    const dd = Number(today.slice(8, 10));
    if (dd > 1) {
      const first = today.slice(0, 8) + '01', y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
      const py = mo === 1 ? y - 1 : y, pmn = mo === 1 ? 12 : mo - 1, pdim = new Date(Date.UTC(py, pmn, 0)).getUTCDate();
      const pf = `${py}-${String(pmn).padStart(2, '0')}-01`, pl = `${py}-${String(pmn).padStart(2, '0')}-${String(Math.min(dd - 1, pdim)).padStart(2, '0')}`;
      const a = sum(first, yest), b = sum(pf, pl); out.month = { cur: a.s, prev: b.s, pct: pct(a.s, b.s), days: dd - 1 };
    } else out.month = null;
    // 4) stärkster Wochentag der letzten 4 Wochen (28 Tage bis gestern)
    const byW = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 1; i <= 28; i++) { const d = add(today, -i), v = m[d] || 0; if (v > 0) { byW[dow(d)] += v; cnt[dow(d)]++; } }
    let best = -1, bv = 0; for (let w = 0; w < 7; w++) if (cnt[w] && byW[w] / cnt[w] > bv) { bv = byW[w] / cnt[w]; best = w; }
    out.best = best >= 0 ? { dow: best, avg: Math.round(bv) } : null;
    out.dow = dow(today);
    return out;
  }


  // Zeitraum-Auswertung (rein): Summe, Anzahl, Ø, je Plattform, je Tag
  function rangeStats(byDay, from, to) {
    const out = { from, to, cents: 0, count: 0, avg: 0, plats: {}, days: [] };
    for (const r of byDay || []) {
      if (r.day < from || r.day > to) continue;
      const c = Number(r.totalCents) || 0, n = Number(r.count) || 0;
      out.cents += c; out.count += n; out.days.push({ day: r.day, cents: c, count: n });
      for (const [k, v] of Object.entries(r.byPlat || {})) { const e = (out.plats[k] ||= { cents: 0, count: 0 }); e.cents += v.cents || 0; e.count += v.count || 0; }
    }
    out.avg = out.count ? Math.round(out.cents / out.count) : 0;
    return out;
  }
  // vorherige Periode gleicher Länge direkt vor "from"
  function prevRange(from, to) { const n = (D(to) - D(from)) / DAY + 1; return { from: add(from, -n), to: add(from, -1), days: n }; }
  function presets(today) {
    const dw = dow(today), mon = add(today, -dw), mf = today.slice(0, 8) + '01', y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
    const py = mo === 1 ? y - 1 : y, pm = mo === 1 ? 12 : mo - 1, p2 = n => String(n).padStart(2, '0');
    return { today: [today, today], yesterday: [add(today, -1), add(today, -1)], week: [mon, today], lastweek: [add(mon, -7), add(mon, -1)], month: [mf, today], lastmonth: [`${py}-${p2(pm)}-01`, add(mf, -1)] };
  }
  const PN = { ALL: null, LIEFERANDO: 'Lieferando', UBER_EATS: 'Uber Eats', WOLT: 'Wolt', LANCH: 'Lanch', KASSE: 'Kasse', WEBSITE: 'Website', OTHER: 'Andere' };

  const L = {
    de: { title: 'Umsatzvergleich', day: 'Heute vs. letzter', week: 'Woche (bis gestern)', month: 'Monat (bis gestern)', prev: 'davor', src: 'laut Verkaufsjournal', wd: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
      sAvg: (d, avg, rem) => `${d} im Schnitt ${avg}. Noch ${rem} bis zum Schnitt.`, sAbove: (d, avg) => `Heute schon über dem ${d}-Schnitt (${avg}).`, sBest: (d, avg) => `Stärkster Tag der letzten 4 Wochen: ${d} (Ø ${avg}).`, none: '—', all: 'Alle', rng: 'Zeitraum', from: 'Von', to: 'Bis', orders: 'Bestellungen', avg: 'Ø Bestellung', plat: 'Plattform', perDay: 'Pro Tag', cmp: 'Mit vorherigem Zeitraum vergleichen', prevL: 'Vorher', close: 'Schließen', go: 'Anzeigen', max: 'Maximal 366 Tage', presets: { today: 'Heute', yesterday: 'Gestern', week: 'Diese Woche', lastweek: 'Letzte Woche', month: 'Dieser Monat', lastmonth: 'Letzter Monat' } },
    ar: { title: 'مقارنة المبيعات', day: 'اليوم مقابل نفس اليوم الماضي', week: 'الأسبوع (حتى أمس)', month: 'الشهر (حتى أمس)', prev: 'قبل', src: 'حسب سجل المبيعات', wd: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
      sAvg: (d, avg, rem) => `${d} بالمتوسط ${avg}. باقي ${rem} للوصول للمتوسط.`, sAbove: (d, avg) => `اليوم تجاوزت متوسط ${d} (${avg}).`, sBest: (d, avg) => `أقوى يوم بآخر 4 أسابيع: ${d} (بالمتوسط ${avg}).`, none: '—', all: 'الكل', rng: 'مبيعات بفترة', from: 'من', to: 'إلى', orders: 'الطلبات', avg: 'متوسط الطلب', plat: 'المنصة', perDay: 'لكل يوم', cmp: 'قارن مع الفترة السابقة', prevL: 'قبل', close: 'إغلاق', go: 'عرض', max: 'الحد الأقصى 366 يوم', presets: { today: 'اليوم', yesterday: 'أمس', week: 'هالأسبوع', lastweek: 'الأسبوع الماضي', month: 'هالشهر', lastmonth: 'الشهر الماضي' } },
    en: { title: 'Sales comparison', day: 'Today vs. same weekday last week', week: 'Week (until yesterday)', month: 'Month (until yesterday)', prev: 'before', src: 'per sales ledger', wd: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      sAvg: (d, avg, rem) => `${d} averages ${avg}. ${rem} to go to reach the average.`, sAbove: (d, avg) => `Already above the ${d} average (${avg}) today.`, sBest: (d, avg) => `Strongest day in the last 4 weeks: ${d} (avg ${avg}).`, none: '—', all: 'All', rng: 'Sales by period', from: 'From', to: 'To', orders: 'Orders', avg: 'Avg. order', plat: 'Platform', perDay: 'Per day', cmp: 'Compare with previous period', prevL: 'Before', close: 'Close', go: 'Show', max: 'Max. 366 days', presets: { today: 'Today', yesterday: 'Yesterday', week: 'This week', lastweek: 'Last week', month: 'This month', lastmonth: 'Last month' } }
  };
  const eur = c => (Number(c || 0) / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  function row(label, o, T) {
    if (!o) return `<div class="nt-r"><span>${label}</span><b>${T.none}</b></div>`;
    const p = o.pct, cls = p == null ? '' : p >= 0 ? 'up' : 'dn', ptxt = p == null ? T.none : (p >= 0 ? '▲ +' : '▼ ') + String(p).replace('.', ',') + '%';
    return `<div class="nt-r"><span>${label}</span><b>${eur(o.cur)}</b><i>${T.prev} ${eur(o.prev)}</i><em class="${cls}">${ptxt}</em></div>`;
  }

  const fd = d => d.split('-').reverse().join('.');
  function rangeHtml(a, b, T) {
    const dl = (c, p) => { const v = pct(c, p); return v == null ? T.none : (v >= 0 ? '▲ +' : '▼ ') + String(v).replace('.', ',') + '%'; };
    const line = (l, c, pc) => `<tr><td>${l}</td><td>${c}</td>${b ? `<td>${pc}</td>` : ''}</tr>`;
    let h = `<table class="nr-t"><tr><th></th><th>${fd(a.from)} – ${fd(a.to)}</th>${b ? `<th>${T.prevL} ${fd(b.from)} – ${fd(b.to)}</th>` : ''}</tr>`
      + line(T.title, `<b>${eur(a.cents)}</b>${b ? ' ' + dl(a.cents, b.cents) : ''}`, b ? eur(b.cents) : '')
      + line(T.orders, a.count, b ? b.count : '') + line(T.avg, eur(a.avg), b ? eur(b.avg) : '') + '</table>';
    const ks = Object.keys(Object.assign({}, a.plats, b ? b.plats : {})).sort((x, y) => ((a.plats[y] || {}).cents || 0) - ((a.plats[x] || {}).cents || 0));
    if (ks.length) h += `<h4>${T.plat}</h4><table class="nr-t">` + ks.map(k => { const e = a.plats[k] || { cents: 0, count: 0 }, q = b && b.plats[k]; return `<tr><td>${PN[k] || k}</td><td>${e.count}</td><td><b>${eur(e.cents)}</b> ${a.cents ? '(' + Math.round(e.cents / a.cents * 100) + '%)' : ''}</td>${b ? `<td>${q ? eur(q.cents) : T.none} ${q ? dl(e.cents, q.cents) : ''}</td>` : ''}</tr>`; }).join('') + '</table>';
    if (a.days.length) h += `<h4>${T.perDay}</h4><table class="nr-t">` + a.days.map(d => `<tr><td>${fd(d.day)}</td><td>${d.count}</td><td><b>${eur(d.cents)}</b></td></tr>`).join('') + '</table>';
    return h;
  }

  function html(c, T, tabs, cur) {
    const wd = T.wd[c.dow];
    let tip = '';
    if (c.day.avg > 0) tip = c.day.above ? T.sAbove(wd, eur(c.day.avg)) : T.sAvg(wd, eur(c.day.avg), eur(c.day.remaining));
    else if (c.best) tip = T.sBest(T.wd[c.best.dow], eur(c.best.avg));
    const tb = (tabs && tabs.length > 1) ? `<div class="nt-tabs">${tabs.map(k => `<button type="button" data-k="${k}" class="${k === (cur || 'ALL') ? 'on' : ''}">${k === 'ALL' ? T.all : (PN[k] || k)}</button>`).join('')}</div>` : '';
    return `<div class="nt-h"><b>📈 ${T.title}</b><span><button type="button" class="nt-rng">📅 ${T.rng}</button> <small>${T.src}</small></span></div>${tb}` + row(T.day, c.day, T) + row(T.week, c.week, T) + row(T.month, c.month, T) + (tip ? `<div class="nt-tip">💡 ${tip}</div>` : '');
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { compute, html, L, add, dow, keys, rangeStats, prevRange, presets, rangeHtml }; return; }

  // ───── Browser ─────
  const lang = (root.NARA_LANG && root.NARA_LANG.get && root.NARA_LANG.get()) || 'de', T = L[lang] || L.de;
  const css = document.createElement('style');
  css.textContent = '#nara-trend{margin:0 0 12px;padding:10px 14px;background:#fff;border:1px solid #e5e1da;border-radius:12px;font-size:.92rem;display:none}#nara-trend .nt-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}#nara-trend small{color:#8a857c}#nara-trend .nt-r{display:grid;grid-template-columns:minmax(150px,1.6fr) 1fr 1.2fr .8fr;gap:8px;padding:3px 0;border-top:1px dotted #e5e1da}#nara-trend .nt-r b{font-weight:800}#nara-trend .nt-r i{color:#8a857c;font-style:normal}#nara-trend em{font-style:normal;font-weight:800}#nara-trend em.up{color:#16a34a}#nara-trend em.dn{color:#dc2626}#nara-trend .nt-tip{margin-top:6px;padding:6px 10px;background:#fff7e6;border-radius:8px;font-weight:600}@media(max-width:700px){#nara-trend .nt-r{grid-template-columns:1fr 1fr}}';
  document.head.appendChild(css);
  css.textContent += '#nara-trend .nt-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 6px}#nara-trend .nt-tabs button,#nara-trend .nt-rng{border:1px solid #e5e1da;background:#faf8f4;border-radius:999px;padding:3px 12px;font:inherit;font-size:.82rem;cursor:pointer}#nara-trend .nt-tabs button.on{background:#1d2327;color:#fff;border-color:#1d2327}#nara-rng{position:fixed;inset:0;background:#0008;z-index:99999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px}#nara-rng .nr-b{background:#fff;border-radius:16px;max-width:760px;width:100%;padding:18px 20px;font-size:.92rem}#nara-rng .nr-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}#nara-rng .nr-f{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:8px}#nara-rng label{display:flex;flex-direction:column;font-size:.8rem;color:#8a857c}#nara-rng input[type=date]{font:inherit;padding:5px}#nara-rng button{font:inherit;border:1px solid #e5e1da;background:#faf8f4;border-radius:999px;padding:4px 12px;cursor:pointer}#nara-rng .go{background:#1d2327;color:#fff}#nara-rng .nr-t{width:100%;border-collapse:collapse;margin:4px 0 8px}#nara-rng .nr-t td,#nara-rng .nr-t th{padding:4px 6px;border-top:1px dotted #e5e1da;text-align:start}#nara-rng h4{margin:10px 0 2px}';
  let box = null, last = 0, busy = false, allowed = null, key = 'ALL', cache = null;
  const bizToday = () => { const d = new Date(Date.now() - 5 * 3600000), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const ledger = async (from, to) => { const r = await fetch(`/api/reports/sales-ledger?from=${from}&to=${to}`, { cache: 'no-store' }); if (!r.ok) throw Error(r.status); const j = await r.json(); return (j.summary && j.summary.byDay) || []; };
  function draw() {
    if (!cache || !box) return;
    const ks = keys(cache.byDay); if (key !== 'ALL' && ks.indexOf(key) < 0) key = 'ALL';
    box.innerHTML = html(compute(cache.byDay, cache.today, key), T, ['ALL'].concat(ks), key); box.style.display = 'block';
    box.querySelectorAll('.nt-tabs button').forEach(b => b.onclick = () => { key = b.dataset.k; draw(); });
    box.querySelector('.nt-rng').onclick = openRange;
  }
  function openRange() {
    const today = bizToday(), P = presets(today), o = document.createElement('div'); o.id = 'nara-rng';
    o.innerHTML = `<div class="nr-b"><div class="nr-top"><b>📅 ${T.rng}</b><button type="button" class="nr-x">✕ ${T.close}</button></div><div class="nr-f">` + Object.keys(P).map(k => `<button type="button" data-p="${k}">${T.presets[k]}</button>`).join('') + `</div><div class="nr-f"><label>${T.from}<input type="date" class="nr-a" value="${P.month[0]}"></label><label>${T.to}<input type="date" class="nr-z" value="${today}"></label><label style="flex-direction:row;align-items:center;gap:6px;color:inherit"><input type="checkbox" class="nr-c"> ${T.cmp}</label><button type="button" class="go">${T.go}</button></div><div class="nr-o"></div></div>`;
    document.body.appendChild(o);
    const A = o.querySelector('.nr-a'), Z = o.querySelector('.nr-z'), C = o.querySelector('.nr-c'), O = o.querySelector('.nr-o');
    const run = async () => {
      const f = A.value, t = Z.value;
      if (!f || !t || f > t) return; if ((D(t) - D(f)) / DAY > 365) { O.textContent = T.max; return; }
      try {
        const a = rangeStats(await ledger(f, t), f, t); let b = null;
        if (C.checked) { const pr = prevRange(f, t); b = rangeStats(await ledger(pr.from, pr.to), pr.from, pr.to); }
        O.innerHTML = rangeHtml(a, b, T);
      } catch (e) { O.textContent = '⚠ ' + e.message; }
    };
    o.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { A.value = P[b.dataset.p][0]; Z.value = P[b.dataset.p][1]; run(); });
    o.querySelector('.go').onclick = run; C.onchange = run;
    o.querySelector('.nr-x').onclick = () => o.remove(); o.onclick = e => { if (e.target === o) o.remove(); };
    run();
  }
  async function refresh(force) {
    if (busy || (!force && Date.now() - last < 15000)) return;
    busy = true;
    try {
      if (allowed === null) { const r = await fetch('/api/auth/me', { cache: 'no-store' }); const j = r.ok ? await r.json() : null; allowed = !!j && ['OWNER', 'MANAGER'].includes(((j.user || j) || {}).role); }
      if (!allowed) return;
      const today = bizToday(); cache = { today, byDay: await ledger(add(today, -35), today) };
      if (!box) { box = document.createElement('div'); box.id = 'nara-trend'; const st = document.getElementById('stats'); st.parentNode.insertBefore(box, st.nextSibling); }
      last = Date.now(); draw();
    } catch (e) { /* still: Vergleich ist optional */ } finally { busy = false; }
  }
  const start = () => { refresh(true); setInterval(() => refresh(true), 60000); const st = document.getElementById('stats'); if (st) new MutationObserver(() => refresh(false)).observe(st, { childList: true, subtree: true, characterData: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})(typeof window !== 'undefined' ? window : globalThis);
