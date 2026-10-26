import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('gameCanvas');
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
scene.fog = new THREE.Fog(0x0c1922, 80, 360);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const world = {
  size: 560,
  roads: [],
  buildings: [],
  stores: [],
  trafficCars: [],
  policeCars: [],
  npcs: [],
  pickups: [],
  particles: [],
  bullets: [],
  objective: { x: 30, z: 40, radius: 8 },
  missionStage: 0,
  freeCar: null,
  freeCarEnabled: false,
  policeCarEnabled: false,
  riotMode: false,
  chaosTraffic: false,
  godMode: false,
  objects: [],
  ground: null
};

const keys = {};
let cheatMode = false;

const player = {
  x: 0,
  z: 0,
  y: 1.2,
  heading: 0,
  speed: 0,
  health: 100,
  cash: 0,
  wanted: 0,
  weapon: 'Pistol',
  inCar: false,
  car: null,
  invuln: 0,
  radius: 2.5,
  mesh: null
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

function createGround() {
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(world.size * 2, world.size * 2),
    new THREE.MeshStandardMaterial({ color: 0x1c2b33, roughness: 0.95, metalness: 0.08 })
  );
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
  world.ground = g;

  const roads = new THREE.Group();
  for (let x = -world.size; x <= world.size; x += 32) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.2, world.size * 2),
      new THREE.MeshStandardMaterial({ color: 0x2a3138 })
    );
    road.position.set(x, 0.12, 0);
    road.receiveShadow = true;
    roads.add(road);
  }
  for (let z = -world.size; z <= world.size; z += 32) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(world.size * 2, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a3138 })
    );
    road.position.set(0, 0.12, z);
    road.receiveShadow = true;
    roads.add(road);
  }
  scene.add(roads);
}

function addLight() {
  const hemi = new THREE.HemisphereLight(0xaed6ff, 0x05202d, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d9, 1.2);
  sun.position.set(80, 120, 40);
  sun.castShadow = settings.quality !== 'low';
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  scene.add(sun);
}

function createBuilding(x, z, w, d, h, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.15 })
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, 0.08, d * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.8 })
  );
  neon.position.set(x, h + 0.3, z);
  scene.add(neon);

  return { x, z, w, d, h, mesh, neon };
}

function buildCity() {
  world.buildings = [];
  for (let gx = -8; gx <= 8; gx++) {
    for (let gz = -7; gz <= 7; gz++) {
      if (Math.random() < 0.7) {
        const x = gx * 42 + rand(-8, 8);
        const z = gz * 42 + rand(-8, 8);
        const w = rand(10, 18);
        const d = rand(10, 18);
        const h = rand(12, 30);
        const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.08, 0.2, 0.3 + Math.random() * 0.2);
        const b = createBuilding(x, z, w, d, h, color);
        world.buildings.push(b);
      }
    }
  }
}

function buildStores() {
  const defs = [
    { x: 26, z: 18, type: 'repair', name: 'Repair Shop', color: 0x2dd4bf },
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

function createCarMesh(color, police=false) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.2, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 1.1;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x0e1620, roughness: 0.4, metalness: 0.5 })
  );
  cabin.position.set(0.2, 1.9, 0);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wheelOffsets = [[1.1, 0.45, 1.15], [-1.1, 0.45, 1.15], [1.1, 0.45, -1.15], [-1.1, 0.45, -1.15]];
  for (const [x, y, z] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  }

  if (police) {
    const lightBar = new THREE.Group();
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff3d3d, emissive: 0xff3d3d, emissiveIntensity: 1.4 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x3db5ff, emissive: 0x3db5ff, emissiveIntensity: 1.4 });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.3), redMat);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.3), blueMat);
    r1.position.set(1.4, 2.2, 0.8);
    b1.position.set(1.4, 2.2, -0.8);
    lightBar.add(r1, b1);
    group.add(lightBar);
    group.userData.lightBar = lightBar;
  }

  group.userData.body = body;
  group.userData.color = color;
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
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.8 })
  );
  glow.position.y = 1.2;
  group.add(glow);
  return group;
}

