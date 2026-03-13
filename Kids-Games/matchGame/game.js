/*
 * ════════════════════════════════════════════════════════════
 *  כוכבי קסם — game.js   (Match-3 inspired by Bejeweled)
 *
 *  HOW TO RUN: Open index.html in any modern browser.
 *
 *  SECTIONS:
 *   1.  Constants & Config
 *   2.  Storage
 *   3.  Game State
 *   4.  Audio (SoundFX + BgMusic)
 *   5.  Board — init, render, resize
 *   6.  Match Detection
 *   7.  Special Pieces
 *   8.  Swap Logic
 *   9.  Fill & Cascade
 *  10.  Hint System
 *  11.  Game Modes & Scoring
 *  12.  UI Updates
 *  13.  Input Handling
 *  14.  Menu Wiring
 *  15.  Init
 * ════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

// Piece types: emoji + background color
const PIECE_TYPES = [
  { id: 0, icon: '⭐', bg: '#facc15', shadow: '#ca8a04' },
  { id: 1, icon: '💎', bg: '#60a5fa', shadow: '#1d4ed8' },
  { id: 2, icon: '🍀', bg: '#4ade80', shadow: '#15803d' },
  { id: 3, icon: '🌸', bg: '#f472b6', shadow: '#be185d' },
  { id: 4, icon: '🔥', bg: '#fb923c', shadow: '#c2410c' },
  { id: 5, icon: '🫐', bg: '#a78bfa', shadow: '#6d28d9' },
];

// Special piece types
const SPECIAL = {
  NONE:        0,
  LINE_BLAST:  1,  // match 4 → clears row or column
  COLOR_BURST: 2,  // match 5 → clears all of that color
  WRAP_POP:    3,  // T or L → 3×3 explosion
  RAINBOW:     4,  // random bonus
};

const SPECIAL_ICONS = { 1:'💥', 2:'🌈', 3:'🔥', 4:'🌟' };

const DIFF_CFG = {
  easy:   { size: 6, types: 5, hintDelay: 3000,  timerSecs: 90,  timeBonus: 4 },
  normal: { size: 7, types: 6, hintDelay: 5000,  timerSecs: 70,  timeBonus: 3 },
  hard:   { size: 8, types: 6, hintDelay: 9000,  timerSecs: 55,  timeBonus: 2 },
};

// Goal mode level definitions
const GOAL_LEVELS = [
  { target: 800,  desc: 'הגע ל-800 ניקוד',      type: 'score' },
  { target: 1500, desc: 'הגע ל-1500 ניקוד',     type: 'score' },
  { target: 5,    desc: 'צור 5 כלים מיוחדים',   type: 'specials' },
  { target: 2500, desc: 'הגע ל-2500 ניקוד',     type: 'score' },
  { target: 8,    desc: 'רצף קומבו 8 פעמים',    type: 'combos' },
  { target: 4000, desc: 'הגע ל-4000 ניקוד',     type: 'score' },
  { target: 10,   desc: 'צור 10 כלים מיוחדים',  type: 'specials' },
  { target: 6000, desc: 'הגע ל-6000 ניקוד',     type: 'score' },
];

const SCORE = { match3: 100, match4: 200, match5: 400, tl: 300, cascade: 50, special: 150 };
const ENCOURAGEMENTS = ['מעולה!','כל הכבוד!','מהמם!','סופר קומבו!','אלוף!','מגה פיצוץ!','ניצחת!'];

// ════════════════════════════════════════════════════════════
// 2. STORAGE
// ════════════════════════════════════════════════════════════

const Storage = {
  bestKey(mode, diff) { return 'mg_best_' + mode + '_' + diff; },
  getBest(mode, diff) { return parseInt(localStorage.getItem(Storage.bestKey(mode, diff)) || '0', 10); },
  saveBest(mode, diff, score) {
    if (score > Storage.getBest(mode, diff)) {
      localStorage.setItem(Storage.bestKey(mode, diff), String(score));
      return true;
    }
    return false;
  },
  getSettings() {
    try { return JSON.parse(localStorage.getItem('mg_settings') || '{}'); } catch(e) { return {}; }
  },
  saveSettings(obj) {
    const cur = Storage.getSettings();
    localStorage.setItem('mg_settings', JSON.stringify(Object.assign(cur, obj)));
  },
};

// ════════════════════════════════════════════════════════════
// 3. GAME STATE
// ════════════════════════════════════════════════════════════

const GS = {
  mode:     'classic',
  diff:     'easy',
  soundOn:  true,

  running:   false,
  paused:    false,
  busy:      false,   // input locked during animation

  grid:      [],      // 2D array [row][col] = { type, special, el }
  size:      6,
  types:     5,

  score:     0,
  level:     1,       // goal mode level index
  cascade:   0,       // current cascade chain depth
  specialsMade: 0,    // goal mode counter
  combosMade:   0,    // goal mode combo counter

  selected:  null,    // { r, c } or null
  timerSecs: 90,
  timerInterval: null,

  hintTimer:  null,
  hintCells:  [],

  goalLevel:  0,      // index in GOAL_LEVELS
  goalProgress: 0,
};

function resetRuntime() {
  GS.running   = false;
  GS.paused    = false;
  GS.busy      = false;
  GS.grid      = [];
  GS.score     = 0;
  GS.cascade   = 0;
  GS.specialsMade = 0;
  GS.combosMade   = 0;
  GS.selected  = null;
  GS.hintCells = [];
  GS.goalProgress = 0;
  clearInterval(GS.timerInterval); GS.timerInterval = null;
  clearTimeout(GS.hintTimer);      GS.hintTimer     = null;
  if (GS.mode === 'goal') {
    GS.level = GS.goalLevel;
  } else {
    GS.level = 1;
  }
  const cfg    = DIFF_CFG[GS.diff];
  GS.size      = cfg.size;
  GS.types     = cfg.types;
  GS.timerSecs = cfg.timerSecs;
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let audioCtx = null, unlocked = false;
  function getCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }
  function unlock() {
    if (unlocked) return;
    const c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
    document.getElementById('audio-banner').style.display = 'none';
    BgMusic.play();
  }
  function beep(freq, dur, type, vol) {
    if (!GS.soundOn) return;
    const c = getCtx(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(vol || 0.14, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    } catch(e) {}
  }
  return {
    unlock,
    pop()     { beep(600, 0.08, 'sine', 0.18); },
    match()   { beep(880, 0.1,  'sine', 0.16); setTimeout(function(){ beep(1100,0.08,'sine',0.14); }, 70); },
    special() { [700,900,1100,1300].forEach(function(f,i){ setTimeout(function(){ beep(f,0.09,'sine',0.15); }, i*60); }); },
    invalid() { beep(220, 0.15, 'sawtooth', 0.08); },
    combo()   { beep(1047, 0.12, 'sine', 0.18); setTimeout(function(){ beep(1319,0.12,'sine',0.16); }, 80); },
    levelup() { [523,659,784,1047,1319].forEach(function(f,i){ setTimeout(function(){ beep(f,0.12,'sine',0.15); }, i*100); }); },
    gameover(){ beep(220, 0.4, 'sawtooth', 0.1); },
  };
})();

const BgMusic = (() => {
  const aud = new Audio('assets/matchingmusic.mp3');
  aud.loop   = true;
  aud.volume = 0.4;
  return {
    play()   { if (GS.soundOn) { aud.play().catch(function(){}); } },
    stop()   { aud.pause(); aud.currentTime = 0; },
    pause()  { aud.pause(); },
    resume() { if (GS.soundOn) aud.play().catch(function(){}); },
    toggle(on) { on ? this.resume() : this.pause(); },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. BOARD — init, render, resize
// ════════════════════════════════════════════════════════════

function buildBoard() {
  const boardEl = document.getElementById('board');
  boardEl.style.gridTemplateColumns = 'repeat(' + GS.size + ', 1fr)';
  boardEl.innerHTML = '';

  // Build data grid (no initial matches)
  GS.grid = [];
  for (let r = 0; r < GS.size; r++) {
    GS.grid[r] = [];
    for (let c = 0; c < GS.size; c++) {
      GS.grid[r][c] = { type: randomType(r, c), special: SPECIAL.NONE, el: null };
    }
  }

  // Create DOM elements
  for (let r = 0; r < GS.size; r++) {
    for (let c = 0; c < GS.size; c++) {
      const cell = createCellEl(r, c);
      boardEl.appendChild(cell);
      GS.grid[r][c].el = cell;
    }
  }

  sizePieces();
}

// Pick a random type that doesn't immediately create a match of 3
function randomType(r, c) {
  const forbidden = new Set();
  // Check left-left
  if (c >= 2 && GS.grid[r][c-1].type === GS.grid[r][c-2].type) {
    forbidden.add(GS.grid[r][c-1].type);
  }
  // Check up-up
  if (r >= 2 && GS.grid[r-1][c].type === GS.grid[r-2][c].type) {
    forbidden.add(GS.grid[r-1][c].type);
  }
  let t;
  do { t = Math.floor(Math.random() * GS.types); } while (forbidden.has(t));
  return t;
}

function createCellEl(r, c) {
  const piece = GS.grid[r][c];
  const pt    = PIECE_TYPES[piece.type];
  const cell  = document.createElement('div');
  cell.className   = 'piece-cell';
  cell.dataset.r   = r;
  cell.dataset.c   = c;
  cell.style.background = pt.bg;
  cell.style.boxShadow  = '0 3px 8px rgba(0,0,0,0.3), inset 0 1px 3px rgba(255,255,255,0.35)';

  const icon = document.createElement('span');
  icon.className = 'piece-icon';
  icon.textContent = pt.icon;
  cell.appendChild(icon);

  if (piece.special !== SPECIAL.NONE) {
    addSpecialBadge(cell, piece.special);
  }

  cell.addEventListener('click', onCellClick);
  return cell;
}

function addSpecialBadge(cellEl, specialType) {
  const old = cellEl.querySelector('.piece-badge');
  if (old) old.remove();
  if (specialType === SPECIAL.NONE) return;
  const badge = document.createElement('span');
  badge.className   = 'piece-badge';
  badge.textContent = SPECIAL_ICONS[specialType] || '';
  cellEl.appendChild(badge);
}

function refreshCellVisual(r, c) {
  const piece = GS.grid[r][c];
  if (!piece || !piece.el) return;
  const pt = PIECE_TYPES[piece.type];
  piece.el.style.background = pt.bg;
  piece.el.style.boxShadow  = '0 3px 8px rgba(0,0,0,0.3), inset 0 1px 3px rgba(255,255,255,0.35)';
  const icon = piece.el.querySelector('.piece-icon');
  if (icon) icon.textContent = pt.icon;
  addSpecialBadge(piece.el, piece.special);
}

function sizePieces() {
  const wrap = document.getElementById('board-wrap');
  const W    = wrap.clientWidth;
  const H    = wrap.clientHeight;
  const gap  = 3;
  const maxCellW = Math.floor((W - gap * (GS.size - 1)) / GS.size);
  const maxCellH = Math.floor((H - gap * (GS.size - 1)) / GS.size);
  const cellSz   = Math.max(32, Math.min(maxCellW, maxCellH, 80));
  const fontSize = Math.max(14, Math.round(cellSz * 0.54));

  const boardEl = document.getElementById('board');
  boardEl.style.gridTemplateColumns = 'repeat(' + GS.size + ', ' + cellSz + 'px)';

  document.querySelectorAll('.piece-cell').forEach(function(el) {
    el.style.width  = cellSz + 'px';
    el.style.height = cellSz + 'px';
    el.style.fontSize = fontSize + 'px';
    el.style.borderRadius = Math.round(cellSz * 0.18) + 'px';
  });
}

// ════════════════════════════════════════════════════════════
// 6. MATCH DETECTION
// ════════════════════════════════════════════════════════════

// Returns array of match groups: each group = { cells:[[r,c],...], shape:'h'|'v'|'tl', length }
function findAllMatches() {
  const size = GS.size;
  const matched = new Set(); // "r,c" strings already counted
  const groups  = [];

  // Scan horizontal
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      const t = GS.grid[r][c].type;
      if (t < 0) { c++; continue; } // empty
      let len = 1;
      while (c + len < size && GS.grid[r][c + len].type === t && t >= 0) len++;
      if (len >= 3) {
        const cells = [];
        for (let i = 0; i < len; i++) cells.push([r, c + i]);
        groups.push({ cells, shape: 'h', length: len, type: t });
      }
      c += len;
    }
  }

  // Scan vertical
  for (let c = 0; c < size; c++) {
    let r = 0;
    while (r < size) {
      const t = GS.grid[r][c].type;
      if (t < 0) { r++; continue; }
      let len = 1;
      while (r + len < size && GS.grid[r + len][c].type === t && t >= 0) len++;
      if (len >= 3) {
        const cells = [];
        for (let i = 0; i < len; i++) cells.push([r + i, c]);
        groups.push({ cells, shape: 'v', length: len, type: t });
      }
      r += len;
    }
  }

  // Merge overlapping groups (T / L shapes)
  return mergeGroups(groups);
}

function mergeGroups(groups) {
  // Tag each group's cells with group index
  const cellMap = {}; // "r,c" -> [group indices]
  groups.forEach(function(g, i) {
    g.cells.forEach(function(rc) {
      const key = rc[0] + ',' + rc[1];
      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push(i);
    });
  });

  const merged = new Array(groups.length).fill(false);
  const result = [];

  groups.forEach(function(g, i) {
    if (merged[i]) return;
    // Check if this group shares cells with another (T/L)
    let isTL = false;
    const allCells = new Map();
    g.cells.forEach(function(rc){ allCells.set(rc[0]+','+rc[1], rc); });

    groups.forEach(function(g2, j) {
      if (i === j || merged[j]) return;
      if (g2.type !== g.type) return;
      const shared = g2.cells.filter(function(rc){ return allCells.has(rc[0]+','+rc[1]); });
      if (shared.length > 0) {
        // Merge g2 into g
        g2.cells.forEach(function(rc){ allCells.set(rc[0]+','+rc[1], rc); });
        merged[j] = true;
        isTL      = true;
      }
    });

    const finalCells = Array.from(allCells.values());
    result.push({
      cells: finalCells,
      shape: isTL ? 'tl' : g.shape,
      length: isTL ? finalCells.length : g.length,
      type: g.type,
    });
  });
  return result;
}

// Find a valid swap: returns [r1,c1,r2,c2] or null
function findValidSwap() {
  const size = GS.size;
  const dirs = [[0,1],[1,0]];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of dirs) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= size || c2 >= size) continue;
        if (swapWouldMatch(r, c, r2, c2)) return [r, c, r2, c2];
      }
    }
  }
  return null;
}

function swapWouldMatch(r1, c1, r2, c2) {
  if (!GS.grid[r1] || !GS.grid[r1][c1] || !GS.grid[r2] || !GS.grid[r2][c2]) return false;
  const t1 = GS.grid[r1][c1].type, t2 = GS.grid[r2][c2].type;
  if (t1 < 0 || t2 < 0) return false;
  GS.grid[r1][c1].type = t2; GS.grid[r2][c2].type = t1;
  const matches = findAllMatches();
  GS.grid[r1][c1].type = t1; GS.grid[r2][c2].type = t2;
  return matches.length > 0;
}

// ════════════════════════════════════════════════════════════
// 7. SPECIAL PIECES
// ════════════════════════════════════════════════════════════

function determineSpecial(group) {
  if (group.shape === 'tl')           return SPECIAL.WRAP_POP;
  if (group.length >= 5)              return SPECIAL.COLOR_BURST;
  if (group.length === 4)             return SPECIAL.LINE_BLAST;
  return SPECIAL.NONE;
}

// Trigger a special piece at (r,c) — returns set of additional {r,c} to pop
function triggerSpecial(r, c) {
  const piece = GS.grid[r][c];
  if (!piece || piece.special === SPECIAL.NONE) return [];
  const sp   = piece.special;
  const type = piece.type;
  const toDestroy = [];

  if (sp === SPECIAL.LINE_BLAST) {
    // Clear row AND column (we pick row if horizontal match created it, but for simplicity always both)
    for (let i = 0; i < GS.size; i++) {
      if (i !== c) toDestroy.push([r, i]);
      if (i !== r) toDestroy.push([i, c]);
    }
  } else if (sp === SPECIAL.COLOR_BURST) {
    // Clear all pieces of the piece's type
    for (let rr = 0; rr < GS.size; rr++) {
      for (let cc = 0; cc < GS.size; cc++) {
        if (GS.grid[rr][cc] && GS.grid[rr][cc].type === type) {
          toDestroy.push([rr, cc]);
        }
      }
    }
  } else if (sp === SPECIAL.WRAP_POP) {
    // 3×3 area around this piece
    for (let rr = r-1; rr <= r+1; rr++) {
      for (let cc = c-1; cc <= c+1; cc++) {
        if (rr >= 0 && rr < GS.size && cc >= 0 && cc < GS.size) {
          if (rr !== r || cc !== c) toDestroy.push([rr, cc]);
        }
      }
    }
  } else if (sp === SPECIAL.RAINBOW) {
    // Destroy 8 random pieces
    const all = [];
    for (let rr = 0; rr < GS.size; rr++) {
      for (let cc = 0; cc < GS.size; cc++) {
        if (GS.grid[rr][cc] && !(rr === r && cc === c)) all.push([rr, cc]);
      }
    }
    shuffleArr(all);
    for (let i = 0; i < Math.min(8, all.length); i++) toDestroy.push(all[i]);
  }
  return toDestroy;
}

// Occasionally drop a rainbow on the board after high combo
function maybeDropRainbow() {
  if (GS.cascade < 3) return;
  if (Math.random() > 0.25) return;
  // Find a random non-special cell
  const candidates = [];
  for (let r = 0; r < GS.size; r++) {
    for (let c = 0; c < GS.size; c++) {
      if (GS.grid[r][c] && GS.grid[r][c].special === SPECIAL.NONE) candidates.push([r,c]);
    }
  }
  if (candidates.length === 0) return;
  const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
  GS.grid[r][c].special = SPECIAL.RAINBOW;
  refreshCellVisual(r, c);
}

// ════════════════════════════════════════════════════════════
// 8. SWAP LOGIC
// ════════════════════════════════════════════════════════════

function doSwap(r1, c1, r2, c2) {
  // Swap data
  const tmp = { type: GS.grid[r1][c1].type, special: GS.grid[r1][c1].special };
  GS.grid[r1][c1].type    = GS.grid[r2][c2].type;
  GS.grid[r1][c1].special = GS.grid[r2][c2].special;
  GS.grid[r2][c2].type    = tmp.type;
  GS.grid[r2][c2].special = tmp.special;
  refreshCellVisual(r1, c1);
  refreshCellVisual(r2, c2);
}

function animateSwap(r1, c1, r2, c2, callback) {
  const el1 = GS.grid[r1][c1].el;
  const el2 = GS.grid[r2][c2].el;
  if (!el1 || !el2) { callback(); return; }

  const dc = c2 - c1, dr = r2 - r1;
  const cls1 = dc > 0 ? 'swap-left' : dc < 0 ? 'swap-right' : dr > 0 ? 'swap-up' : 'swap-down';
  const cls2 = dc > 0 ? 'swap-right' : dc < 0 ? 'swap-left' : dr > 0 ? 'swap-down' : 'swap-up';

  el1.classList.add(cls1); el2.classList.add(cls2);
  setTimeout(function() {
    el1.classList.remove(cls1); el2.classList.remove(cls2);
    callback();
  }, 210);
}

function animateInvalidSwap(r1, c1, r2, c2, callback) {
  const el1 = GS.grid[r1][c1].el;
  const el2 = GS.grid[r2][c2].el;
  if (el1) el1.classList.add('invalid-shake');
  if (el2) el2.classList.add('invalid-shake');
  SoundFX.invalid();
  setTimeout(function() {
    if (el1) el1.classList.remove('invalid-shake');
    if (el2) el2.classList.remove('invalid-shake');
    callback();
  }, 360);
}

// ════════════════════════════════════════════════════════════
// 9. FILL & CASCADE
// ════════════════════════════════════════════════════════════

// Main cascade loop — find matches, pop them, fill, repeat
function runCascade(resolve) {
  const matches = findAllMatches();
  if (matches.length === 0) {
    GS.cascade = 0;
    GS.busy    = false;
    resetHintTimer();
    // Check for no valid moves
    if (!findValidSwap()) {
      reshuffleBoard(resolve);
    } else {
      if (resolve) resolve();
    }
    return;
  }

  GS.cascade++;
  if (GS.cascade > 1) {
    SoundFX.combo();
    showComboText(GS.cascade);
  }

  // Collect all cells to destroy (including specials)
  const toDestroy  = new Set();
  const newSpecials = [];   // [{ r, c, special }] to place after pop

  matches.forEach(function(group) {
    const sp = determineSpecial(group);
    group.cells.forEach(function(rc) { toDestroy.add(rc[0] + ',' + rc[1]); });

    if (sp !== SPECIAL.NONE) {
      // Place special at center of match
      const mid = group.cells[Math.floor(group.cells.length / 2)];
      newSpecials.push({ r: mid[0], c: mid[1], special: sp });
      GS.specialsMade++;
    }

    // Score
    addScore(group);
  });

  // Update goal progress once after all groups are scored
  if (GS.mode === 'goal') updateGoalProgress();

  // Collect special triggers from matched cells — snapshot first to avoid iteration mutation issues
  const toDestroySnapshot = Array.from(toDestroy);
  toDestroySnapshot.forEach(function(key) {
    const parts = key.split(',');
    const r = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
    if (GS.grid[r] && GS.grid[r][c] && GS.grid[r][c].special !== SPECIAL.NONE) {
      const extras = triggerSpecial(r, c);
      extras.forEach(function(rc) { toDestroy.add(rc[0] + ',' + rc[1]); });
      SoundFX.special();
      GS.score += SCORE.special;
      updateScoreUI();
    }
  });

  // Pop animation
  const cells = Array.from(toDestroy).map(function(key) {
    const [r, c] = key.split(',').map(Number);
    return [r, c];
  });

  cells.forEach(function(rc) {
    const el = GS.grid[rc[0]][rc[1]] && GS.grid[rc[0]][rc[1]].el;
    if (el) {
      el.classList.add('popping');
      spawnSparkles(el);
    }
  });
  SoundFX.match();

  setTimeout(function() {
    // Remove popped cells from grid data
    cells.forEach(function(rc) {
      const [r, c] = rc;
      if (GS.grid[r][c]) {
        GS.grid[r][c].type    = -1; // empty marker
        GS.grid[r][c].special = SPECIAL.NONE;
        if (GS.grid[r][c].el) GS.grid[r][c].el.classList.remove('popping');
      }
    });

    // Place new specials BEFORE gravity (at the position where match was)
    newSpecials.forEach(function(ns) {
      if (GS.grid[ns.r][ns.c]) {
        // Re-fill this cell with the same type it had (it was cleared above)
        // We need to preserve the type — find from match group
        const matchGroup = matches.find(function(g) {
          return g.cells.some(function(rc){ return rc[0]===ns.r && rc[1]===ns.c; });
        });
        if (matchGroup) {
          GS.grid[ns.r][ns.c].type    = matchGroup.type;
          GS.grid[ns.r][ns.c].special = ns.special;
        }
      }
    });

    // Apply gravity — drop pieces down
    applyGravity(function() {
      maybeDropRainbow();
      runCascade(resolve);
    });
  }, 320);
}

function applyGravity(callback) {
  for (let c = 0; c < GS.size; c++) {
    // Collect non-empty pieces from bottom to top
    const stack = [];
    for (let r = GS.size - 1; r >= 0; r--) {
      if (GS.grid[r][c] && GS.grid[r][c].type >= 0) {
        stack.push({ type: GS.grid[r][c].type, special: GS.grid[r][c].special });
      }
    }
    // Fill from bottom — stack[0] = lowest surviving piece
    for (let r = GS.size - 1; r >= 0; r--) {
      if (stack.length > 0) {
        const piece = stack.shift();
        GS.grid[r][c].type    = piece.type;
        GS.grid[r][c].special = piece.special;
      } else {
        GS.grid[r][c].type    = Math.floor(Math.random() * GS.types);
        GS.grid[r][c].special = SPECIAL.NONE;
      }
      // Update dataset so click handler knows the current position
      if (GS.grid[r][c].el) {
        GS.grid[r][c].el.dataset.r = r;
        GS.grid[r][c].el.dataset.c = c;
      }
      refreshCellVisual(r, c);
      // Animate falling
      const el = GS.grid[r][c].el;
      if (el) {
        el.classList.remove('falling');
        void el.offsetWidth; // reflow to restart animation
        el.classList.add('falling');
      }
    }
  }

  setTimeout(function() {
    document.querySelectorAll('.piece-cell.falling').forEach(function(el){ el.classList.remove('falling'); });
    callback();
  }, 310);
}

// Reshuffle when no valid moves
function reshuffleBoard(resolve) {
  const msg = document.getElementById('reshuffle-msg');
  msg.style.display = '';
  GS.busy = true;

  // Save existing DOM element refs in order
  const allCells = Array.from(document.querySelectorAll('.piece-cell'));

  setTimeout(function() {
    msg.style.display = 'none';

    // Rebuild data grid avoiding initial matches
    GS.grid = [];
    for (let r = 0; r < GS.size; r++) {
      GS.grid[r] = [];
      for (let c = 0; c < GS.size; c++) {
        GS.grid[r][c] = { type: randomType(r, c), special: SPECIAL.NONE, el: null };
      }
    }

    // Re-attach DOM elements and update dataset coords
    let idx = 0;
    for (let r = 0; r < GS.size; r++) {
      for (let c = 0; c < GS.size; c++) {
        const el = allCells[idx++];
        GS.grid[r][c].el = el;
        el.dataset.r = r;
        el.dataset.c = c;
        refreshCellVisual(r, c);
      }
    }

    GS.busy = false;
    resetHintTimer();
    if (resolve) resolve();
  }, 600);
}

// ════════════════════════════════════════════════════════════
// 10. HINT SYSTEM
// ════════════════════════════════════════════════════════════

function resetHintTimer() {
  clearTimeout(GS.hintTimer);
  clearHints();
  const delay = DIFF_CFG[GS.diff].hintDelay;
  GS.hintTimer = setTimeout(showHint, delay);
}

function showHint() {
  clearHints();
  const swap = findValidSwap();
  if (!swap) return;
  const [r1,c1,r2,c2] = swap;
  const el1 = GS.grid[r1][c1].el;
  const el2 = GS.grid[r2][c2].el;
  if (el1) { el1.classList.add('hint'); GS.hintCells.push(el1); }
  if (el2) { el2.classList.add('hint'); GS.hintCells.push(el2); }
}

function clearHints() {
  GS.hintCells.forEach(function(el){ el.classList.remove('hint'); });
  GS.hintCells = [];
}

// ════════════════════════════════════════════════════════════
// 11. GAME MODES & SCORING
// ════════════════════════════════════════════════════════════

function addScore(group) {
  let base;
  if (group.shape === 'tl')    base = SCORE.tl;
  else if (group.length >= 5)  base = SCORE.match5;
  else if (group.length === 4) base = SCORE.match4;
  else                         base = SCORE.match3;

  const mult   = GS.cascade > 1 ? GS.cascade : 1;
  const points = base * mult + (GS.cascade > 1 ? SCORE.cascade * (GS.cascade - 1) : 0);
  GS.score += points;
  updateScoreUI();
  // Time bonus for each match in timed mode
  if (GS.mode === 'timed' && GS.cascade <= 1) {
    GS.timerSecs += DIFF_CFG[GS.diff].timeBonus;
    updateTimerUI();
  }
}

function updateGoalProgress() {
  const lvl = GOAL_LEVELS[GS.goalLevel % GOAL_LEVELS.length];
  let current = 0;
  if (lvl.type === 'score')    current = GS.score;
  if (lvl.type === 'specials') current = GS.specialsMade;
  if (lvl.type === 'combos')   current = GS.combosMade;

  GS.goalProgress = Math.min(1, current / lvl.target);
  const fillEl = document.getElementById('goal-fill');
  if (fillEl) fillEl.style.width = (GS.goalProgress * 100) + '%';

  if (GS.goalProgress >= 1) {
    setTimeout(showLevelWin, 400);
  }
}

// Timed mode countdown
function startTimer() {
  clearInterval(GS.timerInterval);
  GS.timerInterval = setInterval(function() {
    if (GS.paused || !GS.running) return;
    GS.timerSecs--;
    updateTimerUI();
    if (GS.timerSecs <= 0) {
      clearInterval(GS.timerInterval);
      endGame();
    }
  }, 1000);
}

// ════════════════════════════════════════════════════════════
// 12. UI UPDATES
// ════════════════════════════════════════════════════════════

function updateScoreUI() {
  document.getElementById('hud-score').textContent = GS.score;
}

function updateTimerUI() {
  const el = document.getElementById('hud-center-val');
  el.textContent = GS.timerSecs;
  if (GS.timerSecs <= 10) {
    el.classList.add('time-low');
  } else {
    el.classList.remove('time-low');
  }
}

function setupHUD() {
  const centerLabel = document.getElementById('hud-center-label');
  const centerVal   = document.getElementById('hud-center-val');
  const rightLabel  = document.getElementById('hud-right-label');
  const rightVal    = document.getElementById('hud-right-val');
  const goalBar     = document.getElementById('goal-bar');

  goalBar.style.display = GS.mode === 'goal' ? '' : 'none';

  if (GS.mode === 'timed') {
    centerLabel.textContent = 'זמן';
    centerVal.textContent   = GS.timerSecs;
  } else if (GS.mode === 'goal') {
    centerLabel.textContent = 'שלב';
    centerVal.textContent   = (GS.goalLevel + 1);
    const lvl = GOAL_LEVELS[GS.goalLevel % GOAL_LEVELS.length];
    document.getElementById('goal-text').textContent = lvl.desc;
    document.getElementById('goal-fill').style.width = '0%';
  } else {
    centerLabel.textContent = 'שלב';
    centerVal.textContent   = '1';
  }

  rightLabel.textContent = 'שיא';
  rightVal.textContent   = Storage.getBest(GS.mode, GS.diff);
}

function updateMenuBest() {
  const el   = document.getElementById('menu-best-row');
  const best = Storage.getBest(GS.mode, GS.diff);
  const modeLabel = { classic:'קלאסי', timed:'זמן', goal:'יעד' }[GS.mode];
  const diffLabel = { easy:'קל', normal:'רגיל', hard:'קשה' }[GS.diff];
  if (best > 0) {
    el.innerHTML = '🏆 שיא: <strong>' + best + '</strong><br><small>' + modeLabel + ' · ' + diffLabel + '</small>';
  } else {
    el.innerHTML = '';
  }
}

function showComboText(n) {
  const texts = ['קומבו!','נהדר!','מדהים!','סופר!','מגה!','אלוף!','מושלם!'];
  const popup = document.getElementById('combo-popup');
  popup.textContent = (texts[Math.min(n-2, texts.length-1)] || '🔥') + ' ×' + n;
  popup.style.display = '';
  clearTimeout(showComboText._t);
  popup.style.animation = 'none'; void popup.offsetWidth; popup.style.animation = '';
  showComboText._t = setTimeout(function() { popup.style.display = 'none'; }, 1200);
  GS.combosMade++;
  if (GS.mode === 'goal') updateGoalProgress();
  // Time bonus in timed mode
  if (GS.mode === 'timed') {
    GS.timerSecs += DIFF_CFG[GS.diff].timeBonus;
    updateTimerUI();
  }
}

function spawnSparkles(el) {
  const rect = el.getBoundingClientRect();
  const boardRect = document.getElementById('board-wrap').getBoundingClientRect();
  const cx = rect.left - boardRect.left + rect.width / 2;
  const cy = rect.top  - boardRect.top  + rect.height / 2;
  const icons = ['✨','⭐','💫','🌟'];
  const wrap  = document.getElementById('board-wrap');
  for (let i = 0; i < 4; i++) {
    const sp = document.createElement('div');
    sp.className = 'sparkle';
    sp.textContent = icons[Math.floor(Math.random() * icons.length)];
    const angle = (Math.PI * 2 / 4) * i + Math.random() * 0.8;
    const dist  = 28 + Math.random() * 28;
    sp.style.left = cx + 'px';
    sp.style.top  = cy + 'px';
    sp.style.setProperty('--tx', Math.round(Math.cos(angle) * dist) + 'px');
    sp.style.setProperty('--ty', Math.round(Math.sin(angle) * dist) + 'px');
    wrap.appendChild(sp);
    setTimeout(function(){ sp.remove(); }, 650);
  }
}

// ════════════════════════════════════════════════════════════
// 13. INPUT HANDLING
// ════════════════════════════════════════════════════════════

function onCellClick(e) {
  if (GS.busy || GS.paused || !GS.running) return;
  SoundFX.unlock();

  const cell = e.currentTarget;
  const r = parseInt(cell.dataset.r, 10);
  const c = parseInt(cell.dataset.c, 10);

  clearHints();

  if (!GS.selected) {
    GS.selected = { r, c };
    cell.classList.add('selected');
    SoundFX.pop();
    return;
  }

  const pr = GS.selected.r, pc = GS.selected.c;

  // Deselect if same cell
  if (pr === r && pc === c) {
    GS.grid[pr][pc].el.classList.remove('selected');
    GS.selected = null;
    return;
  }

  // Deselect old
  if (GS.grid[pr] && GS.grid[pr][pc] && GS.grid[pr][pc].el) {
    GS.grid[pr][pc].el.classList.remove('selected');
  }

  // Must be adjacent
  if (Math.abs(r - pr) + Math.abs(c - pc) !== 1) {
    // Select new piece instead
    GS.selected = { r, c };
    cell.classList.add('selected');
    SoundFX.pop();
    return;
  }

  GS.selected = null;
  GS.busy     = true;

  // Check if swap creates a match
  const valid = swapWouldMatch(pr, pc, r, c) ||
    (GS.grid[pr][pc].special !== SPECIAL.NONE) ||
    (GS.grid[r][c].special   !== SPECIAL.NONE);

  if (valid) {
    animateSwap(pr, pc, r, c, function() {
      doSwap(pr, pc, r, c);
      GS.cascade = 0;
      runCascade(null);
    });
  } else {
    animateSwap(pr, pc, r, c, function() {
      animateInvalidSwap(pr, pc, r, c, function() {
        GS.busy = false;
        resetHintTimer();
      });
    });
  }
}

// Touch/drag support
let touchStart = null;
function wireTouchSwipe() {
  const boardEl = document.getElementById('board');

  boardEl.addEventListener('touchstart', function(e) {
    if (GS.busy || GS.paused || !GS.running) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, target: e.target.closest('.piece-cell') };
    e.preventDefault();
  }, { passive: false });

  boardEl.addEventListener('touchend', function(e) {
    if (!touchStart || GS.busy) { touchStart = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < 12) {
      // Tap
      if (touchStart.target) touchStart.target.click();
    } else {
      // Swipe to swap
      const cell = touchStart.target;
      if (!cell) { touchStart = null; return; }
      const r = parseInt(cell.dataset.r, 10);
      const c = parseInt(cell.dataset.c, 10);
      let dr = 0, dc = 0;
      if (Math.abs(dx) > Math.abs(dy)) { dc = dx > 0 ? 1 : -1; }
      else                              { dr = dy > 0 ? 1  : -1; }
      const r2 = r + dr, c2 = c + dc;
      if (r2 >= 0 && r2 < GS.size && c2 >= 0 && c2 < GS.size) {
        // Directly trigger a swap rather than simulating two clicks
        if (GS.busy || GS.paused || !GS.running) { touchStart = null; e.preventDefault(); return; }
        const valid = swapWouldMatch(r, c, r2, c2) ||
          (GS.grid[r][c].special !== SPECIAL.NONE) ||
          (GS.grid[r2][c2].special !== SPECIAL.NONE);

        GS.selected = null;
        document.querySelectorAll('.piece-cell.selected').forEach(function(el){ el.classList.remove('selected'); });
        clearHints();
        GS.busy = true;

        if (valid) {
          animateSwap(r, c, r2, c2, function() {
            doSwap(r, c, r2, c2);
            GS.cascade = 0;
            runCascade(null);
          });
        } else {
          animateSwap(r, c, r2, c2, function() {
            animateInvalidSwap(r, c, r2, c2, function() {
              GS.busy = false;
              resetHintTimer();
            });
          });
        }
      }
    }
    touchStart = null;
    e.preventDefault();
  }, { passive: false });

  boardEl.addEventListener('touchmove', function(e){ e.preventDefault(); }, { passive: false });
}

function wireKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (GS.paused) resumeGame(); else pauseGame();
    }
  });
}

// ════════════════════════════════════════════════════════════
// 11b. GAME FLOW
// ════════════════════════════════════════════════════════════

function startGame() {
  SoundFX.unlock();
  resetRuntime();
  setupHUD();
  buildBoard();

  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-levelwin').style.display  = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';

  showScreen('screen-game');

  if (GS.mode === 'timed') startTimer();
  resetHintTimer();
  GS.running = true;
  BgMusic.play();
}

function pauseGame() {
  if (!GS.running || GS.busy) return;
  GS.paused = true;
  BgMusic.pause();
  clearTimeout(GS.hintTimer);
  document.getElementById('overlay-pause').style.display = 'flex';
}

function resumeGame() {
  GS.paused   = false;
  BgMusic.resume();
  resetHintTimer();
  document.getElementById('overlay-pause').style.display = 'none';
}

function endGame() {
  GS.running = false;
  clearInterval(GS.timerInterval);
  clearTimeout(GS.hintTimer);
  SoundFX.gameover();
  BgMusic.stop();

  const isNew = Storage.saveBest(GS.mode, GS.diff, GS.score);
  const msgs  = ['כל הכבוד!','נסה שוב!','אתה מתפתח!','מעולה!','שחקן מדהים!'];
  document.getElementById('go-msg').textContent = msgs[Math.floor(Math.random() * msgs.length)];
  const modeLabel = { classic:'קלאסי', timed:'זמן', goal:'יעד' }[GS.mode];
  const diffLabel = { easy:'קל', normal:'רגיל', hard:'קשה' }[GS.diff];
  document.getElementById('go-stats').innerHTML =
    'ניקוד: <strong>' + GS.score + '</strong><br>מצב: <strong>' + modeLabel + ' · ' + diffLabel + '</strong><br>שיא: <strong>' + Storage.getBest(GS.mode, GS.diff) + '</strong>';
  document.getElementById('go-best').style.display = isNew ? '' : 'none';
  document.getElementById('overlay-gameover').style.display = 'flex';
}

function showLevelWin() {
  if (!GS.running) return;
  GS.running = false;
  clearInterval(GS.timerInterval);
  clearTimeout(GS.hintTimer);
  SoundFX.levelup();

  const stars = GS.goalProgress >= 1 ? '⭐⭐⭐' : GS.goalProgress >= 0.7 ? '⭐⭐' : '⭐';
  document.getElementById('win-stars').textContent = stars;
  document.getElementById('win-stats').innerHTML =
    'ניקוד: <strong>' + GS.score + '</strong><br>שלב: <strong>' + (GS.goalLevel + 1) + '</strong>';
  Storage.saveBest(GS.mode, GS.diff, GS.score);
  document.getElementById('overlay-levelwin').style.display = 'flex';
}

function goToMenu() {
  GS.running = false;
  clearInterval(GS.timerInterval);
  clearTimeout(GS.hintTimer);
  BgMusic.stop();
  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-levelwin').style.display  = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';
  updateMenuBest();
  showScreen('screen-menu');
}

// ════════════════════════════════════════════════════════════
// 14. MENU WIRING
// ════════════════════════════════════════════════════════════

function wireMenu() {
  document.getElementById('mode-btns').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    document.querySelectorAll('#mode-btns .sel-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    GS.mode = btn.dataset.mode;
    Storage.saveSettings({ mode: GS.mode });
    updateMenuBest();
  });

  document.querySelectorAll('.diff-btn[data-diff]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.diff-btn[data-diff]').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      GS.diff = btn.dataset.diff;
      Storage.saveSettings({ diff: GS.diff });
      updateMenuBest();
    });
  });

  document.getElementById('btn-play').addEventListener('click', function() {
    SoundFX.unlock();
    GS.goalLevel = 0;
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
    GS.goalLevel = GS.goalLevel; // keep current level
    document.getElementById('overlay-pause').style.display = 'none';
    startGame();
  });
  document.getElementById('btn-pause-menu').addEventListener('click', function() {
    SoundFX.unlock(); goToMenu();
  });
  document.getElementById('btn-play-again').addEventListener('click', function() {
    SoundFX.unlock();
    document.getElementById('overlay-gameover').style.display = 'none';
    GS.goalLevel = 0;
    startGame();
  });
  document.getElementById('btn-go-menu').addEventListener('click', function() {
    SoundFX.unlock(); goToMenu();
  });
  document.getElementById('btn-next-level').addEventListener('click', function() {
    SoundFX.unlock();
    document.getElementById('overlay-levelwin').style.display = 'none';
    GS.goalLevel = (GS.goalLevel + 1) % GOAL_LEVELS.length;
    startGame();
  });
  document.getElementById('btn-lvl-menu').addEventListener('click', function() {
    SoundFX.unlock(); goToMenu();
  });
  document.getElementById('audio-banner').addEventListener('click', function() { SoundFX.unlock(); });
}

function wireResize() {
  let t = null;
  window.addEventListener('resize', function() {
    clearTimeout(t);
    t = setTimeout(function() {
      if (document.getElementById('screen-game').classList.contains('active')) sizePieces();
    }, 150);
  });
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  wireTouchSwipe();
  wireResize();
  updateMenuBest();
  showScreen('screen-menu');
}

document.addEventListener('DOMContentLoaded', init);
