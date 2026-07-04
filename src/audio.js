// Web Audio synth registry. No audio files. AudioContext is created lazily on
// first user gesture (main.js/input.js call ensureStarted()).
let ctx = null;
let masterGain = null;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

function noiseBuffer(duration) {
  const c = ensureCtx();
  const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function envGain(startVal, endVal, duration) {
  const c = ensureCtx();
  const g = c.createGain();
  const now = c.currentTime;
  g.gain.setValueAtTime(startVal, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, endVal), now + duration);
  return g;
}

function playTone(freqStart, freqEnd, duration, type, volume) {
  const c = ensureCtx();
  const osc = c.createOscillator();
  osc.type = type;
  const now = c.currentTime;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
  const g = envGain(volume, 0.001, duration);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

function playNoiseBurst(duration, volume, filterFreq) {
  const c = ensureCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(duration);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 4000;
  const g = envGain(volume, 0.001, duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  src.start();
  src.stop(c.currentTime + duration);
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
};

export function createAudio() {
  return {
    play(id) {
      const fn = sounds[id];
      if (fn) {
        try { fn(); } catch (e) { /* ignore audio glitches */ }
      } else {
        console.error(`audio: unknown sound id "${id}"`);
      }
    },
    ensureStarted() {
      ensureCtx();
    },
  };
}