function createMissionMarker() {
  const marker = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.7 })
  );
  base.position.y = 0.25;
  marker.add(base);

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 4.8, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 1.1 })
  );
  top.position.y = 2.9;
  marker.add(top);
  marker.userData.base = base;
  marker.userData.top = top;
  return marker;
}

function createPlayerMesh() {
  const car = createCarMesh(0xf5f7ff);
  car.scale.setScalar(0.72);
  scene.add(car);
  player.mesh = car;
  return car;
}

function createWorldObjects() {
  buildCity();
  buildStores();
  createPlayerMesh();

  world.objectiveMesh = createMissionMarker();
  world.objectiveMesh.position.set(world.objective.x, 0, world.objective.z);
  scene.add(world.objectiveMesh);

  const trafficColors = [0xff8a3d, 0xfbbf24, 0x5eead4, 0xf472b6, 0x60a5fa, 0xf87171];
  const trafficCount = settings.quality === 'low' ? 12 : settings.quality === 'medium' ? 20 : 32;
  for (let i = 0; i < trafficCount; i++) {
    const color = trafficColors[i % trafficColors.length];
    const mesh = createCarMesh(color);
    mesh.position.set(rand(-80, 80), 0, rand(-80, 80));
    scene.add(mesh);
    world.trafficCars.push({
      x: mesh.position.x,
      z: mesh.position.z,
      heading: rand(0, Math.PI * 2),
      speed: rand(16, 30),
      radius: 2.6,
      mesh,
      color,
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
    mesh.position.set(rand(-100, 100), 0, rand(-100, 100));
    scene.add(mesh);
    world.npcs.push({
      x: mesh.position.x,
      z: mesh.position.z,
      heading: rand(0, Math.PI * 2),
      speed: rand(5, 12),
      radius: 1.6,
      mesh,
      angry: Math.random() < 0.3,
      color: npcColors[i % npcColors.length]
    });
  }

  for (let i = 0; i < 20; i++) {
    const mesh = createPickupMesh();
    mesh.position.set(rand(-110, 110), 0, rand(-110, 110));
    scene.add(mesh);
    world.pickups.push({ x: mesh.position.x, z: mesh.position.z, mesh, value: 200 + i * 20, pulse: rand(0, 10) });
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
    const halfW = b.w / 2 + radius;
    const halfD = b.d / 2 + radius;
    if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
      return true;
    }
  }
  return false;
}

function updateHUD() {
  hud.healthText.textContent = Math.ceil(player.health);
  const carHealth = player.inCar && player.car ? Math.max(0, 100 - player.car.damage) : 100;
  hud.carText.textContent = Math.ceil(carHealth);
  hud.cashText.textContent = `$${Math.floor(player.cash)}`;
  hud.wantedText.textContent = String(Math.min(5, Math.floor(player.wanted)));
  hud.weaponText.textContent = player.weapon;

  hud.healthBar.style.width = `${clamp(player.health / 100, 0, 1) * 100}%`;
  hud.carBar.style.width = `${clamp(carHealth / 100, 0, 1) * 100}%`;

  const zone = Math.abs(player.z) < 70 ? 'Downtown' : player.z < 0 ? 'Vice Beach' : 'Harbor';
  hud.zoneText.textContent = zone;

  const stars = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = 'star' + (i < Math.min(5, Math.ceil(player.wanted)) ? ' active' : '');
    s.textContent = '★';
    stars.push(s);
  }
  hud.wantedStars.innerHTML = '';
  stars.forEach(s => hud.wantedStars.appendChild(s));

  let interaction = '-';
  for (const s of world.stores) {
    const d = Math.hypot(player.x - s.x, player.z - s.z);
    if (d < 9) interaction = s.name;
  }
  hud.interactionText.textContent = interaction;

  if (world.missionStage === 0) hud.missionBox.textContent = 'Pick up the briefcase by the neon marker.';
  else if (world.missionStage === 1) hud.missionBox.textContent = 'Deliver the package to the docks.';
  else hud.missionBox.textContent = 'Open-world chaos is yours.';

  hud.missionText.textContent = String(world.missionStage + 1);
}

