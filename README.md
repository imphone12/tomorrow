import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('gameCanvas');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

const hud = {
  healthText: document.getElementById('healthText'),
  carText: document.getElementById('carText'),
  cashText: document.getElementById('cashText'),
  wantedText: document.getElementById('wantedText'),
  weaponText: document.getElementById('weaponText'),
  zoneText: document.getElementById('zoneText'),
  missionText: document.getElementById('missionText'),
  interactionText: document.getElementById('interactionText'),
  missionBox: document.getElementById('missionBox'),
  healthBar: document.getElementById('healthBar'),
  carBar: document.getElementById('carBar'),
  wantedStars: document.getElementById('wantedStars'),
  toast: document.getElementById('toast'),
  cheatConsole: document.getElementById('cheatConsole'),
  cheatInput: document.getElementById('cheatInput')
};

const config = JSON.parse(localStorage.getItem('viceCityConfig') || '{"quality":"low","trafficDensity":"low","npcDensity":"low"}');
const settings = {
  quality: config.quality || 'low',
  trafficDensity: config.trafficDensity || 'low',
  npcDensity: config.npcDensity || 'low'
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = settings.quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1922);
scene.fog = new THREE.Fog(0x0c1922, 90, 400);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const WORLD_LIMIT = 150;
const keys = {};
let cheatMode = false;

const weapons = {
  pistol: { label: 'Pistol', damage: 18, speed: 42, cooldown: 0.32, spread: 0.04, color: 0xfacc15 },
  shotgun: { label: 'Shotgun', damage: 36, speed: 32, cooldown: 0.72, spread: 0.18, pellets: 5, color: 0xf97316 },
  uzi: { label: 'Uzi', damage: 12, speed: 48, cooldown: 0.1, spread: 0.08, color: 0x60a5fa },
  rifle: { label: 'Rifle', damage: 28, speed: 54, cooldown: 0.25, spread: 0.03, color: 0x22c55e }
};

const player = {
  x: 0,
  z: 0,
  y: 1.2,
  heading: 0,
  health: 100,
  cash: 0,
  wanted: 0,
  weapon: 'pistol',
  weaponOrder: ['pistol', 'shotgun', 'uzi', 'rifle'],
  fireCooldown: 0,
  inCar: false,
  car: null,
  invuln: 0,
  radius: 2.5,
  mesh: null
};

const world = {
  buildings: [],
  trafficCars: [],
  policeCars: [],
  npcs: [],
  pickups: [],
  bullets: [],
  particles: [],
  stores: [],
  objective: { x: 28, z: -18, radius: 8 },
  objectiveMesh: null,
  missionStage: 0,
  freeCar: null,
  freeCarEnabled: false,
  policeCarEnabled: false,
  riotMode: false,
  chaosTraffic: false,
  godMode: false,
  sideMissionTargets: [
    { x: 28, z: -18 },
    { x: 82, z: -92 },
    { x: -60, z: 68 },
    { x: 0, z: 110 }
  ]
};

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function dist2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function showToast(msg) {
  hud.toast.textContent = msg;
  hud.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => hud.toast.classList.add('hidden'), 1200);
}

function setCheatMode(active) {
  cheatMode = active;
  hud.cheatConsole.classList.toggle('hidden', !active);
  if (active) {
    hud.cheatInput.value = '';
    hud.cheatInput.focus();
  }
}

function addLight() {
  const hemi = new THREE.HemisphereLight(0xaed6ff, 0x06151d, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d9, 1.2);
  sun.position.set(80, 130, 40);
  sun.castShadow = settings.quality !== 'low';
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  scene.add(sun);
}

function createGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ color: 0x1a2a31, roughness: 0.96, metalness: 0.08 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roads = new THREE.Group();
  for (let x = -180; x <= 180; x += 32) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.1, 420),
      new THREE.MeshStandardMaterial({ color: 0x2b3138 })
    );
    road.position.set(x, 0.1, 0);
    road.receiveShadow = true;
    roads.add(road);
  }
  for (let z = -180; z <= 180; z += 32) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(420, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x2b3138 })
    );
    road.position.set(0, 0.1, z);
    road.receiveShadow = true;
    roads.add(road);
  }
  scene.add(roads);
}

