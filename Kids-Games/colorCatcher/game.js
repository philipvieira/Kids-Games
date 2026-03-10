/*
 * ════════════════════════════════════════════════════════════
 *  תופס צבעים — game.js
 *
 *  HOW TO RUN:
 *    Open index.html in any modern browser. No build step needed.
 *
 *  SECTIONS:
 *    1.  Constants & Config
 *    2.  Storage
 *    3.  State
 *    4.  Audio (SoundFX + BgMusic)
 *    5.  UI Helpers
 *    6.  Rule System
 *    7.  Object Entity & Spawner
 *    8.  Catcher
 *    9.  Power-Ups
 *   10.  Collision & Scoring
 *   11.  Game Loop
 *   12.  Canvas Drawing
 *   13.  Menu Wiring
 *   14.  Init
 * ════════════════════════════════════════════════════════════
 */

'use strict';

// ════════════════════════════════════════════════════════════
// 1. CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════

const COLORS = [
  { id: 'red',    hex: '#ef4444', label: '🔴 אדום'  },
  { id: 'blue',   hex: '#3b82f6', label: '🔵 כחול'  },
  { id: 'green',  hex: '#22c55e', label: '🟢 ירוק'  },
  { id: 'yellow', hex: '#facc15', label: '🟡 צהוב'  },
  { id: 'purple', hex: '#a855f7', label: '🟣 סגול'  },
];

const SHAPES = [
  { id: 'circle',   label: '⭕ עיגול'  },
  { id: 'square',   label: '🟦 ריבוע'  },
  { id: 'triangle', label: '🔺 משולש'  },
  { id: 'star',     label: '⭐ כוכב'   },
  { id: 'heart',    label: '❤️ לב'     },
];

const NUMBERS = [0,1,2,3,4,5,6,7,8,9];

// Rule change intervals (ms) per difficulty — applies to ALL modes
const RULE_CHANGE_MS = { easy: 22000, normal: 17000, hard: 12000 };

const DIFF_CFG = {
  easy:   { lives: 4, speedBase: 110, speedMult: 1.0, spawnMs: 900,  maxObjs: 8,  penaltyHeart: true, penaltyScore: 5,  catcherSpd: 380 },
  normal: { lives: 3, speedBase: 150, speedMult: 1.0, spawnMs: 700,  maxObjs: 10, penaltyHeart: true, penaltyScore: 10, catcherSpd: 420 },
  hard:   { lives: 2, speedBase: 200, speedMult: 1.2, spawnMs: 550,  maxObjs: 12, penaltyHeart: true, penaltyScore: 15, catcherSpd: 460 },
};

const MODE_LABELS = { color: '🎨 צבע', shape: '⭐ צורה', number: '🔢 מספר', mix: '🌀 מיקס' };
const LEVEL_THRESHOLD  = 10;
const BONUS_EVERY      = 5;
const BONUS_DURATION   = 10000;
const MISS_PENALTY_PTS = 5;
// Mobile scale factor applied to falling objects & catcher
const MOBILE_SCALE = 0.7;

const PU_TYPES = {
  slowTime:    { icon: '🐢', label: 'זמן איטי',    duration: 5000  },
  magnet:      { icon: '🧲', label: 'מגנט',         duration: 6000  },
  shield:      { icon: '🛡', label: 'מגן',          duration: 0     },
  scoreBoost:  { icon: '⭐', label: 'בונוס ניקוד', duration: 10000 },
  cleanScreen: { icon: '💨', label: 'מסך נקי',     duration: 0     },
};

const ENCOURAGEMENT = [
  'אתה מדהים! 🌟', 'נסה שוב, אתה יכול! 💪',
  'כמעט הגעת! 🎯', 'אתה הולך ומשתפר! 📈',
  'אל תוותר! 🚀', 'מחר עוד יותר טוב! ⭐',
];

// ════════════════════════════════════════════════════════════
// 2. STORAGE
// ════════════════════════════════════════════════════════════

const Storage = {
  _key(mode, diff) { return `cc_best_${mode}_${diff}`; },
  getBest(mode, diff) { return parseInt(localStorage.getItem(Storage._key(mode, diff)) || '0', 10); },
  saveBest(mode, diff, score) {
    if (score > Storage.getBest(mode, diff)) {
      localStorage.setItem(Storage._key(mode, diff), String(score));
      return true;
    }
    return false;
  },
  getSettings() {
    try { return JSON.parse(localStorage.getItem('cc_settings') || '{}'); }
    catch (e) { return {}; }
  },
  saveSettings(obj) {
    const cur = Storage.getSettings();
    localStorage.setItem('cc_settings', JSON.stringify(Object.assign(cur, obj)));
  },
};

