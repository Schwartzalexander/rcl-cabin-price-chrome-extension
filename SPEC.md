# Cruise Cabin Price & Sort Specification

## Purpose

This Chrome/Chromium extension enhances Royal Caribbean and Celebrity Cruises search result pages by calculating cabin-level prices, adding extra sorting controls, and optionally loading all visible result pages.

Current extension version: `1.2.0`.

## Supported Sites

The extension runs only on Royal Caribbean and Celebrity Cruises domains declared in `manifest.json` host permissions:

- `royalcaribbean.com`
- `royalcaribbean.de`
- `royalcaribbean.co.uk`
- `royalcaribbean.com.au`
- `royalcaribbean.fr`
- `royalcaribbean.es`
- `royalcaribbean.it`
- `royalcaribbean.com.br`
- `royalcaribbean.com.mx`
- `royalcaribbean.com.sg`
- `celebritycruises.com`

## User-Facing Language

All user-facing extension text must be English, regardless of the cruise line page language.

Non-English strings may remain in parsing regexes when needed to detect page content such as German `Mehr laden`, `Nächte`, or `Gäste`. These strings are not shown by the extension.

## Permissions

The extension uses `chrome.storage.sync` to save user preferences:

- `guestMode`
- `manualGuests`
- `showPersonNight`

The extension does not collect or transmit personal data.

The extension does not use remote code. All JavaScript, CSS, HTML, and assets are bundled locally.

## Popup Settings

Popup file: `popup.html` with logic in `popup.js`.

Visible popup text is English.

The popup includes a short description stating that Royal Caribbean and Celebrity Cruises search results are supported.

Settings:

- Occupancy mode: `Automatic` or `Manual`.
- Automatic mode reads occupancy from the card, URL, or visible filters when available. If no occupancy is visible, assume 2 guests.
- Manual mode allows a guest count from 1 to 12.
- `Show price per person per night` is a checkbox.
- `Show price per person per night` defaults to off.
- Saving settings shows `Saved`.

## Price Calculation

Content script file: `content.js`.

For each loaded cruise card:

- Read the visible per-person average price from the cruise card price label.
- Prefer stable `data-testid` price labels when available.
- If Celebrity Cruises renders cards without those price `data-testid`s, fall back to visible text detection around `AVG PER PERSON* FOR`, the occupancy line, and the visible currency/price.
- Determine the number of nights from the itinerary code or visible card text.
- Determine guest count from manual setting, card occupancy, URL params, visible filters, or fallback to 2 guests.
- Calculate total cabin price: `perPersonPrice * guestCount`.
- Calculate cabin price per night: `totalCabinPrice / nights`.
- Calculate person price per night internally: `perPersonPrice / nights`.

Displayed price box:

- Always show total cabin price: e.g. `1,824 € per cabin`.
- Always show cabin price per night: e.g. `130.29 € per cabin/night`.
- Show person price per night only when `showPersonNight` is enabled.
- Do not show the formula/detail line such as `390 € × 3 guests ÷ 7 nights`.
- Show the fallback occupancy warning only when occupancy is assumed.

## Extra Sorting Panel

The panel is inserted under the search results heading, not inside the heading.

Preferred placement:

- Find the search results heading such as `Suchergebnisse`, `Search results`, or `Cruises (...)`.
- If the heading is inside `[data-testid="number-results-label"]`, insert the panel after that title row.
- Otherwise insert after the heading.
- Fallback to the native sort control area or page main/body if the heading is not found.

The panel label is `Extra sorting:`.

The sorting dropdown defaults to `Cabin price/night – lowest first`.

The default sorting is applied once automatically when at least two sortable cruise cards are available.

Available sort options:

- `Original order`
- `Cabin price/night – lowest first`
- `Cabin price/night – highest first`
- `Price per person/night – lowest first`, only when `showPersonNight` is enabled
- `Price per person/night – highest first`, only when `showPersonNight` is enabled
- `Total cabin price – lowest first`
- `Total cabin price – highest first`
- `Nights – shortest first`
- `Nights – longest first`

