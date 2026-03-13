/*
 * ════════════════════════════════════════════════════════════
 *  מלך המגדלים — game.js
 *  Inspired by classic tower-drop games (iamkun/tower_game)
 *
 *  GAMEPLAY:
 *   - A colourful block swings/slides back and forth above the tower.
 *   - Player taps/clicks to drop it.
 *   - Landing on the tower adds a floor and scores points.
 *   - Perfect centering = bonus + combo streak.
 *   - Miss (block falls off) = lose a life.
 *   - All lives gone = game over.
 *
 *  SECTIONS:
 *   1.  Constants & Config
 *   2.  Storage
 *   3.  Game State  (GS)
 *   4.  Audio  (SoundFX + BgMusic)
 *   5.  Challenge Level Definitions
 *   6.  Block Colours
 *   7.  Core Physics — swing, drop, land, miss
 *   8.  Scoring
 *   9.  Rendering  (Canvas)
 *  10.  Particles & Effects
 *  11.  Game Flow  (start, pause, end, win)
 *  12.  HUD / UI Updates
 *  13.  Input Handling
 *  14.  Menu Wiring
 *  15.  Main Loop
 *  16.  Boot / Init
 * ════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

// ── Difficulty tuning ──────────────────────────────────────
// Edit these values to adjust feel for each difficulty level.
const DIFF_CFG = {
  easy: {
    swingSpeed:   1.4,    // pixels per frame the block moves sideways
    perfectZone:  0.28,   // fraction of block width counted as "perfect"
    lives:        4,      // starting hearts
    scoreSuccess: 20,     // points for a normal successful landing
    scorePerfect: 50,     // points for a perfect landing (before streak)
    label:        'קל',
  },
  normal: {
    swingSpeed:   2.2,
    perfectZone:  0.20,
    lives:        3,
    scoreSuccess: 25,
    scorePerfect: 50,
    label:        'רגיל',
  },
  hard: {
    swingSpeed:   3.4,
    perfectZone:  0.12,
    lives:        3,
    scoreSuccess: 30,
    scorePerfect: 50,
    label:        'קשה',
  },
};

// Speed ramps up as the tower grows
const SPEED_RAMP_PER_FLOOR = 0.025;
const MAX_SPEED_MULT        = 2.8;

// Block dimensions (fraction of canvas)
const BLOCK_W_FRAC = 0.36;
const BLOCK_H_FRAC = 0.072;

// Minimum block width before game ends (tower too thin)
const MIN_BLOCK_W_PX = 18;

// Trim imperfect landings (narrow/hard modes)
const TRIM_ON_IMPERFECT = true;

// ── Combo messages ─────────────────────────────────────────
const COMBO_MSGS = [
  { at: 2,  text: 'קומבו! x2 🔥' },
  { at: 4,  text: 'מדהים! x4 🌟' },
  { at: 6,  text: 'בלתי נתפס! x6 💥' },
  { at: 10, text: 'מלך המגדלים! 👑' },
];

// ════════════════════════════════════════════════════════════
// 2. STORAGE
// ════════════════════════════════════════════════════════════

const STORAGE_KEY = 'kingTower_v1';

function loadStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; }
}
function saveStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}
function getBestScore(mode, diff) {
  var s = loadStorage();
  return (s.bests && s.bests[mode] && s.bests[mode][diff]) || 0;
}
function setBestScore(mode, diff, score) {
  var s = loadStorage();
  if (!s.bests) s.bests = {};
  if (!s.bests[mode]) s.bests[mode] = {};
  if (score > (s.bests[mode][diff] || 0)) { s.bests[mode][diff] = score; saveStorage(s); return true; }
  return false;
}
function getChallengeProgress() {
  return loadStorage().challengeProgress || 0;
}
function setChallengeProgress(lvl) {
  var s = loadStorage();
  s.challengeProgress = Math.max(s.challengeProgress || 0, lvl);
  saveStorage(s);
}
function getSavedDiff() { return loadStorage().diff || 'normal'; }
function saveDiff(diff) { var s = loadStorage(); s.diff = diff; saveStorage(s); }

// ════════════════════════════════════════════════════════════
// 3. GAME STATE  (GS)
// ════════════════════════════════════════════════════════════

const GS = {
  mode: 'tower',
  diff: 'normal',
  soundOn: true,

  running:  false,
  paused:   false,
  dropping: false,

  // Canvas (set by initCanvas / resizeCanvas)
  canvasW: 360,
  canvasH: 600,

  // Swing state
  blockX:   0,      // left edge of active block (canvas X, not affected by camera)
  swingDir: 1,

  // Drop
  dropY:  0,        // top-edge Y of falling block in WORLD coords
  dropVY: 0,

  // Block dimensions (px)
  blockW: 120,
  blockH: 40,

  blockColor: '#60a5fa',
  nextColor:  '#f87171',

  // Scoring
  score: 0,
  lives: 3,
  floor: 0,   // floors successfully placed
  combo: 0,

  // Challenge
  challengeLevel: 0,

  // Particles
  particles: [],

  // WORLD coordinate system:
  //   worldY=0 is the top of the ground (base of tower).
  //   Each floor occupies blockH pixels upward.
  //   floor[i].worldY = i * blockH  (bottom of that floor from ground)
  //   cameraY = world Y that maps to the BOTTOM of the canvas.

  // floors[] stores WORLD positions so they don't drift with camera
  floors: [],   // { x, w, worldY, color }
                //   x,w  — horizontal (no camera, canvas coords)
                //   worldY — bottom of this floor, measured UP from ground (0 = ground level)

  // Camera: how many world pixels to shift up
  cameraY: 0,           // world Y at canvas bottom (starts 0)
  targetCameraY: 0,

  loopId: null,
};

function resetRuntime() {
  GS.running  = false;
  GS.paused   = false;
  GS.dropping = false;
  GS.score    = 0;
  GS.floor    = 0;
  GS.combo    = 0;
  GS.floors   = [];
  GS.particles= [];
  GS.cameraY        = 0;
  GS.targetCameraY  = 0;
  if (GS.loopId) { cancelAnimationFrame(GS.loopId); GS.loopId = null; }
}

// World → canvas Y conversion
// worldY=0 is ground; canvas Y = canvasH - (worldY - cameraY)
function toCanvasY(worldY) {
  return GS.canvasH - (worldY - GS.cameraY);
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let actx = null, unlocked = false;
  function getCtx() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
    return actx;
  }
  function unlock() {
    if (unlocked) return;
    var c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
    document.getElementById('audio-banner').style.display = 'none';
    BgMusic.play();
  }
  function beep(freq, dur, type, vol) {
    if (!GS.soundOn) return;
    var c = getCtx(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(vol || 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    } catch(e) {}
  }
  return {
    unlock,
    land()    { beep(480, 0.08, 'sine', 0.18); },
    perfect() { beep(660,0.08,'sine',0.16); setTimeout(function(){ beep(880,0.1,'sine',0.14); },70); },
    combo()   { [660,784,880,1047].forEach(function(f,i){ setTimeout(function(){ beep(f,0.08,'sine',0.14); },i*55); }); },
    miss()    { beep(220, 0.2, 'sawtooth', 0.10); },
    gameover(){ beep(180, 0.5, 'sawtooth', 0.12); },
    win()     { [523,659,784,1047,1319].forEach(function(f,i){ setTimeout(function(){ beep(f,0.12,'sine',0.15); },i*100); }); },
  };
})();

const BgMusic = (() => {
  const aud = new Audio('assets/TowerMusic.mp3');
  aud.loop   = true;
  aud.volume = 0.35;
  return {
    play()     { if (GS.soundOn) aud.play().catch(function(){}); },
    stop()     { aud.pause(); aud.currentTime = 0; },
    pause()    { aud.pause(); },
    resume()   { if (GS.soundOn) aud.play().catch(function(){}); },
    toggle(on) { on ? this.resume() : this.pause(); },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. CHALLENGE LEVEL DEFINITIONS
// ════════════════════════════════════════════════════════════

const CHALLENGE_LEVELS = [
  { label: 'שלב 1', type: 'floors',   target: 5,   desc: 'הגע ל-5 קומות'                              },
  { label: 'שלב 2', type: 'floors',   target: 8,   desc: 'הגע ל-8 קומות'                              },
  { label: 'שלב 3', type: 'perfects', target: 2,   desc: 'בצע 2 נחיתות מושלמות'                       },
  { label: 'שלב 4', type: 'score',    target: 300, desc: 'הגע ל-300 ניקוד'                             },
  { label: 'שלב 5', type: 'survive',  target: 10,  maxLost: 1, desc: 'הגע ל-10 קומות, אבד לב אחד לכל היותר' },
  { label: 'שלב 6', type: 'perfects', target: 4,   desc: 'בצע 4 נחיתות מושלמות'                       },
  { label: 'שלב 7', type: 'floors',   target: 15,  desc: 'הגע ל-15 קומות'                             },
  { label: 'שלב 8', type: 'score',    target: 600, desc: 'הגע ל-600 ניקוד'                             },
];

var perfectsThisGame = 0;

// ════════════════════════════════════════════════════════════
// 6. BLOCK COLOURS
// ════════════════════════════════════════════════════════════

const BLOCK_COLORS = [
  '#60a5fa', '#f87171', '#4ade80', '#facc15',
  '#c084fc', '#fb923c', '#34d399', '#f472b6',
];
var colorIdx = 0;
function nextBlockColor() {
  colorIdx = (colorIdx + 1) % BLOCK_COLORS.length;
  return BLOCK_COLORS[colorIdx];
}

// ════════════════════════════════════════════════════════════
// 7. CORE PHYSICS — swing, drop, land, miss
// ════════════════════════════════════════════════════════════

// Tower top in WORLD coords (worldY measured up from ground)
function getTowerTopWorld() {
  return GS.floor * GS.blockH;
}

// Spawn a new block ready to swing
function initBlock() {
  GS.dropping  = false;
  GS.dropVY    = 0;
  GS.blockColor = GS.nextColor || BLOCK_COLORS[0];
  GS.nextColor  = nextBlockColor();
  GS.blockX     = GS.canvasW * 0.08;   // start near left edge
  GS.swingDir   = 1;

  // dropY starts above the tower top (in world coords, upward from ground)
  GS.dropY = getTowerTopWorld() + GS.blockH + 60;
}

// Update swing left/right
function updateSwing() {
  var cfg    = DIFF_CFG[GS.diff];
  var speed  = cfg.swingSpeed * getSpeedMult();
  var leftB  = 0;
  var rightB = GS.canvasW - GS.blockW;

  GS.blockX += speed * GS.swingDir;
  if (GS.blockX >= rightB) { GS.blockX = rightB; GS.swingDir = -1; }
  if (GS.blockX <= leftB)  { GS.blockX = leftB;  GS.swingDir =  1; }
}

function getSpeedMult() {
  return Math.min(MAX_SPEED_MULT, 1 + GS.floor * SPEED_RAMP_PER_FLOOR);
}

// Apply gravity while block is falling
function updateDrop() {
  GS.dropVY += 0.55;
  GS.dropVY  = Math.min(GS.dropVY, 22);
  GS.dropY  -= GS.dropVY;   // world Y decreases as block falls downward

  // Has the block's bottom reached the tower top?
  var towerTopWorld = getTowerTopWorld();
  if (GS.dropY <= towerTopWorld) {
    landBlock();
  }
}

// Land the block onto the tower
function landBlock() {
  var blockCX = GS.blockX + GS.blockW / 2;

  // Tower top surface width/centre
  var towerCX, towerW;
  if (GS.floors.length === 0) {
    towerCX = GS.canvasW / 2;
    towerW  = GS.canvasW;
  } else {
    var top = GS.floors[GS.floors.length - 1];
    towerCX = top.x + top.w / 2;
    towerW  = top.w;
  }

  // Overlap
  var blockL   = GS.blockX;
  var blockR   = GS.blockX + GS.blockW;
  var towerL   = towerCX - towerW / 2;
  var towerR   = towerCX + towerW / 2;
  var overlapL = Math.max(blockL, towerL);
  var overlapR = Math.min(blockR, towerR);
  var overlap  = overlapR - overlapL;

  if (overlap <= 4) {
    missBlock();
    return;
  }

  // New floor x/w
  var newW, newX;
  if (GS.mode === 'free') {
    // Free mode: no trimming — keep full block width
    newW = GS.blockW;
    newX = Math.max(0, Math.min(GS.canvasW - newW, blockCX - newW / 2));
  } else {
    newW = overlap;
    newX = overlapL;
  }

  // Perfect check
  var offset    = Math.abs(blockCX - towerCX);
  var cfg       = DIFF_CFG[GS.diff];
  var isPerfect = offset < GS.blockW * cfg.perfectZone;

  // Store floor in WORLD coords
  var floorWorldY = getTowerTopWorld(); // bottom of new floor = current tower top
  GS.floors.push({ x: newX, w: newW, worldY: floorWorldY, color: GS.blockColor });
  GS.floor++;

  // Scoring + effects
  scoreBlock(isPerfect, offset, towerW);
  var floorMidWorld = floorWorldY + GS.blockH / 2;
  spawnParticles(blockCX, toCanvasY(floorMidWorld), GS.blockColor, isPerfect ? 14 : 8);
  if (isPerfect) { if (GS.combo > 1) SoundFX.combo(); else SoundFX.perfect(); }
  else SoundFX.land();

  // Camera: keep tower top in upper portion of screen
  updateCamera();

  // Trim block width for next placement
  if (GS.mode !== 'free' && !isPerfect && TRIM_ON_IMPERFECT && GS.diff !== 'easy') {
    GS.blockW = Math.max(newW, MIN_BLOCK_W_PX);
    if (GS.blockW <= MIN_BLOCK_W_PX) { endGame(); return; }
  } else if (isPerfect) {
    // Reward: restore some width
    GS.blockW = Math.min(GS.blockW + Math.round(GS.blockH * 0.5), Math.round(GS.canvasW * BLOCK_W_FRAC));
  }

  if (isPerfect) perfectsThisGame++;
  if (GS.mode === 'challenge') checkChallengeGoal();
  if (!GS.running) return;

  initBlock();
  updateHUD();
}

// Miss: block fell off the tower
function missBlock() {
  GS.lives--;
  GS.combo = 0;
  SoundFX.miss();
  showFloatMsg('אוי! -לב 💔');
  spawnParticles(GS.blockX + GS.blockW / 2, GS.canvasH * 0.5, '#f87171', 10);
  updateHUD();

  if (GS.lives <= 0) { endGame(); return; }
  initBlock();
}

// ════════════════════════════════════════════════════════════
// 8. SCORING
// ════════════════════════════════════════════════════════════

function scoreBlock(isPerfect, offset, towerW) {
  var cfg = DIFF_CFG[GS.diff];
  var pts;

  if (isPerfect) {
    GS.combo++;
    pts = cfg.scorePerfect + (GS.combo - 1) * 25;
    var msg = '⭐ מושלם! +' + pts;
    for (var i = COMBO_MSGS.length - 1; i >= 0; i--) {
      if (GS.combo >= COMBO_MSGS[i].at) { msg = COMBO_MSGS[i].text + ' +' + pts; break; }
    }
    showFloatMsg(msg);
  } else {
    GS.combo = 0;
    pts = cfg.scoreSuccess;
    var closeness = towerW > 0 ? 1 - (offset / (towerW / 2)) : 0;
    if (closeness > 0.7) { pts += 10; showFloatMsg('יפה! +' + pts + ' 👍'); }
    else showFloatMsg('+' + pts);
  }

  GS.score += pts;
  updateScoreUI();
}

// ════════════════════════════════════════════════════════════
// 9. RENDERING  (Canvas)
// ════════════════════════════════════════════════════════════

var canvas, ctx;

function initCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');
  resizeCanvas();
}

function resizeCanvas() {
  if (!canvas) return;

  var hud  = document.getElementById('hud');
  var goal = document.getElementById('goal-bar');
  var hudH  = hud  ? hud.offsetHeight  : 52;
  var goalH = (goal && goal.style.display !== 'none') ? goal.offsetHeight : 0;

  canvas.width  = window.innerWidth;
  canvas.height = Math.max(200, window.innerHeight - hudH - goalH);
  GS.canvasW    = canvas.width;
  GS.canvasH    = canvas.height;

  GS.blockW = Math.round(GS.canvasW * BLOCK_W_FRAC);
  GS.blockH = Math.max(22, Math.round(GS.canvasH * BLOCK_H_FRAC));
}

// ── Camera ────────────────────────────────────────────────
function updateCamera() {
  // Keep tower top at ~30% from canvas top
  var towerTopWorld  = getTowerTopWorld();
  var desiredCanvasY = GS.canvasH * 0.30;
  // toCanvasY(towerTopWorld) = canvasH - (towerTopWorld - cameraY)
  // We want that = desiredCanvasY
  // So: cameraY = towerTopWorld - (canvasH - desiredCanvasY)
  GS.targetCameraY = Math.max(0, towerTopWorld - (GS.canvasH - desiredCanvasY));
}

function applyCamera() {
  GS.cameraY += (GS.targetCameraY - GS.cameraY) * 0.08;
}

// ── Render ────────────────────────────────────────────────
function renderFrame() {
  if (!ctx) return;
  ctx.clearRect(0, 0, GS.canvasW, GS.canvasH);

  // Sky gradient
  var sky = ctx.createLinearGradient(0, 0, 0, GS.canvasH);
  sky.addColorStop(0, '#87ceeb');
  sky.addColorStop(1, '#3a8bc7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GS.canvasW, GS.canvasH);

  drawClouds();
  drawGround();

  for (var i = 0; i < GS.floors.length; i++) {
    drawFloor(GS.floors[i]);
  }

  if (GS.running) {
    drawActiveBlock();
    if (!GS.dropping) drawSwingIndicator();
  }

  updateAndDrawParticles();
}

// ── Ground ────────────────────────────────────────────────
function drawGround() {
  // groundSurface is world Y = 0
  var groundCanvasY = toCanvasY(0);  // canvas Y of ground top

  // Grass strip
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(0, groundCanvasY, GS.canvasW, 14);

  // Earth below
  ctx.fillStyle = '#166534';
  ctx.fillRect(0, groundCanvasY + 14, GS.canvasW, GS.canvasH - groundCanvasY - 14);
}

// ── Tower floors ───────────────────────────────────────────
function drawFloor(fl) {
  // fl.worldY = bottom of floor in world coords
  var botCanvas = toCanvasY(fl.worldY);          // canvas Y of floor bottom
  var topCanvas = toCanvasY(fl.worldY + GS.blockH); // canvas Y of floor top

  if (topCanvas > GS.canvasH || botCanvas < 0) return; // cull off-screen

  var x = fl.x, w = fl.w, h = GS.blockH;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  roundRect(ctx, x + 3, topCanvas + 3, w, h, 8); ctx.fill();
  ctx.restore();

  // Block body
  ctx.fillStyle = fl.color;
  roundRect(ctx, x, topCanvas, w, h, 8); ctx.fill();

  // Shine
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  roundRect(ctx, x + 4, topCanvas + 4, w - 8, h * 0.38, 5); ctx.fill();
  ctx.restore();

  // Edge stroke
  ctx.strokeStyle = darken(fl.color);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  roundRect(ctx, x, topCanvas, w, h, 8); ctx.stroke();
}

// ── Active (swinging / falling) block ─────────────────────
function drawActiveBlock() {
  var x = GS.blockX;
  var topCanvas;

  if (GS.dropping) {
    // dropY is the BOTTOM of the falling block in world coords (decreases as it falls)
    // Wait — dropY is top in world: decreasing means falling. Let's use top of block.
    topCanvas = toCanvasY(GS.dropY + GS.blockH);
  } else {
    // Swing: hover 55px canvas above tower top
    var towerTopCanvas = toCanvasY(getTowerTopWorld() + GS.blockH);
    topCanvas = towerTopCanvas - GS.blockH - 55;
  }

  var w = GS.blockW, h = GS.blockH;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  roundRect(ctx, x + 3, topCanvas + 3, w, h, 8); ctx.fill();
  ctx.restore();

  ctx.fillStyle = GS.blockColor;
  roundRect(ctx, x, topCanvas, w, h, 8); ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  roundRect(ctx, x + 4, topCanvas + 4, w - 8, h * 0.38, 5); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = darken(GS.blockColor);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  roundRect(ctx, x, topCanvas, w, h, 8); ctx.stroke();
}

// ── Swing indicator (downward arrow above block) ───────────
function drawSwingIndicator() {
  var towerTopCanvas = toCanvasY(getTowerTopWorld() + GS.blockH);
  var arrowY = towerTopCanvas - 12;
  var cx = GS.blockX + GS.blockW / 2;

  ctx.save();
  ctx.globalAlpha = 0.70;
  ctx.fillStyle   = '#ffe14d';
  ctx.beginPath();
  ctx.moveTo(cx,      arrowY);
  ctx.lineTo(cx - 9,  arrowY - 14);
  ctx.lineTo(cx + 9,  arrowY - 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Clouds ─────────────────────────────────────────────────
var clouds = null;
function initClouds() {
  clouds = [];
  for (var i = 0; i < 5; i++) {
    clouds.push({
      x:   Math.random() * 1.2,
      y:   0.05 + Math.random() * 0.30,
      r:   18 + Math.random() * 22,
      spd: 0.00008 + Math.random() * 0.00012,
    });
  }
}
function drawClouds() {
  if (!clouds) initClouds();
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle   = '#fff';
  for (var i = 0; i < clouds.length; i++) {
    var cl = clouds[i];
    cl.x = (cl.x + cl.spd) % 1.3;
    var cx = cl.x * GS.canvasW;
    var cy = cl.y * GS.canvasH;
    var r  = cl.r;
    ctx.beginPath();
    ctx.arc(cx,       cy,       r,        0, Math.PI * 2);
    ctx.arc(cx + r,   cy - r/3, r * 0.7,  0, Math.PI * 2);
    ctx.arc(cx - r,   cy - r/4, r * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Helpers ────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function darken(hex) {
  try {
    var n = parseInt(hex.replace('#',''), 16);
    var r = Math.max(0, ((n>>16)&255) - 40);
    var g = Math.max(0, ((n>>8) &255) - 40);
    var b = Math.max(0, ( n     &255) - 40);
    return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  } catch(e) { return '#000'; }
}

// ════════════════════════════════════════════════════════════
// 10. PARTICLES & EFFECTS
// ════════════════════════════════════════════════════════════

function spawnParticles(x, y, color, count) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 1.5 + Math.random() * 3.5;
    GS.particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      color: color,
      life: 1.0,
      r: 3 + Math.random() * 4,
    });
  }
}

function updateAndDrawParticles() {
  if (!ctx) return;
  GS.particles = GS.particles.filter(function(p){ return p.life > 0; });
  GS.particles.forEach(function(p) {
    p.x  += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.035;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

var floatTimer = null;
function showFloatMsg(text) {
  var el = document.getElementById('float-msg');
  if (!el) return;
  el.textContent     = text;
  el.style.display   = 'block';
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(floatTimer);
  floatTimer = setTimeout(function(){ el.style.display = 'none'; }, 1200);
}

// ════════════════════════════════════════════════════════════
// 11. GAME FLOW
// ════════════════════════════════════════════════════════════

function startGame() {
  // Must init canvas FIRST so dimensions are known
  initCanvas();
  resizeCanvas();

  resetRuntime();
  SoundFX.unlock();

  var cfg   = DIFF_CFG[GS.diff];
  GS.lives  = cfg.lives;
  // blockW/H already set by resizeCanvas above
  colorIdx        = 0;
  perfectsThisGame = 0;
  GS.blockColor   = BLOCK_COLORS[0];
  GS.nextColor    = BLOCK_COLORS[1];

  showScreen('screen-game');

  // Re-measure after screen is visible (layout may shift)
  requestAnimationFrame(function() {
    resizeCanvas();

    // Challenge goal bar
    if (GS.mode === 'challenge') {
      var lvlDef = CHALLENGE_LEVELS[GS.challengeLevel];
      if (lvlDef) {
        document.getElementById('goal-bar').style.display  = '';
        document.getElementById('goal-text').textContent   = lvlDef.desc;
        document.getElementById('goal-fill').style.width   = '0%';
        resizeCanvas(); // recalc with goal bar visible
      }
    } else {
      document.getElementById('goal-bar').style.display = 'none';
    }

    document.getElementById('hud-best').textContent = getBestScore(GS.mode, GS.diff);
    updateHUD();
    initBlock();

    GS.running = true;
    GS.loopId  = requestAnimationFrame(mainLoop);
  });
}

function pauseGame() {
  if (!GS.running) return;
  GS.paused = true;
  BgMusic.pause();
  document.getElementById('overlay-pause').style.display = 'flex';
}

function resumeGame() {
  GS.paused = false;
  BgMusic.resume();
  document.getElementById('overlay-pause').style.display = 'none';
}

function restartGame() {
  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';
  document.getElementById('overlay-win').style.display      = 'none';
  startGame();
}

function endGame() {
  GS.running = false;
  BgMusic.stop();
  SoundFX.gameover();

  var isNew = setBestScore(GS.mode, GS.diff, GS.score);
  var cfg   = DIFF_CFG[GS.diff];
  var msg   = GS.floor >= 15 ? 'מגדל ענק! 🏙️' :
              GS.floor >= 8  ? 'כל הכבוד! 🎉'  :
              GS.floor >= 4  ? 'יפה מאוד! 😊'  : 'נסה שוב — תוכל להצליח! 💪';

  document.getElementById('go-title').textContent = '💥 המשחק נגמר!';
  document.getElementById('go-msg').textContent   = msg;
  document.getElementById('go-stats').innerHTML   =
    'ניקוד: ' + GS.score + '<br>קומות: ' + GS.floor + '<br>רמה: ' + cfg.label;
  document.getElementById('go-best-badge').style.display    = isNew ? 'block' : 'none';
  document.getElementById('overlay-gameover').style.display = 'flex';
}

function checkChallengeGoal() {
  var lvl = CHALLENGE_LEVELS[GS.challengeLevel];
  if (!lvl) return;

  var progress = 0;
  if (lvl.type === 'floors')   { progress = GS.floor; }
  else if (lvl.type === 'perfects') { progress = perfectsThisGame; }
  else if (lvl.type === 'score')    { progress = GS.score; }
  else if (lvl.type === 'survive')  {
    progress = GS.floor;
    var lost = DIFF_CFG[GS.diff].lives - GS.lives;
    if (lost > (lvl.maxLost || 0)) { endGame(); return; }
  }

  var pct = Math.min(100, Math.round(progress / lvl.target * 100));
  document.getElementById('goal-fill').style.width = pct + '%';

  if (progress >= lvl.target) winChallenge();
}

function winChallenge() {
  GS.running = false;
  BgMusic.stop();
  SoundFX.win();

  var nextIdx = GS.challengeLevel + 1;
  setChallengeProgress(nextIdx);

  var stars = GS.score > 600 ? '⭐⭐⭐' : GS.score > 300 ? '⭐⭐' : '⭐';
  document.getElementById('win-stars').textContent = stars;
  document.getElementById('win-msg').textContent   = CHALLENGE_LEVELS[GS.challengeLevel].label + ' — הצלחת!';
  document.getElementById('win-stats').innerHTML   = 'ניקוד: ' + GS.score + '<br>קומות: ' + GS.floor;

  var nextBtn = document.getElementById('btn-next-level');
  if (nextIdx >= CHALLENGE_LEVELS.length) {
    nextBtn.textContent = '🏆 סיימת את כל השלבים!';
    nextBtn.onclick     = goToMenu;
  } else {
    nextBtn.textContent = '⏩ שלב הבא';
    nextBtn.onclick     = function() {
      GS.challengeLevel = nextIdx;
      document.getElementById('overlay-win').style.display = 'none';
      startGame();
    };
  }
  document.getElementById('overlay-win').style.display = 'flex';
}

function goToMenu() {
  GS.running = false;
  BgMusic.stop();
  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';
  document.getElementById('overlay-win').style.display      = 'none';
  showScreen('screen-menu');
  updateMenuDisplay();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// ════════════════════════════════════════════════════════════
// 12. HUD / UI UPDATES
// ════════════════════════════════════════════════════════════

function updateHUD() { updateScoreUI(); updateLivesUI(); }

function updateScoreUI() {
  var el = document.getElementById('hud-score');
  if (el) el.textContent = GS.score;
}

function updateLivesUI() {
  var hearts = '';
  for (var i = 0; i < GS.lives; i++)               hearts += '❤️';
  for (var j = GS.lives; j < DIFF_CFG[GS.diff].lives; j++) hearts += '🖤';
  var el = document.getElementById('hud-lives');
  if (el) el.textContent = hearts;
}

function updateMenuDisplay() {
  var bestRow = document.getElementById('best-row');
  if (!bestRow) return;
  var bestT = getBestScore('tower', GS.diff);
  var bestC = getBestScore('challenge', GS.diff);
  var parts = [];
  if (bestT > 0) parts.push('🏆 מגדל: ' + bestT);
  if (bestC > 0) parts.push('🎯 אתגר: ' + bestC);
  bestRow.textContent = parts.join('   |   ');

  updateChallengeDots();

  document.querySelectorAll('.diff-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.diff === GS.diff);
  });
  document.querySelectorAll('.sel-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.mode === GS.mode);
  });
  document.getElementById('challenge-progress').style.display = GS.mode === 'challenge' ? '' : 'none';
}

function updateChallengeDots() {
  var container = document.getElementById('lvl-dots');
  if (!container) return;
  var progress = getChallengeProgress();
  container.innerHTML = '';
  CHALLENGE_LEVELS.forEach(function(lvl, i) {
    var dot = document.createElement('div');
    dot.className = 'lvl-dot';
    if (i < progress)  dot.classList.add('done');
    if (i === progress) dot.classList.add('active');
    dot.textContent = i < progress ? '✓' : (i + 1);
    container.appendChild(dot);
  });
}

// ════════════════════════════════════════════════════════════
// 13. INPUT HANDLING
// ════════════════════════════════════════════════════════════

function handleDrop() {
  if (!GS.running || GS.paused || GS.dropping) return;
  SoundFX.unlock();
  GS.dropping = true;
  // Start drop at current swing Y (just above tower top, in world coords)
  GS.dropY  = getTowerTopWorld() + GS.blockH + 55;
  GS.dropVY = 0;
}

// ════════════════════════════════════════════════════════════
// 14. MENU WIRING  (all inside DOMContentLoaded)
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {

  // Load saved difficulty
  GS.diff = getSavedDiff();

  // Mode buttons
  document.querySelectorAll('.sel-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.sel-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      GS.mode = btn.dataset.mode;
      document.getElementById('challenge-progress').style.display =
        GS.mode === 'challenge' ? '' : 'none';
    });
  });

  // Difficulty buttons
  document.querySelectorAll('.diff-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.diff-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      GS.diff = btn.dataset.diff;
      saveDiff(GS.diff);
      updateMenuDisplay();
    });
  });

  // Play
  document.getElementById('btn-play').addEventListener('click', function() {
    SoundFX.unlock();
    startGame();
  });

  // How to play
  document.getElementById('btn-howto').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'flex';
  });
  document.getElementById('btn-howto-close').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'none';
  });

  // Sound
  document.getElementById('btn-sound').addEventListener('click', function() {
    GS.soundOn = !GS.soundOn;
    this.textContent = GS.soundOn ? '🔊 פועל' : '🔇 כבוי';
    BgMusic.toggle(GS.soundOn);
  });

  // Pause button (HUD)
  document.getElementById('btn-pause').addEventListener('click', function() {
    if (GS.paused) resumeGame(); else pauseGame();
  });

  // Canvas drop
  var gameCanvas = document.getElementById('game-canvas');
  gameCanvas.addEventListener('click', handleDrop);
  gameCanvas.addEventListener('touchstart', function(e){
    e.preventDefault(); handleDrop();
  }, { passive: false });

  // Keyboard
  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (document.getElementById('screen-game').classList.contains('active')) handleDrop();
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (GS.running && !GS.paused) pauseGame();
      else if (GS.paused) resumeGame();
    }
  });

  // Overlays
  document.getElementById('btn-resume').addEventListener('click',     resumeGame);
  document.getElementById('btn-restart').addEventListener('click',    restartGame);
  document.getElementById('btn-pause-menu').addEventListener('click', goToMenu);
  document.getElementById('btn-play-again').addEventListener('click', restartGame);
  document.getElementById('btn-go-menu').addEventListener('click',    goToMenu);
  document.getElementById('btn-win-menu').addEventListener('click',   goToMenu);

  // Resize
  window.addEventListener('resize', function() {
    if (document.getElementById('screen-game').classList.contains('active')) resizeCanvas();
  });

  // Initial menu
  updateMenuDisplay();
});

// ════════════════════════════════════════════════════════════
// 15. MAIN LOOP
// ════════════════════════════════════════════════════════════

function mainLoop() {
  if (!GS.running) return;
  GS.loopId = requestAnimationFrame(mainLoop);

  if (!GS.paused) {
    applyCamera();
    if (GS.dropping) updateDrop();
    else             updateSwing();
  }

  renderFrame();
}
