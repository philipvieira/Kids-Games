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

  // Block colour + sprite
  blockColor:  '#60a5fa',
  nextColor:   '#f87171',
  blockSprite: null,   // current sprite cell { x, y }
  nextSprite:  null,

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

  // Tumble state (block tipping off edge)
  tumbling: false,
  tumble:   null,

  // Tower sway (visual wobble when block lands off-centre)
  swayAngle:  0,   // current sway offset in pixels (horizontal shift at top)
  swayVel:    0,   // sway velocity
  swayOrigin: 0,   // resting position (always 0)

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
  GS.swingT         = -Math.PI / 2;
  GS.angle          = 0;
  GS.ropeDrawH      = GS.ropeLen || 100;
  GS.hookCanvasX    = GS.pivotX  || 0;
  GS.hookCanvasY    = (GS.pivotY || 0) + (GS.ropeLen || 100);
  GS.tumbling       = false;
  GS.tumble         = null;
  GS.swayAngle      = 0;
  GS.swayVel        = 0;
  GS.perfectBounce  = 0;
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
// 6. BLOCK IMAGES  (block1.png … block9.png — individual files)
// ════════════════════════════════════════════════════════════

const BLOCK_IMG_COUNT = 9;
var blockImgs    = [];
var blockImgsRdy = 0;

(function loadBlockImgs() {
  for (var i = 1; i <= BLOCK_IMG_COUNT; i++) {
    var img = new Image();
    img.onload = function() { blockImgsRdy++; };
    img.src = 'assets/block' + i + '.png';
    blockImgs.push(img);
  }
})();

// ── Crane images ──────────────────────────────────────────
var craneBarImg  = new Image();
var craneRopeImg = new Image();
var craneBarReady  = false;
var craneRopeReady = false;
craneBarImg.onload  = function() { craneBarReady  = true; };
craneRopeImg.onload = function() { craneRopeReady = true; };
craneBarImg.src  = 'assets/cranebar.png';
craneRopeImg.src = 'assets/cranerope.png';

function randomSprite() {
  // Returns an index 0-8
  return Math.floor(Math.random() * BLOCK_IMG_COUNT);
}

// BLOCK COLOURS kept as fallback while images load
const BLOCK_COLORS = [
  '#60a5fa','#f87171','#4ade80','#facc15',
  '#c084fc','#fb923c','#34d399','#f472b6','#a78bfa',
];
var colorIdx = 0;
function nextColor() {
  colorIdx = (colorIdx + 1) % BLOCK_COLORS.length;
  return BLOCK_COLORS[colorIdx];
}

// ════════════════════════════════════════════════════════════
// 7. CRANE / PENDULUM PHYSICS
// ════════════════════════════════════════════════════════════