Removed/unsupported sort options:

- Price per person ascending/descending should not be shown.

The panel shows the count of currently sortable loaded cruises, e.g. `{count} loaded cruises`.

The panel must avoid unnecessary DOM rewrites or reinsertions because repeated MutationObserver-triggered updates can close the native select dropdown immediately after opening.

Implementation requirement:

- Only rebuild dropdown options if the option signature changes.
- Only move the panel if it is not already in the correct position.
- Only update status/button text when text actually changes.

## Sorting Behavior

Each sortable card gets persistent dataset values:

- `rclcpOriginalIndex`
- `rclcpPricePerson`
- `rclcpCabinTotal`
- `rclcpCabinNight`
- `rclcpPersonNight`
- `rclcpNights`

Sorting reorders loaded cards within their parent container only. It does not fetch unloaded results.

`Sort again` re-applies the currently selected sorting mode. This is useful after loading more results.

## Load More Controls

The extra sorting panel contains load controls next to the dropdown.

Buttons:

- `Load more`
- `Load all`
- `Sort again`

`Load more` behavior:

- Finds the native load-more button by visible button text/ARIA label, including language variants such as `Load more` and German `Mehr laden`.
- Ignores buttons inside the extension panel.
- Ignores disabled, aria-disabled, hidden, or invisible buttons.
- Clicks the native load-more button once.
- Shows `Loading more cruises ...` while waiting.
- Schedules processing and re-sorts after loading.
- If no native button exists, shows `All cruises are loaded`.

`Load all` behavior:

- Repeatedly clicks the native load-more button until no visible/native load-more button remains.
- While active, disables both `Load more` and `Load all`.
- Shows `Loading all cruises ...` while active.
- Waits between clicks to allow the site to load more results.
- Does several short missing-button checks before deciding all cruises are loaded, to avoid stopping during transient loading states.
- Re-sorts loaded cards after each load cycle and after completion.
- When all cruises are loaded, hide the `Load all` button to avoid showing two disabled buttons with the same `All cruises are loaded` text.
- Keep `Load more` visible and disabled with text `All cruises are loaded`.

## Styling

Styles are in `content.css` and `popup.css`.

The injected price box should visually stand out but fit the supported cruise search layouts:

- Subtle light background.
- Blue border.
- Dark navy text.

On Celebrity Cruises fallback cards, the injected price box should be compact and placed after the card CTA buttons when possible, so it does not disrupt the original price and button row.

The sorting panel uses inline-flex on desktop and stacks vertically on narrow screens.

Sorting panel buttons use dark navy background while active and a muted disabled style.

## Icons And Assets

Assets live under `assets/`.

Extension icons:

- `assets/icon.svg`
- `assets/icon-16.png`
- `assets/icon-32.png`
- `assets/icon-48.png`
- `assets/icon-128.png`

Store/merchant symbol with `AS` letters:

- `assets/store-as.svg`
- `assets/store-as-128.png`
- `assets/store-as-440.png`

Manifest uses the extension icons for both top-level `icons` and `action.default_icon`.

## Store Submission Notes

Long-form store listing text is maintained in `STORE_DESCRIPTION.md`.

Use this permission justification for `storage`:

```text
The extension uses chrome.storage to save user preferences, including the guest count mode, manual guest count, and whether to show price per person per night. No personal data is collected or transmitted.
```

Use this host permission justification:

```text
The extension needs access to Royal Caribbean and Celebrity Cruises search result pages to read visible cruise prices, nights, and occupancy information from the page, calculate cabin totals and nightly prices, add the extra sorting controls, and sort the loaded cruise cards. Access is limited to supported cruise search domains only.
```

Remote code answer:

```text
No, remote code is not used.
```

## Verification

At minimum, run these checks after JavaScript or manifest edits:

```powershell
node --check content.js
node --check popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```
