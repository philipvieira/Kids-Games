/* ═══════════════════════════════════════════════════════════════
   דג מלוח — game.js
   Kids motion game: Red Light Green Light (Hebrew edition)

   Modules:
     SettingsStorage  — persist toggles/slider via localStorage
     AudioManager     — Web Audio API: 8-bit music + stop sound
     SpeechManager    — SpeechSynthesis "דג מלוח!"
     CountdownManager — animated 5-4-3-2-1 display
     MotionDetector   — getUserMedia frame-diff AI referee
     UI               — screen transitions + DOM helpers
     GameState        — central FSM controlling game flow
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════
   SettingsStorage
═══════════════════════════════════ */
const SettingsStorage = (() => {
  const KEY = 'dagMaluach_settings';

  const defaults = {
    music: true,
    sound: true,
    voice: true,
    ai: false,
    cameraPreview: true,
    sensitivity: 5,
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign({}, defaults, JSON.parse(raw));
    } catch (_) {}
    return Object.assign({}, defaults);
  }

  function save(settings) {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) {}
  }

  return { load, save };
})();


/* ═══════════════════════════════════
   AudioManager  — Web Audio API
═══════════════════════════════════ */
const AudioManager = (() => {
  let ctx = null;
  let musicNodes = { source: null, gain: null };
  let scheduledNotes = [];
  let loopStartTime = 0;
  let loopDuration = 0;
  let loopTimer = null;
  let musicEnabled = true;
  let soundEnabled = true;
  let masterGain = null;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.7, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  /* ── Stop Sound: descending square wave ─── */
  function playStopSound() {
    if (!soundEnabled) return;
    ensureContext();
    const now = ctx.currentTime;

    /* +30 % louder: was 0.4 → 0.52, was 0.35 → 0.46 */
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.22);
    gain.gain.setValueAtTime(0.52, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.3);

    /* Second layer: blip confirmation */
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(330, now + 0.18);
    osc2.frequency.setValueAtTime(165, now + 0.30);
    gain2.gain.setValueAtTime(0.46, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.45);
  }

  /* ── 8-bit Background Music ─────────────── */
  /*
    Key: C major  |  BPM: 160  |  Loop: 8 bars

    Melody (square wave, high octave):
    C5  E5  G5  E5  | F5  A5  C6  A5
    G5  B5  D6  B5  | C6  G5  E5  C5

    Bass pulse (square, low octave, on beats):
    C3  C3  F3  F3  | G3  G3  C3  C3

    Percussion-like: noise burst on beats 1 & 3 of each bar
  */

  const BPM = 160;
  const BEAT = 60 / BPM;          // seconds per beat
  const NOTE = BEAT * 0.5;        // eighth note duration

  function noteFreq(note, octave) {
    const notes = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const semitones = (octave - 4) * 12 + notes[note];
    return 261.63 * Math.pow(2, semitones / 12);
  }

  /* Schedule one square-wave note */
  function schedNote(freq, startTime, duration, vol = 0.18, type = 'square') {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    g.gain.setValueAtTime(vol, startTime + duration * 0.7);
    g.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
    scheduledNotes.push(osc);
    scheduledNotes.push(g);
    return osc;
  }

  /* Schedule a short noise "kick" */
  function schedNoise(startTime, dur = 0.05, vol = 0.12) {
    const bufSize = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 200;
    g.gain.setValueAtTime(vol, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(startTime);
    src.stop(startTime + dur + 0.01);
    scheduledNotes.push(src);
  }

  function scheduleLoop(startTime) {
    if (!musicEnabled || !ctx) return;

    /*  Melody: 32 eighth notes (4 bars × 8 notes)
        C5 E5 G5 E5  F5 A5 C6 A5
        G5 B5 D6 B5  C6 G5 E5 C5
        (repeated) */
    const melody = [
      ['C',5], ['E',5], ['G',5], ['E',5],
      ['F',5], ['A',5], ['C',6], ['A',5],
      ['G',5], ['B',5], ['D',6], ['B',5],
      ['C',6], ['G',5], ['E',5], ['C',5],
      ['C',5], ['E',5], ['G',5], ['E',5],
      ['F',5], ['A',5], ['C',6], ['A',5],
      ['G',5], ['B',5], ['D',6], ['B',5],
      ['C',6], ['G',5], ['E',5], ['C',5],
    ];

    /*  Bass: quarter notes (every 2 eighth notes)
        C3 C3 F3 F3  G3 G3 C3 C3  (×2) */
    const bass = [
      ['C',3],['C',3],['F',3],['F',3],
      ['G',3],['G',3],['C',3],['C',3],
      ['C',3],['C',3],['F',3],['F',3],
      ['G',3],['G',3],['C',3],['C',3],
    ];

    const totalNotes = 32;
    loopDuration = totalNotes * NOTE;

    for (let i = 0; i < totalNotes; i++) {
      const t = startTime + i * NOTE;
      const [note, oct] = melody[i];
      schedNote(noteFreq(note, oct), t, NOTE * 0.85, 0.16);

      /* Bass on every other note */
      if (i % 2 === 0) {
        const [bn, bo] = bass[i / 2];
        schedNote(noteFreq(bn, bo), t, NOTE * 1.7, 0.14, 'sawtooth');
      }

      /* Percussion on beats 1 and 3 of each bar (every 4 notes, offsets 0 and 2) */
      if (i % 4 === 0) schedNoise(t, 0.06, 0.15);
      if (i % 4 === 2) schedNoise(t, 0.04, 0.08);
    }
  }

  function startMusic() {
    if (!musicEnabled) return;
    ensureContext();
    stopMusic();
    loopStartTime = ctx.currentTime + 0.05;
    scheduleLoop(loopStartTime);

    function queueNext() {
      if (!musicEnabled) return;
      const elapsed = ctx.currentTime - loopStartTime;
      const loopsCompleted = Math.floor(elapsed / loopDuration);
      const nextStart = loopStartTime + (loopsCompleted + 1) * loopDuration;
      const timeUntilNext = nextStart - ctx.currentTime;
      scheduleLoop(nextStart);
      loopTimer = setTimeout(queueNext, Math.max((timeUntilNext - 0.5) * 1000, 100));
    }

    loopTimer = setTimeout(queueNext, Math.max((loopDuration - 0.5) * 1000, 100));
  }

  function stopMusic() {
    clearTimeout(loopTimer);
    loopTimer = null;
    scheduledNotes.forEach(n => {
      try { n.stop(0); } catch (_) {}
      try { n.disconnect(); } catch (_) {}
    });
    scheduledNotes = [];
  }

  function setMusicEnabled(val) {
    musicEnabled = val;
    if (!val) stopMusic();
  }

  function setSoundEnabled(val) { soundEnabled = val; }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return { ensureContext, playStopSound, startMusic, stopMusic, setMusicEnabled, setSoundEnabled, resume, _ctx: () => ctx, _master: () => masterGain };
})();


