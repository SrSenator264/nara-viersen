// Menü-Aufpreis an der Kasse: fester Betrag für ALLE Artikel (Einstellung, Standard 3,00 €).
// Nur wenn keine Einstellung vorhanden ist, zählt der eigene Menüpreis − Einzelpreis.
(function (root) {
  'use strict';
  function naraMenuSurcharge(p, globalCents) {
    if (Number.isInteger(globalCents)) return globalCents;
    return Math.max(0, ((p && (p.menuCents || p.cents)) || 0) - ((p && p.cents) || 0));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { naraMenuSurcharge };
  else root.naraMenuSurcharge = naraMenuSurcharge;
})(typeof window !== 'undefined' ? window : globalThis);