function createBuilding(x, z, w, d, h, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.18 })
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, 0.1, d * 0.92),
    new THREE.MeshStandardMaterial({ color: 0x00d9ff, emissive: 0x00d9ff, emissiveIntensity: 0.9 })
  );
  neon.position.set(x, h + 0.15, z);
  scene.add(neon);

  return { x, z, w, d, h, mesh, neon };
}

function buildCity() {
  for (let gx = -8; gx <= 8; gx++) {
    for (let gz = -7; gz <= 7; gz++) {
      if (Math.random() < 0.72) {
        const x = gx * 32 + rand(-7, 7);
        const z = gz * 32 + rand(-7, 7);
        const w = rand(10, 18);
        const d = rand(10, 18);
        const h = rand(12, 28);
        const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.08, 0.28, 0.3 + Math.random() * 0.2);
        world.buildings.push(createBuilding(x, z, w, d, h, color));
      }
    }
  }
}

function buildStores() {
  const defs = [
    { x: 28, z: 18, type: 'repair', name: 'Repair Shop', color: 0x2dd4bf },
    { x: -34, z: 22, type: 'ammo', name: 'Ammu', color: 0xf59e0b },
    { x: 50, z: -40, type: 'food', name: 'Burger Shot', color: 0xf87171 },
    { x: -46, z: -18, type: 'health', name: 'Clinic', color: 0x4ade80 },
    { x: 22, z: -52, type: 'garage', name: 'Garage', color: 0x60a5fa },
    { x: -60, z: 50, type: 'casino', name: 'Casino', color: 0xa78bfa }
  ];

  world.stores = defs.map(({ x, z, type, name, color }) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(8, 6, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12 })
    );
    mesh.position.set(x, 3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { x, z, type, name, color, mesh };
  });
}

function createCarMesh(color, isPolice = false) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.2, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.35 })
  );
  body.position.y = 1.1;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.0, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x0e1620, roughness: 0.4, metalness: 0.5 })
  );
  cabin.position.set(0.2, 1.9, 0);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, y, z] of [[1.2, 0.45, 1.2], [-1.2, 0.45, 1.2], [1.2, 0.45, -1.2], [-1.2, 0.45, -1.2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  }

  if (isPolice) {
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff3d3d, emissive: 0xff3d3d, emissiveIntensity: 1.3 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x3db5ff, emissive: 0x3db5ff, emissiveIntensity: 1.3 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.3), redMat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.3), blueMat);
    r.position.set(1.5, 2.2, 0.7);
    b.position.set(1.5, 2.2, -0.7);
    group.add(r, b);
  }

  return group;
}

function createPedMesh(color) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.7, 1.5, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  body.position.y = 1.7;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0d4b3 })
  );
  head.position.y = 3.1;
  head.castShadow = true;
  group.add(head);

  return group;
}

function createPickupMesh() {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.2, 0),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.9 })
  );
  glow.position.y = 1.2;
  group.add(glow);
  return group;
}

function createMissionMarker() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.7 })
  );
  base.position.y = 0.25;
  group.add(base);

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 4.8, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 1.1 })
  );
  top.position.y = 2.9;
  group.add(top);
  return group;
}

function createPlayerMesh() {
  player.mesh = createCarMesh(0xf7f7f5);
  player.mesh.scale.setScalar(0.75);
  scene.add(player.mesh);
}

