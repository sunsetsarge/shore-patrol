// Camera shake — the ONLY consumer of the shared `game.screenShake` accumulator.
//
// Contract (ADR-002): producers anywhere in the codebase add a scalar amount to
// `game.screenShake` (e.g. bosses.js:314 does `game.screenShake += 0.04`). They
// never call into this module. This module decays that accumulator every tick
// and turns it into a canvas translation during render. Keeping it one-way means
// a producer can be added or removed without touching the render loop.

// Maximum accumulator value. A producer that fires every frame (a "spamming
// producer") would otherwise integrate without bound and lock the screen at
// full deflection forever; clamping here makes the worst case a known quantity.
export const MAX_SHAKE = 1.0;

// Time for the accumulator to fall to half its value, in seconds. Chosen so a
// single 0.04 impulse is visually gone in ~3 half-lives (~0.36s) — a hit "thud",
// not a wobble.
export const HALF_LIFE = 0.12;

// Peak translation in logical pixels at screenShake === MAX_SHAKE. The 1280x720
// logical canvas can absorb this without exposing the background edge.
export const MAX_OFFSET_PX = 12;

// Below this the shake is sub-pixel; snap to 0 so the transform becomes a clean
// no-op instead of jittering forever on a denormal tail.
const EPSILON = 0.001;

const DECAY_PER_SECOND = Math.log(2) / HALF_LIFE;

/**
 * Decay the shared accumulator toward 0 and hold it inside [0, MAX_SHAKE].
 * Safe to call in any game state — shake left over from a boss hit keeps
 * settling while the game is paused or on the game-over screen.
 * @param {Object} game - Game state object containing screenShake property
 * @param {number} dt - Elapsed time in seconds since last frame
 * @returns {void}
 */
export function update(game, dt) {
  const current = game.screenShake || 0;
  if (current <= 0) {
    game.screenShake = 0;
    return;
  }
  const clamped = Math.min(current, MAX_SHAKE);
  const next = clamped * Math.exp(-DECAY_PER_SECOND * dt);
  game.screenShake = next < EPSILON ? 0 : next;
}

// Deterministic pseudo-random offset: two out-of-phase sine stacks driven by
// game.time. Using the clock rather than Math.random keeps a screenshot-based
// verification run reproducible under debugStep(), while the irrational-ish
// frequency ratios stop the motion from reading as a regular oscillation.
/**
 * @param {Object} game - Game state object containing screenShake and time properties
 * @returns {{dx: number, dy: number} | null} Offset pair if shake is active, null if amplitude <= 0
 */
function computeShakeOffset(game) {
  const amplitude = Math.min(game.screenShake || 0, MAX_SHAKE) * MAX_OFFSET_PX;
  if (amplitude <= 0) return null;
  const gameTime = game.time || 0;
  const dx = (Math.sin(gameTime * 97.3) * 0.6 + Math.sin(gameTime * 41.7) * 0.4) * amplitude;
  const dy = (Math.cos(gameTime * 88.1) * 0.6 + Math.cos(gameTime * 53.9) * 0.4) * amplitude;
  return { dx, dy };
}

/**
 * Push a transform that offsets the frame by the current shake. ALWAYS pairs
 * with restore() — it saves the context unconditionally, even at zero shake, so
 * callers never have to branch and an outer transform (e.g. a DPR scale) can
 * safely nest around this pair.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} game - Game state object containing screenShake and time properties
 * @returns {void}
 */
export function apply(ctx, game) {
  ctx.save();
  const offset = computeShakeOffset(game);
  if (offset) ctx.translate(offset.dx, offset.dy);
}

/**
 * Pop the transform pushed by apply().
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @returns {void}
 */
export function restore(ctx) {
  ctx.restore();
}
