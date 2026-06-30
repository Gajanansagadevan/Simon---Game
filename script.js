/* ============================================================
   SIMON SAYS — script.js
   Complete game logic, audio, UI, animations
   ============================================================ */

'use strict';

/* ── 1. Constants & Config ────────────────────────────────── */

const COLOURS = ['green', 'red', 'yellow', 'blue'];

// Frequency (Hz) for each button's tone
const TONE_FREQ = {
  green:  415.30,   // Ab4
  red:    311.13,   // Eb4
  yellow: 252.00,   // B3
  blue:   209.00,   // Ab3
};

/* Game Configuration */

const LS_KEY = "simon_best_score";

const DIFFICULTY = {
  normal: {
    flashMs: 600,
    gapMs: 250
  }
};

const state = {
  simonSeq: [],
  playerSeq: [],
  level: 0,
  score: 0,
  best: 0,
  phase: "idle",
  mode: "normal",
  soundEnabled: true
};


/* ── 3. DOM References ────────────────────────────────────── */

const els = {
  hudLevel:       document.getElementById('hud-level'),
  hudBest:        document.getElementById('hud-best'),
  hubScore:       document.getElementById('hub-score'),
  progressFill:   document.getElementById('progress-fill'),
  resultOverlay:  document.getElementById('result-overlay'),
  resultEmoji:    document.getElementById('result-emoji'),
  resultHeading:  document.getElementById('result-heading'),
  resultSub:      document.getElementById('result-sub'),
  resultLevel:    document.getElementById('result-level'),
  resultBestLine: document.getElementById('result-best-line'),
  btnStart:       document.getElementById('btn-start'),
  btnRestart:     document.getElementById('btn-restart'),
  btnSound:       document.getElementById('btn-sound'),
  confetti:       document.getElementById('confetti-container'),
  appWrapper:     document.querySelector('.app-wrapper'),
  simonBtns:      {
    green:  document.getElementById('btn-green'),
    red:    document.getElementById('btn-red'),
    yellow: document.getElementById('btn-yellow'),
    blue:   document.getElementById('btn-blue'),
  },
};


/* ── 4. Web Audio API ─────────────────────────────────────── */

let audioCtx = null;

/** Lazily create AudioContext (browsers require user gesture first) */
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Play a pure sine-wave tone at `freq` Hz for `duration` ms.
 * @param {number} freq      - frequency in Hz
 * @param {number} duration  - note length in ms
 * @param {'sine'|'square'|'sawtooth'} type - oscillator waveshape
 * @param {number} [gain=0.4] - volume 0–1
 */
function playTone(freq, duration, type = 'sine', gain = 0.4) {
  if (!state.soundEnabled) return;
  const ctx = getAudioCtx();

  const osc  = ctx.createOscillator();
  const vol  = ctx.createGain();

  osc.type      = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  // Smooth attack + decay envelope to avoid clicks
  vol.gain.setValueAtTime(0, ctx.currentTime);
  vol.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration / 1000 + 0.05);
}

/** Play the tone mapped to a Simon colour */
function playColourSound(colour, duration) {
  playTone(TONE_FREQ[colour], duration ?? DIFFICULTY[state.mode].flashMs * 0.9, 'sine', 0.4);
}

/** Short descending two-note "wrong" sound */
function playWrongSound() {
  if (!state.soundEnabled) return;
  playTone(180, 300, 'sawtooth', 0.35);
  setTimeout(() => playTone(120, 500, 'sawtooth', 0.4), 180);
}

