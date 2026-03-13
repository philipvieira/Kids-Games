/*
 * ════════════════════════════════════════════════════════════
 *  בונה מגדלים — game.js  (Physics-based stacking / builder)
 *
 *  HOW TO RUN: Open index.html in any modern browser.
 *
 *  SECTIONS:
 *   1.  Constants & Config
 *   2.  Storage
 *   3.  Game State
 *   4.  Audio (SoundFX)
 *   5.  Challenge Level Definitions
 *   6.  Piece Definitions & Queue
 *   7.  Physics World (simplified rigid-body)
 *   8.  Rendering (Canvas)
 *   9.  Input Handling
 *  10.  Power-ups
 *  11.  Game Modes & Flow
 *  12.  HUD / UI Updates
 *  13.  Menu Wiring
 *  14.  Main Loop
 *  15.  Init
 * ════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

const PIECE_DEFS = [
  { id: 'square',    label: 'ריבוע',     w: 1.0, h: 1.0, shape: 'rect',     mass: 1.0  },
  { id: 'rect',      label: 'מלבן',      w: 1.6, h: 0.8, shape: 'rect',     mass: 1.3  },
  { id: 'triangle',  label: 'משולש',     w: 1.2, h: 1.0, shape: 'tri',      mass: 0.8  },
  { id: 'circle',    label: 'עיגול',     w: 1.0, h: 1.0, shape: 'circle',   mass: 0.9  },
  { id: 'arch',      label: 'קשת',       w: 1.4, h: 0.8, shape: 'arch',     mass: 1.1  },
  { id: 'plank',     label: 'קרש',       w: 2.4, h: 0.5, shape: 'rect',     mass: 1.8  },
  { id: 'heavy',     label: 'כבד',       w: 1.2, h: 1.2, shape: 'rect',     mass: 3.0, special: 'heavy'   },
  { id: 'bouncy',    label: 'קפיצי',     w: 1.0, h: 1.0, shape: 'circle',   mass: 0.7, special: 'bouncy'  },
  { id: 'sticky',    label: 'דביק',      w: 1.0, h: 0.9, shape: 'rect',     mass: 1.0, special: 'sticky'  },
  { id: 'star',      label: '⭐ כוכב',   w: 1.0, h: 1.0, shape: 'star',     mass: 0.6, special: 'star'    },
  { id: 'rainbow',   label: '🌈 קשת',    w: 1.2, h: 1.2, shape: 'circle',   mass: 1.0, special: 'rainbow' },
];

// Normal pool: first 6 regular pieces
const NORMAL_POOL = ['square','rect','triangle','circle','arch','plank'];
const SPECIAL_POOL = ['heavy','bouncy','sticky','star','rainbow'];

const PIECE_COLORS = {
  square:   '#f87171', rect:    '#fb923c', triangle: '#facc15',
  circle:   '#4ade80', arch:    '#60a5fa', plank:    '#a78bfa',
  heavy:    '#94a3b8', bouncy:  '#f472b6', sticky:   '#86efac',
  star:     '#fde68a', rainbow: 'rainbow',
};

const CELL = 40; // base grid unit in pixels (scaled later)

const DIFF_CFG = {
  easy:   { fallSpd: 1.8, gravity: 0.07, wobble: 0.018, collapseRatio: 0.5,  puChance: 0.2,  hintDelay: 3000, tipAngle: 0.22 },
  normal: { fallSpd: 2.8, gravity: 0.10, wobble: 0.030, collapseRatio: 0.35, puChance: 0.12, hintDelay: 5000, tipAngle: 0.17 },
  hard:   { fallSpd: 4.0, gravity: 0.14, wobble: 0.045, collapseRatio: 0.25, puChance: 0.06, hintDelay: 9000, tipAngle: 0.12 },
};

// Power-up definitions
const PU_DEFS = [
  { id: 'slowtime',   icon: '🐢', name: 'עצור זמן',   dur: 5000  },
  { id: 'stabilize',  icon: '🧱', name: 'יציבות',     dur: 6000  },
  { id: 'undo',       icon: '↩️',  name: 'בטל',        dur: 0     },
  { id: 'giant',      icon: '🦾', name: 'ענק',         dur: 0     },
];

// ════════════════════════════════════════════════════════════
// 2. STORAGE
// ════════════════════════════════════════════════════════════

const Storage = {
  key(mode, diff) { return 'bg_best_' + mode + '_' + diff; },
  getBest(mode, diff) { return parseInt(localStorage.getItem(Storage.key(mode,diff)) || '0', 10); },
  saveBest(mode, diff, val) {
    if (val > Storage.getBest(mode, diff)) {
      localStorage.setItem(Storage.key(mode, diff), String(val));
      return true;
    }
    return false;
  },
  getChallengeProgress() { return parseInt(localStorage.getItem('bg_challenge') || '0', 10); },
  saveChallengeProgress(n) { localStorage.setItem('bg_challenge', String(n)); },
  getSettings() { try { return JSON.parse(localStorage.getItem('bg_settings') || '{}'); } catch(e) { return {}; } },
  saveSettings(obj) {
    const cur = Storage.getSettings();
    localStorage.setItem('bg_settings', JSON.stringify(Object.assign(cur, obj)));
  },
};

// ════════════════════════════════════════════════════════════
// 3. GAME STATE
// ════════════════════════════════════════════════════════════

const GS = {
  mode:   'tower',
  diff:   'easy',
  soundOn: true,

  running:  false,
  paused:   false,
  busy:     false,

  canvasW:  320,
  canvasH:  480,
  cellPx:   40,    // scaled CELL size

  score:    0,
  blocksPlaced: 0,
  towerHeight:  0,   // in cells from ground
  maxHeight:    0,

  challengeLevel: 0,
  challengeDone:  false,
  goalTimer:      0,   // for "hold for N seconds" goals

  currentPiece: null,  // the falling piece
  pieceQueue:   [],    // upcoming pieces
  placedPieces: [],    // all settled pieces (simple AABB physics)

  activePU:     null,  // { def, startMs, endMs }
  puQueue:      [],    // earned power-ups
  starBonus:    [],    // { id, t } active star pieces

  particles:    [],
  floatMsgTimer: 0,

  cameraY: 0,       // world-Y that maps to canvas ground line (scrolls as tower grows)

  lastTs:  0,
  loopId:  null,

  // Input
  moveLeft:  false,
  moveRight: false,
  softDrop:  false,
  moveTimer: 0,
};

function resetRuntime() {
  GS.running       = false;
  GS.paused        = false;
  GS.busy          = false;
  GS.score         = 0;
  GS.blocksPlaced  = 0;
  GS.towerHeight   = 0;
  GS.maxHeight     = 0;
  GS.currentPiece  = null;
  GS.pieceQueue    = [];
  GS.placedPieces  = [];
  GS.activePU      = null;
  GS.puQueue       = [];
  GS.starBonus     = [];
  GS.particles     = [];
  GS.floatMsgTimer = 0;
  GS.goalTimer     = 0;
  GS.challengeDone = false;
  GS.moveLeft      = false;
  GS.moveRight     = false;
  GS.softDrop      = false;
  GS.moveTimer     = 0;
  GS.cameraY       = 0;   // will be set properly in resizeCanvas after screen is active
  if (GS.loopId) { cancelAnimationFrame(GS.loopId); GS.loopId = null; }
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let ctx = null, unlocked = false;
  function getCtx() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
    return ctx;
  }
  function unlock() {
    if (unlocked) return;
    const c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
    document.getElementById('audio-banner').style.display = 'none';
    BgMusic.play();
  }
  function tone(freq, dur, type, vol) {
    if (!GS.soundOn) return;
    const c = getCtx(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(vol || 0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    } catch(e) {}
  }
  return {
    unlock,
    place()   { tone(440, 0.08, 'sine', 0.18); },
    wobble()  { tone(260, 0.12, 'sine', 0.08); },
    success() { [523,659,784,1047].forEach(function(f,i){ setTimeout(function(){ tone(f,0.1,'sine',0.14); }, i*90); }); },
    fail()    { tone(220, 0.3, 'sawtooth', 0.09); },
    pu()      { [700,900,1100].forEach(function(f,i){ setTimeout(function(){ tone(f,0.09,'sine',0.13); }, i*70); }); },
    bonus()   { tone(880, 0.07, 'sine', 0.1); },
    rotate()  { tone(600, 0.05, 'sine', 0.1); },
  };
})();

const BgMusic = (() => {
  const aud = new Audio('TowerMusic.mp3');
  aud.loop   = true;
  aud.volume = 0.4;
  return {
    play()     { if (GS.soundOn) { aud.play().catch(function(){}); } },
    stop()     { aud.pause(); aud.currentTime = 0; },
    pause()    { aud.pause(); },
    resume()   { if (GS.soundOn) { aud.play().catch(function(){}); } },
    toggle(on) { on ? this.resume() : this.pause(); },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. CHALLENGE LEVEL DEFINITIONS
// ════════════════════════════════════════════════════════════

const CHALLENGE_LEVELS = [
  { id:1,  desc:'בנה מגדל בגובה 4 גושים',         type:'height',   target:4,  pieces:null, allowedTypes:null },
  { id:2,  desc:'הנח 5 ריבועים בלבד',              type:'typecount',target:5,  pieces:7,    allowedTypes:['square'] },
  { id:3,  desc:'בנה לגובה 6 עם מקסימום 8 גושים', type:'height',   target:6,  pieces:8,    allowedTypes:null },
  { id:4,  desc:'הנח עיגול על המבנה',              type:'toptype',  target:1,  pieces:10,   allowedTypes:null,   topType:'circle' },
  { id:5,  desc:'בנה לגובה 7 עם 6 גושים בלבד',    type:'height',   target:7,  pieces:6,    allowedTypes:null },
  { id:6,  desc:'הנח 3 קרשים',                     type:'typecount',target:3,  pieces:9,    allowedTypes:['plank'] },
  { id:7,  desc:'החזק מגדל גובה 5 למשך 5 שניות',  type:'holdup',   target:5,  holdSecs:5,  pieces:12,   allowedTypes:null },
  { id:8,  desc:'בנה לגובה 8 עם גושים מעורבים',   type:'height',   target:8,  pieces:15,   allowedTypes:null },
  { id:9,  desc:'השתמש ב-2 משולשים ובנה לגובה 5', type:'mixgoal',  target:5,  pieces:12,   requiredTypes:[{type:'triangle',count:2}] },
  { id:10, desc:'הגיע לגובה 10!',                  type:'height',   target:10, pieces:20,   allowedTypes:null },
  { id:11, desc:'הנח כוכב על גבי מגדל 4 גבוה',    type:'starontop',target:4,  pieces:12,   allowedTypes:null },
  { id:12, desc:'בנה לגובה 12 — האתגר הגדול!',    type:'height',   target:12, pieces:25,   allowedTypes:null },
];

// ════════════════════════════════════════════════════════════
// 6. PIECE DEFINITIONS & QUEUE
// ════════════════════════════════════════════════════════════

function getPieceDef(id) {
  return PIECE_DEFS.find(function(d){ return d.id === id; }) || PIECE_DEFS[0];
}

function makeQueuePiece(id) {
  const def = getPieceDef(id);
  return {
    id:       id,
    def:      def,
    x:        GS.canvasW / 2,
    worldY:   0,           // will be set in spawnNextPiece
    vy:       0,
    angle:    0,           // 0, 90, 180, 270
    color:    getPieceColor(id),
    special:  def.special || null,
    wobble:   { ang: 0, vel: 0 },
    onGround: false,
  };
}

function getPieceColor(id) {
  if (id === 'rainbow') return 'rainbow';
  return PIECE_COLORS[id] || '#60a5fa';
}

function pickNextId(levelDef) {
  // If level forces a type
  if (levelDef && levelDef.allowedTypes && levelDef.allowedTypes.length > 0) {
    return levelDef.allowedTypes[Math.floor(Math.random() * levelDef.allowedTypes.length)];
  }
  // Occasionally special
  if (GS.mode !== 'challenge' && Math.random() < DIFF_CFG[GS.diff].puChance * 0.6) {
    return SPECIAL_POOL[Math.floor(Math.random() * SPECIAL_POOL.length)];
  }
  return NORMAL_POOL[Math.floor(Math.random() * NORMAL_POOL.length)];
}

function refillQueue() {
  const lvl = GS.mode === 'challenge' ? CHALLENGE_LEVELS[GS.challengeLevel] : null;
  while (GS.pieceQueue.length < 3) {
    // Giant PU: next piece is oversized
    let id;
    if (GS.activePU && GS.activePU.def.id === 'giant' && GS.pieceQueue.length === 0) {
      id = 'plank'; // plank as "giant"
    } else {
      id = pickNextId(lvl);
    }
    GS.pieceQueue.push(makeQueuePiece(id));
  }
}

function spawnNextPiece() {
  refillQueue();
  GS.currentPiece = GS.pieceQueue.shift();
  const p  = GS.currentPiece;
  const pw = getPiecePixW(p);
  // Random horizontal offset: up to ±10% of canvas width from center, clamped to edges
  const maxOffset = GS.canvasW * 0.10;
  const offset    = (Math.random() - 0.5) * 2 * maxOffset;
  p.x      = Math.max(pw / 2 + 8, Math.min(GS.canvasW - pw / 2 - 8, GS.canvasW / 2 + offset));
  const ph = getPiecePixH(p);
  // Spawn just above the visible canvas top so the piece enters from off-screen
  p.worldY   = toWorldY(-ph - 4);
  p.vy       = 0;
  p.onGround = false;
  p.wobble   = { ang: 0, vel: 0 };
  refillQueue();
  renderPreview();
}

function getPiecePixW(p) {
  const def = p.def;
  const cs  = GS.cellPx;
  // If angle is 90 or 270 swap w and h
  const swapped = (p.angle === 90 || p.angle === 270);
  const pw = swapped ? def.h * cs : def.w * cs;
  // Giant bonus
  return GS.activePU && GS.activePU.def.id === 'giant' && p === GS.currentPiece ? pw * 1.5 : pw;
}
function getPiecePixH(p) {
  const def = p.def;
  const cs  = GS.cellPx;
  const swapped = (p.angle === 90 || p.angle === 270);
  const ph = swapped ? def.w * cs : def.h * cs;
  return GS.activePU && GS.activePU.def.id === 'giant' && p === GS.currentPiece ? ph * 1.5 : ph;
}

// ════════════════════════════════════════════════════════════
// 7. PHYSICS WORLD
// ════════════════════════════════════════════════════════════
//
// BALANCE SYSTEM:
//  - Each piece has a world-y coordinate (worldY). The camera scrolls
//    so that worldY = canvasY - cameraOffsetY.
//  - When a piece lands, we compute the CENTER-OF-MASS of the entire
//    stack (x-weighted). If it leans too far, pieces on the outside
//    gradually tip and fall.
//  - "Overlap fraction" determines landing: only pieces that overlap
//    at least 25% of their width actually support the new piece.
//    Off-edge landings get an immediate strong lean impulse.
//
// CAMERA:
//  - GS.cameraY follows the top of the tower so the player can
//    always see where they are building.

function getGroundWorldY() { return 0; } // ground is world y=0, top is negative

// Convert world Y to canvas Y
// worldY=0 is ground (shown at canvas bottom). Higher worldY = higher on screen (lower canvasY).
// cameraY = world Y currently shown at the bottom reference line (ground line).
function toCanvasY(worldY) {
  return GS.canvasH - 12 - (worldY - GS.cameraY);
}
// Convert canvas Y to world Y (inverse of toCanvasY)
function toWorldY(canvasY) {
  return GS.cameraY + (GS.canvasH - 12 - canvasY);
}

// Get the world-Y top surface at a given x (returns world Y of topmost surface)
function getTopSurfaceWorldAt(px, pw) {
  let topWorldY = 0; // ground
  for (let i = 0; i < GS.placedPieces.length; i++) {
    const pl = GS.placedPieces[i];
    if (!pl.onGround) continue;
    const plLeft  = pl.x - getPiecePixW(pl) / 2;
    const plRight = pl.x + getPiecePixW(pl) / 2;
    const pLeft   = px - pw / 2;
    const pRight  = px + pw / 2;
    // Require meaningful overlap (>20% of new piece width) to count as support
    const overlap = Math.min(pRight, plRight) - Math.max(pLeft, plLeft);
    if (overlap > pw * 0.20) {
      const plTopWorldY = pl.worldY + getPiecePixH(pl) / 2;
      if (plTopWorldY > topWorldY) topWorldY = plTopWorldY;
    }
  }
  return topWorldY;
}

// Compute how far off-center the new piece is from its supporting surface
// Returns a signed overhang ratio: 0=perfect center, ±1=completely off edge
function computeOverhangRatio(px, pw) {
  // Find the support piece(s) under us
  let totalSupportWidth = 0;
  let weightedCenterX   = 0;
  for (let i = 0; i < GS.placedPieces.length; i++) {
    const pl = GS.placedPieces[i];
    if (!pl.onGround) continue;
    const plLeft  = pl.x - getPiecePixW(pl) / 2;
    const plRight = pl.x + getPiecePixW(pl) / 2;
    const pLeft   = px - pw / 2;
    const pRight  = px + pw / 2;
    const overlap = Math.min(pRight, plRight) - Math.max(pLeft, plLeft);
    if (overlap > 0) {
      const overlapCenter = (Math.max(pLeft, plLeft) + Math.min(pRight, plRight)) / 2;
      totalSupportWidth += overlap;
      weightedCenterX   += overlapCenter * overlap;
    }
  }
  if (totalSupportWidth < 2) return 0; // on ground, no overhang
  const supportCenter = weightedCenterX / totalSupportWidth;
  const halfPw = pw / 2;
  return (px - supportCenter) / halfPw; // signed: positive = leaning right
}

function applyPhysics(dt) {
  const p = GS.currentPiece;
  if (!p || p.onGround) return;

  const cfg        = DIFF_CFG[GS.diff];
  const slowFactor = (GS.activePU && GS.activePU.def.id === 'slowtime') ? 0.35 : 1;
  // Fixed per-frame gravity (no dt scaling — runs at ~60fps via rAF)
  let grav = cfg.gravity * slowFactor;
  if (GS.softDrop) grav *= 4;

  p.vy     += grav;
  p.vy      = Math.min(p.vy, 18); // cap fall speed so pieces can never teleport past a surface
  p.worldY -= p.vy;               // worldY: 0=ground, +UP; falling = worldY decreases

  const pw = getPiecePixW(p);
  if (p.x - pw/2 < 4)              p.x = pw/2 + 4;
  if (p.x + pw/2 > GS.canvasW - 4) p.x = GS.canvasW - pw/2 - 4;

  const ph            = getPiecePixH(p);
  const pieceBottom   = p.worldY - ph / 2;
  const surfaceWorldY = getTopSurfaceWorldAt(p.x, pw);

  if (pieceBottom <= surfaceWorldY) {
    landPiece(p, surfaceWorldY);
  }
}

function landPiece(p, surfaceWorldY) {
  const ph = getPiecePixH(p);
  p.worldY   = surfaceWorldY + ph / 2;
  p.vy       = 0;
  p.onGround = true;

  // Compute overhang — how badly off-center is this piece?
  const pw       = getPiecePixW(p);
  const overhang = computeOverhangRatio(p.x, pw);  // -1..+1
  const cfg      = DIFF_CFG[GS.diff];

  // Wobble impulse proportional to overhang + difficulty + mass effect
  const mass         = p.def.mass || 1;
  const wobbleMult   = (p.special === 'sticky') ? 0.15 : 1.0;
  const bounceAdd    = (p.special === 'bouncy')  ? 0.12 : 0.04;
  const overhangImpulse = overhang * cfg.wobble * 12 * wobbleMult;

  // Apply impulse to ALL settled pieces (heavier piece = stronger impulse)
  GS.placedPieces.forEach(function(pl) {
    if (!pl.onGround || !pl.wobble) return;
    const randomJitter = (Math.random() - 0.5) * cfg.wobble * 0.8 * wobbleMult;
    pl.wobble.vel += (overhangImpulse + randomJitter) * mass * 0.5;
  });
  p.wobble     = p.wobble || { ang: 0, vel: 0 };
  p.wobble.vel = bounceAdd * (overhang * 2 + (Math.random() - 0.5));

  GS.placedPieces.push(p);
  GS.blocksPlaced++;

  updateTowerHeight();
  SoundFX.place();
  spawnParticles(p.x, toCanvasY(surfaceWorldY), p.color !== 'rainbow' ? p.color : '#ffd700', 6);

  if (p.special === 'star') {
    GS.starBonus.push({ piece: p, startMs: performance.now() });
    SoundFX.bonus();
  }
  if (p.special === 'rainbow') {
    GS.score += 300;
    SoundFX.bonus();
    showFloatMsg('🌈 בונוס! +300');
  }

  GS.score += Math.round(GS.towerHeight * 10 + GS.blocksPlaced * 5);
  updateScoreUI();

  if (Math.random() < cfg.puChance) {
    const pu = PU_DEFS[Math.floor(Math.random() * PU_DEFS.length)];
    GS.puQueue.push(pu);
    showFloatMsg(pu.icon + ' ' + pu.name + '!');
    SoundFX.pu();
    if (!GS.activePU) activateNextPU();
  }

  if (GS.mode !== 'free') checkCollapse();
  if (!GS.running) return;   // collapse may have ended the game — don't spawn
  checkGoal();
  if (!GS.running) return;   // goal check may have ended the game
  GS._lastPiecePlaced = p;
  spawnNextPiece();
}

function updateTowerHeight() {
  let maxWorldY = 0;
  GS.placedPieces.forEach(function(pl) {
    if (!pl.onGround) return;
    const top = pl.worldY + getPiecePixH(pl) / 2;
    if (top > maxWorldY) maxWorldY = top;
  });
  GS.towerHeight = Math.round(maxWorldY / GS.cellPx * 10) / 10;
  if (GS.towerHeight > GS.maxHeight) GS.maxHeight = GS.towerHeight;
  if (GS.mode === 'challenge') updateGoalUI();
}

function checkCollapse() {
  if (GS.placedPieces.length < 2) return;
  const cfg   = DIFF_CFG[GS.diff];
  const total = GS.placedPieces.length;
  // Only count pieces that have actually left the visible area (not just tipped)
  const fallen = GS.placedPieces.filter(function(pl) {
    return toCanvasY(pl.worldY) > GS.canvasH + 40   // fell below canvas
        || pl.x < -80 || pl.x > GS.canvasW + 80;    // flew off sides
  }).length;
  if (total > 2 && fallen / total >= cfg.collapseRatio) {
    endGame('collapse');
  }
}

// ── BALANCE / WOBBLE UPDATE ──────────────────────────────────
// Physics model:
//  - Each settled piece has a wobble spring (ang, vel).
//  - If a piece's angle exceeds a tipping threshold, it falls off the stack.
//  - "Falling off" means it gets a horizontal velocity and gravity pulls it down.
//  - The stability depends on difficulty — easy is very forgiving, hard is strict.

function updateWobble() {
  const cfg      = DIFF_CFG[GS.diff];
  const stab     = GS.activePU && GS.activePU.def.id === 'stabilize';
  const damping  = stab ? 0.94 : 0.82;
  const spring   = 0.06;
  const tipAngle = stab ? 99 : cfg.tipAngle;

  GS.placedPieces.forEach(function(pl) {
    if (!pl.wobble) { pl.wobble = { ang: 0, vel: 0 }; }
    if (!pl.onGround) return;

    // Spring back to 0 (fixed per-frame, no dtNorm)
    pl.wobble.vel += -pl.wobble.ang * spring;
    pl.wobble.vel *= damping;
    pl.wobble.ang += pl.wobble.vel;

    // Cap visual wobble angle at ~14°
    if (Math.abs(pl.wobble.ang) > 0.25) {
      pl.wobble.ang = Math.sign(pl.wobble.ang) * 0.25;
    }

    // Piece tips past threshold → falls
    if (Math.abs(pl.wobble.ang) >= tipAngle && !stab) {
      pl.onGround = false;
      pl.fallVx   = pl.wobble.ang * 4;
      pl.fallVy   = 0;
    }
  });

  // Apply gravity to falling pieces and remove ones far off screen
  GS.placedPieces.forEach(function(pl) {
    if (pl.onGround) return;
    pl.fallVy = (pl.fallVy || 0) + 0.35;
    pl.worldY -= pl.fallVy;
    pl.x      += (pl.fallVx || 0);
  });

  // Remove pieces that have fallen far off world
  GS.placedPieces = GS.placedPieces.filter(function(pl) {
    return pl.worldY > -GS.canvasH * 3 && pl.x > -200 && pl.x < GS.canvasW + 200;
  });
}

// ── CAMERA ───────────────────────────────────────────────────
// GS.cameraY = the world-Y that maps to the "ground line" on canvas.
// When tower grows, we smoothly scroll the camera up so the top is always visible.

function updateCamera() {
  // Only track the placed tower height — don't follow the falling piece.
  // The piece should fall visibly into view from the top.
  const topWorldY      = GS.towerHeight * GS.cellPx;

  // We want the tower top to sit at ~30% from the top of the canvas.
  // toCanvasY(topWorldY) = canvasH - 12 - (topWorldY - cameraY) = canvasH * 0.30
  // => cameraY = topWorldY - canvasH * 0.70 + 12
  const desiredCameraY = topWorldY - GS.canvasH * 0.70 + 12;

  // Only scroll up when tower grows tall enough to need it.
  // Never scroll down below 0 (ground must stay at canvas bottom).
  if (desiredCameraY > GS.cameraY) {
    GS.cameraY += (desiredCameraY - GS.cameraY) * 0.05;
  }
  if (GS.cameraY < 0) GS.cameraY = 0;
}

// ════════════════════════════════════════════════════════════
// 8. RENDERING (Canvas)
// ════════════════════════════════════════════════════════════

function resizeCanvas() {
  const wrap   = document.getElementById('canvas-wrap');
  const panel  = document.getElementById('side-panel');
  const hud    = document.getElementById('hud');
  const mc     = document.getElementById('mobile-controls');
  const gb     = document.getElementById('goal-bar');

  // Available space
  const availW = wrap.clientWidth;
  const availH = wrap.clientHeight;

  const canvas  = document.getElementById('game-canvas');
  canvas.width  = availW;
  canvas.height = availH;
  GS.canvasW    = availW;
  GS.canvasH    = availH;
  GS.cellPx     = Math.max(28, Math.min(52, Math.round(availW / 9)));
  // cameraY = canvasH - 12 means ground is at bottom of canvas in world coords
  if (GS.cameraY === 0) GS.cameraY = 0; // world Y 0 = ground, shown at canvas bottom
}

function drawBackground(ctx, W, H) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#b0d8f0');
  sky.addColorStop(1, '#5db0e0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  drawClouds(ctx, W, H);

  // Ground — draw at the world Y=0 position (scrolls with camera)
  const groundCanvasY = toCanvasY(0);
  if (groundCanvasY < H) { // only draw if visible
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, groundCanvasY, W, H - groundCanvasY + 12);
    ctx.fillStyle = '#6B8E23';
    ctx.fillRect(0, groundCanvasY - 4, W, 6);
  }
}

// Simple animated clouds (position based on time so they drift)
const CLOUDS = [
  { x: 0.12, y: 0.06, r: 0.08 },
  { x: 0.55, y: 0.10, r: 0.06 },
  { x: 0.82, y: 0.05, r: 0.07 },
];
let cloudOffset = 0;

function drawClouds(ctx, W, H) {
  ctx.save();
  CLOUDS.forEach(function(c) {
    const cx = ((c.x * W + cloudOffset * 0.3) % (W * 1.2)) - W * 0.1;
    const cy = c.y * H;
    const r  = c.r * W;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.7, cy - r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.arc(cx - r * 0.7, cy - r * 0.1, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawGroundLine(ctx, W, H) {
  if (GS.mode === 'challenge') {
    const lvl = CHALLENGE_LEVELS[GS.challengeLevel];
    if (lvl && (lvl.type === 'height' || lvl.type === 'holdup' || lvl.type === 'mixgoal' || lvl.type === 'starontop')) {
      const targetWorldY = lvl.target * GS.cellPx;
      const targetCanvasY = toCanvasY(targetWorldY);
      if (targetCanvasY > 10 && targetCanvasY < H - 20) {
        ctx.save();
        ctx.setLineDash([8, 5]);
        ctx.strokeStyle = 'rgba(255,220,50,0.8)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(0, targetCanvasY);
        ctx.lineTo(W, targetCanvasY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        const lbl = document.getElementById('target-label');
        lbl.style.display = 'block';
        lbl.style.top = (targetCanvasY + 2) + 'px';
      } else {
        document.getElementById('target-label').style.display = 'none';
      }
    }
  } else {
    document.getElementById('target-label').style.display = 'none';
  }
}

function drawPiece(ctx, p, alpha) {
  const pw = getPiecePixW(p);
  const ph = getPiecePixH(p);
  // Convert worldY to canvas Y for drawing
  const canvasY = 'worldY' in p ? toCanvasY(p.worldY) : p.y;
  ctx.save();
  ctx.translate(p.x, canvasY);
  ctx.rotate(p.wobble ? p.wobble.ang : 0);
  ctx.globalAlpha = alpha !== undefined ? alpha : 1;

  const color = resolveColor(p);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  drawShape(ctx, p.def.shape, pw + 4, ph + 4, 2, 2);

  // Main fill
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(color);
  ctx.lineWidth = 2;
  drawShape(ctx, p.def.shape, pw, ph, 0, 0);

  // Special overlay
  if (p.special) drawSpecialOverlay(ctx, p, pw, ph);

  ctx.restore();
}

function resolveColor(p) {
  if (p.color !== 'rainbow') return p.color;
  return '#a78bfa'; // simple fallback for rainbow in contexts without gradient
}

function drawShape(ctx, shape, pw, ph, ox, oy) {
  const hw = pw / 2, hh = ph / 2;
  const r  = Math.min(8, pw * 0.15);
  ctx.beginPath();
  if (shape === 'rect') {
    roundRect(ctx, -hw + ox, -hh + oy, pw, ph, r);
  } else if (shape === 'circle') {
    ctx.arc(ox, oy, hw * 0.92, 0, Math.PI * 2);
  } else if (shape === 'tri') {
    ctx.moveTo(ox,       -hh + oy);
    ctx.lineTo(hw + ox,   hh + oy);
    ctx.lineTo(-hw + ox,  hh + oy);
    ctx.closePath();
  } else if (shape === 'arch') {
    // Arch: rect with curved top cutout
    roundRect(ctx, -hw + ox, -hh + oy, pw, ph, r);
  } else if (shape === 'star') {
    drawStarPath(ctx, ox, oy, hw * 0.9, hw * 0.45, 5);
  } else {
    roundRect(ctx, -hw + ox, -hh + oy, pw, ph, r);
  }
  ctx.fill();
  ctx.stroke();
}

function drawStarPath(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r     = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    else         ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
}

function drawSpecialOverlay(ctx, p, pw, ph) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  const icons = { heavy:'⚙️', bouncy:'💫', sticky:'🍯', star:'⭐', rainbow:'🌈' };
  const icon  = icons[p.special] || '';
  if (icon) {
    ctx.globalAlpha = 0.9;
    ctx.font = Math.round(Math.min(pw, ph) * 0.38) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(icon, 1, 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, 0, 0);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  if (!ctx.roundRect) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  } else {
    ctx.roundRect(x, y, w, h, r);
  }
}

function darken(hex) {
  if (!hex || hex === 'rainbow') return '#555';
  try {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - 40);
    const g = Math.max(0, ((n >> 8)  & 0xff) - 40);
    const b = Math.max(0, ((n)       & 0xff) - 40);
    return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  } catch(e) { return '#555'; }
}

function drawGhostPiece(ctx) {
  const p = GS.currentPiece;
  if (!p || p.onGround) return;
  const pw = getPiecePixW(p);
  const ph = getPiecePixH(p);
  const surfaceWorldY = getTopSurfaceWorldAt(p.x, pw);
  const ghostWorldY   = surfaceWorldY + ph / 2;
  const ghostCanvasY  = toCanvasY(ghostWorldY);
  const pieceCanvasY  = toCanvasY(p.worldY);
  if (ghostCanvasY >= pieceCanvasY) return; // ghost is below current piece

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.translate(p.x, ghostCanvasY);
  ctx.fillStyle = p.color !== 'rainbow' ? p.color : '#aaa';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  drawShape(ctx, p.def.shape, pw, ph, 0, 0);
  ctx.restore();
}

function drawParticles(ctx) {
  GS.particles = GS.particles.filter(function(p) { return p.life > 0; });
  GS.particles.forEach(function(p) {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life--;
  });
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < (count || 10); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    GS.particles.push({
      x, y, r: 3 + Math.random() * 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      color: color || '#ffe85a',
      life: 25 + Math.floor(Math.random() * 20),
      maxLife: 45,
    });
  }
}

function renderFrame(ts) {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d');
  const W = GS.canvasW, H = GS.canvasH;

  cloudOffset += 0.2;

  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H);
  drawGroundLine(ctx, W, H);

  // Draw placed pieces
  GS.placedPieces.forEach(function(p) { drawPiece(ctx, p); });

  // Ghost drop indicator
  if (GS.currentPiece && !GS.currentPiece.onGround) drawGhostPiece(ctx);

  // Draw current piece
  if (GS.currentPiece && !GS.currentPiece.onGround) drawPiece(ctx, GS.currentPiece);

  // Particles
  drawParticles(ctx);

  // Height indicator (ruler on right edge)
  drawHeightRuler(ctx, W, H);
}

function drawHeightRuler(ctx, W, H) {
  // Draw floor-level numbers on the right side so player can see how high they are
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle   = 'rgba(255,255,255,0.6)';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.font        = '10px Arial';
  ctx.textAlign   = 'left';
  ctx.textBaseline = 'middle';

  // Draw a tick every cellPx world units
  const startFloor = Math.floor(toWorldY(H - 12) / GS.cellPx);
  const endFloor   = Math.ceil(toWorldY(10) / GS.cellPx);
  for (let f = Math.max(0, startFloor); f <= endFloor; f++) {
    const cy = toCanvasY(f * GS.cellPx);
    const major = (f % 5 === 0);
    ctx.beginPath();
    ctx.moveTo(W - 18, cy);
    ctx.lineTo(W - (major ? 8 : 12), cy);
    ctx.stroke();
    if (major && f > 0) {
      ctx.fillText(String(f), W - 6, cy);
    }
  }
  ctx.restore();
}

function renderPreview() {
  const canvas = document.getElementById('preview-canvas');
  const ctx    = canvas.getContext('2d');
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  if (GS.pieceQueue.length === 0) return;

  const next = GS.pieceQueue[0];
  const def  = next.def;

  // Scale to fit the 70×70 preview box
  const scale  = Math.min(CW / (def.w * CELL * 1.4), CH / (def.h * CELL * 1.4), 1);
  const pw     = def.w * CELL * scale;
  const ph     = def.h * CELL * scale;

  // Build a minimal temp piece
  const tmp = {
    id:      next.id,
    def:     def,
    x:       CW / 2,
    y:       CH / 2,
    angle:   0,
    wobble:  { ang: 0, vel: 0 },
    color:   next.color,
    special: next.special,
  };

  // Draw directly without using GS canvas
  ctx.save();
  ctx.translate(CW / 2, CH / 2);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  drawShape(ctx, def.shape, pw + 3, ph + 3, 1, 1);

  // Fill
  const color = next.color !== 'rainbow' ? next.color : '#aaddff';
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(color);
  ctx.lineWidth = 2;
  ctx.beginPath();
  drawShape(ctx, def.shape, pw, ph, 0, 0);

  // Icon
  if (next.special) {
    const icons = { heavy:'⚙️', bouncy:'💫', sticky:'🍯', star:'⭐', rainbow:'🌈' };
    const ic = icons[next.special];
    if (ic) {
      ctx.font = Math.round(Math.min(pw, ph) * 0.38) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(ic, 0, 0);
    }
  }

  ctx.restore();
}

// ════════════════════════════════════════════════════════════
// 9. INPUT HANDLING
// ════════════════════════════════════════════════════════════

function moveCurrentPiece(dir) {
  const p = GS.currentPiece;
  if (!p || p.onGround || GS.busy || GS.paused || !GS.running) return;
  const pw   = getPiecePixW(p);
  const step = GS.cellPx * 0.55;
  p.x += dir * step;
  const halfW = pw / 2;
  if (p.x - halfW < 4) p.x = halfW + 4;
  if (p.x + halfW > GS.canvasW - 4) p.x = GS.canvasW - halfW - 4;
}

function rotateCurrentPiece() {
  const p = GS.currentPiece;
  if (!p || p.onGround || GS.busy || GS.paused || !GS.running) return;
  p.angle = (p.angle + 90) % 360;
  SoundFX.rotate();
  const pw = getPiecePixW(p);
  const halfW = pw / 2;
  if (p.x - halfW < 4) p.x = halfW + 4;
  if (p.x + halfW > GS.canvasW - 4) p.x = GS.canvasW - halfW - 4;
}

function hardDropPiece() {
  const p = GS.currentPiece;
  if (!p || p.onGround || GS.busy || GS.paused || !GS.running) return;
  const pw          = getPiecePixW(p);
  const ph          = getPiecePixH(p);
  const surfaceWorldY = getTopSurfaceWorldAt(p.x, pw);
  p.worldY = surfaceWorldY + ph / 2;
  p.vy     = 0;
  spawnParticles(p.x, toCanvasY(surfaceWorldY), p.color !== 'rainbow' ? p.color : '#ffd700', 8);
  landPiece(p, surfaceWorldY);
}

function wireKeyboard() {
  let keysDown = new Set();
  document.addEventListener('keydown', function(e) {
    if (keysDown.has(e.code)) return;
    keysDown.add(e.code);
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (GS.paused) resumeGame(); else pauseGame();
      return;
    }
    if (GS.paused || !GS.running) return;
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { GS.moveRight = true; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { GS.moveLeft  = true; e.preventDefault(); }
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') { rotateCurrentPiece(); e.preventDefault(); }
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') { GS.softDrop  = true; e.preventDefault(); }
    if (e.code === 'Space') { hardDropPiece(); e.preventDefault(); }
  });
  document.addEventListener('keyup', function(e) {
    keysDown.delete(e.code);
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') GS.moveRight = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') GS.moveLeft  = false;
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') GS.softDrop  = false;
  });
}

function wireMobileControls() {
  function holdButton(el, fn) {
    let interval = null;
    function start(e) {
      e.preventDefault();
      SoundFX.unlock();
      fn();
      interval = setInterval(fn, 120);
    }
    function stop(e) {
      e.preventDefault();
      clearInterval(interval); interval = null;
    }
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend',   stop,  { passive: false });
    el.addEventListener('mousedown',  start);
    el.addEventListener('mouseup',    stop);
    el.addEventListener('mouseleave', stop);
  }

  holdButton(document.getElementById('mc-left'),   function(){ moveCurrentPiece(1);  });
  holdButton(document.getElementById('mc-right'),  function(){ moveCurrentPiece(-1); });

  document.getElementById('mc-rotate').addEventListener('click', function(e) {
    e.preventDefault(); SoundFX.unlock(); rotateCurrentPiece();
  });
  document.getElementById('mc-drop').addEventListener('click', function(e) {
    e.preventDefault(); SoundFX.unlock(); hardDropPiece();
  });
}

// ════════════════════════════════════════════════════════════
// 10. POWER-UPS
// ════════════════════════════════════════════════════════════

function activateNextPU() {
  if (GS.puQueue.length === 0) {
    GS.activePU = null;
    document.getElementById('pu-slot').style.display = 'none';
    return;
  }
  const def = GS.puQueue.shift();

  if (def.id === 'undo') {
    // Undo: remove last placed piece
    if (GS._lastPiecePlaced) {
      const idx = GS.placedPieces.indexOf(GS._lastPiecePlaced);
      if (idx >= 0) GS.placedPieces.splice(idx, 1);
      GS._lastPiecePlaced = null;
      updateTowerHeight();
      showFloatMsg('↩️ בוטל!');
    }
    activateNextPU(); // immediately go to next
    return;
  }

  if (def.id === 'giant') {
    // Giant: next piece will be big — just show and let spawn handle it
    GS.activePU = { def, startMs: performance.now(), endMs: performance.now() + 1 };
    document.getElementById('pu-slot').style.display = '';
    document.getElementById('pu-icon').textContent = def.icon;
    document.getElementById('pu-name').textContent = def.name;
    return;
  }

  const now = performance.now();
  GS.activePU = { def, startMs: now, endMs: now + def.dur };
  document.getElementById('pu-slot').style.display = '';
  document.getElementById('pu-icon').textContent = def.icon;
  document.getElementById('pu-name').textContent = def.name;
  SoundFX.pu();
}

function updatePU(now) {
  if (!GS.activePU || GS.activePU.def.dur === 0) return;
  const elapsed = now - GS.activePU.startMs;
  const frac    = 1 - Math.min(1, elapsed / GS.activePU.def.dur);
  document.getElementById('pu-bar').style.width = (frac * 100) + '%';
  if (elapsed >= GS.activePU.def.dur) {
    GS.activePU = null;
    document.getElementById('pu-slot').style.display = 'none';
    if (GS.puQueue.length > 0) activateNextPU();
  }
}

// ════════════════════════════════════════════════════════════
// 11. GAME MODES & FLOW
// ════════════════════════════════════════════════════════════

function checkGoal() {
  if (GS.mode === 'free') return;
  if (GS.mode === 'tower') {
    // Tower mode: no fixed win, just score
    return;
  }
  if (GS.mode === 'challenge') {
    const lvl = CHALLENGE_LEVELS[GS.challengeLevel];
    if (!lvl || GS.challengeDone) return;

    if (lvl.type === 'height' || lvl.type === 'holdup') {
      if (GS.towerHeight >= lvl.target) {
        if (lvl.type === 'height') {
          GS.challengeDone = true;
          setTimeout(function(){ showLevelWin(); }, 400);
        }
        // holdup: need to keep it for holdSecs — handled in main loop
      }
    } else if (lvl.type === 'typecount') {
      const count = GS.placedPieces.filter(function(p){ return lvl.allowedTypes && lvl.allowedTypes.includes(p.id); }).length;
      if (count >= lvl.target) {
        GS.challengeDone = true;
        setTimeout(function(){ showLevelWin(); }, 400);
      }
    } else if (lvl.type === 'toptype') {
      // Top piece must match topType
      if (GS.placedPieces.length > 0) {
        const topPiece = GS.placedPieces.reduce(function(a, b){ return (a.y < b.y) ? a : b; });
        if (topPiece.id === lvl.topType && GS.placedPieces.length >= 3) {
          GS.challengeDone = true;
          setTimeout(function(){ showLevelWin(); }, 400);
        }
      }
    } else if (lvl.type === 'mixgoal') {
      const heightOk = GS.towerHeight >= lvl.target;
      const reqOk = (lvl.requiredTypes || []).every(function(req) {
        const cnt = GS.placedPieces.filter(function(p){ return p.id === req.type; }).length;
        return cnt >= req.count;
      });
      if (heightOk && reqOk) {
        GS.challengeDone = true;
        setTimeout(function(){ showLevelWin(); }, 400);
      }
    } else if (lvl.type === 'starontop') {
      const hasStarOnTop = GS.placedPieces.some(function(p){
        return p.special === 'star' && GS.towerHeight >= lvl.target;
      });
      if (hasStarOnTop) {
        GS.challengeDone = true;
        setTimeout(function(){ showLevelWin(); }, 400);
      }
    }

    // Piece limit
    if (lvl.pieces && GS.blocksPlaced >= lvl.pieces && !GS.challengeDone) {
      // Used all pieces without completing goal → fail
      setTimeout(function(){ endGame('nopcs'); }, 600);
    }
  }
}

function checkHoldupGoal(now) {
  if (GS.mode !== 'challenge') return;
  const lvl = CHALLENGE_LEVELS[GS.challengeLevel];
  if (!lvl || lvl.type !== 'holdup' || GS.challengeDone) return;
  if (GS.towerHeight >= lvl.target) {
    GS.goalTimer += 1 / 60; // approx per frame at 60fps
    if (GS.goalTimer >= lvl.holdSecs) {
      GS.challengeDone = true;
      showLevelWin();
    }
  } else {
    GS.goalTimer = 0;
  }
}

// ════════════════════════════════════════════════════════════
// 11b. GAME LIFECYCLE
// ════════════════════════════════════════════════════════════

function startGame() {
  SoundFX.unlock();
  resetRuntime();

  // Show game screen
  showScreen('screen-game');

  // Setup canvas
  resizeCanvas();

  // Fill queue
  refillQueue();

  // Spawn first piece
  spawnNextPiece();

  // Setup HUD
  setupHUD();

  GS.running = true;
  GS.lastTs  = performance.now();
  BgMusic.play();

  // Start loop
  GS.loopId = requestAnimationFrame(mainLoop);
}

function pauseGame() {
  if (!GS.running) return;
  GS.paused = true;
  BgMusic.pause();
  document.getElementById('overlay-pause').style.display = 'flex';
}

function resumeGame() {
  GS.paused = false;
  GS.lastTs = performance.now();
  BgMusic.resume();
  document.getElementById('overlay-pause').style.display = 'none';
}

function endGame(reason) {
  if (!GS.running) return;
  GS.running = false;
  BgMusic.stop();

  SoundFX.fail();
  const modeLabel = { tower:'מגדל', challenge:'אתגר', free:'חופשי' }[GS.mode];
  const diffLabel = { easy:'קל', normal:'רגיל', hard:'קשה' }[GS.diff];
  const isNew     = Storage.saveBest(GS.mode, GS.diff, GS.mode === 'tower' ? GS.maxHeight : GS.score);
  const msgs = ['בונה אמיץ!', 'ננסה שוב!', 'כמעט!', 'אתה משתפר!'];
  document.getElementById('go-msg').textContent   = msgs[Math.floor(Math.random() * msgs.length)];
  document.getElementById('go-stats').innerHTML   =
    'גובה: <strong>' + GS.maxHeight.toFixed(1) + ' קומות</strong><br>' +
    'ניקוד: <strong>' + GS.score + '</strong><br>' +
    'גושים: <strong>' + GS.blocksPlaced + '</strong><br>' +
    'מצב: <strong>' + modeLabel + ' · ' + diffLabel + '</strong>';
  document.getElementById('go-best').style.display = isNew ? '' : 'none';
  document.getElementById('overlay-gameover').style.display = 'flex';
}

function showLevelWin() {
  if (!GS.running) return;
  GS.running = false;
  BgMusic.stop();
  SoundFX.success();
  spawnParticles(GS.canvasW / 2, GS.canvasH / 3, '#ffe85a', 30);
  spawnParticles(GS.canvasW / 3, GS.canvasH / 2, '#4ade80', 20);
  spawnParticles(GS.canvasW * 2/3, GS.canvasH / 2, '#f87171', 20);

  const msgs = ['בנאי מדהים!', 'כל הכבוד!', 'עברת אותו!', 'יופי של בנייה!'];
  document.getElementById('win-msg').textContent = msgs[Math.floor(Math.random() * msgs.length)];
  const stars = GS.score > 1000 ? '⭐⭐⭐' : GS.score > 400 ? '⭐⭐' : '⭐';
  document.getElementById('win-stars').textContent = stars;
  document.getElementById('win-stats').innerHTML =
    'ניקוד: <strong>' + GS.score + '</strong><br>גובה: <strong>' + GS.maxHeight.toFixed(1) + '</strong>';

  const prog = Storage.getChallengeProgress();
  if (GS.challengeLevel >= prog) Storage.saveChallengeProgress(GS.challengeLevel + 1);
  Storage.saveBest('challenge', GS.diff, GS.score);

  document.getElementById('overlay-levelwin').style.display = 'flex';
}

function goToMenu() {
  GS.running = false;
  if (GS.loopId) { cancelAnimationFrame(GS.loopId); GS.loopId = null; }
  BgMusic.stop();
  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-levelwin').style.display  = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';
  updateMenuDisplay();
  showScreen('screen-menu');
}

// ════════════════════════════════════════════════════════════
// 12. HUD / UI UPDATES
// ════════════════════════════════════════════════════════════

function setupHUD() {
  const midLabel = document.getElementById('hud-mid-label');
  const goalBar  = document.getElementById('goal-bar');
  goalBar.style.display = GS.mode === 'challenge' ? '' : 'none';

  if (GS.mode === 'challenge') {
    midLabel.textContent = 'שלב';
    document.getElementById('hud-mid-val').textContent = (GS.challengeLevel + 1);
    const lvl = CHALLENGE_LEVELS[GS.challengeLevel];
    if (lvl) document.getElementById('goal-text').textContent = lvl.desc;
  } else if (GS.mode === 'free') {
    midLabel.textContent = 'גושים';
  } else {
    midLabel.textContent = 'גובה';
  }
  document.getElementById('hud-best').textContent = Storage.getBest(GS.mode, GS.diff);
}

function updateScoreUI() {
  document.getElementById('hud-score').textContent = GS.score;
  const midVal = document.getElementById('hud-mid-val');
  if (GS.mode === 'challenge') {
    midVal.textContent = (GS.challengeLevel + 1);
  } else if (GS.mode === 'free') {
    midVal.textContent = GS.blocksPlaced;
  } else {
    midVal.textContent = GS.maxHeight.toFixed(1);
  }
}

function updateGoalUI() {
  if (GS.mode !== 'challenge') return;
  const lvl = CHALLENGE_LEVELS[GS.challengeLevel];
  if (!lvl) return;
  let frac = 0;
  if (lvl.type === 'height' || lvl.type === 'holdup' || lvl.type === 'starontop' || lvl.type === 'mixgoal') {
    frac = Math.min(1, GS.towerHeight / lvl.target);
  } else if (lvl.type === 'typecount') {
    const count = GS.placedPieces.filter(function(p){ return lvl.allowedTypes && lvl.allowedTypes.includes(p.id); }).length;
    frac = Math.min(1, count / lvl.target);
  }
  if (lvl.type === 'holdup' && GS.goalTimer > 0) {
    frac = Math.min(1, GS.goalTimer / (lvl.holdSecs || 5));
  }
  document.getElementById('goal-fill').style.width = (frac * 100) + '%';
}

function showFloatMsg(text) {
  const el = document.getElementById('float-msg');
  el.textContent = text;
  el.style.display = '';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(showFloatMsg._t);
  showFloatMsg._t = setTimeout(function(){ el.style.display = 'none'; }, 1400);
}

function updateMenuDisplay() {
  // Best badges
  const bb = document.getElementById('best-badges');
  bb.innerHTML = '';
  ['tower','challenge','free'].forEach(function(m) {
    ['easy','normal','hard'].forEach(function(d) {
      const v = Storage.getBest(m, d);
      if (v > 0) {
        const span = document.createElement('span');
        span.className = 'best-badge';
        const ml = {tower:'מגדל',challenge:'אתגר',free:'חופשי'}[m];
        const dl = {easy:'קל',normal:'רגיל',hard:'קשה'}[d];
        span.textContent = '🏆 ' + ml + '/' + dl + ': ' + v;
        bb.appendChild(span);
      }
    });
  });

  // Challenge dots
  const prog = Storage.getChallengeProgress();
  const dots = document.getElementById('lvl-dots');
  dots.innerHTML = '';
  CHALLENGE_LEVELS.forEach(function(lvl, i) {
    const d = document.createElement('div');
    d.className = 'lvl-dot' + (i < prog ? ' done' : i === prog ? ' current' : '');
    d.textContent = String(i + 1);
    dots.appendChild(d);
  });

  // Show challenge progress when mode is challenge
  const cp = document.getElementById('challenge-progress');
  cp.style.display = GS.mode === 'challenge' ? '' : 'none';
}

// ════════════════════════════════════════════════════════════
// 13. MENU WIRING
// ════════════════════════════════════════════════════════════

function wireMenu() {
  document.getElementById('mode-btns').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    document.querySelectorAll('#mode-btns .sel-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    GS.mode = btn.dataset.mode;
    Storage.saveSettings({ mode: GS.mode });
    updateMenuDisplay();
  });

  document.querySelectorAll('.diff-btn[data-diff]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.diff-btn[data-diff]').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      GS.diff = btn.dataset.diff;
      Storage.saveSettings({ diff: GS.diff });
    });
  });

  document.getElementById('btn-play').addEventListener('click', function() {
    SoundFX.unlock();
    if (GS.mode === 'challenge') {
      GS.challengeLevel = Storage.getChallengeProgress();
      GS.challengeLevel = Math.min(GS.challengeLevel, CHALLENGE_LEVELS.length - 1);
    }
    startGame();
  });

  document.getElementById('btn-howto').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'flex';
  });
  document.getElementById('btn-howto-close').addEventListener('click', function() {
    document.getElementById('modal-howto').style.display = 'none';
  });

  document.getElementById('btn-sound').addEventListener('click', function() {
    SoundFX.unlock();
    GS.soundOn = !GS.soundOn;
    Storage.saveSettings({ soundOn: GS.soundOn });
    const btn = document.getElementById('btn-sound');
    btn.textContent = GS.soundOn ? '🔊 פועל' : '🔇 כבוי';
    btn.classList.toggle('on', GS.soundOn);
    BgMusic.toggle(GS.soundOn);
  });
}

function wireGame() {
  document.getElementById('btn-pause').addEventListener('click', function() {
    SoundFX.unlock();
    if (GS.paused) resumeGame(); else pauseGame();
  });
  document.getElementById('btn-resume').addEventListener('click', function() {
    SoundFX.unlock(); resumeGame();
  });
  document.getElementById('btn-restart').addEventListener('click', function() {
    SoundFX.unlock();
    document.getElementById('overlay-pause').style.display = 'none';
    startGame();
  });
  document.getElementById('btn-pause-menu').addEventListener('click', function() {
    SoundFX.unlock(); goToMenu();
  });
  document.getElementById('btn-play-again').addEventListener('click', function() {
    SoundFX.unlock();
    document.getElementById('overlay-gameover').style.display = 'none';
    startGame();
  });
  document.getElementById('btn-go-menu').addEventListener('click', function() {
    SoundFX.unlock(); goToMenu();
  });
  document.getElementById('btn-next-level').addEventListener('click', function() {
    SoundFX.unlock();
    document.getElementById('overlay-levelwin').style.display = 'none';
    GS.challengeLevel = Math.min(GS.challengeLevel + 1, CHALLENGE_LEVELS.length - 1);
    startGame();
  });
  document.getElementById('btn-lvl-menu').addEventListener('click', function() {
    SoundFX.unlock(); goToMenu();
  });
  document.getElementById('audio-banner').addEventListener('click', function() {
    SoundFX.unlock();
  });
}

function wireResize() {
  let t = null;
  window.addEventListener('resize', function() {
    clearTimeout(t);
    t = setTimeout(function() {
      if (document.getElementById('screen-game').classList.contains('active')) {
        resizeCanvas();
        // Reposition placed pieces proportionally — simple: scale by new vs old
      }
    }, 200);
  });
}

// ════════════════════════════════════════════════════════════
// 14. MAIN LOOP
// ════════════════════════════════════════════════════════════

function mainLoop(ts) {
  if (!GS.running) return;

  const dt  = Math.min(ts - GS.lastTs, 50); // cap delta to 50ms
  GS.lastTs = ts;

  if (!GS.paused) {
    // Continuous key movement
    GS.moveTimer += dt;
    if (GS.moveTimer >= 80) {
      GS.moveTimer = 0;
      if (GS.moveLeft)  moveCurrentPiece(1);
      if (GS.moveRight) moveCurrentPiece(-1);
    }

    applyPhysics(dt);
    updateWobble();
    updateCamera();
    updatePU(ts);
    checkHoldupGoal(ts);

    // Star bonus scoring
    const nowMs = performance.now();
    GS.starBonus = GS.starBonus.filter(function(sb) {
      const elapsed = nowMs - sb.startMs;
      if (elapsed >= 5000) {
        GS.score += 500;
        updateScoreUI();
        showFloatMsg('⭐ בונוס כוכב! +500');
        SoundFX.bonus();
        return false;
      }
      return true;
    });

    updateScoreUI();
    updateGoalUI();

    // Tower mode: end if all placed pieces have left the screen
    if (GS.mode === 'tower' && GS.placedPieces.length >= 3) {
      const offScreen = GS.placedPieces.filter(function(pl) {
        return toCanvasY(pl.worldY) > GS.canvasH + 40 || pl.x < -80 || pl.x > GS.canvasW + 80;
      }).length;
      if (offScreen === GS.placedPieces.length) {
        endGame('fallen');
      }
    }
  }

  renderFrame(ts);
  GS.loopId = requestAnimationFrame(mainLoop);
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function restoreSettings() {
  const s = Storage.getSettings();
  if (s.mode && document.querySelector('[data-mode="' + s.mode + '"]')) {
    GS.mode = s.mode;
    document.querySelectorAll('#mode-btns .sel-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.mode === GS.mode);
    });
  }
  if (s.diff && DIFF_CFG[s.diff]) {
    GS.diff = s.diff;
    document.querySelectorAll('.diff-btn[data-diff]').forEach(function(b){
      b.classList.toggle('active', b.dataset.diff === GS.diff);
    });
  }
  if (typeof s.soundOn === 'boolean') {
    GS.soundOn = s.soundOn;
    const btn = document.getElementById('btn-sound');
    btn.textContent = GS.soundOn ? '🔊 פועל' : '🔇 כבוי';
    btn.classList.toggle('on', GS.soundOn);
  }
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    document.getElementById('audio-banner').style.display = '';
  }
}

// ════════════════════════════════════════════════════════════
// 15. INIT
// ════════════════════════════════════════════════════════════

function init() {
  restoreSettings();
  wireMenu();
  wireGame();
  wireKeyboard();
  wireMobileControls();
  wireResize();
  updateMenuDisplay();
  showScreen('screen-menu');
}

document.addEventListener('DOMContentLoaded', init);
