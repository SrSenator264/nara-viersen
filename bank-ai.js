'use strict';
// bank-ai.js — Claude بيقرا كشف حساب البنك (PDF أو صورة) وبيطلع الحركات. معاينة بس، الاستيراد بعد موافقة عمر.
// فحص: الرصيد الافتتاحي + مجموع الحركات = الرصيد الختامي (إذا الكشف فيه أرصدة).

const str = v => (v == null ? '' : String(v));
const SCHEMA = {
  type: 'object',
  properties: {
    bankName: { type: ['string', 'null'] }, accountHolder: { type: ['string', 'null'] }, ibanLast4: { type: ['string', 'null'] }, currency: { type: ['string', 'null'] },
    periodFrom: { type: ['string', 'null'] }, periodTo: { type: ['string', 'null'] }, openingBalance: { type: ['number', 'null'] }, closingBalance: { type: ['number', 'null'] },
    transactions: { type: 'array', items: { type: 'object', properties: {
      date: { type: 'string', description: 'Buchungsdatum YYYY-MM-DD' }, amount: { type: 'number', description: 'Eingang positiv, Ausgang negativ, in EUR' },
      description: { type: 'string', description: 'Empfänger/Auftraggeber + Verwendungszweck' }, reference: { type: ['string', 'null'] }, balance: { type: ['number', 'null'] },
    }, required: ['date', 'amount', 'description'] } },
  },
  required: ['transactions'],
};
const PROMPT = 'Lies diesen Kontoauszug (Geschäftskonto eines Restaurants, z.B. Wise oder Qonto). Gib JEDE Buchung als eigene Zeile zurück, nichts zusammenfassen, nichts erfinden. Eingänge positiv, Ausgänge/Gebühren negativ, Beträge in EUR als Zahl. Datum als YYYY-MM-DD. description = Gegenpartei + Verwendungszweck. IBAN nur die letzten 4 Ziffern. Wenn ein Feld fehlt: null. Rufe save_statement genau einmal auf.';

const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
function normalize(raw) {
  const tx = (Array.isArray(raw && raw.transactions) ? raw.transactions : []).map(t => ({
    date: str(t.date).slice(0, 10), amountCents: Math.round(Number(t.amount) * 100), description: str(t.description).slice(0, 300), reference: str(t.reference || '').slice(0, 120),
    balanceCents: t.balance == null || !Number.isFinite(Number(t.balance)) ? null : Math.round(Number(t.balance) * 100),
  }));
  const invalid = tx.filter(t => !isDay(t.date) || !Number.isFinite(t.amountCents));
  const valid = tx.filter(t => isDay(t.date) && Number.isFinite(t.amountCents));
  const toC = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));
  const opening = toC(raw && raw.openingBalance), closing = toC(raw && raw.closingBalance), sum = valid.reduce((s, t) => s + t.amountCents, 0);
  const balanceCheck = opening != null && closing != null ? (Math.abs(opening + sum - closing) <= 1 ? 'OK' : 'MISMATCH') : 'UNKNOWN';
  return { bankName: raw && raw.bankName || null, accountHolder: raw && raw.accountHolder || null, ibanLast4: raw && raw.ibanLast4 ? str(raw.ibanLast4).replace(/\D/g, '').slice(-4) : null, currency: raw && raw.currency || 'EUR',
    periodFrom: isDay(raw && raw.periodFrom) ? raw.periodFrom : null, periodTo: isDay(raw && raw.periodTo) ? raw.periodTo : null,
    openingCents: opening, closingCents: closing, sumCents: sum, balanceCheck, transactions: valid, invalidCount: invalid.length };
}

async function extractStatement({ files = [], mimeTypes = [] }, { env = process.env, fetchImpl = fetch } = {}) {
  const key = str(env.ANTHROPIC_API_KEY).trim();
  if (!key) throw Object.assign(new Error('NO_AI_KEY'), { code: 'NO_AI_KEY' });
  if (!files.length) throw Object.assign(new Error('NO_FILE'), { code: 'NO_FILE' });
  const model = str(env.NARA_BANK_MODEL || env.NARA_INVOICE_MODEL) || 'claude-sonnet-5-5';
  const content = [...files.map((data, i) => mimeTypes[i] === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } : { type: 'image', source: { type: 'base64', media_type: mimeTypes[i] || 'image/jpeg', data } }), { type: 'text', text: PROMPT }];
  const body = { model, max_tokens: 16000, tools: [{ name: 'save_statement', description: 'Speichert die Buchungen des Kontoauszugs.', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'save_statement' }, messages: [{ role: 'user', content }] };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 180000);
  try {
    const call = b => fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(b), signal: ctl.signal });
    let r = await call(body);
    let j = null; try { j = await r.json(); } catch { /* no body */ }
    if (r.status === 400 && /tool_choice/.test(str(j && j.error && j.error.message))) { r = await call({ ...body, tool_choice: { type: 'auto' } }); j = null; try { j = await r.json(); } catch { /* no body */ } }
    if (!r.ok) throw Object.assign(new Error('Claude ' + r.status + (j && j.error ? ': ' + str(j.error.message).slice(0, 200) : '')), { code: 'AI_ERROR', status: r.status });
    const block = ((j && j.content) || []).find(b => b.type === 'tool_use' && b.name === 'save_statement');
    if (!block) throw Object.assign(new Error('EMPTY'), { code: 'AI_EMPTY' });
    const out = normalize(block.input || {});
    out.usage = j.usage || null; out.model = model;
    return out;
  } catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { code: 'AI_TIMEOUT' }); throw e; }
  finally { clearTimeout(timer); }
}

module.exports = { extractStatement, normalize, SCHEMA };
