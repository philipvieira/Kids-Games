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
  easy:   { fallSpd: 1.8, gravity: 0.035, wobble: 0.018, collapseRatio: 0.5,  puChance: 0.2,  hintDelay: 3000, tipAngle: 0.22 },
  normal: { fallSpd: 2.8, gravity: 0.05,  wobble: 0.030, collapseRatio: 0.35, puChance: 0.12, hintDelay: 5000, tipAngle: 0.17 },
  hard:   { fallSpd: 4.0, gravity: 0.07,  wobble: 0.045, collapseRatio: 0.25, puChance: 0.06, hintDelay: 9000, tipAngle: 0.12 },
};

// Power-up definitions
const PU_DEFS = [
  { id: 'slowtime',   icon: '🐢', name: 'עצור זמן',   dur: 5000  },
  { id: 'stabilize',  icon: '🧱', name: 'יציבות',     dur: 6000  },
  { id: 'undo',       icon: '↩️',  name: 'בטל',        dur: 0     },
  { id: 'giant',      icon: '🦾', name: 'ענק',         dur: 0     },
];

// ════════════════════════════════════════════════════════════
// 1b. ASSET LOADER & SPRITE DEFINITIONS
// ════════════════════════════════════════════════════════════
//
// Two image files:
//   assets/background.png — full construction-scene background (1024×682, opaque)
//   assets/blocks.png     — block/special sprites, transparent background (1024×682)

const ASSETS = { bg: null, blocks: null, ready: false };

function loadAssets(callback) {
  var loaded = 0, total = 2;
  function onLoad() { if (++loaded === total) { ASSETS.ready = true; callback(); } }
  function load(key, src) {
    var img = new Image();
    img.onload  = function() { ASSETS[key] = img; onLoad(); };
    img.onerror = function() { console.warn('Failed to load', src); onLoad(); };
    img.src = src;
  }
  load('bg',     'assets/background.png');
  load('blocks', 'assets/blocks.png');
}

/* ── BLOCK SPRITES (blocks.png — transparent bg, 1024×682) ───────────
   All coordinates verified by pixel-color sampling.

   Row 1 (sy:36, sh:124): 5 smiley squares — yellow, red, green, blue, purple
     Each is ~124px wide; divided evenly across x=176–795.
   Row 2 (sy:160, sh:115): 4 rectangles — orange, pink, blue, purple
     Each is ~163px wide across x=178–831.
   Row 3 (sy:275): triangle (green), arch (blue U), circle (yellow smiley),
     + 2 wooden planks stacked vertically at x=640+.
   Row 4 (sy:390, sh:140): special blocks + power-up icons.
   Row 5 (sy:520, sh:34): platform tiles.

   To adjust a sprite, change its sx/sy/sw/sh values here. ─────────── */
// ── BLOCK_SPRITES — coordinates match the generated blocks.png sprite sheet ──
// Sheet layout (700px tall, 1024px wide):
//   Row 0 y=0   h=120 : 5 squares  (120×120 each, 4px gap)
//   Row 1 y=120 h=80  : 4 rects    (200×80  each, 4px gap)
//   Row 2 y=200 h=120 : triangle / arch / circle  (120×120 each)
//   Row 3 y=320 h=60  : plank_wide / plank_thin   (300×60  each)
//   Row 4 y=380 h=130 : rainbow / bouncy / sticky / star
//   Row 5 y=510 h=100 : power-up icons (100×100 each)
//   Row 6 y=610 h=80  : heavy platforms (300×80 each)
const BLOCK_SPRITES = {
  square: [
    { sx:   0, sy:   0, sw: 120, sh: 120 }, // yellow
    { sx: 124, sy:   0, sw: 120, sh: 120 }, // red
    { sx: 248, sy:   0, sw: 120, sh: 120 }, // green
    { sx: 372, sy:   0, sw: 120, sh: 120 }, // blue
    { sx: 496, sy:   0, sw: 120, sh: 120 }, // purple
  ],
  rect: [
    { sx:   0, sy: 120, sw: 200, sh: 80 }, // orange
    { sx: 204, sy: 120, sw: 200, sh: 80 }, // pink
    { sx: 408, sy: 120, sw: 200, sh: 80 }, // blue
    { sx: 612, sy: 120, sw: 200, sh: 80 }, // purple
  ],
  triangle: [{ sx:   0, sy: 200, sw: 120, sh: 120 }],
  arch:     [{ sx: 124, sy: 200, sw: 120, sh: 120 }],
  circle:   [{ sx: 248, sy: 200, sw: 120, sh: 120 }],
  plank: [
    { sx:   0, sy: 320, sw: 300, sh: 60 }, // wide brown plank
    { sx: 304, sy: 320, sw: 300, sh: 60 }, // thin brown plank
  ],
  rainbow: [{ sx:   0, sy: 380, sw: 160, sh: 130 }],
  bouncy:  [{ sx: 164, sy: 380, sw: 100, sh: 130 }],
  sticky:  [{ sx: 268, sy: 380, sw: 120, sh: 130 }],
  star:    [{ sx: 392, sy: 380, sw: 120, sh: 130 }],
  heavy: [
    { sx:   0, sy: 610, sw: 300, sh: 80 }, // grass platform
    { sx: 304, sy: 610, sw: 300, sh: 80 }, // wood platform
    { sx: 608, sy: 610, sw: 300, sh: 80 }, // stone platform
  ],
};

