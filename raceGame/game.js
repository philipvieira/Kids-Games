// ═══════════════════════════════════════════════════════════════
//  מרוץ המכוניות  –  game.js
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const LANES      = 5;
const BASE_SPEED = 2.2;
const MAX_SCORES = 8;

// ─── Level Config (infinite) ──────────────────────────────────
function getLevelConfig(lvl) {
  return {
    traffic  : 2 + Math.floor(lvl * 1.2),   // start at 2, grow slower
    timeLimit: Math.max(45, 100 - lvl * 5),
    goalDist : 6000 + lvl * 1500,
    speedMult: 1.0 + lvl * 0.18,
    label    : String(lvl + 1),
  };
}

// ─── State ────────────────────────────────────────────────────
let W, H, laneW, roadLeft, roadRight;
let currentLevel = 0;
let lives        = 3;
let driverName   = 'נהג';
let selectedCarType = 'sports';   // player-chosen car

let player, trafficCars, powerups, particles;
let score, timerSec, timerInterval;
let distanceTravelled, goalDistance;
let gameRunning;
let gamePaused = false;
let scrollY, bgOffset;
let moveLeft = false, moveRight = false;
let powerupsActive = {};   // { speed: {endTime, startTime}, invincible: {...}, x2: {...} }
let loopId = null;
let frameCount = 0;
let lastPowerupSpawn = 0;

// ─── Car type definitions ──────────────────────────────────────
const CAR_TYPES = {
  sports:  { label: 'ספורט',    bodyColor: '#ff2222', roofColor: '#880000', wScale: 0.68, hScale: 1.15, shape: 'sports'  },
  sedan:   { label: 'סדאן',     bodyColor: '#3498db', roofColor: '#1a5f8a', wScale: 0.72, hScale: 1.25, shape: 'sedan'   },
  suv:     { label: "ג'יפ",     bodyColor: '#2ecc71', roofColor: '#1a7a44', wScale: 0.78, hScale: 1.35, shape: 'suv'     },
  formula: { label: 'פורמולה',  bodyColor: '#ff9900', roofColor: '#cc6600', wScale: 0.62, hScale: 1.05, shape: 'formula' },
};

// Traffic car variety pool
const TRAFFIC_VARIANTS = [
  { shape: 'sedan',  colors: ['#e74c3c','#3498db','#2ecc71','#9b59b6','#1abc9c'] },
  { shape: 'sports', colors: ['#e67e22','#ff6b9d','#c0392b','#8e44ad'] },
  { shape: 'suv',    colors: ['#f39c12','#27ae60','#2980b9','#7f8c8d'] },
  { shape: 'van',    colors: ['#ecf0f1','#bdc3c7','#95a5a6','#7f8c8d'] },
  { shape: 'truck',  colors: ['#e74c3c','#2c3e50','#16a085','#8e44ad'] },
];

// ─── Resize ───────────────────────────────────────────────────
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  const roadW = Math.min(W * 0.70, 520);   // wider road
  roadLeft  = (W - roadW) / 2;
  roadRight = roadLeft + roadW;
  laneW     = roadW / LANES;
  if (player) {
    player.x = clamp(player.x, roadLeft + laneW * 0.5, roadRight - laneW * 0.5);
  }
}
window.addEventListener('resize', resize);

// ─── Helpers ──────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo, hi)  { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
function laneCenter(i) { return roadLeft + laneW * (i + 0.5); }

// ─── Screen Management ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goMenu() {
  clearInterval(timerInterval);
  if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
  gameRunning  = false;
  gamePaused   = false;
  currentLevel = 0;
  lives        = 3;
  showScreen('menu-screen');
  renderHighScores();
  renderCarPreviews();
}

// ─── Car selection ────────────────────────────────────────────
function selectCar(type) {
  selectedCarType = type;
  document.querySelectorAll('.car-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.car === type);
  });
  startMusic();
}

function renderCarPreviews() {
  Object.keys(CAR_TYPES).forEach(type => {
    const cvs = document.getElementById(`preview-${type}`);
    if (!cvs) return;
    const c   = cvs.getContext('2d');
    const def = CAR_TYPES[type];
    c.clearRect(0, 0, 70, 100);
    drawCarShape(c, 35, 50, 44, 76, def.bodyColor, def.roofColor, def.shape, false, null, 0);
  });
}

// ─── Pause ────────────────────────────────────────────────────
function togglePause() {
  if (!gameRunning) return;
  gamePaused = !gamePaused;
  const btn = document.getElementById('pause-btn');
  if (gamePaused) {
    clearInterval(timerInterval);          // stop the countdown
    document.getElementById('pause-screen').classList.add('active');
    if (btn) btn.textContent = '▶';
  } else {
    // Restart the countdown from where it left off
    timerInterval = setInterval(() => {
      if (!gameRunning) return;
      timerSec--;
      document.getElementById('timer').textContent = timerSec;
      if (timerSec <= 0) loseLife('הזמן נגמר! 🕐');
    }, 1000);
    document.getElementById('pause-screen').classList.remove('active');
    if (btn) btn.textContent = '⏸';
    loopId = requestAnimationFrame(loop);
  }
}


function startGame() {
  const inp = document.getElementById('driver-name').value.trim();
  driverName   = inp || 'נהג';
  currentLevel = 0;
  lives        = 3;
  startMusic();
  initLevel(0);
  showScreen('game-screen');
}

function initLevel(lvl) {
  clearInterval(timerInterval);
  if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
  resize();

  const cfg   = getLevelConfig(lvl);
  const carDef = CAR_TYPES[selectedCarType] || CAR_TYPES.sports;

  gameRunning       = true;
  gamePaused        = false;
  document.getElementById('pause-screen').classList.remove('active');
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.textContent = '⏸';
  score             = 0;
  distanceTravelled = 0;
  goalDistance      = cfg.goalDist;
  scrollY           = 0;
  bgOffset          = 0;
  moveLeft          = false;
  moveRight         = false;
  powerupsActive    = {};
  trafficCars       = [];
  powerups          = [];
  particles         = [];
  frameCount        = 0;
  lastPowerupSpawn  = 0;

  player = {
    x        : W / 2,
    y        : H * 0.75,
    w        : laneW * carDef.wScale,
    h        : laneW * carDef.hScale,
    speed    : BASE_SPEED * cfg.speedMult,
    carType  : selectedCarType,
    bodyColor: carDef.bodyColor,
    roofColor: carDef.roofColor,
    shape    : carDef.shape,
  };

  updateLivesDisplay();
  updatePowerupHUD();
  document.getElementById('level-display').textContent = cfg.label;
  document.getElementById('score').textContent         = '0';

  timerSec = cfg.timeLimit;
  document.getElementById('timer').textContent = timerSec;
  timerInterval = setInterval(() => {
    if (!gameRunning) return;
    timerSec--;
    document.getElementById('timer').textContent = timerSec;
    if (timerSec <= 0) loseLife('הזמן נגמר! 🕐');
  }, 1000);

  for (let i = 0; i < cfg.traffic; i++) spawnTraffic(true, i, cfg.traffic);

  loopId = requestAnimationFrame(loop);
}