// ════════════════════════════════════════════════════════════
// 3. STATE
// ════════════════════════════════════════════════════════════

const GS = {
  mode:    'color',
  diff:    'easy',
  soundOn: true,
  isMobile: false,

  running:      false,
  paused:       false,
  score:        0,
  lives:        4,
  level:        1,
  correctCount: 0,

  objects:    [],
  particles:  [],

  catcherX:    0,
  catcherW:    80,
  moveLeft:    false,
  moveRight:   false,

  dragActive:   false,
  dragStartX:   0,
  dragCatcherX: 0,

  spawnTimer:  0,
  nextSpawnMs: 1400,

  // Rule + rule-change timer (applies to ALL modes)
  currentRule:   null,
  ruleTimer:     0,   // ms elapsed since last rule change
  ruleChangeMs:  10000,

  activePU:    null,
  bonusActive: false,
  bonusEnd:    0,

  lastTime:  0,
  animFrame: null,
};

function resetRuntime() {
  const cfg = DIFF_CFG[GS.diff];
  GS.running      = false;
  GS.paused       = false;
  GS.score        = 0;
  GS.lives        = cfg.lives;
  GS.level        = 1;
  GS.correctCount = 0;
  GS.objects      = [];
  GS.particles    = [];
  GS.moveLeft     = GS.moveRight = false;
  GS.dragActive   = false;
  GS.spawnTimer   = 0;
  GS.nextSpawnMs  = cfg.spawnMs;
  GS.ruleTimer    = 0;
  GS.ruleChangeMs = RULE_CHANGE_MS[GS.diff];
  GS._spawnsSinceCorrect = 0;
  GS.activePU     = null;
  GS.bonusActive  = false;
  GS.bonusEnd     = 0;
  GS.lastTime     = 0;
  if (GS.animFrame) { cancelAnimationFrame(GS.animFrame); GS.animFrame = null; }
}

// ════════════════════════════════════════════════════════════
// 4. AUDIO
// ════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let audioCtx = null, unlocked = false;

  function getCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) {}
    }
    return audioCtx;
  }

  function unlock() {
    if (unlocked) return;
    const c = getCtx();
    if (!c) return;
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
      g.gain.setValueAtTime(vol || 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    } catch (e) {}
  }

  return {
    unlock,
    catchSound()  { beep(660, 0.1, 'sine', 0.18); setTimeout(function(){beep(880,0.1,'sine',0.15);},80); },
    wrong()       { beep(180, 0.2, 'sawtooth', 0.1); },
    powerup()     { [600,800,1000].forEach(function(f,i){setTimeout(function(){beep(f,0.1,'sine',0.15);},i*70);}); },
    levelup()     { [523,659,784,1047].forEach(function(f,i){setTimeout(function(){beep(f,0.15,'sine',0.18);},i*130);}); },
    gameover()    { beep(220, 0.5, 'sawtooth', 0.1); },
    newrule()     { beep(440, 0.08, 'sine', 0.1); setTimeout(function(){beep(550,0.1,'sine',0.12);},80); },
  };
})();

const BgMusic = (() => {
  const audio = new Audio('ColorGame.mp3');
  audio.loop   = true;
  audio.volume = 0.45;
  return {
    play()   { if (GS.soundOn) { audio.currentTime = 0; audio.play().catch(function(){}); } },
    stop()   { audio.pause(); audio.currentTime = 0; },
    pause()  { audio.pause(); },
    resume() { if (GS.soundOn) audio.play().catch(function(){}); },
    setVol(v){ audio.volume = v; },
  };
})();

// ════════════════════════════════════════════════════════════
// 5. UI HELPERS
// ════════════════════════════════════════════════════════════