/* ── POWER-UP ICON SPRITES ──────────────────────────────────────── */
const PU_SPRITES = {
  slowtime:  { sx:   0, sy: 510, sw: 100, sh: 100 }, // hourglass
  undo:      { sx: 104, sy: 510, sw: 100, sh: 100 }, // refresh circle
  stabilize: { sx:   0, sy: 510, sw: 100, sh: 100 }, // reuse hourglass
  giant:     { sx: 208, sy: 510, sw: 100, sh: 100 }, // golden hammer
};

// background.png: the visual grass/dirt boundary sits at ~82% from the top.
// BG_GROUND_FRAC controls where this line maps onto the physics floor.
var BG_GROUND_FRAC = 0.82;

function pickSpriteVariant(pieceId) {
  var variants = BLOCK_SPRITES[pieceId];
  if (!variants || variants.length === 0) return null;
  return variants[Math.floor(Math.random() * variants.length)];
}

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

  rootPiece:    null,  // first placed block — defines the tower

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
  GS.cameraY       = 0;
  GS.rootPiece     = null;
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
  const aud = new Audio('assets/TowerMusic.mp3');
  aud.loop   = true;
  aud.volume = 0.32;
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
    worldY:   0,
    vy:       0,
    angle:    0,
    color:    getPieceColor(id),
    special:  def.special || null,
    wobble:   { ang: 0, vel: 0 },
    onGround: false,
    spriteRegion: pickSpriteVariant(id),
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
// 7. PHYSICS WORLD — Root-connected tower with COM balance
// ════════════════════════════════════════════════════════════
//
// RULES:
//  1. The first placed block is the ROOT / foundation.
//  2. Every subsequent block must physically touch the existing tower.
//  3. After each placement, a contact graph is built and BFS from
//     root determines which pieces are connected. Disconnected = fall.
//  4. Center-of-mass stability: for each support contact, the COM of
//     everything above must stay within the support footprint or tip.
//  5. Pieces that lose support animate falling off-screen.
//
// COORDINATES:
//  - worldY=0 is ground. Positive = up.
//  - toCanvasY / toWorldY convert between world and canvas pixels.

const CONTACT_TOL     = 10;   // px gap allowed for "touching"
const COM_TOLERANCE   = { easy: 0.90, normal: 0.70, hard: 0.50 };

function toCanvasY(worldY) {
  return GS.canvasH - 12 - (worldY - GS.cameraY);
}
function toWorldY(canvasY) {
  return GS.cameraY + (GS.canvasH - 12 - canvasY);
}

function pLeft(p)   { return p.x - getPiecePixW(p) / 2; }
function pRight(p)  { return p.x + getPiecePixW(p) / 2; }
function pBot(p)    { return p.worldY - getPiecePixH(p) / 2; }
function pTop(p)    { return p.worldY + getPiecePixH(p) / 2; }

function overlapLen(aL, aR, bL, bR) {
  return Math.max(0, Math.min(aR, bR) - Math.max(aL, bL));
}

// ── CONTACT DETECTION ─────────────────────────────────────
// Two pieces are "in contact" if they share a face:
//  - Vertical: one sits on the other (top≈bottom) with horizontal overlap
//  - Side: edges meet with vertical overlap

