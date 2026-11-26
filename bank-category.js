'use strict';
// bank-category.js — Kategorie je Bankbuchung (nur Vorschlag; gespeichert wird erst nach Freigabe durch den Inhaber).
// Kategorien = GuV-Kategorien + PLATFORM_PAYOUT (Auszahlung einer Plattform), PRIVATE (Privatentnahme), TRANSFER (Geldtransit, z. B. Bargeld abheben).
const { CATS } = require('./euer-draft.js');
const EXTRA = ['PLATFORM_PAYOUT', 'PRIVATE', 'TRANSFER'];
const ALL = [...CATS, ...EXTRA];

// Reihenfolge zählt: der erste Treffer gewinnt.
const RULES = [
  ['PLATFORM_PAYOUT', /takeaway|lieferando|uber payments|stichting custodian uber|lanch gmbh|ghost food|wolt|sides/i],
  ['PRIVATE', /geld überwiesen an omar|apotheke/i],
  ['TRANSFER', /volksbank|sparkasse|geldautomat|bargeld|atm/i],
  ['MARKETING', /augenschmaus|webseite|inwx|google ads|meta ads/i],
  ['RENT', /miete|keser/i],
  ['ENERGY', /energie|immergrün|stadtwerke|strom|gas\b/i],
  ['TELECOM', /telekom|drillisch|vodafone|o2 |1&1/i],
  ['WAGES', /knappschaft|bkk|aok|techniker krankenkasse|minijob|lohn|gehalt/i],
  ['INSURANCE', /versicherung|allianz|ergo|axa/i],
  ['VEHICLE', /tankstelle|aral|shell|esso|star |parken|kfz/i],
  ['BANK_FEES', /wise-karte|cashback|kontoführung|gebühr/i],
  ['EQUIPMENT_SMALL', /vevor|obi |refurbed|pc-sale|ebay|amazon|aliexpress/i],
  ['GOODS', /meledi|jacob brot|handelshof|erciyes|metro|pool chefs|kaufland|aldi|netto|go asia|lidl|rewe|edeka|selgros/i],
  ['OTHER', /rundfunk|anthropic/i],
];

const MATCHED = { PLATFORM_PAYOUT: 'PLATFORM_PAYOUT', PAYROLL: 'WAGES' };

// Vorschlag für eine Buchung: gespeicherte Kategorie > Abgleich > Regel > null
function suggest(tx) {
  if (tx.category && ALL.includes(tx.category)) return { category: tx.category, source: 'SAVED' };
  if (tx.status === 'MATCHED' && MATCHED[tx.matchedEntityType]) return { category: MATCHED[tx.matchedEntityType], source: 'MATCH' };
  const text = [tx.description, tx.reference].filter(Boolean).join(' ');
  for (const [cat, re] of RULES) if (re.test(text)) return { category: cat, source: 'RULE' };
  return null;
}

// Summen je Kategorie für einen Zeitraum; nur gespeicherte Kategorien. Ausgaben positiv (Rückerstattung zieht ab).
function totals(data, from, to) {
  const byCat = {}; let uncategorized = 0, count = 0;
  for (const tx of data.bankTransactions || []) {
    const d = String(tx.date || '');
    if (d < from || d > to) continue;
    count++;
    if (!tx.category || !ALL.includes(tx.category)) { uncategorized++; continue; }
    byCat[tx.category] = (byCat[tx.category] || 0) - Number(tx.amountCents || 0);
  }
  return { byCat, uncategorized, count };
}

module.exports = { ALL, EXTRA, RULES, suggest, totals };
