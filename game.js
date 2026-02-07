const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const mapSelect = document.getElementById('mapSelect');
const restartBtn = document.getElementById('restartBtn');
const lapStat = document.getElementById('lapStat');
const speedStat = document.getElementById('speedStat');
const itemStat = document.getElementById('itemStat');
const skillStat = document.getElementById('skillStat');

const TRACK_WIDTH = 110;
const TOTAL_LAPS = 3;
const ITEM_RESPAWN_TIME = 3800;
const SKILL_COOLDOWN_MS = 6000;

const maps = [
  {
    id: 'coast',
    name: '海岸弯道',
    bg: '#1a2f4d',
    trackColor: '#6d7890',
    grassColor: '#2f5a35',
    path: [
      [130, 110],
      [370, 92],
      [690, 130],
      [820, 260],
      [780, 430],
      [565, 515],
      [270, 505],
      [130, 390],
      [95, 240],
    ],
  },
  {
    id: 'desert',
    name: '沙漠环线',
    bg: '#4f3e20',
    trackColor: '#807b67',
    grassColor: '#836124',
    path: [
      [150, 140],
      [400, 80],
      [700, 120],
      [860, 255],
      [840, 430],
      [650, 520],
      [355, 545],
      [145, 450],
      [95, 260],
    ],
  },
  {
    id: 'neon',
    name: '霓虹都市',
    bg: '#1e153a',
    trackColor: '#5d6fbf',
    grassColor: '#2d1f4d',
    path: [
      [160, 100],
      [420, 95],
      [760, 140],
      [850, 280],
      [780, 450],
      [560, 520],
      [300, 510],
      [120, 380],
      [115, 210],
    ],
  },
];

const keys = {};
const itemTypes = ['加速', '护盾', '陷阱'];

let map;
let checkpoints = [];
let pathPoints = [];
let itemBoxes = [];
let particles = [];

let car = {
  x: 150,
  y: 150,
  angle: 0,
  speed: 0,
  maxSpeed: 6.2,
  accel: 0.19,
  friction: 0.05,
  turnRate: 0.045,
  driftFactor: 0.88,
  lap: 0,
  item: null,
  boostUntil: 0,
  shieldUntil: 0,
  skillUntil: 0,
  skillCooldownUntil: 0,
  checkpointIndex: 0,
  justCrossedFinish: false,
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mapPoint(pt) {
  return { x: pt[0], y: pt[1] };
}

function setupMapOptions() {
  maps.forEach((m) => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = m.name;
    mapSelect.appendChild(option);
  });
}

function getCurrentMap() {
  return maps.find((m) => m.id === mapSelect.value) ?? maps[0];
}

function initGame() {
  map = getCurrentMap();
  pathPoints = map.path.map(mapPoint);
  checkpoints = pathPoints.map((pt) => ({ ...pt }));

  car = {
    ...car,
    x: pathPoints[0].x + 20,
    y: pathPoints[0].y,
    angle: 0,
    speed: 0,
    lap: 0,
    item: null,
    boostUntil: 0,
    shieldUntil: 0,
    skillUntil: 0,
    skillCooldownUntil: 0,
    checkpointIndex: 0,
    justCrossedFinish: false,
  };

  itemBoxes = checkpoints
    .filter((_, i) => i % 2 === 1)
    .map((pt) => ({
      x: pt.x,
      y: pt.y,
      active: true,
      respawnAt: 0,
    }));

  particles = [];
}

function nearestSegmentDistance(point, polyline) {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length; i += 1) {
    const a = polyline[i];
    const b = polyline[(i + 1) % polyline.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = point.x - a.x;
    const apy = point.y - a.y;
    const abLenSq = abx * abx + aby * aby;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    min = Math.min(min, Math.hypot(point.x - px, point.y - py));
  }
  return min;
}

function spawnTrailParticle() {
  particles.push({
    x: car.x,
    y: car.y,
    life: 24,
    size: 2 + Math.random() * 3,
  });
}

function useItem() {
  if (!car.item) return;
  if (car.item === '加速') {
    car.boostUntil = performance.now() + 1600;
    car.speed = Math.max(car.speed, 7.8);
  }
  if (car.item === '护盾') {
    car.shieldUntil = performance.now() + 4500;
  }
  if (car.item === '陷阱') {
    particles.push({ x: car.x - 20, y: car.y, life: 90, size: 8, trap: true });
  }
  car.item = null;
}

function activateSkill() {
  const now = performance.now();
  if (now < car.skillCooldownUntil) return;
  car.skillUntil = now + 1400;
  car.skillCooldownUntil = now + SKILL_COOLDOWN_MS;
  car.speed = Math.max(car.speed, 9);
}