// Initialise a new block at the crane
function initBlock() {
  GS.dropping    = false;
  GS.tumbling    = false;
  GS.dropVY      = 0;
  GS.blockColor  = GS.nextColor  || BLOCK_COLORS[0];
  GS.blockSprite = GS.nextSprite || randomSprite();
  GS.nextColor   = nextColor();
  GS.nextSprite  = randomSprite();
  // Start swing from left edge (swingT = -π/2 → sin = -1 = full left)
  GS.swingT      = -Math.PI / 2;
  GS.angle       = -currentSwingAmp();
  GS.perfectBounce = 0;
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
function updateSwing(dt) {
  var scale = dt / 16.667;
  GS.swingT += currentSwingSpeed() * scale;
  GS.angle   = Math.sin(GS.swingT) * currentSwingAmp();
}

// Release block — falls straight down from hook position
function handleDrop() {
  if (!GS.running || GS.paused || GS.dropping || GS.tumbling) return;
  SoundFX.unlock();
  GS.dropping = true;

  // Block centre at release: hook X, hook Y + half block size
  var blockCanvasX = GS.hookCanvasX;
  var blockCanvasY = GS.hookCanvasY + GS.blockSz / 2;
  GS.dropX  = blockCanvasX;
  GS.dropY  = (GS.canvasH - blockCanvasY) + GS.cameraY;
  GS.dropVY = 0;
}

// ── Drop physics ──────────────────────────────────────────
function updateDrop(dt) {
  var scale = dt / 16.667;
  GS.dropVY += 0.55 * scale;
  GS.dropVY  = Math.min(GS.dropVY, 24);
  GS.dropY  -= GS.dropVY * scale;

  var blockBot = GS.dropY - GS.blockSz / 2;
  if (blockBot <= towerTopWorld()) {
    landBlock();
  }
}

// ── Tumble state — block tipping off the edge ─────────────
// GS.tumble = { x, y(world), vx, vy, angle, avel, dir, color }
function updateTumble(dt) {
  if (!GS.tumble) return;
  var scale = dt / 16.667;
  var t = GS.tumble;

  t.vy    -= 0.55 * scale;             // gravity (world Y decreases downward)
  t.y     += t.vy * scale;
  t.x     += t.vx * scale;
  t.angle += t.avel * scale;

  // Off screen / fallen below ground → life over
  var canY = toCanvasY(t.y);
  if (canY > GS.canvasH + GS.blockSz * 2) {
    GS.tumble   = null;
    GS.tumbling = false;
    if (GS.lives <= 0) { endGame(); return; }
    initBlock();
    updateHUD();
  }
}

// ── Land ──────────────────────────────────────────────────
function landBlock() {
  var blockCX    = GS.dropX;
  var blockLeft  = blockCX - GS.blockSz / 2;
  var blockRight = blockCX + GS.blockSz / 2;

  // Tower top surface
  var towerCX, towerW, towerL, towerR;
  if (GS.floors.length === 0) {
    towerCX = GS.gameX + GS.gameW / 2;
    towerW  = GS.gameW;
  } else {
    var top = GS.floors[GS.floors.length - 1];
    towerCX = top.x + top.w / 2;
    towerW  = top.w;
  }
  towerL = towerCX - towerW / 2;
  towerR = towerCX + towerW / 2;

  var overlapL = Math.max(blockLeft, towerL);
  var overlapR = Math.min(blockRight, towerR);
  var overlap  = overlapR - overlapL;

  // ── Complete miss ──────────────────────────────────────
  if (overlap <= 4) {
    missBlock();
    return;
  }

  // ── How far off-centre? ────────────────────────────────
  var offset    = blockCX - towerCX;          // signed: + = right of centre
  var absOffset = Math.abs(offset);
  var cfg       = getCfg();
  var isPerfect = absOffset < GS.blockSz * cfg.perfectZone;

  // ── Wobble threshold: if block overhangs > 65% of its width, it tumbles off ──
  // Raising from 0.40 → 0.65 makes landing much more forgiving for kids
  var WOBBLE_FRAC   = 0.65;
  var maxOverhang   = GS.blockSz * WOBBLE_FRAC;
  var overhangLeft  = towerL - blockLeft;   // how much block extends left of tower (>0 = overhang)
  var overhangRight = blockRight - towerR;  // how much block extends right of tower (>0 = overhang)

  var tipDir = 0;  // 0 = land ok, -1 = tip left, 1 = tip right
  if (overhangLeft  > maxOverhang) tipDir = -1;
  if (overhangRight > maxOverhang) tipDir =  1;

  if (tipDir !== 0) {
    // Block tips off — animate tumble, lose a life
    GS.dropping = false;
    GS.tumbling = true;
    GS.lives--;
    GS.combo = 0;
    SoundFX.miss();
    showFloatMsg('כמעט! -לב 💔');

    // Pivot: the block rotates around the edge of the tower it touched
    var pivotX = tipDir === 1 ? towerR : towerL;
    var blockLandY = towerTopWorld();           // world Y of tower top = block bottom when landing

    // Initial tumble state
    GS.tumble = {
      x:     blockCX,
      y:     blockLandY + GS.blockSz / 2,
      vx:    tipDir * 1.2,
      vy:    0,
      angle: 0,
      avel:  tipDir * 0.08,
      dir:   tipDir,
      color: GS.blockColor,
      sprite: GS.blockSprite,
      pivotX: pivotX,
    };

    spawnParticles(blockCX, toCanvasY(blockLandY + GS.blockSz / 2), GS.blockColor, 8);
    updateHUD();
    // Don't call initBlock here — wait for tumble to finish (updateTumble handles it)
    return;
  }

  // ── Normal landing ─────────────────────────────────────
  // Block lands at exactly dropX, centred there, full size
  var newX = Math.max(GS.gameX, Math.min(GS.gameX + GS.gameW - GS.blockSz, blockCX - GS.blockSz / 2));
  var newW = GS.blockSz;

  var floorWorldY = towerTopWorld();
  GS.floors.push({ x: newX, w: newW, h: GS.blockSz, worldY: floorWorldY, color: GS.blockColor, sprite: GS.blockSprite });
  GS.floor++;

  // Trigger tower sway proportional to how off-centre the block landed
  if (!isPerfect && GS.floor > 1) {
    var swayKick = (offset / GS.blockSz) * 18;
    GS.swayVel += swayKick;
  } else if (isPerfect) {
    GS.swayVel *= 0.4;
    GS.perfectBounce = 1.0;  // start bounce animation
  }

  scoreBlock(isPerfect, absOffset, towerW);
  spawnParticles(blockCX, toCanvasY(floorWorldY + GS.blockSz / 2), GS.blockColor, isPerfect ? 16 : 8);
  if (isPerfect) {
    if (GS.combo > 1) SoundFX.combo(); else SoundFX.perfect();
  } else {
    SoundFX.land();
  }

  updateCamera();

  if (isPerfect) perfectsThisGame++;
  if (GS.mode === 'challenge') checkChallengeGoal();
  if (!GS.running) return;

  initBlock();
  updateHUD();
}

// ── Miss (complete miss — block never touched tower) ───────
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

  // Crane pivot: horizontally centred, vertically at bottom of cranebar image
  GS.pivotX   = GS.gameX + Math.round(GS.gameW / 2);
  var barH    = Math.max(28, Math.round(GS.blockSz * 0.40));
  GS.pivotY   = barH;   // rope hangs from bottom edge of bar

  // Rope length: hangs block comfortably below the bar
  GS.ropeLen  = Math.round(GS.canvasH * 0.26);
}