function buildWorld() {
  buildCity();
  buildStores();
  createPlayerMesh();

  world.objectiveMesh = createMissionMarker();
  scene.add(world.objectiveMesh);

  const trafficColors = [0xff8a3d, 0xfbbf24, 0x5eead4, 0xf472b6, 0x60a5fa, 0xf87171];
  const trafficCount = settings.quality === 'low' ? 12 : settings.quality === 'medium' ? 20 : 32;
  for (let i = 0; i < trafficCount; i++) {
    const mesh = createCarMesh(trafficColors[i % trafficColors.length]);
    mesh.position.set(rand(-120, 120), 0, rand(-120, 120));
    scene.add(mesh);
    world.trafficCars.push({
      x: mesh.position.x,
      z: mesh.position.z,
      heading: rand(0, Math.PI * 2),
      speed: rand(16, 30),
      radius: 3,
      mesh,
      damage: 0,
      fire: 0,
      exploding: false,
      exploded: false
    });
  }

  const npcCount = settings.npcDensity === 'low' ? 16 : settings.npcDensity === 'medium' ? 26 : 40;
  const npcColors = [0xf6d365, 0xf9a8d4, 0x7dd3fc, 0x86efac, 0xfca5a5];
  for (let i = 0; i < npcCount; i++) {
    const mesh = createPedMesh(npcColors[i % npcColors.length]);
    mesh.position.set(rand(-110, 110), 0, rand(-110, 110));
    scene.add(mesh);
    world.npcs.push({
      x: mesh.position.x,
      z: mesh.position.z,
      heading: rand(0, Math.PI * 2),
      speed: rand(5, 12),
      radius: 1.7,
      mesh,
      angry: Math.random() < 0.3
    });
  }

  for (let i = 0; i < 22; i++) {
    const mesh = createPickupMesh();
    mesh.position.set(rand(-100, 100), 0, rand(-100, 100));
    scene.add(mesh);
    world.pickups.push({ x: mesh.position.x, z: mesh.position.z, mesh, value: 240 + i * 18, pulse: rand(0, 10) });
  }
}

function playerBoxCollision(x, z, radius) {
  for (const b of world.buildings) {
    const dx = x - b.x;
    const dz = z - b.z;
    const closestX = clamp(dx, -b.w / 2 - radius, b.w / 2 + radius);
    const closestZ = clamp(dz, -b.d / 2 - radius, b.d / 2 + radius);
    if (Math.abs(dx - closestX) < radius && Math.abs(dz - closestZ) < radius) {
      return true;
    }
  }
  return false;
}

function carBoxCollision(x, z, radius) {
  for (const b of world.buildings) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < b.w / 2 + radius && Math.abs(dz) < b.d / 2 + radius) return true;
  }
  return false;
}

function updateHUD() {
  const readyCarHealth = player.inCar && player.car ? Math.max(0, 100 - player.car.damage) : 100;
  hud.healthText.textContent = Math.ceil(player.health);
  hud.carText.textContent = Math.ceil(readyCarHealth);
  hud.cashText.textContent = `$${Math.floor(player.cash)}`;
  hud.wantedText.textContent = String(Math.min(5, Math.floor(player.wanted)));
  hud.weaponText.textContent = weapons[player.weapon].label;

  hud.healthBar.style.width = `${clamp(player.health / 100, 0, 1) * 100}%`;
  hud.carBar.style.width = `${clamp(readyCarHealth / 100, 0, 1) * 100}%`;

  hud.missionText.textContent = String(world.missionStage + 1);

  const zone = Math.abs(player.z) < 70 ? 'Downtown' : player.z < 0 ? 'Vice Beach' : 'Harbor';
  hud.zoneText.textContent = zone;

  const stars = [];
  for (let i = 0; i < 5; i++) {
    const star = document.createElement('span');
    star.className = 'star' + (i < Math.min(5, Math.ceil(player.wanted)) ? ' active' : '');
    star.textContent = '★';
    stars.push(star);
  }
  hud.wantedStars.innerHTML = '';
  stars.forEach(star => hud.wantedStars.appendChild(star));

  let interaction = '-';
  for (const store of world.stores) {
    if (Math.hypot(player.x - store.x, player.z - store.z) < 9) interaction = store.name;
  }
  hud.interactionText.textContent = interaction;

  if (world.missionStage === 0) hud.missionBox.textContent = 'Pick up the briefcase by the neon marker.';
  else if (world.missionStage === 1) hud.missionBox.textContent = 'Deliver the package to the docks.';
  else hud.missionBox.textContent = 'Open-world chaos is yours.';
}

function cycleWeapon() {
  const idx = player.weaponOrder.indexOf(player.weapon);
  player.weapon = player.weaponOrder[(idx + 1) % player.weaponOrder.length];
  showToast(weapons[player.weapon].label);
}

