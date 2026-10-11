'use strict';
// qonto-sync.js — liest eingehende Zahlungen von Qonto (Business API, nur Lesen) und legt sie als bankTransactions ab.
// Zugang: QONTO_LOGIN + QONTO_SECRET in .env. Der Abgleich mit Bestellungen passiert in bank-pay.js (reconcile).
const configured = () => !!(process.env.QONTO_LOGIN && process.env.QONTO_SECRET);
const BASE = () => process.env.QONTO_BASE || 'https://thirdparty.qonto.com';

function mapTx(t) {
  const cents = t.amount_cents != null ? Number(t.amount_cents) : Math.round(Number(t.amount || 0) * 100);
  const credit = String(t.side).toLowerCase() === 'credit';
  return {
    externalId: 'qonto:' + (t.transaction_id || t.id),
    date: String(t.settled_at || t.emitted_at || '').slice(0, 10),
    amountCents: credit ? Math.abs(cents) : -Math.abs(cents),
    description: String(t.label || ''),
    reference: [t.reference, t.note].filter(Boolean).join(' '),
    senderName: String(t.label || ''),
    status: String(t.status || ''), source: 'QONTO',
  };
}

async function api(path, fetchImpl) {
  const r = await fetchImpl(BASE() + path, { headers: { Authorization: process.env.QONTO_LOGIN + ':' + process.env.QONTO_SECRET } });
  if (!r.ok) throw Object.assign(new Error('Qonto ' + r.status), { status: r.status });
  return r.json();
}

// letzte eingegangene Buchungen holen (nur abgeschlossene Gutschriften)
async function fetchRecent(fetchImpl = fetch) {
  const org = await api('/v2/organization', fetchImpl);
  const accs = (org.organization && org.organization.bank_accounts) || [];
  const acc = accs.find(a => a.main) || accs[0];
  if (!acc) return [];
  const j = await api('/v2/transactions?bank_account_id=' + encodeURIComponent(acc.id) + '&per_page=50&sort_by=settled_at:desc', fetchImpl);
  return (j.transactions || []).map(mapTx).filter(r => r.amountCents > 0 && r.date && (!r.status || r.status === 'completed'));
}

// neue Zeilen in data.bankTransactions einfügen (Duplikate über externalId vermeiden); gibt Anzahl neuer Zeilen zurück
function merge(data, rows, now = new Date()) {
  data.bankTransactions ??= [];
  const seen = new Set(data.bankTransactions.map(x => x.externalId).filter(Boolean));
  let n = 0;
  for (const r of rows) {
    if (!r.externalId || seen.has(r.externalId)) continue;
    seen.add(r.externalId);
    data.bankTransactions.push({ id: 'bank-q-' + now.getTime() + '-' + n, externalId: r.externalId, date: r.date, amountCents: r.amountCents,
      description: r.description, reference: r.reference, senderName: r.senderName, balanceCents: null, source: 'QONTO', status: 'UNMATCHED', createdAt: now.toISOString() });
    n++;
  }
  return n;
}

module.exports = { configured, mapTx, fetchRecent, merge };
