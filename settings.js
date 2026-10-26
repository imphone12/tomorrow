const qualitySelect = document.getElementById("qualitySelect");
const trafficSelect = document.getElementById("trafficSelect");
const npcSelect = document.getElementById("npcSelect");
const saveBtn = document.getElementById("saveSettingsBtn");

const defaults = {
  quality: "low",
  trafficDensity: "low",
  npcDensity: "low"
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("viceCityConfig") || "{}");
  const settings = { ...defaults, ...saved };

  qualitySelect.value = settings.quality;
  trafficSelect.value = settings.trafficDensity;
  npcSelect.value = settings.npcDensity;
}

saveBtn.addEventListener("click", () => {
  const config = {
    quality: qualitySelect.value,
    trafficDensity: trafficSelect.value,
    npcDensity: npcSelect.value
  };
  localStorage.setItem("viceCityConfig", JSON.stringify(config));
  showToast("Settings saved");
});

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1100);
}

loadSettings();
