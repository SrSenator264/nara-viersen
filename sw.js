// sw.js — بس كي ينزل NARA كتطبيق عالتلفون. ما في تخزين (كل شي دايماً من السيرفر، كي ما تشوف بيانات قديمة).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* الشبكة مباشرة */ });
// إشعار "اجاك طلب": الضغط عليه بيفتح تطبيق السواق
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { for (const c of list) if (c.url.includes('driver.html') && 'focus' in c) return c.focus(); return self.clients.openWindow((e.notification.data && e.notification.data.url) || 'driver.html'); })); });