const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const hud   = document.getElementById('hud');
  const puBar = document.getElementById('pu-bar');
  const mc    = document.getElementById('mobile-controls');
  const hudH  = hud.offsetHeight + (puBar.style.display !== 'none' ? puBar.offsetHeight : 0);
  const mcH   = mc.classList.contains('visible') ? mc.offsetHeight : 0;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - hudH - mcH;
  const half = GS.catcherW / 2;
  GS.catcherX = Math.max(half, Math.min(canvas.width - half, GS.catcherX));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function updateHUD() {
  const hearts = '❤️'.repeat(Math.max(0, GS.lives));
  document.getElementById('hud-hearts').textContent = hearts || '💀';
  document.getElementById('hud-score').textContent  = GS.score;
  document.getElementById('hud-level').textContent  = 'שלב ' + GS.level;
  if (GS.currentRule) {
    document.getElementById('rule-value').textContent = GS.currentRule.label;
  }
  // Update rule change countdown
  if (!GS.bonusActive && GS.ruleChangeMs > 0) {
    const secLeft = Math.max(0, Math.ceil((GS.ruleChangeMs - GS.ruleTimer) / 1000));
    document.getElementById('rule-timer').textContent = secLeft + 'ש׳';
  } else {
    document.getElementById('rule-timer').textContent = '';
  }
}

function updateMenuBest() {
  const best = Storage.getBest(GS.mode, GS.diff);
  const el   = document.getElementById('menu-best');
  if (best > 0) {
    const diffLabel = { easy:'קל', normal:'רגיל', hard:'קשה' }[GS.diff];
    el.innerHTML = '🏆 שיא: <strong>' + best + '</strong><br><small>' + MODE_LABELS[GS.mode] + ' · ' + diffLabel + '</small>';
  } else {
    el.innerHTML = '';
  }
}

function spawnParticles(x, y, color, type) {
  const count = type === 'catch' ? 8 : 5;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.4;
    const spd   = 60 + Math.random() * 80;
    GS.particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 40,
      color: type === 'catch' ? color : '#f87171',
      life: 1.0,
      size: type === 'catch' ? 8 + Math.random() * 6 : 5 + Math.random() * 4,
    });
  }
}

function spawnScoreText(x, y, text, color) {
  GS.particles.push({ x, y, vx: 0, vy: -60, color: color || '#ffd166', life: 1.0, size: 0, text, isText: true });
}

// ════════════════════════════════════════════════════════════
// 6. RULE SYSTEM
// ════════════════════════════════════════════════════════════

function pickRuleForMode(mode) {
  const m = mode || GS.mode;
  if (m === 'mix') {
    const types = ['color', 'shape', 'number'];
    return pickRuleForMode(types[Math.floor(Math.random() * types.length)]);
  }
  if (m === 'color') {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    return { type: 'color', value: c.id, label: c.label };
  }
  if (m === 'shape') {
    const s = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return { type: 'shape', value: s.id, label: s.label };
  }
  // number
  const n = NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
  return { type: 'number', value: n, label: '🔢 ' + n };
}

// Pick a rule guaranteed different from current
function pickNewRule() {
  let rule;
  let tries = 0;
  do {
    rule = pickRuleForMode();
    tries++;
  } while (tries < 10 && GS.currentRule && rule.value === GS.currentRule.value);
  return rule;
}

function applyNewRule(rule, animate) {
  GS.currentRule = rule;
  document.getElementById('rule-value').textContent = rule.label;
  if (animate) {
    SoundFX.newrule();
    const popup = document.getElementById('rule-popup');
    document.getElementById('rp-value').textContent = rule.label;
    popup.style.display = '';
    popup.style.animation = 'none';
    popup.offsetHeight; // reflow to restart animation
    popup.style.animation = '';
    clearTimeout(applyNewRule._t);
    applyNewRule._t = setTimeout(function() { popup.style.display = 'none'; }, 1800);
  }
}

function isCorrect(obj) {
  if (GS.bonusActive) return true;
  if (!GS.currentRule) return false;
  const r = GS.currentRule;
  if (r.type === 'color')  return obj.colorId === r.value;
  if (r.type === 'shape')  return obj.shapeId === r.value;
  if (r.type === 'number') return obj.number  === r.value;
  return false;
}

// ════════════════════════════════════════════════════════════
// 7. OBJECT ENTITY & SPAWNER
// ════════════════════════════════════════════════════════════

let objIdCounter = 0;

function getObjScale() {
  return GS.isMobile ? MOBILE_SCALE : 1.0;
}

