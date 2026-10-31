'use strict';
/* day-closing-print.js — ورقة تقفيلة اليوم: A4 (HTML) وإيصال 80mm (أسطر 42 حرف + HTML). نقي وبيشتغل بالسيرفر والمتصفح.
   الورقة ألمانية دايماً (للمحاسب والـFinanzamt). بتعرض الحقائق بس: بدون تحذيرات وبدون علامات تدريب.
   سجل جديد = أصل؛ copyNumber >= 2 بيطبع "Kopie n". Nachtrag = ورقة فرق مربوطة بالأصل. */
(function (root) {
  const DEFAULT_HEADER = 'Flamo, Gereonstraße 1, 41747 Viersen, Tel.: 02162 5013538';
  const LABELS = { LIEFERANDO: 'Lieferando', WOLT: 'Wolt', UBER_EATS: 'Uber Eats', LANCH: 'Lanch', LOCO: 'Loco Chicken' };
  const eur = c => { const n = Math.round(Number(c) || 0), a = Math.abs(n); return (n < 0 ? '-' : '') + String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(a % 100).padStart(2, '0'); };
  const dmy = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : String(d || '');
  const stamp = iso => { try { const t = new Date(iso); if (isNaN(t)) return ''; return t.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ''); } catch (e) { return String(iso || '').slice(0, 16).replace('T', ' '); } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const who = rec => (rec.closedBy && (rec.closedBy.name || rec.closedBy)) || '';
  const label = k => LABELS[k] || k;
  // TSE مخفية مؤقتاً (على الورقة وعلى الشاشة) لحد ما نربط الجهاز الحقيقي
  const SHOW_TSE = false;
  const isNachtrag = rec => rec.type === 'NACHTRAG';
  const denLabel = c => Number(c) >= 100 ? (Number(c) / 100) + ' €' : Number(c) + ' ct';

  function wrap(text, width) {
    const out = []; let cur = '';
    for (const w of String(text || '').split(/\s+/).filter(Boolean)) { if ((cur + ' ' + w).trim().length > width && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) out.push(cur); return out;
  }

  // ── إيصال 80mm: أسطر {text, align, bold, size} (42 حرف) ──
  function receiptLines(rec, opt = {}) {
    const W = opt.width || 42, R = rec.report || {}, L = [], copy = Number(opt.copyNumber) || 0;
    const add = (text, st) => L.push({ text: String(text), ...(st || {}) });
    const sep = () => add('-'.repeat(W));
    const row = (l, r, st) => { const rs = String(r); add(String(l).slice(0, Math.max(1, W - rs.length - 1)).padEnd(W - rs.length) + rs, st); };
    const head = t => { add(''); add(t, { bold: true }); };
    for (const s of wrap(opt.header || DEFAULT_HEADER, W)) add(s, { align: 'center' });
    sep(); add(isNachtrag(rec) ? 'NACHTRAG' : 'TAGESABSCHLUSS', { align: 'center', bold: true, size: 2 });
    if (rec.number) add(rec.number, { align: 'center', bold: true });
    if (isNachtrag(rec)) add('zum Abschluss ' + String(rec.number || '').replace(/-N\d+$/, ''), { align: 'center' });
    add('Geschäftstag ' + dmy(rec.day), { align: 'center' });
    if (rec.closedAt) add('Erstellt ' + stamp(rec.closedAt) + (who(rec) ? ' · ' + who(rec) : ''), { align: 'center' });
    if (copy > 1) add('Kopie ' + copy, { align: 'center', bold: true });
    sep();

    const v = R.revenue || {}, n = R.net || {}, st = R.storno || {}, cn = R.counts || {};
    head('UMSATZ');
    row('Bestellungen', cn.orders || 0);
    row('Umsatz brutto', eur(n.grossCents), { bold: true });
    row('  davon Bar', eur(n.cashCents)); row('  davon Karte', eur(n.cardCents));
    if (v.otherCents) row('  davon Sonstige', eur(v.otherCents));
    if (v.discountCents) row('Rabatte', eur(-v.discountCents));
    if (st.count) row('Storno (' + st.count + ')', eur(-st.amountCents));
    if (R.cancelled && R.cancelled.count) row('Storniert vor Zahlung (' + R.cancelled.count + ')', eur(R.cancelled.cartCents));
    row('Trinkgeld (durchlaufend)', eur(v.tipCents));

    if (R.vat && R.vat.rows && R.vat.rows.length) {
      head('STEUER'); 
      for (const r of R.vat.rows) { add(('MwSt ' + r.rate + ' %').padEnd(W)); row('  Netto / Steuer', eur(r.netCents) + ' / ' + eur(r.vatCents)); row('  Brutto', eur(r.grossCents)); }
      row('Summe Steuer', eur(R.vat.vatCents), { bold: true });
    }

    if (R.platform && R.platform.rows && R.platform.rows.length) {
      head('PLATTFORMEN (nicht in der Kasse)');
      for (const r of R.platform.rows) row(label(r.key) + ' ' + r.count + 'x', eur(r.grossCents));
      row('Summe', eur(R.platform.grossCents), { bold: true });
    }

    const c = R.cash;
    if (!isNachtrag(rec) && c) {
      head('KASSE');
      row('Anfangsbestand', eur(c.openingCents)); row('+ Barumsatz', eur(c.salesCents));
      if (c.tipCents) row('+ Trinkgeld bar', eur(c.tipCents));
      if (c.refundsCents) row('- Storno bar', eur(c.refundsCents));
      if (c.depositsCents) row('+ Einlagen', eur(c.depositsCents));
      if (c.withdrawalsCents) row('- Entnahmen', eur(c.withdrawalsCents));
      row('Soll', eur(c.expectedCents), { bold: true });
      if (c.countedCents != null) {
        row('Gezählt', eur(c.countedCents), { bold: true }); row('Differenz', eur(c.differenceCents || 0), { bold: true });
        if (c.leaveCents != null) { row('In der Kasse gelassen', eur(c.leaveCents)); row('Entnahme', eur(c.takeOutCents || 0)); }
      }
    }
    if (SHOW_TSE && R.tse && R.tse.signed) {
      head('TSE'); row('Signierte Vorgänge', R.tse.signed);
      if (R.tse.serial) row('Seriennummer', R.tse.serial);
      if (R.receipts && R.receipts.first) { row('Erster Bon', R.receipts.first); row('Letzter Bon', R.receipts.last); }
    }
    const note = (rec.count && rec.count.note) || '';
    if (note) { head('NOTIZ'); for (const s of wrap(note, W)) add(s); }
    sep();
    return L;
  }

  function receiptHtml(rec, opt = {}) {
    const lines = receiptLines(rec, opt);
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Tagesabschluss ' + esc(rec.number || dmy(rec.day)) + '</title><style>@page{size:80mm auto;margin:3mm}html,body{margin:0;background:#fff;color:#000}body{font:12px/1.3 "Courier New",Courier,monospace;width:72mm}.l{white-space:pre-wrap;min-height:1.3em}.center{text-align:center}.right{text-align:right}.b{font-weight:700}.s2{font-size:20px;line-height:1.2}</style></head><body>' +
      lines.map(l => '<div class="l' + (l.align === 'center' ? ' center' : l.align === 'right' ? ' right' : '') + (l.bold ? ' b' : '') + (l.size === 2 ? ' s2' : '') + '">' + esc(l.text) + '</div>').join('') + '</body></html>';
  }

  // ── A4 ──
  function a4Html(rec, opt = {}) {
    const R = rec.report || {}, copy = Number(opt.copyNumber) || 0, header = opt.header || DEFAULT_HEADER, nach = isNachtrag(rec);
    const v = R.revenue || {}, n = R.net || {}, st = R.storno || {}, cn = R.counts || {}, c = R.cash;
    const tr = (l, r, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(l) + '</td><td class="n">' + esc(r) + '</td></tr>';
    const table = (title, rows) => '<h2>' + esc(title) + '</h2><table>' + rows + '</table>';
    let body = '<div class="top"><div><div class="brand">Flamo</div><div class="addr">' + esc(header) + '</div></div><div class="meta"><div class="title">' + (nach ? 'Nachtrag' : 'Tagesabschluss') + '</div>' + (rec.number ? '<div class="num">' + esc(rec.number) + '</div>' : '') + (copy > 1 ? '<div class="copy">Kopie ' + copy + '</div>' : '') + '</div></div>';
    body += '<div class="sub">Geschäftstag <b>' + esc(dmy(rec.day)) + '</b>' + (rec.closedAt ? ' · Erstellt ' + esc(stamp(rec.closedAt)) + (who(rec) ? ' · ' + esc(who(rec)) : '') : '') + (nach ? ' · zum Abschluss ' + esc(String(rec.number || '').replace(/-N\d+$/, '')) : '') + '</div>';

    let rows = tr('Bestellungen', cn.orders || 0) + tr('Umsatz brutto', eur(n.grossCents), 'tot') + tr('davon Bar', eur(n.cashCents), 'sub') + tr('davon Karte', eur(n.cardCents), 'sub');
    if (v.otherCents) rows += tr('davon Sonstige', eur(v.otherCents), 'sub');
    if (v.discountCents) rows += tr('Rabatte', eur(-v.discountCents));
    if (st.count) rows += tr('Storno (' + st.count + ')', eur(-st.amountCents));
    if (R.cancelled && R.cancelled.count) rows += tr('Storniert vor Zahlung (' + R.cancelled.count + ')', eur(R.cancelled.cartCents));
    rows += tr('Trinkgeld (durchlaufender Posten, nicht im Umsatz)', eur(v.tipCents));
    body += table('Umsatz', rows);

    if (R.vat && R.vat.rows && R.vat.rows.length) {
      body += '<h2>Umsatzsteuer</h2><table><tr class="th"><td>Steuersatz</td><td class="n">Netto</td><td class="n">Steuer</td><td class="n">Brutto</td></tr>' +
        R.vat.rows.map(r => '<tr><td>' + esc(r.rate) + ' %</td><td class="n">' + eur(r.netCents) + '</td><td class="n">' + eur(r.vatCents) + '</td><td class="n">' + eur(r.grossCents) + '</td></tr>').join('') +
        '<tr class="tot"><td>Summe</td><td class="n">' + eur(R.vat.netCents) + '</td><td class="n">' + eur(R.vat.vatCents) + '</td><td class="n">' + eur(R.vat.grossCents) + '</td></tr></table>';
    }
    if (R.platform && R.platform.rows && R.platform.rows.length) {
      body += '<h2>Plattformen <span class="hint">(nicht in der Kasse)</span></h2><table><tr class="th"><td>Plattform</td><td class="n">Anzahl</td><td class="n">Umsatz</td><td class="n">Provision</td></tr>' +
        R.platform.rows.map(r => '<tr><td>' + esc(label(r.key)) + '</td><td class="n">' + r.count + '</td><td class="n">' + eur(r.grossCents) + '</td><td class="n">' + eur(r.commissionCents) + '</td></tr>').join('') +
        '<tr class="tot"><td>Summe</td><td class="n"></td><td class="n">' + eur(R.platform.grossCents) + '</td><td class="n">' + eur(R.platform.commissionCents) + '</td></tr></table>';
    }
    if (!nach && c) {
      let k = tr('Anfangsbestand', eur(c.openingCents)) + tr('+ Barumsatz', eur(c.salesCents));
      if (c.tipCents) k += tr('+ Trinkgeld bar', eur(c.tipCents));
      if (c.refundsCents) k += tr('− Storno bar', eur(c.refundsCents));
      if (c.depositsCents) k += tr('+ Einlagen', eur(c.depositsCents));
      if (c.withdrawalsCents) k += tr('− Entnahmen', eur(c.withdrawalsCents));
      k += tr('Soll-Bestand', eur(c.expectedCents), 'tot');
      if (c.countedCents != null) {
        k += tr('Gezählter Bestand', eur(c.countedCents), 'tot') + tr('Differenz', eur(c.differenceCents || 0), 'tot');
        if (c.leaveCents != null) k += tr('In der Kasse gelassen', eur(c.leaveCents)) + tr('Entnahme', eur(c.takeOutCents || 0));
      }
      body += table('Kassenbestand', k);
      const den = rec.count && rec.count.denominations;
      if (den && Object.keys(den).length) {
        body += '<h2>Stückelung</h2><table><tr class="th"><td>Wert</td><td class="n">Anzahl</td><td class="n">Betrag</td></tr>' +
          Object.keys(den).map(Number).sort((a, b) => b - a).map(d => '<tr><td>' + esc(denLabel(d)) + '</td><td class="n">' + den[d] + '</td><td class="n">' + eur(d * den[d]) + '</td></tr>').join('') + '</table>';
      }
    }
    if (SHOW_TSE && R.tse && R.tse.signed) {
      let t = tr('Signierte Vorgänge', R.tse.signed);
      if (R.tse.serial) t += tr('Seriennummer', R.tse.serial);
      if (R.receipts && R.receipts.first) t += tr('Bon-Nummern', R.receipts.first + ' – ' + R.receipts.last);
      body += table('TSE', t);
    }
    const note = (rec.count && rec.count.note) || '';
    if (note) body += '<h2>Notiz</h2><p class="note">' + esc(note) + '</p>';
    body += '<div class="sign"><div>Datum / Unterschrift</div></div>';
    const css = '@page{size:A4;margin:16mm 14mm}html,body{margin:0;background:#fff;color:#000}body{font:10.5pt/1.35 Arial,Helvetica,sans-serif}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px}.brand{font-size:22pt;font-weight:800}.addr{font-size:9pt;color:#333}.meta{text-align:right}.title{font-size:18pt;font-weight:800}.num{font-size:13pt;font-weight:700}.copy{font-size:11pt;font-weight:700}.sub{margin:8px 0 4px}h2{font-size:12pt;margin:16px 0 4px;border-bottom:1px solid #000;padding-bottom:2px}.hint{font-weight:400;font-size:9pt;color:#444}table{border-collapse:collapse;width:100%;page-break-inside:avoid}td{padding:4px 6px;border-bottom:1px solid #bbb}td.n{text-align:right;white-space:nowrap}tr.th td{font-weight:700;font-size:9pt;color:#333}tr.tot td{font-weight:800;border-bottom:1px solid #000}tr.sub td:first-child{padding-left:20px;color:#333}.note{white-space:pre-wrap}.sign{margin-top:46px;width:260px;border-top:1px solid #000;padding-top:4px;font-size:9pt;color:#333}';
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Tagesabschluss ' + esc(rec.number || dmy(rec.day)) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>';
  }


  // ── CSV (Excel/DATEV-freundlich: Semikolon, Dezimalkomma, UTF-8 mit BOM) ──
  const num = c => (Math.round(Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  const cell = v => { const t = String(v == null ? '' : v); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const toCsv = rows => '\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
  function closingCsv(rec) {
    const R = rec.report || {}, v = R.revenue || {}, n = R.net || {}, st = R.storno || {}, c = R.cash, cn = R.counts || {};
    const rows = [['Abschnitt', 'Posten', 'Wert'], ['Kopf', 'Geschäftstag', rec.day], ['Kopf', 'Abschlussnummer', rec.number || ''], ['Kopf', 'Art', isNachtrag(rec) ? 'Nachtrag' : 'Tagesabschluss'], ['Kopf', 'Erstellt', rec.closedAt || ''], ['Kopf', 'Erstellt von', who(rec)],
      ['Umsatz', 'Anzahl Bestellungen', cn.orders || 0], ['Umsatz', 'Brutto vor Rabatt', num(v.grossBeforeDiscountCents)], ['Umsatz', 'Rabatte', num(v.discountCents)], ['Umsatz', 'Brutto', num(v.grossCents)], ['Umsatz', 'Bar', num(v.cashCents)], ['Umsatz', 'Karte', num(v.cardCents)], ['Umsatz', 'Sonstige', num(v.otherCents)], ['Umsatz', 'Trinkgeld', num(v.tipCents)],
      ['Storno', 'Anzahl', st.count || 0], ['Storno', 'Betrag', num(st.amountCents)], ['Netto-Umsatz', 'Brutto', num(n.grossCents)], ['Netto-Umsatz', 'Bar', num(n.cashCents)], ['Netto-Umsatz', 'Karte', num(n.cardCents)]];
    for (const r of (R.vat && R.vat.rows) || []) rows.push(['Steuer ' + r.rate + ' %', 'Netto', num(r.netCents)], ['Steuer ' + r.rate + ' %', 'Steuer', num(r.vatCents)], ['Steuer ' + r.rate + ' %', 'Brutto', num(r.grossCents)]);
    for (const r of (R.platform && R.platform.rows) || []) rows.push(['Plattform ' + label(r.key), 'Anzahl', r.count], ['Plattform ' + label(r.key), 'Umsatz', num(r.grossCents)], ['Plattform ' + label(r.key), 'Provision', num(r.commissionCents)]);
    if (c) {
      rows.push(['Kasse', 'Anfangsbestand', num(c.openingCents)], ['Kasse', 'Barumsatz', num(c.salesCents)], ['Kasse', 'Trinkgeld bar', num(c.tipCents)], ['Kasse', 'Storno bar', num(c.refundsCents)], ['Kasse', 'Einlagen', num(c.depositsCents)], ['Kasse', 'Entnahmen', num(c.withdrawalsCents)], ['Kasse', 'Soll-Bestand', num(c.expectedCents)]);
      if (c.countedCents != null) rows.push(['Kasse', 'Gezählt', num(c.countedCents)], ['Kasse', 'Differenz', num(c.differenceCents)], ['Kasse', 'Im Kassenfach gelassen', num(c.leaveCents)], ['Kasse', 'Entnommen', num(c.takeOutCents)]);
    }
    const note = (rec.count && rec.count.note) || ''; if (note) rows.push(['Notiz', '', note]);
    return toCsv(rows);
  }
  // سطر لكل تقفيلة (للمحاسب): rows = ناتج /api/day-closing/list
  function listCsv(rows) {
    return toCsv([['Geschäftstag', 'Nummer', 'Art', 'Erstellt', 'Erstellt von', 'Brutto', 'Umsatzsteuer', 'Kassendifferenz']].concat((rows || []).map(r => [r.day, r.number, r.type === 'NACHTRAG' ? 'Nachtrag' : 'Tagesabschluss', r.closedAt, r.closedBy, num(r.grossCents), num(r.vatCents), r.differenceCents == null ? '' : num(r.differenceCents)])));
  }
  const api = { closingCsv, listCsv, receiptLines, receiptHtml, a4Html, eur, dmy, DEFAULT_HEADER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NARA_CLOSING_PRINT = api;
})(typeof window !== 'undefined' ? window : globalThis);
