#!/usr/bin/env python3
"""Fuegt die noetigen Android-Berechtigungen in die generierte AndroidManifest.xml ein (Standort im Hintergrund, Vordergrunddienst, Benachrichtigungen)
und setzt den Standard-Kanal fuer FCM-Benachrichtigungen (Kanal 'orders' wird in driver.html angelegt)."""
import sys, re
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
perms = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE',
         'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS', 'WAKE_LOCK', 'VIBRATE']
add = ''.join('    <uses-permission android:name="android.permission.%s" />\n' % x for x in perms
              if 'android.permission.%s"' % x not in s)
if add:
    s = s.replace('<application', add + '    <application', 1)
CH = 'com.google.firebase.messaging.default_notification_channel_id'
if CH not in s:
    s = re.sub(r'(<application\b[^>]*>)', r'\1\n        <meta-data android:name="%s" android:value="orders" />' % CH, s, count=1)
open(p, 'w', encoding='utf-8').write(s)
print('manifest patched:', [x for x in perms if 'android.permission.%s"' % x in s], 'fcm channel:', CH in s)