/* ═══════════════════════════════════
   SpeechManager
═══════════════════════════════════ */
const SpeechManager = (() => {
  let voiceEnabled = true;
  let hebrewVoice = null;
  let voicesLoaded = false;

  function findHebrewVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'he-IL' || v.lang === 'he')
        || voices.find(v => v.lang.startsWith('he'))
        || null;
  }

  function init() {
    if (!('speechSynthesis' in window)) return;
    const set = () => {
      hebrewVoice = findHebrewVoice();
      voicesLoaded = true;
    };
    if (speechSynthesis.getVoices().length > 0) {
      set();
    } else {
      speechSynthesis.addEventListener('voiceschanged', set, { once: true });
    }
  }

  function say(text) {
    if (!voiceEnabled) return;
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();

    function makeUtt() {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'he-IL';
      if (hebrewVoice) utt.voice = hebrewVoice;
      utt.rate   = 0.85;
      utt.pitch  = 1.15;
      utt.volume = 1.0;   /* browser max; boosted further by saying twice */
      return utt;
    }

    /* Say it once immediately, then again after a short gap for loudness */
    speechSynthesis.speak(makeUtt());
    const repeat = makeUtt();
    repeat.onstart = null;
    setTimeout(() => speechSynthesis.speak(repeat), 820);
  }

  function setVoiceEnabled(val) { voiceEnabled = val; }

  init();
  return { say, setVoiceEnabled };
})();