function areTouching(a, b) {
  var aL = pLeft(a),  aR = pRight(a);
  var bL = pLeft(b),  bR = pRight(b);
  var aB = pBot(a),   aT = pTop(a);
  var bB = pBot(b),   bT = pTop(b);

  var hOv = overlapLen(aL, aR, bL, bR);
  var vOv = overlapLen(aB, aT, bB, bT);

  // Vertical contact: one sits on the other (top≈bottom) with >3px horizontal overlap
  if (hOv > 3) {
    if (Math.abs(aT - bB) < CONTACT_TOL) return true;
    if (Math.abs(bT - aB) < CONTACT_TOL) return true;
  }
  // Side contact: edges meet with >3px vertical overlap
  if (vOv > 3) {
    if (Math.abs(aR - bL) < CONTACT_TOL) return true;
    if (Math.abs(bR - aL) < CONTACT_TOL) return true;
  }
  return false;
}

function isOnGround(p) {
  return Math.abs(pBot(p)) < CONTACT_TOL;
}

function isSittingOn(upper, lower) {
  var hOv = overlapLen(pLeft(upper), pRight(upper), pLeft(lower), pRight(lower));
  if (hOv < 3) return false;
  return Math.abs(pBot(upper) - pTop(lower)) < CONTACT_TOL;
}

// ── CONTACT GRAPH & CONNECTIVITY ──────────────────────────

function buildContactGraph(pieces) {
  const adj = new Map();
  pieces.forEach(function(p) { adj.set(p, new Set()); });
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (areTouching(pieces[i], pieces[j])) {
        adj.get(pieces[i]).add(pieces[j]);
        adj.get(pieces[j]).add(pieces[i]);
      }
    }
  }
  return adj;
}

function getConnectedToRoot() {
  const settled = GS.placedPieces.filter(function(p) { return p.onGround; });
  if (!GS.rootPiece || !GS.rootPiece.onGround || settled.length === 0) return new Set();
  const adj     = buildContactGraph(settled);
  const visited = new Set();
  const queue   = [GS.rootPiece];
  visited.add(GS.rootPiece);
  while (queue.length > 0) {
    var cur = queue.shift();
    var neighbors = adj.get(cur);
    if (!neighbors) continue;
    neighbors.forEach(function(n) {
      if (!visited.has(n)) { visited.add(n); queue.push(n); }
    });
  }
  return visited;
}

function checkConnectivity() {
  if (!GS.rootPiece) return;
  var connected = getConnectedToRoot();
  var anyFell = false;
  GS.placedPieces.forEach(function(p) {
    if (!p.onGround) return;
    if (!connected.has(p)) {
      p.onGround = false;
      p.fallVx   = (p.x > GS.canvasW / 2 ? 1 : -1) * (1 + Math.random() * 2);
      p.fallVy   = 0;
      anyFell = true;
    }
  });
  if (anyFell) SoundFX.fail();
}

// ── SUPPORT & CENTER-OF-MASS STABILITY ────────────────────

function findDirectSupports(p, pieces) {
  var supports = [];
  pieces.forEach(function(q) {
    if (q === p || !q.onGround) return;
    if (isSittingOn(p, q)) supports.push(q);
  });
  return supports;
}

function findPiecesAbove(start, pieces) {
  var above = new Set();
  var queue = [start];
  while (queue.length > 0) {
    var cur = queue.shift();
    for (var i = 0; i < pieces.length; i++) {
      var other = pieces[i];
      if (other === start || above.has(other) || !other.onGround) continue;
      if (isSittingOn(other, cur)) { above.add(other); queue.push(other); }
    }
  }
  return above;
}

