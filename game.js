const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hud = {
  healthText: document.getElementById("healthText"),
  carText: document.getElementById("carText"),
  cashText: document.getElementById("cashText"),
  wantedText: document.getElementById("wantedText"),
  weaponText: document.getElementById("weaponText"),
  zoneText: document.getElementById("zoneText"),
  missionText: document.getElementById("missionText"),
  interactionText: document.getElementById("interactionText"),
  missionBox: document.getElementById("missionBox"),
  healthBar: document.getElementById("healthBar"),
  carBar: document.getElementById("carBar"),
  wantedStars: document.getElementById("wantedStars"),
  toast: document.getElementById("toast"),
  cheatConsole: document.getElementById("cheatConsole"),
  cheatInput: document.getElementById("cheatInput")
};

const savedConfig = JSON.parse(localStorage.getItem("viceCityConfig") || '{"quality":"low","trafficDensity":"low","npcDensity":"low"}');

const SETTINGS = {
  quality: savedConfig.quality || "low",
  trafficDensity: savedConfig.trafficDensity || "low",
  npcDensity: savedConfig.npcDensity || "low"
};

const WORLD = { width: 3400, height: 2800 };
const TAU = Math.PI * 2;

const keys = {};
let cheatMode = false;

const player = {
  x: 580,
  y: 620,
  radius: 14,
  speed: 210,
  angle: 0,
  health: 100,
  cash: 0,
  wanted: 0,
  weapon: "Pistol",
  inCar: false,
  car: null,
  invuln: 0
};

const state = {
  buildings: [],
  roads: [],
  trafficCars: [],
  policeCars: [],
  npcs: [],
  bullets: [],
  particles: [],
  stores: [],
  pickups: [],
  objective: { x: 820, y: 640, radius: 42 },
  missionStage: 0,
  freeCar: null,
  freeCarEnabled: false,
  policeCarEnabled: false,
  riotMode: false,
  chaosTraffic: false,
  godMode: false,
  camera: { x: 0, y: 0 }
};

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function showToast(msg) {
  hud.toast.textContent = msg;
  hud.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => hud.toast.classList.add("hidden"), 1200);
}

