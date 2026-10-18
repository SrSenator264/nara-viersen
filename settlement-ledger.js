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
  const api = { rows, FEES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NARA_SETTLEMENT_LEDGER = api;
})(typeof window !== 'undefined' ? window : globalThis);
