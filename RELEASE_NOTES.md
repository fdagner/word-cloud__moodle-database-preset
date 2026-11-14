# Release Notes – Word Cloud Preset 2.0

## New

- Complete rewrite of the word cloud without external libraries
  (no D3.js, no CDN – ~350 lines of vanilla JS, works offline)
- Pyramid layout: the biggest word is centred, sizes decrease outwards
- Fixed colour palette, no word rotation
- Case-insensitive counting – words with a single occurrence are included
- Responsive: the cloud scales down on small screens
- Download button: save the cloud as an SVG file
- Optional auto refresh without reloading the page
  (every 15 s, no flicker, scroll position preserved)

## Improved

- Entry cards as a responsive grid with labelled fields (Text 1–3)
- Action menus (`##actionsmenu##`) in the list view and single view
- Single view as a clean card
- Refreshed add-entry form with a hint about the semicolon format
- All CSS classes and ids prefixed with `wordcloud-` (no theme conflicts)

## Fixed

- Stop-word filter never worked (case sensitivity bug)
- `ß` was turned into „SS" by toUpperCase() ("Straße" → "STRASSE")
- Removed the duplicated word cloud implementation (~400 line duplicate)
- Invalid HTML in the list and RSS templates

## Requirements

- Moodle 4.1 or newer (the templates use `##actionsmenu##`, MDL-75275)

## Upgrade

Existing databases: import the preset ZIP (the templates are replaced, the
data stays untouched). Then press Ctrl+F5 once.
