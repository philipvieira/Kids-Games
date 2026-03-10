/*
 * ════════════════════════════════════════════════════════════
 *  זיכרון קסום — Memory Match Game
 *  game.js
 *
 *  HOW TO RUN:
 *    Simply open index.html in any modern browser.
 *    No build step, no server required.
 *
 *  SECTIONS:
 *    1. Constants & Theme Data
 *    2. Storage
 *    3. Game State
 *    4. Audio
 *    5. UI Helpers
 *    6. Card Grid & Logic
 *    7. Mode Logic  (Classic / Timed / Moving / Find3)
 *    8. Power-Up
 *    9. Win / Lose
 *   10. Menu Wiring
 *   11. Init
 * ════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & THEME DATA
// ════════════════════════════════════════════════════════════

const THEMES = {
  animals: {
    icons: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
            '🐸','🐵','🐔','🦄','🦋','🐙','🐳','🦀','🐠','🦉','🐺','🦝'],
  },
  space: {
    icons: ['🚀','🌕','⭐','🪐','☄️','🌌','🛸','🌠','🌍','🌞','🌙','🪨',
            '🔭','🛰️','🌟','💫','🌑','🪄','🌈','💥','🔮','⚡','🌀','🎇'],
  },
  emojis: {
    icons: ['😀','😂','😍','🤩','😎','🥳','😜','🤗','🙃','😏','🤣','😇',
            '😋','🤓','🥸','🤪','😝','🥰','😆','😊','🙈','💀','👽','🎃'],
  },
};

// Difficulty configs
const DIFF = {
  easy: {
    classic: { cols: 4, rows: 3 },   // 12 cards / 6 pairs
    timed:   { cols: 4, rows: 3, time: 60 },
    moving:  { cols: 4, rows: 3, interval: 8000 },
    find3:   { cols: 4, rows: 3 },   // 12 / 4 triples
    label: 'קל',
  },
  normal: {
    classic: { cols: 4, rows: 4 },   // 16 / 8 pairs
    timed:   { cols: 4, rows: 4, time: 45 },
    moving:  { cols: 4, rows: 4, interval: 6000 },
    find3:   { cols: 5, rows: 3 },   // 15 / 5 triples
    label: 'רגיל',
  },
  hard: {
    classic: { cols: 6, rows: 4 },   // 24 / 12 pairs
    timed:   { cols: 6, rows: 4, time: 35 },
    moving:  { cols: 6, rows: 4, interval: 4000 },
    find3:   { cols: 6, rows: 3 },   // 18 / 6 triples
    label: 'קשה',
  },
};

const MODE_LABELS = { classic: 'קלאסי', timed: 'עם שעון', moving: 'קלפים זזים', find3: 'מצא 3' };
const POWERUP_COOLDOWN = 15000; // ms between power-up uses
const MATCH_REQUIRED   = 2;     // consecutive matches without mistake to earn power-up
const REVEAL_DURATION  = 3000;  // ms to show all cards in power-up

// ════════════════════════════════════════════════════════════
// 2. STORAGE
// ════════════════════════════════════════════════════════════

const Storage = {
  _key(mode, theme, diff) { return `mem_best_${mode}_${theme}_${diff}`; },

  getBest(mode, theme, diff) {
    return parseInt(localStorage.getItem(Storage._key(mode, theme, diff)) || '0', 10);
  },

  saveBest(mode, theme, diff, score) {
    const cur = Storage.getBest(mode, theme, diff);
    if (score > cur) {
      localStorage.setItem(Storage._key(mode, theme, diff), String(score));
      return true; // new record
    }
    return false;
  },

  getSettings() {
    try { return JSON.parse(localStorage.getItem('mem_settings') || '{}'); }
    catch (e) { return {}; }
  },

  saveSettings(obj) {
    const cur = Storage.getSettings();
    localStorage.setItem('mem_settings', JSON.stringify(Object.assign(cur, obj)));
  },
};

// ════════════════════════════════════════════════════════════
// 3. GAME STATE
// ════════════════════════════════════════════════════════════

const State = {
  mode:   'classic',
  theme:  'animals',
  diff:   'easy',
  soundOn: true,

  // runtime
  cards:        [],   // array of card data objects
  flipped:      [],   // indices currently flipped (not yet matched)
  matched:      0,    // number of matched groups
  totalGroups:  0,
  moves:        0,
  score:        0,
  inputLocked:  false,

  // timed mode
  timerValue:   0,
  timerInterval: null,

  // moving mode
  shuffleTimeout: null,

  // power-up
  consecutiveMatches: 0,
  puAvailable:  false,
  puCooldownEnd: 0,

  // animation
  matchCheckTimeout: null,
  shuffleAnimTimeout: null,

  running: false,
};

function resetRuntime() {
  State.cards        = [];
  State.flipped      = [];
  State.matched      = 0;
  State.moves        = 0;
  State.score        = 0;
  State.inputLocked  = false;
  State.consecutiveMatches = 0;
  State.puAvailable  = false;
  State.puCooldownEnd = 0;
  State.running      = false;
  clearTimeout(State.matchCheckTimeout);
  clearTimeout(State.shuffleAnimTimeout);
  clearInterval(State.timerInterval);
  clearTimeout(State.shuffleTimeout);
  State.timerInterval   = null;
  State.shuffleTimeout  = null;
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

const SoundFX = (() => {
  // Use AudioContext beeps — no external files needed
  let ctx = null;
  let unlocked = false;

  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { /* no audio */ }
    }
    return ctx;
  }

  function unlock() {
    if (unlocked) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
    document.getElementById('audio-banner').style.display = 'none';
  }

  function beep(freq, dur, type, vol) {
    type = type || 'sine'; vol = vol || 0.15;
    if (!State.soundOn) return;
    const c = getCtx();
    if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + dur);
    } catch (e) { /* silently ignore */ }
  }

  return {
    unlock,
    flip()  { beep(440, 0.08, 'sine', 0.12); },
    match() {
      beep(523, 0.12, 'sine', 0.15);
      setTimeout(function() { beep(659, 0.12, 'sine', 0.15); }, 120);
      setTimeout(function() { beep(784, 0.18, 'sine', 0.15); }, 240);
    },
    error() { beep(200, 0.18, 'sawtooth', 0.08); },
    win() {
      [523,659,784,1047].forEach(function(f,i) {
        setTimeout(function() { beep(f, 0.22, 'sine', 0.18); }, i * 160);
      });
    },
    lose() { beep(180, 0.6, 'sawtooth', 0.1); },
    powerup() {
      [800,1000,1200].forEach(function(f,i) { setTimeout(function() { beep(f, 0.1, 'sine', 0.15); }, i * 80); });
    },
    shuffle() { beep(330, 0.25, 'triangle', 0.1); },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. UI HELPERS
// ════════════════════════════════════════════════════════════

const UI = {
  // Show/hide screens
  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },

  // Update HUD values
  updateHUD() {
    const cfg = DIFF[State.diff][State.mode];
    document.getElementById('hud-moves').textContent   = State.moves;
    document.getElementById('hud-score').textContent   = State.score;
    document.getElementById('hud-matches').textContent =
      `${State.matched}/${State.totalGroups}`;

    // Timer visibility
    const timerWrap = document.getElementById('hud-timer-wrap');
    timerWrap.style.display = (State.mode === 'timed') ? '' : 'none';
  },

  updateTimer(val) {
    const el = document.getElementById('hud-timer');
    el.textContent = val;
    el.classList.toggle('danger', val <= 10);
  },

  // Apply theme class to body
  applyTheme(theme) {
    document.body.className = `theme-${theme}`;
  },

  // Update menu best score line
  updateMenuBest() {
    const best = Storage.getBest(State.mode, State.theme, State.diff);
    const el   = document.getElementById('menu-best');
    const themeLabel = State.theme === 'animals' ? 'חיות' : State.theme === 'space' ? 'חלל' : 'אמוג\'י';
    el.textContent = best > 0
      ? `🏆 שיא: ${best} | ${MODE_LABELS[State.mode]} · ${themeLabel} · ${DIFF[State.diff].label}`
      : '';
  },

  // Power-up button
  showPowerup(available) {
    const btn = document.getElementById('btn-powerup');
    if (available) {
      btn.style.display = '';
      btn.disabled = false;
    } else {
      btn.style.display = 'none';
    }
  },

  // Show/hide shuffle notice
  showShuffleNotice(visible) {
    document.getElementById('shuffle-notice').style.display = visible ? '' : 'none';
  },

  // Compute card size that fits the grid inside available space
  computeCardSize(cols, rows) {
    const hud = document.getElementById('hud');
    const pu  = document.getElementById('btn-powerup');
    const hudH = hud.offsetHeight + (pu.style.display !== 'none' ? pu.offsetHeight + 8 : 0) + 8;
    const gapPx = Math.max(4, Math.min(10, window.innerWidth * 0.015));
    const padPx = Math.max(6, Math.min(14, window.innerWidth * 0.02));

    const availW = window.innerWidth  - padPx * 2 - gapPx * (cols - 1);
    const availH = window.innerHeight - hudH - padPx * 2 - gapPx * (rows - 1);

    const sz = Math.max(44, Math.floor(Math.min(availW / cols, availH / rows)));
    return sz;
  },
};

