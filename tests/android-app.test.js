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
test('apk has FCM: push plugin, firebase config from secret in CI, default channel in manifest', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@capacitor/push-notifications']);
  const w = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'android-apk.yml'), 'utf8');
  assert.match(w, /secrets\.GOOGLE_SERVICES_JSON/); assert.match(w, /android\/app\/google-services\.json/);
  assert.ok(w.indexOf('google-services.json') < w.indexOf('assembleDebug'), 'firebase config must be written before the build');
  assert.ok(!fs.existsSync(path.join(root, 'google-services.json')), 'google-services.json must not be committed');
});
test('patch_manifest.py adds the FCM default channel once (idempotent)', () => {
  const os = require('node:os'), cp = require('node:child_process');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mf-')), 'AndroidManifest.xml');
  fs.writeFileSync(f, '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="x">\n    </application>\n</manifest>\n');
  const py = path.join(root, 'patch_manifest.py');
  const run = () => cp.spawnSync('python3', [py, f], { encoding: 'utf8' });
  if (run().error) return; // kein python3 auf diesem Rechner
  run();
  const m = fs.readFileSync(f, 'utf8');
  assert.equal((m.match(/default_notification_channel_id/g) || []).length, 1);
  assert.match(m, /android:value="orders"/); assert.match(m, /POST_NOTIFICATIONS/);
});
test('driver page registers the FCM token (native only) and creates the high-importance orders channel', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'driver.html'), 'utf8');
  assert.match(h, /registerPlugin\('PushNotifications'\)/); assert.match(h, /\/api\/push\/fcm-token/);
  assert.match(h, /createChannel\(\{id:'orders'[^}]*importance:5/);
  assert.match(h, /__fcmOk&&document\.visibilityState!=='visible'/); // kein Doppel-Alarm im Hintergrund
});