/** Ascending arpeggio for level-up / success */
function playSuccessSound() {
  if (!state.soundEnabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
  notes.forEach((f, i) => setTimeout(() => playTone(f, 180, 'sine', 0.35), i * 100));
}

/** Fanfare for new high score */
function playHighScoreSound() {
  if (!state.soundEnabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
  notes.forEach((f, i) => setTimeout(() => playTone(f, 220, 'triangle', 0.4), i * 110));
}

/** Countdown beep */
function playBeep(freq = 880) {
  playTone(freq, 120, 'sine', 0.25);
}


/* ── 6. Utility Helpers ───────────────────────────────────── */

/** Return a promise that resolves after `ms` milliseconds */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Pick a random element from an array */
const randomOf = arr => arr[Math.floor(Math.random() * arr.length)];

/** Animate the hub score with a pop */
function updateScore(value) {
  state.score = value;
  els.hubScore.textContent = value;
  els.hubScore.classList.remove('pop');
  // Force reflow so the animation restarts
  void els.hubScore.offsetWidth;
  els.hubScore.classList.add('pop');
}

/** Pulse a HUD value element */
function pulseHud(el, value) {
  el.textContent = value;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

/** Update the progress bar (0–100%) */
function setProgress(pct) {
  els.progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  els.progressFill.parentElement.setAttribute('aria-valuenow', Math.round(pct));
}

/** Enable / disable all Simon buttons */
function setButtonsEnabled(enabled) {
  COLOURS.forEach(c => {
    els.simonBtns[c].disabled = !enabled;
  });
}

/** Load best score from localStorage */
function loadBest() {
  state.best = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10) || 0;
  els.hudBest.textContent = state.best;
}

/** Persist best score if beaten */
function maybeSaveBest() {
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(LS_KEY, state.best);
    els.hudBest.textContent = state.best;
    return true; // new high score
  }
  return false;
}


/* ── 7. Confetti ──────────────────────────────────────────── */

const CONFETTI_COLOURS = [
  '#00ff88', '#ff2255', '#ffe600', '#00aaff',
  '#ff88ee', '#aaffcc', '#ffcc00', '#88eeff',
];

function launchConfetti(count = 80) {
  els.confetti.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${randomOf(CONFETTI_COLOURS)};
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.6}s;
    `;
    els.confetti.appendChild(piece);
  }
  // Clean up after animation
  setTimeout(() => { els.confetti.innerHTML = ''; }, 3500);
}


/* ── 8. Screen Shake ──────────────────────────────────────── */

function triggerShake() {
  els.appWrapper.classList.remove('shake');
  void els.appWrapper.offsetWidth;
  els.appWrapper.classList.add('shake');
  setTimeout(() => els.appWrapper.classList.remove('shake'), 650);
}


/* ── 9. Button Flash (Simon playback) ─────────────────────── */

/**
 * Light up one Simon button for `duration` ms.
 * Returns a promise that resolves when the flash is done.
 */
function flashButton(colour, duration) {
  return new Promise(resolve => {
    const btn = els.simonBtns[colour];
    playColourSound(colour, duration);
    btn.classList.add('flash');
    setTimeout(() => {
      btn.classList.remove('flash');
      resolve();
    }, duration);
  });
}


/* ── 11. Simon Sequence Playback ──────────────────────────── */

/**
 * Play the entire current simonSeq back to the player,
 * honouring the active difficulty speed settings.
 */
async function playSequence() {
  setButtonsEnabled(false);
  state.phase = 'playback';

  const { flashMs, gapMs } = DIFFICULTY[state.mode];

  for (const colour of state.simonSeq) {
    await flashButton(colour, flashMs);
    await wait(gapMs);
  }

  setButtonsEnabled(true);
  state.phase = 'input';
  state.playerSeq = [];
}


/* ── 12. Round Management ─────────────────────────────────── */

/** Extend the sequence by one random colour and play it back. */
async function nextRound() {
  state.level++;
  pulseHud(els.hudLevel, state.level);
  setProgress(0);

  // Add one new random colour
  state.simonSeq.push(randomOf(COLOURS));

  // Brief pause before playback
  await wait(600);
  await playSequence();
}


/* ── 13. Player Input Handling ────────────────────────────── */

/**
 * Called when the player taps/clicks/keys a colour.
 * Validates against the current position in simonSeq.
 */
async function handlePlayerInput(colour) {
  if (state.phase !== 'input') return;

  const btn = els.simonBtns[colour];

  // Visual + audio feedback
  btn.classList.add('pressed');
  playColourSound(colour, 180);
  setTimeout(() => btn.classList.remove('pressed'), 180);

  // Record input
  state.playerSeq.push(colour);
  const idx = state.playerSeq.length - 1;

  // Update progress bar
  setProgress((state.playerSeq.length / state.simonSeq.length) * 100);

  // ── Wrong input ──
  if (state.playerSeq[idx] !== state.simonSeq[idx]) {
    await handleGameOver();
    return;
  }

  // ── Correct so far ──
  updateScore(state.score + state.level);

  // If the player completed the full sequence this round
  if (state.playerSeq.length === state.simonSeq.length) {
    state.phase = 'idle'; // lock out further input
    setButtonsEnabled(false);
    playSuccessSound();
    launchConfetti(60);
    await wait(1000);
    await nextRound();
  }
}


/* ── 14. Game Over ────────────────────────────────────────── */

async function handleGameOver() {
  state.phase = 'gameover';
  setButtonsEnabled(false);

  playWrongSound();
  triggerShake();
  document.body.classList.add('game-over');
  setTimeout(() => document.body.classList.remove('game-over'), 600);

  await wait(700);

  const isNewBest = maybeSaveBest();
  if (isNewBest) playHighScoreSound();

  // Populate result overlay
  els.resultEmoji.textContent   = state.level <= 3 ? '😬' : state.level <= 8 ? '😅' : '💀';
  els.resultHeading.textContent = 'Game Over';
  els.resultLevel.textContent   = `Level ${state.level} (score ${state.score})`;
  els.resultBestLine.hidden     = !isNewBest;
  els.resultOverlay.hidden      = false;

  els.btnRestart.disabled = false;
}


/* ── 15. Start / Restart ──────────────────────────────────── */

async function startGame() {
  // Reset state
  state.simonSeq  = [];
  state.playerSeq = [];
  state.level     = 0;
  state.score     = 0;
  state.phase     = 'countdown';

  // Reset UI
  els.resultOverlay.hidden = true;
  setProgress(0);
  updateScore(0);
  pulseHud(els.hudLevel, 0);
  setButtonsEnabled(false);

  els.btnStart.textContent   = 'Playing…';
  els.btnStart.disabled      = true;
  els.btnRestart.disabled    = false;

  //await runCountdown();
  await nextRound();
}

function restartGame() {
  if (state.phase === 'countdown' || state.phase === 'playback') return;
  startGame();
}

/* ── 17. Sound Toggle ─────────────────────────────────────── */

els.btnSound.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  els.btnSound.setAttribute('aria-pressed', String(state.soundEnabled));
  // CSS handles icon swap via aria-pressed selector
});


/* ── 18. Start / Restart Button Listeners ─────────────────── */

els.btnStart.addEventListener('click', () => {
  if (state.phase === 'idle' || state.phase === 'gameover') startGame();
});

els.btnRestart.addEventListener('click', restartGame);

// Result overlay buttons
document.getElementById('btn-play-again').addEventListener('click', startGame);
document.getElementById('btn-menu').addEventListener('click', () => {
  els.resultOverlay.hidden = true;
  state.phase = 'idle';
  els.btnStart.textContent = 'Start';
  els.btnStart.disabled    = false;
  setButtonsEnabled(false);
});


/* ── 19. Simon Button Click Listeners ─────────────────────── */

COLOURS.forEach(colour => {
  els.simonBtns[colour].addEventListener('click', () => {
    handlePlayerInput(colour);
  });
});


/* ── 20. Keyboard Controls ────────────────────────────────── */

const KEY_MAP = {
  q: 'green',
  w: 'red',
  a: 'yellow',
  s: 'blue',
};

document.addEventListener('keydown', e => {
  // Prevent repeat fires when key is held
  if (e.repeat) return;

  const colour = KEY_MAP[e.key.toLowerCase()];
  if (colour && state.phase === 'input') {
    handlePlayerInput(colour);
    return;
  }

  // Space / Enter to start
  if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('button')) {
    if (state.phase === 'idle' || state.phase === 'gameover') startGame();
  }
});


/* ── 21. Touch / Mobile Support ───────────────────────────── */

// Prevent double-fire from touch → click on mobile
COLOURS.forEach(colour => {
  const btn = els.simonBtns[colour];
  btn.addEventListener('touchstart', e => {
    e.preventDefault(); // blocks the subsequent click event
    handlePlayerInput(colour);
  }, { passive: false });
});


/* ── 22. Initialise ───────────────────────────────────────── */

(function init() {
  loadBest();
  setButtonsEnabled(false);
  els.btnRestart.disabled = true;

  // Show idle score
  els.hubScore.textContent = '0';
  els.hudLevel.textContent = '0';
})();