function checkStability() {
  if (GS.activePU && GS.activePU.def.id === 'stabilize') return;
  var tol    = COM_TOLERANCE[GS.diff];
  var pieces = GS.placedPieces.filter(function(p) { return p.onGround; });
  pieces.sort(function(a, b) { return a.worldY - b.worldY; });

  var tipped = false;
  for (var i = 0; i < pieces.length && !tipped; i++) {
    var base = pieces[i];
    if (isOnGround(base)) continue;

    var supports = findDirectSupports(base, pieces);
    if (supports.length === 0) continue;

    var sMinX = Infinity, sMaxX = -Infinity;
    supports.forEach(function(s) {
      var oL = Math.max(pLeft(base), pLeft(s));
      var oR = Math.min(pRight(base), pRight(s));
      if (oL < oR) { if (oL < sMinX) sMinX = oL; if (oR > sMaxX) sMaxX = oR; }
    });
    if (sMinX >= sMaxX) continue;

    var above = findPiecesAbove(base, pieces);
    above.add(base);

    var totalMass = 0, weightedX = 0;
    above.forEach(function(p) {
      var m = p.def.mass || 1;
      totalMass += m;
      weightedX += p.x * m;
    });
    var comX = weightedX / totalMass;

    var sMid  = (sMinX + sMaxX) / 2;
    var sHalf = (sMaxX - sMinX) / 2 * tol;

    if (Math.abs(comX - sMid) > sHalf) {
      var dir = comX > sMid ? 1 : -1;
      above.forEach(function(p) {
        p.onGround = false;
        p.fallVx   = dir * (1.5 + Math.random() * 2);
        p.fallVy   = 0;
        if (p.wobble) p.wobble.vel = dir * 0.15;
      });
      tipped = true;
      SoundFX.fail();
    }
  }
  if (tipped) checkConnectivity();
}

// ── SURFACE FINDING ───────────────────────────────────────

function getTopSurfaceWorldAt(px, pw) {
  var topWY = 0;
  for (var i = 0; i < GS.placedPieces.length; i++) {
    var pl = GS.placedPieces[i];
    if (!pl.onGround) continue;
    var ov = overlapLen(px - pw / 2, px + pw / 2, pLeft(pl), pRight(pl));
    if (ov > 3) {
      var t = pTop(pl);
      if (t > topWY) topWY = t;
    }
  }
  return topWY;
}

// ── PLACEMENT VALIDATION ──────────────────────────────────
// Valid if: first piece, OR the landing position would touch the tower.

function wouldConnectToTower(px, pw, surfaceWorldY) {
  var settled = GS.placedPieces.filter(function(p) { return p.onGround; });
  if (settled.length === 0) return true;
  if (!GS.rootPiece) return true;

  var cp = GS.currentPiece;
  var ph = cp ? getPiecePixH(cp) : GS.cellPx;
  var newBot = surfaceWorldY;
  var newTop = surfaceWorldY + ph;
  var newL   = px - pw / 2;
  var newR   = px + pw / 2;

  for (var i = 0; i < settled.length; i++) {
    var q = settled[i];
    var qL = pLeft(q), qR = pRight(q), qB = pBot(q), qT = pTop(q);
    var hOv = overlapLen(newL, newR, qL, qR);
    var vOv = overlapLen(newBot, newTop, qB, qT);

    // Vertical contact (sitting on or under): any horizontal overlap > 3px
    if (hOv > 3) {
      if (Math.abs(newBot - qT) < CONTACT_TOL) return true;
      if (Math.abs(qB - newTop) < CONTACT_TOL) return true;
    }
    // Side contact: any vertical overlap > 3px
    if (vOv > 3) {
      if (Math.abs(newR - qL) < CONTACT_TOL) return true;
      if (Math.abs(qR - newL) < CONTACT_TOL) return true;
    }
  }
  return false;
}

function isPlacementValid() {
  var p = GS.currentPiece;
  if (!p) return false;
  var pw = getPiecePixW(p);
  var surface = getTopSurfaceWorldAt(p.x, pw);
  return wouldConnectToTower(p.x, pw, surface);
}

// ── GRAVITY / FALLING CURRENT PIECE ───────────────────────

function applyPhysics() {
  var p = GS.currentPiece;
  if (!p || p.onGround) return;

  var cfg  = DIFF_CFG[GS.diff];
  var slow = (GS.activePU && GS.activePU.def.id === 'slowtime') ? 0.35 : 1;
  var grav = cfg.gravity * slow;
  if (GS.softDrop) grav *= 4;

  p.vy     += grav;
  p.vy      = Math.min(p.vy, 18);
  p.worldY -= p.vy;

  var pw = getPiecePixW(p);
  if (p.x - pw / 2 < 4)              p.x = pw / 2 + 4;
  if (p.x + pw / 2 > GS.canvasW - 4) p.x = GS.canvasW - pw / 2 - 4;

  var ph      = getPiecePixH(p);
  var bottom  = p.worldY - ph / 2;
  var surface = getTopSurfaceWorldAt(p.x, pw);

  if (bottom <= surface) {
    landPiece(p, surface);
  }
}

