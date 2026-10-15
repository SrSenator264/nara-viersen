'use strict';
// Prüft die Tunnel-Regeln (tunnel/config.example.yml): nur Fahrer + Kundenseite erreichbar, alles Sensible -> 404.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const text = fs.readFileSync(path.join(__dirname, '..', 'tunnel', 'config.example.yml'), 'utf8');
const rules = text.split('\n').filter(l => /^\s+path:\s/.test(l)).map(l => new RegExp(l.replace(/^\s+path:\s*/, '').trim()));
const open = p => rules.some(r => r.test(p));

test('Tunnel-Config: letzte Regel ist 404 (Catch-all) und hostname gesetzt', () => {
  const svc = [...text.matchAll(/^\s+- (?:hostname:.*|service: (.+))$/gm)];
  assert.match(text.trim().split('\n').pop(), /service: http_status:404$/);
  assert.ok(/hostname: app\.flamo\.co\.de/.test(text));
  assert.ok(svc.length >= 4);
  assert.ok(!/\.json\s*$/m.test(text.replace(/credentials-file:.*\n/, '')), 'keine Schlüsseldatei außer credentials-file');
});

test('Tunnel-Config: erlaubte Pfade (Fahrer + Kunde) sind offen', () => {
  for (const p of ['/driver.html', '/delivery.html', '/nara-lang.js', '/nara-auth.js', '/vendor/qrcode.bundle.js', '/nara-shell.css', '/nara.webmanifest', '/sw.js', '/icons/icon-192.png',
    '/web-prototype/b.html', '/web-prototype/c/mascot.webp', '/web-prototype/app.js', '/web-prototype/menu.json',
    '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/auth/employees', '/api/attendance', '/api/menu', '/api/web-orders', '/api/web-orders/status',
    '/api/pay/enabled', '/api/pay/door', '/api/flamo/chat', '/api/flamo/status', '/api/delivery/scan', '/api/delivery/route-link', '/api/delivery/quote', '/api/delivery/zones',
    '/api/driver/position', '/api/driver/start', '/api/driver/delivered', '/api/driver/finish', '/api/driver/proof', '/api/driver/door-pay', '/api/driver/routes'])
    assert.ok(open(p), 'sollte offen sein: ' + p);
});

test('Tunnel-Config: Kasse/Admin/Buchhaltung/Küche/Live Orders/Dispatch/Geheimes -> gesperrt (404)', () => {
  for (const p of ['/', '/index.html', '/kasse.html', '/kasse.js', '/kasse-settlement.html', '/admin.html', '/admin-foundation.html', '/admin.js', '/accounting.html', '/live-orders.html', '/kitchen.html',
    '/dispatch.html', '/team.html', '/staff.html', '/banking.html', '/reports.html', '/customers.html', '/pay.html', '/driver-app.html', '/driver-app-v2.html', '/delivery-print.html',
    '/vendor/', '/vendor/other.js', '/vendor/qrcode.bundle.js.map', '/vendor/../server.js', '/server.js', '/auth.js', '/package.json', '/.env', '/data/nara-auth.json', '/data/nara-admin.json', '/tests/auth-server.test.js', '/tunnel/config.example.yml',
    '/api/auth/bootstrap', '/api/auth/staff', '/api/auth/set-pin', '/api/admin-data', '/api/kasse-state', '/api/customers', '/api/kitchen/orders', '/api/live-orders/stage',
    '/api/accounting/accounts', '/api/accounting/bank-transactions', '/api/delivery/config', '/api/delivery/assign', '/api/delivery/driver-pay', '/api/delivery/auto-plan',
    '/api/platform-orders/import', '/api/print', '/api/printing/config', '/api/manager-execute', '/api/project-chat', '/api/ai-orchestrate', '/api/nara-guide', '/api/permissions',
    '/api/system/lan', '/api/transcribe-audio', '/api/invoices', '/api/attendance/qr', '/api/employee/qr', '/api/driver', '/api/driver/', '/api/driver/anything-else'])
    assert.ok(!open(p), 'MUSS gesperrt sein: ' + p);
});

test('Tunnel-Config: Pfad-Tricks (Traversal, %-Kodierung, Groß/Klein, Anhängsel) öffnen nichts Neues', () => {
  for (const p of ['/web-prototype/../kasse.html', '/icons/../server.js', '/web-prototype/c/../../kasse.html', '/web-prototype/%2e%2e/kasse.html', '/web-prototype/..%2fkasse.html',
    '/web-prototype/.env', '/web-prototype/a.html/../../auth.js', '/driver.html/../kasse.html', '/api/menu/../admin-data', '/API/admin-data', '/api/menu/extra', '/driver.htmlx', '/xdriver.html', '/web-prototype/', '/icons/'])
    assert.ok(!open(p), 'MUSS gesperrt sein: ' + p);
});

test('Menü: Team & PINs ist in der Seitenleiste; Login-Skript hat Versions-Parameter', () => {
  const fs = require('node:fs'), path = require('node:path');
  const shell = fs.readFileSync(path.join(__dirname, '..', 'nara-shell.js'), 'utf8');
  assert.ok(/'team\.html','team'\]/.test(shell));
  assert.ok(/endsWith\('team\.html'\)\)return'team'/.test(shell));
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server-auth.js'), 'utf8');
  assert.ok(srv.includes('/nara-auth.js?v=${v}'));
});

test('Tunnel: join.html + Einladungs-/Notiz-API offen, invite (Manager) bleibt zu', () => {
  const y = fs.readFileSync(path.join(__dirname, '..', 'tunnel', 'config.example.yml'), 'utf8');
  const res = [...y.matchAll(/path:\s*(\^\S+)/g)].map(m => new RegExp(m[1]));
  const open = p => res.some(r => r.test(p));
  for (const p of ['/join.html', '/api/auth/join', '/api/auth/invite-check', '/api/driver/note', '/api/driver/notes', '/delivery.html']) assert.ok(open(p), p + ' offen');
  for (const p of ['/api/auth/invite', '/api/auth/team', '/api/auth/staff', '/team.html', '/api/auth/bootstrap']) assert.ok(!open(p), p + ' zu');
});

test('delivery.html: Notizen, Spracheingabe, Wischen, Zahlungs-Karte vorhanden', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'delivery.html'), 'utf8');
  for (const k of ['/api/driver/note', 'SpeechRecognition', '/api/driver/delivered', 'class="pay', 'id="slide"']) assert.ok(h.includes(k), k);
});

test('driver.html verlinkt die Detailseite per orderId', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'driver.html'), 'utf8');
  assert.ok(h.includes('delivery.html?orderId='));
});

test('driver.html: Flamo-Popup bei neuem Auftrag (Ton, Vibration, Benachrichtigung) und Flamo-Datei über den Tunnel erreichbar', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'driver.html'), 'utf8');
  for (const k of ['flamo-pop', 'naraNewOrderCheck', 'navigator.vibrate', 'showNotification', 'flamo-present.webm']) assert.ok(h.includes(k), k);
  const y = fs.readFileSync(path.join(__dirname, '..', 'tunnel', 'config.example.yml'), 'utf8');
  const res = [...y.matchAll(/path:\s*(\^\S+)/g)].map(m => new RegExp(m[1]));
  for (const p of ['/web-prototype/c/flamo-present.webm', '/web-prototype/c/flamo-present.webp', '/sw.js']) assert.ok(res.some(r => r.test(p)), p);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8').includes('notificationclick'));
});
