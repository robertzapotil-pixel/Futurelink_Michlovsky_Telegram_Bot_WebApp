// Shared "pick a house from Evidence" component, used by Mini App forms that
// replace manual Obec/Ulice/Typ čísla/Číslo objektu entry with a house
// chosen from the "Evidence instalací a přípojek" Google Sheet.
//
// Markup contract: the host page provides an empty `<div id="house_picker">`;
// this script fills it in. Usage from the host page's submit handler:
//
//   const domId = window.HousePicker.getSelectedHouseId();
//   if (!domId) missingFields.push("Dům");
//
// Houses come from an Apps Script Web App bound to the Evidence spreadsheet
// (same project as the house-ID auto-numbering script), not from the bot —
// the bot has no public HTTP endpoint. See appscript/evidence_api.gs.
(function () {
  // Apps Script Web App serving the Evidence house list (appscript/evidence_api.gs).
  const HOUSES_API_URL = "https://script.google.com/macros/s/AKfycbwY-xfq1o3jIv1nwRME9VumUDgZN4A3L9CYbUmWwFCqwoDoccDo_tucqCs2B0jsUJbJAQ/exec";

  const root = document.getElementById("house_picker");
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const technik = params.get("technik") || "";
  // Telegram's signed proof that this page was opened from the bot's own
  // Mini App — forwarded to the Apps Script endpoint so it can tell a real
  // request apart from anyone who finds the public API URL in this file.
  const initData = window.Telegram?.WebApp?.initData || "";

  root.innerHTML = `
    <label for="hp_obec">Obec</label>
    <select id="hp_obec"><option value="">— vyber —</option></select>

    <label for="hp_dum">Dům</label>
    <select id="hp_dum" disabled><option value="">— nejdřív vyber obec —</option></select>

    <div id="hp_card" class="hint" style="display:none; margin-top:8px;"></div>

    <label id="hp_confirm_label" style="display:none; font-weight:400; margin-top:8px;">
      <input type="checkbox" id="hp_confirm" style="width:auto; display:inline-block; vertical-align:middle;" />
      <span id="hp_confirm_text"></span>
    </label>
  `;

  const obecSelect = document.getElementById("hp_obec");
  const domSelect = document.getElementById("hp_dum");
  const card = document.getElementById("hp_card");
  const confirmLabel = document.getElementById("hp_confirm_label");
  const confirmCheckbox = document.getElementById("hp_confirm");
  const confirmText = document.getElementById("hp_confirm_text");

  let houses = [];
  let selectedHouse = null;

  function houseLabel(house) {
    const cislo = house.cislo_popisne || house.cislo_orientacni
      ? house.cislo_popisne || house.cislo_orientacni
      : house.parcelni_cislo ? `parc. ${house.parcelni_cislo}` : "bez čísla";
    const star = house.planovano_dnes ? "⭐ " : "";
    return `${star}${cislo} · ${house.ulice || "—"} · ${house.jmeno} (#${house.id})`;
  }

  function resetDum(message) {
    domSelect.innerHTML = `<option value="">${message}</option>`;
    domSelect.disabled = true;
    selectedHouse = null;
    card.style.display = "none";
    confirmLabel.style.display = "none";
    confirmCheckbox.checked = false;
  }

  function populateObce() {
    const obce = [...new Set(houses.map((h) => h.obec).filter(Boolean))].sort();
    obce.forEach((obec) => {
      const opt = document.createElement("option");
      opt.value = obec;
      opt.textContent = obec;
      obecSelect.appendChild(opt);
    });
  }

  function populateDomy(obec) {
    const inObec = houses
      .filter((h) => h.obec === obec && h.id)
      .sort((a, b) => (b.planovano_dnes ? 1 : 0) - (a.planovano_dnes ? 1 : 0));

    domSelect.innerHTML = '<option value="">— vyber —</option>';
    inObec.forEach((house) => {
      const opt = document.createElement("option");
      opt.value = house.id;
      opt.textContent = houseLabel(house);
      domSelect.appendChild(opt);
    });
    domSelect.disabled = inObec.length === 0;
    if (inObec.length === 0) {
      domSelect.innerHTML = '<option value="">V této obci nejsou žádné domy s ID</option>';
    }
  }

  obecSelect.addEventListener("change", () => {
    resetDum("— vyber dům —");
    if (obecSelect.value) populateDomy(obecSelect.value);
  });

  domSelect.addEventListener("change", () => {
    selectedHouse = houses.find((h) => String(h.id) === domSelect.value) || null;
    confirmCheckbox.checked = false;
    if (!selectedHouse) {
      card.style.display = "none";
      confirmLabel.style.display = "none";
      return;
    }
    const cisloLine = selectedHouse.cislo_popisne
      ? `č.p. ${selectedHouse.cislo_popisne}`
      : selectedHouse.cislo_orientacni
      ? `č.o. ${selectedHouse.cislo_orientacni}`
      : selectedHouse.parcelni_cislo
      ? `parc. ${selectedHouse.parcelni_cislo}`
      : "bez čísla";
    card.innerHTML = [
      `<strong>#${selectedHouse.id} ${selectedHouse.jmeno}</strong>`,
      `${selectedHouse.ulice || "—"}, ${cisloLine}, ${selectedHouse.obec}`,
      selectedHouse.telefon || "",
    ].filter(Boolean).join("<br>");
    card.style.display = "block";
    confirmText.textContent =
      `Zapisuješ k domu #${selectedHouse.id} – ${selectedHouse.jmeno}, ` +
      `${selectedHouse.ulice || "—"} ${cisloLine}, ${selectedHouse.obec}. Souhlasí?`;
    confirmLabel.style.display = "block";
  });

  resetDum("— nejdřív vyber obec —");

  fetch(HOUSES_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight
    body: JSON.stringify({ init_data: initData, technik }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      houses = data.houses || [];
      populateObce();
    })
    .catch(() => {
      root.innerHTML = '<div class="hint status-bad">Nepodařilo se načíst seznam domů. Zkus formulář otevřít znovu z Telegramu.</div>';
    });

  window.HousePicker = {
    getSelectedHouseId() {
      return selectedHouse && confirmCheckbox.checked ? selectedHouse.id : null;
    },
    getSelectedHouse() {
      return selectedHouse && confirmCheckbox.checked ? selectedHouse : null;
    },
  };
})();
