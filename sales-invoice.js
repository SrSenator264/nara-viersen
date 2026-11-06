'use strict';
// sales-invoice.js — A4-Rechnung (Ausgangsrechnung) aus einer Kassen-Bestellung. Rein (kein I/O): Berechnung + HTML.
// Steuersätze/Aufteilung kommen aus day-closing.js (gleiche Logik wie die Tagesabrechnung: 7 % Speisen / 19 % Getränke, Menü-Split).
// Hinweis: Pflichtangaben nach §14 UStG nach bestem Wissen — vor dem Einsatz beim Steuerberater/Finanzamt prüfen lassen.
const DC = require('./day-closing.js');

const finite = v => Number.isFinite(Number(v));
const int = v => (finite(v) ? Math.round(Number(v)) : 0);
const str = v => String(v == null ? '' : v).trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = c => (int(c) / 100).toFixed(2).replace('.', ',') + ' €';
const dmy = iso => { const d = new Date(iso); if (isNaN(d)) return ''; return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); };

const DEFAULT_SELLER = { name: 'IUGENE', street: 'Gereonstraße 1', zip: '41747', city: 'Viersen', vatId: 'DE357658231' };
const sellerOf = data => ({ ...DEFAULT_SELLER, ...((data && data.settings && data.settings.seller) || {}) });

class InvoiceError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

function cleanCustomer(c) {
  c = c || {};
  const out = { name: str(c.name).slice(0, 120), street: str(c.street).slice(0, 120), zip: str(c.zip).slice(0, 12), city: str(c.city).slice(0, 80), vatId: str(c.vatId).toUpperCase().replace(/\s+/g, '').slice(0, 20) };
  if (!out.name) throw new InvoiceError(400, 'NAME_REQUIRED', 'Firmenname fehlt.');
  if (!out.street || !out.zip || !out.city) throw new InvoiceError(400, 'ADDRESS_REQUIRED', 'Anschrift (Straße, PLZ, Ort) fehlt.');
  if (out.vatId && !/^[A-Z]{2}[A-Z0-9]{2,14}$/.test(out.vatId)) throw new InvoiceError(400, 'BAD_VATID', 'USt-IdNr hat kein gültiges Format.');
  return out;
}

function nextNumber(data, year) {
  const re = new RegExp('^RE-' + year + '-(\\d{4,})$');
  const max = Math.max(0, ...(data.salesInvoices || []).map(i => { const m = re.exec(String(i.number || '')); return m ? Number(m[1]) : 0; }));
  return 'RE-' + year + '-' + String(max + 1).padStart(4, '0');
}

const isTip = it => /TIP/i.test(str(it && it.kind));

// order + data -> Rechnungsobjekt (noch nicht gespeichert)
function build(data, order, customerIn, opts = {}) {
  if (!order || !Array.isArray(order.cart)) throw new InvoiceError(404, 'ORDER_NOT_FOUND', 'Bestellung nicht gefunden.');
  if (order.isTest || order.training === true) throw new InvoiceError(422, 'TRAINING_ORDER', 'Für Trainings-Bestellungen gibt es keine Rechnung.');
  // Keine Rechnung für stornierte/abgebrochene Bestellungen: eine Rechnung mit USt. ohne echten Umsatz schuldet die Steuer trotzdem (§ 14c UStG).
  // Offene Bestellungen sind erlaubt (die Kasse druckt die Firmenrechnung vor dem Kassieren); wird die Bestellung danach geändert,
  // abgebrochen oder storniert, storniert der Server die Rechnung automatisch (cancelForOrder).
  if (order.status === 'STORNIERT' || order.correctedBy || order.stornoAt) throw new InvoiceError(409, 'ORDER_STORNO', 'Die Bestellung ist storniert — keine Rechnung möglich.');
  if (order.status === 'CANCELLED') throw new InvoiceError(409, 'ORDER_CANCELLED', 'Die Bestellung wurde abgebrochen — keine Rechnung möglich.');
  const items = order.cart.filter(it => !isTip(it) && int(it.unitCents) * (finite(it.quantity) ? int(it.quantity) : 1) > 0);
  if (!items.length) throw new InvoiceError(422, 'EMPTY_ORDER', 'Die Bestellung hat keine Positionen.');
  const customer = cleanCustomer(customerIn);
  const { rateOf, splitOf, food } = DC.rateResolver(data);
  const cartCents = items.reduce((s, it) => s + int(it.unitCents) * (finite(it.quantity) ? int(it.quantity) : 1), 0);
  const discountCents = Math.min(cartCents, Math.max(0, int(order.billDiscount && order.billDiscount.amountCents)));
  const grossCents = cartCents - discountCents;
  const alloc = DC.allocate(grossCents, DC.weightsOf({ ...order, cart: items }, rateOf, splitOf), food);
  const rows = [...alloc.entries()].filter(([, g]) => g !== 0).sort((a, b) => a[0] - b[0]).map(([rate, g]) => {
    const net = Math.round(g / (1 + rate / 100)); return { rate, grossCents: g, netCents: net, vatCents: g - net };
  });
  const vat = { rows, grossCents: rows.reduce((s, r) => s + r.grossCents, 0), netCents: rows.reduce((s, r) => s + r.netCents, 0), vatCents: rows.reduce((s, r) => s + r.vatCents, 0) };
  const lines = items.map(it => {
    const q = finite(it.quantity) ? int(it.quantity) : 1, sp = splitOf(it);
    return { name: str(it.name || it.n || 'Artikel').slice(0, 120), quantity: q, unitCents: int(it.unitCents), totalCents: int(it.unitCents) * q, rate: sp ? null : rateOf(it, order), mixed: !!sp };
  });
  const pays = (data.payments || []).filter(p => String(p.orderId) === String(order.id) && p.status === 'COMPLETED' && !p.isTest);
  const methods = new Set();
  for (const p of pays) for (const l of (Array.isArray(p.paymentLines) && p.paymentLines.length ? p.paymentLines : [{ method: p.method }])) methods.add(str(l.method).toUpperCase());
  const paidCents = pays.reduce((s, p) => s + int(p.amountCents), 0);
  const now = opts.now || new Date().toISOString();
  const serviceIso = (pays[0] && pays[0].createdAt) || order.createdAt || now;
  return {
    id: opts.id, number: opts.number, status: 'ISSUED', issuedAt: now, serviceDate: serviceIso,
    seller: sellerOf(data), customer, orderId: String(order.id), orderCode: str(order.displayCode || ''),
    lines, discountCents, vat, grossCents,
    payment: { methods: [...methods], paidCents, paid: paidCents >= grossCents && grossCents > 0 },
    createdBy: opts.by || null,
  };
}