function setCheatMode(active) {
  cheatMode = active;
  hud.cheatConsole.classList.toggle("hidden", !active);
  if (active) {
    hud.cheatInput.value = "";
    hud.cheatInput.focus();
  }
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  if (e.key === "Enter") {
    if (!cheatMode) {
      e.preventDefault();
      setCheatMode(true);
      return;
    }

    const text = hud.cheatInput.value.trim().toLowerCase();
    if (text) processCheat(text);
    setCheatMode(false);
    e.preventDefault();
    return;
  }

  if (cheatMode) {
    if (e.key === "Escape") {
      setCheatMode(false);
      return;
    }
    return;
  }

  keys[key] = true;

  if (!e.repeat) {
    if (key === "e") toggleCar();
    if (key === "f") interact();
    if (key === " ") fireWeapon();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function createRoads() {
  state.roads = [];
  const roadsX = [0, 260, 520, 780, 1040, 1300, 1560, 1820, 2080, 2340, 2600, 2860];
  const roadsY = [0, 220, 440, 660, 880, 1100, 1320, 1540, 1760, 1980, 2200, 2420];

  for (const x of roadsX) {
    state.roads.push({ x, y: 0, w: 82, h: WORLD.height });
  }
  for (const y of roadsY) {
    state.roads.push({ x: 0, y, w: WORLD.width, h: 82 });
  }
}

function createBuildings() {
  state.buildings = [];
  const colors = ["#1d2d41", "#212f3f", "#243246", "#1d2734", "#2a3c4f"];

  for (let gx = 0; gx < 12; gx++) {
    for (let gy = 0; gy < 9; gy++) {
      if (Math.random() < 0.7) {
        const x = 100 + gx * 250 + rand(8, 24);
        const y = 80 + gy * 236 + rand(8, 24);
        state.buildings.push({
          x, y,
          w: rand(90, 165),
          h: rand(90, 170),
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }
  }
}

function createStores() {
  state.stores = [
    { x: 420, y: 1010, w: 70, h: 48, type: "repair", name: "Repair Shop", color: "#2dd4bf" },
    { x: 980, y: 620, w: 70, h: 48, type: "ammo", name: "Ammu", color: "#f59e0b" },
    { x: 1580, y: 1620, w: 74, h: 48, type: "food", name: "Burger Shot", color: "#f87171" },
    { x: 2250, y: 1360, w: 70, h: 48, type: "health", name: "Clinic", color: "#4ade80" },
    { x: 2560, y: 860, w: 70, h: 48, type: "garage", name: "Garage", color: "#60a5fa" },
    { x: 2740, y: 2080, w: 70, h: 48, type: "casino", name: "Casino", color: "#a78bfa" }
  ];
}

function collidesWithBuildings(x, y, r) {
  for (const b of state.buildings) {
    const closestX = clamp(x, b.x, b.x + b.w);
    const closestY = clamp(y, b.y, b.y + b.h);
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

function collidesWithRect(x, y, w, h) {
  for (const b of state.buildings) {
    if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return true;
  }
  return false;
}

function createTrafficCars() {
  const base = { low: 13, medium: 25, high: 40 };
  const density = base[SETTINGS.trafficDensity] || 13;
  state.trafficCars = [];

  for (let i = 0; i < density; i++) {
    let x = rand(80, WORLD.width - 80);
    let y = rand(80, WORLD.height - 80);
    for (let tries = 0; tries < 30; tries++) {
      if (!collidesWithBuildings(x, y, 16)) break;
      x = rand(80, WORLD.width - 80);
      y = rand(80, WORLD.height - 80);
    }

    state.trafficCars.push({
      x, y,
      w: 30, h: 16,
      angle: rand(0, TAU),
      speed: rand(55, 140),
      color: ["#ff8a3d", "#fbbf24", "#5eead4", "#f472b6", "#60a5fa", "#f87171"][i % 6],
      damage: 0,
      fire: 0,
      exploding: false,
      exploded: false
    });
  }
}

function createNPCs() {
  const base = { low: 18, medium: 28, high: 42 };
  const count = base[SETTINGS.npcDensity] || 18;
  state.npcs = [];

  for (let i = 0; i < count; i++) {
    let x = rand(90, WORLD.width - 90);
    let y = rand(90, WORLD.height - 90);

    for (let tries = 0; tries < 40; tries++) {
      if (!collidesWithBuildings(x, y, 8)) break;
      x = rand(90, WORLD.width - 90);
      y = rand(90, WORLD.height - 90);
    }

    state.npcs.push({
      x, y,
      radius: 11,
      color: ["#f6d365", "#f9a8d4", "#7dd3fc", "#86efac", "#fca5a5"][i % 5],
      angle: rand(0, TAU),
      speed: rand(20, 52),
      mood: Math.random() < 0.6 ? "calm" : "angry",
      angry: Math.random() < 0.4,
      panic: 0
    });
  }
}

function createPickups() {
  state.pickups = [];
  for (let i = 0; i < 26; i++) {
    let x = rand(100, WORLD.width - 100);
    let y = rand(100, WORLD.height - 100);
    for (let tries = 0; tries < 30; tries++) {
      if (!collidesWithBuildings(x, y, 12)) break;
      x = rand(100, WORLD.width - 100);
      y = rand(100, WORLD.height - 100);
    }
    state.pickups.push({
      x, y,
      r: 10,
      value: 150 + Math.floor(Math.random() * 550),
      pulse: rand(0, 10)
    });
  }
}

function addBurst(x, y, color, count = 18) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y,
      vx: rand(-150, 150),
      vy: rand(-150, 150),
      life: rand(0.35, 1.2),
      size: rand(2, 6),
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function spawnPoliceCar() {
  const angle = rand(0, TAU);
  const spawnDistance = 360;
  const x = clamp(player.x + Math.cos(angle) * spawnDistance, 80, WORLD.width - 80);
  const y = clamp(player.y + Math.sin(angle) * spawnDistance, 80, WORLD.height - 80);

  state.policeCars.push({
    x, y,
    w: 30, h: 18,
    angle: angle,
    speed: 140 + player.wanted * 20,
    color: "#2563eb",
    damage: 0,
    fire: 0,
    exploding: false,
    exploded: false,
    isPolice: true
  });
}

function fireWeapon() {
  const source = player.inCar && player.car ? player.car : player;

  const angle = player.inCar ? source.angle : player.angle;
  const x = source.x + Math.cos(angle) * (player.inCar ? 24 : 18);
  const y = source.y + Math.sin(angle) * (player.inCar ? 24 : 18);

  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * 560,
    vy: Math.sin(angle) * 560,
    radius: 4,
    life: 1.3,
    source: "player"
  });
}

function toggleCar() {
  if (player.inCar && player.car) {
    const c = player.car;
    player.inCar = false;
    player.car = null;
    player.x = c.x + Math.cos(c.angle + Math.PI / 2) * 30;
    player.y = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
    return;
  }

  if (state.freeCar && dist(player, state.freeCar) < 48) {
    player.inCar = true;
    player.car = state.freeCar;
    state.freeCar.speed = 0;
    player.x = state.freeCar.x;
    player.y = state.freeCar.y;
    return;
  }

  let nearest = null;
  let nearestDist = Infinity;

  for (const car of state.trafficCars) {
    if (car.exploded) continue;
    const d = dist(player, car);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = car;
    }
  }

  if (nearest && nearestDist < 44) {
    player.inCar = true;
    player.car = nearest;
    nearest.speed = 0;
    player.x = nearest.x;
    player.y = nearest.y;
    player.angle = nearest.angle;
  }
}

function interact() {
  const nearbyStore = state.stores.find(s => {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    return dist(player, { x: cx, y: cy }) < 60;
  });

  if (nearbyStore) {
    if (nearbyStore.type === "repair") {
      if (player.cash >= 250) {
        player.cash -= 250;
        if (player.car) player.car.damage = 0;
        if (player.car) player.car.fire = 0;
        if (player.car) player.car.exploding = false;
        if (player.car) player.car.exploded = false;
        player.health = Math.min(100, player.health + 25);
        showToast("Repair complete");
      } else {
        showToast("Need $250");
      }
      return;
    }

    if (nearbyStore.type === "ammo") {
      if (player.cash >= 140) {
        player.cash -= 140;
        player.weapon = "Uzi";
        showToast("Bought Uzi");
      } else {
        showToast("Need $140");
      }
      return;
    }

    if (nearbyStore.type === "food") {
      if (player.cash >= 100) {
        player.cash -= 100;
        player.health = Math.min(100, player.health + 35);
        showToast("Food restored");
      } else {
        showToast("Need $100");
      }
      return;
    }

    if (nearbyStore.type === "health") {
      if (player.cash >= 80) {
        player.cash -= 80;
        player.health = 100;
        if (player.car) player.car.damage = 0;
        showToast("Full health");
      } else {
        showToast("Need $80");
      }
      return;
    }

    if (nearbyStore.type === "garage") {
      if (player.cash >= 200) {
        player.cash -= 200;
        if (player.car) player.car.damage = 0;
        if (player.car) player.car.fire = 0;
        showToast("Garage service");
      } else {
        showToast("Need $200");
      }
      return;
    }

    if (nearbyStore.type === "casino") {
      player.cash += 600;
      showToast("Casino win: +$600");
      return;
    }
  }

  const nearestNpc = state.npcs.find(n => dist(player, n) < 30);
  if (nearestNpc) {
    nearestNpc.angry = !nearestNpc.angry;
    nearestNpc.mood = nearestNpc.angry ? "angry" : "calm";
    if (state.riotMode) nearestNpc.angry = true;
    showToast(nearestNpc.angry ? "NPC: 'You started something!'" : "NPC: 'Stay cool'");
  }
}

function processCheat(code) {
  if (code === "freecar") {
    if (state.freeCarEnabled) {
      state.freeCarEnabled = false;
      state.freeCar = null;
      showToast("Free car OFF");
      return;
    }
    state.freeCarEnabled = true;
    state.freeCar = {
      x: player.x + 50,
      y: player.y + 35,
      w: 30, h: 18,
      angle: player.angle,
      speed: 0,
      color: "#fbbf24",
      damage: 0,
      fire: 0,
      exploding: false,
      exploded: false
    };
    showToast("Free car ON");
    return;
  }

  if (code === "policecar") {
    if (state.policeCarEnabled) {
      state.policeCarEnabled = false;
      state.policeCars = state.policeCars.filter(p => p.isCheat !== true);
      showToast("Police car OFF");
      return;
    }

    state.policeCarEnabled = true;
    const p = {
      x: player.x + 80,
      y: player.y + 80,
      w: 30, h: 18,
      angle: player.angle,
      speed: 130,
      color: "#2563eb",
      damage: 0,
      fire: 0,
      exploding: false,
      exploded: false,
      isCheat: true
    };
    state.policeCars.push(p);
    showToast("Police car ON");
    return;
  }

  if (code === "trafficchaos") {
    state.chaosTraffic = !state.chaosTraffic;
    showToast(state.chaosTraffic ? "Traffic chaos ON" : "Traffic chaos OFF");
    return;
  }

  if (code === "riot") {
    state.riotMode = !state.riotMode;
    showToast(state.riotMode ? "Riot mode ON" : "Riot mode OFF");
    state.npcs.forEach(n => { n.angry = state.riotMode; n.mood = state.riotMode ? "angry" : "calm"; });
    return;
  }

  if (code === "wanted2") {
    player.wanted = clamp(player.wanted + 2, 0, 5);
    showToast("Wanted +2");
    return;
  }

  if (code === "losewanted") {
    player.wanted = 0;
    state.policeCars = [];
    showToast("Wanted cleared");
    return;
  }

  if (code === "heal") {
    player.health = 100;
    if (player.car) {
      player.car.damage = 0;
      player.car.fire = 0;
      player.car.exploding = false;
      player.car.exploded = false;
    }
    showToast("Healed");
    return;
  }

  if (code === "godmode") {
    state.godMode = !state.godMode;
    showToast(state.godMode ? "God mode ON" : "God mode OFF");
    return;
  }

  showToast("Unknown cheat");
}

function updateHUD() {
  const carHealth = player.inCar && player.car ? Math.max(0, 100 - player.car.damage) : 100;
  const healthPct = clamp(player.health / 100, 0, 1);
  const carPct = clamp(carHealth / 100, 0, 1);

  hud.healthText.textContent = Math.ceil(player.health);
  hud.carText.textContent = String(Math.ceil(carHealth));
  hud.cashText.textContent = `$${Math.floor(player.cash)}`;
  hud.wantedText.textContent = String(Math.min(5, Math.floor(player.wanted)));
  hud.weaponText.textContent = player.weapon;

  hud.healthBar.style.width = `${healthPct * 100}%`;
  hud.carBar.style.width = `${carPct * 100}%`;

  const zone = player.y < 900 ? "Downtown" :
               player.y < 1750 ? "Vice Beach" :
               player.x > 2000 ? "Harbor" : "Little Havana";
  hud.zoneText.textContent = zone;

  const stars = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement("span");
    s.className = "star" + (i < Math.min(5, Math.ceil(player.wanted)) ? " active" : "");
    s.textContent = "★";
    stars.push(s);
  }
  hud.wantedStars.innerHTML = "";
  stars.forEach(s => hud.wantedStars.appendChild(s));

  let interactionText = "-";
  for (const s of state.stores) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    if (dist(player, { x: cx, y: cy }) < 56) {
      interactionText = s.name;
      break;
    }
  }
  hud.interactionText.textContent = interactionText;
}

function updateCamera() {
  const targetX = clamp(player.x - canvas.width / 2, 0, WORLD.width - canvas.width);
  const targetY = clamp(player.y - canvas.height / 2, 0, WORLD.height - canvas.height);

  state.camera.x += (targetX - state.camera.x) * 0.09;
  state.camera.y += (targetY - state.camera.y) * 0.09;
}

function updatePlayer(dt) {
  let moveX = 0;
  let moveY = 0;

  if (keys["w"] || keys["arrowup"]) moveY -= 1;
  if (keys["s"] || keys["arrowdown"]) moveY += 1;
  if (keys["a"] || keys["arrowleft"]) moveX -= 1;
  if (keys["d"] || keys["arrowright"]) moveX += 1;

  if (player.inCar && player.car) {
    const c = player.car;

    if (keys["w"] || keys["arrowup"]) {
      c.speed += 210 * dt;
    }
    if (keys["s"] || keys["arrowdown"]) {
      c.speed -= 190 * dt;
    }
    if (keys["a"] || keys["arrowleft"]) c.angle -= 2.1 * dt;
    if (keys["d"] || keys["arrowright"]) c.angle += 2.1 * dt;

    if (!(keys["w"] || keys["arrowup"] || keys["s"] || keys["arrowdown"])) {
      c.speed *= 0.96;
    }

    c.speed = clamp(c.speed, -90, 270);

    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;

    if (!collidesWithRect(nx - c.w / 2, ny - c.h / 2, c.w, c.h)) {
      c.x = nx;
      c.y = ny;
    } else {
      c.speed *= -0.2;
    }

    player.x = c.x;
    player.y = c.y;
    player.angle = c.angle;
    return;
  }

  if (moveX !== 0 || moveY !== 0) {
    const len = Math.hypot(moveX, moveY);
    moveX /= len;
    moveY /= len;

    player.angle = Math.atan2(moveY, moveX);

    const sprintMult = keys["shift"] ? 1.45 : 1;
    const nextX = player.x + moveX * player.speed * sprintMult * dt;
    const nextY = player.y + moveY * player.speed * sprintMult * dt;

    if (!collidesWithBuildings(nextX, player.y, player.radius)) player.x = nextX;
    if (!collidesWithBuildings(player.x, nextY, player.radius)) player.y = nextY;
  }
}

function updateTraffic(dt) {
  const trafficBoost = state.chaosTraffic ? 1.7 : 1;

  for (const car of state.trafficCars) {
    if (car.exploded) continue;

    car.angle += rand(-0.25, 0.25) * dt * trafficBoost;
    if (state.chaosTraffic) {
      car.speed = clamp(car.speed + rand(-45, 45) * dt, 30, 230);
    }

    const nx = car.x + Math.cos(car.angle) * car.speed * dt * trafficBoost;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt * trafficBoost;

    if (nx < 30 || nx > WORLD.width - 30 || ny < 30 || ny > WORLD.height - 30) {
      car.angle += Math.PI * 0.8;
    }

    if (!collidesWithRect(nx - car.w / 2, ny - car.h / 2, car.w, car.h)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.angle += Math.PI * 0.7;
      car.speed *= 0.6;
    }

    if (player.inCar && player.car && dist(player.car, car) < 38) {
      player.car.damage = clamp(player.car.damage + 7 * dt, 0, 100);
      if (player.car.damage > 60) {
        player.car.fire = Math.min(3, player.car.fire + dt * 0.7);
      }
    }
  }
}

function updatePolice(dt) {
  const wantedActive = player.wanted > 0 || state.policeCarEnabled;
  if (!wantedActive) {
    state.policeCars = state.policeCars.filter(p => p.isCheat === true);
    return;
  }

  if (player.wanted > 0 && Math.random() < 0.03) {
    spawnPoliceCar();
  }

  for (const p of state.policeCars) {
    if (p.exploded) continue;

    const ang = Math.atan2(player.y - p.y, player.x - p.x);
    p.angle = ang;
    p.speed = clamp(p.speed + (160 - p.speed) * 0.05, 90, 220);

    const nx = p.x + Math.cos(ang) * p.speed * dt;
    const ny = p.y + Math.sin(ang) * p.speed * dt;

    if (!collidesWithRect(nx - p.w / 2, ny - p.h / 2, p.w, p.h)) {
      p.x = nx; p.y = ny;
    } else {
      p.speed *= 0.7;
    }

    if (dist(player, p) < 30) {
      if (!state.godMode && player.invuln <= 0) {
        player.health -= 18 * dt;
        player.invuln = 0.2;
      }
    }

    if (Math.random() < 0.012) {
      const shotAng = Math.atan2(player.y - p.y, player.x - p.x);
      state.bullets.push({
        x: p.x + Math.cos(shotAng) * 20,
        y: p.y + Math.sin(shotAng) * 20,
        vx: Math.cos(shotAng) * 430,
        vy: Math.sin(shotAng) * 430,
        radius: 4,
        life: 1.2,
        source: "police"
      });
    }
  }
}

function updateNPCs(dt) {
  for (const npc of state.npcs) {
    if (state.riotMode) npc.angry = true;

    if (state.riotMode) {
      const ang = Math.atan2(player.y - npc.y, player.x - npc.x);
      npc.angle = ang;
      npc.x += Math.cos(ang) * npc.speed * 1.8 * dt;
      npc.y += Math.sin(ang) * npc.speed * 1.8 * dt;
    } else {
      npc.x += Math.cos(npc.angle) * npc.speed * dt * 0.7;
      npc.y += Math.sin(npc.angle) * npc.speed * dt * 0.7;

      if (collidesWithBuildings(npc.x, npc.y, npc.radius)) {
        npc.angle += Math.PI * rand(0.5, 1.2);
      }

      if (Math.random() < 0.02) {
        npc.angle += rand(-1.2, 1.2);
      }
    }

    if (!state.riotMode && player.wanted > 0 && dist(player, npc) < 180) {
      npc.angry = true;
      const ang = Math.atan2(player.y - npc.y, player.x - npc.x);
      npc.angle = ang;
      npc.x += Math.cos(ang) * npc.speed * dt;
      npc.y += Math.sin(ang) * npc.speed * dt;
    }

    if (dist(player, npc) < 28 && state.riotMode) {
      if (player.invuln <= 0) {
        player.health -= 7 * dt;
        player.invuln = 0.12;
      }
    }
  }
}

function updatePickups(dt) {
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    p.pulse += dt * 4;
    if (dist(player, p) < 24) {
      player.cash += p.value;
      addBurst(p.x, p.y, "#ffd166", 20);
      state.pickups.splice(i, 1);
    }
  }
}

function updateBullets(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height) {
      state.bullets.splice(i, 1);
      continue;
    }

    for (const car of state.trafficCars) {
      if (car.exploded) continue;
      if (dist(b, car) < 16) {
        car.damage = clamp(car.damage + 18, 0, 100);
        if (car.damage > 60) car.fire = Math.min(3, car.fire + 0.8);
        state.bullets.splice(i, 1);
        addBurst(b.x, b.y, "#ff5d52", 10);
        break;
      }
    }

    for (const p of state.policeCars) {
      if (p.exploded) continue;
      if (dist(b, p) < 16) {
        p.damage = clamp(p.damage + 18, 0, 100);
        if (p.damage > 60) p.fire = Math.min(3, p.fire + 0.8);
        state.bullets.splice(i, 1);
        addBurst(b.x, b.y, "#ff5d52", 10);
        break;
      }
    }

    if (dist(player, b) < 14 && b.source !== "player") {
      state.bullets.splice(i, 1);
      if (!state.godMode && player.invuln <= 0) {
        player.health -= 12;
        player.invuln = 0.2;
      }
    }
  }
}