// ════════════════════════════════════════════════════════════
// 6. CARD GRID & CORE LOGIC
// ════════════════════════════════════════════════════════════

// Build the card data array from the chosen theme/mode/diff
function buildCardData() {
  const cfg   = DIFF[State.diff][State.mode];
  const cols  = cfg.cols, rows = cfg.rows;
  const total = cols * rows;
  const icons = THEMES[State.theme].icons;
  const isTriplet = (State.mode === 'find3');
  const groupSize = isTriplet ? 3 : 2;
  const groups    = total / groupSize;  // integer by design

  // Pick icons (cycle if needed)
  const chosen = [];
  for (let i = 0; i < groups; i++) chosen.push(icons[i % icons.length]);

  // Expand to full array (each icon groupSize times)
  let pool = [];
  chosen.forEach(icon => {
    for (let g = 0; g < groupSize; g++) pool.push(icon);
  });

  // Fisher-Yates shuffle
  shuffle(pool);

  return pool.map((icon, idx) => ({
    id:      idx,
    icon,
    flipped: false,
    matched: false,
  }));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Render the grid DOM
function renderGrid() {
  const cfg  = DIFF[State.diff][State.mode];
  const cols = cfg.cols, rows = cfg.rows;
  const grid = document.getElementById('card-grid');
  grid.innerHTML = '';

  const sz = UI.computeCardSize(cols, rows);

  grid.style.gridTemplateColumns = `repeat(${cols}, ${sz}px)`;
  grid.style.gridTemplateRows    = `repeat(${rows}, ${sz}px)`;

  State.cards.forEach((card, idx) => {
    const el = document.createElement('div');
    el.className  = 'card';
    el.dataset.idx = idx;
    el.style.width  = sz + 'px';
    el.style.height = sz + 'px';
    el.style.fontSize = Math.round(sz * 0.45) + 'px';

    el.innerHTML = `
      <div class="card-face card-back"></div>
      <div class="card-face card-front">${card.icon}</div>
    `;

    if (card.flipped || card.matched) el.classList.add('flipped');
    if (card.matched) el.classList.add('matched');

    el.onclick = onCardClick;
    grid.appendChild(el);
  });
}

// Handle card click / tap
function onCardClick(e) {
  SoundFX.unlock();

  if (State.inputLocked || !State.running) return;

  const idx  = parseInt(e.currentTarget.dataset.idx, 10);
  const card = State.cards[idx];

  // Ignore if already flipped or matched
  if (card.flipped || card.matched) return;

  // Max cards in flight for current mode
  const isTriplet = (State.mode === 'find3');
  const maxFlip   = isTriplet ? 3 : 2;
  if (State.flipped.length >= maxFlip) return;

  // Flip this card
  card.flipped = true;
  State.flipped.push(idx);
  flipCardEl(idx, true);
  SoundFX.flip();

  // Check for match when we have enough flipped
  if (State.flipped.length === maxFlip) {
    State.moves++;
    State.inputLocked = true;
    UI.updateHUD();

    State.matchCheckTimeout = setTimeout(() => checkMatch(), 700);
  }
}

function flipCardEl(idx, faceUp) {
  const el = document.getElementById('card-grid').children[idx];
  if (!el) return;
  if (faceUp) el.classList.add('flipped');
  else        el.classList.remove('flipped');
}

function checkMatch() {
  const indices = State.flipped;
  const icons   = indices.map(i => State.cards[i].icon);
  const allSame = icons.every(ic => ic === icons[0]);

  if (allSame) {
    // ── Match! ──
    indices.forEach(i => {
      State.cards[i].matched = true;
      State.cards[i].flipped = true;
      const el = document.getElementById('card-grid').children[i];
      if (el) {
        el.classList.add('matched');
        spawnSparkle(el);
      }
    });

    State.matched++;
    // Score = matches*100 - moves*5, never below 0
    State.score = Math.max(0, State.matched * 100 - State.moves * 5);

    State.consecutiveMatches++;
    checkPowerupEarned();
    SoundFX.match();

    // Win check
    if (State.matched >= State.totalGroups) {
      State.inputLocked = true;
      State.flipped = [];
      UI.updateHUD();
      setTimeout(() => endGame(true), 400);
      return;
    }
  } else {
    // ── No match ──
    SoundFX.error();
    State.consecutiveMatches = 0;

    indices.forEach(i => {
      State.cards[i].flipped = false;
      const el = document.getElementById('card-grid').children[i];
      if (el) {
        el.classList.add('shake');
        setTimeout(() => {
          el.classList.remove('shake');
          el.classList.remove('flipped');
        }, 350);
      }
    });
  }

  State.flipped     = [];
  State.inputLocked = false;
  UI.updateHUD();
}

// ════════════════════════════════════════════════════════════
// 7. MODE LOGIC
// ════════════════════════════════════════════════════════════

function startGame() {
  resetRuntime();
  UI.applyTheme(State.theme);

  const cfg = DIFF[State.diff][State.mode];
  State.totalGroups = (cfg.cols * cfg.rows) / (State.mode === 'find3' ? 3 : 2);

  // Build & render
  State.cards = buildCardData();
  UI.show('screen-game');
  // Short delay to allow screen layout to settle before computing card size
  requestAnimationFrame(() => {
    renderGrid();
    UI.updateHUD();
    UI.showPowerup(false);
    UI.showShuffleNotice(false);
    State.running = true;

    // Mode-specific start
    if (State.mode === 'timed') startTimer();
    if (State.mode === 'moving') scheduleNextShuffle();
  });
}

// ── Timed Mode ──────────────────────────────────────────────
function startTimer() {
  const cfg = DIFF[State.diff]['timed'];
  State.timerValue = cfg.time;
  UI.updateTimer(State.timerValue);
  State.timerInterval = setInterval(() => {
    if (!State.running) { clearInterval(State.timerInterval); return; }
    State.timerValue--;
    UI.updateTimer(State.timerValue);
    if (State.timerValue <= 0) {
      clearInterval(State.timerInterval);
      endGame(false);
    }
  }, 1000);
}

// ── Moving Mode ─────────────────────────────────────────────
function scheduleNextShuffle() {
  if (!State.running || State.mode !== 'moving') return;
  const interval = DIFF[State.diff]['moving'].interval;
  State.shuffleTimeout = setTimeout(() => {
    if (!State.running) return;
    doShuffle();
  }, interval);
}

function doShuffle() {
  if (!State.running) return;
  SoundFX.shuffle();
  State.inputLocked = true;
  UI.showShuffleNotice(true);

  // Also unflip any cards currently held (avoid stuck state after shuffle)
  State.flipped.forEach(i => {
    State.cards[i].flipped = false;
    const el = document.getElementById('card-grid').children[i];
    if (el) el.classList.remove('flipped');
  });
  State.flipped = [];

  // Collect indices of unmatched, unflipped cards
  const toShuffle = State.cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.matched && !c.flipped)
    .map(({ i }) => i);

  if (toShuffle.length <= 1) {
    State.inputLocked = false;
    UI.showShuffleNotice(false);
    scheduleNextShuffle();
    return;
  }

  // Shuffle their icons among themselves
  const icons = toShuffle.map(i => State.cards[i].icon);
  shuffle(icons);
  toShuffle.forEach((cardIdx, pos) => {
    State.cards[cardIdx].icon = icons[pos];
    // Update front face DOM
    const el = document.getElementById('card-grid').children[cardIdx];
    if (el) {
      el.querySelector('.card-front').textContent = icons[pos];
      el.classList.add('shuffling');
      setTimeout(() => el.classList.remove('shuffling'), 500);
    }
  });

  State.shuffleAnimTimeout = setTimeout(() => {
    UI.showShuffleNotice(false);
    State.inputLocked = false;
    scheduleNextShuffle();
  }, 700);
}

