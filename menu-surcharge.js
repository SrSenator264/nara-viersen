// Menü-Aufpreis an der Kasse: hat der Artikel einen eigenen Menüpreis (z. B. Burger aus Loyverse),
// zählt der Unterschied Menüpreis − Einzelpreis; sonst gilt die allgemeine Regel (Einstellung, Standard 4,50 €).
(function (root) {
  'use strict';
  function naraMenuSurcharge(p, globalCents) {
    if (p && Number.isInteger(p.menuCents) && Number.isInteger(p.cents) && p.menuCents > p.cents) return p.menuCents - p.cents;
    if (Number.isInteger(globalCents)) return globalCents;
    return Math.max(0, ((p && (p.menuCents || p.cents)) || 0) - ((p && p.cents) || 0));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { naraMenuSurcharge };
  else root.naraMenuSurcharge = naraMenuSurcharge;
})(typeof window !== 'undefined' ? window : globalThis);
