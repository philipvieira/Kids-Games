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
 *   6.  Block Colours & Shapes
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
    missAllowed:  true,   // forgiving: miss only costs a life, no trim
    label:        'קל',
  },
  normal: {
    swingSpeed:   2.2,
    perfectZone:  0.20,
    lives:        3,
    scoreSuccess: 25,
    scorePerfect: 50,
    missAllowed:  false,
    label:        'רגיל',
  },
  hard: {
    swingSpeed:   3.4,
    perfectZone:  0.12,
    lives:        3,
    scoreSuccess: 30,
    scorePerfect: 50,
    missAllowed:  false,
    label:        'קשה',
  },
};

// Speed increases as the tower grows (makes game harder over time)
// speedMultiplier = 1 + floor * SPEED_RAMP_PER_FLOOR  (capped at MAX_SPEED_MULT)
const SPEED_RAMP_PER_FLOOR = 0.025;
const MAX_SPEED_MULT        = 2.8;

// ── Block dimensions (fraction of canvas width) ───────────
const BLOCK_W_FRAC = 0.36;  // starting block width as fraction of canvas width
const BLOCK_H_FRAC = 0.072; // block height

// In free mode the block width never shrinks (no penalty)
// In normal/hard mode each imperfect landing trims the block slightly
const TRIM_ON_IMPERFECT = true;  // set false to disable trimming entirely

// ── Perfect placement ──────────────────────────────────────
// Combo streak message thresholds
const COMBO_MSGS = [
  { at: 2, text: 'קומבו! x2 🔥' },
  { at: 4, text: 'מדהים! x4 🌟' },
  { at: 6, text: 'בלתי נתפס! x6 💥' },
  { at: 10, text: 'מלך המגדלים! 👑' },
];

// ════════════════════════════════════════════════════════════
// 2. STORAGE
// ════════════════════════════════════════════════════════════

const STORAGE_KEY     = 'kingTower_v1';

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
  var s = loadStorage();
  return s.challengeProgress || 0;
}
function setChallengeProgress(lvl) {
  var s = loadStorage();
  s.challengeProgress = Math.max(s.challengeProgress || 0, lvl);
  saveStorage(s);
}
function getSavedDiff() {
  return loadStorage().diff || 'normal';
}
function saveDiff(diff) {
  var s = loadStorage(); s.diff = diff; saveStorage(s);
}

// ════════════════════════════════════════════════════════════
// 3. GAME STATE  (GS)
// ════════════════════════════════════════════════════════════

const GS = {
  // Settings (set from menu)
  mode: 'tower',
  diff: 'normal',
  soundOn: true,

  // Runtime
  running:  false,
  paused:   false,
  dropping: false,  // true while block is falling after player taps

  canvasW: 360,
  canvasH: 600,

  // Swing state
  blockX:   0,    // current X centre of swinging block (world coords)
  swingDir: 1,    // +1 = moving right, -1 = moving left

  // Drop state
  dropY:    0,    // current Y of falling block (canvas pixels, top edge)
  dropVY:   0,    // drop velocity (px/frame)

  // Tower state
  floors:   [],   // array of { x, w, y } — placed floor pieces (canvas coords)
  topY:     0,    // canvas Y of the TOP of the topmost floor (or ground)

  // Block dimensions (pixels)
  blockW:   0,
  blockH:   0,

  // Current block colour
  blockColor: '#60a5fa',
  nextColor:  '#f87171',

  // Scoring
  score:  0,
  lives:  3,
  floor:  0,      // number of floors successfully placed
  combo:  0,      // consecutive perfect placements

  // Challenge
  challengeLevel: 0,

  // Particles
  particles: [],

  // Loop
  loopId: null,
  lastTs: 0,

  // Camera scroll: the game view scrolls up as tower grows
  cameraOffset: 0,   // pixels: how much the view has scrolled upward
  targetCameraOffset: 0,
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
  GS.cameraOffset       = 0;
  GS.targetCameraOffset = 0;
  if (GS.loopId) { cancelAnimationFrame(GS.loopId); GS.loopId = null; }
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let ctx = null;
  let unlocked = false;

  function getCtx() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
    return ctx;
  }

  function unlock() {
    if (unlocked) return;
    var c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
    document.getElementById('audio-banner').style.display = 'none';
    BgMusic.play();
  }

  // Synthesised beep: freq (Hz), dur (s), type, vol
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
    land()    { beep(480, 0.08, 'sine',     0.18); },
    perfect() {
      // rising two-note chime
      beep(660, 0.08, 'sine', 0.16);
      setTimeout(function(){ beep(880, 0.1, 'sine', 0.14); }, 70);
    },
    combo()   {
      [660,784,880,1047].forEach(function(f,i){
        setTimeout(function(){ beep(f,0.08,'sine',0.14); }, i*55);
      });
    },
    miss()    { beep(220, 0.2, 'sawtooth', 0.10); },
    gameover(){ beep(180, 0.5, 'sawtooth', 0.12); },
    win()     {
      [523,659,784,1047,1319].forEach(function(f,i){
        setTimeout(function(){ beep(f,0.12,'sine',0.15); }, i*100);
      });
    },
  };
})();

