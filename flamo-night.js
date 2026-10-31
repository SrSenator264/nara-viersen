'use strict';
/* flamo-night.js — زر وضع ليلي عائم + حفظ الاختيار على الجهاز (المفتاح flamo-night، نفسو بصفحة التقفيلة). بيشتغل مع flamo-night.css */
(function () {
  const KEY = 'flamo-night', root = document.documentElement;
  const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const set = on => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } };
  let on = get();
  root.classList.toggle('flamo-night', on);       // بدري بالـhead: بدون وميض أبيض
  function mount() {
    if (document.getElementById('flamo-night-btn') || !document.body) return;
    const b = document.createElement('button');
    b.id = 'flamo-night-btn'; b.type = 'button'; b.setAttribute('aria-label', 'Nachtmodus'); b.textContent = on ? '☀️' : '🌙';
    b.addEventListener('click', () => { on = !on; set(on); root.classList.toggle('flamo-night', on); b.textContent = on ? '☀️' : '🌙'; });
    document.body.appendChild(b);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();
