(() => {
  "use strict";

  const PRICE_SELECTOR = '[data-testid^="cruise-price-label-"]';
  const AVG_LABEL_SELECTOR = '[data-testid^="cruise-price-avg-label-"]';
  const SORT_PANEL_ID = "rclcp-sort-panel";
  const PRICE_BOX_CLASS = "rclcp-price-box";
  const DEFAULT_SETTINGS = { guestMode: "auto", manualGuests: 2 };

  let settings = { ...DEFAULT_SETTINGS };
  let scheduled = false;
  let originalSequence = 0;

  const i18n = getUiText();

  init();

  async function init() {
    settings = await loadSettings();
    scheduleProcess();

    const observer = new MutationObserver(scheduleProcess);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.guestMode) settings.guestMode = changes.guestMode.newValue;
      if (changes.manualGuests) settings.manualGuests = changes.manualGuests.newValue;
      document.querySelectorAll(`.${PRICE_BOX_CLASS}`).forEach((node) => node.remove());
      scheduleProcess();
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (value) => resolve(value));
    });
  }

  function scheduleProcess() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      processCards();
      ensureSortPanel();
      updateSortCount();
    }, 250);
  }

  function processCards() {
    document.querySelectorAll(PRICE_SELECTOR).forEach((priceElement) => {
      try {
        enhancePrice(priceElement);
      } catch (error) {
        console.debug("RCL Cabin Price: unable to process card", error);
      }
    });
  }

  function enhancePrice(priceElement) {
    const detailsRoot = findDetailsRoot(priceElement);
    if (!detailsRoot) return;

    const sortableUnit = findSortableUnit(detailsRoot, priceElement);
    if (!sortableUnit) return;

    if (!sortableUnit.dataset.rclcpOriginalIndex) {
      sortableUnit.dataset.rclcpOriginalIndex = String(originalSequence++);
    }

    const price = readPrice(priceElement);
    const nights = readNights(priceElement, sortableUnit);
    const guestInfo = determineGuestInfo(detailsRoot);

    if (!price || !nights || !guestInfo || guestInfo.count < 1) return;

    const cabinTotal = price.amount * guestInfo.count;
    const cabinPerNight = cabinTotal / nights;
    const personPerNight = price.amount / nights;

    sortableUnit.dataset.rclcpPricePerson = String(price.amount);
    sortableUnit.dataset.rclcpCabinTotal = String(cabinTotal);
    sortableUnit.dataset.rclcpCabinNight = String(cabinPerNight);
    sortableUnit.dataset.rclcpPersonNight = String(personPerNight);
    sortableUnit.dataset.rclcpNights = String(nights);

    let box = detailsRoot.querySelector(`.${PRICE_BOX_CLASS}`);
    if (!box) {
      box = document.createElement("div");
      box.className = PRICE_BOX_CLASS;
      (priceElement.parentElement || priceElement).append(box);
    }

    const warning = guestInfo.assumed
      ? `<div class="rclcp-warning">${escapeHtml(i18n.assumedGuests.replace("{count}", guestInfo.count))}</div>`
      : "";

    box.innerHTML = `
      <div class="rclcp-total">${escapeHtml(formatMoney(cabinTotal, price.currencyCode, price.symbol))} ${escapeHtml(i18n.perCabin)}</div>
      <div class="rclcp-night">${escapeHtml(formatMoney(cabinPerNight, price.currencyCode, price.symbol))} ${escapeHtml(i18n.perCabinNight)}</div>
      <div class="rclcp-person-night">${escapeHtml(formatMoney(personPerNight, price.currencyCode, price.symbol))} ${escapeHtml(i18n.perPersonNight)}</div>
      <div class="rclcp-details">${escapeHtml(formatMoney(price.amount, price.currencyCode, price.symbol))} × ${guestInfo.count} ${escapeHtml(i18n.guests)} ÷ ${nights} ${escapeHtml(i18n.nights)}</div>
      ${warning}
    `;
  }

  function findDetailsRoot(priceElement) {
    return priceElement.closest('[class*="RefinedCruiseCardDetails"]') || climbUntil(priceElement, (node) => {
      return node.querySelector?.('[data-testid^="cruise-ship-label-"]') &&
        node.querySelector?.('[data-testid^="cruise-view-dates-button-"]');
    });
  }

  function findSortableUnit(detailsRoot, priceElement) {
    let current = detailsRoot;
    let best = detailsRoot;

    while (current.parentElement && current.parentElement !== document.body) {
      const parent = current.parentElement;
      const priceCount = parent.querySelectorAll(PRICE_SELECTOR).length;

      if (priceCount !== 1) break;
      best = parent;
      current = parent;

      if (current.matches("article, li")) break;
    }

    // Avoid selecting a huge page-level wrapper when only one card is loaded.
    if (best.getBoundingClientRect().height > window.innerHeight * 2.5) return detailsRoot;
    return best;
  }

  function climbUntil(start, predicate) {
    let current = start.parentElement;
    while (current && current !== document.body) {
      if (predicate(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function readPrice(priceElement) {
    const spans = priceElement.querySelectorAll("span");
    if (spans.length < 2) return null;

    const symbol = spans[0].textContent.trim();
    const amount = parseLocalizedNumber(spans[1].textContent);
    if (!Number.isFinite(amount)) return null;

    return { amount, symbol, currencyCode: detectCurrencyCode(symbol) };
  }

  function readNights(priceElement, card) {
    const testId = priceElement.getAttribute("data-testid") || "";
    const itineraryCode = testId.replace(/^cruise-price-label-/, "").split("-")[0];
    const codeMatch = itineraryCode.match(/^[A-Z]{2}(\d{2,3})[A-Z]{3}/i);
    if (codeMatch) {
      const result = Number.parseInt(codeMatch[1], 10);
      if (result > 0 && result < 200) return result;
    }

    const textMatch = card.textContent.match(/(\d{1,3})\s*(?:nächte|nacht|nights?|nuits?|noches?|notti?|noites?)/i);
    return textMatch ? Number.parseInt(textMatch[1], 10) : null;
  }

  function determineGuestInfo(detailsRoot) {
    if (settings.guestMode === "manual") {
      return { count: clampGuestCount(settings.manualGuests), source: "manual", assumed: false };
    }

    const occupancyText = detailsRoot.querySelector(AVG_LABEL_SELECTOR)?.nextElementSibling?.textContent?.trim() || "";
    const fromCard = parseGuestCount(occupancyText);
    if (fromCard) return { count: fromCard, source: "card", assumed: false };

    const fromUrl = readGuestCountFromUrl();
    if (fromUrl) return { count: fromUrl, source: "url", assumed: false };

    const fromFilter = readGuestCountFromVisibleFilter();
    if (fromFilter) return { count: fromFilter, source: "filter", assumed: false };

    // The US search HTML currently has show-number-of-guests=false and empty occupancy labels.
    // Royal Caribbean's search cards then use the standard double-occupancy price.
    return { count: 2, source: "default", assumed: true };
  }

  function parseGuestCount(text) {
    if (!text) return null;
    const adults = firstInt(text, [/(\d+)\s*(?:erwachsene[nr]?|adults?|adultes?|adultos?|adulti|adultos?)/i]);
    const children = firstInt(text, [/(\d+)\s*(?:kinder?|kind|children|child|kids?|enfants?|niños?|niñas?|bambini?|crianças?)/i]);
    const infants = firstInt(text, [/(\d+)\s*(?:babys?|babies|infants?)/i]);
    if (adults !== null) return adults + (children || 0) + (infants || 0);

    const direct = text.match(/(\d+)\s*(?:gäste|guests|personen|people|travelers|travellers)/i);
    return direct ? Number.parseInt(direct[1], 10) : null;
  }

  function firstInt(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number.parseInt(match[1], 10);
    }
    return null;
  }

  function readGuestCountFromUrl() {
    const params = new URLSearchParams(location.search);
    for (const key of ["guests", "guestCount", "numberOfGuests", "pax", "travelers", "travellers"]) {
      const value = positiveInt(params.get(key));
      if (value) return value;
    }

    const adults = readParam(params, ["adults", "adultCount", "numberOfAdults"]);
    const children = readParam(params, ["children", "childCount", "numberOfChildren", "kids"]);
    const infants = readParam(params, ["infants", "infantCount"]);
    return adults ? adults + (children || 0) + (infants || 0) : null;
  }

  function readParam(params, keys) {
    for (const key of keys) {
      const value = positiveInt(params.get(key));
      if (value) return value;
    }
    return null;
  }

  function readGuestCountFromVisibleFilter() {
    const candidates = document.querySelectorAll('[data-testid*="guest" i], [data-testid*="occupancy" i], button, [role="button"]');
    for (const node of candidates) {
      if (node.closest(`.${PRICE_BOX_CLASS}`)) continue;
      const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
      if (text.length > 100) continue;
      const parsed = parseGuestCount(text);
      if (parsed && /(guest|gäste|personen|people|traveler|traveller)/i.test(text)) return parsed;
    }
    return null;
  }

  function ensureSortPanel() {
    if (document.getElementById(SORT_PANEL_ID) || !document.querySelector(PRICE_SELECTOR)) return;

    const panel = document.createElement("div");
    panel.id = SORT_PANEL_ID;
    panel.className = "rclcp-sort-panel";
    panel.innerHTML = `
      <label for="rclcp-sort-select">${escapeHtml(i18n.sortLabel)}</label>
      <select id="rclcp-sort-select">
        <option value="original">${escapeHtml(i18n.original)}</option>
        <option value="cabinNightAsc">${escapeHtml(i18n.cabinNightAsc)}</option>
        <option value="cabinNightDesc">${escapeHtml(i18n.cabinNightDesc)}</option>
        <option value="personNightAsc">${escapeHtml(i18n.personNightAsc)}</option>
        <option value="personNightDesc">${escapeHtml(i18n.personNightDesc)}</option>
        <option value="cabinTotalAsc">${escapeHtml(i18n.cabinTotalAsc)}</option>
        <option value="cabinTotalDesc">${escapeHtml(i18n.cabinTotalDesc)}</option>
        <option value="personPriceAsc">${escapeHtml(i18n.personPriceAsc)}</option>
        <option value="personPriceDesc">${escapeHtml(i18n.personPriceDesc)}</option>
        <option value="nightsAsc">${escapeHtml(i18n.nightsAsc)}</option>
        <option value="nightsDesc">${escapeHtml(i18n.nightsDesc)}</option>
      </select>
      <span class="rclcp-sort-count"></span>
    `;

    panel.querySelector("select").addEventListener("change", (event) => sortLoadedCards(event.target.value));

    const nativeSort = findNativeSortControl();
    const insertionTarget = nativeSort?.parentElement || findResultsHeading() || document.querySelector(PRICE_SELECTOR).closest("main") || document.body;
    if (nativeSort?.parentElement) nativeSort.parentElement.insertAdjacentElement("afterend", panel);
    else insertionTarget.insertAdjacentElement("afterbegin", panel);
  }

  function findNativeSortControl() {
    const controls = [...document.querySelectorAll("select, button, [role=button]")];
    return controls.find((node) => /(sortieren|sort by|ordenar|trier|ordina)/i.test(node.textContent || node.getAttribute("aria-label") || ""));
  }

  function findResultsHeading() {
    return [...document.querySelectorAll("h1, h2, h3")].find((node) => /(suchergebnisse|search results|cruises \()/i.test(node.textContent || ""));
  }

  function getSortableUnits() {
    const units = [];
    const seen = new Set();
    document.querySelectorAll(PRICE_SELECTOR).forEach((priceElement) => {
      const details = findDetailsRoot(priceElement);
      const unit = details && findSortableUnit(details, priceElement);
      if (unit && unit.dataset.rclcpCabinNight && !seen.has(unit)) {
        seen.add(unit);
        units.push(unit);
      }
    });
    return units;
  }

  function sortLoadedCards(mode) {
    const units = getSortableUnits();
    if (units.length < 2) return;

    const groups = groupByParent(units);
    groups.forEach((groupUnits, parent) => {
      const sorted = [...groupUnits].sort(makeComparator(mode));
      sorted.forEach((unit) => parent.appendChild(unit));
    });
    updateSortCount();
  }

  function groupByParent(units) {
    const groups = new Map();
    units.forEach((unit) => {
      const parent = unit.parentElement;
      if (!parent) return;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(unit);
    });
    return groups;
  }

  function makeComparator(mode) {
    const map = {
      original: ["rclcpOriginalIndex", 1],
      cabinNightAsc: ["rclcpCabinNight", 1],
      cabinNightDesc: ["rclcpCabinNight", -1],
      personNightAsc: ["rclcpPersonNight", 1],
      personNightDesc: ["rclcpPersonNight", -1],
      cabinTotalAsc: ["rclcpCabinTotal", 1],
      cabinTotalDesc: ["rclcpCabinTotal", -1],
      personPriceAsc: ["rclcpPricePerson", 1],
      personPriceDesc: ["rclcpPricePerson", -1],
      nightsAsc: ["rclcpNights", 1],
      nightsDesc: ["rclcpNights", -1]
    };
    const [key, direction] = map[mode] || map.original;
    return (a, b) => ((Number(a.dataset[key]) || 0) - (Number(b.dataset[key]) || 0)) * direction;
  }

  function updateSortCount() {
    const countNode = document.querySelector(`#${SORT_PANEL_ID} .rclcp-sort-count`);
    if (countNode) countNode.textContent = i18n.loadedCount.replace("{count}", getSortableUnits().length);
  }

  function parseLocalizedNumber(input) {
    let value = String(input).replace(/\s/g, "").replace(/[^\d.,]/g, "");
    const comma = value.lastIndexOf(",");
    const dot = value.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      value = comma > dot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
    } else if (comma >= 0) {
      value = normalizeSeparator(value, ",");
    } else if (dot >= 0) {
      value = normalizeSeparator(value, ".");
    }
    return Number.parseFloat(value);
  }

  function normalizeSeparator(value, separator) {
    const parts = value.split(separator);
    return parts.length === 2 && parts[1].length === 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
  }

  function positiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function clampGuestCount(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(12, Math.max(1, parsed)) : 2;
  }

  function detectLocale() {
    const lang = document.documentElement.lang || document.querySelector('meta[http-equiv="content-language"]')?.content || navigator.language || "en-US";
    return lang.replace("_", "-");
  }

  function detectCurrencyCode(symbol) {
    const host = location.hostname.toLowerCase();
    const explicit = { "€": "EUR", "£": "GBP", "US$": "USD", "A$": "AUD", "C$": "CAD", "R$": "BRL" };
    if (explicit[symbol]) return explicit[symbol];
    if (symbol === "$") {
      if (host.endsWith(".com.au")) return "AUD";
      if (host.endsWith(".com.sg")) return "SGD";
      return "USD";
    }
    return null;
  }

  function formatMoney(amount, currencyCode, fallbackSymbol) {
    const options = { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 };
    if (currencyCode) Object.assign(options, { style: "currency", currency: currencyCode });
    const formatted = new Intl.NumberFormat(detectLocale(), options).format(amount);
    return currencyCode ? formatted : `${formatted} ${fallbackSymbol}`;
  }

  function getUiText() {
    const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
    const de = lang.startsWith("de");
    return de ? {
      perCabin: "pro Kabine", perCabinNight: "pro Kabine/Nacht", perPersonNight: "pro Person/Nacht",
      guests: "Gäste", nights: "Nächte", assumedGuests: "Belegung nicht sichtbar – mit {count} Gästen berechnet.",
      sortLabel: "RCL-Zusatzsortierung:", original: "Ursprüngliche Reihenfolge",
      cabinNightAsc: "Kabinenpreis/Nacht – niedrigster zuerst", cabinNightDesc: "Kabinenpreis/Nacht – höchster zuerst",
      personNightAsc: "Preis pro Person/Nacht – niedrigster zuerst", personNightDesc: "Preis pro Person/Nacht – höchster zuerst",
      cabinTotalAsc: "Kabinen-Gesamtpreis – niedrigster zuerst", cabinTotalDesc: "Kabinen-Gesamtpreis – höchster zuerst",
      personPriceAsc: "Preis pro Person – niedrigster zuerst", personPriceDesc: "Preis pro Person – höchster zuerst",
      nightsAsc: "Nächte – kürzeste zuerst", nightsDesc: "Nächte – längste zuerst", loadedCount: "{count} geladene Reisen"
    } : {
      perCabin: "per cabin", perCabinNight: "per cabin/night", perPersonNight: "per person/night",
      guests: "guests", nights: "nights", assumedGuests: "Occupancy not shown – calculated for {count} guests.",
      sortLabel: "RCL extra sorting:", original: "Original order",
      cabinNightAsc: "Cabin price/night – lowest first", cabinNightDesc: "Cabin price/night – highest first",
      personNightAsc: "Price per person/night – lowest first", personNightDesc: "Price per person/night – highest first",
      cabinTotalAsc: "Total cabin price – lowest first", cabinTotalDesc: "Total cabin price – highest first",
      personPriceAsc: "Price per person – lowest first", personPriceDesc: "Price per person – highest first",
      nightsAsc: "Nights – shortest first", nightsDesc: "Nights – longest first", loadedCount: "{count} loaded cruises"
    };
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();