function processCheat(code) {
  if (code === 'freecar') {
    if (world.freeCarEnabled) {
      world.freeCarEnabled = false;
      world.freeCar = null;
      showToast('Free car OFF');
      return;
    }

    const car = createCarMesh(0xfbbf24);
    car.position.set(player.x + 8, 0, player.z + 8);
    scene.add(car);
    world.freeCar = {
      x: car.position.x,
      z: car.position.z,
      heading: player.heading,
      speed: 0,
      radius: 3,
      mesh: car,
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
      world.policeCars.forEach(c => {
        if (c.isCheat) {
          scene.remove(c.mesh);
        }
      });
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
      heading: 0,
      speed: 0,
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

  if (world.freeCar) {
    const d = Math.hypot(player.x - world.freeCar.x, player.z - world.freeCar.z);
    if (d < 8) {
      player.inCar = true;
      player.car = world.freeCar;
      player.x = world.freeCar.x;
      player.z = world.freeCar.z;
      return;
    }
  }

  let nearest = null;
  let nearestDist = Infinity;
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
  for (const s of world.stores) {
    const d = Math.hypot(player.x - s.x, player.z - s.z);
    if (d < 9) {
      if (s.type === 'repair') {
        if (player.cash >= 250) {
          player.cash -= 250;
          if (player.car) player.car.damage = 0;
          player.health = Math.min(100, player.health + 25);
          showToast('Repair complete');
        } else showToast('Need $250');
        return;
      }
      if (s.type === 'ammo') {
        if (player.cash >= 150) {
          player.cash -= 150;
          player.weapon = 'Uzi';
          showToast('Weapon upgraded');
        } else showToast('Need $150');
        return;
      }
      if (s.type === 'food') {
        if (player.cash >= 90) {
          player.cash -= 90;
          player.health = Math.min(100, player.health + 35);
          showToast('Food restored');
        } else showToast('Need $90');
        return;
      }
      if (s.type === 'health') {
        if (player.cash >= 80) {
          player.cash -= 80;
          player.health = 100;
          showToast('Full health');
        } else showToast('Need $80');
        return;
      }
      if (s.type === 'garage') {
        if (player.cash >= 200) {
          player.cash -= 200;
          if (player.car) player.car.damage = 0;
          showToast('Garage service complete');
        } else showToast('Need $200');
        return;
      }
      if (s.type === 'casino') {
        player.cash += 600;
        showToast('Casino win: +$600');
        return;
      }
    }
  }

  for (const npc of world.npcs) {
    const d = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (d < 6) {
      npc.angry = !npc.angry;
      showToast(npc.angry ? 'NPC: “You started something!”' : 'NPC: “Stay cool.”');
      return;
    }
  }
}

function shoot() {
  if (!player.inCar) {
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.7 })
    );
    bullet.position.set(player.x + Math.cos(player.heading) * 2, 1.5, player.z + Math.sin(player.heading) * 2);
    const velocity = new THREE.Vector3(Math.cos(player.heading), 0, Math.sin(player.heading)).multiplyScalar(38);
    scene.add(bullet);
    world.bullets.push({ mesh: bullet, vel: velocity, life: 1.6, source: 'player' });
    return;
  }

  if (player.car) {
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.7 })
    );
    bullet.position.set(player.car.x + Math.cos(player.car.heading) * 3.5, 1.5, player.car.z + Math.sin(player.car.heading) * 3.5);
    const velocity = new THREE.Vector3(Math.cos(player.car.heading), 0, Math.sin(player.car.heading)).multiplyScalar(38);
    scene.add(bullet);
    world.bullets.push({ mesh: bullet, vel: velocity, life: 1.6, source: 'player' });
  }
}

