const defaults = { guestMode: "auto", manualGuests: 2, showPersonNight: false };
const radios = [...document.querySelectorAll('input[name="guestMode"]')];
const manualGuests = document.getElementById("manualGuests");
const showPersonNight = document.getElementById("showPersonNight");
const status = document.getElementById("status");

chrome.storage.sync.get(defaults, (settings) => {
  const selected = radios.find((radio) => radio.value === settings.guestMode) || radios[0];
  selected.checked = true;
  manualGuests.value = settings.manualGuests;
  showPersonNight.checked = Boolean(settings.showPersonNight);
  updateDisabledState();
});

radios.forEach((radio) => radio.addEventListener("change", save));
manualGuests.addEventListener("change", save);
manualGuests.addEventListener("input", updateDisabledState);
showPersonNight.addEventListener("change", save);

function updateDisabledState() {
  const manual = document.querySelector('input[name="guestMode"]:checked')?.value === "manual";
  manualGuests.disabled = !manual;
}

function save() {
  updateDisabledState();
  const guestMode = document.querySelector('input[name="guestMode"]:checked')?.value || "auto";
  const guests = Math.min(12, Math.max(1, Number.parseInt(manualGuests.value, 10) || 2));
  manualGuests.value = guests;

  chrome.storage.sync.set({ guestMode, manualGuests: guests, showPersonNight: showPersonNight.checked }, () => {
    status.textContent = "Saved";
    window.setTimeout(() => { status.textContent = ""; }, 1000);
  });
}
