/*
 * ════════════════════════════════════════════════════════════
 *  מלך המגדלים — game.js   v3
 *
 *  Core mechanic (faithful to iamkun/tower_game style):
 *   • A crane pivot sits at the top-centre of the screen.
 *   • A rope hangs from the pivot; a square block hangs at the end.
 *   • The rope swings back and forth like a pendulum.
 *   • Player taps/clicks → rope releases, block falls straight down.
 *   • Land on tower = new floor.  Miss = lose a life.
 *   • Perfect centre = bonus + combo streak.
 *
 *  FIXES IN THIS VERSION:
 *   1. Music never stops on restart / game-over / menu (only pauses & resumes).
 *   2. Blocks are SQUARE (blockW === blockH, sized ~25% canvas width).
 *   3. Blocks start at the top of the screen, hanging from the crane.
 *   4. Real pendulum crane drawn: pivot + rope + block.
 *
 * ════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

// ── Difficulty ─────────────────────────────────────────────
// Edit these to tune gameplay.
const DIFF_CFG = {
  easy: {
    swingAmp:     0.55,   // pendulum amplitude (radians) — max swing angle
    swingSpeed:   0.030,  // angular speed (rad/frame) for Math.sin(t * swingSpeed)
    perfectZone:  0.28,   // fraction of block width = perfect zone
    lives:        4,
    scoreSuccess: 20,
    scorePerfect: 50,
    label:        'קל',
  },
  normal: {
    swingAmp:     0.65,
    swingSpeed:   0.045,
    perfectZone:  0.20,
    lives:        3,
    scoreSuccess: 25,
    scorePerfect: 50,
    label:        'רגיל',
  },
  hard: {
    swingAmp:     0.80,
    swingSpeed:   0.062,
    perfectZone:  0.12,
    lives:        3,
    scoreSuccess: 30,
    scorePerfect: 50,
    label:        'קשה',
  },
};

// Speed and amplitude ramp as floors increase
const SPEED_RAMP   = 0.0012;  // added to swingSpeed per floor
const AMP_RAMP     = 0.005;   // added to swingAmp per floor
const MAX_SWING    = 0.92;    // max amplitude cap (rad)

// Block: SQUARE, sized as fraction of the GAME area width
// The game area is capped at MAX_GAME_W so blocks look the same on desktop and mobile.
const MAX_GAME_W      = 420;    // px — game column never wider than this (matches phone)
const BLOCK_SIZE_FRAC = 0.22;   // block side = gameW * this  (gameW ≤ MAX_GAME_W)
const MIN_BLOCK_PX    = 16;     // minimum block width before game ends

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

const STORAGE_KEY = 'kingTower_v3';

function loadStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; }
}
function saveStorage(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch(e) {}
}
function getBestScore(mode, diff) {
  var s = loadStorage();
  return (s.bests && s.bests[mode] && s.bests[mode][diff]) || 0;
}
function setBestScore(mode, diff, score) {
  var s = loadStorage();
  if (!s.bests)        s.bests = {};
  if (!s.bests[mode])  s.bests[mode] = {};
  if (score > (s.bests[mode][diff] || 0)) {
    s.bests[mode][diff] = score; saveStorage(s); return true;
  }
  return false;
}
function getChallengeProgress() { return loadStorage().challengeProgress || 0; }
function setChallengeProgress(n) {
  var s = loadStorage();
  s.challengeProgress = Math.max(s.challengeProgress || 0, n);
  saveStorage(s);
}
function getSavedDiff() { return loadStorage().diff || 'normal'; }
function saveDiff(d)    { var s = loadStorage(); s.diff = d; saveStorage(s); }

// ════════════════════════════════════════════════════════════
// 3. GAME STATE
// ════════════════════════════════════════════════════════════

const GS = {
  mode:    'tower',
  diff:    'normal',
  soundOn: true,

  running:  false,
  paused:   false,
  dropping: false,   // true while block is in free-fall

  // Canvas dimensions (updated by resizeCanvas)
  canvasW: 360,
  canvasH: 600,

  // Game column (centred in canvas, capped at MAX_GAME_W)
  // All game logic uses gameW/gameX; canvas edges are just letterbox.
  gameW:   360,     // width of the active play area
  gameX:   0,       // left offset of play area in canvas

  // Block (always square) — DEFAULT only; resizeCanvas resets only if not mid-game
  blockSz:    80,   // side length in px (= blockW = blockH)
  baseSz:     80,   // the full-size block (used to cap perfect restore)

  // Crane / pendulum
  pivotX:  180,     // pivot is fixed at game-column centre-top
  pivotY:  0,       // canvas Y — set to a few px below top
  ropeLen: 200,     // pixels from pivot to block centre
  angle:   0,       // current pendulum angle (radians, 0 = straight down)
  swingT:  0,       // time accumulator for Math.sin oscillation

  // When dropping, block falls straight down from release point
  dropX:   0,       // centre X of falling block (fixed at release)
  dropY:   0,       // top-edge Y of falling block in WORLD coords
  dropVY:  0,

  // Block colour
  blockColor: '#60a5fa',
  nextColor:  '#f87171',

  // Scoring
  score: 0,
  lives: 3,
  floor: 0,
  combo: 0,

  // Challenge
  challengeLevel: 0,

  // Tower floors  { x, w, worldY, color }
  //   worldY = bottom of floor in world coords (0 = ground, upward positive)
  floors: [],

  // Camera (smooth scroll)
  cameraY:       0,
  targetCameraY: 0,

  // Particles
  particles: [],

  loopId: null,
};

// World → canvas Y   (worldY=0 is ground at canvas bottom)
function toCanvasY(wy) { return GS.canvasH - (wy - GS.cameraY); }

// Current tower top in world coords — sum of each floor's own height
function towerTopWorld() {
  if (GS.floors.length === 0) return 0;
  var top = GS.floors[GS.floors.length - 1];
  return top.worldY + top.h;
}

// ─────────────────────────────────────────────────────────────
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
  GS.swingT         = 0;
  GS.angle          = 0;
  // blockSz / baseSz reset happens in startGame after resizeCanvas, not here.
  if (GS.loopId) { cancelAnimationFrame(GS.loopId); GS.loopId = null; }
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

// BgMusic: uses HTML Audio, never fully stopped — only paused/resumed.
// This means music continues seamlessly on restart and returns from menu.
const BgMusic = (() => {
  const aud = new Audio('assets/TowerMusic.mp3');
  aud.loop   = true;
  aud.volume = 0.35;
  var started = false;
  return {
    // Called once on first user gesture
    start()    {
      if (!started) { started = true; aud.play().catch(function(){}); }
      else          { aud.play().catch(function(){}); }
    },
    pause()    { aud.pause(); },
    resume()   { if (GS.soundOn) aud.play().catch(function(){}); },
    toggle(on) { on ? this.resume() : this.pause(); },
    mute(on)   { aud.muted = !on; },
  };
})();

// SoundFX: synthesised, no file dependency
const SoundFX = (() => {
  let actx = null, unlocked = false;
  function getCtx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return actx;
  }
  function unlock() {
    if (unlocked) return;
    var c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
    document.getElementById('audio-banner').style.display = 'none';
    BgMusic.start();
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
    land()     { beep(480, 0.08, 'sine', 0.18); },
    perfect()  { beep(660, 0.08, 'sine', 0.16); setTimeout(function(){ beep(880, 0.10, 'sine', 0.14); }, 70); },
    combo()    { [660,784,880,1047].forEach(function(f,i){ setTimeout(function(){ beep(f,0.08,'sine',0.14); }, i*55); }); },
    miss()     { beep(220, 0.20, 'sawtooth', 0.10); },
    gameover() { beep(180, 0.50, 'sawtooth', 0.12); },
    win()      { [523,659,784,1047,1319].forEach(function(f,i){ setTimeout(function(){ beep(f,0.12,'sine',0.15); }, i*100); }); },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. CHALLENGE LEVELS
// ════════════════════════════════════════════════════════════

const CHALLENGE_LEVELS = [
  { label: 'שלב 1', type: 'floors',   target: 5,   desc: 'הגע ל-5 קומות'                             },
  { label: 'שלב 2', type: 'floors',   target: 8,   desc: 'הגע ל-8 קומות'                             },
  { label: 'שלב 3', type: 'perfects', target: 2,   desc: 'בצע 2 נחיתות מושלמות'                      },
  { label: 'שלב 4', type: 'score',    target: 300, desc: 'הגע ל-300 ניקוד'                            },
  { label: 'שלב 5', type: 'survive',  target: 10,  maxLost: 1, desc: 'הגע ל-10 קומות, אבד לב אחד לכל היותר' },
  { label: 'שלב 6', type: 'perfects', target: 4,   desc: 'בצע 4 נחיתות מושלמות'                      },
  { label: 'שלב 7', type: 'floors',   target: 15,  desc: 'הגע ל-15 קומות'                            },
  { label: 'שלב 8', type: 'score',    target: 600, desc: 'הגע ל-600 ניקוד'                            },
];
var perfectsThisGame = 0;

// ════════════════════════════════════════════════════════════
// 6. BLOCK COLOURS
// ════════════════════════════════════════════════════════════

const BLOCK_COLORS = [
  '#60a5fa','#f87171','#4ade80','#facc15',
  '#c084fc','#fb923c','#34d399','#f472b6',
];
var colorIdx = 0;
function nextColor() {
  colorIdx = (colorIdx + 1) % BLOCK_COLORS.length;
  return BLOCK_COLORS[colorIdx];
}

// ════════════════════════════════════════════════════════════
// 7. CRANE / PENDULUM PHYSICS
// ════════════════════════════════════════════════════════════

// Position of the hanging block centre (canvas coords) while swinging
function blockCentreCanvas() {
  // Block hangs at end of rope from pivot
  var bx = GS.pivotX + Math.sin(GS.angle) * GS.ropeLen;
  var by = GS.pivotY + Math.cos(GS.angle) * GS.ropeLen;
  return { x: bx, y: by };
}

// Initialise a new block at the crane
function initBlock() {
  GS.dropping   = false;
  GS.dropVY     = 0;
  GS.blockColor = GS.nextColor || BLOCK_COLORS[0];
  GS.nextColor  = nextColor();
  // Reset swing angle to one side so it starts moving
  GS.angle      = getCfg().swingAmp;
  // swingT continues — don't reset, keeps motion smooth between blocks
}

function getCfg() { return DIFF_CFG[GS.diff]; }

// Speed/amp ramp per floor
function currentSwingSpeed() {
  return Math.min(getCfg().swingSpeed + GS.floor * SPEED_RAMP, 0.12);
}
function currentSwingAmp() {
  return Math.min(getCfg().swingAmp + GS.floor * AMP_RAMP, MAX_SWING);
}

// Advance pendulum one frame
function updateSwing() {
  GS.swingT += currentSwingSpeed();
  GS.angle   = Math.sin(GS.swingT) * currentSwingAmp();
}

// Release block — it falls straight down from release point
function handleDrop() {
  if (!GS.running || GS.paused || GS.dropping) return;
  SoundFX.unlock();
  GS.dropping = true;

  var pos = blockCentreCanvas();
  // Store release X (centre) in canvas coords (stays fixed horizontally)
  GS.dropX  = pos.x;
  // dropY = world coord of block CENTRE at release
  // canvas Y of block centre = pos.y
  // world Y = (canvasH - pos.y) + cameraY
  GS.dropY  = (GS.canvasH - pos.y) + GS.cameraY;
  GS.dropVY = 0;
}

// ── Drop physics ──────────────────────────────────────────
function updateDrop() {
  GS.dropVY  += 0.55;
  GS.dropVY   = Math.min(GS.dropVY, 24);
  GS.dropY   -= GS.dropVY;   // world Y decreases as block falls

  // Bottom of falling block in world coords
  var blockBot = GS.dropY - GS.blockSz / 2;

  if (blockBot <= towerTopWorld()) {
    landBlock();
  }
}

// ── Land ──────────────────────────────────────────────────
function landBlock() {
  // Block left edge in canvas = dropX - blockSz/2
  var blockLeft  = GS.dropX - GS.blockSz / 2;
  var blockRight = GS.dropX + GS.blockSz / 2;
  var blockCX    = GS.dropX;

  // Tower top surface
  var towerCX, towerW;
  if (GS.floors.length === 0) {
    // Base floor spans the full game column
    towerCX = GS.gameX + GS.gameW / 2;
    towerW  = GS.gameW;
  } else {
    var top = GS.floors[GS.floors.length - 1];
    towerCX = top.x + top.w / 2;
    towerW  = top.w;
  }

  // Overlap between block and tower top
  var towerL   = towerCX - towerW / 2;
  var towerR   = towerCX + towerW / 2;
  var overlapL = Math.max(blockLeft, towerL);
  var overlapR = Math.min(blockRight, towerR);
  var overlap  = overlapR - overlapL;

  if (overlap <= 4) {
    missBlock();
    return;
  }

  // New floor x/w
  var newW, newX;
  if (GS.mode === 'free') {
    newW = GS.blockSz;
    newX = Math.max(GS.gameX, Math.min(GS.gameX + GS.gameW - newW, blockCX - newW / 2));
  } else {
    newW = overlap;
    newX = overlapL;
  }

  // Perfect?
  var offset    = Math.abs(blockCX - towerCX);
  var cfg       = getCfg();
  var isPerfect = offset < GS.blockSz * cfg.perfectZone;

  // Push floor (stored in world coords)
  var floorWorldY = towerTopWorld();
  GS.floors.push({ x: newX, w: newW, h: GS.blockSz, worldY: floorWorldY, color: GS.blockColor });
  GS.floor++;

  // Score + sounds + particles
  scoreBlock(isPerfect, offset, towerW);
  var midY = toCanvasY(floorWorldY + GS.blockSz / 2);
  spawnParticles(blockCX, midY, GS.blockColor, isPerfect ? 16 : 8);
  if (isPerfect) {
    if (GS.combo > 1) SoundFX.combo(); else SoundFX.perfect();
  } else {
    SoundFX.land();
  }

  // Camera
  updateCamera();


  if (isPerfect) perfectsThisGame++;
  if (GS.mode === 'challenge') checkChallengeGoal();
  if (!GS.running) return;

  initBlock();
  updateHUD();
}

// ── Miss ──────────────────────────────────────────────────
function missBlock() {
  GS.lives--;
  GS.combo = 0;
  SoundFX.miss();
  showFloatMsg('אוי! -לב 💔');
  spawnParticles(GS.dropX, GS.canvasH * 0.55, '#f87171', 12);
  updateHUD();

  if (GS.lives <= 0) { endGame(); return; }
  initBlock();
}

// ════════════════════════════════════════════════════════════
// 8. SCORING
// ════════════════════════════════════════════════════════════

function scoreBlock(isPerfect, offset, towerW) {
  var cfg = getCfg();
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
    var close = towerW > 0 ? 1 - offset / (towerW / 2) : 0;
    if (close > 0.7) { pts += 10; showFloatMsg('יפה! +' + pts + ' 👍'); }
    else showFloatMsg('+' + pts);
  }
  GS.score += pts;
  updateScoreUI();
}

// ════════════════════════════════════════════════════════════
// 9. RENDERING
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
  GS.canvasW = canvas.width;
  GS.canvasH = canvas.height;

  // ── Game column: cap width so desktop looks like mobile ──────
  GS.gameW = Math.min(GS.canvasW, MAX_GAME_W);
  GS.gameX = Math.round((GS.canvasW - GS.gameW) / 2);   // left edge of play area

  // Block size: only reset if NOT in a running game (preserve trimming state)
  if (!GS.running) {
    GS.baseSz  = Math.max(MIN_BLOCK_PX, Math.round(GS.gameW * BLOCK_SIZE_FRAC));
    GS.blockSz = GS.baseSz;
  } else {
    // Keep current blockSz (may be trimmed), just update baseSz cap
    GS.baseSz = Math.max(MIN_BLOCK_PX, Math.round(GS.gameW * BLOCK_SIZE_FRAC));
  }

  // Crane pivot: centre of game column, a few px below top edge
  GS.pivotX = GS.gameX + Math.round(GS.gameW / 2);
  GS.pivotY = 8;

  // Rope length: hangs block in top 30% of canvas, with clearance
  GS.ropeLen = Math.round(GS.canvasH * 0.26);
}

// ── Camera ────────────────────────────────────────────────
function updateCamera() {
  var ttw = towerTopWorld();
  // The crane block hangs at canvas Y = pivotY + ropeLen + blockSz/2 (bottom of hanging block).
  // We want tower top canvas Y to be at least CRANE_CLEARANCE px below that.
  // toCanvasY(ttw) = canvasH - (ttw - cameraY)
  // We want: canvasH - (ttw - cameraY) >= craneBottom + CRANE_CLEARANCE
  // So: cameraY >= ttw - canvasH + craneBottom + CRANE_CLEARANCE
  var CRANE_CLEARANCE = 30;  // px gap between crane block and tower top
  var craneBottom = GS.pivotY + GS.ropeLen + GS.blockSz / 2 + CRANE_CLEARANCE;
  var minCameraY  = ttw - GS.canvasH + craneBottom;
  GS.targetCameraY = Math.max(0, minCameraY);
}
function applyCamera() {
  GS.cameraY += (GS.targetCameraY - GS.cameraY) * 0.07;
}

// ── Main render ───────────────────────────────────────────
function renderFrame() {
  if (!ctx) return;
  ctx.clearRect(0, 0, GS.canvasW, GS.canvasH);

  drawSky();
  drawLetterbox();   // dark sides on desktop
  drawClouds();
  drawGround();

  for (var i = 0; i < GS.floors.length; i++) drawFloor(GS.floors[i]);

  if (GS.running) {
    // Crane is ALWAYS drawn (arm + rope + pivot) whether swinging or dropping
    drawCraneArm();
    if (GS.dropping) {
      drawFallingBlock();
    } else {
      drawHangingBlock();   // block on the rope
      drawDropHint();
    }
  }

  updateAndDrawParticles();
}

// ── Sky ───────────────────────────────────────────────────
function drawSky() {
  var g = ctx.createLinearGradient(0, 0, 0, GS.canvasH);
  g.addColorStop(0,   '#1a3a5c');
  g.addColorStop(0.5, '#3a7bbf');
  g.addColorStop(1,   '#6cb4e4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GS.canvasW, GS.canvasH);
}

// ── Ground ────────────────────────────────────────────────
function drawGround() {
  var gy = toCanvasY(0);  // canvas Y of ground surface
  if (gy > GS.canvasH) return;
  // Only draw ground within the game column
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(GS.gameX, gy, GS.gameW, 16);
  ctx.fillStyle = '#166534';
  ctx.fillRect(GS.gameX, gy + 16, GS.gameW, GS.canvasH);
}

// ── Tower floors ──────────────────────────────────────────
function drawFloor(fl) {
  var h         = fl.h;                          // this floor's height at time of landing
  var topCanvas = toCanvasY(fl.worldY + h);
  var botCanvas = toCanvasY(fl.worldY);
  if (topCanvas > GS.canvasH || botCanvas < 0) return;

  var x = fl.x, w = fl.w;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  drawBlock(x + 4, topCanvas + 4, w, h, 8);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = fl.color;
  drawBlock(x, topCanvas, w, h, 8);
  ctx.fill();

  // Top shine
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = '#fff';
  drawBlock(x + 4, topCanvas + 4, w - 8, h * 0.40, 5);
  ctx.fill();
  ctx.restore();

  // Stroke
  ctx.strokeStyle = darken(fl.color);
  ctx.lineWidth   = 2;
  ctx.globalAlpha = 1;
  drawBlock(x, topCanvas, w, h, 8);
  ctx.stroke();
}

// ── Letterbox (desktop side panels) ──────────────────────
function drawLetterbox() {
  if (GS.gameX <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, GS.gameX, GS.canvasH);
  ctx.fillRect(GS.gameX + GS.gameW, 0, GS.gameX, GS.canvasH);
}

// ── Crane arm + rope (always drawn) ───────────────────────
function drawCraneArm() {
  ctx.save();
  // Horizontal crane arm
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth   = 6;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(GS.gameX + GS.gameW * 0.08, GS.pivotY + 2);
  ctx.lineTo(GS.gameX + GS.gameW * 0.92, GS.pivotY + 2);
  ctx.stroke();

  // Pivot circle
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(GS.pivotX, GS.pivotY + 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth   = 2;
  ctx.stroke();

  if (!GS.dropping) {
    // Rope to hanging block
    var pos = blockCentreCanvas();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(GS.pivotX, GS.pivotY + 2);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  } else {
    // Rope hangs straight down, stationary after release
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(GS.pivotX, GS.pivotY + 2);
    ctx.lineTo(GS.pivotX, GS.pivotY + 2 + GS.ropeLen * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Hanging block on the crane rope ───────────────────────
function drawHangingBlock() {
  var pos = blockCentreCanvas();
  var sz  = GS.blockSz;
  drawColorBlock(pos.x - sz / 2, pos.y - sz / 2, sz, sz, GS.blockColor);
}

// ── Falling block ─────────────────────────────────────────
function drawFallingBlock() {
  var sz  = GS.blockSz;
  // dropY is world coord of block centre
  var canY = toCanvasY(GS.dropY);         // canvas Y of block centre
  var topY = canY - sz / 2;
  drawColorBlock(GS.dropX - sz / 2, topY, sz, sz, GS.blockColor);
}

// ── Coloured square block helper ──────────────────────────
function drawColorBlock(x, y, w, h, color) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle   = '#000';
  drawBlock(x + 4, y + 4, w, h, 8); ctx.fill();
  ctx.restore();

  ctx.fillStyle = color;
  drawBlock(x, y, w, h, 8); ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle   = '#fff';
  drawBlock(x + 4, y + 4, w - 8, h * 0.40, 5); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = darken(color);
  ctx.lineWidth   = 2;
  ctx.globalAlpha = 1;
  drawBlock(x, y, w, h, 8); ctx.stroke();
}

// ── Drop hint: "tap to drop" arrow ────────────────────────
function drawDropHint() {
  var pos = blockCentreCanvas();
  var cx  = pos.x;
  var ay  = pos.y + GS.blockSz / 2 + 14;

  ctx.save();
  ctx.globalAlpha = 0.70 + 0.30 * Math.sin(Date.now() / 300);
  ctx.fillStyle   = '#ffe14d';
  ctx.beginPath();
  ctx.moveTo(cx,      ay);
  ctx.lineTo(cx - 10, ay - 16);
  ctx.lineTo(cx + 10, ay - 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Clouds ────────────────────────────────────────────────
var clouds = null;
function initClouds() {
  clouds = [];
  for (var i = 0; i < 6; i++) {
    clouds.push({
      x:   Math.random() * 1.3,
      y:   0.04 + Math.random() * 0.28,
      r:   14 + Math.random() * 24,
      spd: 0.00006 + Math.random() * 0.00014,
    });
  }
}
function drawClouds() {
  if (!clouds) initClouds();
  ctx.save();
  ctx.fillStyle   = 'rgba(255,255,255,0.28)';
  for (var i = 0; i < clouds.length; i++) {
    var cl = clouds[i];
    cl.x = (cl.x + cl.spd) % 1.35;
    var cx = cl.x * GS.canvasW;
    var cy = cl.y * GS.canvasH;
    var r  = cl.r;
    ctx.beginPath();
    ctx.arc(cx,       cy,       r,         0, Math.PI * 2);
    ctx.arc(cx + r,   cy - r/3, r * 0.72,  0, Math.PI * 2);
    ctx.arc(cx - r,   cy - r/4, r * 0.65,  0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Rounded rect helper ───────────────────────────────────
function drawBlock(x, y, w, h, r) {
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
    var r = Math.max(0, ((n>>16)&255) - 45);
    var g = Math.max(0, ((n>>8) &255) - 45);
    var b = Math.max(0, ( n     &255) - 45);
    return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  } catch(e) { return '#000'; }
}

// ════════════════════════════════════════════════════════════
// 10. PARTICLES
// ════════════════════════════════════════════════════════════

function spawnParticles(x, y, color, count) {
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var s = 1.5 + Math.random() * 4;
    GS.particles.push({
      x: x, y: y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
      color: color, life: 1.0, r: 3 + Math.random() * 4,
    });
  }
}

function updateAndDrawParticles() {
  if (!ctx) return;
  GS.particles = GS.particles.filter(function(p){ return p.life > 0; });
  GS.particles.forEach(function(p) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life -= 0.034;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

// ── Float message ─────────────────────────────────────────
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
  floatTimer = setTimeout(function(){ el.style.display = 'none'; }, 1400);
}

// ════════════════════════════════════════════════════════════
// 11. GAME FLOW
// ════════════════════════════════════════════════════════════

function startGame() {
  initCanvas();      // ensure canvas reference exists
  resizeCanvas();    // get correct dimensions (sets baseSz, blockSz since !running)

  resetRuntime();

  var cfg    = getCfg();
  GS.lives   = cfg.lives;
  // blockSz already set to baseSz by resizeCanvas (running=false at that point)
  colorIdx   = 0;
  perfectsThisGame = 0;
  GS.blockColor = BLOCK_COLORS[0];
  GS.nextColor  = nextColor();

  showScreen('screen-game');

  // Re-measure after paint (goal bar changes layout)
  requestAnimationFrame(function() {
    if (GS.mode === 'challenge') {
      var lvlDef = CHALLENGE_LEVELS[GS.challengeLevel];
      if (lvlDef) {
        document.getElementById('goal-bar').style.display = '';
        document.getElementById('goal-text').textContent  = lvlDef.desc;
        document.getElementById('goal-fill').style.width  = '0%';
      }
    } else {
      document.getElementById('goal-bar').style.display = 'none';
    }
    resizeCanvas();  // recalc with goal bar
    document.getElementById('hud-best').textContent = getBestScore(GS.mode, GS.diff);
    updateHUD();
    initBlock();
    GS.running = true;
    // Resume music (don't restart from 0 — fix #1)
    BgMusic.resume();
    GS.loopId = requestAnimationFrame(mainLoop);
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
  // Fix #1: DON'T stop music — just let it keep playing in background
  SoundFX.gameover();

  var isNew = setBestScore(GS.mode, GS.diff, GS.score);
  var cfg   = getCfg();
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
  if      (lvl.type === 'floors')   { progress = GS.floor; }
  else if (lvl.type === 'perfects') { progress = perfectsThisGame; }
  else if (lvl.type === 'score')    { progress = GS.score; }
  else if (lvl.type === 'survive')  {
    progress = GS.floor;
    var lost = getCfg().lives - GS.lives;
    if (lost > (lvl.maxLost || 0)) { endGame(); return; }
  }
  var pct = Math.min(100, Math.round(progress / lvl.target * 100));
  document.getElementById('goal-fill').style.width = pct + '%';
  if (progress >= lvl.target) winChallenge();
}

function winChallenge() {
  GS.running = false;
  SoundFX.win();
  // Fix #1: keep music playing

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
  // Fix #1: music keeps playing — just hide screens
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
// 12. HUD / UI
// ════════════════════════════════════════════════════════════

function updateHUD() { updateScoreUI(); updateLivesUI(); }

function updateScoreUI() {
  var el = document.getElementById('hud-score');
  if (el) el.textContent = GS.score;
}

function updateLivesUI() {
  var hearts = '';
  for (var i = 0; i < GS.lives; i++)                       hearts += '❤️';
  for (var j = GS.lives; j < getCfg().lives; j++) hearts += '🖤';
  var el = document.getElementById('hud-lives');
  if (el) el.textContent = hearts;
}

function updateMenuDisplay() {
  var br = document.getElementById('best-row');
  if (!br) return;
  var bt = getBestScore('tower', GS.diff), bc = getBestScore('challenge', GS.diff);
  var parts = [];
  if (bt > 0) parts.push('🏆 מגדל: ' + bt);
  if (bc > 0) parts.push('🎯 אתגר: ' + bc);
  br.textContent = parts.join('   |   ');

  updateChallengeDots();
  document.querySelectorAll('.diff-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.diff === GS.diff);
  });
  document.querySelectorAll('.sel-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.mode === GS.mode);
  });
  document.getElementById('challenge-progress').style.display =
    GS.mode === 'challenge' ? '' : 'none';
}

function updateChallengeDots() {
  var c = document.getElementById('lvl-dots'); if (!c) return;
  var p = getChallengeProgress();
  c.innerHTML = '';
  CHALLENGE_LEVELS.forEach(function(lvl, i) {
    var d = document.createElement('div');
    d.className = 'lvl-dot';
    if (i < p)  d.classList.add('done');
    if (i === p) d.classList.add('active');
    d.textContent = i < p ? '✓' : (i + 1);
    c.appendChild(d);
  });
}

// ════════════════════════════════════════════════════════════
// 13. MENU WIRING
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
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
    SoundFX.unlock();   // first gesture — starts music
    startGame();
  });

  // How to play
  document.getElementById('btn-howto').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'flex';
  });
  document.getElementById('btn-howto-close').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'none';
  });

  // Sound toggle
  document.getElementById('btn-sound').addEventListener('click', function() {
    GS.soundOn = !GS.soundOn;
    this.textContent = GS.soundOn ? '🔊 פועל' : '🔇 כבוי';
    BgMusic.toggle(GS.soundOn);
  });

  // Pause (HUD)
  document.getElementById('btn-pause').addEventListener('click', function() {
    if (GS.paused) resumeGame(); else pauseGame();
  });

  // Canvas: click or touch to drop
  var gc = document.getElementById('game-canvas');
  gc.addEventListener('click', handleDrop);
  gc.addEventListener('touchstart', function(e){ e.preventDefault(); handleDrop(); }, { passive: false });

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

  window.addEventListener('resize', function() {
    if (document.getElementById('screen-game').classList.contains('active')) resizeCanvas();
  });

  updateMenuDisplay();
});

// ════════════════════════════════════════════════════════════
// 14. MAIN LOOP
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
