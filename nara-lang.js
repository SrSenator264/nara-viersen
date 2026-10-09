// nara-lang.js — لغة وحدة لكل شاشات NARA (de / ar / en).
// - المفتاح المشترك: localStorage 'nara-lang' (ومنكتب كمان 'nara-kasse-language' للتوافق مع الكود القديم).
// - العربي: لهجة شامية. الكلمات اللي ما بتترجم (أسماء شوارع، منتجات، Lieferando، BBQ، PIN، QR…) بتضل بحروف لاتينية.
// الاستعمال:
//   NARA_LANG.get()                         → 'de' | 'ar' | 'en'
//   NARA_LANG.set('ar')                     → بيحفظ وبيبعت حدث 'nara-lang'
//   NARA_LANG.t({de:'…', ar:'…', en:'…'})   → النص باللغة الحالية (الألماني إذا ناقص)
//   NARA_LANG.pick('Einzel / بدون منيو')    → لنصوص البيانات القديمة "ألماني / عربي": بيرجّع القسم المناسب
//   NARA_LANG.mountSwitcher(el)             → أزرار DE · ع · EN
(function () {
  const KEYS = ['nara-lang', 'nara-kasse-language'];
  const OK = ['de', 'ar', 'en'];
  function read() {
    for (const k of KEYS) { try { const v = localStorage.getItem(k); if (OK.includes(v)) return v; } catch (e) { /* ignore */ } }
    return 'de';
  }
  let cur = read();
  function applyDir() {
    try { document.documentElement.lang = cur; document.documentElement.dir = cur === 'ar' ? 'rtl' : 'ltr'; } catch (e) { /* ignore */ }
  }
  const api = {
    get: () => cur,
    set(l) {
      if (!OK.includes(l)) return;
      cur = l;
      for (const k of KEYS) { try { localStorage.setItem(k, l); } catch (e) { /* ignore */ } }
      applyDir();
      try { window.dispatchEvent(new CustomEvent('nara-lang', { detail: l })); } catch (e) { /* ignore */ }
    },
    t(d) { if (!d) return ''; return d[cur] != null ? d[cur] : (d.de != null ? d.de : (d.en || '')); },
    // "Einzel / بدون منيو" → de/en: "Einzel", ar: "بدون منيو"
    pick(s) {
      const str = String(s == null ? '' : s);
      const parts = str.split(' / ');
      if (parts.length < 2) return str;
      const ar = parts.find(p => /[؀-ۿ]/.test(p));
      const lat = parts.find(p => !/[؀-ۿ]/.test(p));
      return cur === 'ar' ? (ar || str) : (lat || str);
    },
    mountSwitcher(el, opts) {
      if (!el) return;
      const o = opts || {};
      const wrap = document.createElement('span');
      wrap.className = 'nara-lang-switch';
      wrap.style.cssText = o.style || 'display:inline-flex;gap:4px;align-items:center';
      for (const [code, label] of [['de', 'DE'], ['ar', 'ع'], ['en', 'EN']]) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.dataset.naraLang = code;
        b.style.cssText = o.buttonStyle || 'min-width:38px;height:34px;border-radius:9px;border:1px solid #0002;background:#fff;color:#1d2327;font-weight:800;cursor:pointer';
        if (code === cur) { b.style.background = '#1d2327'; b.style.color = '#fff'; }
        b.onclick = () => { api.set(code); if (o.reload !== false) location.reload(); };
        wrap.appendChild(b);
      }
      el.appendChild(wrap);
      return wrap;
    },
  };
  applyDir();
  window.NARA_LANG = api;
})();
