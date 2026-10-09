// sw.js — بس كي ينزل NARA كتطبيق عالتلفون. ما في تخزين (كل شي دايماً من السيرفر، كي ما تشوف بيانات قديمة).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* الشبكة مباشرة */ });