function createObject(isPowerup, forceCorrect) {
  // When forceCorrect is true, force the object to match the current rule
  let color  = COLORS[Math.floor(Math.random() * COLORS.length)];
  let shape  = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  let number = NUMBERS[Math.floor(Math.random() * NUMBERS.length)];

  if (forceCorrect && GS.currentRule && !isPowerup) {
    if (GS.currentRule.type === 'color') {
      color = COLORS.find(function(c){ return c.id === GS.currentRule.value; }) || color;
    } else if (GS.currentRule.type === 'shape') {
      shape = SHAPES.find(function(s){ return s.id === GS.currentRule.value; }) || shape;
    } else if (GS.currentRule.type === 'number') {
      number = GS.currentRule.value;
    }
  }

  const cfg    = DIFF_CFG[GS.diff];
  const sc     = getObjScale();

  const levelBonus = (GS.level - 1) * 6;
  let speed = (cfg.speedBase + levelBonus) * cfg.speedMult;
  if (GS.activePU && GS.activePU.type === 'slowTime') speed *= 0.4;

  const baseSize = 44 + Math.random() * 18;
  const size = baseSize * sc;
  const x    = size / 2 + Math.random() * (canvas.width - size);

  if (isPowerup) {
    const puKeys = Object.keys(PU_TYPES);
    const puType = puKeys[Math.floor(Math.random() * puKeys.length)];
    return { id: ++objIdCounter, x, y: -size, size, speed: speed * 0.7,
      colorId: color.id, colorHex: color.hex, shapeId: shape.id, number,
      isPowerup: true, puType, dead: false };
  }

  return { id: ++objIdCounter, x, y: -size, size, speed,
    colorId: color.id, colorHex: color.hex, shapeId: shape.id, number,
    isPowerup: false, dead: false,
    hintGlow: (GS.diff === 'easy') };
}

function spawnObject() {
  const cfg   = DIFF_CFG[GS.diff];
  const alive = GS.objects.filter(function(o){ return !o.dead; }).length;
  if (alive >= cfg.maxObjs) return;

  // Guarantee a correct object at least every 3 spawns so the player always has targets
  GS._spawnsSinceCorrect = (GS._spawnsSinceCorrect || 0) + 1;
  const forceCorrect = GS._spawnsSinceCorrect >= 3;
  const obj = createObject(false, forceCorrect);
  if (forceCorrect) GS._spawnsSinceCorrect = 0;
  GS.objects.push(obj);
}

function maybeSpawnPowerup() {
  if (Math.random() < 0.15) {
    GS.objects.push(createObject(true));
  }
}

// ════════════════════════════════════════════════════════════
// 8. CATCHER
// ════════════════════════════════════════════════════════════

function initCatcher() {
  const sc     = getObjScale();
  GS.catcherW  = Math.min(90 * sc, canvas.width * 0.22);
  GS.catcherX  = canvas.width / 2;
}

function updateCatcher(dt) {
  const spd = DIFF_CFG[GS.diff].catcherSpd * (GS.isMobile ? 1.0 : 1.4);
  if (GS.moveLeft)  GS.catcherX -= spd * dt;
  if (GS.moveRight) GS.catcherX += spd * dt;
  const half = GS.catcherW / 2;
  GS.catcherX = Math.max(half, Math.min(canvas.width - half, GS.catcherX));
}

