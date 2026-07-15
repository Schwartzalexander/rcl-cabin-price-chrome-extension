(() => {
  "use strict";

  const PRICE_SELECTOR = '[data-testid^="cruise-price-label-"]';
  const AVG_LABEL_SELECTOR = '[data-testid^="cruise-price-avg-label-"]';
  const SORT_PANEL_ID = "rclcp-sort-panel";
  const PRICE_BOX_CLASS = "rclcp-price-box";
  const DEFAULT_SETTINGS = { guestMode: "auto", manualGuests: 2, showPersonNight: false };

  let settings = { ...DEFAULT_SETTINGS };
  let scheduled = false;
  let originalSequence = 0;
  let currentSortMode = "cabinNightAsc";
  let defaultSortApplied = false;
  let loadAllActive = false;
  let loadAllMissingAttempts = 0;

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
      if (changes.showPersonNight) settings.showPersonNight = changes.showPersonNight.newValue;
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
      applyDefaultSort();
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

    const personNight = settings.showPersonNight
      ? `<div class="rclcp-person-night">${escapeHtml(formatMoney(personPerNight, price.currencyCode, price.symbol))} ${escapeHtml(i18n.perPersonNight)}</div>`
      : "";

    box.innerHTML = `
      <div class="rclcp-total">${escapeHtml(formatMoney(cabinTotal, price.currencyCode, price.symbol))} ${escapeHtml(i18n.perCabin)}</div>
      <div class="rclcp-night">${escapeHtml(formatMoney(cabinPerNight, price.currencyCode, price.symbol))} ${escapeHtml(i18n.perCabinNight)}</div>
      ${personNight}
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
    if (!document.querySelector(PRICE_SELECTOR)) return;

    let panel = document.getElementById(SORT_PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = SORT_PANEL_ID;
      panel.className = "rclcp-sort-panel";
      panel.innerHTML = `
      <label for="rclcp-sort-select">${escapeHtml(i18n.sortLabel)}</label>
      <select id="rclcp-sort-select"></select>
      <button type="button" class="rclcp-sort-button" data-rclcp-action="load-more">${escapeHtml(i18n.loadMore)}</button>
      <button type="button" class="rclcp-sort-button" data-rclcp-action="load-all">${escapeHtml(i18n.loadAll)}</button>
      <button type="button" class="rclcp-sort-button" data-rclcp-action="resort">${escapeHtml(i18n.resort)}</button>
      <span class="rclcp-sort-count"></span>
    `;

      panel.querySelector("select").addEventListener("change", (event) => {
        currentSortMode = event.target.value;
        sortLoadedCards(currentSortMode);
      });
      panel.querySelector('[data-rclcp-action="load-more"]').addEventListener("click", loadMoreCruises);
      panel.querySelector('[data-rclcp-action="load-all"]').addEventListener("click", loadAllCruises);
      panel.querySelector('[data-rclcp-action="resort"]').addEventListener("click", resortLoadedCards);
    }

    updateSortOptions(panel);
    placeSortPanel(panel);
    updateLoadMoreState();
  }

  function updateSortOptions(panel) {
    const select = panel.querySelector("select");
    const selected = currentSortMode;
    const options = [
      ["original", i18n.original],
      ["cabinNightAsc", i18n.cabinNightAsc],
      ["cabinNightDesc", i18n.cabinNightDesc],
      ...(settings.showPersonNight ? [["personNightAsc", i18n.personNightAsc], ["personNightDesc", i18n.personNightDesc]] : []),
      ["cabinTotalAsc", i18n.cabinTotalAsc],
      ["cabinTotalDesc", i18n.cabinTotalDesc],
      ["nightsAsc", i18n.nightsAsc],
      ["nightsDesc", i18n.nightsDesc]
    ];
    const valid = options.some(([value]) => value === selected);
    const signature = options.map(([value]) => value).join("|");
    if (select.dataset.rclcpOptions === signature) return;

    select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
    select.dataset.rclcpOptions = signature;
    currentSortMode = valid ? selected : "cabinNightAsc";
    select.value = currentSortMode;
  }

  function applyDefaultSort() {
    if (defaultSortApplied) return;
    if (getSortableUnits().length < 2) return;
    defaultSortApplied = true;
    sortLoadedCards(currentSortMode);
  }

  function placeSortPanel(panel) {
    const heading = findResultsHeading();
    const titleRow = heading?.closest('[data-testid="number-results-label"]');
    if (titleRow) {
      if (panel.previousElementSibling === titleRow) return;
      titleRow.insertAdjacentElement("afterend", panel);
      return;
    }
    if (heading) {
      if (panel.previousElementSibling === heading) return;
      heading.insertAdjacentElement("afterend", panel);
      return;
    }
    const nativeSort = findNativeSortControl();
    const insertionTarget = nativeSort?.parentElement || document.querySelector(PRICE_SELECTOR).closest("main") || document.body;
    if (nativeSort?.parentElement) {
      if (panel.previousElementSibling !== nativeSort.parentElement) nativeSort.parentElement.insertAdjacentElement("afterend", panel);
    } else if (insertionTarget.firstElementChild !== panel) {
      insertionTarget.insertAdjacentElement("afterbegin", panel);
    }
  }

  function resortLoadedCards() {
    sortLoadedCards(currentSortMode);
  }

  function loadMoreCruises() {
    const button = findLoadMoreButton();
    const statusNode = document.querySelector(`#${SORT_PANEL_ID} .rclcp-sort-count`);
    if (!button) {
      updateLoadMoreState();
      if (statusNode) statusNode.textContent = i18n.allLoaded;
      return;
    }

    button.click();
    if (statusNode) statusNode.textContent = i18n.loadingMore;
    window.setTimeout(() => {
      scheduleProcess();
      resortLoadedCards();
      updateLoadMoreState();
    }, 1200);
  }

  function loadAllCruises() {
    if (loadAllActive) return;
    loadAllActive = true;
    loadAllMissingAttempts = 0;
    updateLoadMoreState();
    loadNextCruisePage();
  }

  function loadNextCruisePage() {
    const button = findLoadMoreButton();
    const statusNode = document.querySelector(`#${SORT_PANEL_ID} .rclcp-sort-count`);
    if (!button) {
      if (loadAllMissingAttempts < 3) {
        loadAllMissingAttempts += 1;
        if (statusNode) statusNode.textContent = i18n.loadingAll;
        window.setTimeout(loadNextCruisePage, 900);
        return;
      }

      loadAllActive = false;
      processCards();
      ensureSortPanel();
      resortLoadedCards();
      updateSortCount();
      updateLoadMoreState();
      if (statusNode) statusNode.textContent = i18n.allLoaded;
      return;
    }

    loadAllMissingAttempts = 0;
    button.click();
    if (statusNode) statusNode.textContent = i18n.loadingAll;
    window.setTimeout(() => {
      scheduleProcess();
      resortLoadedCards();
      loadNextCruisePage();
    }, 1400);
  }

  function updateLoadMoreState() {
    const loadMoreButton = document.querySelector(`#${SORT_PANEL_ID} [data-rclcp-action="load-more"]`);
    const loadAllButton = document.querySelector(`#${SORT_PANEL_ID} [data-rclcp-action="load-all"]`);
    if (!loadMoreButton || !loadAllButton) return;

    const nativeButton = findLoadMoreButton();
    const disabled = !nativeButton || loadAllActive;
    const loadMoreText = nativeButton ? i18n.loadMore : i18n.allLoaded;
    const loadAllText = loadAllActive ? i18n.loadingAll : nativeButton ? i18n.loadAll : i18n.allLoaded;
    const hideLoadAll = !nativeButton && !loadAllActive;
    if (loadMoreButton.disabled !== disabled) loadMoreButton.disabled = disabled;
    if (loadMoreButton.textContent !== loadMoreText) loadMoreButton.textContent = loadMoreText;
    if (loadAllButton.disabled !== disabled) loadAllButton.disabled = disabled;
    if (loadAllButton.textContent !== loadAllText) loadAllButton.textContent = loadAllText;
    if (loadAllButton.hidden !== hideLoadAll) loadAllButton.hidden = hideLoadAll;
  }

  function findLoadMoreButton() {
    const controls = [...document.querySelectorAll('button, [role="button"]')];
    return controls.find((node) => {
      if (node.closest(`#${SORT_PANEL_ID}`)) return false;
      if (node.disabled || node.getAttribute("aria-disabled") === "true") return false;
      if (!isVisible(node)) return false;
      return /(mehr laden|load more|show more|voir plus|cargar más|carica altro)/i.test(node.textContent || node.getAttribute("aria-label") || "");
    });
  }

  function isVisible(node) {
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
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
      nightsAsc: ["rclcpNights", 1],
      nightsDesc: ["rclcpNights", -1]
    };
    const [key, direction] = map[mode] || map.original;
    return (a, b) => ((Number(a.dataset[key]) || 0) - (Number(b.dataset[key]) || 0)) * direction;
  }

  function updateSortCount() {
    const countNode = document.querySelector(`#${SORT_PANEL_ID} .rclcp-sort-count`);
    if (countNode) {
      const text = i18n.loadedCount.replace("{count}", getSortableUnits().length);
      if (countNode.textContent !== text) countNode.textContent = text;
    }
    updateLoadMoreState();
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
    return {
      perCabin: "per cabin", perCabinNight: "per cabin/night", perPersonNight: "per person/night",
      guests: "guests", nights: "nights", assumedGuests: "Occupancy not shown – calculated for {count} guests.",
      sortLabel: "RCL extra sorting:", original: "Original order",
      cabinNightAsc: "Cabin price/night – lowest first", cabinNightDesc: "Cabin price/night – highest first",
      personNightAsc: "Price per person/night – lowest first", personNightDesc: "Price per person/night – highest first",
      cabinTotalAsc: "Total cabin price – lowest first", cabinTotalDesc: "Total cabin price – highest first",
      nightsAsc: "Nights – shortest first", nightsDesc: "Nights – longest first", loadedCount: "{count} loaded cruises",
      loadMore: "Load more", loadAll: "Load all", resort: "Sort again", allLoaded: "All cruises are loaded",
      loadingMore: "Loading more cruises ...", loadingAll: "Loading all cruises ..."
    };
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();
