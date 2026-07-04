// Domain-agnostic collision/hit-testing helpers. Operates purely on projected
// screen-space coordinates or generic world-space distances — never on
// specific entity types or ids.

/**
 * Test whether a screen-space point lies within a circular hitbox.
 * @param {number} px point x (screen)
 * @param {number} py point y (screen)
 * @param {number} cx circle center x (screen)
 * @param {number} cy circle center y (screen)
 * @param {number} radius circle radius (already scaled)
 */
export function pointInCircle(px, py, cx, cy, radius) {
  const dx = px - cx;
  const dy = py - cy;
  return (dx * dx + dy * dy) <= radius * radius;
}

/**
 * Screen-space distance between two points.
 */
export function screenDistance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * World-space weighted "splash" distance test used for ballistic explosions.
 * Weighted so lateral (x) and depth (d) differences are comparable in the
 * same world-unit space that splashRadius is authored in.
 */
export function worldSplashDistance(ax, ad, bx, bd) {
  const dx = Math.abs(ax - bx) * 640;
  const dd = Math.abs(ad - bd) * 900;
  return dx + dd;
}

export function withinSplash(ax, ad, bx, bd, splashRadius) {
  return worldSplashDistance(ax, ad, bx, bd) <= splashRadius;
}