// ════════════════════════════════════════════════════════════
// 8. POWER-UP
// ════════════════════════════════════════════════════════════

function checkPowerupEarned() {
  if (State.consecutiveMatches >= MATCH_REQUIRED) {
    const now = Date.now();
    if (now >= State.puCooldownEnd) {
      State.puAvailable = true;
      UI.showPowerup(true);
    }
    // Reset streak
    State.consecutiveMatches = 0;
  }
}

function activatePowerup() {
  if (!State.puAvailable || !State.running) return;
  SoundFX.powerup();

  State.puAvailable  = false;
  State.puCooldownEnd = Date.now() + POWERUP_COOLDOWN;
  UI.showPowerup(false);
  State.inputLocked  = true;

  const grid = document.getElementById('card-grid');
  // Reveal all unmatched cards
  State.cards.forEach((card, idx) => {
    if (!card.matched) {
      const el = grid.children[idx];
      if (el) { el.classList.add('flipped', 'revealed'); }
    }
  });

  setTimeout(() => {
    // Flip back cards that are not matched and not currently "held" by player
    State.cards.forEach((card, idx) => {
      if (!card.matched) {
        card.flipped = false;
        const el = grid.children[idx];
        if (el) { el.classList.remove('flipped', 'revealed'); }
      }
    });
    // Also clear any currently flipped (partial selection)
    State.flipped = [];
    State.inputLocked = false;
  }, REVEAL_DURATION);
}