function shoot() {
  if (player.fireCooldown > 0) return;
  const config = weapons[player.weapon];
  const source = player.inCar && player.car ? player.car : player;
  const originX = source.x || player.x;
  const originZ = source.z || player.z;
  const heading = player.inCar ? source.heading : player.heading;

  const projectiles = config.pellets ? config.pellets : 1;
  for (let i = 0; i < projectiles; i++) {
    const offset = config.pellets ? (Math.random() - 0.5) * config.spread : 0;
    const baseHeading = heading + offset;
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: 0.8 })
    );
    bullet.position.set(originX + Math.cos(baseHeading) * 3, 1.5, originZ + Math.sin(baseHeading) * 3);
    const vel = new THREE.Vector3(Math.cos(baseHeading), 0, Math.sin(baseHeading)).multiplyScalar(config.speed);
    scene.add(bullet);
    world.bullets.push({
      mesh: bullet,
      vel,
      life: config.speed > 45 ? 1.2 : 1.5,
      damage: config.damage,
      source: 'player'
    });
  }
  player.fireCooldown = config.cooldown;
}

function processCheat(code) {
  if (code === 'freecar') {
    if (world.freeCarEnabled) {
      world.freeCarEnabled = false;
      if (world.freeCar) { scene.remove(world.freeCar.mesh); }
      world.freeCar = null;
      showToast('Free car OFF');
      return;
    }
    const mesh = createCarMesh(0xfbbf24);
    mesh.position.set(player.x + 8, 0, player.z + 8);
    scene.add(mesh);
    world.freeCar = {
      x: mesh.position.x,
      z: mesh.position.z,
      heading: player.heading,
      speed: 0,
      radius: 3,
      mesh,
      damage: 0,
      fire: 0,
      exploding: false,
      exploded: false
    };
    world.freeCarEnabled = true;
    showToast('Free car ON');
    return;
  }

  if (code === 'policecar') {
    if (world.policeCarEnabled) {
      world.policeCars = world.policeCars.filter(c => !c.isCheat);
      world.policeCarEnabled = false;
      showToast('Police car OFF');
      return;
    }
    const mesh = createCarMesh(0x2563eb, true);
    mesh.position.set(player.x + 12, 0, player.z + 12);
    scene.add(mesh);
    const car = {
      x: mesh.position.x,
      z: mesh.position.z,
      heading: player.heading,
      speed: 18,
      radius: 3,
      mesh,
      damage: 0,
      fire: 0,
      exploding: false,
      exploded: false,
      isPolice: true,
      isCheat: true
    };
    world.policeCars.push(car);
    world.policeCarEnabled = true;
    showToast('Police car ON');
    return;
  }

  if (code === 'trafficchaos') {
    world.chaosTraffic = !world.chaosTraffic;
    showToast(world.chaosTraffic ? 'Traffic chaos ON' : 'Traffic chaos OFF');
    return;
  }

  if (code === 'riot') {
    world.riotMode = !world.riotMode;
    showToast(world.riotMode ? 'Riot mode ON' : 'Riot mode OFF');
    return;
  }

  if (code === 'wanted2') {
    player.wanted = clamp(player.wanted + 2, 0, 5);
    showToast('Wanted +2');
    return;
  }

  if (code === 'losewanted') {
    player.wanted = 0;
    world.policeCars = world.policeCars.filter(c => !c.isPolice);
    showToast('Wanted cleared');
    return;
  }

  if (code === 'heal') {
    player.health = 100;
    if (player.car) {
      player.car.damage = 0;
      player.car.fire = 0;
      player.car.exploding = false;
      player.car.exploded = false;
    }
    showToast('Healed');
    return;
  }

  if (code === 'godmode') {
    world.godMode = !world.godMode;
    showToast(world.godMode ? 'God mode ON' : 'God mode OFF');
    return;
  }

  showToast('Unknown cheat');
}

function toggleCar() {
  if (player.inCar && player.car) {
    const car = player.car;
    player.inCar = false;
    player.car = null;
    player.x = car.x + 3;
    player.z = car.z + 2.5;
    player.heading = car.heading;
    return;
  }

  if (world.freeCar && Math.hypot(player.x - world.freeCar.x, player.z - world.freeCar.z) < 8) {
    player.inCar = true;
    player.car = world.freeCar;
    player.x = world.freeCar.x;
    player.z = world.freeCar.z;
    return;
  }

  let nearest = null; let nearestDist = Infinity;
  for (const car of world.trafficCars) {
    if (car.exploded) continue;
    const d = Math.hypot(player.x - car.x, player.z - car.z);
    if (d < nearestDist) { nearestDist = d; nearest = car; }
  }

  if (nearest && nearestDist < 8) {
    player.inCar = true;
    player.car = nearest;
    nearest.speed = 0;
    player.x = nearest.x;
    player.z = nearest.z;
    player.heading = nearest.heading;
  }
}