function drawCatcher() {
  const x  = GS.catcherX;
  const sc = getObjScale();
  const y  = canvas.height - (20 * sc);
  const w  = GS.catcherW;
  const h  = 34 * sc;
  const rim = 10 * sc;

  if (GS.activePU && GS.activePU.type === 'magnet') {
    ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 20;
  }

  ctx.fillStyle   = '#ffd166';
  ctx.strokeStyle = '#ef8c00';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.lineTo(x + w / 2 + rim, y + h / 2);
  ctx.lineTo(x - w / 2 - rim, y + h / 2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#ef8c00';
  ctx.fillRect(x - 6 * sc, y + h / 2, 12 * sc, 14 * sc);

  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(x - 12 * sc, y - 4 * sc, 5 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 12 * sc, y - 4 * sc, 5 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - 10 * sc, y - 6 * sc, 2 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14 * sc, y - 6 * sc, 2 * sc, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y - 2 * sc, 8 * sc, 0.2, Math.PI - 0.2); ctx.stroke();

  ctx.shadowBlur = 0;
}

// ════════════════════════════════════════════════════════════
// 9. POWER-UPS
// ════════════════════════════════════════════════════════════

function activatePowerup(puType) {
  SoundFX.powerup();
  if (puType === 'cleanScreen') {
    GS.objects = [];
    showPUBar(puType, 1200);
    return;
  }
  if (puType === 'shield') {
    GS.activePU = { type: 'shield', endTime: Infinity };
    showPUBar(puType, 0);
    return;
  }
  GS.activePU = { type: puType, endTime: Date.now() + PU_TYPES[puType].duration };
  showPUBar(puType, PU_TYPES[puType].duration);
}

function showPUBar(puType, duration) {
  const bar = document.getElementById('pu-bar');
  document.getElementById('pu-icon').textContent  = PU_TYPES[puType].icon;
  document.getElementById('pu-label').textContent = PU_TYPES[puType].label;
  document.getElementById('pu-timer-fill').style.width = '100%';
  bar.style.display = '';
  resizeCanvas();
  if (duration > 0) {
    clearTimeout(showPUBar._t);
    showPUBar._t = setTimeout(function() {
      bar.style.display = 'none';
      resizeCanvas();
    }, duration + 200);
  }
}

function updatePowerup(now) {
  const pu = GS.activePU;
  if (!pu) return;
  if (pu.type === 'shield') return;
  if (now >= pu.endTime) {
    GS.activePU = null;
    document.getElementById('pu-bar').style.display = 'none';
    resizeCanvas();
    return;
  }
  const frac = Math.max(0, (pu.endTime - now) / PU_TYPES[pu.type].duration);
  document.getElementById('pu-timer-fill').style.width = (frac * 100) + '%';
}

function applyMagnet(dt) {
  if (!GS.activePU || GS.activePU.type !== 'magnet') return;
  GS.objects.forEach(function(obj) {
    if (obj.dead || obj.isPowerup) return;
    if (!isCorrect(obj)) return;
    const dx   = GS.catcherX - obj.x;
    const dist = Math.abs(dx);
    if (dist > 0 && dist < 180) {
      obj.x += (dx / dist) * 60 * dt;
    }
  });
}

// ════════════════════════════════════════════════════════════
// 10. COLLISION & SCORING
// ════════════════════════════════════════════════════════════

function checkCollisions() {
  const sc   = getObjScale();
  const cy   = canvas.height - 20 * sc;
  const ch   = 34 * sc;
  const half = GS.catcherW / 2 + 10 * sc;

  GS.objects.forEach(function(obj) {
    if (obj.dead) return;
    const objBottom = obj.y + obj.size / 2;

    // Caught by catcher
    if (objBottom >= cy - ch / 2 && obj.y < cy + ch / 2 &&
        Math.abs(obj.x - GS.catcherX) < half + obj.size / 2) {
      obj.dead = true;

      if (obj.isPowerup) {
        activatePowerup(obj.puType);
        spawnParticles(obj.x, obj.y, '#ffd166', 'catch');
        spawnScoreText(obj.x, obj.y - 20, PU_TYPES[obj.puType].icon + ' ' + PU_TYPES[obj.puType].label, '#ffd166');
        return;
      }

      if (isCorrect(obj)) {
        let pts = GS.bonusActive ? 20 : 10;
        if (GS.activePU && GS.activePU.type === 'scoreBoost') pts *= 2;
        GS.score += pts;
        GS.correctCount++;
        SoundFX.catchSound();
        spawnParticles(obj.x, obj.y, obj.colorHex, 'catch');
        spawnScoreText(obj.x, obj.y - 20, '+' + pts, '#4ade80');
        checkLevelUp();
      } else {
        // Wrong catch — always lose heart (all difficulties)
        if (GS.activePU && GS.activePU.type === 'shield') {
          GS.activePU = null;
          document.getElementById('pu-bar').style.display = 'none';
          resizeCanvas();
          spawnScoreText(obj.x, obj.y - 20, '🛡 מוגן!', '#3b82f6');
        } else {
          SoundFX.wrong();
          GS.score = Math.max(0, GS.score - DIFF_CFG[GS.diff].penaltyScore);
          loseHeart();
          spawnParticles(obj.x, obj.y, '#ef4444', 'wrong');
          spawnScoreText(obj.x, obj.y - 20, '-' + DIFF_CFG[GS.diff].penaltyScore + ' ❌', '#f87171');
        }
      }
    }

    // Fell off bottom — penalty only for missing a correct object
    if (objBottom > canvas.height + 10) {
      obj.dead = true;
      if (!obj.isPowerup && isCorrect(obj)) {
        GS.score = Math.max(0, GS.score - MISS_PENALTY_PTS);
        spawnScoreText(obj.x, canvas.height - 30, '-' + MISS_PENALTY_PTS, '#facc15');
      }
    }
  });

  GS.objects = GS.objects.filter(function(o){ return !o.dead; });
}

function loseHeart() {
  GS.lives--;
  updateHUD();
  if (GS.lives <= 0) endGame();
}

function checkLevelUp() {
  if (GS.correctCount >= LEVEL_THRESHOLD) {
    GS.correctCount = 0;
    GS.level++;
    SoundFX.levelup();
    spawnScoreText(canvas.width / 2, canvas.height / 2, '🎉 שלב ' + GS.level + '!', '#ffd166');
    if (GS.level % BONUS_EVERY === 0) triggerBonusRound();
    // Gradually speed up spawn rate (floor = 400ms)
    GS.nextSpawnMs = Math.max(400, DIFF_CFG[GS.diff].spawnMs - (GS.level - 1) * 40);
    // Slowly shorten rule-change interval per level (min 8s)
    GS.ruleChangeMs = Math.max(8000, RULE_CHANGE_MS[GS.diff] - (GS.level - 1) * 500);
    updateHUD();
  }
}

// ════════════════════════════════════════════════════════════
// 11. GAME LOOP
// ════════════════════════════════════════════════════════════

function startGame() {
  SoundFX.unlock();
  resetRuntime();

  GS.isMobile = isTouchDevice();

  const mc = document.getElementById('mobile-controls');
  if (GS.isMobile) { mc.classList.add('visible'); }
  else             { mc.classList.remove('visible'); }

  document.getElementById('pu-bar').style.display    = 'none';
  document.getElementById('rule-popup').style.display   = 'none';
  document.getElementById('bonus-popup').style.display  = 'none';
  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';

  showScreen('screen-game');
  resizeCanvas();
  initCatcher();

  // Pick first rule and reset rule timer
  GS.currentRule = pickRuleForMode();
  GS.ruleTimer   = 0;

  updateHUD();
  BgMusic.play();
  GS.running  = true;
  GS.lastTime = performance.now();
  GS.animFrame = requestAnimationFrame(gameLoop);
}

function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth < 700;
}