function updateVehicleDamage(dt) {
  for (const car of state.trafficCars) {
    if (car.exploded) continue;

    if (car.damage > 60 && car.fire < 1) car.fire = 1;
    if (car.fire > 0) {
      car.fire += dt * 0.45;
      if (car.fire > 1.8) car.exploding = true;
    }

    if (car.exploding) {
      car.fire += dt * 0.8;
      if (car.fire > 2.8) {
        car.exploded = true;
        addBurst(car.x, car.y, "#ff6b57", 44);
        player.cash += 350;
      }
    }

    if (car.exploded) {
      state.trafficCars = state.trafficCars.filter(c => !c.exploded);
    }
  }

  for (const p of state.policeCars) {
    if (p.exploded) continue;
    if (p.damage > 60 && p.fire < 1) p.fire = 1;
    if (p.fire > 0) {
      p.fire += dt * 0.5;
      if (p.fire > 1.8) p.exploding = true;
    }
    if (p.exploding) {
      p.fire += dt * 0.8;
      if (p.fire > 2.8) {
        p.exploded = true;
        addBurst(p.x, p.y, "#ff6b57", 36);
      }
    }
  }

  if (player.inCar && player.car) {
    const c = player.car;
    if (c.damage > 60 && c.fire < 1) c.fire = 1;
    if (c.fire > 0) {
      c.fire += dt * 0.5;
      if (c.fire > 1.8) c.exploding = true;
    }
    if (c.exploding) {
      c.fire += dt * 0.8;
      if (c.fire > 2.8) {
        c.exploded = true;
        addBurst(c.x, c.y, "#ff6b57", 60);
        player.inCar = false;
        player.car = null;
        player.health = Math.max(0, player.health - 25);
        showToast("Your car exploded!");
      }
    }
  }
}

