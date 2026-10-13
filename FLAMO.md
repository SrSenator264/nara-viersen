# Flamo – Charakter-Datei

Flamo ist das Maskottchen und die einzige Marke des Restaurants. Diese Datei hält fest, wie Flamo aussieht und wie neue Bilder/Videos entstehen, damit er überall gleich bleibt (Website, TikTok/Instagram, Speisekarte, Schild).

## Aussehen (darf sich nie ändern)

- **Material:** gefilzter Stoff / Knetfigur (needle-felted wool), sichtbare Nähte, weiche Faser-Textur, warmes Studiolicht. Kein glattes Plastik, kein 2D-Cartoon.
- **Körper:** Tropfen-/Flammenform, Bauch gelb-orange, nach außen orange, Flammenzacken oben auf dem Kopf orange bis rot.
- **Gesicht:** große glänzende braune Augen mit weißem Lichtpunkt, dicke dunkelbraune Augenbrauen, rosa Wangen, kleiner Mund (offen mit rosa Zunge, wenn er spricht/lacht).
- **Arme/Beine:** kurze orange Filz-Arme und -Beine.
- **Hände:** weiße Cartoon-Handschuhe (4 Finger) mit Bündchen.
- **Schuhe:** schwarze Sneaker mit weißer Sohle und weißen Schnürsenkeln.
- **Charakter:** freundlich, verspielt, hilfsbereit, ein bisschen frech. Sagt bei Halal-Fragen klar und sicher: alles ist halal (siehe `flamo-facts.txt`).

**Referenzbild (Master):** `web-prototype/c/flamo-wave-hd.webp` – bei jeder neuen Generierung als Referenz hochladen.

> Hinweis: Bei einigen älteren Clips wirkt der Bauch eher gelb-grünlich. Maßstab ist die warme gelb-orange Farbe vom Master-Bild.

## Bewegungs-Bibliothek

Alle Dateien liegen in `web-prototype/c/` als `flamo-<name>.webm` (Video, transparenter Hintergrund, ca. 10 s) und `flamo-<name>.webp` (Standbild).

| Name | Was er macht |
|---|---|
| idle | steht ruhig, atmet |
| wave / wave-hd | winkt |
| talk | spricht |
| happy | freut sich |
| cheer | jubelt |
| party | feiert |
| dance | tanzt |
| spin | dreht sich, zwinkert |
| step | macht einen Schritt nach vorn |
| point | zeigt auf etwas |
| present | präsentiert |
| guide | führt den Kunden |
| check | hält einen Bon / prüft die Bestellung |
| paid | Bezahlung erfolgreich |
| bank | hält ein Handy / Überweisung |
| sit | sitzt |
| bar | sitzt auf einer Holztheke (Bild, mit Hintergrund) |

Neue Bewegungen werden hier eingetragen und im selben Ordner mit demselben Namensschema abgelegt.

## Basis-Prompt für neue Videos (Gemini / Veo)

Immer das Master-Bild als Referenz mitschicken und nur die Zeile **Aktion** austauschen.

```
Use the attached image as the exact character reference. Keep Flamo 100% identical:
a cute needle-felted wool fire mascot with visible stitching and soft fibre texture,
teardrop flame-shaped body (warm yellow-orange belly, orange edges, orange-red flame
tips on top), big glossy brown eyes with white highlights, thick dark-brown eyebrows,
pink cheeks, small mouth, short orange felt arms and legs, white 4-finger cartoon
gloves, black sneakers with white soles and laces.
Style: stop-motion felt / claymation look, warm soft studio light, shallow depth of field.
Do not change his colours, proportions, face, gloves or shoes. No text, no logos.

Action: <WAS FLAMO TUT, z. B. "flips a juicy burger on a grill and gives a thumbs up">
Setting: <ORT, z. B. "restaurant kitchen at night, warm light">
Camera: vertical 9:16, <z. B. "slow push-in, medium shot">
Duration: <z. B. 5 seconds>
```

Für einen transparenten Clip (zum Überlagern) bei **Setting** schreiben: `plain solid green background (#00FF00), even lighting, no shadows` – der Hintergrund wird danach entfernt.

## Regeln für Social-Media-Videos

- Format 9:16, 7–15 Sekunden, Hook in den ersten 2 Sekunden.
- Echtes Essen aus der eigenen Küche + Flamo-Clip darüber.
- Bei KI-Videos das Label „KI-generiert“ in TikTok/Instagram setzen; Werbung als Werbung kennzeichnen.
- Untertitel kurz, groß, Deutsch (Arabisch nur als Zusatz).

## Schutz (offen)

- Name + Figur „Flamo“ als Marke anmelden (DPMA oder EUIPO) – Markenprüfung läuft noch.
- KI-Bilder allein sind urheberrechtlich schwach geschützt; die Marke ist der eigentliche Schutz.
