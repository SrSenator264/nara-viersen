# Burger-Builder ("✏️ عدّل / اصنع برغرك") — Spezifikation

Quelle: Omars Prompt vom 2026-11-21, angepasst an Flamo. Gilt zusammen mit den Anpassungen unten.

## Anpassungen an Flamo (haben Vorrang vor dem Original-Prompt)
- Name **Flamo** (Logo: dickes, rundes, rotes Wordmark mit cremefarbener Kontur und leichtem Schatten), Tagline "SMASH BURGERS. STACKED BY YOU.", Währung **€** (de-DE Format, z.B. 5,50 €).
- Sprachen DE / AR (Shami) / EN wie die Kundenseite (`web-prototype/c.html`), nie gemischt.
- Datei: `web-prototype/builder.html` (eigenständig, ohne Build). Ebenen-Grafiken in `web-prototype/builder/layers/` (SVG jetzt, später echte transparente PNGs mit gleichem Namen → ein Manifest `layers.json` steuert Datei + Maße, Austausch ohne Code-Änderung).
- **Keine Demo-Kasse:** Ergebnis geht in den bestehenden Warenkorb der Kundenseite (gleicher Checkout, Lieferkosten nach PLZ aus `/api/delivery/zones`, Zahlung wie bisher). In Küche/Kasse kommt es als normaler Artikel mit Optionen + Notizen ("ohne Gurke"). Preise kommen vom Server (`/api/menu`), nie vom Browser.
- **"Bearbeiten"** (Knopf auf jeder Burger-Karte der Kundenseite): öffnet den Builder mit dem echten Burger vorgeladen (Zutaten aus Beschreibung), echtes Foto oben als Referenz. Extras nur aus den echten Optionen dieses Produkts ("Ihre Extras": Saucen im Burger 0,99 €, Käse/Bacon/Jalapeños zu ihren Preisen). Entfernen = Notiz "ohne X", kein Rabatt.
- **"Selbst bauen":** braucht ein Produkt "Flamo Build Your Own" im Menü (Bun + 1 Patty). Solange es nicht existiert, ist dieser Modus ausgeblendet (Flag), Preis setzt Omar in der Menü-Seite (Vorschlag 6,99 €).
- Sides = echte Beilagen aus dem Menü (Pommes, Curly, Onion Rings …), plus Menü-Upgrade +3 € (0,33 l Getränk + Sauce), Regeln wie Kasse.
- Alte Kundenseite bleibt erhalten: `web-prototype/c-classic.html` = exakte Kopie vor dem Umbau; Zurückschalten mit einer Zeile.
- Später (nicht jetzt): Kiosk-Modus auf Tablet im Laden → offene Bestellung an die Kasse.

## Original-Prompt (Design & Verhalten)
THE SCENE (one top-down kitchen counter)
- Background: realistic brushed stainless-steel counter, soft light, subtle scratches.
- Left, paper label "Make it yours.": clear plastic deli containers, each full of one ingredient, masking-tape label with name + price (Bun, Patty, Lettuce, Tomato, Cheddar, Pickles, Red onion — bei Flamo echte Extras/Preise).
- Centre: yellow serving tray with two branded wax-paper liners (repeating logo + small burger icon). Left liner = burger; right liner = side, note "A little something on the side?".
- Above the tray: branded squeeze bottles (bei Flamo: echte Saucen, im Burger 0,99 € statt gratis).
- Right, paper label "Better together.": sides in red branded paper buckets.
- Food must look photo-realistic (sesame, melted cheese, juicy patty, crisp lettuce): transparent PNGs, until then detailed layered SVG with gradients and shadows. No emojis, no flat icons.

HOW IT WORKS
1. Hint pill: "Start with your bun, then stack it up." Ingredients locked until bottom bun is placed (im Bearbeiten-Modus schon vorhanden).
2. Click or drag → falls onto burger, small squash + bounce, soft shadow, slightly offset layers; same item twice stacks twice.
3. Sauce bottle → drizzle on top layer.
4. Side → into its bucket on right liner (one at a time, swaps).
5. Bottom bar: hint + red "Top it off ↗" (disabled until ≥1 filling) + "Undo".
6. "Top it off": top bun drops, thermal receipt slides in (tilted, zig-zag bottom, monospace): header, grouped lines ("2 × Smash patty 7,00 €"), dashed line, TOTAL live, Pick up / Delivery, big red button (bei Flamo: "In den Warenkorb ↗"), "← Back to building". Hint: "Looking good. Pick a side or make it yours again."
7. Danach normaler Checkout der Kundenseite.

POLISH
- Physical animations (ease-out drops, hover lift, pressed buttons). Fonts: bold rounded display, clean sans, monospace receipt.
- Responsive: phone → trays as horizontal scroll row under the burger, receipt as bottom sheet; tablet full-screen kiosk.
- Footer klein unten rechts.