/* ═══════════════════════════════════
   CountdownManager
═══════════════════════════════════ */
const CountdownManager = (() => {
  let timer = null;
  let currentCount = 0;
  let onTick = null;
  let onDone = null;

  const el = () => document.getElementById('countdown-display');

  function start(from, tickCb, doneCb) {
    stop();
    currentCount = from;
    onTick = tickCb;
    onDone = doneCb;
    tick();
  }

  function tick() {
    const display = el();
    if (display) {
      /* Re-trigger animation by cloning */
      const clone = display.cloneNode(true);
      clone.textContent = currentCount;
      display.parentNode.replaceChild(clone, display);
    }
    if (onTick) onTick(currentCount);

    if (currentCount <= 0) {
      if (onDone) onDone();
      return;
    }
    currentCount--;
    timer = setTimeout(tick, 1000);
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  return { start, stop };
})();


/* ═══════════════════════════════════
   MotionDetector
═══════════════════════════════════ */
const MotionDetector = (() => {
  let stream = null;
  let video = null;
  let canvas = null;
  let ctx2d = null;
  let prevImageData = null;
  let animFrame = null;
  let active = false;
  let onMotion = null;
  let sensitivity = 5;
  let debounceTimer = null;
  let debouncing = false;
  let warmupFrames = 0;

  const DEBOUNCE_MS = 1200;
  const WARMUP = 8;          /* skip first N frames after detection starts */

  /*
   * Analysis resolution — kept deliberately low for speed, but we request
   * a higher-res stream so the browser captures distant detail before we
   * downsample. Frame comparison works on this canvas size.
   */
  const ANALYSIS_W = 160;
  const ANALYSIS_H = 120;

  /*
   * Per-pixel difference amplification:
   * Even when a player is far away they cause small but consistent brightness
   * shifts across many pixels. We amplify each channel diff with a power
   * curve so faint changes count more, then threshold.
   *
   * sensitivity 1–10:
   *   perPixelMin  50 → 6   (how large a single-channel diff must be)
   *   trigger      0.020 → 0.003  (fraction of pixels that must change)
   */
  function perPixelMin() {
    return Math.round(50 - (sensitivity - 1) * 4.9);   /* 50 … 6 */
  }

  function triggerFraction() {
    return 0.020 - (sensitivity - 1) * 0.00189;        /* 0.020 … 0.003 */
  }

  async function requestCamera() {
    try {
      /* Ask for a higher resolution so distant movement isn't lost */
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
      return true;
    } catch (_) {
      /* Fallback to any available camera */
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        return true;
      } catch (__) {
        return false;
      }
    }
  }

  function attachVideo(videoEl) {
    video = videoEl;
    if (stream && video) {
      video.srcObject = stream;
    }
  }

  function getCanvas() {
    if (!canvas) {
      canvas = document.getElementById('motion-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
      }
      canvas.width  = ANALYSIS_W;
      canvas.height = ANALYSIS_H;
      ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    }
    return canvas;
  }

  function analyseFrame() {
    if (!active || !video || video.readyState < 2) {
      animFrame = requestAnimationFrame(analyseFrame);
      return;
    }

    const c = getCanvas();
    ctx2d.drawImage(video, 0, 0, ANALYSIS_W, ANALYSIS_H);
    const current = ctx2d.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);

    /* Skip warmup frames so the detector doesn't false-fire on scene settle */
    if (warmupFrames < WARMUP) {
      warmupFrames++;
      prevImageData = current;
      animFrame = requestAnimationFrame(analyseFrame);
      return;
    }

    if (prevImageData) {
      let changedPixels = 0;
      const len  = current.data.length;
      const minD = perPixelMin();

      for (let i = 0; i < len; i += 4) {
        const dr = Math.abs(current.data[i]     - prevImageData.data[i]);
        const dg = Math.abs(current.data[i + 1] - prevImageData.data[i + 1]);
        const db = Math.abs(current.data[i + 2] - prevImageData.data[i + 2]);
        /*
         * Count a pixel as "changed" if ANY channel exceeds the minimum,
         * OR if the combined luminance shift is significant.
         * This catches subtle uniform darkening/brightening that happens
         * when a person moves in the background.
         */
        const luma = (dr * 0.299 + dg * 0.587 + db * 0.114);
        if (dr > minD || dg > minD || db > minD || luma > minD * 0.6) {
          changedPixels++;
        }
      }

      const motionLevel = changedPixels / (ANALYSIS_W * ANALYSIS_H);
      const TRIGGER = triggerFraction();

      if (motionLevel > TRIGGER && !debouncing) {
        debouncing = true;
        if (onMotion) onMotion(motionLevel);
        debounceTimer = setTimeout(() => { debouncing = false; }, DEBOUNCE_MS);
      }

      /* Visual indicator on camera preview */
      const indicator = document.getElementById('motion-indicator');
      if (indicator) {
        if (motionLevel > TRIGGER * 0.5) {
          indicator.classList.add('active');
          setTimeout(() => indicator.classList.remove('active'), 180);
        }
      }
    }

    prevImageData = current;
    animFrame = requestAnimationFrame(analyseFrame);
  }

  function startDetecting(motionCallback) {
    active = true;
    onMotion = motionCallback;
    prevImageData = null;
    warmupFrames = 0;
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(analyseFrame);
  }

  function stopDetecting() {
    active = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    prevImageData = null;
    clearTimeout(debounceTimer);
    debouncing = false;
    warmupFrames = 0;
  }

  function setSensitivity(val) { sensitivity = val; }

  function hasStream() { return !!stream; }

  function stop() {
    stopDetecting();
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  return { requestCamera, attachVideo, startDetecting, stopDetecting, setSensitivity, hasStream, stop };
})();