function gameLoop(ts) {
  if (!GS.running) return;
  const dt = Math.min((ts - GS.lastTime) / 1000, 0.05);
  GS.lastTime = ts;
  if (!GS.paused) {
    update(dt);
    draw(ts);
  }
  GS.animFrame = requestAnimationFrame(gameLoop);
}

function update(dt) {
  const now = Date.now();

  // Spawn objects
  GS.spawnTimer += dt * 1000;
  if (GS.spawnTimer >= GS.nextSpawnMs) {
    GS.spawnTimer = 0;
    spawnObject();
    maybeSpawnPowerup();
  }

  // Rule-change timer — runs in ALL modes
  if (!GS.bonusActive) {
    GS.ruleTimer += dt * 1000;
    if (GS.ruleTimer >= GS.ruleChangeMs) {
      GS.ruleTimer = 0;
      GS._spawnsSinceCorrect = 3; // force a correct object on the very next spawn
      applyNewRule(pickNewRule(), true);
    }
  }

  updateCatcher(dt);
  applyMagnet(dt);

  // Move objects
  GS.objects.forEach(function(obj) {
    if (obj.dead) return;
    let spd = obj.speed;
    if (GS.activePU && GS.activePU.type === 'slowTime') spd *= 0.4;
    obj.y += spd * dt;
  });

  checkCollisions();
  updatePowerup(now);

  // Bonus round end
  if (GS.bonusActive && now >= GS.bonusEnd) {
    GS.bonusActive = false;
    document.getElementById('bonus-popup').style.display = 'none';
    GS.ruleTimer = 0;
    GS._spawnsSinceCorrect = 3;
    applyNewRule(pickNewRule(), true);
  }

  // Particles
  GS.particles.forEach(function(p) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 120 * dt;
    p.life -= dt * 1.8;
  });
  GS.particles = GS.particles.filter(function(p){ return p.life > 0; });

  updateHUD();
}

function triggerBonusRound() {
  GS.bonusActive = true;
  GS.bonusEnd    = Date.now() + BONUS_DURATION;
  GS.objects     = [];
  const popup    = document.getElementById('bonus-popup');
  popup.style.display = '';
  setTimeout(function() { popup.style.display = 'none'; }, 2500);
}

function endGame() {
  GS.running = false;
  SoundFX.gameover();
  BgMusic.stop();

  const isNew = Storage.saveBest(GS.mode, GS.diff, GS.score);
  document.getElementById('go-msg').textContent =
    ENCOURAGEMENT[Math.floor(Math.random() * ENCOURAGEMENT.length)];
  const diffLabel = { easy:'קל', normal:'רגיל', hard:'קשה' }[GS.diff];
  document.getElementById('go-stats').innerHTML =
    'ניקוד: <strong>' + GS.score + '</strong><br>שלב: <strong>' + GS.level + '</strong><br>' +
    'מצב: <strong>' + MODE_LABELS[GS.mode] + '</strong> · <strong>' + diffLabel + '</strong>';
  document.getElementById('go-best').style.display = isNew ? '' : 'none';
  document.getElementById('overlay-gameover').style.display = 'flex';
}