function update(delta) {
  const now = performance.now();
  const drift = keys.ShiftLeft || keys.ShiftRight;
  const skillActive = now < car.skillUntil;
  const boosted = now < car.boostUntil;

  const accel = skillActive ? 0.32 : car.accel;
  const maxSpeed = skillActive ? 9.4 : boosted ? 7.9 : car.maxSpeed;

  if (keys.ArrowUp) car.speed += accel;
  if (keys.ArrowDown) car.speed -= accel * 0.8;
  if (!keys.ArrowUp && !keys.ArrowDown) {
    car.speed *= 1 - car.friction;
  }

  car.speed = Math.max(-2.8, Math.min(maxSpeed, car.speed));

  const turnScale = Math.min(1, Math.abs(car.speed) / 3.5 + 0.25);
  if (keys.ArrowLeft) car.angle -= car.turnRate * turnScale;
  if (keys.ArrowRight) car.angle += car.turnRate * turnScale;

  const traction = drift ? car.driftFactor : 1;
  car.x += Math.cos(car.angle) * car.speed * traction;
  car.y += Math.sin(car.angle) * car.speed * traction;

  if (drift && Math.abs(car.speed) > 2.5) {
    spawnTrailParticle();
  }

  const offTrack = nearestSegmentDistance(car, pathPoints) > TRACK_WIDTH / 2;
  if (offTrack) {
    car.speed *= now < car.shieldUntil ? 0.96 : 0.9;
  }

  const nextCheckpoint = checkpoints[(car.checkpointIndex + 1) % checkpoints.length];
  if (dist(car, nextCheckpoint) < 55) {
    car.checkpointIndex = (car.checkpointIndex + 1) % checkpoints.length;
  }

  const finish = checkpoints[0];
  if (dist(car, finish) < 55 && car.checkpointIndex === checkpoints.length - 1) {
    if (!car.justCrossedFinish) {
      car.lap += 1;
      car.justCrossedFinish = true;
      car.checkpointIndex = 0;
    }
  } else {
    car.justCrossedFinish = false;
  }

  itemBoxes.forEach((box) => {
    if (!box.active && now >= box.respawnAt) box.active = true;
    if (box.active && dist(car, box) < 32 && !car.item) {
      car.item = itemTypes[Math.floor(Math.random() * itemTypes.length)];
      box.active = false;
      box.respawnAt = now + ITEM_RESPAWN_TIME;
    }
  });

  particles = particles
    .map((p) => ({ ...p, life: p.life - delta * 0.06 }))
    .filter((p) => p.life > 0);

  if (car.lap >= TOTAL_LAPS) {
    car.speed *= 0.95;
  }

  render(now);
  updateHud(now);
}

function drawTrack() {
  ctx.fillStyle = map.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = map.grassColor;
  ctx.lineWidth = TRACK_WIDTH + 70;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  pathPoints.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = map.trackColor;
  ctx.lineWidth = TRACK_WIDTH;
  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  pathPoints.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = '#e8e8f2';
  ctx.setLineDash([12, 12]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  pathPoints.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  const start = pathPoints[0];
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 8; i += 1) {
    ctx.fillRect(start.x - 40 + i * 10, start.y - 55, 8, 24);
  }
}

function drawItems() {
  itemBoxes.forEach((box) => {
    if (!box.active) return;
    ctx.fillStyle = '#f5cb42';
    ctx.beginPath();
    ctx.arc(box.x, box.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#342607';
    ctx.font = '12px sans-serif';
    ctx.fillText('?', box.x - 4, box.y + 4);
  });
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / 24);
    ctx.fillStyle = p.trap ? '#ff5a54' : '#a6b0c9';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawCar(now) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  if (now < car.shieldUntil) {
    ctx.strokeStyle = '#5be6ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = now < car.skillUntil ? '#ff3f8f' : '#52a6ff';
  ctx.fillRect(-22, -12, 44, 24);
  ctx.fillStyle = '#1c223b';
  ctx.fillRect(-14, -9, 28, 18);

  ctx.fillStyle = '#111';
  ctx.fillRect(-20, -15, 10, 4);
  ctx.fillRect(10, -15, 10, 4);
  ctx.fillRect(-20, 11, 10, 4);
  ctx.fillRect(10, 11, 10, 4);

  if (now < car.skillUntil || now < car.boostUntil) {
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-22, -6);
    ctx.lineTo(-34 - Math.random() * 6, 0);
    ctx.lineTo(-22, 6);
    ctx.fill();
  }

  ctx.restore();
}

function render(now) {
  drawTrack();
  drawItems();
  drawParticles();
  drawCar(now);

  if (car.lap >= TOTAL_LAPS) {
    ctx.fillStyle = 'rgba(7, 11, 24, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('🏁 完赛！', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '22px sans-serif';
    ctx.fillText('点击“重开本图”再次挑战', canvas.width / 2, canvas.height / 2 + 26);
    ctx.textAlign = 'left';
  }
}

function updateHud(now) {
  lapStat.textContent = `圈数: ${Math.min(car.lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
  speedStat.textContent = `速度: ${Math.max(0, car.speed).toFixed(1)}`;
  itemStat.textContent = `道具: ${car.item ?? '无'}`;
  const cd = Math.max(0, (car.skillCooldownUntil - now) / 1000);
  skillStat.textContent = cd > 0 ? `技能冷却: ${cd.toFixed(1)}s` : '技能冷却: 可释放';
}

let last = performance.now();
function loop(now) {
  const delta = now - last;
  last = now;
  update(delta);
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    activateSkill();
  }
  if (e.code === 'KeyE') {
    useItem();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

mapSelect.addEventListener('change', initGame);
restartBtn.addEventListener('click', initGame);

setupMapOptions();
mapSelect.value = maps[0].id;
initGame();
requestAnimationFrame(loop);