/* ═══════════════════════════════════
   UI
═══════════════════════════════════ */
const UI = (() => {
  const screens = {};

  function init() {
    ['idle', 'music', 'freeze', 'winner', 'caught'].forEach(id => {
      screens[id] = document.getElementById(`screen-${id}`);
    });
  }

  /* Allow GameState to register screens that are created after init */
  function addScreen(id) {
    screens[id] = document.getElementById(`screen-${id}`);
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([id, el]) => {
      if (!el) return;
      if (id === name) el.classList.add('active');
      else             el.classList.remove('active');
    });
  }

  function showMotionFlash() {
    const el = document.getElementById('motion-flash');
    if (!el) return;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 1000);
  }

  function updateCameraPreview(show) {
    const previews = document.querySelectorAll('.camera-preview');
    previews.forEach(p => {
      if (show) p.classList.remove('hidden');
      else p.classList.add('hidden');
    });
  }

  return { init, addScreen, showScreen, showMotionFlash, updateCameraPreview };
})();


/* ═══════════════════════════════════
   GameState  — Central FSM
═══════════════════════════════════ */
const GameState = (() => {
  const STATES = {
    IDLE:   'idle',
    MUSIC:  'musicPhase',
    FREEZE: 'freezePhase',
    WINNER: 'winner',
    CAUGHT: 'caught',
  };

  let state = STATES.IDLE;
  let settings = SettingsStorage.load();
  let musicPhaseTimer = null;
  let roundCount = 0;   /* tracks how many music phases have started */

  /* ── Helpers ─── */
  function randomMusicDuration() {
    /* First round : 1.5–3 s  — freeze happens quickly so kids learn the cue fast
       Second round: 2–5 s    — a bit more suspense
       Third+ rounds: 3–8 s   — full random range */
    if (roundCount === 1) return (1.5 + Math.random() * 1.5) * 1000;
    if (roundCount === 2) return (2   + Math.random() * 3)   * 1000;
    return                       (3   + Math.random() * 5)   * 1000;
  }


  /* ── State transitions ─── */
  function toIdle() {
    state = STATES.IDLE;
    roundCount = 0;
    CountdownManager.stop();
    MotionDetector.stopDetecting();
    AudioManager.stopMusic();
    clearTimeout(musicPhaseTimer);
    UI.showScreen('idle');
  }

  function toMusic() {
    state = STATES.MUSIC;
    roundCount++;
    clearTimeout(musicPhaseTimer);
    MotionDetector.stopDetecting();
    AudioManager.startMusic();
    UI.showScreen('music');

    /* After a random interval the game calls "דג מלוח!" and freezes */
    musicPhaseTimer = setTimeout(() => {
      if (state === STATES.MUSIC) toFreeze();
    }, randomMusicDuration());
  }

  function toFreeze() {
    state = STATES.FREEZE;
    clearTimeout(musicPhaseTimer);
    AudioManager.stopMusic();
    AudioManager.playStopSound();

    /* Voice: "דג מלוח!" after stop sound */
    setTimeout(() => SpeechManager.say('דג מלוח!'), 300);

    UI.showScreen('freeze');

    /* Start AI detection only during freeze */
    if (settings.ai && MotionDetector.hasStream()) {
      const vid = document.getElementById('camera-video-freeze');
      if (vid) MotionDetector.attachVideo(vid);
      MotionDetector.startDetecting(handleMotionDuringFreeze);
    }

    /* Countdown: when it reaches 0 the round resumes */
    CountdownManager.start(5,
      /* onTick */ () => {},
      /* onDone */ () => {
        if (state === STATES.FREEZE) toMusic();
      }
    );
  }

  /*
   * A player physically reached the screen during the MUSIC phase
   * and pressed "הגעתי!" → they win the round.
   */
  function toWinner() {
    if (state !== STATES.MUSIC) return;
    state = STATES.WINNER;
    clearTimeout(musicPhaseTimer);
    MotionDetector.stopDetecting();
    AudioManager.stopMusic();
    playWinSound();
    UI.showScreen('winner');
  }

  /*
   * A player moved during the FREEZE phase → they are caught.
   * reason: optional string shown below the title.
   */
  function toCaught(reason) {
    if (state === STATES.WINNER || state === STATES.CAUGHT) return;
    state = STATES.CAUGHT;
    clearTimeout(musicPhaseTimer);
    CountdownManager.stop();
    MotionDetector.stopDetecting();
    AudioManager.stopMusic();
    AudioManager.playStopSound();

    const reasonEl = document.getElementById('caught-reason');
    if (reasonEl) reasonEl.textContent = reason || '';
    UI.showScreen('caught');
  }

  /* ── Win sound: ascending cheerful 8-bit fanfare ─── */
  function playWinSound() {
    if (!settings.sound) return;
    AudioManager.ensureContext();
    /* Access the internal AudioContext via a tiny helper */
    const ctx = AudioManager._ctx();
    if (!ctx) return;
    const master = AudioManager._master();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.50]; /* C5 E5 G5 C6 */
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      g.gain.setValueAtTime(0.3, now + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
  }

  /* ── Motion callback: only meaningful during freeze ─── */
  function handleMotionDuringFreeze(level) {
    if (state !== STATES.FREEZE) return;
    UI.showMotionFlash();
    setTimeout(() => toCaught('זוהתה תזוזה!'), 600);
  }

  /* ── Settings sync ─── */
  function applySettings() {
    AudioManager.setMusicEnabled(settings.music);
    AudioManager.setSoundEnabled(settings.sound);
    SpeechManager.setVoiceEnabled(settings.voice);
    MotionDetector.setSensitivity(settings.sensitivity);

    const aiSettings = document.getElementById('ai-settings');
    if (aiSettings) {
      if (settings.ai) aiSettings.classList.remove('hidden');
      else aiSettings.classList.add('hidden');
    }

    UI.updateCameraPreview(settings.ai && settings.cameraPreview);
    SettingsStorage.save(settings);
  }

  /* ── Toggle handler ─── */
  function bindToggle(btnId, key, onToggle) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.toggle('active', settings[key]);
    btn.addEventListener('click', () => {
      settings[key] = !settings[key];
      btn.classList.toggle('active', settings[key]);
      if (onToggle) onToggle(settings[key]);
      applySettings();
    });
  }

  /* ── Init ─── */
  function init() {
    UI.init();

    /* Register extra screens */
    UI.addScreen('winner');
    UI.addScreen('caught');

    /* Restore toggle states */
    bindToggle('toggle-music',          'music',         v => { if (!v) AudioManager.stopMusic(); });
    bindToggle('toggle-sound',          'sound',         null);
    bindToggle('toggle-voice',          'voice',         null);
    bindToggle('toggle-ai',             'ai',            null);
    bindToggle('toggle-camera-preview', 'cameraPreview', null);

    /* Sensitivity slider */
    const slider    = document.getElementById('sensitivity-slider');
    const sliderVal = document.getElementById('sensitivity-value');
    if (slider) {
      slider.value = settings.sensitivity;
      if (sliderVal) sliderVal.textContent = settings.sensitivity;
      slider.addEventListener('input', () => {
        settings.sensitivity = parseInt(slider.value, 10);
        if (sliderVal) sliderVal.textContent = settings.sensitivity;
        MotionDetector.setSensitivity(settings.sensitivity);
        SettingsStorage.save(settings);
      });
    }

    /* Camera permission button */
    const cameraBtn = document.getElementById('btn-camera-permission');
    if (cameraBtn) {
      cameraBtn.addEventListener('click', async () => {
        AudioManager.resume();
        const ok = await MotionDetector.requestCamera();
        if (ok) {
          cameraBtn.textContent = '✅ מצלמה מחוברת';
          cameraBtn.disabled = true;
          const vid = document.getElementById('camera-video');
          if (vid) MotionDetector.attachVideo(vid);
        } else {
          cameraBtn.textContent = '❌ לא ניתן לגשת למצלמה';
        }
      });
    }

    /* Start */
    document.getElementById('btn-start').addEventListener('click', () => {
      AudioManager.ensureContext();
      AudioManager.resume();
      toMusic();
    });

    /* "הגעתי!" — player reached the screen during music phase → WIN */
    document.getElementById('btn-reached').addEventListener('click', () => {
      if (state === STATES.MUSIC) toWinner();
    });

    /* Winner screen buttons */
    document.getElementById('btn-play-again-winner').addEventListener('click', () => {
      AudioManager.resume();
      toMusic();
    });

    /* Caught screen buttons */
    document.getElementById('btn-play-again-caught').addEventListener('click', () => {
      AudioManager.resume();
      toMusic();
    });

    /* Fullscreen */
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    applySettings();
    UI.showScreen('idle');
  }

  return { init };
})();


/* ═══════════════════════════════════
   Bootstrap
═══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  GameState.init();
});
