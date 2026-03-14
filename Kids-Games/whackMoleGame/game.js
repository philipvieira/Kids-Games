/* ════════════════════════════════════════════════════════════
   חבט במכרסם — game.js
   ════════════════════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

const GRID_SIZE   = 9;
const STORAGE_KEY = 'whackMole_best_v2';
const MAX_LIVES   = 3;

// Mole types
// triple: hit it and 3 normal moles instantly pop up in random empty holes
const MOLE_TYPES = {
  normal: { img: null,              points: 10,  label: 'יפה!',    cls: '',       visRatio: 1.0  },
  golden: { img: 'assets/moles/golden.png',      points: 30,  label: '!מצוין',  cls: 'gold',   visRatio: 1.2  },
  bomb:   { img: 'assets/moles/bomb.png',        points: -20, label: '!בום',    cls: 'bomb',   visRatio: 1.0  },
  fast:   { img: 'assets/moles/fast.png',        points: 15,  label: 'מהיר!',   cls: '',       visRatio: 0.45 },
  triple: { img: 'assets/moles/triple.png',      points: 20,  label: 'שלושה!', cls: 'triple', visRatio: 0.7  },
};

// Normal mole image variants (picked randomly)
const NORMAL_MOLE_IMGS = [
  'assets/moles/normal1.png',
  'assets/moles/normal2.png',
  'assets/moles/normal4.png',
  'assets/moles/normal5.png',
  'assets/moles/normal6.png',
  'assets/moles/normal7.png',
];

// Bomb mole image variants (picked randomly)
const BOMB_MOLE_IMGS = [
  'assets/moles/bomb.png',
  'assets/moles/normal3.png',
];

// Weights [normal, golden, bomb, fast, triple]
const TYPE_WEIGHTS = [58, 12, 12, 10, 8];
const TYPE_KEYS    = ['normal', 'golden', 'bomb', 'fast', 'triple'];

const DIFF_CFG = {
  easy: {
    gameDuration:  55,
    startDelay:    1000,   // ms before first mole pops
    baseInterval:  1500,   // ms between spawn attempts at t=0
    minInterval:   700,    // fastest it can get
    baseVisTime:   2400,   // ms mole visible (normal, at t=0)
    minVisTime:    900,
    maxActive:     2,
  },
  normal: {
    gameDuration:  45,
    startDelay:    1000,   // ms before first mole pops
    baseInterval:  1200,
    minInterval:   500,
    baseVisTime:   1800,
    minVisTime:    700,
    maxActive:     3,
  },
  hard: {
    gameDuration:  40,
    startDelay:    1000,   // ms before first mole pops
    baseInterval:  900,
    minInterval:   350,
    baseVisTime:   1100,
    minVisTime:    450,
    maxActive:     4,
  },
};

// ════════════════════════════════════════════════════════════
// 2. GAME STATE
// ════════════════════════════════════════════════════════════

var GS = {
  running:    false,
  paused:     false,
  diff:       'normal',
  score:      0,
  timeLeft:   45,
  lives:      MAX_LIVES,
  hits:       0,
  misses:     0,
  emptyClicks:0,
  goldenHits: 0,
  bombHits:   0,
  tripleHits: 0,
  holes:      [],   // { el, canvas, moleInner, labelLayer, active, type, timerId }
  elapsed:    0,    // seconds since game start (for speed ramp)
};

// ════════════════════════════════════════════════════════════
// 3. DOM REFERENCES
// ════════════════════════════════════════════════════════════

var screens = {
  menu: document.getElementById('screen-menu'),
  game: document.getElementById('screen-game'),
};
var el = {
  menuBest:   document.getElementById('menu-best'),
  hudScore:   document.getElementById('hud-score'),
  hudTime:    document.getElementById('hud-time'),
  hudBest:    document.getElementById('hud-best'),
  grid:       document.getElementById('grid'),
  pauseOv:    document.getElementById('overlay-pause'),
  gameoverOv: document.getElementById('overlay-gameover'),
  goScore:    document.getElementById('go-score'),
  goBest:     document.getElementById('go-best'),
  goNewBest:  document.getElementById('go-new-best'),
  goHitsRow:  document.getElementById('go-hits-row'),
  heartsRow:  document.getElementById('hearts-row'),
};

// ════════════════════════════════════════════════════════════
// 4. HOLE IMAGE  (single image, used for every hole)
// ════════════════════════════════════════════════════════════

var holeImg = new Image();
var holeImgReady = false;
holeImg.onload = function() { holeImgReady = true; redrawAllHoles(); };
holeImg.src = 'assets/holes.png';

// Draw the single hole image onto a hole's canvas
function drawHoleCanvas(holeState) {
  var canvas = holeState.canvas;
  var ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (holeImgReady) {
    ctx.drawImage(holeImg, 0, 0, canvas.width, canvas.height);
  } else {
    // Fallback while image loads
    ctx.fillStyle = '#5a3010';
    ctx.beginPath();
    ctx.ellipse(canvas.width/2, canvas.height*0.6, canvas.width*0.38, canvas.height*0.28, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#4e9a28';
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.45);
  }
}

function redrawAllHoles() {
  GS.holes.forEach(function(h) { drawHoleCanvas(h); });
}

// ════════════════════════════════════════════════════════════
// 5. STORAGE
// ════════════════════════════════════════════════════════════

function getBest(diff) {
  try {
    var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return d[diff] || 0;
  } catch(e) { return 0; }
}
function saveBest(diff, score) {
  try {
    var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (score > (d[diff] || 0)) { d[diff] = score; localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
// 6. SCREEN MANAGEMENT
// ════════════════════════════════════════════════════════════

function showScreen(name) {
  Object.values(screens).forEach(function(s) { s.classList.remove('active'); });
  screens[name].classList.add('active');
}

// ════════════════════════════════════════════════════════════
// 7. GRID BUILDING
// ════════════════════════════════════════════════════════════

function buildGrid() {
  el.grid.innerHTML = '';
  GS.holes = [];

  for (var i = 0; i < GRID_SIZE; i++) {
    var hole = document.createElement('div');
    hole.className = 'hole';

    // Canvas for the hole sprite (aspect-ratio 3:2 = 150px wide × 100px tall)
    var canvas = document.createElement('canvas');
    canvas.width  = 150;
    canvas.height = 100;
    hole.appendChild(canvas);

    // Mole layer sits over the hole centre
    var moleLayer = document.createElement('div');
    moleLayer.className = 'mole-layer';
    var moleInner = document.createElement('div');
    moleInner.className = 'mole-inner';
    var moleImg = document.createElement('img');
    moleImg.className = 'mole-img';
    moleImg.draggable = false;
    moleInner.appendChild(moleImg);
    moleLayer.appendChild(moleInner);
    hole.appendChild(moleLayer);

    // Label layer: outside the hole, above it
    var labelLayer = document.createElement('div');
    labelLayer.className = 'label-layer';
    hole.appendChild(labelLayer);

    el.grid.appendChild(hole);

    var holeState = {
      el:         hole,
      canvas:     canvas,
      moleInner:  moleInner,
      moleImg:    moleImg,
      labelLayer: labelLayer,
      active:     false,
      type:       null,
      timerId:    null,
    };
    GS.holes.push(holeState);

    drawHoleCanvas(holeState);

    // Pointer events on the whole tile
    (function(idx) {
      hole.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        onHitHole(idx);
      });
    })(i);
  }
}

// ════════════════════════════════════════════════════════════
// 8. SPEED RAMP (time-based)
// ════════════════════════════════════════════════════════════

// Returns a 0→1 progress value based on how much time has elapsed
function speedProgress() {
  var cfg = DIFF_CFG[GS.diff];
  return Math.min(1, GS.elapsed / cfg.gameDuration);
}

// Current spawn interval: lerps from baseInterval down to minInterval
function currentInterval() {
  var cfg = DIFF_CFG[GS.diff];
  var p   = speedProgress();
  return Math.round(cfg.baseInterval - (cfg.baseInterval - cfg.minInterval) * p);
}

// Current visible time for a given type
function currentVisTime(type) {
  var cfg   = DIFF_CFG[GS.diff];
  var p     = speedProgress();
  var base  = cfg.baseVisTime - (cfg.baseVisTime - cfg.minVisTime) * p;
  return Math.round(base * MOLE_TYPES[type].visRatio);
}

// ════════════════════════════════════════════════════════════
// 9. MOLE SPAWNER
// ════════════════════════════════════════════════════════════

var spawnTimer      = null;
var countdownTimer  = null;
var startDelayTimer = null;

function countActive() {
  return GS.holes.filter(function(h) { return h.active; }).length;
}

function getInactiveIndices() {
  return GS.holes.map(function(h, i) { return h.active ? -1 : i; }).filter(function(i) { return i >= 0; });
}

function spawnMole() {
  if (!GS.running || GS.paused) return;
  var cfg = DIFF_CFG[GS.diff];
  if (countActive() >= cfg.maxActive) return;

  var inactive = getInactiveIndices();
  if (inactive.length === 0) return;

  var idx  = inactive[Math.floor(Math.random() * inactive.length)];
  var type = pickType();
  popMole(idx, type, currentVisTime(type));
}

function pickType() {
  var total = TYPE_WEIGHTS.reduce(function(a, b) { return a + b; }, 0);
  var r = Math.random() * total;
  for (var i = 0; i < TYPE_KEYS.length; i++) {
    r -= TYPE_WEIGHTS[i];
    if (r <= 0) return TYPE_KEYS[i];
  }
  return 'normal';
}

function popMole(idx, type, visTime) {
  var h    = GS.holes[idx];
  var info = MOLE_TYPES[type];
  h.active  = true;
  h.type    = type;

  // Set mole image
  var imgSrc = info.img;
  if (type === 'normal') {
    imgSrc = NORMAL_MOLE_IMGS[Math.floor(Math.random() * NORMAL_MOLE_IMGS.length)];
  } else if (type === 'bomb') {
    imgSrc = BOMB_MOLE_IMGS[Math.floor(Math.random() * BOMB_MOLE_IMGS.length)];
  }
  h.moleImg.src = imgSrc;
  h.moleInner.classList.remove('whacked');
  // Force reflow before adding visible class
  void h.moleInner.offsetWidth;
  h.moleInner.classList.add('visible');

  h.timerId = setTimeout(function() {
    if (h.active) retractMole(idx, true);
  }, visTime);
}

function retractMole(idx, missed) {
  var h = GS.holes[idx];
  if (!h.active) return;
  clearTimeout(h.timerId);
  h.active = false;
  if (missed && GS.running && !GS.paused) {
    GS.misses++;
  }
  // Small delay after whack so flash is visible, then slide back down
  setTimeout(function() {
    h.moleInner.classList.remove('visible', 'whacked');
  }, missed ? 0 : 120);
}

// ════════════════════════════════════════════════════════════
// 10. HIT HANDLING
// ════════════════════════════════════════════════════════════

function onHitHole(idx) {
  if (!GS.running || GS.paused) return;
  var h = GS.holes[idx];

  if (!h.active) {
    // Empty hole click — lose a heart
    loseHeart(h.el);
    playHitSound('miss');
    return;
  }

  var type = h.type;
  var info = MOLE_TYPES[type];
  var pts  = info.points;

  // Whack animation then retract
  h.moleInner.classList.add('whacked');
  retractMole(idx, false);

  // Play hit sound
  playHitSound(type);

  // Score
  GS.score = Math.max(0, GS.score + pts);
  GS.hits++;
  if (type === 'golden') GS.goldenHits++;
  if (type === 'bomb')   GS.bombHits++;
  if (type === 'triple') GS.tripleHits++;

  updateHUD();
  triggerRipple(h.el);
  if (pts > 0) spawnSparkles(h.el);

  // Float label ABOVE the hole
  showFloatAbove(h.labelLayer, (pts > 0 ? '+' : '') + pts + ' ' + info.label, info.cls);

  // Triple mole special: pop 3 moles in other holes with fast vis time
  if (type === 'triple') {
    triggerTriple();
  }
}

function loseHeart(holeEl) {
  if (GS.lives <= 0) return;
  GS.lives--;
  GS.emptyClicks++;
  updateHearts();

  // Shake the newly-lost heart
  var heartEl = document.getElementById('heart-' + GS.lives);
  if (heartEl) {
    heartEl.classList.add('shake');
    setTimeout(function() { heartEl.classList.remove('shake'); }, 450);
  }

  // Red flash on hole
  holeEl.classList.remove('hit-ripple');
  void holeEl.offsetWidth;
  holeEl.classList.add('hit-ripple');
  setTimeout(function() { holeEl.classList.remove('hit-ripple'); }, 350);

  if (GS.lives <= 0) {
    endGame();
  }
}

function triggerTriple() {
  // Pop up to 3 normal moles in random currently-inactive holes
  var inactive = getInactiveIndices();
  shuffle(inactive);
  var count = Math.min(3, inactive.length);
  for (var i = 0; i < count; i++) {
    // Slight stagger
    (function(hIdx, delay) {
      setTimeout(function() {
        if (!GS.running) return;
        var vis = Math.round(currentVisTime('normal') * 0.6);
        popMole(hIdx, 'normal', vis);
      }, delay);
    })(inactive[i], i * 120);
  }
}

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

function triggerRipple(holeEl) {
  holeEl.classList.remove('hit-ripple');
  void holeEl.offsetWidth;
  holeEl.classList.add('hit-ripple');
  setTimeout(function() { holeEl.classList.remove('hit-ripple'); }, 380);
}

function spawnSparkles(holeEl) {
  var sparks = ['✨', '⭐', '💫', '🌟'];
  [0, 72, 144, 216, 288].forEach(function(deg) {
    var s = document.createElement('div');
    s.className = 'sparkle';
    var rad  = deg * Math.PI / 180;
    var dist = 28 + Math.random() * 16;
    s.style.setProperty('--tx', 'translate(' + Math.round(Math.cos(rad)*dist) + 'px,' + Math.round(Math.sin(rad)*dist - 20) + 'px)');
    s.textContent = sparks[Math.floor(Math.random() * sparks.length)];
    s.style.top  = '30%';
    s.style.left = '50%';
    s.style.transform = 'translateX(-50%)';
    holeEl.appendChild(s);
    setTimeout(function() { s.remove(); }, 700);
  });
}

// Show a floating label in the label-layer which is ABOVE the hole element
function showFloatAbove(labelLayer, text, cls) {
  var f = document.createElement('div');
  f.className = 'float-label' + (cls ? ' ' + cls : '');
  f.textContent = text;
  f.style.position = 'absolute';
  f.style.bottom = '4px';   // stacks up from bottom of the label-layer
  f.style.left = '50%';
  labelLayer.appendChild(f);
  setTimeout(function() { f.remove(); }, 900);
}

// ════════════════════════════════════════════════════════════
// 11. HEARTS
// ════════════════════════════════════════════════════════════

function updateHearts() {
  for (var i = 0; i < MAX_LIVES; i++) {
    var heartEl = document.getElementById('heart-' + i);
    if (heartEl) {
      if (i >= GS.lives) {
        heartEl.classList.add('lost');
      } else {
        heartEl.classList.remove('lost');
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// 12. BACKGROUND MUSIC & SOUND FX
// ════════════════════════════════════════════════════════════

var bgMusic = new Audio('assets/molemusic.mp3');
bgMusic.loop   = true;
bgMusic.volume = 0.35;

function musicPlay()  { bgMusic.play().catch(function(){}); }
function musicPause() { bgMusic.pause(); }

// Hit sound — generated via Web Audio API (no extra file needed)
var _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playHitSound(type) {
  try {
    var ctx  = getAudioCtx();
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'bomb') {
      // Low thud for bomb
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.9, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === 'golden') {
      // High cheerful ping for golden
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.9, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'miss') {
      // Low dull thud for miss
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.7, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } else {
      // Standard whack pop
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.85, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
// 13. TIMER, COUNTDOWN & SPAWN LOOP
// ════════════════════════════════════════════════════════════

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(function() {
    if (!GS.running || GS.paused) return;
    GS.timeLeft--;
    GS.elapsed++;
    updateHUD();
    if (GS.timeLeft <= 5)  el.hudTime.classList.add('urgent');
    if (GS.timeLeft <= 0)  endGame();
    // No spawn loop restart here — the self-scheduling spawn loop handles its own timing
  }, 1000);
}

// Self-scheduling spawn loop: schedules itself using the current (ramped) interval.
// This avoids the bug where setInterval restarts from scratch every second.
function scheduleNextSpawn() {
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(function() {
    if (!GS.running || GS.paused) {
      // Paused — will be rescheduled on resume
      return;
    }
    spawnMole();
    scheduleNextSpawn();
  }, currentInterval());
}

// Keep restartSpawnLoop as an alias used on resume / start
function restartSpawnLoop() {
  clearTimeout(spawnTimer);
  scheduleNextSpawn();
}

// ════════════════════════════════════════════════════════════
// 14. HUD UPDATE
// ════════════════════════════════════════════════════════════

function updateHUD() {
  el.hudScore.textContent = GS.score;
  el.hudTime.textContent  = GS.timeLeft;
  el.hudBest.textContent  = getBest(GS.diff);
}

// ════════════════════════════════════════════════════════════
// 15. GAME LIFECYCLE
// ════════════════════════════════════════════════════════════

function startGame() {
  var cfg       = DIFF_CFG[GS.diff];
  GS.running    = true;
  GS.paused     = false;
  GS.score      = 0;
  GS.timeLeft   = cfg.gameDuration;
  GS.elapsed    = 0;
  GS.lives      = MAX_LIVES;
  GS.hits       = 0;
  GS.misses     = 0;
  GS.emptyClicks= 0;
  GS.goldenHits = 0;
  GS.bombHits   = 0;
  GS.tripleHits = 0;

  el.hudTime.classList.remove('urgent');
  buildGrid();
  updateHUD();
  updateHearts();
  showScreen('game');
  musicPlay();
  startCountdown();

  // Delay first spawn based on difficulty
  var delay = cfg.startDelay || 0;
  if (delay > 0) {
    startDelayTimer = setTimeout(function() {
      startDelayTimer = null;
      if (GS.running && !GS.paused) restartSpawnLoop();
    }, delay);
  } else {
    restartSpawnLoop();
  }
}

function pauseGame() {
  if (!GS.running) return;
  GS.paused = true;
  musicPause();
  el.pauseOv.style.display = 'flex';
  GS.holes.forEach(function(h, i) { if (h.active) retractMole(i, false); });
}

function resumeGame() {
  GS.paused = false;
  musicPlay();
  el.pauseOv.style.display = 'none';
  // Only restart spawn loop if the start-delay has already elapsed
  if (!startDelayTimer) restartSpawnLoop();
}

function restartGame() {
  stopTimers();
  musicPause();
  el.pauseOv.style.display    = 'none';
  el.gameoverOv.style.display = 'none';
  startGame();
}

function endGame() {
  GS.running = false;
  stopTimers();
  musicPause();
  GS.holes.forEach(function(h, i) { retractMole(i, false); });

  var prev    = getBest(GS.diff);
  saveBest(GS.diff, GS.score);
  var newBest = GS.score > prev;

  el.goScore.textContent = GS.score;
  el.goBest.textContent  = Math.max(GS.score, prev);
  el.goNewBest.style.display = newBest ? '' : 'none';
  el.goHitsRow.innerHTML =
    'פגיעות: <strong>' + GS.hits + '</strong>  |  ' +
    'החמצות: <strong>' + GS.misses + '</strong>  |  ' +
    'לחיצות ריקות: <strong>' + GS.emptyClicks + '</strong><br/>' +
    (GS.goldenHits ? '⭐ זהובות: '  + GS.goldenHits + '  ' : '') +
    (GS.bombHits   ? '💣 פצצות: '   + GS.bombHits   + '  ' : '') +
    (GS.tripleHits ? '🎉 שלוש-כפול: '+ GS.tripleHits       : '');

  el.gameoverOv.style.display = 'flex';
  el.menuBest.textContent = getBest(GS.diff);
}

function goToMenu() {
  stopTimers();
  musicPause();
  GS.running = false;
  GS.holes.forEach(function(h, i) { retractMole(i, false); });
  el.pauseOv.style.display    = 'none';
  el.gameoverOv.style.display = 'none';
  el.menuBest.textContent = getBest(GS.diff);
  showScreen('menu');
}

function stopTimers() {
  clearInterval(countdownTimer);
  clearTimeout(spawnTimer);
  clearTimeout(startDelayTimer);
  countdownTimer  = null;
  spawnTimer      = null;
  startDelayTimer = null;
}

// ════════════════════════════════════════════════════════════
// 16. EVENT LISTENERS
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.diff-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.diff-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    GS.diff = btn.dataset.diff;
    el.menuBest.textContent = getBest(GS.diff);
  });
});

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-howto').addEventListener('click', function() {
  document.getElementById('modal-howto').style.display = 'flex';
});
document.getElementById('btn-howto-close').addEventListener('click', function() {
  document.getElementById('modal-howto').style.display = 'none';
});
document.getElementById('btn-pause').addEventListener('click', pauseGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-pause-menu').addEventListener('click', goToMenu);
document.getElementById('btn-play-again').addEventListener('click', restartGame);
document.getElementById('btn-go-menu').addEventListener('click', goToMenu);

// ════════════════════════════════════════════════════════════
// 17. INIT
// ════════════════════════════════════════════════════════════

(function init() {
  el.menuBest.textContent = getBest(GS.diff);
})();
