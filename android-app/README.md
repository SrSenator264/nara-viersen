# Flamo Fahrer – Android-APK

Duenne Android-Huelle (Capacitor) um `https://app.flamo.co.de/driver.html`:
* GPS laeuft im Hintergrund (Vordergrunddienst), auch mit Google Maps im Vordergrund oder gesperrtem Bildschirm
* "Neuer Auftrag"-Benachrichtigung als lokale Benachrichtigung
* Die Oberflaeche kommt immer live vom Server – Aenderungen an driver.html brauchen KEIN neues APK.

## APK bauen
GitHub -> Actions -> "Android APK" -> Run workflow. Danach unter "Artifacts" `flamo-fahrer-apk` herunterladen,
ZIP entpacken, `app-debug.apk` per WhatsApp an die Fahrer schicken.

## Installation (Fahrer, Android)
1. APK oeffnen -> "Aus dieser Quelle installieren" erlauben.
2. App oeffnen, mit Namen + PIN anmelden.
3. Standort: **"Immer zulassen"**; Benachrichtigungen erlauben.
4. Einstellungen -> Apps -> Flamo Fahrer -> Akku -> **"Nicht optimieren" / "Unbeschraenkt"**.
