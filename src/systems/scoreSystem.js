// Kill/crate points, streak multiplier (+0.1/kill, max x3, reset on base
// damage), localStorage best score separate from run score.
const BEST_KEY = 'beachhead.best';

export function init(game) {
  game.score = 0;
  game.streak = 1.0;
  game.bestScore = loadBest();

  game.scoreApi = {
    onKill(baseValue) {
      const points = Math.round(baseValue * game.streak);
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
  };
}

export function loadBest() {
  try {
    const v = localStorage.getItem(BEST_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch (e) {
    return 0;
  }
}

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

export function update(game, dt) {
  // no per-frame logic needed; hooks fire from scoreApi callbacks
}
