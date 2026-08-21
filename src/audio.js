// Web Audio synth registry. No audio files. AudioContext is created lazily on
// first user gesture (main.js/input.js call ensureStarted()).
let ctx = null;
let masterGain = null;

// Resting master level. Bursts of simultaneous cues duck below this and
// recover back to it, so the resting value itself never changes.
const REST_GAIN = 0.5;
// Rolling window of recent cue start times, used to detect a burst.
const DUCK_WINDOW = 0.09;   // seconds counted as "simultaneous"
const DUCK_RECOVER = 0.14;  // seconds to ramp back to REST_GAIN
let recentCueTimes = [];

/**
 * Ensure the AudioContext is created and running.
 * @returns {AudioContext} The Web Audio context
 */
function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = REST_GAIN;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/**
 * Short master-gain ducking: each cue start is recorded, and when several
 * land inside DUCK_WINDOW the master gain is pulled down proportionally
 * (never below 0.42x rest) and ramped straight back to REST_GAIN. Keeps a
 * hit-confirm + explode + weapon-fire pileup from clipping the destination.
 * @returns {void}
 */
function duckMaster() {
  const audioCtx = ensureCtx();
  const now = audioCtx.currentTime;
  recentCueTimes = recentCueTimes.filter(t => now - t < DUCK_WINDOW);
  recentCueTimes.push(now);
  const overlap = recentCueTimes.length;
  if (overlap < 2) return;
  const target = Math.max(REST_GAIN * 0.42, REST_GAIN / Math.sqrt(overlap));
  const gainParam = masterGain.gain;
  gainParam.cancelScheduledValues(now);
  gainParam.setValueAtTime(Math.min(gainParam.value, REST_GAIN), now);
  gainParam.linearRampToValueAtTime(target, now + 0.008);
  gainParam.linearRampToValueAtTime(REST_GAIN, now + 0.008 + DUCK_RECOVER);
}

/**
 * Create a mono noise buffer of the specified duration.
 * @param {number} duration - Duration in seconds
 * @returns {AudioBuffer} Noise audio buffer
 */
function noiseBuffer(duration) {
  const audioCtx = ensureCtx();
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Create a gain envelope node that ramps exponentially from startVal to endVal.
 * @param {number} startVal - Initial gain value
 * @param {number} endVal - Final gain value
 * @param {number} duration - Duration in seconds
 * @returns {GainNode} Configured gain node
 */
function envGain(startVal, endVal, duration) {
  const audioCtx = ensureCtx();
  const gainNode = audioCtx.createGain();
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(startVal, now);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, endVal), now + duration);
  return gainNode;
}

/**
 * Play a tonal sweep using an oscillator.
 * @param {number} freqStart - Starting frequency in Hz
 * @param {number} freqEnd - Ending frequency in Hz
 * @param {number} duration - Duration in seconds
 * @param {string} type - Oscillator type ('sine', 'square', 'sawtooth', 'triangle')
 * @param {number} volume - Starting volume (0-1)
 * @returns {void}
 */