function updatePlayer(dt) {
  if (player.inCar && player.car) {
    const car = player.car;
    let accel = 0;
    if (keys['w'] || keys['arrowup']) accel = 1;
    if (keys['s'] || keys['arrowdown']) accel = -1;
    if (keys['a'] || keys['arrowleft']) car.heading += 2.2 * dt;
    if (keys['d'] || keys['arrowright']) car.heading -= 2.2 * dt;

    if (accel !== 0) {
      car.speed += accel * 16 * dt;
    } else {
      car.speed *= 0.96;
    }

    car.speed = clamp(car.speed, -18, 52);

    const nextX = car.x + Math.cos(car.heading) * car.speed * dt;
    const nextZ = car.z + Math.sin(car.heading) * car.speed * dt;
    if (!carBoxCollision(nextX, nextZ, car.radius + 0.8)) {
      car.x = nextX;
      car.z = nextZ;
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
    const length = Math.hypot(dx, dz) || 1;
    dx /= length; dz /= length;
    player.heading = Math.atan2(dz, dx);
    const speed = keys['shift'] ? 18 : 11;
    const nx = player.x + dx * speed * dt;
    const nz = player.z + dz * speed * dt;
    if (!playerBoxCollision(nx, player.z, player.radius)) player.x = nx;
    if (!playerBoxCollision(player.x, nz, player.radius)) player.z = nz;
  }

  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
}

function updateTrafficCars(dt) {
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
      car.speed *= -0.4;
    }

    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

function updatePoliceCars(dt) {
  if (player.wanted <= 0 && !world.policeCarEnabled) {
    if (world.policeCars.length) {
      world.policeCars = world.policeCars.filter(c => c.isCheat);
    }
    return;
  }

  if (player.wanted > 0 && Math.random() < 0.045) {
    const already = world.policeCars.filter(c => !c.isCheat).length;
    if (already < Math.ceil(player.wanted) + 1) {
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

    if (Math.hypot(player.x - p.x, player.z - p.z) < 7) {
      if (!world.godMode && player.invuln <= 0) {
        player.health -= 18 * dt;
        player.invuln = 0.18;
      }
    }

    if (Math.random() < 0.012) {
      const bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff4d4d, emissiveIntensity: 0.8 })
      );
      const dir = new THREE.Vector3(player.x - p.x, 0, player.z - p.z).normalize();
      bullet.position.set(p.x + dir.x * 3, 1.5, p.z + dir.z * 3);
      scene.add(bullet);
      world.bullets.push({ mesh: bullet, vel: dir.multiplyScalar(30), life: 1.6, source: 'police' });
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
      if (Math.hypot(npc.x, npc.z) > 110) npc.heading += Math.PI * 0.7;
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
    const b = world.bullets[i];
    b.mesh.position.addScaledVector(b.vel, dt);
    b.life -= dt;

    if (b.life <= 0) {
      scene.remove(b.mesh); world.bullets.splice(i, 1); continue;
    }

    for (const car of world.trafficCars) {
      if (car.exploded) continue;
      if (Math.hypot(b.mesh.position.x - car.x, b.mesh.position.z - car.z) < 2.8) {
        car.damage = clamp(car.damage + 20, 0, 100);
        if (car.damage > 60) car.fire = clamp(car.fire + 0.8, 0, 3);
        scene.remove(b.mesh); world.bullets.splice(i, 1); break;
      }
    }

    for (const p of world.policeCars) {
      if (p.exploded) continue;
      if (Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z) < 2.8) {
        p.damage = clamp(p.damage + 18, 0, 100);
        if (p.damage > 60) p.fire = clamp(p.fire + 0.8, 0, 3);
        scene.remove(b.mesh); world.bullets.splice(i, 1); break;
      }
    }

    if (b.source !== 'player' && Math.hypot(b.mesh.position.x - player.x, b.mesh.position.z - player.z) < 2.6) {
      scene.remove(b.mesh); world.bullets.splice(i, 1);
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
        player.inCar = false;
        player.car = null;
        player.health = Math.max(0, player.health - 25);
        showToast('Your car exploded!');
      }
    }
  }
}

