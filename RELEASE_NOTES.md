# Release Notes – Word Cloud Preset 2.0

## Neu

- Komplette Neuentwicklung der Wortwolke ohne externe Bibliotheken
  (kein D3.js, kein CDN – ~350 Zeilen Vanilla-JS, funktioniert offline)
- Pyramiden-Layout: das größte Wort steht mittig, nach außen wird es kleiner
- Feste Farbpalette, keine Wortdrehung
- Case-insensitive Zählung – Wörter mit nur 1 Vorkommen werden einbezogen
- Responsiv: die Wolke skaliert auf Mobilgeräten kleiner
- Download-Button: Wolke als SVG-Datei speichern
- Optionale automatische Aktualisierung ohne Neuladen der Seite
  (15 s, kein Flackern, Scrollposition bleibt erhalten)

## Verbessert

- Eintragskarten als responsives Grid mit beschrifteten Feldern (Text 1–3)
- Aktionsmenü (`##actionsmenu##`) in Listen- und Einzelansicht
- Einzelansicht als aufgeräumte Karte
- Aufgefrischtes Hinzufügen-Formular mit Hinweis zum Semikolon-Format
- Alle CSS-Klassen und IDs mit `wordcloud-`-Präfix (keine Theme-Konflikte)

## Behobene Fehler

- Stopwort-Filter arbeitete nie (Groß-/Kleinschreibungsfehler)
- `ß` wurde durch toUpperCase() zu „SS" („Straße" → „STRASSE")
- Doppelte Word-Cloud-Implementierung (~400 Zeilen Duplikat) entfernt
- Ungültiges HTML im Listen- und RSS-Template

## Voraussetzung

- Moodle 4.1 oder neuer (das Templates nutzen `##actionsmenu##`, MDL-75275)

## Upgrade

Bestehende Datenbanken: Preset-ZIP importieren (die Templates werden
übersetzt, die Daten bleiben unverändert). Danach einmal Strg+F5.