// ── Camera ────────────────────────────────────────────────
function updateCamera() {
  var ttw = towerTopWorld();
  // The crane block hangs at canvas Y = pivotY + ropeLen + blockSz/2 (bottom of hanging block).
  // We want tower top canvas Y to be at least CRANE_CLEARANCE px below that.
  // toCanvasY(ttw) = canvasH - (ttw - cameraY)
  // We want: canvasH - (ttw - cameraY) >= craneBottom + CRANE_CLEARANCE
  // So: cameraY >= ttw - canvasH + craneBottom + CRANE_CLEARANCE
  var CRANE_CLEARANCE = 140;  // px gap between crane block bottom and tower top
  var craneBottom = GS.pivotY + GS.ropeLen + GS.blockSz / 2 + CRANE_CLEARANCE;
  var minCameraY  = ttw - GS.canvasH + craneBottom;
  GS.targetCameraY = Math.max(0, minCameraY);
}
function applyCamera(dt) {
  var scale = dt / 16.667;
  GS.cameraY += (GS.targetCameraY - GS.cameraY) * 0.07 * scale;
}

// ── Tower sway (spring-damper) ────────────────────────────
// swayAngle is the horizontal pixel shift of the top of the tower.
// It springs back to 0 like a pendulum.
function applySway(dt) {
  if (Math.abs(GS.swayAngle) < 0.1 && Math.abs(GS.swayVel) < 0.1) {
    GS.swayAngle = 0; GS.swayVel = 0; return;
  }
  var scale   = dt / 16.667;
  var SPRING  = 0.018;   // spring stiffness — pulls back to 0
  var DAMPING = 0.88;    // damping — fraction of velocity kept each frame
  GS.swayVel    += -GS.swayAngle * SPRING * scale;
  GS.swayVel    *= Math.pow(DAMPING, scale);
  GS.swayAngle  += GS.swayVel * scale;
}