const BgMusic = (() => {
  const aud = new Audio('assets/TowerMusic.mp3');
  aud.loop   = true;
  aud.volume = 0.35;
  return {
    play()   { if (GS.soundOn) aud.play().catch(function(){}); },
    stop()   { aud.pause(); aud.currentTime = 0; },
    pause()  { aud.pause(); },
    resume() { if (GS.soundOn) aud.play().catch(function(){}); },
    toggle(on) { on ? this.resume() : this.pause(); },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. CHALLENGE LEVEL DEFINITIONS
// ════════════════════════════════════════════════════════════
// Edit these objects to change challenge goals.
// type: 'floors'   — stack N floors total
//       'perfects' — achieve N perfect placements
//       'score'    — reach a target score
//       'survive'  — reach N floors without losing more than X lives

const CHALLENGE_LEVELS = [
  { label: 'שלב 1',  type: 'floors',   target: 5,  desc: 'הגע ל-5 קומות'                       },
  { label: 'שלב 2',  type: 'floors',   target: 8,  desc: 'הגע ל-8 קומות'                       },
  { label: 'שלב 3',  type: 'perfects', target: 2,  desc: 'בצע 2 נחיתות מושלמות'                },
  { label: 'שלב 4',  type: 'score',    target: 300, desc: 'הגע ל-300 ניקוד'                    },
  { label: 'שלב 5',  type: 'survive',  target: 10, maxLost: 1, desc: 'הגע ל-10 קומות ב-1 חיים לכל היותר' },
  { label: 'שלב 6',  type: 'perfects', target: 4,  desc: 'בצע 4 נחיתות מושלמות'                },
  { label: 'שלב 7',  type: 'floors',   target: 15, desc: 'הגע ל-15 קומות'                      },
  { label: 'שלב 8',  type: 'score',    target: 600, desc: 'הגע ל-600 ניקוד'                    },
];

// Count of perfects in current game (for challenge tracking)
var perfectsThisGame = 0;

// ════════════════════════════════════════════════════════════
// 6. BLOCK COLOURS & SHAPES
// ════════════════════════════════════════════════════════════

// Cycle through bright kid-friendly colours for each new block
const BLOCK_COLORS = [
  '#60a5fa',  // blue
  '#f87171',  // red
  '#4ade80',  // green
  '#facc15',  // yellow
  '#c084fc',  // purple
  '#fb923c',  // orange
  '#34d399',  // teal
  '#f472b6',  // pink
];
var colorIdx = 0;
function nextBlockColor() {
  colorIdx = (colorIdx + 1) % BLOCK_COLORS.length;
  return BLOCK_COLORS[colorIdx];
}

// ════════════════════════════════════════════════════════════
// 7. CORE PHYSICS — swing, drop, land, miss
// ════════════════════════════════════════════════════════════

// ── Initialise a new block above the tower ─────────────────
function initBlock() {
  GS.dropping   = false;
  GS.dropVY     = 0;
  GS.blockColor = GS.nextColor || BLOCK_COLORS[0];
  GS.nextColor  = nextBlockColor();

  // Start the block at a random edge of its swing range
  GS.blockX   = GS.canvasW * 0.1; // left edge of swing
  GS.swingDir = 1;

  // Drop Y starts above the visible top (off-screen above camera)
  GS.dropY = getDropStartY();
}

// Y position where the falling block starts (in canvas coords)
function getDropStartY() {
  // The block appears just above the top of the tower in canvas space
  // topY is the canvas Y of the top of the tower (smaller = higher up the canvas)
  var towerTopCanvas = GS.topY - GS.cameraOffset;
  return towerTopCanvas - GS.blockH - 60;
}

// ── Swing update (called every frame while not dropping) ───
function updateSwing() {
  var cfg   = DIFF_CFG[GS.diff];
  var speed = cfg.swingSpeed * getSpeedMult();
  var leftBound  = GS.blockW * 0.1;
  var rightBound = GS.canvasW - GS.blockW * 0.1 - GS.blockW;

  GS.blockX += speed * GS.swingDir;

  if (GS.blockX >= rightBound) { GS.blockX = rightBound; GS.swingDir = -1; }
  if (GS.blockX <= leftBound)  { GS.blockX = leftBound;  GS.swingDir =  1; }
}

// Speed multiplier grows with floor count
function getSpeedMult() {
  return Math.min(MAX_SPEED_MULT, 1 + GS.floor * SPEED_RAMP_PER_FLOOR);
}

// ── Drop update (called every frame while block is falling) ─
function updateDrop() {
  GS.dropVY += 0.55;                       // gravity (px/frame²)
  GS.dropVY  = Math.min(GS.dropVY, 22);   // terminal velocity cap
  GS.dropY  += GS.dropVY;

  // Calculate canvas Y of tower top surface
  var towerTopCanvas = GS.topY - GS.cameraOffset;

  // Has the block's bottom edge reached the tower top?
  if (GS.dropY + GS.blockH >= towerTopCanvas) {
    landBlock(towerTopCanvas);
  }
}

// ── Land block on tower ─────────────────────────────────────
function landBlock(towerTopCanvas) {
  // Block centre X when it lands
  var blockCX = GS.blockX + GS.blockW / 2;

  // Tower top surface centre X (from the last placed floor, or canvas centre for first)
  var towerCX, towerW;
  if (GS.floors.length === 0) {
    // First block: ground platform spans full width
    towerCX = GS.canvasW / 2;
    towerW  = GS.canvasW;
  } else {
    var top = GS.floors[GS.floors.length - 1];
    towerCX = top.x + top.w / 2;
    towerW  = top.w;
  }

  // Overlap: how much of the block lands on the tower
  var blockL  = GS.blockX;
  var blockR  = GS.blockX + GS.blockW;
  var towerL  = towerCX - towerW / 2;
  var towerR  = towerCX + towerW / 2;
  var overlapL = Math.max(blockL, towerL);
  var overlapR = Math.min(blockR, towerR);
  var overlap  = overlapR - overlapL;

  // Miss: no overlap at all
  if (overlap <= 4) {
    missBlock();
    return;
  }

  // Calculate new floor width after trimming
  var newW = overlap;
  var newX = overlapL;

  // In free mode, don't trim — keep original block width centred on landing point
  if (GS.mode === 'free') {
    newW = GS.blockW;
    newX = blockCX - newW / 2;
    // Clamp to canvas
    newX = Math.max(0, Math.min(GS.canvasW - newW, newX));
  }

  // New floor Y (top surface) — block sits on tower top
  var newFloorTopCanvas = towerTopCanvas - GS.blockH;

  // Check perfect placement
  var offset   = Math.abs(blockCX - towerCX);
  var cfg      = DIFF_CFG[GS.diff];
  var isPerfect = offset < GS.blockW * cfg.perfectZone;

  // Add floor to tower
  GS.floors.push({
    x:     newX,
    w:     newW,
    y:     newFloorTopCanvas,           // canvas Y of this floor's top (before camera scroll)
    worldY: GS.topY - GS.blockH,       // world Y (doesn't change with camera)
    color: GS.blockColor,
  });
  GS.floor++;
  GS.topY -= GS.blockH;                // tower grows upward in world space

  // Snap block position to land perfectly on surface
  GS.dropY  = newFloorTopCanvas;

  // Scoring
  scoreBlock(isPerfect, offset, towerW);

  // Visual effects
  spawnParticles(blockCX, newFloorTopCanvas + GS.blockH / 2, GS.blockColor, isPerfect ? 14 : 8);
  if (isPerfect) SoundFX.perfect(); else SoundFX.land();

  // Update camera to follow tower growth
  updateCamera();

  // Challenge: count perfects
  if (isPerfect) perfectsThisGame++;

  // Check challenge goal
  if (GS.mode === 'challenge') checkChallengeGoal();

  // Next block width: trim if not perfect and not free mode
  if (GS.mode !== 'free' && !isPerfect && TRIM_ON_IMPERFECT && GS.diff !== 'easy') {
    GS.blockW = Math.max(newW, GS.blockH * 1.2); // never narrower than slightly wider than tall
  } else if (isPerfect) {
    // Perfect: restore some width (reward)
    GS.blockW = Math.min(GS.blockW + GS.blockH * 0.5, GS.canvasW * BLOCK_W_FRAC);
  }

  // Spawn next block
  initBlock();
  updateHUD();
}

// ── Miss: block fell off ────────────────────────────────────
function missBlock() {
  GS.lives--;
  GS.combo = 0;
  SoundFX.miss();
  showFloatMsg('אוי! -לב 💔');
  spawnParticles(GS.blockX + GS.blockW / 2, GS.canvasH * 0.5, '#f87171', 10);
  updateHUD();

  if (GS.lives <= 0) {
    endGame();
    return;
  }
  // Don't trim on miss — give a fair next attempt
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
    pts = cfg.scorePerfect + (GS.combo - 1) * 25; // combo streak bonus
    // Show feedback message
    var comboMsg = '⭐ מושלם! +' + pts;
    for (var i = COMBO_MSGS.length - 1; i >= 0; i--) {
      if (GS.combo >= COMBO_MSGS[i].at) { comboMsg = COMBO_MSGS[i].text + ' +' + pts; break; }
    }
    if (GS.combo > 1) SoundFX.combo(); else SoundFX.perfect();
    showFloatMsg(comboMsg);
  } else {
    GS.combo = 0;
    pts = cfg.scoreSuccess;
    // Partial bonus for close placement
    var closeness = 1 - (offset / (towerW / 2));
    if (closeness > 0.7) { pts += 10; showFloatMsg('יפה! +' + pts + ' 👍'); }
    else { showFloatMsg('+' + pts); }
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
  var screen = document.getElementById('screen-game');
  var hud    = document.getElementById('hud');
  var goal   = document.getElementById('goal-bar');

  var hudH  = hud  ? hud.offsetHeight  : 52;
  var goalH = (goal && goal.style.display !== 'none') ? goal.offsetHeight : 0;

  var availH = window.innerHeight - hudH - goalH;
  var availW = window.innerWidth;

  canvas.width  = availW;
  canvas.height = Math.max(200, availH);
  GS.canvasW    = canvas.width;
  GS.canvasH    = canvas.height;

  // Block dimensions scale with canvas width
  GS.blockW = Math.round(GS.canvasW * BLOCK_W_FRAC);
  GS.blockH = Math.max(22, Math.round(GS.canvasH * BLOCK_H_FRAC));

  // Ground level: the tower base sits at the bottom
  GS.topY = GS.canvasH - GS.blockH; // world Y of the top of the "ground" platform
}

// ── Camera scroll ─────────────────────────────────────────
function updateCamera() {
  // We want the top of the tower to stay in the upper third of the canvas
  var towerTopCanvas = GS.topY - GS.cameraOffset;
  var desiredTop     = GS.canvasH * 0.30;
  if (towerTopCanvas < desiredTop) {
    GS.targetCameraOffset += desiredTop - towerTopCanvas;
  }
}

function applyCamera() {
  // Smooth scroll
  GS.cameraOffset += (GS.targetCameraOffset - GS.cameraOffset) * 0.08;
}

// ── Draw ──────────────────────────────────────────────────
function renderFrame() {
  ctx.clearRect(0, 0, GS.canvasW, GS.canvasH);

  // Sky gradient background
  var sky = ctx.createLinearGradient(0, 0, 0, GS.canvasH);
  sky.addColorStop(0, '#87ceeb');
  sky.addColorStop(1, '#3a8bc7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GS.canvasW, GS.canvasH);

  // Cloud decorations (static for performance)
  drawClouds();

  // Ground platform
  drawGround();

  // Placed tower floors
  for (var i = 0; i < GS.floors.length; i++) {
    drawFloor(GS.floors[i]);
  }

  // Swinging / falling block (only during game)
  if (GS.running && !GS.paused) {
    drawActiveBlock();
  }

  // Particles
  updateAndDrawParticles();

  // Swing indicator (arrow above block)
  if (GS.running && !GS.paused && !GS.dropping) {
    drawSwingIndicator();
  }
}

// ── Ground platform ────────────────────────────────────────
function drawGround() {
  var groundY = GS.topY - GS.cameraOffset + GS.blockH;  // canvas Y of ground surface
  // Grass strip
  ctx.fillStyle = '#4ade80';
  roundRect(ctx, 0, groundY, GS.canvasW, GS.canvasH - groundY + GS.canvasH, 0);
  ctx.fill();
  // Dark earth below
  ctx.fillStyle = '#166534';
  ctx.fillRect(0, groundY + 14, GS.canvasW, GS.canvasH);
}

// ── Tower floors ───────────────────────────────────────────
function drawFloor(fl) {
  var cy = fl.y + GS.blockH - GS.cameraOffset; // canvas Y bottom of this floor
  var top = cy - GS.blockH;
  if (top > GS.canvasH || cy < 0) return; // off-screen culling

  var x = fl.x, w = fl.w, h = GS.blockH;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  roundRect(ctx, x + 3, top + 3, w, h, 8); ctx.fill();
  ctx.restore();

  // Block body
  ctx.fillStyle = fl.color;
  roundRect(ctx, x, top, w, h, 8); ctx.fill();

  // Shine highlight
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  roundRect(ctx, x + 4, top + 4, w - 8, h * 0.38, 5); ctx.fill();
  ctx.restore();

  // Darker edge stroke
  ctx.strokeStyle = darken(fl.color);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  roundRect(ctx, x, top, w, h, 8); ctx.stroke();
}

// ── Active (swinging or falling) block ─────────────────────
function drawActiveBlock() {
  var x, y;

  if (GS.dropping) {
    x = GS.blockX;
    y = GS.dropY;
  } else {
    x = GS.blockX;
    // Draw at fixed height above current tower top, adjusted by camera
    var towerTopCanvas = GS.topY - GS.cameraOffset;
    y = towerTopCanvas - GS.blockH - 55;
  }

  var w = GS.blockW, h = GS.blockH;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  roundRect(ctx, x + 3, y + 3, w, h, 8); ctx.fill();
  ctx.restore();

  // Block body
  ctx.fillStyle = GS.blockColor;
  roundRect(ctx, x, y, w, h, 8); ctx.fill();

  // Shine
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  roundRect(ctx, x + 4, y + 4, w - 8, h * 0.38, 5); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = darken(GS.blockColor);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  roundRect(ctx, x, y, w, h, 8); ctx.stroke();
}

// ── Swing indicator (arrow showing block centre) ───────────
function drawSwingIndicator() {
  var towerTopCanvas = GS.topY - GS.cameraOffset;
  var indicatorY = towerTopCanvas - 18;
  var blockCX = GS.blockX + GS.blockW / 2;

  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle   = '#ffe14d';
  ctx.beginPath();
  ctx.moveTo(blockCX,       indicatorY);
  ctx.lineTo(blockCX - 8,   indicatorY - 12);
  ctx.lineTo(blockCX + 8,   indicatorY - 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Clouds (purely decorative) ─────────────────────────────
var clouds = null;
function initClouds() {
  clouds = [];
  for (var i = 0; i < 5; i++) {
    clouds.push({
      x:    Math.random() * 1.2,   // fraction of canvasW
      y:    0.05 + Math.random() * 0.35,
      r:    18 + Math.random() * 20,
      spd:  0.00008 + Math.random() * 0.00012,
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
    cl.x = (cl.x + cl.spd) % 1.3; // slow drift
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
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
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
  GS.particles = GS.particles.filter(function(p) { return p.life > 0; });
  GS.particles.forEach(function(p) {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.12;
    p.life -= 0.035;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Floating message ───────────────────────────────────────
var floatTimer = null;
function showFloatMsg(text) {
  var el = document.getElementById('float-msg');
  el.textContent   = text;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetWidth; // reflow to restart animation
  el.style.animation = '';
  clearTimeout(floatTimer);
  floatTimer = setTimeout(function(){ el.style.display = 'none'; }, 1200);
}

// ════════════════════════════════════════════════════════════
// 11. GAME FLOW
// ════════════════════════════════════════════════════════════

function startGame() {
  resetRuntime();
  SoundFX.unlock();

  var cfg = DIFF_CFG[GS.diff];
  GS.lives = cfg.lives;
  GS.blockW = Math.round(GS.canvasW * BLOCK_W_FRAC);
  GS.blockH = Math.max(22, Math.round(GS.canvasH * BLOCK_H_FRAC));
  GS.topY   = GS.canvasH - GS.blockH;  // world top of ground
  colorIdx  = 0;
  perfectsThisGame = 0;
  GS.blockColor = BLOCK_COLORS[0];
  GS.nextColor  = BLOCK_COLORS[1];

  // Show game screen
  showScreen('screen-game');

  // Init canvas dimensions now screen is visible
  resizeCanvas();

  // Setup challenge goal bar
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

  // Update best in HUD
  document.getElementById('hud-best').textContent =
    getBestScore(GS.mode, GS.diff);

  updateHUD();
  initBlock();

  GS.running = true;
  GS.loopId  = requestAnimationFrame(mainLoop);
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
  GS.lastTs = 0; // reset to avoid jump
}

function restartGame() {
  document.getElementById('overlay-pause').style.display   = 'none';
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

  // Encouragement message based on floors reached
  var msg;
  if (GS.floor >= 15)     msg = 'מגדל ענק! 🏙️';
  else if (GS.floor >= 8) msg = 'כל הכבוד! 🎉';
  else if (GS.floor >= 4) msg = 'יפה מאוד! 😊';
  else                     msg = 'נסה שוב — תוכל להצליח! 💪';

  document.getElementById('go-title').textContent = '💥 המשחק נגמר!';
  document.getElementById('go-msg').textContent   = msg;
  document.getElementById('go-stats').innerHTML   =
    'ניקוד: ' + GS.score + '<br>קומות: ' + GS.floor + '<br>רמה: ' + cfg.label;
  document.getElementById('go-best-badge').style.display = isNew ? 'block' : 'none';
  document.getElementById('overlay-gameover').style.display = 'flex';
}

function checkChallengeGoal() {
  var lvl = CHALLENGE_LEVELS[GS.challengeLevel];
  if (!lvl) return;
  var progress = 0, target = lvl.target;

  if (lvl.type === 'floors') {
    progress = GS.floor;
  } else if (lvl.type === 'perfects') {
    progress = perfectsThisGame;
  } else if (lvl.type === 'score') {
    progress = GS.score;
  } else if (lvl.type === 'survive') {
    progress = GS.floor;
    var cfg   = DIFF_CFG[GS.diff];
    var lost  = cfg.lives - GS.lives;
    if (lost > (lvl.maxLost || 0)) { endGame(); return; }
  }

  // Update goal progress bar
  var pct = Math.min(100, Math.round(progress / target * 100));
  document.getElementById('goal-fill').style.width = pct + '%';

  if (progress >= target) {
    winChallenge();
  }
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

function updateHUD() {
  updateScoreUI();
  updateLivesUI();
}

function updateScoreUI() {
  document.getElementById('hud-score').textContent = GS.score;
}

function updateLivesUI() {
  var hearts = '';
  for (var i = 0; i < GS.lives; i++) hearts += '❤️';
  for (var j = GS.lives; j < DIFF_CFG[GS.diff].lives; j++) hearts += '🖤';
  document.getElementById('hud-lives').textContent = hearts;
}

function updateMenuDisplay() {
  // Best scores
  var bestRow = document.getElementById('best-row');
  var bestT = getBestScore('tower',     GS.diff);
  var bestC = getBestScore('challenge', GS.diff);
  var parts = [];
  if (bestT > 0) parts.push('🏆 מגדל: ' + bestT);
  if (bestC > 0) parts.push('🎯 אתגר: ' + bestC);
  bestRow.textContent = parts.join('   |   ');

  // Challenge level dots
  updateChallengeDots();

  // Difficulty buttons sync
  document.querySelectorAll('.diff-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.diff === GS.diff);
  });
  // Mode buttons sync
  document.querySelectorAll('.sel-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.mode === GS.mode);
  });

  // Show/hide challenge progress
  var showProgress = GS.mode === 'challenge';
  document.getElementById('challenge-progress').style.display = showProgress ? '' : 'none';
}

function updateChallengeDots() {
  var container = document.getElementById('lvl-dots');
  var progress  = getChallengeProgress();
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
  // Set drop start position to match current swing position
  var towerTopCanvas = GS.topY - GS.cameraOffset;
  GS.dropY  = towerTopCanvas - GS.blockH - 55;
  GS.dropVY = 0;
}

// Canvas click / tap
document.addEventListener('DOMContentLoaded', function() {
  var gameCanvas = document.getElementById('game-canvas');
  gameCanvas.addEventListener('click',      handleDrop);
  gameCanvas.addEventListener('touchstart', function(e){ e.preventDefault(); handleDrop(); }, { passive: false });

  // Spacebar
  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (document.getElementById('screen-game').classList.contains('active')) {
        handleDrop();
      }
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (GS.running && !GS.paused) pauseGame();
      else if (GS.paused) resumeGame();
    }
  });
});

// ════════════════════════════════════════════════════════════
// 14. MENU WIRING
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {

  // ── Load saved difficulty ──────────────────────────────
  GS.diff = getSavedDiff();

  // ── Mode buttons ───────────────────────────────────────
  document.querySelectorAll('.sel-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.sel-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      GS.mode = btn.dataset.mode;
      var showChallenge = GS.mode === 'challenge';
      document.getElementById('challenge-progress').style.display = showChallenge ? '' : 'none';
    });
  });

  // ── Difficulty buttons ──────────────────────────────────
  document.querySelectorAll('.diff-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.diff-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      GS.diff = btn.dataset.diff;
      saveDiff(GS.diff);
      updateMenuDisplay();
    });
  });

  // ── Play button ─────────────────────────────────────────
  document.getElementById('btn-play').addEventListener('click', function() {
    SoundFX.unlock();
    startGame();
  });

  // ── How to play ─────────────────────────────────────────
  document.getElementById('btn-howto').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'flex';
  });
  document.getElementById('btn-howto-close').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'none';
  });

  // ── Sound toggle ────────────────────────────────────────
  document.getElementById('btn-sound').addEventListener('click', function() {
    GS.soundOn = !GS.soundOn;
    this.textContent = GS.soundOn ? '🔊 פועל' : '🔇 כבוי';
    BgMusic.toggle(GS.soundOn);
  });

  // ── Pause button (in HUD) ───────────────────────────────
  document.getElementById('btn-pause').addEventListener('click', function() {
    if (GS.paused) resumeGame(); else pauseGame();
  });

  // ── Pause overlay buttons ───────────────────────────────
  document.getElementById('btn-resume').addEventListener('click',     resumeGame);
  document.getElementById('btn-restart').addEventListener('click',    restartGame);
  document.getElementById('btn-pause-menu').addEventListener('click', goToMenu);

  // ── Game over overlay buttons ───────────────────────────
  document.getElementById('btn-play-again').addEventListener('click', restartGame);
  document.getElementById('btn-go-menu').addEventListener('click',    goToMenu);

  // ── Win overlay buttons ─────────────────────────────────
  document.getElementById('btn-win-menu').addEventListener('click', goToMenu);
  // btn-next-level is wired dynamically in winChallenge()

  // ── Resize ──────────────────────────────────────────────
  window.addEventListener('resize', function() {
    if (document.getElementById('screen-game').classList.contains('active')) {
      resizeCanvas();
    }
  });

  // ── Initial menu state ──────────────────────────────────
  updateMenuDisplay();
});

// ════════════════════════════════════════════════════════════
// 15. MAIN LOOP
// ════════════════════════════════════════════════════════════

function mainLoop(ts) {
  if (!GS.running) return;

  GS.loopId = requestAnimationFrame(mainLoop);

  if (GS.paused) { renderFrame(); return; }

  // Update camera smooth scroll
  applyCamera();

  // Update game logic
  if (!GS.dropping) {
    updateSwing();
  } else {
    updateDrop();
  }

  renderFrame();
}

// ════════════════════════════════════════════════════════════
// 16. BOOT
// ════════════════════════════════════════════════════════════

// Show audio banner if autoplay is likely blocked
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (document.getElementById('audio-banner') && !document.getElementById('audio-banner').hidden) {
      document.getElementById('audio-banner').style.display = 'block';
      setTimeout(function(){
        var b = document.getElementById('audio-banner');
        if (b) b.style.display = 'none';
      }, 4000);
    }
  }, 800);
});
