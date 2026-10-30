'use strict';
// kasse-reminders.js — بوب-أب تذكير الخبز/Loco على الكاشير (بدون زر ثابت). بيطلع لما التذكير مستحق، "لاحقاً" بيخبّيه 30 دقيقة.
(function () {
  const TXT = {
    de: { bread: '🍞 Brot bestellen!', loco: '🧊 Loco: Kühlschränke prüfen und bestellen', meat: '🥩 Fleisch: prüfen, ob wir bestellen müssen', done: 'Bestellt ✅', later: 'Später', week: 'Diese Woche: {n} von {m}' },
    ar: { bread: '🍞 اطلبوا الخبز!', loco: '🧊 Loco: شيّكوا البرادات واعملوا جرد واطلبوا', meat: '🥩 اللحم: شيّكوا إذا بدنا نطلب', done: 'انطلب ✅', later: 'لاحقاً', week: 'هالأسبوع: {n} من {m}' },
    en: { bread: '🍞 Order bread!', loco: '🧊 Loco: check fridges, count stock and order', meat: '🥩 Meat: check whether we need to order', done: 'Ordered ✅', later: 'Later', week: 'This week: {n} of {m}' },
  };
  const lang = () => { try { if (window.NARA_LANG) return window.NARA_LANG.get(); const l = localStorage.getItem('nara-kasse-language'); return TXT[l] ? l : 'de'; } catch (e) { return 'de'; } };
  const tx = (k, v) => String((TXT[lang()] || TXT.de)[k] || '').replace(/\{(\w+)\}/g, (_, x) => (v && v[x] != null ? v[x] : ''));
  const snoozeKey = id => 'flamo-rem-snooze-' + id;
  const snoozed = id => { try { return Number(localStorage.getItem(snoozeKey(id)) || 0) > Date.now(); } catch (e) { return false; } };
  const snooze = id => { try { localStorage.setItem(snoozeKey(id), String(Date.now() + 30 * 60000)); } catch (e) { /* ignore */ } };
  let box = null, busy = false;

  function close() { if (box) { box.remove(); box = null; } }
  function render(s) {
    const items = ['bread', 'loco', 'meat'].filter(id => s[id] && s[id].due && !snoozed(id));
    if (!items.length) return close();
    const key = items.join(',') + '|' + lang();
    if (box && box.dataset.k === key) return;
    close();
    box = document.createElement('div');
    box.dataset.k = key;
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#0007;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,Segoe UI,Arial,sans-serif';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#1d2327;border-radius:20px;padding:20px;max-width:420px;width:100%;box-shadow:0 10px 40px #0005';
    for (const id of items) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:16px';
      const h = document.createElement('div');
      h.style.cssText = 'font-size:1.2rem;font-weight:800;margin-bottom:4px';
      h.textContent = tx(id);
      row.appendChild(h);
      if (id === 'bread') { const w = document.createElement('div'); w.style.cssText = 'color:#6b7378'; w.textContent = tx('week', { n: s.bread.weekCount, m: s.bread.weekTarget }); row.appendChild(w); }
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:8px;margin-top:10px';
      const ok = document.createElement('button'), later = document.createElement('button');
      ok.type = later.type = 'button';
      ok.textContent = tx('done'); later.textContent = tx('later');
      ok.style.cssText = 'flex:2;min-height:56px;border:0;border-radius:14px;background:#ff6d00;color:#fff;font-weight:800;font-size:1.05rem;cursor:pointer';
      later.style.cssText = 'flex:1;min-height:56px;border:0;border-radius:14px;background:#eef0ea;color:#1d2327;font-weight:700;cursor:pointer';
      ok.onclick = async () => { ok.disabled = true; try { const r = await fetch('/api/reminders/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); if (r.ok) render(await r.json()); } catch (e) { ok.disabled = false; } };
      later.onclick = () => { snooze(id); poll(); };
      bar.append(ok, later); row.appendChild(bar); card.appendChild(row);
    }
    box.appendChild(card); document.body.appendChild(box);
  }
  async function poll() {
    if (busy) return; busy = true;
    try { const r = await fetch('/api/reminders', { cache: 'no-store' }); if (r.ok) render(await r.json()); } catch (e) { /* offline: بنحاول بعد دقيقة */ }
    busy = false;
  }
  const start = () => { poll(); setInterval(poll, 60000); window.addEventListener('nara-lang', () => { close(); poll(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