function updateMissions() {
  const o = state.objective;

  if (state.missionStage === 0) {
    hud.missionBox.textContent = "Pick up the briefcase by the neon marker.";
    if (dist(player, o) < o.radius + 18) {
      player.cash += 1500;
      state.missionStage = 1;
      state.objective = { x: 2840, y: 2140, radius: 42 };
      showToast("Briefcase secured");
      player.wanted = clamp(player.wanted + 1.5, 0, 5);
    }
  } else if (state.missionStage === 1) {
    hud.missionBox.textContent = "Deliver the package to the docks.";
    if (dist(player, state.objective) < state.objective.radius + 18) {
      player.cash += 4200;
      state.missionStage = 2;
      showToast("Mission complete");
    }
  } else {
    hud.missionBox.textContent = "Open-world chaos is yours.";
  }
}

function updateWanted(dt) {
  if (player.wanted > 0) {
    player.wanted = Math.max(0, player.wanted - dt * 0.05);
  }

  if (player.wanted > 0 && Math.random() < 0.015) {
    spawnPoliceCar();
  }
}

function updatePlayerState(dt) {
  player.invuln = Math.max(0, player.invuln - dt);

  if (state.godMode) {
    player.health = 100;
    if (player.car) player.car.damage = 0;
  }

  if (player.health <= 0) {
    player.health = 100;
    player.cash = Math.max(0, player.cash - 600);
    player.x = 540;
    player.y = 640;
    player.inCar = false;
    player.car = null;
    player.wanted = 0;
    state.policeCars = [];
    showToast("Busted");
  }
}

