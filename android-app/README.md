# Flamo Fahrer – Android-APK

Duenne Android-Huelle (Capacitor) um `https://app.flamo.co.de/driver.html`:
* GPS laeuft im Hintergrund (Vordergrunddienst), auch mit Google Maps im Vordergrund oder gesperrtem Bildschirm
* "Neuer Auftrag"-Benachrichtigung als lokale Benachrichtigung (App offen) und per **FCM-Push** (auch bei geschlossener App)
* Die Oberflaeche kommt immer live vom Server – Aenderungen an driver.html brauchen KEIN neues APK.

## FCM einrichten (einmalig)
1. https://console.firebase.google.com -> Projekt anlegen -> Android-App hinzufuegen mit Paketname `de.flamo.fahrer`.
2. `google-services.json` herunterladen -> GitHub -> Settings -> Secrets and variables -> Actions -> neues Secret `GOOGLE_SERVICES_JSON` (kompletter Dateiinhalt). Ohne dieses Secret bricht der APK-Build absichtlich ab.
3. Firebase -> Projekteinstellungen -> Dienstkonten -> "Neuen privaten Schluessel generieren" -> Datei als `data/fcm-service-account.json` auf den Restaurant-PC legen (steht in .gitignore, nie nach Git!). Danach Server neu starten.
4. APK neu bauen und an die Fahrer schicken (die alte APK hat kein FCM). Fahrer: einmal oeffnen, anmelden, Benachrichtigungen erlauben.
Ablauf: Server (`pushDrivers`) sendet bei Auftrag zuweisen/verschieben/tauschen per FCM HTTP v1 (`fcm.js`) an alle Handys des Fahrers; Tokens in `data.fcmTokens`, tote Tokens werden automatisch geloescht.
Hinweis: "Force stop" in den Android-Einstellungen blockiert FCM (Android-Verhalten) - normales Wegwischen aus der App-Liste ist ok.

## APK bauen
GitHub -> Actions -> "Android APK" -> Run workflow. Danach unter "Artifacts" `flamo-fahrer-apk` herunterladen,
ZIP entpacken, `app-debug.apk` per WhatsApp an die Fahrer schicken.

## Installation (Fahrer, Android)
1. APK oeffnen -> "Aus dieser Quelle installieren" erlauben.
2. App oeffnen, mit Namen + PIN anmelden.
3. Standort: **"Immer zulassen"**; Benachrichtigungen erlauben.
4. Einstellungen -> Apps -> Flamo Fahrer -> Akku -> **"Nicht optimieren" / "Unbeschraenkt"**.