function updateObjectives() {
  if (world.missionStage === 0) {
    world.objectiveMesh.position.set(30, 0, -18);
    if (Math.hypot(player.x - world.objective.x, player.z - world.objective.z) < 8) {
      player.cash += 1500;
      world.missionStage = 1;
      world.objective.x = 80;
      world.objective.z = -90;
      player.wanted = clamp(player.wanted + 1.5, 0, 5);
      showToast('Briefcase secured');
    }
  } else if (world.missionStage === 1) {
    world.objectiveMesh.position.set(82, 0, -92);
    if (Math.hypot(player.x - world.objective.x, player.z - world.objective.z) < 12) {
      player.cash += 4200;
      world.missionStage = 2;
      showToast('Mission complete');
    }
  } else {
    world.objectiveMesh.visible = false;
  }

  if (world.objectiveMesh.visible) {
    world.objectiveMesh.rotation.y += 0.03;
    world.objectiveMesh.position.y = 0.5 + Math.sin(performance.now() * 0.005) * 0.8;
  }
}

function updateCamera() {
  const target = player.inCar && player.car ? new THREE.Vector3(player.car.x, 2.8, player.car.z) : new THREE.Vector3(player.x, 2.0, player.z);
  const chase = new THREE.Vector3(target.x - Math.cos(player.heading) * 10, 7.5, target.z - Math.sin(player.heading) * 10);
  camera.position.lerp(chase, 0.08);
  camera.lookAt(target.x, 2.0, target.z);
}

function updateWanted(dt) {
  if (player.wanted > 0) player.wanted = Math.max(0, player.wanted - dt * 0.06);
}

function updatePlayerState() {
  player.invuln = Math.max(0, player.invuln - 0.016);
  if (world.godMode) player.health = 100;

  if (player.health <= 0) {
    player.health = 100;
    player.cash = Math.max(0, player.cash - 600);
    player.x = 0; player.z = 0;
    player.inCar = false; player.car = null;
    player.wanted = 0;
    world.policeCars = [];
    showToast('Busted');
  }
}

function updateParticles(dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.mesh.position.x += p.vel.x * dt;
    p.mesh.position.y += p.vel.y * dt;
    p.mesh.position.z += p.vel.z * dt;
    p.life -= dt;
    p.mesh.material.opacity = clamp(p.life, 0, 1);
    if (p.life <= 0) { scene.remove(p.mesh); world.particles.splice(i, 1); }
  }
}

function spawnExplosion(x, z, color) {
  for (let i = 0; i < 20; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 1 })
    );
    mesh.position.set(x, 1, z);
    scene.add(mesh);
    world.particles.push({
      mesh,
      vel: new THREE.Vector3(rand(-7, 7), rand(2, 8), rand(-7, 7)),
      life: rand(0.4, 0.9)
    });
  }
}

function updateWorld(dt) {
  updatePlayer(dt);
  updateTrafficCars(dt);
  updatePoliceCars(dt);
  updateNPCs(dt);
  updatePickups(dt);
  updateBullets(dt);
  updateVehicleDamage(dt);
  updateObjectives();
  updateWanted(dt);
  updatePlayerState();
  updateCamera();
  updateParticles(dt);
  updateHUD();
}

function initGame() {
  addLight();
  createGround();
  createWorldObjects();

  const qualityScale = {
    low: { traffic: 12, npcs: 16 },
    medium: { traffic: 20, npcs: 26 },
    high: { traffic: 32, npcs: 40 }
  };

  const scale = qualityScale[settings.quality] || qualityScale.low;
  world.trafficCars = world.trafficCars.slice(0, scale.traffic);
  world.npcs = world.npcs.slice(0, scale.npcs);
  world.objective.x = 30;
  world.objective.z = -18;

  world.objectiveMesh.visible = true;
  player.x = 0; player.z = 0;
  player.mesh.position.set(0, 0, 0);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
  last = now;

  updateWorld(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);

window.addEventListener('load', () => {
  hud.cheatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const code = hud.cheatInput.value.trim().toLowerCase();
      if (code) processCheat(code);
      setCheatMode(false);
    }
  });
});