// ── Main render ───────────────────────────────────────────
function renderFrame() {
  if (!ctx) return;
  ctx.clearRect(0, 0, GS.canvasW, GS.canvasH);

  drawSky();
  drawLetterbox();
  drawClouds();
  drawGround();

  for (var i = 0; i < GS.floors.length; i++) drawFloor(GS.floors[i], i, GS.floors.length);

  if (GS.running) {
    // drawCraneArm draws bar + rope + hanging block (when not dropping/tumbling) in one pass
    drawCraneArm();
    if (GS.dropping) {
      drawFallingBlock();
    } else if (GS.tumbling) {
      drawTumblingBlock();
    }
    // Hanging block + drop hint are drawn inside drawCraneArm when !dropping && !tumbling
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
function drawFloor(fl, floorIndex, totalFloors) {
  var h         = fl.h;
  var topCanvas = toCanvasY(fl.worldY + h);
  var botCanvas = toCanvasY(fl.worldY);
  if (topCanvas > GS.canvasH || botCanvas < 0) return;

  // Sway: floors higher up sway more
  var swayFrac = totalFloors > 1 ? floorIndex / (totalFloors - 1) : 0;
  var swayX    = GS.swayAngle * swayFrac;
  var x = fl.x + swayX, w = fl.w;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(x + 4, topCanvas + 4, w, h);
  ctx.fill();
  ctx.restore();

  drawFaceBlock(x, topCanvas, w, h, fl.sprite, fl.color, 1);
}

// ── Core sprite-sheet block draw ──────────────────────────
// Draws one face block from the sprite sheet. Falls back to solid colour if image not ready.
// scale: 1 = normal, >1 = bounce expand, centred on block
function drawFaceBlock(x, y, w, h, sprite, color, scale) {
  var cx = x + w / 2, cy = y + h / 2;

  ctx.save();
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }

  if (facesLoaded && sprite) {
    ctx.drawImage(
      facesImg,
      sprite.x, sprite.y, SPRITE_CELL, SPRITE_CELL,
      x, y, w, h
    );
  } else {
    // Fallback: solid colour block while image loads
    ctx.fillStyle = color || '#60a5fa';
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = darken(color || '#60a5fa');
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// ── Letterbox (desktop side panels) ──────────────────────
function drawLetterbox() {
  if (GS.gameX <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, GS.gameX, GS.canvasH);
  ctx.fillRect(GS.gameX + GS.gameW, 0, GS.gameX, GS.canvasH);
}

// ── Crane system ─────────────────────────────────────────
//
// Strategy: draw bar, rope, AND block all in ONE pass.
// The rope image + block are drawn in a SINGLE rotated ctx.save/restore,
// so they are geometrically guaranteed to be connected — no offset drift.
//
//  Canvas layout (angle = 0, straight down):
//
//    y = 0            ┌──────── cranebar ────────┐
//    y = barH         pivot (rotation origin)
//    y = barH+ropeLen   hook tip
//    y = barH+ropeLen+blockSz  bottom of block
//
// The block top is drawn at (−blockSz/2, ropeLen) in rotated space,
// so it starts exactly where the hook ends.
//
// GS.hookX / GS.hookY are written here and used by handleDrop to
// capture the drop position.
function drawCraneArm() {
  var barH   = Math.max(28, Math.round(GS.blockSz * 0.40));
  var ropeLen = GS.ropeLen;
  var sz      = GS.blockSz;

  // ── 1. Crane bar (fixed, full game width) ──────────────
  if (craneBarReady) {
    ctx.drawImage(craneBarImg, GS.gameX, 0, GS.gameW, barH);
  } else {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(GS.gameX, 0, GS.gameW, barH);
  }

  // Pivot = centre of bar, bottom edge
  var pivX = GS.gameX + Math.round(GS.gameW / 2);
  var pivY = barH;

  // Write to GS so handleDrop and blockCentreCanvas are in sync
  GS.pivotX    = pivX;
  GS.pivotY    = pivY;
  GS.ropeDrawH = ropeLen;

  // ── 2. Rope + block in one rotated context ─────────────
  // Everything below is in LOCAL space: (0,0) = pivot, y grows downward.
  // rope top = (0, 0)  →  rope bottom / hook tip = (0, ropeLen)
  // block top = (−sz/2, ropeLen)  →  block bottom = (−sz/2, ropeLen+sz)
  var ropeW = Math.round(sz * 0.75);

  ctx.save();
  ctx.translate(pivX, pivY);
  ctx.rotate(GS.angle);

  // Rope image: centred on x=0, from y=0 to y=ropeLen
  if (craneRopeReady) {
    ctx.drawImage(craneRopeImg, -ropeW / 2, 0, ropeW, ropeLen);
  } else {
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth   = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, ropeLen);
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(0, ropeLen, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Block: drawn directly below rope, top at y=ropeLen
  if (!GS.dropping && !GS.tumbling) {
    var scale = 1;
    if (GS.perfectBounce > 0) {
      scale = 1 + GS.perfectBounce * 0.05;
      GS.perfectBounce = Math.max(0, GS.perfectBounce - 0.06);
    }
    // Shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle   = '#000';
    ctx.fillRect(-sz / 2 + 4, ropeLen + 4, sz, sz);
    ctx.globalAlpha = 1;

    // Scale around block centre if needed
    if (scale !== 1) {
      ctx.save();
      ctx.translate(0, ropeLen + sz / 2);
      ctx.scale(scale, scale);
      ctx.translate(0, -(ropeLen + sz / 2));
    }
    var img = (GS.blockSprite !== null && GS.blockSprite >= 0) ? blockImgs[GS.blockSprite] : null;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -sz / 2, ropeLen, sz, sz);
    } else {
      ctx.fillStyle = GS.blockColor || '#60a5fa';
      ctx.fillRect(-sz / 2, ropeLen, sz, sz);
    }
    if (scale !== 1) ctx.restore();

    // Drop hint arrow below block
    var ay = ropeLen + sz + 14;
    ctx.globalAlpha = 0.70 + 0.30 * Math.sin(Date.now() / 300);
    ctx.fillStyle   = '#ffe14d';
    ctx.beginPath();
    ctx.moveTo(0,    ay);
    ctx.lineTo(-10,  ay - 16);
    ctx.lineTo(10,   ay - 16);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // ── Write hook world position for handleDrop ───────────
  // Hook tip in canvas space (used when player taps to drop)
  GS.hookCanvasX = pivX + Math.sin(GS.angle) * ropeLen;
  GS.hookCanvasY = pivY + Math.cos(GS.angle) * ropeLen;
}

// Block centre in canvas coords (used by handleDrop and legacy refs)
function blockCentreCanvas() {
  return {
    x: GS.hookCanvasX || GS.pivotX,
    y: (GS.hookCanvasY || GS.pivotY) + GS.blockSz / 2
  };
}

// ── Hanging block on the crane rope ───────────────────────
function drawHangingBlock() {
  var pos   = blockCentreCanvas();
  var sz    = GS.blockSz;
  // Perfect bounce: scale from 1.05 → 1.0 over ~300ms
  var scale = 1;
  if (GS.perfectBounce > 0) {
    scale = 1 + GS.perfectBounce * 0.05;
    GS.perfectBounce = Math.max(0, GS.perfectBounce - 0.06);
  }
  drawFaceBlock(pos.x - sz / 2, pos.y - sz / 2, sz, sz, GS.blockSprite, GS.blockColor, scale);
}

// ── Falling block ─────────────────────────────────────────
function drawFallingBlock() {
  var sz   = GS.blockSz;
  var canY = toCanvasY(GS.dropY);
  drawFaceBlock(GS.dropX - sz / 2, canY - sz / 2, sz, sz, GS.blockSprite, GS.blockColor, 1);
}

// ── Tumbling block (tipping off edge) ─────────────────────
function drawTumblingBlock() {
  if (!GS.tumble) return;
  var t    = GS.tumble;
  var sz   = GS.blockSz;
  var canY = toCanvasY(t.y);

  ctx.save();
  ctx.translate(t.x, canY);
  ctx.rotate(t.angle);
  ctx.translate(-t.x, -canY);
  drawFaceBlock(t.x - sz / 2, canY - sz / 2, sz, sz, t.sprite, t.color, 1);
  ctx.restore();
}

// ── Core block draw — individual image files ──────────────
// spriteIdx: 0-8 index into blockImgs[]. color: fallback fill.
// scale: applied centred on the block (for bounce).
function drawFaceBlock(x, y, w, h, spriteIdx, color, scale) {
  var cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  // Shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle   = '#000';
  ctx.fillRect(x + 4, y + 4, w, h);
  ctx.globalAlpha = 1;

  var img = (spriteIdx !== null && spriteIdx >= 0) ? blockImgs[spriteIdx] : null;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    // Fallback while images load
    ctx.fillStyle = color || '#60a5fa';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = darken(color || '#60a5fa');
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}

// ── Kept for internal use only ────────────────────────────
function drawColorBlock(x, y, w, h, color) {
  drawFaceBlock(x, y, w, h, null, color, 1);
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
  GS.blockColor  = BLOCK_COLORS[0];
  GS.nextColor   = nextColor();
  GS.blockSprite = randomSprite();
  GS.nextSprite  = randomSprite();

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
    _lastTime  = 0;   // reset so first frame has clean dt
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

var _lastTime = 0;

function mainLoop(timestamp) {
  if (!GS.running) return;
  GS.loopId = requestAnimationFrame(mainLoop);

  // Delta time in ms, capped at 50ms (handles tab switching / slow frames)
  var dt = _lastTime ? Math.min(timestamp - _lastTime, 50) : 16.667;
  _lastTime = timestamp;

  if (!GS.paused) {
    applyCamera(dt);
    applySway(dt);
    if (GS.tumbling)      updateTumble(dt);
    else if (GS.dropping) updateDrop(dt);
    else                  updateSwing(dt);
  }

  renderFrame();
}