function updateLivesDisplay() {
  const el = document.getElementById('lives-display');
  if (el) el.textContent = '❤️'.repeat(Math.max(0, lives)) || '💀';
}

// ─── Traffic Spawning ─────────────────────────────────────────
function spawnTraffic(initial, initialIdx = 0, initialTotal = 1) {
  const cfg     = getLevelConfig(currentLevel);
  const variant = TRAFFIC_VARIANTS[randInt(0, TRAFFIC_VARIANTS.length - 1)];
  const color   = variant.colors[randInt(0, variant.colors.length - 1)];
  const shape   = variant.shape;
  const wScale  = shape === 'truck' ? 0.74 : shape === 'suv' ? 0.76 : shape === 'van' ? 0.72 : 0.62;
  const hScale  = shape === 'truck' ? 1.40 : shape === 'suv' ? 1.30 : shape === 'van' ? 1.35 : 1.08;
  const carH    = laneW * hScale;

  // Minimum safe gap between cars: car height + generous buffer
  const MIN_GAP = carH * 2.0;

  // For initial spawn: spread cars evenly across a long stretch above the screen
  // so they don't all cluster at the same Y
  let spawnY;
  if (initial) {
    // Divide the spawn zone (-H*0.3 to -H*2.8) into equal slots
    const zoneStart = -(H * 0.3 + carH);
    const zoneEnd   = -(H * 2.8);
    const slot      = (zoneEnd - zoneStart) / Math.max(initialTotal, 1);
    spawnY = zoneStart + slot * initialIdx + rand(0, Math.abs(slot) * 0.5);
  } else {
    // Respawn: just above the top of the screen
    spawnY = -(carH + rand(40, 120));
  }

  // Find a lane with no overlap at this Y position
  const laneOrder = shuffleArray([...Array(LANES).keys()]);
  let placed = false;

  for (const lane of laneOrder) {
    const cx = laneCenter(lane);
    let clear = true;
    for (const t of trafficCars) {
      if (Math.abs(t.x - cx) < laneW * 0.85) {
        if (Math.abs(t.y - spawnY) < MIN_GAP) { clear = false; break; }
      }
    }
    if (clear) {
      trafficCars.push({
        x        : cx,
        y        : spawnY,
        w        : laneW * wScale,
        h        : carH,
        speed    : rand(1.2, 2.5) * cfg.speedMult,
        color,
        shape,
      });
      placed = true;
      break;
    }
  }

  // Fallback: nudge Y far enough above anything else and force-place
  if (!placed) {
    const lane = laneOrder[0];
    const cx   = laneCenter(lane);
    let topY = spawnY;
    for (const t of trafficCars) {
      if (Math.abs(t.x - cx) < laneW * 0.85 && t.y < topY) topY = t.y;
    }
    trafficCars.push({
      x        : cx,
      y        : topY - MIN_GAP,
      w        : laneW * wScale,
      h        : carH,
      speed    : rand(1.2, 2.5) * cfg.speedMult,
      color,
      shape,
    });
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function spawnPowerup() {
  const types = ['speed', 'invincible', 'x2'];
  const lane  = randInt(0, LANES - 1);
  const sz    = laneW * 0.4;
  powerups.push({
    x   : laneCenter(lane),
    y   : -50,
    type: types[randInt(0, types.length - 1)],
    w   : sz,
    h   : sz,
    rot : 0,
  });
}

// ─── Input ────────────────────────────────────────────────────
document.getElementById('tap-left').addEventListener('pointerdown',  () => { moveLeft  = true; });
document.getElementById('tap-left').addEventListener('pointerup',    () => { moveLeft  = false; });
document.getElementById('tap-left').addEventListener('pointerleave', () => { moveLeft  = false; });
document.getElementById('tap-right').addEventListener('pointerdown', () => { moveRight = true; });
document.getElementById('tap-right').addEventListener('pointerup',   () => { moveRight = false; });
document.getElementById('tap-right').addEventListener('pointerleave',() => { moveRight = false; });
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  { e.preventDefault(); moveLeft  = true; }
  if (e.key === 'ArrowRight') { e.preventDefault(); moveRight = true; }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
});
document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft')  moveLeft  = false;
  if (e.key === 'ArrowRight') moveRight = false;
});

// ─── Main Loop ────────────────────────────────────────────────
function loop(ts) {
  if (!gameRunning || gamePaused) { loopId = null; return; }
  frameCount++;
  update(ts);
  draw();
  loopId = requestAnimationFrame(loop);
}