// ── LANDING ───────────────────────────────────────────────

function landPiece(p, surfaceWorldY) {
  var ph = getPiecePixH(p);
  p.worldY   = surfaceWorldY + ph / 2;
  p.vy       = 0;
  p.onGround = true;
  p.wobble   = p.wobble || { ang: 0, vel: 0.04 };

  var isFirst = GS.placedPieces.filter(function(q) { return q.onGround; }).length === 0;

  if (isFirst) {
    GS.rootPiece = p;
    GS.placedPieces.push(p);
    GS.blocksPlaced++;
  } else {
    GS.placedPieces.push(p);
    GS.blocksPlaced++;

    var connected = getConnectedToRoot();
    if (!connected.has(p)) {
      var dir = p.x > GS.canvasW / 2 ? 1 : -1;
      p.onGround = false;
      p.fallVx   = dir * (1.5 + Math.random());
      p.fallVy   = 0;
      showFloatMsg('⚠️ חובה להתחבר למגדל!');
      SoundFX.fail();
      if (GS.mode !== 'free') checkCollapse();
      if (!GS.running) return;
      spawnNextPiece();
      return;
    }
  }

  var cfg  = DIFF_CFG[GS.diff];
  var mass = p.def.mass || 1;
  GS.placedPieces.forEach(function(pl) {
    if (!pl.onGround || !pl.wobble) return;
    pl.wobble.vel += (Math.random() - 0.5) * cfg.wobble * mass * 3;
  });

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
    var pu = PU_DEFS[Math.floor(Math.random() * PU_DEFS.length)];
    GS.puQueue.push(pu);
    showFloatMsg(pu.icon + ' ' + pu.name + '!');
    SoundFX.pu();
    if (!GS.activePU) activateNextPU();
  }

  checkStability();
  checkConnectivity();

  if (GS.mode !== 'free') checkCollapse();
  if (!GS.running) return;
  checkGoal();
  if (!GS.running) return;
  GS._lastPiecePlaced = p;
  spawnNextPiece();
}

// ── TOWER HEIGHT ──────────────────────────────────────────

function updateTowerHeight() {
  var maxWY = 0;
  GS.placedPieces.forEach(function(pl) {
    if (!pl.onGround) return;
    var t = pTop(pl);
    if (t > maxWY) maxWY = t;
  });
  GS.towerHeight = Math.round(maxWY / GS.cellPx * 10) / 10;
  if (GS.towerHeight > GS.maxHeight) GS.maxHeight = GS.towerHeight;
  if (GS.mode === 'challenge') updateGoalUI();
}

// ── COLLAPSE CHECK ────────────────────────────────────────

function checkCollapse() {
  if (GS.placedPieces.length < 2) return;
  var cfg     = DIFF_CFG[GS.diff];
  var onGnd   = GS.placedPieces.filter(function(p) { return p.onGround; }).length;
  var total   = GS.placedPieces.length;

  if (GS.rootPiece && !GS.rootPiece.onGround) { endGame('collapse'); return; }
  if (total > 2 && (total - onGnd) / total >= cfg.collapseRatio) endGame('collapse');
}

// ── ANIMATE FALLING PIECES ────────────────────────────────

function updateFallingPieces() {
  GS.placedPieces.forEach(function(pl) {
    if (pl.onGround) {
      if (!pl.wobble) pl.wobble = { ang: 0, vel: 0 };
      pl.wobble.vel += -pl.wobble.ang * 0.08;
      pl.wobble.vel *= 0.80;
      pl.wobble.ang += pl.wobble.vel;
      pl.wobble.ang  = Math.max(-0.18, Math.min(0.18, pl.wobble.ang));
      return;
    }
    pl.fallVy = (pl.fallVy || 0) + 0.4;
    pl.worldY -= pl.fallVy;
    pl.x      += (pl.fallVx || 0);
    if (pl.wobble) {
      pl.wobble.ang += pl.wobble.vel || 0;
      pl.wobble.vel  = (pl.wobble.vel || 0) * 0.95;
    }
  });

  GS.placedPieces = GS.placedPieces.filter(function(pl) {
    return toCanvasY(pl.worldY) < GS.canvasH + 200
        && pl.x > -300 && pl.x < GS.canvasW + 300;
  });
}

