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

  function compute(byDay, today) {
    const m = {}; for (const r of byDay || []) m[r.day] = (m[r.day] || 0) + (Number(r.totalCents) || 0);
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

  const L = {
    de: { title: 'Umsatzvergleich', day: 'Heute vs. letzter', week: 'Woche (bis gestern)', month: 'Monat (bis gestern)', prev: 'davor', src: 'laut Verkaufsjournal', wd: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
      sAvg: (d, avg, rem) => `${d} im Schnitt ${avg}. Noch ${rem} bis zum Schnitt.`, sAbove: (d, avg) => `Heute schon über dem ${d}-Schnitt (${avg}).`, sBest: (d, avg) => `Stärkster Tag der letzten 4 Wochen: ${d} (Ø ${avg}).`, none: '—' },
    ar: { title: 'مقارنة المبيعات', day: 'اليوم مقابل نفس اليوم الماضي', week: 'الأسبوع (حتى أمس)', month: 'الشهر (حتى أمس)', prev: 'قبل', src: 'حسب سجل المبيعات', wd: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
      sAvg: (d, avg, rem) => `${d} بالمتوسط ${avg}. باقي ${rem} للوصول للمتوسط.`, sAbove: (d, avg) => `اليوم تجاوزت متوسط ${d} (${avg}).`, sBest: (d, avg) => `أقوى يوم بآخر 4 أسابيع: ${d} (بالمتوسط ${avg}).`, none: '—' },
    en: { title: 'Sales comparison', day: 'Today vs. same weekday last week', week: 'Week (until yesterday)', month: 'Month (until yesterday)', prev: 'before', src: 'per sales ledger', wd: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      sAvg: (d, avg, rem) => `${d} averages ${avg}. ${rem} to go to reach the average.`, sAbove: (d, avg) => `Already above the ${d} average (${avg}) today.`, sBest: (d, avg) => `Strongest day in the last 4 weeks: ${d} (avg ${avg}).`, none: '—' }
  };
  const eur = c => (Number(c || 0) / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  function row(label, o, T) {
    if (!o) return `<div class="nt-r"><span>${label}</span><b>${T.none}</b></div>`;
    const p = o.pct, cls = p == null ? '' : p >= 0 ? 'up' : 'dn', ptxt = p == null ? T.none : (p >= 0 ? '▲ +' : '▼ ') + String(p).replace('.', ',') + '%';
    return `<div class="nt-r"><span>${label}</span><b>${eur(o.cur)}</b><i>${T.prev} ${eur(o.prev)}</i><em class="${cls}">${ptxt}</em></div>`;
  }
  function html(c, T) {
    const wd = T.wd[c.dow];
    let tip = '';
    if (c.day.avg > 0) tip = c.day.above ? T.sAbove(wd, eur(c.day.avg)) : T.sAvg(wd, eur(c.day.avg), eur(c.day.remaining));
    else if (c.best) tip = T.sBest(T.wd[c.best.dow], eur(c.best.avg));
    return `<div class="nt-h"><b>📈 ${T.title}</b><small>${T.src}</small></div>` + row(T.day, c.day, T) + row(T.week, c.week, T) + row(T.month, c.month, T) + (tip ? `<div class="nt-tip">💡 ${tip}</div>` : '');
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { compute, html, L, add, dow }; return; }

  // ───── Browser ─────
  const lang = (root.NARA_LANG && root.NARA_LANG.get && root.NARA_LANG.get()) || 'de', T = L[lang] || L.de;
  const css = document.createElement('style');
  css.textContent = '#nara-trend{margin:0 0 12px;padding:10px 14px;background:#fff;border:1px solid #e5e1da;border-radius:12px;font-size:.92rem;display:none}#nara-trend .nt-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}#nara-trend small{color:#8a857c}#nara-trend .nt-r{display:grid;grid-template-columns:minmax(150px,1.6fr) 1fr 1.2fr .8fr;gap:8px;padding:3px 0;border-top:1px dotted #e5e1da}#nara-trend .nt-r b{font-weight:800}#nara-trend .nt-r i{color:#8a857c;font-style:normal}#nara-trend em{font-style:normal;font-weight:800}#nara-trend em.up{color:#16a34a}#nara-trend em.dn{color:#dc2626}#nara-trend .nt-tip{margin-top:6px;padding:6px 10px;background:#fff7e6;border-radius:8px;font-weight:600}@media(max-width:700px){#nara-trend .nt-r{grid-template-columns:1fr 1fr}}';
  document.head.appendChild(css);
  let box = null, last = 0, busy = false, allowed = null;
  const bizToday = () => { const d = new Date(Date.now() - 5 * 3600000), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  async function refresh(force) {
    if (busy || (!force && Date.now() - last < 15000)) return;
    busy = true;
    try {
      if (allowed === null) { const r = await fetch('/api/auth/me', { cache: 'no-store' }); const j = r.ok ? await r.json() : null; allowed = !!j && ['OWNER', 'MANAGER'].includes(((j.user || j) || {}).role); }
      if (!allowed) return;
      const today = bizToday(), r = await fetch(`/api/reports/sales-ledger?from=${add(today, -35)}&to=${today}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json(), c = compute((j.summary && j.summary.byDay) || [], today);
      if (!box) { box = document.createElement('div'); box.id = 'nara-trend'; const st = document.getElementById('stats'); st.parentNode.insertBefore(box, st.nextSibling); }
      box.innerHTML = html(c, T); box.style.display = 'block'; last = Date.now();
    } catch (e) { /* still: Vergleich ist optional */ } finally { busy = false; }
  }
  const start = () => { refresh(true); setInterval(() => refresh(true), 60000); const st = document.getElementById('stats'); if (st) new MutationObserver(() => refresh(false)).observe(st, { childList: true, subtree: true, characterData: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})(typeof window !== 'undefined' ? window : globalThis);