// ─── Update ───────────────────────────────────────────────────
function update(ts) {
  const speed = powerupsActive.speed ? player.speed * 1.7 : player.speed;

  // Horizontal movement
  const hSpeed = laneW * 0.07;
  if (moveLeft)  player.x = Math.max(roadLeft  + player.w / 2, player.x - hSpeed);
  if (moveRight) player.x = Math.min(roadRight - player.w / 2, player.x + hSpeed);

  scrollY  = (scrollY  + speed)       % H;
  bgOffset = (bgOffset + speed * 0.4) % H;

  distanceTravelled += speed;
  const x2Mult = powerupsActive.x2 ? 2 : 1;
  score = Math.floor(distanceTravelled * x2Mult / 10);
  document.getElementById('score').textContent = score;
  // Update HUD progress bar
  const progEl = document.getElementById('progress-bar');
  if (progEl) progEl.style.width = Math.min(distanceTravelled / goalDistance * 100, 100) + '%';

  // Goal reached
  if (distanceTravelled >= goalDistance) {
    gameRunning = false;         // stop loop FIRST
    clearInterval(timerInterval);
    triggerWin();
    return;
  }

  // Powerup timers — expire each independently
  let anyActive = false;
  for (const type of Object.keys(powerupsActive)) {
    if (ts > powerupsActive[type].endTime) {
      delete powerupsActive[type];
    } else {
      anyActive = true;
    }
  }
  updatePowerupHUD(ts);

  // Spawn powerup ~every 8–12 s
  if (frameCount - lastPowerupSpawn > 480 + randInt(0, 240)) {
    lastPowerupSpawn = frameCount;
    spawnPowerup();
  }

  // Traffic — move + enforce separation
  // Don't spawn new cars once the finish line is on-screen
  const finishOnScreen = (goalDistance - distanceTravelled) < H;
  for (let i = trafficCars.length - 1; i >= 0; i--) {
    const t = trafficCars[i];
    t.y += t.speed;
    if (t.y > H + 120) {
      trafficCars.splice(i, 1);
      if (!finishOnScreen) spawnTraffic(false);
    }
  }

  // Prevent traffic cars from overlapping each other while driving
  for (let i = 0; i < trafficCars.length; i++) {
    for (let j = i + 1; j < trafficCars.length; j++) {
      const a = trafficCars[i];
      const b = trafficCars[j];
      // Only care about same lane
      if (Math.abs(a.x - b.x) >= laneW * 0.85) continue;
      const minDist = (a.h + b.h) * 0.5 + 8;
      const dy = b.y - a.y;
      if (Math.abs(dy) < minDist) {
        // Push them apart: the one ahead (lower y = higher on screen) stays, rear one backs off
        const overlap = minDist - Math.abs(dy);
        if (dy >= 0) {
          // b is below a (b is further down screen = closer in road direction)
          b.y += overlap * 0.5;
          a.y -= overlap * 0.5;
        } else {
          a.y += overlap * 0.5;
          b.y -= overlap * 0.5;
        }
        // Also slow down the rear car slightly to maintain gap
        if (dy >= 0 && b.speed > a.speed) b.speed = a.speed * 0.95;
        if (dy <  0 && a.speed > b.speed) a.speed = b.speed * 0.95;
      }
    }
  }

  // Powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y   += speed * 0.9;
    p.rot += 0.04;
    if (p.y > H + 80) { powerups.splice(i, 1); continue; }
    if (rectsOverlap(player, p, true)) {
      activatePowerup(p.type, ts);
      powerups.splice(i, 1);
      const burstColor = p.type === 'speed' ? '#4af' : p.type === 'x2' ? '#f0f' : '#ff0';
      spawnBurst(p.x, p.y, burstColor);
    }
  }

  // Collisions
  if (!powerupsActive.invincible) {
    for (const t of trafficCars) {
      if (rectsOverlap(player, t, false)) {  // tight hit for traffic collision
        gameRunning = false;
        clearInterval(timerInterval);
        spawnBurst(player.x, player.y, '#ff4400');
        setTimeout(() => loseLife('אוי! התנגשת במכונית! 💥'), 300);
        return;
      }
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─── Overlap ──────────────────────────────────────────────────
function rectsOverlap(a, b, loose) {
  // loose=true uses a wider hit zone (for powerup pickup), false = tight (collisions)
  const margin = loose ? 0.85 : 0.60;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const hw = (a.w + b.w) * 0.5 * margin;
  const hh = (a.h + (b.h || b.w)) * 0.5 * margin;
  return dx < hw && dy < hh;
}

// ─── Powerup ──────────────────────────────────────────────────
const POWERUP_DURATION = 5000;

const POWERUP_META = {
  speed    : { icon: '⚡',  label: 'מהירות',    barColor: 'linear-gradient(90deg,#4af,#0af)' },
  invincible: { icon: '🛡️', label: 'חוסן',      barColor: 'linear-gradient(90deg,#ff0,#fa0)' },
  x2       : { icon: null,  label: 'ניקוד כפול', barColor: 'linear-gradient(90deg,#f0f,#a0f)' },
};

function activatePowerup(type, ts) {
  if (powerupsActive[type]) {
    powerupsActive[type].endTime   = ts + POWERUP_DURATION;
    powerupsActive[type].startTime = ts;
  } else {
    powerupsActive[type] = { endTime: ts + POWERUP_DURATION, startTime: ts };
  }
  updatePowerupHUD(ts);
}

function updatePowerupHUD(ts) {
  const container = document.getElementById('powerup-slots');
  if (!container) return;
  const types = Object.keys(powerupsActive);
  if (!types.length || ts === undefined) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = types.map(type => {
    const pa   = powerupsActive[type];
    const meta = POWERUP_META[type] || { icon: '?', barColor: '#fff' };
    const pct  = Math.max(0, 1 - (ts - pa.startTime) / POWERUP_DURATION);
    const iconHtml = type === 'x2'
      ? `<span class="powerup-slot-icon x2-badge">×2</span>`
      : `<span class="powerup-slot-icon">${meta.icon}</span>`;
    return `<div class="powerup-slot">
      ${iconHtml}
      <div class="powerup-slot-bar-wrap">
        <div class="powerup-slot-bar" style="width:${(pct*100).toFixed(1)}%;background:${meta.barColor}"></div>
      </div>
    </div>`;
  }).join('');
}

// ─── Burst Particles ──────────────────────────────────────────
function spawnBurst(x, y, color) {
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2;
    const spd   = rand(2, 6);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      r : rand(3, 8), color,
      life: 1, decay: rand(0.02, 0.05),
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  DRAWING
// ═══════════════════════════════════════════════════════════════
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawRoad();
  drawFinishLine();
  drawCarShadows();
  drawTrafficCars();
  drawPowerups();
  drawPlayerCar();
  drawParticles();
}

// ─── Background ───────────────────────────────────────────────
function drawBackground() {
  drawCity(0, roadLeft);
  drawBeach(roadRight, W);
}

// ─── CITY (daytime) ───────────────────────────────────────────
function drawCity(x1, x2) {
  if (x2 <= x1) return;
  const w = x2 - x1;

  // Daytime sky
  const sky = ctx.createLinearGradient(x1, 0, x1, H * 0.55);
  sky.addColorStop(0,   '#87ceeb');
  sky.addColorStop(0.6, '#b0e0ff');
  sky.addColorStop(1,   '#d4f0ff');
  ctx.fillStyle = sky;
  ctx.fillRect(x1, 0, w, H * 0.55);

  // Clouds — static (no scrolling animation)
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const cloudSeeds = [11, 37, 59, 83];
  cloudSeeds.forEach((s, ci) => {
    const cx = x1 + ((s * 61 + 200) % (w + 80)) % (w + 80) - 40;
    const cy = H * (0.06 + ci * 0.05);
    drawCloud(cx, cy, 28 + s % 14);
  });

  // Buildings — more of them, varied
  const buildings = [
    { rel: 0.01, bw: 0.14, floors: 10, col: '#c8d8e8', winCol: '#a8c8f0' },
    { rel: 0.16, bw: 0.18, floors: 16, col: '#b0c4de', winCol: '#90b4d4' },
    { rel: 0.36, bw: 0.13, floors:  8, col: '#c4d4e4', winCol: '#a0c0e0' },
    { rel: 0.50, bw: 0.20, floors: 13, col: '#d0c8b8', winCol: '#c0a060' },
    { rel: 0.71, bw: 0.15, floors: 11, col: '#b8ccd8', winCol: '#88aacc' },
    { rel: 0.86, bw: 0.14, floors:  7, col: '#ccd4cc', winCol: '#88cc88' },
  ];

  buildings.forEach(b => {
    const bx = x1 + b.rel * w;
    const bw = b.bw * w;
    const bh = b.floors * 18;
    const by = H * 0.55 - bh;

    // Building body
    ctx.fillStyle = b.col;
    ctx.fillRect(bx, by, bw, bh);

    // Shading — right edge darker
    const shade = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    shade.addColorStop(0,   'rgba(0,0,0,0)');
    shade.addColorStop(0.8, 'rgba(0,0,0,0)');
    shade.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = shade;
    ctx.fillRect(bx, by, bw, bh);

    // Windows
    const cols   = Math.max(1, Math.floor(bw / 12));
    const floorH = 16;
    for (let row = 0; row < b.floors - 1; row++) {
      for (let col = 0; col < cols; col++) {
        const wx = bx + 5 + col * 12;
        const wy = by + 5 + row * floorH;
        ctx.fillStyle = b.winCol;
        ctx.fillRect(wx, wy, 6, 8);
        // Window glint
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(wx, wy, 2, 3);
      }
    }

    // Rooftop details
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(bx + bw * 0.15, by - 4, bw * 0.7, 4);

    // Antenna
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2, by);
    ctx.lineTo(bx + bw / 2, by - 14);
    ctx.stroke();
  });

  // Ground / sidewalk
  const ground = ctx.createLinearGradient(x1, H * 0.55, x1, H);
  ground.addColorStop(0,   '#8b7355');
  ground.addColorStop(0.15,'#a08060');
  ground.addColorStop(1,   '#706050');
  ctx.fillStyle = ground;
  ctx.fillRect(x1, H * 0.55, w, H * 0.45);

  // Sidewalk tiles — static
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  const tileH = 24;
  for (let ty = H * 0.55; ty < H; ty += tileH) {
    ctx.beginPath(); ctx.moveTo(x1, ty); ctx.lineTo(x2, ty); ctx.stroke();
  }

  // Streetlights — static positions
  const lightSpacing = 180;
  for (let ly = H * 0.55; ly < H; ly += lightSpacing) {
    const lx = x2 - 18;
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx, ly + 60);
    ctx.lineTo(lx, ly + 5);
    ctx.lineTo(lx - 20, ly + 5);
    ctx.stroke();
    ctx.fillStyle = '#ffee88';
    ctx.beginPath();
    ctx.arc(lx - 20, ly + 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Parked cars on sidewalk — static
  const parkSpacing = 220;
  const parkColors  = ['#cc4444','#4488cc','#44aa44','#aaaa22'];
  for (let py = H * 0.62; py < H - 30; py += parkSpacing) {
    const pi = Math.floor(py / parkSpacing) % parkColors.length;
    drawParkedCar(x1 + 8, py, 28, 50, parkColors[pi]);
  }
}

function drawCloud(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx,      cy,      r,        0, Math.PI * 2);
  ctx.arc(cx + r,  cy - 4,  r * 0.75, 0, Math.PI * 2);
  ctx.arc(cx + r * 1.8, cy, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
}

function drawParkedCar(x, y, w, h, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 3, y + 3, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(150,210,255,0.5)';
  ctx.fillRect(x + 3, y + 6, w - 6, h * 0.35);
}

// ─── BEACH (daytime) ──────────────────────────────────────────
function drawBeach(x1, x2) {
  if (x2 <= x1) return;
  const w = x2 - x1;

  // Sky — blue daytime
  const sky = ctx.createLinearGradient(x1, 0, x1, H * 0.55);
  sky.addColorStop(0,   '#1e90ff');
  sky.addColorStop(0.5, '#87ceeb');
  sky.addColorStop(1,   '#b0e8ff');
  ctx.fillStyle = sky;
  ctx.fillRect(x1, 0, w, H * 0.55);

  // Single sun
  const sunX = x1 + w * 0.72;
  const sunY = H * 0.11;
  const sunGrd = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 55);
  sunGrd.addColorStop(0,   '#fff9c4');
  sunGrd.addColorStop(0.35,'#ffe082');
  sunGrd.addColorStop(1,   'rgba(255,200,50,0)');
  ctx.fillStyle = sunGrd;
  ctx.beginPath(); ctx.arc(sunX, sunY, 55, 0, Math.PI * 2); ctx.fill();

  // Sun rays — static
  ctx.save();
  ctx.strokeStyle = 'rgba(255,220,80,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(sunX + Math.cos(angle) * 30, sunY + Math.sin(angle) * 30);
    ctx.lineTo(sunX + Math.cos(angle) * 70, sunY + Math.sin(angle) * 70);
    ctx.stroke();
  }
  ctx.restore();

  // Sea
  const seaGrd = ctx.createLinearGradient(x1, H * 0.42, x1, H * 0.68);
  seaGrd.addColorStop(0,   '#1a9bcf');
  seaGrd.addColorStop(0.5, '#0e7aa8');
  seaGrd.addColorStop(1,   '#0a5a80');
  ctx.fillStyle = seaGrd;
  ctx.fillRect(x1, H * 0.42, w, H * 0.26);

  // Sun reflection on water
  ctx.fillStyle = 'rgba(255,255,200,0.18)';
  ctx.beginPath();
  ctx.ellipse(sunX, H * 0.55, 20, 55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Waves — static
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  for (let wi = 0; wi < 5; wi++) {
    const wy = H * (0.45 + wi * 0.045);
    ctx.beginPath();
    for (let wx = x1; wx <= x2; wx += 6) {
      const yw = wy + Math.sin((wx + wi * 40) * 0.045) * 5;
      wx === x1 ? ctx.moveTo(wx, yw) : ctx.lineTo(wx, yw);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Sand
  const sandGrd = ctx.createLinearGradient(x1, H * 0.68, x1, H);
  sandGrd.addColorStop(0,   '#f5e08a');
  sandGrd.addColorStop(0.4, '#e8c96d');
  sandGrd.addColorStop(1,   '#d4a84a');
  ctx.fillStyle = sandGrd;
  ctx.fillRect(x1, H * 0.68, w, H * 0.32);

  // Sand texture dots
  ctx.fillStyle = 'rgba(180,140,60,0.25)';
  const dotSeeds = [3, 7, 13, 19, 23, 31, 41, 47, 53, 61, 71, 79];
  dotSeeds.forEach(s => {
    const dx = x1 + ((s * 57 + 3) % 100) / 100 * w;
    const dy = H * 0.72 + ((s * 43) % 100) / 100 * H * 0.26;
    ctx.beginPath();
    ctx.arc(dx, dy, 2 + (s % 3), 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Beach assets — static positions ──
  const assetSets = [
    { rel: 0.15, ay: H * 0.72, col1: '#e74c3c', col2: '#f39c12' },
    { rel: 0.6,  ay: H * 0.76, col1: '#3498db', col2: '#2ecc71' },
  ];

  assetSets.forEach((a) => {
    const ax = x1 + a.rel * w;

    drawBeachUmbrella(ax, a.ay, a.col1, a.col2);
    drawBeachChair(ax - 16, a.ay + 28, '#cc8844');
    drawBeachChair(ax + 8,  a.ay + 28, '#aa6633');
    drawBeachBall(ax + 32,  a.ay + 44, 10);
  });

  // Surfboard — static
  drawSurfboard(x1 + w * 0.82, H * 0.74, 40);

  // Cooler — static
  drawCooler(x1 + w * 0.4, H * 0.73);

  // Seagulls — static
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.5;
  const seagullPos = [0.15, 0.45, 0.7, 0.85];
  const seagullY   = [0.10, 0.13, 0.09, 0.12];
  seagullPos.forEach((rel, i) => {
    const gx = x1 + rel * w;
    const gy = H * seagullY[i];
    ctx.beginPath();
    ctx.moveTo(gx - 9, gy);
    ctx.quadraticCurveTo(gx, gy - 6, gx + 9, gy);
    ctx.stroke();
  });

  // Swimmer — static
  const swX = x1 + w * 0.5;
  const swY = H * 0.53;
  ctx.fillStyle = '#ffcc99';
  ctx.beginPath(); ctx.arc(swX, swY, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffcc99'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(swX - 10, swY + 4);
  ctx.quadraticCurveTo(swX, swY + 10, swX + 10, swY + 4);
  ctx.stroke();
}

function drawBeachUmbrella(ux, uy, col1, col2) {
  ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(ux, uy + 40); ctx.lineTo(ux, uy); ctx.stroke();
  ctx.fillStyle = col1;
  ctx.beginPath();
  ctx.moveTo(ux - 30, uy);
  ctx.quadraticCurveTo(ux, uy - 24, ux + 30, uy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col2;
  ctx.beginPath();
  ctx.moveTo(ux - 30, uy); ctx.lineTo(ux, uy); ctx.lineTo(ux - 15, uy + 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col1;
  ctx.beginPath();
  ctx.moveTo(ux, uy); ctx.lineTo(ux + 30, uy); ctx.lineTo(ux + 15, uy + 9);
  ctx.closePath(); ctx.fill();
}

function drawBeachChair(x, y, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2.5;
  // Back rest
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + 14, y - 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 14, y - 18); ctx.stroke();
  // Seat
  ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 16, y); ctx.stroke();
  // Legs
  ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x, y + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 12, y); ctx.lineTo(x + 14, y + 10); ctx.stroke();
}

function drawBeachBall(x, y, r) {
  ctx.save();
  const segments = [['#e74c3c','#3498db'],['#2ecc71','#f39c12'],['#9b59b6','#e74c3c']];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = segments[i % 3][i % 2];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawSurfboard(x, y, len) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.2);
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, len / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -len / 2 + 4); ctx.lineTo(0, len / 2 - 4); ctx.stroke();
  ctx.restore();
}

function drawCooler(x, y) {
  ctx.fillStyle = '#3498db';
  ctx.fillRect(x, y, 22, 14);
  ctx.fillStyle = '#2980b9';
  ctx.fillRect(x + 1, y + 1, 20, 3);
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(x + 3, y + 6, 16, 6);
  ctx.fillStyle = '#bdc3c7';
  ctx.fillRect(x + 9, y + 4, 4, 2);
}

// ─── Road ─────────────────────────────────────────────────────
function drawRoad() {
  const roadW = roadRight - roadLeft;

  // Road surface
  const grd = ctx.createLinearGradient(roadLeft, 0, roadRight, 0);
  grd.addColorStop(0,   '#252525');
  grd.addColorStop(0.5, '#363636');
  grd.addColorStop(1,   '#252525');
  ctx.fillStyle = grd;
  ctx.fillRect(roadLeft, 0, roadW, H);

  // Kerbs (red-white strips on edges)
  const kerbW = 8;
  const kerbH = 30;
  const kerbOff = scrollY % (kerbH * 2);
  for (let ky = -kerbOff; ky < H; ky += kerbH * 2) {
    ctx.fillStyle = '#dd2222';
    ctx.fillRect(roadLeft,       ky,          kerbW, kerbH);
    ctx.fillRect(roadRight - kerbW, ky,        kerbW, kerbH);
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(roadLeft,       ky + kerbH,  kerbW, kerbH);
    ctx.fillRect(roadRight - kerbW, ky + kerbH, kerbW, kerbH);
  }

  // White edge lines
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(roadLeft,       0); ctx.lineTo(roadLeft,       H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(roadRight,      0); ctx.lineTo(roadRight,      H); ctx.stroke();

  // Dashed lane markings
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([28, 20]);
  ctx.lineDashOffset = -(scrollY % 48);
  for (let i = 1; i < LANES; i++) {
    const lx = roadLeft + laneW * i;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

// ─── Finish Line ──────────────────────────────────────────────
function drawFinishLine() {
  // The finish line lives at a fixed world distance (goalDistance).
  // We convert that to a screen Y the same way road markings scroll:
  // as distanceTravelled increases, the finish line approaches from the top.
  // Player is drawn at player.y; every pixel of scrollY == 1 unit of distance.
  // Screen Y of finish = player.y - (remaining distance in px)
  // We use the same 1px-per-unit relationship as scrollY.
  const remaining = goalDistance - distanceTravelled;
  const fy = player.y - remaining;

  // Only draw when it's within a generous window around the screen
  if (fy > H + 40 || fy < -40) return;

  const roadW  = roadRight - roadLeft;
  const sqSize = 14;
  const rows   = 2;
  const cols   = Math.floor(roadW / sqSize);

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#111' : '#fff';
      ctx.fillRect(roadLeft + col * sqSize, fy + row * sqSize, sqSize, sqSize);
    }
  }

  ctx.save();
  ctx.fillStyle = '#ffe000';
  ctx.font = `bold ${Math.round(laneW * 0.45)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  ctx.fillText('🏁 FINISH 🏁', W / 2, fy);
  ctx.restore();
}

// ─── Progress Bar ─────────────────────────────────────────────
function drawGoalProgress() {
  const barH = 10;
  const barY = 140;  // below the bigger HUD
  const frac = Math.min(distanceTravelled / goalDistance, 1);
  const barW = roadRight - roadLeft;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(roadLeft, barY, barW, barH, 4); ctx.fill();

  const fillGrd = ctx.createLinearGradient(roadLeft, 0, roadRight, 0);
  fillGrd.addColorStop(0, '#4af'); fillGrd.addColorStop(1, '#ffe000');
  ctx.fillStyle = fillGrd;
  roundRect(roadLeft, barY, barW * frac, barH, 4); ctx.fill();

  ctx.font = '18px sans-serif'; ctx.fillText('🏁', roadRight - 22, barY + 15);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ─── Car Shadows ──────────────────────────────────────────────
function drawCarShadows() {
  trafficCars.forEach(t => drawShadow(t.x, t.y, t.w, t.h));
  drawShadow(player.x, player.y, player.w, player.h);
}
function drawShadow(x, y, w, h) {
  ctx.save();
  ctx.translate(x + w * 0.25, y + h * 0.18);
  ctx.scale(1, 0.35);
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.7);
  grd.addColorStop(0,   'rgba(0,0,0,0.45)');
  grd.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.7, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── Draw Car ─────────────────────────────────────────────────
function shadeColor(col, amt) {
  const r = clamp(parseInt(col.slice(1,3),16) + amt, 0, 255);
  const g = clamp(parseInt(col.slice(3,5),16) + amt, 0, 255);
  const b = clamp(parseInt(col.slice(5,7),16) + amt, 0, 255);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function drawTrafficCars() {
  trafficCars.forEach(t => {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.PI); // traffic drives downward — front faces down = rotate 180°
    drawCarShape(ctx, 0, 0, t.w, t.h, t.color, shadeColor(t.color, -50), t.shape, false, null, 0);
    ctx.restore();
  });
}
function drawPlayerCar() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(Math.PI); // front faces up (direction of travel)
  drawCarShape(ctx, 0, 0, player.w, player.h,
    player.bodyColor, player.roofColor, player.shape, true, powerupsActive, frameCount);
  ctx.restore();
}

// ─── Universal Car Shape Renderer ─────────────────────────────
// ctx: canvas context (main or preview)
// isPlayer: enables shield/streaks, spoiler
// powerup: current powerup state (or null)
// fc: frameCount for animated shield
function drawCarShape(c, x, y, w, h, bodyColor, roofColor, shape, isPlayer, powerup, fc) {
  const hw = w / 2, hh = h / 2;
  c.save();
  c.translate(x, y);

  switch (shape) {
    case 'formula': _drawFormula(c, hw, hh, w, h, bodyColor, roofColor); break;
    case 'van':     _drawVan    (c, hw, hh, w, h, bodyColor, roofColor); break;
    case 'truck':   _drawTruck  (c, hw, hh, w, h, bodyColor, roofColor); break;
    case 'suv':     _drawSUV    (c, hw, hh, w, h, bodyColor, roofColor); break;
    case 'sedan':
    default:        _drawSedan  (c, hw, hh, w, h, bodyColor, roofColor); break;
  }

  // Wheels (all shapes)
  _drawWheels(c, hw, hh, h);

  // Player-only effects
  if (isPlayer && powerup?.invincible) {
    c.strokeStyle = `hsla(${fc * 4 % 360}, 100%, 70%, 0.8)`;
    c.lineWidth   = 4;
    c.beginPath(); c.ellipse(0, 0, hw + 12, hh + 12, 0, 0, Math.PI * 2); c.stroke();
  }

  // Speed streaks behind car (hh = bottom in local coords = back of car after 180° rotation)
  if (isPlayer && powerup?.speed) {
    c.strokeStyle = 'rgba(100,200,255,0.6)';
    c.lineWidth   = 2.5;
    c.setLineDash([8, 5]);
    for (let i = 1; i <= 4; i++) {
      c.beginPath();
      c.moveTo(-hw * 0.45, -hh - i * 12);   // behind car = negative y in rotated space
      c.lineTo( hw * 0.45, -hh - i * 12);
      c.stroke();
    }
    c.setLineDash([]);
  }

  // Spoiler for player sports/sedan
  if (isPlayer && (shape === 'sports' || shape === 'sedan')) {
    c.fillStyle = roofColor;
    c.fillRect(-hw * 0.5, hh - 5, w * 0.55, 5);
    c.fillRect(-hw * 0.5, hh - 10, 4, 5);
    c.fillRect( hw * 0.05, hh - 10, 4, 5);
  }

  c.restore();
}

function _drawSedan(c, hw, hh, w, h, body, roof) {
  // Body
  const grd = c.createLinearGradient(-hw, 0, hw, 0);
  grd.addColorStop(0,   shadeColor(body, -30));
  grd.addColorStop(0.5, body);
  grd.addColorStop(1,   shadeColor(body, -30));
  c.fillStyle = grd;
  c.beginPath();
  c.moveTo(-hw + 4, hh);   c.lineTo(hw - 4, hh);
  c.arcTo(hw,  hh, hw, -hh, 5);
  c.lineTo(hw, -hh + h * 0.28);  c.lineTo(hw * 0.72, -hh);
  c.lineTo(-hw * 0.72, -hh);     c.lineTo(-hw, -hh + h * 0.28);
  c.arcTo(-hw, hh, -hw + 4, hh, 5); c.closePath(); c.fill();
  // Windshield
  c.fillStyle = 'rgba(140,200,255,0.65)';
  c.beginPath();
  c.moveTo(-hw * 0.62, -hh + h * 0.28); c.lineTo(hw * 0.62, -hh + h * 0.28);
  c.lineTo(hw * 0.54, -hh + h * 0.07);  c.lineTo(-hw * 0.54, -hh + h * 0.07);
  c.closePath(); c.fill();
  // Roof
  c.fillStyle = roof;
  c.beginPath();
  c.moveTo(-hw * 0.54, -hh + h * 0.07); c.lineTo(hw * 0.54, -hh + h * 0.07);
  c.lineTo(hw * 0.54, -hh + h * 0.56);  c.lineTo(-hw * 0.54, -hh + h * 0.56);
  c.closePath(); c.fill();
  // Rear window
  c.fillStyle = 'rgba(140,200,255,0.5)';
  c.beginPath();
  c.moveTo(-hw * 0.54, -hh + h * 0.56); c.lineTo(hw * 0.54, -hh + h * 0.56);
  c.lineTo(hw * 0.64, -hh + h * 0.76);  c.lineTo(-hw * 0.64, -hh + h * 0.76);
  c.closePath(); c.fill();
}

function _drawFormula(c, hw, hh, w, h, body, roof) {
  // Low wide body
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(-hw, hh * 0.4);  c.lineTo(hw, hh * 0.4);
  c.lineTo(hw * 0.6, -hh);  c.lineTo(-hw * 0.6, -hh);
  c.closePath(); c.fill();
  // Cockpit bubble
  c.fillStyle = roof;
  c.beginPath(); c.ellipse(0, -h * 0.1, hw * 0.35, hh * 0.5, 0, 0, Math.PI * 2); c.fill();
  // Cockpit glass
  c.fillStyle = 'rgba(140,200,255,0.7)';
  c.beginPath(); c.ellipse(0, -h * 0.12, hw * 0.25, hh * 0.32, 0, 0, Math.PI * 2); c.fill();
  // Side pods
  c.fillStyle = shadeColor(body, -20);
  c.fillRect(-hw, -hh * 0.1, hw * 0.4, hh * 0.5);
  c.fillRect( hw * 0.6, -hh * 0.1, hw * 0.4, hh * 0.5);
  // Front wing
  c.fillStyle = shadeColor(body, -40);
  c.fillRect(-hw, -hh + h * 0.05, w, h * 0.06);
  // Rear wing
  c.fillRect(-hw * 0.8, hh - h * 0.1, w * 0.7, h * 0.05);
}

function _drawSUV(c, hw, hh, w, h, body, roof) {
  // Boxy body
  const grd = c.createLinearGradient(-hw, 0, hw, 0);
  grd.addColorStop(0,   shadeColor(body, -25));
  grd.addColorStop(0.5, body);
  grd.addColorStop(1,   shadeColor(body, -25));
  c.fillStyle = grd;
  c.beginPath();
  c.moveTo(-hw + 4, hh); c.lineTo(hw - 4, hh);
  c.arcTo(hw, hh, hw, -hh, 6);
  c.lineTo(hw, -hh + h * 0.18);  c.lineTo(hw * 0.9, -hh);
  c.lineTo(-hw * 0.9, -hh);      c.lineTo(-hw, -hh + h * 0.18);
  c.arcTo(-hw, hh, -hw + 4, hh, 6); c.closePath(); c.fill();
  // Tall roof (box cabin)
  c.fillStyle = roof;
  c.fillRect(-hw * 0.85, -hh, w * 0.85, h * 0.65);
  // Windshield
  c.fillStyle = 'rgba(140,200,255,0.6)';
  c.fillRect(-hw * 0.75, -hh + h * 0.02, w * 0.75, h * 0.15);
  // Rear window
  c.fillStyle = 'rgba(140,200,255,0.5)';
  c.fillRect(-hw * 0.75, -hh + h * 0.5, w * 0.75, h * 0.12);
}

function _drawVan(c, hw, hh, w, h, body, roof) {
  // Tall boxy
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(-hw + 3, hh); c.lineTo(hw - 3, hh);
  c.arcTo(hw, hh, hw, -hh, 4);
  c.lineTo(hw, -hh + h * 0.1); c.lineTo(hw * 0.75, -hh);
  c.lineTo(-hw + 4, -hh); c.arcTo(-hw, -hh, -hw, hh, 4);
  c.arcTo(-hw, hh, -hw + 3, hh, 4); c.closePath(); c.fill();
  // Cab roof
  c.fillStyle = roof;
  c.fillRect(-hw + 4, -hh, w * 0.6, h * 0.3);
  // Small windshield
  c.fillStyle = 'rgba(140,200,255,0.6)';
  c.fillRect(-hw * 0.55, -hh + h * 0.02, hw * 1.1, h * 0.12);
  // Side windows
  c.fillStyle = 'rgba(140,200,255,0.35)';
  c.fillRect(-hw + 4, -hh + h * 0.35, hw * 0.85, h * 0.2);
  c.fillRect( hw * 0.1, -hh + h * 0.35, hw * 0.85, h * 0.2);
  // Rear doors
  c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, -hh + h * 0.35); c.lineTo(0, hh - h * 0.1); c.stroke();
}

function _drawTruck(c, hw, hh, w, h, body, roof) {
  // Cab (top portion)
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(-hw + 3, -hh + h * 0.4); c.lineTo(hw - 3, -hh + h * 0.4);
  c.arcTo(hw, -hh + h * 0.4, hw, -hh, 4);
  c.lineTo(hw, -hh + h * 0.1); c.lineTo(hw * 0.8, -hh);
  c.lineTo(-hw * 0.8, -hh); c.lineTo(-hw, -hh + h * 0.1);
  c.arcTo(-hw, -hh + h * 0.4, -hw + 3, -hh + h * 0.4, 4); c.closePath(); c.fill();
  // Cab roof
  c.fillStyle = roof;
  c.fillRect(-hw * 0.78, -hh, w * 0.78, h * 0.28);
  // Windshield
  c.fillStyle = 'rgba(140,200,255,0.65)';
  c.fillRect(-hw * 0.65, -hh + h * 0.02, w * 0.65, h * 0.13);
  // Cargo bed (bottom portion)
  c.fillStyle = shadeColor(body, -30);
  c.fillRect(-hw + 3, -hh + h * 0.42, w - 6, h * 0.55);
  // Cargo detail lines
  c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
  for (let li = 0; li < 3; li++) {
    const ly = -hh + h * 0.48 + li * (h * 0.14);
    c.beginPath(); c.moveTo(-hw + 5, ly); c.lineTo(hw - 5, ly); c.stroke();
  }
}

function _drawWheels(c, hw, hh, h) {
  const wps = [
    [-hw - 2, -hh + h * 0.2],
    [ hw + 2, -hh + h * 0.2],
    [-hw - 2,  hh - h * 0.2],
    [ hw + 2,  hh - h * 0.2],
  ];
  wps.forEach(([wx, wy]) => {
    c.fillStyle = '#111';
    c.beginPath(); c.ellipse(wx, wy, 7, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#444';
    c.beginPath(); c.ellipse(wx, wy, 4, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#888';
    c.beginPath(); c.ellipse(wx, wy, 1.5, 2.5, 0, 0, Math.PI * 2); c.fill();
  });
}

// ─── Powerup Items ────────────────────────────────────────────
function drawPowerups() {
  powerups.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, p.w);
    const fontSize = `${Math.round(p.w * 1.5)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (p.type === 'speed') {
      grd.addColorStop(0, 'rgba(100,180,255,0.9)');
      grd.addColorStop(1, 'rgba(50,100,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, p.w, 0, Math.PI * 2); ctx.fill();
      ctx.font = fontSize;
      ctx.fillText('⚡', 0, 2);
    } else if (p.type === 'invincible') {
      grd.addColorStop(0, 'rgba(255,230,50,0.9)');
      grd.addColorStop(1, 'rgba(255,150,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, p.w, 0, Math.PI * 2); ctx.fill();
      ctx.font = fontSize;
      ctx.fillText('🛡️', 0, 2);
    } else {
      // x2 points
      grd.addColorStop(0, 'rgba(240,80,255,0.9)');
      grd.addColorStop(1, 'rgba(120,0,200,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, p.w, 0, Math.PI * 2); ctx.fill();
      ctx.font = `bold ${Math.round(p.w * 1.3)}px Arial`;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#f0f'; ctx.shadowBlur = 8;
      ctx.fillText('×2', 0, 2);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  });
}

// ─── Particles ────────────────────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════════
//  WIN / LOSS
// ═══════════════════════════════════════════════════════════════
function loseLife(msg) {
  // gameRunning already set false by caller in collision; set here for timer path
  gameRunning = false;
  lives--;
  updateLivesDisplay();

  document.getElementById('gameover-score').textContent = score;

  if (lives <= 0) {
    document.getElementById('gameover-title').textContent = '💀 אין יותר חיים!';
    document.getElementById('gameover-msg').textContent   = msg;
    document.getElementById('gameover-buttons').innerHTML =
      '<button class="btn-menu" onclick="goMenu()">🏠 תפריט</button>';
  } else {
    document.getElementById('gameover-title').textContent = '💥 התנגשת!';
    document.getElementById('gameover-msg').textContent   = msg + `\nנשארו לך ${lives} ❤️`;
    document.getElementById('gameover-buttons').innerHTML =
      '<button class="btn-start" onclick="restartLevel()">🔄 נסה שוב</button>' +
      '<button class="btn-menu" onclick="goMenu()">🏠 תפריט</button>';
  }
  showScreen('gameover-screen');
}

function triggerWin() {
  const bonus = timerSec * 5;
  const total = score + bonus;

  saveScore(driverName, total, currentLevel + 1);

  document.getElementById('final-score').textContent = total;
  const msgs = [
    'פנטסטי! עברת את השלב! 🌟',
    'מדהים! אתה נהג מעולה! 🏆',
    'וואו! הגעת לקו הסיום! 🎉',
    'יופי! המשך כך! ⭐',
    'מהיר כברק! 💨',
    'אלוף אמיתי! 🥇',
  ];
  document.getElementById('win-msg').textContent = msgs[currentLevel % msgs.length];
  score = total;

  // Confetti
  const bg = document.getElementById('celebration-bg');
  bg.innerHTML = '';
  const cols = ['#ffe000','#ff4444','#44ff88','#4488ff','#ff88ff','#ffaa00'];
  for (let i = 0; i < 70; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `left:${rand(0,100)}%;background:${cols[randInt(0,cols.length-1)]};width:${randInt(8,16)}px;height:${randInt(10,20)}px;animation-duration:${rand(1.5,3.5)}s;animation-delay:${rand(0,1.2)}s;`;
    bg.appendChild(el);
  }
  document.getElementById('crowd').textContent = '🧑‍🤝‍🧑👏🎉🎊👏🧑‍🤝‍🧑🎊🎉👏🧑‍🤝‍🧑';
  document.getElementById('win-buttons').innerHTML =
      '<button class="btn-start" onclick="nextLevel()">➡️ שלב הבא</button>' +
    '<button class="btn-menu"  onclick="goMenu()">🏠 תפריט</button>';

  showScreen('win-screen');
}

function nextLevel() {
  currentLevel++;
  initLevel(currentLevel);
  showScreen('game-screen');
}

function restartLevel() {
  initLevel(currentLevel);
  showScreen('game-screen');
}

// ═══════════════════════════════════════════════════════════════
//  HIGH SCORES
// ═══════════════════════════════════════════════════════════════
function loadScores() {
  try {
    return JSON.parse(localStorage.getItem('racingScores') || '[]');
  } catch { return []; }
}

function saveScore(name, pts, level) {
  const scores = loadScores();
  scores.push({ name, pts, level, date: new Date().toLocaleDateString('he-IL') });
  scores.sort((a, b) => b.pts - a.pts);
  scores.splice(MAX_SCORES);
  localStorage.setItem('racingScores', JSON.stringify(scores));
}

function renderHighScores() {
  const list   = document.getElementById('highscore-list');
  const scores = loadScores();
  if (!list) return;
  if (scores.length === 0) {
    list.innerHTML = '<li style="color:#aaa;justify-content:center">אין שיאים עדיין</li>';
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  list.innerHTML = scores.map((s, i) =>
    `<li>
       <span class="hs-rank">${medals[i] || (i + 1) + '.'}</span>
       <span style="flex:1;padding:0 8px">${s.name} — שלב ${s.level}</span>
       <span class="hs-score">${s.pts}</span>
     </li>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
//  MUSIC — MP4 audio track
// ═══════════════════════════════════════════════════════════════
const bgMusic = new Audio('8bit race.mp4');
bgMusic.loop   = true;
bgMusic.volume = 0.55;

function startMusic() {
  if (!bgMusic.paused) return;
  const p = bgMusic.play();
  if (p !== undefined) p.catch(() => {});
}

function stopMusic() {
  bgMusic.pause();
  bgMusic.currentTime = 0;
}

// Every user interaction attempts to start music until it succeeds
function _musicUnlock() {
  if (!bgMusic.paused) return;          // already playing — keep listener but do nothing
  bgMusic.play().then(() => {
    // Successfully started — remove all unlock listeners
    ['pointerdown','click','touchstart','keydown'].forEach(ev =>
      document.removeEventListener(ev, _musicUnlock, true)
    );
  }).catch(() => {});                   // blocked — will retry on next gesture
}

['pointerdown','click','touchstart','keydown'].forEach(ev =>
  document.addEventListener(ev, _musicUnlock, { capture: true, passive: true })
);

// Also try immediately (works in browsers that allow autoplay)
startMusic();

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
resize();
renderHighScores();
renderCarPreviews();
showScreen('menu-screen');