function pauseGame() {
  if (!GS.running) return;
  GS.paused = true;
  BgMusic.pause();
  document.getElementById('overlay-pause').style.display = 'flex';
}

function resumeGame() {
  GS.paused   = false;
  GS.lastTime = performance.now();
  BgMusic.resume();
  document.getElementById('overlay-pause').style.display = 'none';
}

// ════════════════════════════════════════════════════════════
// 12. CANVAS DRAWING
// ════════════════════════════════════════════════════════════

const BG_STARS = (function() {
  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.5,
      a: Math.random(), spd: 0.3 + Math.random() * 0.5 });
  }
  return stars;
})();

function drawBackground(ts) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0f0c29');
  grad.addColorStop(1, '#302b63');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  BG_STARS.forEach(function(s) {
    s.a += s.spd * 0.016;
    const alpha = 0.3 + 0.5 * Math.abs(Math.sin(s.a));
    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Rule change progress arc at the top of canvas
  if (!GS.bonusActive && GS.ruleChangeMs > 0) {
    const frac  = GS.ruleTimer / GS.ruleChangeMs;
    const w     = canvas.width * 0.6;
    const barH  = 5;
    const barX  = (canvas.width - w) / 2;
    const barY  = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(barX, barY, w, barH);
    const col = frac > 0.75 ? '#ef4444' : frac > 0.5 ? '#ffd166' : '#4ade80';
    ctx.fillStyle = col;
    ctx.fillRect(barX, barY, w * frac, barH);
  }
}

function drawObject(obj) {
  if (obj.dead) return;
  const sz   = obj.size;
  const half = sz / 2;

  ctx.save();
  ctx.translate(obj.x, obj.y);

  if (!obj.isPowerup && obj.hintGlow && isCorrect(obj)) {
    ctx.shadowColor = obj.colorHex;
    ctx.shadowBlur  = 18;
  }

  if (obj.isPowerup) {
    const pulse = 1 + 0.08 * Math.sin(Date.now() / 200);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#ef8c00'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, half * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold ' + Math.round(sz * 0.45) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(PU_TYPES[obj.puType].icon, 0, 0);
  } else {
    ctx.fillStyle   = obj.colorHex;
    ctx.strokeStyle = darken(obj.colorHex);
    ctx.lineWidth   = 3;
    drawShape(ctx, obj.shapeId, half);
    ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}

function drawShape(context, shapeId, r) {
  switch (shapeId) {
    case 'circle':
      context.beginPath(); context.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'square':
      context.beginPath(); context.roundRect(-r, -r, r * 2, r * 2, r * 0.18); break;
    case 'triangle':
      context.beginPath();
      context.moveTo(0, -r);
      context.lineTo(r * 0.87, r * 0.5);
      context.lineTo(-r * 0.87, r * 0.5);
      context.closePath(); break;
    case 'star': {
      const spikes = 5, outer = r, inner = r * 0.45;
      context.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rad = (i * Math.PI) / spikes - Math.PI / 2;
        const len = i % 2 === 0 ? outer : inner;
        if (i === 0) context.moveTo(Math.cos(rad) * len, Math.sin(rad) * len);
        else context.lineTo(Math.cos(rad) * len, Math.sin(rad) * len);
      }
      context.closePath(); break;
    }
    case 'heart': {
      const s = r * 0.9;
      context.beginPath();
      context.moveTo(0, s * 0.3);
      context.bezierCurveTo(-s * 0.1, -s * 0.2, -s, -s * 0.2, -s, s * 0.1);
      context.bezierCurveTo(-s, s * 0.55, -s * 0.3, s * 0.85, 0, s);
      context.bezierCurveTo(s * 0.3, s * 0.85, s, s * 0.55, s, s * 0.1);
      context.bezierCurveTo(s, -s * 0.2, s * 0.1, -s * 0.2, 0, s * 0.3);
      context.closePath(); break;
    }
  }
}

function darken(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 'rgb(' + Math.round(r*0.65) + ',' + Math.round(g*0.65) + ',' + Math.round(b*0.65) + ')';
}
function contrastColor(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000 > 140 ? '#1a1a2e' : '#ffffff';
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    r = Math.min(r, w/2, h/2);
    this.beginPath();
    this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.arcTo(x+w,y,x+w,y+r,r);
    this.lineTo(x+w,y+h-r); this.arcTo(x+w,y+h,x+w-r,y+h,r);
    this.lineTo(x+r,y+h); this.arcTo(x,y+h,x,y+h-r,r);
    this.lineTo(x,y+r); this.arcTo(x,y,x+r,y,r);
    this.closePath();
  };
}

