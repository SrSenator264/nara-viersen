// kasse-payment.js — شاشة الدفع الجديدة بالكاشير.
// - خصم للزبون: 10٪ 12٪ 20٪ أو −1/−2/−3 €، أو رقم بإيدك (٪ أو €). خصم الموظف (Personalessen) مخفي ورا زر صغير.
// - تقسيم الفاتورة: بالتساوي (2–6 أشخاص) أو حسب الأصناف (كل واحد شو أكل). كل واحد بيدفع لحالو.
// - لكل جزء: كاش، كرت، أو كاش + كرت. الباقي للزبون بيتحسب لحالو.
// السيرفر بيحسب الخصم ويتأكد من المبالغ (payment-logic.js). هون بس العرض.
(function () {
  'use strict';
  const T = {
    de: { title: 'Bezahlen', total: 'Summe', discount: 'Rabatt', toPay: 'Zu zahlen', paid: 'Schon bezahlt', open: 'Offen', none: 'Kein Rabatt', pct: '%', eur: '€', custom: 'Eigener', staff: '👤 Personalessen', staffCode: 'Mitarbeiter-Code', check: 'Prüfen', staffOk: 'Personalessen', badCode: 'Code ungültig',
      split: '🧾 Rechnung teilen', noSplit: 'Nicht teilen', equal: 'Gleich teilen', byItem: 'Nach Artikeln', people: 'Personen', person: 'Person', part: 'Teil', partPaid: 'bezahlt', assign: 'Wer hat was?', unassigned: 'Noch nicht zugeordnet',
      cash: '💶 Bar', card: '💳 Karte', mixed: 'Bar + Karte', given: 'Gegeben', change: 'Rückgeld', notEnough: 'Zu wenig gegeben', cashPart: 'Bar-Anteil', cardRest: 'Rest auf Karte',
      cancel: 'Abbrechen', payAll: 'Bezahlen', payPart: 'Teil {n} bezahlen', done: 'Bezahlt ✓', partDone: 'Teil {n} bezahlt ✓ – weiter mit Teil {m}', err: 'Fehler', assignAll: 'Bitte zuerst alle Artikel einer Person zuordnen.' },
    ar: { title: 'الدفع', total: 'المجموع', discount: 'خصم', toPay: 'المطلوب', paid: 'اندفع', open: 'باقي', none: 'بلا خصم', pct: '٪', eur: '€', custom: 'غير', staff: '👤 أكل موظف', staffCode: 'كود الموظف', check: 'تحقق', staffOk: 'أكل موظف', badCode: 'الكود غلط',
      split: '🧾 قسّم الفاتورة', noSplit: 'بلا تقسيم', equal: 'بالتساوي', byItem: 'حسب الأصناف', people: 'أشخاص', person: 'شخص', part: 'جزء', partPaid: 'اندفع', assign: 'مين أكل شو؟', unassigned: 'لسا مو موزّع',
      cash: '💶 كاش', card: '💳 كرت', mixed: 'كاش + كرت', given: 'أعطى', change: 'الباقي إلو', notEnough: 'المبلغ ما بيكفي', cashPart: 'قديش كاش', cardRest: 'الباقي عالكرت',
      cancel: 'إلغاء', payAll: 'ادفع', payPart: 'ادفع الجزء {n}', done: 'اندفع ✓', partDone: 'الجزء {n} اندفع ✓ – هلق الجزء {m}', err: 'صار في غلط', assignAll: 'وزّع كل الأصناف عالأشخاص أول.' },
    en: { title: 'Payment', total: 'Total', discount: 'Discount', toPay: 'To pay', paid: 'Already paid', open: 'Open', none: 'No discount', pct: '%', eur: '€', custom: 'Custom', staff: '👤 Staff meal', staffCode: 'Employee code', check: 'Check', staffOk: 'Staff meal', badCode: 'Invalid code',
      split: '🧾 Split bill', noSplit: 'No split', equal: 'Split equally', byItem: 'By items', people: 'people', person: 'Person', part: 'Part', partPaid: 'paid', assign: 'Who had what?', unassigned: 'Not assigned yet',
      cash: '💶 Cash', card: '💳 Card', mixed: 'Cash + card', given: 'Given', change: 'Change', notEnough: 'Not enough given', cashPart: 'Cash part', cardRest: 'Rest on card',
      cancel: 'Cancel', payAll: 'Pay', payPart: 'Pay part {n}', done: 'Paid ✓', partDone: 'Part {n} paid ✓ – next: part {m}', err: 'Error', assignAll: 'Please assign every item to a person first.' },
  };
  const lang = () => (window.NARA_LANG && NARA_LANG.get()) || 'de';
  const t = k => (T[lang()] || T.de)[k] ?? T.de[k] ?? k;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = c => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((c || 0) / 100);
  const cents = v => { const n = Math.round(parseFloat(String(v ?? '').replace(',', '.')) * 100); return Number.isFinite(n) ? n : 0; };
  const pickName = s => (window.NARA_LANG ? NARA_LANG.pick(s) : String(s ?? ''));

  // الأقسام: جزء بالتساوي → مبالغ؛ حسب الأصناف → مبالغ بنسبة الإجمالي (الخصم موزّع)
  function equalParts(net, n) { const base = Math.floor(net / n), out = Array(n).fill(base); out[n - 1] += net - base * n; return out; }
  function itemParts(units, owners, n, gross, net) {
    const g = Array(n).fill(0); units.forEach((u, i) => { if (owners[i] != null) g[owners[i]] += u.cents; });
    const out = g.map(x => (gross ? Math.round(x * net / gross) : 0));
    const diff = net - out.reduce((s, x) => s + x, 0); const last = g.map((x, i) => x > 0 ? i : -1).filter(i => i >= 0).pop();
    if (last != null) out[last] += diff;
    return out;
  }

  async function serverOrder(id) {
    try { const r = await fetch('/api/kasse-state', { cache: 'no-store' }); const j = await r.json(); return (j.orders || []).find(o => String(o.id) === String(id)) || null; } catch (e) { return null; }
  }

  async function open(kind, ctx) {
    const o = ctx.current(); if (!o) return;
    const gross = ctx.total(o);
    const srv = await serverOrder(o.id);
    let paidBefore = (srv && srv.paidCents) || 0;
    if (paidBefore > 0) o.paidCents = paidBefore; // السلة بتنقفل بالكاشير
    const lockedDiscount = paidBefore > 0 ? (srv.billDiscount || null) : null;
    const units = []; (o.cart || []).forEach(it => { for (let q = 0; q < (Number(it.quantity) || 0); q++) units.push({ name: it.name, cents: Number(it.unitCents) || 0 }); });

    const st = { disc: lockedDiscount ? { type: lockedDiscount.type, value: lockedDiscount.value, amountCents: lockedDiscount.amountCents, employeeCode: lockedDiscount.employeeCode } : null,
      split: 'none', n: 2, owners: units.map(() => null), partIdx: 0, partsPaid: [], method: kind === 'CARD' ? 'CARD' : 'CASH', given: '', cashPart: '' };

    let d = document.getElementById('np-dialog');
    if (d) d.remove();
    d = document.createElement('dialog'); d.id = 'np-dialog'; d.dir = lang() === 'ar' ? 'rtl' : 'ltr'; document.body.appendChild(d);

    const discCents = () => {
      if (!st.disc) return 0;
      if (st.disc.amountCents != null && (st.disc.type === 'EMPLOYEE' || lockedDiscount)) return Math.min(gross, st.disc.amountCents);
      if (st.disc.type === 'PERCENT') return Math.min(gross, Math.round(gross * st.disc.value / 100));
      if (st.disc.type === 'AMOUNT') return Math.min(gross, st.disc.value);
      return 0;
    };
    const net = () => gross - discCents();
    const parts = () => {
      if (st.split === 'equal') return equalParts(net(), st.n);
      if (st.split === 'items') return itemParts(units, st.owners, st.n, gross, net());
      return [net()];
    };
    const remaining = () => net() - paidBefore;
    // المبلغ للجزء الحالي (ما بيتجاوز الباقي)
    const curAmount = () => {
      if (st.split === 'none') return remaining();
      const p = parts(); return Math.min(remaining(), p[st.partIdx] || 0);
    };

    function render() {
      const dc = discCents(), amount = curAmount(), locked = paidBefore > 0;
      const chip = (label, on, attrs) => '<button type="button" class="np-chip' + (on ? ' on' : '') + '" ' + attrs + '>' + label + '</button>';
      const isD = (ty, v) => st.disc && st.disc.type === ty && Number(st.disc.value) === v;
      let h = '<h2>' + t('title') + '</h2>';
      h += '<div class="np-sum"><div><span>' + t('total') + '</span><b>' + euro(gross) + '</b></div>' + (dc ? '<div class="np-disc"><span>' + t('discount') + (st.disc.type === 'PERCENT' ? ' ' + st.disc.value + '%' : st.disc.type === 'EMPLOYEE' ? ' · ' + t('staffOk') : '') + '</span><b>−' + euro(dc) + '</b></div>' : '')
        + (paidBefore ? '<div><span>' + t('paid') + '</span><b>' + euro(paidBefore) + '</b></div>' : '') + '<div class="np-big"><span>' + (paidBefore ? t('open') : t('toPay')) + '</span><b>' + euro(remaining()) + '</b></div></div>';
      // الخصم
      h += '<fieldset class="np-row"' + (locked ? ' disabled' : '') + '><legend>' + t('discount') + '</legend>'
        + chip(t('none'), !st.disc, 'data-d="none"')
        + [10, 12, 20].map(v => chip(v + '%', isD('PERCENT', v), 'data-d="p" data-v="' + v + '"')).join('')
        + [100, 200, 300].map(v => chip('−' + (v / 100) + ' €', isD('AMOUNT', v), 'data-d="a" data-v="' + v + '"')).join('')
        + '<span class="np-custom"><input id="np-cp" inputmode="decimal" placeholder="%" value="' + (st.disc && st.disc.type === 'PERCENT' && ![10, 12, 20].includes(Number(st.disc.value)) ? st.disc.value : '') + '"><input id="np-ce" inputmode="decimal" placeholder="€" value="' + (st.disc && st.disc.type === 'AMOUNT' && ![100, 200, 300].includes(Number(st.disc.value)) ? (st.disc.value / 100) : '') + '"></span>'
        + chip(t('staff'), st.disc && st.disc.type === 'EMPLOYEE', 'data-d="staff"')
        + (st.showStaff ? '<span class="np-staff"><input id="np-sc" placeholder="' + t('staffCode') + '"><button type="button" class="np-chip" id="np-scb">' + t('check') + '</button><small id="np-scm"></small></span>' : '')
        + '</fieldset>';
      // التقسيم
      h += '<fieldset class="np-row"><legend>' + t('split') + '</legend>'
        + chip(t('noSplit'), st.split === 'none', 'data-s="none"') + chip(t('equal'), st.split === 'equal', 'data-s="equal"') + chip(t('byItem'), st.split === 'items', 'data-s="items"')
        + (st.split !== 'none' ? '<span class="np-n">' + [2, 3, 4, 5, 6].map(v => chip(v + ' ' + (v === 1 ? t('person') : t('people')), st.n === v, 'data-n="' + v + '"')).join('') + '</span>' : '')
        + '</fieldset>';
      if (st.split === 'items') {
        h += '<div class="np-items"><div class="np-sub">' + t('assign') + '</div>' + units.map((u, i) => '<div class="np-unit"><span>' + esc(u.name) + ' <small>' + euro(u.cents) + '</small></span><span>' + Array.from({ length: st.n }, (_, p) => '<button type="button" class="np-p' + (st.owners[i] === p ? ' on' : '') + '" data-u="' + i + '" data-p="' + p + '">' + (p + 1) + '</button>').join('') + '</span></div>').join('') + '</div>';
      }
      if (st.split !== 'none') {
        const p = parts();
        h += '<div class="np-parts">' + p.map((c, i) => '<button type="button" class="np-part' + (i === st.partIdx ? ' on' : '') + (st.partsPaid.includes(i) ? ' paid' : '') + '" data-part="' + i + '"' + (st.partsPaid.includes(i) ? ' disabled' : '') + '><span>' + t('part') + ' ' + (i + 1) + '</span><b>' + euro(c) + '</b>' + (st.partsPaid.includes(i) ? '<small>' + t('partPaid') + ' ✓</small>' : '') + '</button>').join('') + '</div>';
      }
      // طريقة الدفع
      const giv = cents(st.given), cp = Math.min(amount, cents(st.cashPart));
      h += '<div class="np-pay"><div class="np-amount">' + (st.split !== 'none' ? t('part') + ' ' + (st.partIdx + 1) + ': ' : '') + '<b>' + euro(amount) + '</b></div>'
        + '<div class="np-methods">' + chip(t('cash'), st.method === 'CASH', 'data-m="CASH"') + chip(t('card'), st.method === 'CARD', 'data-m="CARD"') + chip(t('mixed'), st.method === 'MIXED', 'data-m="MIXED"') + '</div>';
      if (st.method === 'MIXED') h += '<label>' + t('cashPart') + '<input id="np-cash" inputmode="decimal" value="' + esc(st.cashPart) + '"></label><div class="np-note">' + t('cardRest') + ': <b>' + euro(Math.max(0, amount - cp)) + '</b></div>';
      if (st.method === 'CASH' || st.method === 'MIXED') {
        const due = st.method === 'CASH' ? amount : cp;
        h += '<label>' + t('given') + '<input id="np-given" inputmode="decimal" placeholder="' + (due / 100).toFixed(2) + '" value="' + esc(st.given) + '"></label><div class="np-quick">' + [5, 10, 20, 50, 100].map(v => '<button type="button" class="np-chip" data-g="' + v + '">' + v + ' €</button>').join('') + '</div>'
          + (st.given !== '' ? '<div class="np-change' + (giv < due ? ' bad' : '') + '">' + (giv < due ? t('notEnough') : t('change') + ': <b>' + euro(giv - due) + '</b>') + '</div>' : '');
      }
      h += '</div><div class="np-msg" id="np-msg"></div><div class="np-acts"><button type="button" class="np-cancel">' + t('cancel') + '</button><button type="button" class="np-go">' + (st.split !== 'none' ? t('payPart').replace('{n}', st.partIdx + 1) : t('payAll')) + ' · ' + euro(amount) + '</button></div>';
      d.innerHTML = h;
      bind();
    }

    function setMsg(s) { const m = d.querySelector('#np-msg'); if (m) m.textContent = s || ''; }
    function bind() {
      d.querySelector('.np-cancel').onclick = () => d.close();
      d.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
        const k = b.dataset.d, v = Number(b.dataset.v);
        if (k === 'none') st.disc = null; else if (k === 'p') st.disc = { type: 'PERCENT', value: v }; else if (k === 'a') st.disc = { type: 'AMOUNT', value: v }; else if (k === 'staff') st.showStaff = !st.showStaff;
        render();
      });
      const cp = d.querySelector('#np-cp'), ce = d.querySelector('#np-ce');
      if (cp) cp.onchange = () => { const v = parseFloat(cp.value.replace(',', '.')); st.disc = v > 0 && v <= 100 ? { type: 'PERCENT', value: v } : null; render(); };
      if (ce) ce.onchange = () => { const v = cents(ce.value); st.disc = v > 0 ? { type: 'AMOUNT', value: v } : null; render(); };
      const scb = d.querySelector('#np-scb');
      if (scb) scb.onclick = async () => {
        const code = d.querySelector('#np-sc').value.trim(); if (!code) return;
        try { const r = await fetch('/api/cashier/employee-lookup?code=' + encodeURIComponent(code)); const j = await r.json(); if (!r.ok) throw Error(j.error || t('badCode'));
          const pct = Number(j.employee.discountPercent || 20); st.disc = { type: 'EMPLOYEE', value: pct, amountCents: Math.min(gross, Math.round(gross * pct / 100)), employeeCode: code, employeeName: j.employee.name }; st.showStaff = false; render();
        } catch (e) { const m = d.querySelector('#np-scm'); if (m) m.textContent = e.message; }
      };
      d.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st.split = b.dataset.s; st.partIdx = 0; st.partsPaid = []; render(); });
      d.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { st.n = Number(b.dataset.n); st.owners = st.owners.map(x => (x != null && x < st.n ? x : null)); st.partIdx = 0; render(); });
      d.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const u = Number(b.dataset.u), p = Number(b.dataset.p); st.owners[u] = st.owners[u] === p ? null : p; render(); });
      d.querySelectorAll('[data-part]').forEach(b => b.onclick = () => { st.partIdx = Number(b.dataset.part); st.given = ''; st.cashPart = ''; render(); });
      d.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { st.method = b.dataset.m; render(); });
      d.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { st.given = b.dataset.g; render(); });
      const gv = d.querySelector('#np-given'); if (gv) gv.oninput = () => { st.given = gv.value; const c = d.querySelector('.np-change'); const due = st.method === 'CASH' ? curAmount() : Math.min(curAmount(), cents(st.cashPart)); const g = cents(gv.value); if (c) { c.className = 'np-change' + (g < due ? ' bad' : ''); c.innerHTML = g < due ? t('notEnough') : t('change') + ': <b>' + euro(g - due) + '</b>'; } };
      const cs = d.querySelector('#np-cash'); if (cs) cs.onchange = () => { st.cashPart = cs.value; render(); };
      d.querySelector('.np-go').onclick = submit;
    }

    async function submit() {
      const amount = curAmount();
      if (st.split === 'items' && st.owners.some(x => x == null)) { setMsg(t('assignAll')); return; }
      if (amount <= 0) { setMsg(t('err')); return; }
      const lines = [];
      if (st.method === 'CARD') lines.push({ method: 'CARD', amountCents: amount });
      else if (st.method === 'CASH') { const g = st.given === '' ? amount : cents(st.given); if (g < amount) { setMsg(t('notEnough')); return; } lines.push({ method: 'CASH', amountCents: amount, amountReceivedCents: g }); }
      else { const c = Math.min(amount, cents(st.cashPart)); const g = st.given === '' ? c : cents(st.given); if (c > 0 && g < c) { setMsg(t('notEnough')); return; } if (c > 0) lines.push({ method: 'CASH', amountCents: c, amountReceivedCents: g }); if (amount - c > 0) lines.push({ method: 'CARD', amountCents: amount - c }); }
      const payload = { paymentLines: lines };
      if (paidBefore === 0 && st.disc) { if (st.disc.type === 'EMPLOYEE') payload.employeeDiscountCode = st.disc.employeeCode; else payload.discount = { type: st.disc.type, value: st.disc.value }; }
      if (st.split !== 'none') { payload.partial = true; payload.splitOf = st.n; payload.splitLabel = t('part') + ' ' + (st.partIdx + 1); }
      const go = d.querySelector('.np-go'); go.disabled = true;
      try {
        if (paidBefore === 0) await ctx.send('ORDER_SYNC');
        const res = await ctx.send('FINALIZE_PAYMENT', payload);
        const info = res && res.payment;
        if (!info || info.completed) { d.close(); ctx.fresh(); location.reload(); return; }
        paidBefore = info.paidCents;
        o.paidCents = info.paidCents; try { ctx.save && ctx.save(); } catch (e) { /* ignore */ }
        st.partsPaid.push(st.partIdx);
        const p = parts(); let nextIdx = p.findIndex((_, i) => !st.partsPaid.includes(i));
        const doneN = st.partIdx + 1; st.partIdx = nextIdx < 0 ? st.partIdx : nextIdx; st.given = ''; st.cashPart = '';
        render(); setMsg(t('partDone').replace('{n}', doneN).replace('{m}', st.partIdx + 1));
      } catch (e) {
        if (String(e.message).toLowerCase().includes('abgeschlossen') || String(e.message).toLowerCase().includes('completed')) { d.close(); ctx.fresh(); location.reload(); return; }
        setMsg(e.message || t('err')); go.disabled = false;
      }
    }

    render();
    d.showModal();
  }

  window.NARA_PAYMENT = { open, equalParts, itemParts };
})();