// ════════════════════════════════════════════════════════════
// 9. WIN / LOSE
// ════════════════════════════════════════════════════════════

function endGame(won) {
  State.running = false;
  clearInterval(State.timerInterval);
  clearTimeout(State.shuffleTimeout);

  if (won) {
    SoundFX.win();
    const isNew = Storage.saveBest(State.mode, State.theme, State.diff, State.score);
    showWinScreen(isNew);
  } else {
    SoundFX.lose();
    showLoseScreen();
  }
}

function showWinScreen(isNew) {
  const cfg = DIFF[State.diff][State.mode];
  const timeTaken = (State.mode === 'timed')
    ? cfg.time - State.timerValue
    : null;

  let statsHtml = `ניקוד: <strong>${State.score}</strong><br>`;
  statsHtml += `מהלכים: <strong>${State.moves}</strong><br>`;
  statsHtml += `זוגות: <strong>${State.matched}</strong>`;
  if (timeTaken !== null) statsHtml += `<br>זמן: <strong>${timeTaken}שנ'</strong>`;

  document.getElementById('win-stats').innerHTML = statsHtml;
  document.getElementById('new-best').style.display = isNew ? '' : 'none';

  // Confetti
  const area = document.getElementById('confetti-area');
  area.innerHTML = '';
  const colors = ['#ffd166','#06d6a0','#ef476f','#118ab2','#f72585','#7209b7'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left     = Math.random() * 100 + '%';
    p.style.top      = '-20px';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.width    = (6 + Math.random() * 8) + 'px';
    p.style.height   = (6 + Math.random() * 8) + 'px';
    p.style.animationDuration  = (1.2 + Math.random() * 1.8) + 's';
    p.style.animationDelay     = (Math.random() * 0.8) + 's';
    p.style.borderRadius       = Math.random() > 0.5 ? '50%' : '2px';
    area.appendChild(p);
  }

  document.getElementById('overlay-win').style.display = 'flex';
}