// Rechnung stornieren = Stornorechnung mit eigener Nummer (<Nummer>-S) und Bezug auf das Original; das Original bleibt unverändert im Archiv (nur Status).
function cancel(inv, { reason, by, now }) {
  if (!inv) throw new InvoiceError(404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
  if (inv.status === 'CANCELLED') throw new InvoiceError(409, 'ALREADY_CANCELLED', 'Bereits storniert.');
  const why = String(reason || '').trim().slice(0, 200);
  if (!why) throw new InvoiceError(400, 'REASON_REQUIRED', 'Grund fehlt.');
  inv.status = 'CANCELLED'; inv.cancelledAt = now; inv.cancelledBy = by || null; inv.cancelReason = why;
  inv.cancellationNumber = inv.number + '-S';
  return inv;
}
// Bestellung wurde storniert → ihre offene Rechnung automatisch stornieren. Gibt die stornierten Rechnungen zurück.
function cancelForOrder(data, orderId, { reason, by, now }) {
  const out = [];
  for (const inv of data.salesInvoices || []) if (String(inv.orderId) === String(orderId) && inv.status === 'ISSUED') out.push(cancel(inv, { reason, by, now }));
  return out;
}

const METHOD_DE = { CASH: 'Bar', CARD: 'Karte' };
function html(inv, opts = {}) {
  if (opts.storno) return stornoHtml(inv, opts);
  const s = inv.seller, c = inv.customer;
  const rateTxt = l => l.mixed ? '7/19 %' : l.rate + ' %';
  const rows = inv.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="r">${l.quantity}</td><td class="r">${eur(l.unitCents)}</td><td class="r">${rateTxt(l)}</td><td class="r">${eur(l.totalCents)}</td></tr>`).join('');
  const disc = inv.discountCents ? `<tr><td></td><td>Rabatt</td><td></td><td></td><td></td><td class="r">− ${eur(inv.discountCents)}</td></tr>` : '';
  const vatRows = inv.vat.rows.map(r => `<tr><td class="r">${r.rate} %</td><td class="r">${eur(r.netCents)}</td><td class="r">${eur(r.vatCents)}</td><td class="r">${eur(r.grossCents)}</td></tr>`).join('');
  const pay = inv.payment.paid ? 'Der Betrag wurde bezahlt (' + (inv.payment.methods.map(m => METHOD_DE[m] || m).join(' + ') || 'Zahlung') + ').' : 'Der Betrag ist sofort zahlbar.';
  const cancelled = inv.status === 'CANCELLED' ? '<div class="cx">STORNIERT</div>' : '';
  const css = '@page{size:A4;margin:16mm 14mm}html,body{margin:0;background:#fff;color:#000}body{font:10.5pt/1.4 Arial,Helvetica,sans-serif;position:relative}h1{font-size:20pt;margin:18mm 0 4mm}.top{display:flex;justify-content:space-between;gap:10mm}.sender{font-size:8pt;text-decoration:underline;margin-bottom:2mm}.meta td{padding:1px 0 1px 8mm}table{width:100%;border-collapse:collapse;margin-top:6mm}th{text-align:left;border-bottom:1.5px solid #000;padding:3px 4px;font-size:9.5pt}td{padding:3px 4px;border-bottom:.5px solid #bbb;vertical-align:top}.r{text-align:right;white-space:nowrap}.tot td{font-weight:700;border-top:1.5px solid #000;border-bottom:0}.vat{width:60%;margin-left:auto}.foot{margin-top:10mm;font-size:9pt}.cx{position:fixed;top:90mm;left:20mm;font-size:70pt;color:#c00;opacity:.25;transform:rotate(-25deg);border:6px solid #c00;padding:0 10mm}';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${esc(inv.number)}</title><style>${css}</style></head><body>${cancelled}
<div class="top"><div><div class="sender">${esc(s.name)} · ${esc(s.street)} · ${esc(s.zip)} ${esc(s.city)}</div>
<div><b>${esc(c.name)}</b><br>${esc(c.street)}<br>${esc(c.zip)} ${esc(c.city)}${c.vatId ? '<br>USt-IdNr: ' + esc(c.vatId) : ''}</div></div>
<div style="text-align:right"><b>${esc(s.name)}</b><br>${esc(s.street)}<br>${esc(s.zip)} ${esc(s.city)}<br>USt-IdNr: ${esc(s.vatId)}</div></div>
<h1>Rechnung</h1>
<table class="meta" style="width:auto;margin:0"><tr><td>Rechnungsnummer:</td><td><b>${esc(inv.number)}</b></td></tr><tr><td>Rechnungsdatum:</td><td>${dmy(inv.issuedAt)}</td></tr><tr><td>Leistungsdatum:</td><td>${dmy(inv.serviceDate)}</td></tr>${inv.orderCode ? `<tr><td>Bestellung:</td><td>${esc(inv.orderCode)}</td></tr>` : ''}</table>
<table><thead><tr><th>Pos.</th><th>Bezeichnung</th><th class="r">Menge</th><th class="r">Einzelpreis (brutto)</th><th class="r">USt.</th><th class="r">Gesamt (brutto)</th></tr></thead><tbody>${rows}${disc}<tr class="tot"><td></td><td>Gesamtbetrag brutto</td><td></td><td></td><td></td><td class="r">${eur(inv.grossCents)}</td></tr></tbody></table>
<table class="vat"><thead><tr><th class="r">USt.-Satz</th><th class="r">Netto</th><th class="r">USt.-Betrag</th><th class="r">Brutto</th></tr></thead><tbody>${vatRows}<tr class="tot"><td class="r">Summe</td><td class="r">${eur(inv.vat.netCents)}</td><td class="r">${eur(inv.vat.vatCents)}</td><td class="r">${eur(inv.vat.grossCents)}</td></tr></tbody></table>
<div class="foot"><p>${esc(pay)}</p><p>Leistungsort: ${esc(s.street)}, ${esc(s.zip)} ${esc(s.city)}. Die Preise enthalten die gesetzliche Umsatzsteuer.</p><p>${esc(s.name)} · USt-IdNr ${esc(s.vatId)}</p></div>
${opts.autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>' : ''}</body></html>`;
}

// Stornorechnung: gleiche Positionen mit negativen Beträgen, eigene Nummer, Verweis auf die Originalrechnung
function stornoHtml(inv, opts = {}) {
  if (inv.status !== 'CANCELLED' || !inv.cancellationNumber) throw new InvoiceError(409, 'NOT_CANCELLED', 'Rechnung ist nicht storniert.');
  const neu = { ...inv, number: inv.cancellationNumber, issuedAt: inv.cancelledAt, status: 'ISSUED',
    payment: { methods: [], paidCents: 0, paid: false } };
  let page = html(neu, { autoPrint: opts.autoPrint });
  // Titel, Bezug und Vorzeichen anpassen (Positionen und Steuer negativ)
  page = page.replace('<title>Rechnung ', '<title>Stornorechnung ').replace('<h1>Rechnung</h1>', '<h1>Stornorechnung</h1><p>zur Rechnung <b>' + esc(inv.number) + '</b> vom ' + dmy(inv.issuedAt) + ' · Grund: ' + esc(inv.cancelReason || '') + '</p>');
  page = page.replace('<td>Rabatt</td><td></td><td></td><td></td><td class="r">− ', '<td>Rabatt</td><td></td><td></td><td></td><td class="r">+ ');
  page = page.replace(/<td class="r">((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2} €)<\/td>/g, (m, v) => '<td class="r">− ' + v + '</td>');
  page = page.replace('Der Betrag ist sofort zahlbar.', 'Der Rechnungsbetrag der Originalrechnung wird hiermit storniert.');
  return page;
}

module.exports = { build, html, stornoHtml, cancel, cancelForOrder, nextNumber, sellerOf, cleanCustomer, DEFAULT_SELLER, InvoiceError, eur };