function interact() {
  for (const store of world.stores) {
    if (Math.hypot(player.x - store.x, player.z - store.z) < 9) {
      if (store.type === 'repair') {
        if (player.cash >= 250) {
          player.cash -= 250;
          if (player.car) player.car.damage = 0;
          player.health = Math.min(100, player.health + 25);
          showToast('Repair complete');
        } else showToast('Need $250');
        return;
      }
      if (store.type === 'ammo') {
        if (player.cash >= 150) {
          player.cash -= 150;
          player.weapon = 'rifle';
          showToast('Rifle unlocked');
        } else showToast('Need $150');
        return;
      }
      if (store.type === 'food') {
        if (player.cash >= 90) {
          player.cash -= 90;
          player.health = Math.min(100, player.health + 35);
          showToast('Food restored');
        } else showToast('Need $90');
        return;
      }
      if (store.type === 'health') {
        if (player.cash >= 80) {
          player.cash -= 80;
          player.health = 100;
          showToast('Full health');
        } else showToast('Need $80');
        return;
      }
      if (store.type === 'garage') {
        if (player.cash >= 200) {
          player.cash -= 200;
          if (player.car) player.car.damage = 0;
          showToast('Garage service done');
        } else showToast('Need $200');
        return;
      }
      if (store.type === 'casino') {
        player.cash += 600;
        showToast('Casino win: +$600');
        return;
      }
    }
  }

  for (const npc of world.npcs) {
    if (Math.hypot(player.x - npc.x, player.z - npc.z) < 6) {
      npc.angry = !npc.angry;
      showToast(npc.angry ? 'NPC: “You started something!”' : 'NPC: “Stay cool.”');
      return;
    }
  }
}

function updatePlayer(dt) {
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);

  if (player.inCar && player.car) {
    const car = player.car;
    let accel = 0;
    if (keys['w'] || keys['arrowup']) accel = 1;
    if (keys['s'] || keys['arrowdown']) accel = -1;
    if (keys['a'] || keys['arrowleft']) car.heading += 2.2 * dt;
    if (keys['d'] || keys['arrowright']) car.heading -= 2.2 * dt;

    if (accel !== 0) car.speed += accel * 16 * dt;
    else car.speed *= 0.96;
    car.speed = clamp(car.speed, -18, 52);

    const nx = car.x + Math.cos(car.heading) * car.speed * dt;
    const nz = car.z + Math.sin(car.heading) * car.speed * dt;
    if (!carBoxCollision(nx, nz, car.radius + 0.8)) {
      car.x = nx; car.z = nz;
    } else {
      car.speed *= -0.25;
      car.damage = clamp(car.damage + 10, 0, 100);
    }

    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    return;
  }

  let dx = 0;
  let dz = 0;
  if (keys['w'] || keys['arrowup']) dz -= 1;
  if (keys['s'] || keys['arrowdown']) dz += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  if (dx || dz) {
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    player.heading = Math.atan2(dz, dx);
    const speed = keys['shift'] ? 18 : 11;
    const nextX = player.x + dx * speed * dt;
    const nextZ = player.z + dz * speed * dt;
    if (!playerBoxCollision(nextX, player.z, player.radius)) player.x = nextX;
    if (!playerBoxCollision(player.x, nextZ, player.radius)) player.z = nextZ;
  }

  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
}

