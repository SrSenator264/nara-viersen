'use strict';
/* تقفيلة اليوم (Tagesabschluss) — واجهة كروت. الحساب كلو بالسيرفر (day-closing.js)؛ هون عرض + عدّ الصندوق + أزرار.
   فعلي | تدريب: الخيار بيظهر بس لما وضع التدريب مفعّل على هالجهاز (nara-kasse-training). التدريب ما بيتحفظ أبداً. */
(() => {
 const $ = s => document.querySelector(s);
 const lang = () => { try { if (window.NARA_LANG) return window.NARA_LANG.get(); const l = localStorage.getItem('nara-kasse-language'); return ['de', 'ar', 'en'].includes(l) ? l : 'de'; } catch (e) { return 'de'; } };
 const T = {
  de: { title: 'Flamo · Tagesabschluss', h1: 'Tagesabschluss 📊', back: 'Zurück zur Kasse', refresh: 'Aktualisieren', loading: 'Lädt …', today: 'Heute', real: 'Echt', train: 'Übung',
   open: 'Offen', closedAs: n => `Abgeschlossen · ${n}`, noSales: 'Keine Umsätze an diesem Tag.',
   sales: '💶 Umsatz', orders: 'Bestellungen', avg: 'Ø Bestellung', cash: 'Bar', card: 'Karte', other: 'Sonstige', tip: 'Trinkgeld (nicht im Umsatz)', discount: 'Rabatte', storno: 'Storno', cancelled: 'Storniert vor Zahlung', netAfter: 'Umsatz nach Storno',
   vat: '🧾 Steuer', net: 'Netto', tax: 'Steuer', gross: 'Brutto', total: 'Gesamt',
   plat: '🛵 Plattformen', platHint: 'Nur zur Info – nicht in der Kasse.', count: 'Anzahl', commission: 'Provision', cashDue: 'Bar zu kassieren',
   tse: '🛡️ TSE', signed: 'signiert', unsigned: 'ohne Signatur', serial: 'Seriennummer', bons: 'Bons',
   cashCard: '🧮 Kasse zählen', opening: 'Anfangsbestand', cashSales: 'Barumsatz', tipCash: 'Trinkgeld bar', refunds: 'Storno bar', deposits: 'Einlagen', withdrawals: 'Entnahmen', expected: 'Soll', counted: 'Gezählt', diff: 'Differenz',
   stOK: 'Stimmt ✅', stOver: 'Überschuss', stShort: 'Fehlbetrag', leave: 'In der Kasse lassen', takeOut: 'Entnahme', note: 'Notiz (optional)', total2: 'Gesamtbetrag direkt eingeben',
   openOrders: n => `⚠️ ${n} offene Bestellungen`, missed: d => `⚠️ ${d} wurde nicht abgeschlossen`, late: (n, a) => `⚠️ Umsätze nach dem Abschluss: ${n} · ${a}`, needCount: 'Bitte zuerst die Kasse zählen.', badLeave: 'Betrag für „In der Kasse lassen“ ist ungültig.',
   closeDay: '✅ Tag abschließen', confirm: (d, g, c, df) => `Tag ${d} abschließen?\nUmsatz ${g}\nGezählt ${c}\nDifferenz ${df}\n\nDanach kann der Abschluss nicht mehr geändert werden.`, nachtrag: '📎 Nachtrag erstellen', nachtraege: '📎 Nachträge', saved: n => `Gespeichert: ${n}`,
   err: { ALREADY_CLOSED: 'Dieser Tag ist bereits abgeschlossen.', COUNT_REQUIRED: 'Gezählter Kassenbestand fehlt.', FUTURE_DAY: 'Der Tag liegt in der Zukunft.', NO_CLOSING: 'Für diesen Tag gibt es noch keinen Abschluss.', NOTHING_NEW: 'Keine neuen Umsätze seit dem Abschluss.', FORBIDDEN: 'Keine Berechtigung.', DENOMINATIONS_MISMATCH: 'Stückelung passt nicht zum Betrag.', BAD_LEAVE: 'Ungültiger Betrag für „In der Kasse lassen“.', gen: 'Fehler — bitte erneut versuchen.' } },
  ar: { title: 'Flamo · تقفيلة اليوم', h1: 'تقفيلة اليوم 📊', back: 'رجوع عالكاشير', refresh: 'حدّث', loading: 'عم يحمّل …', today: 'اليوم', real: 'فعلي', train: 'تدريب',
   open: 'مفتوحة', closedAs: n => `مقفولة · ${n}`, noSales: 'ما في مبيعات بهاليوم.',
   sales: '💶 المبيعات', orders: 'الطلبات', avg: 'متوسط الطلب', cash: 'كاش', card: 'كارت', other: 'أخرى', tip: 'بقشيش (مو بالمبيعات)', discount: 'الخصومات', storno: 'Storno', cancelled: 'ملغاة قبل الدفع', netAfter: 'المبيعات بعد الـStorno',
   vat: '🧾 الضريبة', net: 'صافي', tax: 'ضريبة', gross: 'إجمالي', total: 'المجموع',
   plat: '🛵 المنصات', platHint: 'للمعلومة بس، مو داخلة بالصندوق.', count: 'العدد', commission: 'العمولة', cashDue: 'كاش عند التسليم',
   tse: '🛡️ TSE', signed: 'موقّعة', unsigned: 'بدون توقيع', serial: 'الرقم التسلسلي', bons: 'الوصولات',
   cashCard: '🧮 عدّ الصندوق', opening: 'رصيد البداية', cashSales: 'مبيعات الكاش', tipCash: 'بقشيش كاش', refunds: 'Storno كاش', deposits: 'إيداعات', withdrawals: 'مسحوبات', expected: 'المتوقع', counted: 'المعدود', diff: 'الفرق',
   stOK: 'مظبوط ✅', stOver: 'زيادة', stShort: 'نقص', leave: 'بخلّي بالصندوق لبكرة', takeOut: 'بسحب', note: 'ملاحظة (اختياري)', total2: 'ادخل المبلغ الكلي مباشرة',
   openOrders: n => `⚠️ في ${n} طلبات مفتوحة غير مدفوعة`, missed: d => `⚠️ يوم ${d} ما انقفل`, late: (n, a) => `⚠️ في مبيعات بعد التقفيلة: ${n} · ${a}`, needCount: 'عدّ الصندوق أول.', badLeave: 'مبلغ "بخلّي بالصندوق" غلط.',
   closeDay: '✅ قفّل اليوم', confirm: (d, g, c, df) => `نقفّل يوم ${d}؟\nالمبيعات ${g}\nالمعدود ${c}\nالفرق ${df}\n\nبعد التقفيل ما بتتعدّل.`, nachtrag: '📎 سجّل ما بعد التقفيلة (Nachtrag)', nachtraege: '📎 الـNachträge', saved: n => `انحفظت: ${n}`,
   err: { ALREADY_CLOSED: 'هاد اليوم مقفول من قبل.', COUNT_REQUIRED: 'لازم تعدّ الصندوق.', FUTURE_DAY: 'اليوم لسا ما إجا.', NO_CLOSING: 'هاد اليوم ما إلو تقفيلة.', NOTHING_NEW: 'ما في مبيعات جديدة بعد التقفيلة.', FORBIDDEN: 'ما عندك صلاحية.', DENOMINATIONS_MISMATCH: 'العدّ ما بيطابق المبلغ.', BAD_LEAVE: 'مبلغ "بخلّي بالصندوق" غلط.', gen: 'صار خطأ، جرّب مرة تانية.' } },
  en: { title: 'Flamo · End of day', h1: 'End of day 📊', back: 'Back to cashier', refresh: 'Refresh', loading: 'Loading …', today: 'Today', real: 'Real', train: 'Practice',
   open: 'Open', closedAs: n => `Closed · ${n}`, noSales: 'No sales on this day.',
   sales: '💶 Sales', orders: 'Orders', avg: 'Avg. order', cash: 'Cash', card: 'Card', other: 'Other', tip: 'Tips (not in sales)', discount: 'Discounts', storno: 'Storno', cancelled: 'Cancelled before payment', netAfter: 'Sales after Storno',
   vat: '🧾 VAT', net: 'Net', tax: 'VAT', gross: 'Gross', total: 'Total',
   plat: '🛵 Platforms', platHint: 'For information only – not in the till.', count: 'Count', commission: 'Commission', cashDue: 'Cash due',
   tse: '🛡️ TSE', signed: 'signed', unsigned: 'unsigned', serial: 'Serial number', bons: 'Receipts',
   cashCard: '🧮 Count the till', opening: 'Opening float', cashSales: 'Cash sales', tipCash: 'Cash tips', refunds: 'Cash Storno', deposits: 'Deposits', withdrawals: 'Withdrawals', expected: 'Expected', counted: 'Counted', diff: 'Difference',
   stOK: 'Balanced ✅', stOver: 'Over', stShort: 'Short', leave: 'Leave in the till', takeOut: 'Take out', note: 'Note (optional)', total2: 'Enter total directly',
   openOrders: n => `⚠️ ${n} open unpaid orders`, missed: d => `⚠️ ${d} was not closed`, late: (n, a) => `⚠️ Sales after closing: ${n} · ${a}`, needCount: 'Please count the till first.', badLeave: 'Invalid amount for "Leave in the till".',
   closeDay: '✅ Close the day', confirm: (d, g, c, df) => `Close day ${d}?\nSales ${g}\nCounted ${c}\nDifference ${df}\n\nAfter closing it cannot be changed.`, nachtrag: '📎 Create Nachtrag', nachtraege: '📎 Nachträge', saved: n => `Saved: ${n}`,
   err: { ALREADY_CLOSED: 'This day is already closed.', COUNT_REQUIRED: 'Counted cash is missing.', FUTURE_DAY: 'The day is in the future.', NO_CLOSING: 'This day has no closing yet.', NOTHING_NEW: 'No new sales since closing.', FORBIDDEN: 'No permission.', DENOMINATIONS_MISMATCH: 'Counting does not match the amount.', BAD_LEAVE: 'Invalid amount for "Leave in the till".', gen: 'Error — please try again.' } }
 };
 const tr = k => { const v = (T[lang()] || T.de)[k]; return v !== undefined ? v : T.de[k]; };
 const LABELS = { LIEFERANDO: 'Lieferando', WOLT: 'Wolt', UBER_EATS: 'Uber Eats', LANCH: 'Lanch', LOCO: 'Loco Chicken' };
 const DEN = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
 const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 const euro = c => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((c || 0) / 100);
 const dmy = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : (d || '');
 const toCents = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
 const inEuro = c => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
 const denLabel = c => c >= 100 ? (c / 100) + ' €' : c + ' ct';
 const trainingOn = () => { try { return localStorage.getItem('nara-kasse-training') === '1'; } catch (e) { return false; } };

 const S = { day: '', today: '', mode: trainingOn() ? 'TRAINING' : 'REAL', report: null, status: null, record: null, nachtraege: [], user: null, counts: {}, manual: false, total: null, opening: null, leave: null, note: '', touched: false, msg: null, busy: false, seq: 0 };
 const canClose = () => !!S.user && (S.user.role === 'OWNER' || S.user.role === 'MANAGER');
 const tf = () => trainingOn();

 async function api(method, url, body) {
  try {
   const r = await fetch(url, { method, cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
   let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
   return { ok: r.ok, status: r.status, json: j || {} };
  } catch (e) { return { ok: false, status: 0, json: {} }; }
 }
 const errText = j => (tr('err')[j && j.code] || tr('err').gen);

 async function load(resetInputs) {
  const my = ++S.seq;
  if (resetInputs) { S.counts = {}; S.manual = false; S.total = null; S.opening = null; S.leave = null; S.note = ''; S.touched = false; }
  const qs = new URLSearchParams({ mode: S.mode }); if (S.day) qs.set('day', S.day);
  const r = await api('GET', '/api/day-closing/preview?' + qs);
  if (my !== S.seq) return;
  if (!r.ok) {
   if (S.mode === 'TRAINING' && r.status === 403) { S.mode = 'REAL'; return load(true); }
   S.msg = { err: errText(r.json) }; S.report = null; return render();
  }
  if (!S.day) S.today = r.json.day;
  S.day = r.json.day; S.report = r.json.report; S.status = r.json.status; S.record = null; S.nachtraege = [];
  if (S.status && S.status.closed) {
   const rr = await api('GET', '/api/day-closing/record?id=' + encodeURIComponent(S.status.closing.id));
   if (rr.ok) S.record = rr.json.record;
   const l = await api('GET', '/api/day-closing/list?limit=200');
   if (l.ok) S.allRows = l.json.rows || [];
   if (l.ok) S.nachtraege = (l.json.rows || []).filter(x => x.day === S.day && x.type === 'NACHTRAG');
   if (my !== S.seq) return;
  }
  render();
 }

 // ── عرض ──
 const row = (label, val, cls) => `<div class="row ${cls || ''}"><span>${label}</span><b>${val}</b></div>`;
 const card = (cls, title, body) => `<section class="card ${cls || ''}"><h2>${title}</h2>${body}</section>`;

 function barHtml() {
  const closed = S.status && S.status.closed;
  const chip = S.mode === 'TRAINING' ? '' : closed ? `<span class="sd-chip green">${esc(tr('closedAs')(S.status.closing.number))}</span>` : `<span class="sd-chip amber">🟢 ${tr('open')}</span>`;
  const seg = tf() ? `<div class="sd-seg"><button type="button" data-mode="REAL" class="${S.mode === 'REAL' ? 'on' : ''}">${tr('real')}</button><button type="button" data-mode="TRAINING" class="${S.mode === 'TRAINING' ? 'on train' : ''}">${tr('train')}</button></div>` : '';
  return `<button class="sd-btn ghost" type="button" data-day="-1" aria-label="-1">◀</button><input class="sd-in" id="sd-day" type="date" value="${esc(S.day)}"${S.today ? ` max="${esc(S.today)}"` : ''}><button class="sd-btn ghost" type="button" data-day="1" aria-label="+1">▶</button><button class="sd-btn ghost" type="button" data-day="0">${tr('today')}</button>${seg}${chip}`;
 }

 function salesCard(R) {
  const v = R.revenue, n = R.counts;
  let b = `<div class="big">${euro(R.net.grossCents)}</div><div class="muted">${tr('netAfter')}${R.storno.count ? '' : ''}</div>`;
  b += `<div class="tiles"><div class="tile"><span>🧾 ${tr('orders')}</span><b>${n.orders}</b></div><div class="tile"><span>📊 ${tr('avg')}</span><b>${euro(n.avgCents)}</b></div></div>`;
  b += row('💵 ' + tr('cash'), euro(v.cashCents)) + row('💳 ' + tr('card'), euro(v.cardCents));
  if (v.otherCents) b += row(tr('other'), euro(v.otherCents));
  b += row('🎁 ' + tr('tip'), euro(v.tipCents), 'sub');
  if (v.discountCents) b += row('🏷️ ' + tr('discount'), '− ' + euro(v.discountCents), 'sub');
  if (R.storno.count) b += row(`↩️ ${tr('storno')} (${R.storno.count})`, '− ' + euro(R.storno.amountCents), 'sub');
  if (R.cancelled.count) b += row(`🚫 ${tr('cancelled')} (${R.cancelled.count})`, euro(R.cancelled.cartCents), 'sub');
  if (!n.orders && !R.storno.count) b += `<p class="muted">${tr('noSales')}</p>`;
  return card('', tr('sales'), b);
 }
 function vatCard(R) {
  if (!R.vat.rows.length) return '';
  let b = `<div class="vrow head"><span></span><span>${tr('net')}</span><span>${tr('tax')}</span><span>${tr('gross')}</span></div>`;
  b += R.vat.rows.map(r => `<div class="vrow"><b>${r.rate} %</b><span>${euro(r.netCents)}</span><span>${euro(r.vatCents)}</span><span>${euro(r.grossCents)}</span></div>`).join('');
  b += `<div class="vrow"><b>${tr('total')}</b><span>${euro(R.vat.netCents)}</span><span>${euro(R.vat.vatCents)}</span><span><b>${euro(R.vat.grossCents)}</b></span></div>`;
  return card('', tr('vat'), b);
 }
 function platformCard(R) {
  if (!R.platform.rows.length) return '';
  let b = `<p class="muted">${tr('platHint')}</p>` + R.platform.rows.map(r => row(`${esc(LABELS[r.key] || r.key)} · ${r.count}× · ${r.rate}% ${tr('commission')} ${euro(r.commissionCents)}${r.cashDueCents ? ` · ${tr('cashDue')} ${euro(r.cashDueCents)}` : ''}`, euro(r.grossCents))).join('');
  b += row(tr('total'), euro(R.platform.grossCents), 'strong');
  return card('', tr('plat'), b);
 }

 const countedNow = () => S.manual ? (S.total == null ? 0 : S.total) : DEN.reduce((s, c) => s + c * (S.counts[c] || 0), 0);
 const openingNow = () => S.opening != null ? S.opening : S.report.cash.openingCents;
 const expectedNow = () => S.report.cash.expectedCents - S.report.cash.openingCents + openingNow();
 const leaveNow = () => S.leave != null ? S.leave : countedNow();
 const stateOf = d => d === 0 ? 'ok' : d > 0 ? 'over' : 'short';
 const stateText = (d, st) => st === 'ok' ? tr('stOK') : (st === 'over' ? '🔺 ' + tr('stOver') + ' ' : '🔻 ' + tr('stShort') + ' ') + euro(Math.abs(d));

 function cashCard(R, closed) {
  const c = R.cash;
  if (closed) {
   const rec = S.record.count || {}, df = c.differenceCents || 0;
   let b = row(tr('opening'), euro(c.openingCents)) + row('+ ' + tr('cashSales'), euro(c.salesCents));
   if (c.tipCents) b += row('+ ' + tr('tipCash'), euro(c.tipCents));
   if (c.refundsCents) b += row('− ' + tr('refunds'), euro(c.refundsCents));
   if (c.depositsCents) b += row('+ ' + tr('deposits'), euro(c.depositsCents));
   if (c.withdrawalsCents) b += row('− ' + tr('withdrawals'), euro(c.withdrawalsCents));
   b += row(tr('expected'), euro(c.expectedCents), 'strong') + row(tr('counted'), euro(c.countedCents), 'strong');
   b += `<div class="diff ${stateOf(df)}"><span>${tr('diff')}</span><span>${stateText(df, stateOf(df))}</span></div>`;
   b += row(tr('leave'), euro(rec.leaveCents != null ? rec.leaveCents : c.leaveCents)) + row(tr('takeOut'), euro(c.takeOutCents));
   if (rec.note) b += `<p class="muted">📝 ${esc(rec.note)}</p>`;
   return card('', tr('cashCard'), b);
  }
  const grid = DEN.map(d => `<div class="den"><span>${denLabel(d)}</span><div class="stp"><button type="button" data-act="dm" data-c="${d}">−</button><b id="dn-${d}">${S.counts[d] || 0}</b><button type="button" data-act="dp" data-c="${d}">+</button></div></div>`).join('');
  let b = `<div class="den-grid">${grid}</div><div class="fields"><label>${tr('opening')}<input class="sd-in" id="in-open" inputmode="decimal" value="${inEuro(openingNow())}"></label><label>${tr('total2')}<input class="sd-in" id="in-total" inputmode="decimal" value="${inEuro(countedNow())}"></label><label>${tr('leave')}<input class="sd-in" id="in-leave" inputmode="decimal" value="${inEuro(leaveNow())}"></label></div>`;
  b += row(tr('expected'), `<span id="c-exp">${euro(expectedNow())}</span>`, 'strong');
  b += `<div class="diff" id="c-diff"></div>` + row(tr('takeOut'), `<span id="c-take"></span>`);
  b += `<label class="muted" style="display:block;margin-top:10px">${tr('note')}<textarea class="sd-in" id="in-note">${esc(S.note)}</textarea></label>`;
  return card('', tr('cashCard'), b);
 }
 function updateCash() {
  if (!S.report || $('#c-diff') == null) return;
  const cn = countedNow(), ex = expectedNow(), df = cn - ex, st = stateOf(df);
  for (const d of DEN) { const e = $('#dn-' + d); if (e) e.textContent = S.counts[d] || 0; }
  const t = $('#in-total'); if (t && !S.manual) t.value = inEuro(cn);
  const lv = $('#in-leave'); if (lv && S.leave == null) lv.value = inEuro(cn);
  $('#c-exp').textContent = euro(ex);
  const el = $('#c-diff'); el.className = 'diff ' + st; el.innerHTML = `<span>${tr('diff')}</span><span>${stateText(df, st)}</span>`;
  $('#c-take').textContent = euro(Math.max(0, cn - leaveNow()));
 }
 function warnCard(closed) {
  if (S.mode !== 'REAL') return S.report.open.count ? card('warn', tr('openOrders')(S.report.open.count), '') : '';
  let out = '';
  if (!closed && S.report.open.count) out += card('warn', tr('openOrders')(S.report.open.count), `<ul class="list">${S.report.open.rows.map(o => `<li>${esc(o.code || o.id)} · ${euro(o.totalCents)}</li>`).join('')}</ul>`);
  if (!closed && S.status && S.status.missedDays.length) out += card('warn', S.status.missedDays.map(d => `<button class="sd-btn ghost" type="button" data-goto="${esc(d)}">${tr('missed')(dmy(d))}</button>`).join(' '), '');
  if (closed && S.status.lateSales) out += card('warn', tr('late')(S.status.lateSales.count, euro(S.status.lateSales.grossCents)), canClose() ? `<button class="sd-btn amber" type="button" data-act="nachtrag">${tr('nachtrag')}</button>` : '');
  return out;
 }
 function printBtns(id) {
  return `<span class="pr"><button class="sd-btn ghost sm" type="button" data-act="print" data-kind="a4" data-id="${esc(id || '')}">🖨️ A4</button> <button class="sd-btn ghost sm" type="button" data-act="print" data-kind="r80" data-id="${esc(id || '')}">🧾 80mm</button> <button class="sd-btn ghost sm" type="button" data-act="csv" data-id="${esc(id || '')}">📥 CSV</button></span>`;
 }
 function printCard(closed) {
  if (!canClose()) return '';
  if (closed && S.record) return card('', '🖨️', printBtns(S.record.id) + ' <button class="sd-btn ghost sm" type="button" data-act="csvall">📥 CSV · alle</button>');
  if (S.mode === 'TRAINING' || (S.status && S.status.closed === false && S.mode === 'REAL')) return card('', '🖨️', printBtns(''));
  return '';
 }
 // طباعة بإطار مخفي — الأصل مسجّل بالسيرفر؛ التدريب/المعاينة محلي بدون تسجيل
 function printHtml(html) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.srcdoc = html; f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); };
  document.body.appendChild(f);
 }
 function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
 }
 async function doCsv(id) {
  const P = window.NARA_CLOSING_PRINT; if (!P) return;
  let rec;
  if (id) { const r = await api('GET', '/api/day-closing/record?id=' + encodeURIComponent(id)); if (!r.ok) { S.msg = { err: errText(r.json) }; return render(); } rec = r.json.record; }
  else rec = { day: S.day, type: 'CLOSING', number: '', closedAt: new Date().toISOString(), report: S.report };
  download('tagesabschluss-' + S.day + (rec.number ? '-' + rec.number : '') + '.csv', P.closingCsv(rec));
 }
 async function doCsvAll() {
  const l = await api('GET', '/api/day-closing/list?limit=500'); if (!l.ok) { S.msg = { err: errText(l.json) }; return render(); }
  download('tagesabschluesse.csv', window.NARA_CLOSING_PRINT.listCsv(l.json.rows || []));
 }
 async function doPrint(kind, id) {
  const P = window.NARA_CLOSING_PRINT; if (!P) return;
  let rec, copy = 0, printed = false;
  if (id) {
   const r = await api('POST', kind === 'r80' ? '/api/day-closing/print' : '/api/day-closing/reprint', { id });
   if (!r.ok) { S.msg = { err: errText(r.json) }; return render(); }
   rec = r.json.record; copy = r.json.copyNumber; printed = kind === 'r80' && r.json.mode && r.json.mode !== 'browser';
  } else rec = { day: S.day, type: 'CLOSING', number: '', closedAt: new Date().toISOString(), report: S.report };
  if (printed) { S.msg = { ok: '🖨️ OK' }; return render(); }
  printHtml(kind === 'r80' ? P.receiptHtml(rec, { copyNumber: copy }) : P.a4Html(rec, { copyNumber: copy }));
 }
 function nachtraegeCard() {
  return S.nachtraege.length ? card('', tr('nachtraege'), S.nachtraege.map(n => row(esc(n.number) + ' · ' + esc(String(n.closedAt || '').slice(11, 16)), euro(n.grossCents) + (canClose() ? ' ' + printBtns(n.id) : ''))).join('')) : '';
 }

 function render() {
  document.body.classList.toggle('nara-training', S.mode === 'TRAINING');
  $('#bar').innerHTML = barHtml();
  const root = $('#app');
  if (!S.report) { root.innerHTML = S.msg && S.msg.err ? `<div class="msg err">${esc(S.msg.err)}</div>` : `<p class="muted">${tr('loading')}</p>`; return; }
  const closed = S.mode === 'REAL' && !!(S.status && S.status.closed && S.record), R = closed ? S.record.report : S.report;
  const msg = S.msg ? `<div class="msg ${S.msg.err ? 'err' : 'good'}">${esc(S.msg.err || S.msg.ok)}</div>` : '';
  let actions = '';
  if (!closed && S.mode === 'REAL' && canClose() && !(S.status && S.status.closed)) actions = `<button class="sd-btn go" type="button" data-act="close"${S.busy ? ' disabled' : ''}>${tr('closeDay')}</button>`;
  root.innerHTML = msg + warnCard(closed) + salesCard(R) + vatCard(R) + platformCard(R) + cashCard(R, closed) + nachtraegeCard() + printCard(closed) + actions;
  updateCash();
 }

 // ── أفعال ──
 async function doClose(nachtrag) {
  if (S.busy) return;
  const cn = countedNow(), ex = expectedNow();
  if (!nachtrag) {
   if (!S.touched && ex !== 0) { S.msg = { err: tr('needCount') }; return render(); }
   if (leaveNow() < 0 || leaveNow() > cn) { S.msg = { err: tr('badLeave') }; return render(); }
   if (!confirm(tr('confirm')(dmy(S.day), euro(S.report.net.grossCents), euro(cn), euro(cn - ex)))) return;
  }
  S.busy = true; S.msg = null; render();
  const body = nachtrag ? { day: S.day, nachtrag: true } : { day: S.day, countedCents: cn, leaveCents: leaveNow(), note: S.note, ...(S.opening != null ? { openingCents: S.opening } : {}), ...(!S.manual ? { denominations: Object.fromEntries(DEN.filter(d => S.counts[d]).map(d => [String(d), S.counts[d]])) } : {}) };
  const r = await api('POST', '/api/day-closing/close', body);
  S.busy = false;
  S.msg = r.ok ? { ok: tr('saved')(r.json.record.number) } : { err: errText(r.json) };
  await load(r.ok);
 }

 function bind() {
  const bar = $('#bar'), app = $('#app');
  bar.addEventListener('click', e => {
   const m = e.target.closest('[data-mode]'); if (m) { S.mode = m.dataset.mode; S.msg = null; return load(true); }
   const d = e.target.closest('[data-day]'); if (d) {
    const k = Number(d.dataset.day);
    if (k === 0) S.day = S.today; else { const t = new Date(S.day + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); const nd = t.toISOString().slice(0, 10); if (S.today && nd > S.today) return; S.day = nd; }
    S.msg = null; load(true);
   }
  });
  bar.addEventListener('change', e => { if (e.target.id === 'sd-day' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { S.day = e.target.value; S.msg = null; load(true); } });
  app.addEventListener('click', e => {
   const a = e.target.closest('[data-act]'), g = e.target.closest('[data-goto]');
   if (g) { S.day = g.dataset.goto; S.msg = null; return load(true); }
   if (!a) return;
   const act = a.dataset.act, c = Number(a.dataset.c);
   if (act === 'dp' || act === 'dm') { S.manual = false; S.touched = true; S.counts[c] = Math.max(0, (S.counts[c] || 0) + (act === 'dp' ? 1 : -1)); S.leave = null; updateCash(); }
   else if (act === 'close') doClose(false);
   else if (act === 'nachtrag') doClose(true);
   else if (act === 'csv') doCsv(a.dataset.id);
   else if (act === 'csvall') doCsvAll();
   else if (act === 'print') doPrint(a.dataset.kind, a.dataset.id);
  });
  app.addEventListener('input', e => {
   const id = e.target.id;
   if (id === 'in-open') { S.opening = toCents(e.target.value); S.touched = true; updateCash(); }
   else if (id === 'in-total') { S.manual = true; S.touched = true; S.total = toCents(e.target.value) || 0; S.leave = null; updateCash(); }
   else if (id === 'in-leave') { S.leave = toCents(e.target.value); updateCash(); }
   else if (id === 'in-note') S.note = e.target.value.slice(0, 500);
  });
 }

 function boot() {
  document.title = tr('title'); $('#sd-h1').textContent = tr('h1'); $('#sd-back').textContent = tr('back'); $('#sd-refresh').textContent = tr('refresh');
  if (window.NARA_LANG) window.NARA_LANG.mountSwitcher($('#settlement-lang'));
  $('#sd-refresh').addEventListener('click', () => { S.msg = null; load(false); });
  bind();
  api('GET', '/api/auth/me').then(r => { S.user = (r.json && r.json.user) || null; return load(true); });
  // وضع التدريب على هالجهاز: إذا انطفى وإحنا بالتدريب → فعلي. إذا اشتغل → خيار التدريب بيظهر.
  let last = trainingOn();
  setInterval(() => { const now = trainingOn(); if (now === last) return; last = now; S.mode = now ? 'TRAINING' : 'REAL'; load(true); }, 2000);
 }
 document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
