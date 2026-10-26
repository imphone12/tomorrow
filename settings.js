const qualitySelect = document.getElementById('qualitySelect');
const trafficSelect = document.getElementById('trafficSelect');
const npcSelect = document.getElementById('npcSelect');
const saveBtn = document.getElementById('saveSettingsBtn');

const defaults = {
  quality: 'low',
  trafficDensity: 'low',
  npcDensity: 'low'
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem('viceCityConfig') || '{}');
  const cfg = { ...defaults, ...saved };
  qualitySelect.value = cfg.quality;
  trafficSelect.value = cfg.trafficDensity;
  npcSelect.value = cfg.npcDensity;
}

saveBtn.addEventListener('click', () => {
  const cfg = {
    quality: qualitySelect.value,
    trafficDensity: trafficSelect.value,
    npcDensity: npcSelect.value
  };
  localStorage.setItem('viceCityConfig', JSON.stringify(cfg));
  showToast('Settings saved');
});

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1200);
}

loadSettings();