// ── CAMERA ────────────────────────────────────────────────

function updateCamera() {
  var topWY        = GS.towerHeight * GS.cellPx;
  var desiredCamY  = topWY - GS.canvasH * 0.70 + 12;
  if (desiredCamY > GS.cameraY) GS.cameraY += (desiredCamY - GS.cameraY) * 0.05;
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
  var groundCanvasY = toCanvasY(0);

  // Sky gradient always fills the whole canvas first (visible above/beside image)
  var sky = ctx.createLinearGradient(0, 0, 0, groundCanvasY > 0 ? groundCanvasY : H);
  sky.addColorStop(0, '#4aaee8');
  sky.addColorStop(1, '#82d0ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (ASSETS.ready && ASSETS.bg) {
    var img   = ASSETS.bg;                  // background.png (1024×682, full scene)
    var scale = W / img.naturalWidth;       // scale to fill canvas width
    var imgH  = img.naturalHeight * scale;
    // BG_GROUND_FRAC = 0.82: the grass/dirt boundary sits 82% down the image.
    // Position the image so that boundary aligns with the physics floor.
    var imgY  = groundCanvasY - imgH * BG_GROUND_FRAC;

    ctx.drawImage(img, 0, imgY, W, imgH);

    // Fill any remaining dirt below the image bottom
    var imgBottom = imgY + imgH;
    if (imgBottom < H) {
      ctx.fillStyle = '#6B4226';
      ctx.fillRect(0, imgBottom, W, H - imgBottom);
    }
  } else {
    drawBackgroundFallback(ctx, W, H);
  }
}

function drawBackgroundFallback(ctx, W, H) {
  var sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#b0d8f0');
  sky.addColorStop(1, '#5db0e0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  var groundCanvasY = toCanvasY(0);
  if (groundCanvasY < H) {
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, groundCanvasY, W, H - groundCanvasY + 12);
    ctx.fillStyle = '#6B8E23';
    ctx.fillRect(0, groundCanvasY - 4, W, 6);
  }
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
  var pw = getPiecePixW(p);
  var ph = getPiecePixH(p);
  var canvasY = 'worldY' in p ? toCanvasY(p.worldY) : p.y;
  ctx.save();
  ctx.translate(p.x, canvasY);
  ctx.rotate(p.wobble ? p.wobble.ang : 0);
  ctx.globalAlpha = alpha !== undefined ? alpha : 1;

  var sp = p.spriteRegion;
  if (ASSETS.ready && ASSETS.blocks && sp) {
    ctx.drawImage(ASSETS.blocks, sp.sx, sp.sy, sp.sw, sp.sh, -pw / 2, -ph / 2, pw, ph);
  } else {
    drawPieceFallback(ctx, p, pw, ph);
  }
  ctx.restore();
}

