// Kill/crate points, streak multiplier (+0.1/kill, max x3, reset on base
// damage), decaying kill-combo window, per-wave completion bonus, and
// localStorage best score separate from run score.
const BEST_KEY = 'beachhead.best';

// Seconds a kill keeps the combo alive. Research note: under ~2s players feel
// cheated by a window that expires between legitimate targets, over ~5s the
// combo never drops and stops reading as a skill signal. 2.5s sits in the
// band where a steady stream of kills sustains it but a lull breaks it.
const COMBO_WINDOW = 2.5;
// Each combo step past the first adds this much to the kill payout multiplier.
const COMBO_BONUS_PER_HIT = 0.05;
// Cap on the combo bonus so a long chain cannot dwarf every other score source.
const COMBO_BONUS_MAX = 1.5;
// Points granted per wave cleared, scaled by the wave number.
const WAVE_BONUS_BASE = 250;
// How long the WAVE BONUS flash stays on the HUD, in seconds.
const WAVE_BONUS_FLASH = 2.5;

/**
 * Initialize scoring state and the scoreApi callback object.
 * @param {Object} game - Game state object to initialize
 * @returns {void}
 */
export function init(game) {
  game.score = 0;
  game.streak = 1.0;
  game.bestScore = loadBest();

  // Published for the HUD to read (see task 8). Do not rename.
  game.combo = 0;
  game.comboTimer = 0;
  game.comboMax = 0;
  game.lastWaveBonus = 0;
  // Integrator: HUD reads these two (hud.js:183 comboWindow, hud.js:201 timer).
  game.comboWindow = COMBO_WINDOW;
  game.lastWaveBonusTimer = 0;

  game.scoreApi = {
    onKill(baseValue) {
      game.combo = (game.combo || 0) + 1;
      game.comboTimer = COMBO_WINDOW;
      if (game.combo > (game.comboMax || 0)) game.comboMax = game.combo;

      const comboBonus = Math.min(
        COMBO_BONUS_MAX,
        (game.combo - 1) * COMBO_BONUS_PER_HIT
      );
      const points = Math.round(baseValue * game.streak * (1 + comboBonus));
      game.score += points;
      game.streak = Math.min(3.0, game.streak + 0.1);
    },
    onCrateCollected(baseValue) {
      const points = Math.round(baseValue * game.streak);
      game.score += points;
    },
    onBaseDamage() {
      game.streak = 1.0;
    },
    onWaveComplete(waveIndex, stats) {
      const normalizedWaveIndex = Number.isFinite(waveIndex) ? Math.max(0, waveIndex) : 0;
      const waveStats = stats || {};
      // Perfect waves (no base damage taken) pay double.
      const perfect = waveStats.baseDamageTaken === 0 || waveStats.perfect === true;
      let bonus = Math.round(WAVE_BONUS_BASE * (1 + normalizedWaveIndex * 0.25));
      if (perfect) bonus *= 2;
      game.lastWaveBonus = bonus;
      game.lastWaveBonusTimer = WAVE_BONUS_FLASH;
      game.score += bonus;
      return bonus;
    },
  };
}

/**
 * Load the best score from localStorage.
 * @returns {number} Best score, or 0 if not found or on error
 */
export function loadBest() {
  try {
    const storageValue = localStorage.getItem(BEST_KEY);
    return storageValue ? parseInt(storageValue, 10) || 0 : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Update localStorage with a new best score if the provided score is higher.
 * @param {number} score - Current score to compare
 * @returns {number} The best score (either new or existing)
 */
export function saveBestIfHigher(score) {
  try {
    const best = loadBest();
    if (score > best) {
      localStorage.setItem(BEST_KEY, String(score));
      return score;
    }
    return best;
  } catch (e) {
    return score;
  }
}

/**
 * Decay the combo window and wave bonus display timer each frame.
 * @param {Object} game - Game state object with combo and wave bonus timers
 * @param {number} dt - Elapsed time in seconds since last frame
 * @returns {void}
 */
export function update(game, dt) {
  // Decay the combo window; when it lapses the chain is over.
  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      game.combo = 0;
    }
  }
  if (game.lastWaveBonusTimer > 0) {
    game.lastWaveBonusTimer -= dt;
    if (game.lastWaveBonusTimer <= 0) {
      game.lastWaveBonusTimer = 0;
      game.lastWaveBonus = 0;
    }
  }
}