function update(dt) {
  updatePlayer(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updateNPCs(dt);
  updatePickups(dt);
  updateBullets(dt);
  updateVehicleDamage(dt);
  updateMissions();
  updateWanted(dt);
  updatePlayerState(dt);
  updateCamera();
  updateParticles(dt);
  updateHUD();
}

function drawGrid() {
  ctx.fillStyle = "#0d1118";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;

  for (let x = 0; x < WORLD.width; x += 80) {
    const px = x - state.camera.x;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, WORLD.height);
    ctx.stroke();
  }

  for (let y = 0; y < WORLD.height; y += 80) {
    const py = y - state.camera.y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(WORLD.width, py);
    ctx.stroke();
  }
}

function drawRoads() {
  for (const road of state.roads) {
    ctx.fillStyle = "#232e39";
    ctx.fillRect(road.x - state.camera.x, road.y - state.camera.y, road.w, road.h);
  }
}

function drawBuildings() {
  for (const b of state.buildings) {
    const x = b.x - state.camera.x;
    const y = b.y - state.camera.y;

    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);

    ctx.strokeStyle = "rgba(0, 229, 255, 0.32)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, b.w - 8, b.h - 8);
  }
}

function drawStores() {
  for (const s of state.stores) {
    const x = s.x - state.camera.x;
    const y = s.y - state.camera.y;

    ctx.fillStyle = s.color;
    ctx.fillRect(x, y, s.w, s.h);

    ctx.fillStyle = "#0a1118";
    ctx.fillRect(x, y + s.h + 4, s.w, 14);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 11px Arial";
    ctx.fillText(s.name.substring(0, 7), x + 5, y + s.h + 15);
  }
}

