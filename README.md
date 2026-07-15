# RCL Cabin Price & Sort

Chromium-Erweiterung für Royal-Caribbean-Suchergebnisse.

## Funktionen

- Hochgerechneter Kabinen-Gesamtpreis
- Kabinenpreis pro Nacht
- Preis pro Person und Nacht
- Zusatzsortierung für alle bereits geladenen Kreuzfahrtkarten:
  - Kabinenpreis/Nacht auf- und absteigend
  - Preis pro Person/Nacht auf- und absteigend
  - Kabinen-Gesamtpreis auf- und absteigend
  - Preis pro Person auf- und absteigend
  - Reisedauer auf- und absteigend
  - ursprüngliche Reihenfolge
- Automatische Erkennung der Belegung, soweit RCL sie in Karte, URL oder Filter anzeigt
- Manuelle Gästezahl über das Extension-Symbol

## Installation

1. ZIP-Datei entpacken.
2. In Chrome/Vivaldi `chrome://extensions` bzw. in Edge `edge://extensions` öffnen.
3. Entwicklermodus aktivieren.
4. **Entpackte Erweiterung laden** wählen.
5. Den Ordner `rcl-cabin-price-extension` auswählen.
6. RCL-Suchergebnisse neu laden.

## Verwendung der Sortierung

Die Erweiterung sortiert nur Karten, die bereits im DOM geladen sind. Daher zuerst wiederholt **Load More / Mehr anzeigen** anklicken, bis alle gewünschten Ergebnisse geladen sind. Danach im eingeblendeten Menü die gewünschte Zusatzsortierung wählen.

## Gästezahl auf der US-Seite

Die bereitgestellte US-Seite enthält `show-number-of-guests: false`, und die Belegungszeile der Karten ist leer. Im Automatikmodus nimmt die Erweiterung deshalb dort 2 Gäste an. Über das Extension-Symbol kann eine manuelle Gästezahl gesetzt werden.

## Hinweis

Die Berechnung basiert auf dem von RCL angezeigten Durchschnittspreis pro Person. Der endgültige Preis im Buchungsprozess kann sich durch Termin, Kabinenkategorie, Verfügbarkeit oder Promotions ändern.