function updateTraffic(dt) {
  for (const car of world.trafficCars) {
    if (car.exploded) continue;
    if (world.chaosTraffic) {
      car.heading += rand(-1.5, 1.5) * dt;
      car.speed += rand(-10, 10) * dt;
      car.speed = clamp(car.speed, 8, 36);
    }

    const nx = car.x + Math.cos(car.heading) * car.speed * dt;
    const nz = car.z + Math.sin(car.heading) * car.speed * dt;
    if (!carBoxCollision(nx, nz, car.radius)) {
      car.x = nx; car.z = nz;
    } else {
      car.heading += Math.PI * 0.7;
      car.speed *= -0.3;
    }

    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

function updatePolice(dt) {
  if (player.wanted <= 0 && !world.policeCarEnabled) return;

  if (player.wanted > 0 && Math.random() < 0.045) {
    const count = world.policeCars.filter(c => !c.isCheat).length;
    if (count < Math.ceil(player.wanted) + 1) {
      const mesh = createCarMesh(0x2563eb, true);
      mesh.position.set(player.x + rand(-35, 35), 0, player.z + rand(-35, 35));
      scene.add(mesh);
      world.policeCars.push({
        x: mesh.position.x,
        z: mesh.position.z,
        heading: 0,
        speed: 18 + player.wanted * 5,
        radius: 3,
        mesh,
        damage: 0,
        fire: 0,
        exploding: false,
        exploded: false,
        isPolice: true,
        isCheat: false
      });
    }
  }

  for (const p of world.policeCars) {
    if (p.exploded) continue;
    const angle = Math.atan2(player.z - p.z, player.x - p.x);
    p.heading = angle;
    const nx = p.x + Math.cos(angle) * p.speed * dt;
    const nz = p.z + Math.sin(angle) * p.speed * dt;
    if (!carBoxCollision(nx, nz, p.radius)) {
      p.x = nx; p.z = nz;
    }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;

    if (Math.hypot(player.x - p.x, player.z - p.z) < 7 && !world.godMode && player.invuln <= 0) {
      player.health -= 18 * dt;
      player.invuln = 0.18;
    }

    if (Math.random() < 0.012) {
      const bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff4d4d, emissiveIntensity: 0.8 })
      );
      const dir = new THREE.Vector3(player.x - p.x, 0, player.z - p.z).normalize();
      bullet.position.set(p.x + dir.x * 4, 1.5, p.z + dir.z * 4);
      scene.add(bullet);
      world.bullets.push({ mesh: bullet, vel: dir.multiplyScalar(30), life: 1.6, damage: 12, source: 'police' });
    }
  }
}

function updateNPCs(dt) {
  for (const npc of world.npcs) {
    if (world.riotMode) {
      const angle = Math.atan2(player.z - npc.z, player.x - npc.x);
      npc.heading = angle;
      npc.x += Math.cos(angle) * npc.speed * 1.5 * dt;
      npc.z += Math.sin(angle) * npc.speed * 1.5 * dt;
    } else {
      npc.x += Math.cos(npc.heading) * npc.speed * 0.7 * dt;
      npc.z += Math.sin(npc.heading) * npc.speed * 0.7 * dt;
      if (Math.random() < 0.018) npc.heading += rand(-1.2, 1.2);
      if (Math.hypot(npc.x, npc.z) > 108) npc.heading += Math.PI * 0.7;
    }

    if (!world.riotMode && player.wanted > 0 && Math.hypot(player.x - npc.x, player.z - npc.z) < 18) {
      const angle = Math.atan2(player.z - npc.z, player.x - npc.x);
      npc.heading = angle;
      npc.x += Math.cos(angle) * npc.speed * dt;
      npc.z += Math.sin(angle) * npc.speed * dt;
    }

    if (world.riotMode && Math.hypot(player.x - npc.x, player.z - npc.z) < 8 && player.invuln <= 0) {
      player.health -= 8 * dt;
      player.invuln = 0.12;
    }

    npc.mesh.position.set(npc.x, 0, npc.z);
    npc.mesh.rotation.y = npc.heading;
  }
}

function updatePickups(dt) {
  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i];
    p.pulse += dt * 4;
    p.mesh.rotation.y += 1.2 * dt;
    p.mesh.position.y = 1.1 + Math.sin(p.pulse) * 0.3;
    if (Math.hypot(player.x - p.x, player.z - p.z) < 6) {
      player.cash += p.value;
      scene.remove(p.mesh);
      world.pickups.splice(i, 1);
    }
  }
}

