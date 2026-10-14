# Übergabe: Zugriff ohne VPN (Cloudflare Tunnel) – Stand 14.10.2026

**Ziel:** Mitarbeiter-/Fahrer-App und Kundenseite von jedem Handy per HTTPS erreichbar, ohne VPN/Tailscale. Entscheidung: Cloudflare Tunnel vom Geschäfts-PC (Hybrid mit Server später).

## Schon erledigt (committet)
- Sicherheit vor Tunnel (101b60c): echte Client-IP (`cf-connecting-ip` nur von Loopback), Login-Sperre pro IP+Konto, `timingSafeEqual` für Manager-/Service-Key, „nur lokal“ nur ohne Proxy-Header (auch `naraManagerOnly`). Tests: 166 grün.
- Fahrer-QR: Plattform-Lieferbestellungen bekommen `deliveryQrToken` + `ownDeliveryQrUrl` (`/delivery.html?token=…`, Basis aus `NARA_PUBLIC_URL`, sonst relativ).
- Beleg: Hinweise, Servicegebühr, Bestätigungscode, Optionspreise, Kategorien, Flamo-Logo.

## Offen (in dieser Reihenfolge)
1. Domain kaufen (INWX/IONOS, .de, WHOIS-Privacy) + kostenloses Cloudflare-Konto, Domain hinzufügen, Nameserver umstellen. (Namensfrage Flamo/DPMA läuft separat – neutraler Name ok.)
2. `cloudflared` als Windows-Dienst; `cloudflared tunnel login` macht der Nutzer selbst im Browser (keine Tokens/Passwörter in den Chat!).
3. Ingress-Regeln: NUR erlauben → `/driver*`, `/driver-app*`, `/delivery.html`, `/api/delivery/scan`, `/api/delivery/route-link`, `/api/driver/*`, `/api/attendance`, `/api/auth/*`, statische js/css/Bilder, Kundenseite (`/web-prototype/*`, `/api/menu`, `/api/web-orders*`, `/api/delivery/quote|zones`). Alles andere (kasse, admin, accounting, live-orders, kitchen, dispatch) → 404 über den Tunnel.
4. `.env`: `NARA_PUBLIC_URL=https://<domain>` (damit QR auf der Bon ein voller Link wird) → NARA neu starten.
5. Test: Handy (Mobilfunk) → Fahrer-App öffnen, Kamera (HTTPS) scannt Bon-QR, Auftrag erscheint; `/admin-foundation.html` und `/kasse.html` über die Domain → 404.
6. Cloudflare DPA/AV-Vertrag für Kundendaten prüfen (kein Rechtsrat – mit Steuerberater/Anwalt klären).

## Grenzen
- PC muss laufen (Single Point of Failure) → später Hybrid (VPS für Web/Fahrer-App).
- PWA liefert GPS nur bei geöffnetem Bildschirm; echte Hintergrund-Ortung → später native App.
- Training-Modus-Härtung (403 für Nicht-OWNER/MANAGER) steht in `NARA-FUTURE-PLAN.md` unter „Vor dem Launch“.