function drawPickups() {
  for (const p of state.pickups) {
    const x = p.x - state.camera.x;
    const y = p.y - state.camera.y;
    const rad = p.r + Math.sin(p.pulse) * 2;

    ctx.fillStyle = "rgba(255, 209, 102, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, rad + 8, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
  }
}

function drawTrafficCars() {
  for (const car of state.trafficCars) {
    const x = car.x - state.camera.x;
    const y = car.y - state.camera.y;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);

    ctx.fillStyle = car.color;
    ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);

    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(-car.w / 2 + 5, -car.h / 2 + 4, car.w - 10, 6);

    if (car.fire > 0) {
      ctx.fillStyle = "#ff7a18";
      ctx.fillRect(-car.w / 2 + 3, car.h / 2 - 4, 8, 5);
      ctx.fillRect(car.w / 2 - 11, car.h / 2 - 4, 8, 5);
    }

    ctx.restore();
  }

  for (const p of state.policeCars) {
    const x = p.x - state.camera.x;
    const y = p.y - state.camera.y;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);

    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 4, p.w - 10, 6);

    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-p.w / 2 + 5, p.h / 2 - 4, 7, 4);
    ctx.fillRect(p.w / 2 - 12, p.h / 2 - 4, 7, 4);

    ctx.restore();
  }
}