function updateBullets(dt) {
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const bullet = world.bullets[i];
    bullet.mesh.position.addScaledVector(bullet.vel, dt);
    bullet.life -= dt;

    if (bullet.life <= 0 || Math.abs(bullet.mesh.position.x) > WORLD_LIMIT || Math.abs(bullet.mesh.position.z) > WORLD_LIMIT) {
      scene.remove(bullet.mesh);
      world.bullets.splice(i, 1);
      continue;
    }

    for (const car of world.trafficCars) {
      if (car.exploded) continue;
      if (Math.hypot(bullet.mesh.position.x - car.x, bullet.mesh.position.z - car.z) < 2.8) {
        car.damage = clamp(car.damage + bullet.damage, 0, 100);
        if (car.damage > 60) car.fire = clamp(car.fire + 0.8, 0, 3);
        scene.remove(bullet.mesh);
        world.bullets.splice(i, 1);
        break;
      }
    }

    for (const p of world.policeCars) {
      if (p.exploded) continue;
      if (Math.hypot(bullet.mesh.position.x - p.x, bullet.mesh.position.z - p.z) < 2.8) {
        p.damage = clamp(p.damage + bullet.damage, 0, 100);
        if (p.damage > 60) p.fire = clamp(p.fire + 0.8, 0, 3);
        scene.remove(bullet.mesh);
        world.bullets.splice(i, 1);
        break;
      }
    }

    if (bullet.source !== 'player' && Math.hypot(bullet.mesh.position.x - player.x, bullet.mesh.position.z - player.z) < 2.6) {
      scene.remove(bullet.mesh);
      world.bullets.splice(i, 1);
      if (!world.godMode && player.invuln <= 0) {
        player.health -= 12;
        player.invuln = 0.2;
      }
    }
  }
}

function updateVehicleDamage(dt) {
  for (const car of world.trafficCars) {
    if (car.exploded) continue;
    if (car.damage > 60 && car.fire < 1) car.fire = 1;
    if (car.fire > 0) {
      car.fire += dt * 0.5;
      if (car.fire > 1.8) car.exploding = true;
    }
    if (car.exploding) {
      car.fire += dt * 0.8;
      if (car.fire > 2.8) {
        car.exploded = true;
        player.cash += 300;
        scene.remove(car.mesh);
      }
    }
  }

  for (const p of world.policeCars) {
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
        scene.remove(p.mesh);
      }
    }
  }

  if (player.inCar && player.car) {
    const car = player.car;
    if (car.damage > 60 && car.fire < 1) car.fire = 1;
    if (car.fire > 0) {
      car.fire += dt * 0.5;
      if (car.fire > 1.8) car.exploding = true;
    }
    if (car.exploding) {
      car.fire += dt * 0.8;
      if (car.fire > 2.8) {
        car.exploded = true;
        player.inCar = false;
        player.car = null;
        player.health = Math.max(0, player.health - 25);
        showToast('Your car exploded!');
      }
    }
  }
}

function updateObjective() {
  const stages = [
    { x: 28, z: -18 },
    { x: 82, z: -92 },
    { x: -60, z: 68 },
    { x: 0, z: 110 }
  ];

  const target = stages[Math.min(world.missionStage, stages.length - 1)];
  if (world.missionStage === 0 || world.missionStage === 1 || world.missionStage === 2) {
    world.objectiveMesh.visible = true;
    world.objectiveMesh.position.set(target.x, 0, target.z);
    world.objectiveMesh.rotation.y += 0.02;
    world.objectiveMesh.position.y = 0.5 + Math.sin(performance.now() * 0.004) * 0.7;

    if (Math.hypot(player.x - target.x, player.z - target.z) < 8) {
      if (world.missionStage === 0) {
        player.cash += 1500;
        player.wanted = clamp(player.wanted + 1.5, 0, 5);
        showToast('Briefcase secured');
        world.missionStage = 1;
      } else if (world.missionStage === 1) {
        player.cash += 4200;
        showToast('Mission complete');
        world.missionStage = 2;
      } else if (world.missionStage === 2) {
        player.cash += 3000;
        showToast('Final payout acquired');
        world.missionStage = 3;
      }
    }
  } else {
    world.objectiveMesh.visible = false;
  }
}

function updateWanted(dt) {
  if (player.wanted > 0) player.wanted = Math.max(0, player.wanted - dt * 0.06);
}

