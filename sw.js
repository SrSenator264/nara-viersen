// sw.js — بس كي ينزل NARA كتطبيق عالتلفون. ما في تخزين (كل شي دايماً من السيرفر، كي ما تشوف بيانات قديمة).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* الشبكة مباشرة */ });
// إشعار "اجاك طلب": الضغط عليه بيفتح تطبيق السواق
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { for (const c of list) if (c.url.includes('driver.html') && 'focus' in c) return c.focus(); return self.clients.openWindow((e.notification.data && e.notification.data.url) || 'driver.html'); })); });
// Web Push: Benachrichtigung auch bei geschlossener App (Nutzlast enthaelt nur die Bestellnummer)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    if (list.some(c => c.visibilityState === 'visible')) return; // App offen: Flamo-Popup uebernimmt
    return self.registration.showNotification(d.title || 'Flamo 🛵', { body: d.body || '', icon: 'web-prototype/c/flamo-present.webp', badge: 'web-prototype/c/flamo-present.webp', tag: d.tag || 'nara-new-order', renotify: true, requireInteraction: true, vibrate: [300, 120, 300, 120, 500], data: { url: d.url || 'driver.html' } });
  }));
});