function drawNPCs() {
  for (const npc of state.npcs) {
    const x = npc.x - state.camera.x;
    const y = npc.y - state.camera.y;

    ctx.fillStyle = npc.angry ? "#ff6b6b" : npc.color;
    ctx.beginPath();
    ctx.arc(x, y, npc.radius, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(npc.angle) * 12, y + Math.sin(npc.angle) * 12);
    ctx.stroke();
  }
}

function drawPlayer() {
  const x = player.x - state.camera.x;
  const y = player.y - state.camera.y;

  if (player.inCar && player.car) {
    const c = player.car;
    const px = c.x - state.camera.x;
    const py = c.y - state.camera.y;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(c.angle);

    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);

    ctx.fillStyle = "#111827";
    ctx.fillRect(-c.w / 2 + 5, -c.h / 2 + 4, c.w - 10, 6);

    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.angle);

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#ffb347";
    ctx.fillRect(-4, -3, 8, 6);

    ctx.strokeStyle = "#00e5ff";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();

    ctx.restore();
  }
}

function drawObjective() {
  const o = state.objective;
  const x = o.x - state.camera.x;
  const y = o.y - state.camera.y;

  ctx.fillStyle = "rgba(255, 209, 102, 0.16)";
  ctx.beginPath();
  ctx.arc(x, y, o.radius + 12, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, o.radius, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = "#ffd166";
  ctx.fillRect(x - 4, y - 18, 8, 36);
}

function drawBullets() {
  for (const b of state.bullets) {
    const x = b.x - state.camera.x;
    const y = b.y - state.camera.y;

    ctx.fillStyle = b.source === "player" ? "#facc15" : "#ef4444";
    ctx.beginPath();
    ctx.arc(x, y, b.radius, 0, TAU);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const x = p.x - state.camera.x;
    const y = p.y - state.camera.y;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillRect(x, y, p.size, p.size);
    ctx.globalAlpha = 1;
  }
}

function render() {
  drawGrid();
  drawRoads();
  drawBuildings();
  drawStores();
  drawPickups();
  drawTrafficCars();
  drawNPCs();
  drawObjective();
  drawBullets();
  drawPlayer();
  drawParticles();
}

function initWorld() {
  createRoads();
  createBuildings();
  createStores();
  createTrafficCars();
  createNPCs();
  createPickups();

  const qualityScale = {
    low: { traffic: 12, npcs: 18 },
    medium: { traffic: 22, npcs: 28 },
    high: { traffic: 36, npcs: 42 }
  };

  const q = qualityScale[SETTINGS.quality] || qualityScale.low;
  state.trafficCars = state.trafficCars.slice(0, q.traffic);
  state.npcs = state.npcs.slice(0, q.npcs);
}

let lastTime = 0;

function loop(ts) {
  const dt = Math.min(0.032, (ts - lastTime) / 1000 || 0.016);
  lastTime = ts;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

initWorld();
requestAnimationFrame(loop);
