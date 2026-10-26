# PLAN: Große A4-Rechnung + handschriftliche Quittung

Stand: 2026-10-26

## 1. Große A4-Rechnung in Flamo

Zusätzlich zum kleinen Bon (Epson TM-m30II) soll Flamo dieselbe Bestellung als **große A4-Rechnung** drucken können, z. B. wenn ein Kunde für seine Firma eine ausführliche, belegbare Rechnung verlangt.

Muss enthalten (offizielle Rechnung nach UStG):
- Name und Anschrift des Restaurants (Flamo) und des Kunden
- Steuernummer oder USt-IdNr.
- Rechnungsdatum und Leistungsdatum
- fortlaufend eindeutige Rechnungsnummer (Buchstaben + Ziffern, siehe Nummernlogik unten)
- Menge und Bezeichnung jeder Position
- Nettobetrag, Steuersatz (7 % Speisen / 19 % Getränke), Steuerbetrag, Bruttobetrag
- Zahlungsart

Ablauf: Kassierer wählt "Rechnung A4" bei der Bestellung, gibt Kundendaten ein, Druck auf A4 (Original + Kopie).

## 2. Kleinbetragsrechnung (bis 250 € brutto)

Reicht laut UStG: Name/Anschrift des Restaurants, Datum, Leistungsbeschreibung, Bruttobetrag, Steuersatz. Netto und Steuerbetrag sind nicht nötig, Kundenname auch nicht. Über 250 € oder auf Firmenwunsch gilt die große A4-Rechnung.

## 3. Nummernlogik

- Eindeutig, aber nicht fortlaufend sichtbar (Buchstaben + Ziffern), damit niemand die Bestellzahl ablesen kann.
- Original und Kopie tragen dieselbe Nummer.
- Eine Nummer gilt erst beim Drucken als vergeben.
- Fehlerhafte Belege werden nicht weggeworfen, sondern als "storniert" aufbewahrt.

## 4. Handschriftliche Quittung (bereits gebaut)

Eigenständige Seite, zum Ausfüllen von Hand, für Fälle mit anderen Details als in Flamo:
- Repo: https://github.com/SrSenator264/quittung
- Live: https://srsenator264.github.io/quittung/ (als App-Symbol auf dem Handy installierbar)
- A4-Blatt mit 4 x A6: zwei Nummern, jeweils Original + Kopie
- Sprache umschaltbar: DE, AR oder beides
- Name/Adresse des Restaurants einstellbar (später auf Flamo ändern)

## 5. Später: Integration in Flamo

- Quittung-Seite als Unterseite von Flamo einbinden (gleiches Aussehen wie die Kasse).
- Gleiche Nummernlogik wie die Kassenbelege verwenden.
- Offen: Nummernkreis der Quittung vs. Kassenbelege trennen oder zusammenführen (mit dem Steuerberater/Finanzamt-Anforderungen abgleichen).
