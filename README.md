# Cruise Cabin Price & Sort

Chromium extension for Royal Caribbean and Celebrity Cruises search results.

## Features

- Calculated total cabin price
- Cabin price per night
- Optional price per person per night
- Extra sorting for all currently loaded cruise cards:
  - Cabin price/night ascending and descending
  - Price per person/night ascending and descending, when enabled in the extension settings
  - Total cabin price ascending and descending
  - Cruise duration ascending and descending
  - Original order
- Load more cruises from the extra sorting panel
- Automatic occupancy detection from the card, URL, or visible filters when the site shows it
- Manual guest count from the extension popup

## Installation

1. Extract the ZIP file.
2. Open `chrome://extensions` in Chrome/Vivaldi or `edge://extensions` in Edge.
3. Enable developer mode.
4. Choose **Load unpacked**.
5. Select the `rcl-cabin-price-extension` folder.
6. Reload the Royal Caribbean or Celebrity Cruises search results.

## Using The Sorting

The extension only sorts cards that are already loaded in the DOM. Use **Load more** in the extra sorting panel until all desired results are loaded, then choose the extra sorting mode.

## Guest Count On The US Sites

Some US search pages contain `show-number-of-guests: false`, and the card occupancy line can be empty. In automatic mode, the extension therefore assumes 2 guests. A manual guest count can be set from the extension popup.

## Note

The calculation is based on the average per-person price shown by the cruise line. The final price in the booking flow can change depending on date, cabin category, availability, or promotions.
