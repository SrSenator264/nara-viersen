'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..', 'android-app');
test('android shell loads the live driver page over https from the tunnel host only', () => {
  const c = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  assert.equal(c.server.url, 'https://app.flamo.co.de/driver.html'); assert.equal(c.server.cleartext, false);
  assert.deepEqual(c.server.allowNavigation, ['app.flamo.co.de']);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@capacitor-community/background-geolocation'] && pkg.dependencies['@capacitor/local-notifications']);
  assert.ok(fs.existsSync(path.join(root, 'www', 'index.html')));
});
test('workflow builds a debug apk and uploads it; manifest patch adds background location', () => {
  const w = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'android-apk.yml'), 'utf8');
  assert.match(w, /assembleDebug/); assert.match(w, /upload-artifact/); assert.match(w, /patch_manifest\.py/);
  const p = fs.readFileSync(path.join(root, 'patch_manifest.py'), 'utf8');
  for (const x of ['ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'POST_NOTIFICATIONS']) assert.ok(p.includes(x));
});
test('driver page has native GPS + notification hooks guarded by Capacitor', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'driver.html'), 'utf8');
  assert.match(h, /registerPlugin\('BackgroundGeolocation'\)/); assert.match(h, /registerPlugin\('LocalNotifications'\)/); assert.match(h, /isNativePlatform/);
});