function drawParticles() {
  GS.particles.forEach(function(p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    if (p.isText) {
      ctx.fillStyle = p.color;
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function draw(ts) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(ts);
  GS.objects.forEach(drawObject);
  drawCatcher();
  drawParticles();
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
    SoundFX.unlock(); startGame();
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
    if (GS.soundOn) { BgMusic.resume(); } else { BgMusic.pause(); }
  });
}

function wireGame() {
  document.getElementById('btn-pause').addEventListener('click', function() {
    SoundFX.unlock(); pauseGame();
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
  document.getElementById('audio-banner').addEventListener('click', function() { SoundFX.unlock(); });
}

function wireKeyboard() {
  const keys = {};
  document.addEventListener('keydown', function(e) {
    if (keys[e.key]) return;
    keys[e.key] = true;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') GS.moveLeft  = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') GS.moveRight = true;
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') &&
        document.getElementById('screen-game').classList.contains('active')) {
      if (GS.paused) resumeGame(); else pauseGame();
    }
  });
  document.addEventListener('keyup', function(e) {
    delete keys[e.key];
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') GS.moveLeft  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') GS.moveRight = false;
  });
}

function wireMobileControls() {
  // IMPORTANT: in the HTML, #mc-left button is positioned on the RIGHT side of the screen
  // (right: 10px) and #mc-right on the LEFT (left: 10px) for RTL layout.
  // The button IDs refer to the DIRECTION OF MOVEMENT, not screen position.
  // mc-left  → moves catcher LEFT  (decreases X) → placed on the right of screen for RTL
  // mc-right → moves catcher RIGHT (increases X) → placed on the left of screen for RTL
  function pressBtn(id, flag) {
    const el = document.getElementById(id);
    function start(e) { e.preventDefault(); GS[flag] = true;  el.classList.add('pressed'); SoundFX.unlock(); }
    function end(e)   { e.preventDefault(); GS[flag] = false; el.classList.remove('pressed'); }
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend',   end,   { passive: false });
    el.addEventListener('touchcancel',end,   { passive: false });
    el.addEventListener('mousedown',  start);
    el.addEventListener('mouseup',    end);
    el.addEventListener('mouseleave', end);
  }
  pressBtn('mc-left',  'moveLeft');
  pressBtn('mc-right', 'moveRight');

  // Drag catcher
  canvas.addEventListener('touchstart', function(e) {
    if (!GS.running || GS.paused) return;
    SoundFX.unlock();
    const t = e.touches[0];
    GS.dragActive   = true;
    GS.dragStartX   = t.clientX;
    GS.dragCatcherX = GS.catcherX;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    if (!GS.dragActive) return;
    const t  = e.touches[0];
    const dx = t.clientX - GS.dragStartX;
    const half = GS.catcherW / 2;
    GS.catcherX = Math.max(half, Math.min(canvas.width - half, GS.dragCatcherX + dx));
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function() { GS.dragActive = false; }, { passive: false });
}

function wireResize() {
  let t = null;
  window.addEventListener('resize', function() {
    clearTimeout(t);
    t = setTimeout(function() {
      if (document.getElementById('screen-game').classList.contains('active')) resizeCanvas();
    }, 150);
  });
}

function goToMenu() {
  GS.running = false;
  if (GS.animFrame) { cancelAnimationFrame(GS.animFrame); GS.animFrame = null; }
  BgMusic.stop();
  document.getElementById('overlay-pause').style.display    = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';
  document.getElementById('mobile-controls').classList.remove('visible');
  updateMenuBest();
  showScreen('screen-menu');
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
// 14. INIT
// ════════════════════════════════════════════════════════════

function init() {
  restoreSettings();
  wireMenu();
  wireGame();
  wireKeyboard();
  wireMobileControls();
  wireResize();
  updateMenuBest();
  showScreen('screen-menu');
}

document.addEventListener('DOMContentLoaded', init);