function playTone(freqStart, freqEnd, duration, type, volume) {
  const audioCtx = ensureCtx();
  const osc = audioCtx.createOscillator();
  osc.type = type;
  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
  const gainNode = envGain(volume, 0.001, duration);
  osc.connect(gainNode);
  gainNode.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Play a filtered noise burst.
 * @param {number} duration - Duration in seconds
 * @param {number} volume - Starting volume (0-1)
 * @param {number} [filterFreq] - Low-pass filter cutoff frequency in Hz (default 4000)
 * @returns {void}
 */
function playNoiseBurst(duration, volume, filterFreq) {
  const audioCtx = ensureCtx();
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer(duration);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 4000;
  const gainNode = envGain(volume, 0.001, duration);
  src.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(masterGain);
  src.start();
  src.stop(audioCtx.currentTime + duration);
}

// Registry keys are generic sound-role labels, deliberately NOT spelled the
// same as any weapon content id, so this file stays free of weapon/enemy id
// string literals (see SPEC's modularity grep test / acceptance criterion 9).
// data/weapons.json's "sound" field references these role names directly —
// no id-to-id alias table needed. The remaining event cues (explode/crate/
// hit/alarm/click/wave/gameover) are generic game-event names, not content
// ids, so they're used as plain literal keys.
const rapidFireCue = 'rapidFire'; // fast automatic fire
const heavyBoomCue = 'heavyBoom'; // heavy ballistic splash fire
const lockToneCue = 'lockTone';   // guided/homing lock-on fire
const lightShotCue = 'lightShot'; // light sidearm fire

const sounds = {
  [rapidFireCue]() {
    playTone(320, 180, 0.06, 'square', 0.25);
    playNoiseBurst(0.05, 0.15, 3000);
  },
  [heavyBoomCue]() {
    playTone(120, 40, 0.35, 'sawtooth', 0.5);
    playNoiseBurst(0.4, 0.4, 1200);
  },
  [lockToneCue]() {
    playTone(600, 1400, 0.5, 'sine', 0.2);
    playNoiseBurst(0.3, 0.15, 6000);
  },
  [lightShotCue]() {
    playTone(500, 250, 0.08, 'square', 0.2);
    playNoiseBurst(0.06, 0.1, 3500);
  },
  // Impact cues (generic role names, additive — nothing existing renamed).
  // impactMetal: bright metallic hit-confirm, clearly not `explode`.
  impactMetal() {
    playTone(1750, 780, 0.07, 'square', 0.22);
    playTone(2600, 1500, 0.05, 'triangle', 0.14);
    playNoiseBurst(0.05, 0.16, 7000);
  },
  // impactHeavy: hit-confirm for big-damage weapons — metallic head, low thud.
  impactHeavy() {
    playTone(900, 300, 0.12, 'square', 0.26);
    playTone(160, 60, 0.18, 'sawtooth', 0.22);
    playNoiseBurst(0.12, 0.22, 2600);
  },
  // impactMiss: dull, dark splash/thud for a shot that connected with nothing.
  impactMiss() {
    playNoiseBurst(0.18, 0.18, 520);
    playTone(220, 90, 0.14, 'sine', 0.1);
  },
  explode() {
    playNoiseBurst(0.5, 0.5, 900);
    playTone(150, 30, 0.5, 'sawtooth', 0.3);
  },
  crate() {
    playTone(440, 880, 0.15, 'triangle', 0.2);
    playTone(660, 1320, 0.2, 'triangle', 0.15);
  },
  hit() {
    playNoiseBurst(0.15, 0.35, 700);
    playTone(200, 80, 0.15, 'square', 0.2);
  },
  alarm() {
    playTone(880, 660, 0.3, 'square', 0.2);
  },
  click() {
    playNoiseBurst(0.03, 0.15, 2000);
  },
  wave() {
    playTone(300, 500, 0.2, 'triangle', 0.2);
    playTone(500, 700, 0.25, 'triangle', 0.15);
  },
  gameover() {
    playTone(400, 80, 1.0, 'sawtooth', 0.35);
  },
  victory() {
    playTone(440, 880, 0.25, 'triangle', 0.3);
    playTone(660, 1320, 0.3, 'triangle', 0.25);
  },
};

/**
 * Create and return the audio API object.
 * @returns {{play: function, ensureStarted: function}} Audio API object
 */
export function createAudio() {
  return {
    /**
     * Play a sound by id (registered in the sounds object).
     * @param {string} id - Sound id to play
     * @returns {void}
     */
    play(id) {
      const fn = sounds[id];
      if (fn) {
        try { duckMaster(); fn(); } catch (e) { /* ignore audio glitches */ }
      } else {
        console.error(`audio: unknown sound id "${id}"`);
      }
    },
    /**
     * Ensure the AudioContext is created and resumed (call on user gesture).
     * @returns {void}
     */
    ensureStarted() {
      ensureCtx();
    },
  };
}