function updatePlayerState() {
  if (world.godMode) player.health = 100;
  if (player.health <= 0) {
    player.health = 100;
    player.cash = Math.max(0, player.cash - 600);
    player.x = 0; player.z = 0;
    player.inCar = false; player.car = null; player.wanted = 0;
    world.policeCars = [];
    showToast('Busted');
  }
}

function updateMinimap() {
  const w = minimapCanvas.width; const h = minimapCanvas.height;
  minimapCtx.clearRect(0, 0, w, h);

  minimapCtx.fillStyle = 'rgba(8, 14, 19, 0.95)';
  minimapCtx.fillRect(0, 0, w, h);

  const scale = 1.2;
  const centerX = w / 2;
  const centerY = h / 2;

  minimapCtx.strokeStyle = 'rgba(255,255,255,0.18)';
  minimapCtx.strokeRect(8, 8, w - 16, h - 16);

  for (const store of world.stores) {
    const px = centerX + (store.x - player.x) * scale;
    const py = centerY + (store.z - player.z) * scale;
    minimapCtx.fillStyle = '#60a5fa';
    minimapCtx.fillRect(px - 2, py - 2, 4, 4);
  }

  for (const target of world.sideMissionTargets) {
    const px = centerX + (target.x - player.x) * scale;
    const py = centerY + (target.z - player.z) * scale;
    minimapCtx.fillStyle = '#ffd166';
    minimapCtx.beginPath(); minimapCtx.arc(px, py, 3, 0, Math.PI * 2); minimapCtx.fill();
  }

  const objective = world.sideMissionTargets[Math.min(world.missionStage, world.sideMissionTargets.length - 1)];
  const ox = centerX + (objective.x - player.x) * scale;
  const oy = centerY + (objective.z - player.z) * scale;
  minimapCtx.fillStyle = '#ff4d4d';
  minimapCtx.beginPath(); minimapCtx.arc(ox, oy, 4, 0, Math.PI * 2); minimapCtx.fill();

  minimapCtx.fillStyle = '#7df7a8';
  minimapCtx.beginPath(); minimapCtx.arc(centerX, centerY, 5, 0, Math.PI * 2); minimapCtx.fill();

  minimapCtx.strokeStyle = '#edf6ff';
  minimapCtx.beginPath();
  minimapCtx.moveTo(centerX, centerY);
  minimapCtx.lineTo(centerX + Math.cos(player.heading) * 12, centerY + Math.sin(player.heading) * 12);
  minimapCtx.stroke();
}

function updateCamera() {
  const target = player.inCar && player.car ? new THREE.Vector3(player.car.x, 2.8, player.car.z) : new THREE.Vector3(player.x, 2.1, player.z);
  const chase = new THREE.Vector3(target.x - Math.cos(player.heading) * 10, 7.5, target.z - Math.sin(player.heading) * 10);
  camera.position.lerp(chase, 0.08);
  camera.lookAt(target.x, 2.0, target.z);
}

function updateWorld(dt) {
  updatePlayer(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updateNPCs(dt);
  updatePickups(dt);
  updateBullets(dt);
  updateVehicleDamage(dt);
  updateObjective();
  updateWanted(dt);
  updatePlayerState();
  updateCamera();
  updateMinimap();
  updateHUD();
}

function init() {
  addLight();
  createGround();
  buildWorld();
  world.objectiveMesh.visible = true;
  world.objectiveMesh.position.set(28, 0, -18);
  player.x = 0; player.z = 0;
  player.mesh.position.set(0, 0, 0);
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (event.key === 'Enter') {
    if (!cheatMode) {
      event.preventDefault();
      setCheatMode(true);
      return;
    }
    const code = hud.cheatInput.value.trim().toLowerCase();
    if (code) processCheat(code);
    setCheatMode(false);
    return;
  }

  if (cheatMode) {
    if (event.key === 'Escape') setCheatMode(false);
    return;
  }

  if (key === 'q') cycleWeapon();
  if (!event.repeat) {
    if (key === 'e') toggleCar();
    if (key === 'f') interact();
    if (key === ' ') shoot();
  }

  keys[key] = true;
});

window.addEventListener('keyup', (event) => {
  keys[event.key.toLowerCase()] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
});

let lastTime = performance.now();
function renderLoop(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  updateWorld(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

init();
requestAnimationFrame(renderLoop);
