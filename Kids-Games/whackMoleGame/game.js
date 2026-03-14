/* ════════════════════════════════════════════════════════════
   חבט במכרסם — game.js
   ════════════════════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

const GRID_SIZE   = 9;   // 3×3
const STORAGE_KEY = 'whackMole_best';

// Mole types
const MOLE_TYPES = {
  normal: { emoji: '🐹', points: 10,  badge: '',   label: 'יפה!',   cls: '' },
  golden: { emoji: '⭐', points: 25,  badge: '⭐', label: '!מצוין', cls: 'gold' },
  bomb:   { emoji: '💣', points: -15, badge: '💣', label: '!בום',   cls: 'bomb' },
  fast:   { emoji: '⚡', points: 15,  badge: '⚡', label: 'מהיר!',  cls: '' },
};

// Probability weights per normal spin [normal, golden, bomb, fast]
const TYPE_WEIGHTS = [65, 12, 12, 11];

const DIFF_CFG = {
  easy: {
    gameDuration:   55,   // seconds
    spawnInterval:  1400, // ms between spawn attempts
    visibleTime:    2200, // ms mole stays up (normal)
    maxActive:      2,    // max moles visible at once
    missAllowed:    99,   // no miss penalty for easy
  },
  normal: {
    gameDuration:   45,
    spawnInterval:  1100,
    visibleTime:    1600,
    maxActive:      3,
    missAllowed:    99,
  },
  hard: {
    gameDuration:   40,
    spawnInterval:  800,
    visibleTime:    1000,
    maxActive:      4,
    missAllowed:    99,
  },
};

// ════════════════════════════════════════════════════════════
// 2. GAME STATE
// ════════════════════════════════════════════════════════════

const GS = {
  running:    false,
  paused:     false,
  diff:       'normal',
  score:      0,
  timeLeft:   45,
  hits:       0,
  misses:     0,
  goldenHits: 0,
  bombHits:   0,
  // hole states: array of { active, type, timerId }
  holes:      [],
};

// ════════════════════════════════════════════════════════════
// 3. DOM REFERENCES
// ════════════════════════════════════════════════════════════

const screens = {
  menu:     document.getElementById('screen-menu'),
  game:     document.getElementById('screen-game'),
};
const el = {
  menuBest:   document.getElementById('menu-best'),
  hudScore:   document.getElementById('hud-score'),
  hudTime:    document.getElementById('hud-time'),
  hudBest:    document.getElementById('hud-best'),
  grid:       document.getElementById('grid'),
  floatMsg:   document.getElementById('float-msg'),
  // overlays
  pauseOv:    document.getElementById('overlay-pause'),
  gameoverOv: document.getElementById('overlay-gameover'),
  goScore:    document.getElementById('go-score'),
  goBest:     document.getElementById('go-best'),
  goNewBest:  document.getElementById('go-new-best'),
  goHitsRow:  document.getElementById('go-hits-row'),
};

// ════════════════════════════════════════════════════════════
// 4. STORAGE
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
// 5. SCREEN MANAGEMENT
// ════════════════════════════════════════════════════════════

function showScreen(name) {
  Object.values(screens).forEach(function(s) { s.classList.remove('active'); });
  screens[name].classList.add('active');
}

// ════════════════════════════════════════════════════════════
// 6. GRID BUILDING
// ════════════════════════════════════════════════════════════

function buildGrid() {
  el.grid.innerHTML = '';
  GS.holes = [];
  for (var i = 0; i < GRID_SIZE; i++) {
    var hole = document.createElement('div');
    hole.className = 'hole';
    hole.dataset.idx = i;

    var bg  = document.createElement('div');  bg.className  = 'hole-bg';
    var rim = document.createElement('div');  rim.className = 'hole-rim';
    var wrap = document.createElement('div'); wrap.className = 'mole-wrap';
    var mole = document.createElement('div'); mole.className = 'mole';

    wrap.appendChild(mole);
    hole.appendChild(bg);
    hole.appendChild(wrap);
    hole.appendChild(rim);

    el.grid.appendChild(hole);

    GS.holes.push({ el: hole, wrap: wrap, moleEl: mole, active: false, type: null, timerId: null });

    // Tap / click
    (function(idx) {
      hole.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        onHitHole(idx);
      });
    })(i);
  }
}

// ════════════════════════════════════════════════════════════
// 7. MOLE SPAWNER
// ════════════════════════════════════════════════════════════

var spawnTimer  = null;
var countdownTimer = null;

function countActive() {
  return GS.holes.filter(function(h) { return h.active; }).length;
}

function spawnMole() {
  if (!GS.running || GS.paused) return;
  var cfg = DIFF_CFG[GS.diff];
  if (countActive() >= cfg.maxActive) return;

  // Pick a random inactive hole
  var inactive = GS.holes.map(function(h,i) { return h.active ? -1 : i; }).filter(function(i) { return i >= 0; });
  if (inactive.length === 0) return;
  var idx = inactive[Math.floor(Math.random() * inactive.length)];

  // Pick mole type
  var type = pickType();
  var cfg2 = DIFF_CFG[GS.diff];
  var vis  = cfg2.visibleTime;
  if (type === 'fast')   vis = Math.round(vis * 0.55);
  if (type === 'golden') vis = Math.round(vis * 1.15);

  popMole(idx, type, vis);
}

function pickType() {
  var total = TYPE_WEIGHTS.reduce(function(a,b) { return a+b; }, 0);
  var r = Math.random() * total;
  var keys = Object.keys(MOLE_TYPES);
  for (var i = 0; i < keys.length; i++) {
    r -= TYPE_WEIGHTS[i];
    if (r <= 0) return keys[i];
  }
  return 'normal';
}

function popMole(idx, type, visTime) {
  var h = GS.holes[idx];
  h.active = true;
  h.type   = type;
  var info = MOLE_TYPES[type];

  h.moleEl.textContent = info.emoji;
  h.moleEl.classList.remove('whacked');
  h.wrap.classList.add('visible');

  // Badge
  var oldBadge = h.el.querySelector('.mole-badge');
  if (oldBadge) oldBadge.remove();
  if (info.badge) {
    var badge = document.createElement('div');
    badge.className = 'mole-badge';
    badge.textContent = info.badge;
    h.el.appendChild(badge);
  }

  // Auto-hide timer
  h.timerId = setTimeout(function() {
    if (h.active) retractMole(idx, true);  // missed
  }, visTime);
}

function retractMole(idx, missed) {
  var h = GS.holes[idx];
  if (!h.active) return;
  clearTimeout(h.timerId);
  h.active = false;
  h.wrap.classList.remove('visible');
  // Remove badge
  var badge = h.el.querySelector('.mole-badge');
  if (badge) badge.remove();

  if (missed && GS.running && !GS.paused) {
    GS.misses++;
  }
}

// ════════════════════════════════════════════════════════════
// 8. HIT HANDLING
// ════════════════════════════════════════════════════════════

function onHitHole(idx) {
  if (!GS.running || GS.paused) return;
  var h = GS.holes[idx];
  if (!h.active) return;   // empty hole tap — ignore silently

  var type  = h.type;
  var info  = MOLE_TYPES[type];
  var pts   = info.points;

  // Whack animation
  h.moleEl.classList.add('whacked');

  // Retract after short delay
  retractMole(idx, false);

  // Score
  GS.score = Math.max(0, GS.score + pts);
  GS.hits++;
  if (type === 'golden') GS.goldenHits++;
  if (type === 'bomb')   GS.bombHits++;

  updateHUD();

  // Ripple on hole
  triggerRipple(h.el);

  // Sparkles for positive hits
  if (pts > 0) spawnSparkles(h.el);

  // Floating score message above the hole
  showFloatOnHole(h.el, (pts > 0 ? '+' : '') + pts + '  ' + info.label, info.cls);
}

function triggerRipple(holeEl) {
  holeEl.classList.remove('hit-ripple');
  void holeEl.offsetWidth;
  holeEl.classList.add('hit-ripple');
  setTimeout(function() { holeEl.classList.remove('hit-ripple'); }, 380);
}

function spawnSparkles(holeEl) {
  var sparks = ['✨','⭐','💫','🌟'];
  var angles = [0, 60, 120, 180, 240, 300];
  angles.forEach(function(deg) {
    var s = document.createElement('div');
    s.className = 'sparkle';
    s.textContent = sparks[Math.floor(Math.random() * sparks.length)];
    var rad = deg * Math.PI / 180;
    var dist = 38 + Math.random() * 20;
    s.style.setProperty('--tx', 'translate(' + Math.round(Math.cos(rad)*dist) + 'px,' + Math.round(Math.sin(rad)*dist) + 'px)');
    s.style.top  = '40%';
    s.style.left = '40%';
    holeEl.appendChild(s);
    setTimeout(function() { s.remove(); }, 750);
  });
}

function showFloatOnHole(holeEl, text, cls) {
  var f = document.createElement('div');
  f.className = 'float-msg' + (cls ? ' ' + cls : '');
  f.textContent = text;
  f.style.position = 'absolute';
  f.style.top  = '10%';
  f.style.left = '50%';
  f.style.transform = 'translateX(-50%)';
  f.style.zIndex = '50';
  f.style.display = '';
  holeEl.style.position = 'relative';
  holeEl.appendChild(f);
  setTimeout(function() { f.remove(); }, 950);
}

// ════════════════════════════════════════════════════════════
// 9. TIMER & COUNTDOWN
// ════════════════════════════════════════════════════════════

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(function() {
    if (!GS.running || GS.paused) return;
    GS.timeLeft--;
    updateHUD();
    if (GS.timeLeft <= 5) el.hudTime.classList.add('urgent');
    if (GS.timeLeft <= 0) endGame();
  }, 1000);
}

function startSpawnLoop() {
  clearInterval(spawnTimer);
  var cfg = DIFF_CFG[GS.diff];
  spawnTimer = setInterval(function() {
    if (!GS.running || GS.paused) return;
    spawnMole();
  }, cfg.spawnInterval);
}

// ════════════════════════════════════════════════════════════
// 10. HUD UPDATE
// ════════════════════════════════════════════════════════════

function updateHUD() {
  el.hudScore.textContent = GS.score;
  el.hudTime.textContent  = GS.timeLeft;
  el.hudBest.textContent  = getBest(GS.diff);
}

// ════════════════════════════════════════════════════════════
// 11. GAME LIFECYCLE
// ════════════════════════════════════════════════════════════

function startGame() {
  var cfg = DIFF_CFG[GS.diff];
  GS.running    = true;
  GS.paused     = false;
  GS.score      = 0;
  GS.timeLeft   = cfg.gameDuration;
  GS.hits       = 0;
  GS.misses     = 0;
  GS.goldenHits = 0;
  GS.bombHits   = 0;
  el.hudTime.classList.remove('urgent');

  buildGrid();
  updateHUD();
  showScreen('game');

  startCountdown();
  startSpawnLoop();
}

function pauseGame() {
  if (!GS.running) return;
  GS.paused = true;
  el.pauseOv.style.display = 'flex';
  // Retract all active moles
  GS.holes.forEach(function(h, i) { if (h.active) retractMole(i, false); });
}

function resumeGame() {
  GS.paused = false;
  el.pauseOv.style.display = 'none';
}

function restartGame() {
  stopTimers();
  el.pauseOv.style.display   = 'none';
  el.gameoverOv.style.display = 'none';
  startGame();
}

function endGame() {
  GS.running = false;
  stopTimers();
  // Retract all moles
  GS.holes.forEach(function(h, i) { retractMole(i, false); });

  var prev = getBest(GS.diff);
  saveBest(GS.diff, GS.score);
  var newBest = GS.score > prev;

  el.goScore.textContent = GS.score;
  el.goBest.textContent  = Math.max(GS.score, prev);
  el.goNewBest.style.display = newBest ? '' : 'none';
  el.goHitsRow.innerHTML =
    'פגיעות: <strong>' + GS.hits + '</strong>  |  ' +
    'החמצות: <strong>' + GS.misses + '</strong><br/>' +
    (GS.goldenHits ? '⭐ זהובות: ' + GS.goldenHits + '  ' : '') +
    (GS.bombHits   ? '💣 פצצות: '  + GS.bombHits           : '');

  el.gameoverOv.style.display = 'flex';
  el.menuBest.textContent = getBest(GS.diff);
}

function goToMenu() {
  stopTimers();
  GS.running = false;
  GS.holes.forEach(function(h, i) { retractMole(i, false); });
  el.pauseOv.style.display    = 'none';
  el.gameoverOv.style.display = 'none';
  el.menuBest.textContent = getBest(GS.diff);
  showScreen('menu');
}

function stopTimers() {
  clearInterval(countdownTimer);
  clearInterval(spawnTimer);
  countdownTimer = null;
  spawnTimer     = null;
}

// ════════════════════════════════════════════════════════════
// 12. EVENT LISTENERS
// ════════════════════════════════════════════════════════════

// Difficulty buttons
document.querySelectorAll('.diff-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.diff-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    GS.diff = btn.dataset.diff;
    el.menuBest.textContent = getBest(GS.diff);
  });
});

// Menu buttons
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-howto').addEventListener('click', function() {
  document.getElementById('modal-howto').style.display = 'flex';
});
document.getElementById('btn-howto-close').addEventListener('click', function() {
  document.getElementById('modal-howto').style.display = 'none';
});

// HUD pause
document.getElementById('btn-pause').addEventListener('click', pauseGame);

// Pause overlay
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-pause-menu').addEventListener('click', goToMenu);

// Game over overlay
document.getElementById('btn-play-again').addEventListener('click', restartGame);
document.getElementById('btn-go-menu').addEventListener('click', goToMenu);

// ════════════════════════════════════════════════════════════
// 13. INIT
// ════════════════════════════════════════════════════════════

(function init() {
  el.menuBest.textContent = getBest(GS.diff);
})();
