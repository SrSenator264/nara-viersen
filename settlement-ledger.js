'use strict';
/* Tagesabschluss aus dem Verkaufsjournal (/api/reports/sales-ledger): gleiche Zahlen wie Live Orders. Rein & testbar. */
(function (root) {
  const FEES = { LIEFERANDO: 25, UBER_EATS: 25, WOLT: 25, LANCH: 25, LOCO: 25, KASSE: 0, WEBSITE: 0 };
  // rows(byDay, day, fees) -> { rows:{KEY:{amount,count,commission,rate}}, gross, fee }
  function rows(byDay, day, fees) {
    const f = Object.assign({}, FEES, fees || {}), out = { rows: {}, gross: 0, fee: 0 };
    const d = (byDay || []).find(x => x.day === day);
    if (!d) return out;
    for (const [k, v] of Object.entries(d.byPlat || {})) {
      const amount = Number(v.cents) || 0, rate = f[k] != null ? f[k] : 0, commission = Math.round(amount * rate / 100);
      out.rows[k] = { amount, count: Number(v.count) || 0, commission, rate };
      out.gross += amount; out.fee += commission;
    }
    return out;
  }
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // rowsRange(byDay, from, to, fees) -> wie rows(), aber summiert alle Tage von..bis (inklusive). from > to -> leer.
  function rowsRange(byDay, from, to, fees) {
    const f = Object.assign({}, FEES, fees || {}), out = { rows: {}, gross: 0, fee: 0, days: 0 };
    if (!ISO.test(from || '') || !ISO.test(to || '') || from > to) return out;
    const sum = {};
    for (const d of byDay || []) {
      if (!d || d.day < from || d.day > to) continue;
      out.days++;
      for (const [k, v] of Object.entries(d.byPlat || {})) {
        const s = sum[k] || (sum[k] = { amount: 0, count: 0 });
        s.amount += Number(v.cents) || 0; s.count += Number(v.count) || 0;
      }
    }
    for (const [k, s] of Object.entries(sum)) {
      const rate = f[k] != null ? f[k] : 0, commission = Math.round(s.amount * rate / 100);
      out.rows[k] = { amount: s.amount, count: s.count, commission, rate };
      out.gross += s.amount; out.fee += commission;
    }
    return out;
  }
  // preset(name, today) -> { from, to }: today | yesterday | week (Montag bis heute) | month (1. bis heute)
  function preset(name, today) {
    if (!ISO.test(today || '')) return null;
    if (name === 'today') return { from: today, to: today };
    if (name === 'yesterday') { const y = addDays(today, -1); return { from: y, to: y }; }
    if (name === 'week') { const wd = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; return { from: addDays(today, -wd), to: today }; }
    if (name === 'month') return { from: today.slice(0, 8) + '01', to: today };
    return null;
  }
  // Plattformen mit Umsatz im Zeitraum (nach Umsatz sortiert)
  function keysIn(byDay, from, to) {
    const t = {};
    for (const d of byDay || []) { if (!d || d.day < from || d.day > to) continue; for (const [k, v] of Object.entries(d.byPlat || {})) t[k] = (t[k] || 0) + (Number(v.cents) || 0); }
    return Object.keys(t).filter(k => t[k] > 0).sort((a, b) => t[b] - t[a]);
  }
  // detail(byDay, from, to, key, fees): key 'ALL' = alle Quellen zusammen. Liefert Summen, Ø, Anteil und Tage (mit Umsatz).
  function detail(byDay, from, to, key, fees) {
    const f = Object.assign({}, FEES, fees || {}), all = key == null || key === 'ALL';
    const out = { key: all ? 'ALL' : key, gross: 0, count: 0, avg: 0, fee: 0, totalGross: 0, share: 0, days: [], maxDay: 0, parts: {} };
    if (!ISO.test(from || '') || !ISO.test(to || '') || from > to) return out;
    for (const d of byDay || []) {
      if (!d || d.day < from || d.day > to) continue;
      let cents = 0, count = 0;
      for (const [k, v] of Object.entries(d.byPlat || {})) {
        const c = Number(v.cents) || 0, n = Number(v.count) || 0;
        out.totalGross += c; out.parts[k] = (out.parts[k] || 0) + c;
        if (all || k === key) { cents += c; count += n; out.fee += Math.round(c * (f[k] != null ? f[k] : 0) / 100); }
      }
      if (cents > 0 || count > 0) { out.days.push({ day: d.day, cents, count }); out.gross += cents; out.count += count; if (cents > out.maxDay) out.maxDay = cents; }
    }
    out.avg = out.count ? Math.round(out.gross / out.count) : 0;
    out.share = out.totalGross ? Math.round(out.gross / out.totalGross * 1000) / 10 : 0;
    return out;
  }
  const api = { rows, rowsRange, preset, addDays, keysIn, detail, FEES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NARA_SETTLEMENT_LEDGER = api;
})(typeof window !== 'undefined' ? window : globalThis);