function showLoseScreen() {
  const statsHtml = `ניקוד: <strong>${State.score}</strong><br>מהלכים: <strong>${State.moves}</strong>`;
  document.getElementById('lose-stats').innerHTML = statsHtml;
  document.getElementById('overlay-lose').style.display = 'flex';
}

// Sparkle on match
function spawnSparkle(cardEl) {
  const rect = cardEl.getBoundingClientRect();
  const cx   = rect.left + rect.width  / 2;
  const cy   = rect.top  + rect.height / 2;
  const particles = ['✨','⭐','💫','🌟'];
  for (let i = 0; i < 5; i++) {
    const sp = document.createElement('div');
    sp.textContent = particles[Math.floor(Math.random() * particles.length)];
    sp.style.cssText = `
      position: fixed; left: ${cx}px; top: ${cy}px;
      font-size: ${12 + Math.random() * 12}px;
      pointer-events: none; z-index: 300;
      transition: transform 0.6s ease-out, opacity 0.6s ease-out;
      transform: translate(-50%,-50%);
      opacity: 1;
    `;
    document.body.appendChild(sp);
    requestAnimationFrame(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 40 + Math.random() * 50;
      sp.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px))`;
      sp.style.opacity   = '0';
    });
    setTimeout(() => sp.remove(), 700);
  }
}

// ════════════════════════════════════════════════════════════
// 10. MENU WIRING
// ════════════════════════════════════════════════════════════

function wireMenuButtons() {
  // Mode selector
  document.getElementById('mode-btns').addEventListener('click', e => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    document.querySelectorAll('#mode-btns .sel-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.mode = btn.dataset.mode;
    Storage.saveSettings({ mode: State.mode });
    UI.updateMenuBest();
  });

  // Theme selector
  document.getElementById('theme-btns').addEventListener('click', e => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    document.querySelectorAll('#theme-btns .sel-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.theme = btn.dataset.theme;
    UI.applyTheme(State.theme);
    Storage.saveSettings({ theme: State.theme });
    UI.updateMenuBest();
  });

  // Difficulty selector
  document.getElementById('diff-btns').addEventListener('click', e => {
    const btn = e.target.closest('[data-diff]');
    if (!btn) return;
    document.querySelectorAll('#diff-btns .sel-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.diff = btn.dataset.diff;
    Storage.saveSettings({ diff: State.diff });
    UI.updateMenuBest();
  });

  // Play button
  document.getElementById('btn-play').addEventListener('click', () => {
    SoundFX.unlock();
    startGame();
  });

  // Sound toggle
  document.getElementById('btn-sound').addEventListener('click', () => {
    SoundFX.unlock();
    State.soundOn = !State.soundOn;
    Storage.saveSettings({ soundOn: State.soundOn });
    document.getElementById('btn-sound').textContent =
      State.soundOn ? '🔊 צליל: פועל' : '🔇 צליל: כבוי';
  });
}

function wireGameButtons() {
  // Pause
  document.getElementById('btn-pause').addEventListener('click', () => {
    SoundFX.unlock();
    if (!State.running) return;
    State.running = false;
    clearTimeout(State.shuffleTimeout);
    clearInterval(State.timerInterval);
    document.getElementById('overlay-pause').style.display = 'flex';
  });

  // Resume
  document.getElementById('btn-resume').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-pause').style.display = 'none';
    State.running = true;
    if (State.mode === 'timed') startTimer();
    if (State.mode === 'moving') scheduleNextShuffle();
  });

  // Restart (pause menu)
  document.getElementById('btn-restart').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-pause').style.display = 'none';
    startGame();
  });

  // Back to menu from pause
  document.getElementById('btn-menu-pause').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-pause').style.display = 'none';
    goToMenu();
  });

  // Power-up
  document.getElementById('btn-powerup').addEventListener('click', () => {
    SoundFX.unlock();
    activatePowerup();
  });

  // Win screen
  document.getElementById('btn-play-again').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-win').style.display = 'none';
    startGame();
  });
  document.getElementById('btn-menu-win').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-win').style.display = 'none';
    goToMenu();
  });

  // Lose screen
  document.getElementById('btn-try-again').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-lose').style.display = 'none';
    startGame();
  });
  document.getElementById('btn-menu-lose').addEventListener('click', () => {
    SoundFX.unlock();
    document.getElementById('overlay-lose').style.display = 'none';
    goToMenu();
  });

  // Audio banner
  document.getElementById('audio-banner').addEventListener('click', () => SoundFX.unlock());
}

function goToMenu() {
  resetRuntime();
  // Hide all overlays
  ['overlay-pause','overlay-win','overlay-lose'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  UI.applyTheme(State.theme);
  UI.show('screen-menu');
  UI.updateMenuBest();
}

// Keyboard shortcuts (desktop)
function wireKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('screen-menu').classList.contains('active')) {
      document.getElementById('btn-play').click();
    }
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') &&
        document.getElementById('screen-game').classList.contains('active')) {
      const pauseOv = document.getElementById('overlay-pause');
      if (pauseOv.style.display === 'flex') {
        document.getElementById('btn-resume').click();
      } else {
        document.getElementById('btn-pause').click();
      }
    }
  });
}

// Prevent body scroll while touching game area
function preventScroll() {
  document.getElementById('card-grid').addEventListener('touchmove', e => {
    e.preventDefault();
  }, { passive: false });
}

// Restore saved settings
function restoreSettings() {
  const s = Storage.getSettings();
  if (s.mode && DIFF.easy[s.mode]) {
    State.mode = s.mode;
    document.querySelectorAll('#mode-btns .sel-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === State.mode);
    });
  }
  if (s.theme && THEMES[s.theme]) {
    State.theme = s.theme;
    document.querySelectorAll('#theme-btns .sel-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === State.theme);
    });
  }
  if (s.diff && DIFF[s.diff]) {
    State.diff = s.diff;
    document.querySelectorAll('#diff-btns .sel-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.diff === State.diff);
    });
  }
  if (typeof s.soundOn === 'boolean') {
    State.soundOn = s.soundOn;
    document.getElementById('btn-sound').textContent =
      State.soundOn ? '🔊 צליל: פועל' : '🔇 צליל: כבוי';
  }
  UI.applyTheme(State.theme);
}

function checkAudioBanner() {
  // Show banner on mobile — AudioContext typically needs a user gesture
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) {
    document.getElementById('audio-banner').style.display = '';
  }
}

// Handle window resize — re-render grid if game is active
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (State.running || document.getElementById('screen-game').classList.contains('active')) {
      renderGrid();
    }
  }, 150);
});

// ════════════════════════════════════════════════════════════
// 11. INIT
// ════════════════════════════════════════════════════════════

function init() {
  restoreSettings();
  wireMenuButtons();
  wireGameButtons();
  wireKeyboard();
  preventScroll();
  checkAudioBanner();
  UI.updateMenuBest();
  UI.show('screen-menu');
}

document.addEventListener('DOMContentLoaded', init);