function drawPieceFallback(ctx, p, pw, ph) {
  var color = resolveColor(p);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  drawShape(ctx, p.def.shape, pw + 4, ph + 4, 2, 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(color);
  ctx.lineWidth = 2;
  drawShape(ctx, p.def.shape, pw, ph, 0, 0);
  if (p.special) drawSpecialOverlay(ctx, p, pw, ph);
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
  var p = GS.currentPiece;
  if (!p || p.onGround) return;
  var pw = getPiecePixW(p);
  var ph = getPiecePixH(p);
  var surfaceWorldY = getTopSurfaceWorldAt(p.x, pw);
  var ghostWorldY   = surfaceWorldY + ph / 2;
  var ghostCanvasY  = toCanvasY(ghostWorldY);
  var pieceCanvasY  = toCanvasY(p.worldY);
  if (ghostCanvasY >= pieceCanvasY) return;

  var valid = isPlacementValid();
  var sp    = p.spriteRegion;

  ctx.save();
  ctx.globalAlpha = valid ? 0.25 : 0.35;
  ctx.translate(p.x, ghostCanvasY);

  if (ASSETS.ready && ASSETS.blocks && sp && valid) {
    ctx.drawImage(ASSETS.blocks, sp.sx, sp.sy, sp.sw, sp.sh, -pw / 2, -ph / 2, pw, ph);
  } else {
    ctx.fillStyle   = valid ? (p.color !== 'rainbow' ? p.color : '#aaa') : '#ff3333';
    ctx.strokeStyle = valid ? '#fff' : '#ff0000';
    ctx.lineWidth   = valid ? 1 : 2;
    drawShape(ctx, p.def.shape, pw, ph, 0, 0);
  }

  if (!valid) {
    ctx.globalAlpha = 0.85;
    ctx.font        = Math.round(Math.min(pw, ph) * 0.35) + 'px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle   = '#fff';
    ctx.fillText('✕', 0, 0);
  }
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
  var canvas = document.getElementById('preview-canvas');
  var ctx    = canvas.getContext('2d');
  var CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  if (GS.pieceQueue.length === 0) return;

  var next  = GS.pieceQueue[0];
  var def   = next.def;
  var scale = Math.min(CW / (def.w * CELL * 1.4), CH / (def.h * CELL * 1.4), 1);
  var pw    = def.w * CELL * scale;
  var ph    = def.h * CELL * scale;
  var sp    = next.spriteRegion;

  ctx.save();
  ctx.translate(CW / 2, CH / 2);

  if (ASSETS.ready && ASSETS.blocks && sp) {
    ctx.drawImage(ASSETS.blocks, sp.sx, sp.sy, sp.sw, sp.sh, -pw / 2, -ph / 2, pw, ph);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    drawShape(ctx, def.shape, pw + 3, ph + 3, 1, 1);
    var color = next.color !== 'rainbow' ? next.color : '#aaddff';
    ctx.fillStyle = color;
    ctx.strokeStyle = darken(color);
    ctx.lineWidth = 2;
    ctx.beginPath();
    drawShape(ctx, def.shape, pw, ph, 0, 0);
    if (next.special) {
      var icons = { heavy:'\u2699\uFE0F', bouncy:'\uD83D\uDCAB', sticky:'\uD83C\uDF6F', star:'\u2B50', rainbow:'\uD83C\uDF08' };
      var ic = icons[next.special];
      if (ic) {
        ctx.font = Math.round(Math.min(pw, ph) * 0.38) + 'px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(ic, 0, 0);
      }
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
  var p = GS.currentPiece;
  if (!p || p.onGround || GS.busy || GS.paused || !GS.running) return;
  if (!isPlacementValid()) {
    showFloatMsg('⚠️ חובה להתחבר למגדל!');
    SoundFX.fail();
    return;
  }
  var pw          = getPiecePixW(p);
  var ph          = getPiecePixH(p);
  var surfaceWorldY = getTopSurfaceWorldAt(p.x, pw);
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
      if (GS.placedPieces.length > 0) {
        var onGndPcs = GS.placedPieces.filter(function(p) { return p.onGround; });
        var topPiece = onGndPcs.length > 0
          ? onGndPcs.reduce(function(a, b){ return a.worldY > b.worldY ? a : b; })
          : null;
        if (topPiece && topPiece.id === lvl.topType && onGndPcs.length >= 3) {
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
      var onGndTop = GS.placedPieces.filter(function(p) { return p.onGround; });
      var topP = onGndTop.length > 0
        ? onGndTop.reduce(function(a, b) { return a.worldY > b.worldY ? a : b; })
        : null;
      var hasStarOnTop = topP && topP.special === 'star' && GS.towerHeight >= lvl.target;
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
  GS.running      = false;
  GS.currentPiece = null;  // stop any in-air piece immediately
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
    updateFallingPieces();
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

    // End game if root fell or all pieces are off-screen
    if (GS.mode !== 'free' && GS.placedPieces.length >= 2) {
      if (GS.rootPiece && !GS.rootPiece.onGround) endGame('collapse');
      else {
        var onGnd = GS.placedPieces.filter(function(pl){ return pl.onGround; }).length;
        if (onGnd === 0) endGame('fallen');
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
  loadAssets(function() {
    restoreSettings();
    wireMenu();
    wireGame();
    wireKeyboard();
    wireMobileControls();
    wireResize();
    updateMenuDisplay();
    showScreen('screen-menu');
  });
}

document.addEventListener('DOMContentLoaded', init);
