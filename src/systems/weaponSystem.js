// Reads weapons.json-derived defs. fireModeHandlers registry dispatches on
// the `fireMode` schema field — no weapon id branching anywhere in this file.
import { project, unprojectD, unprojectX, resolveSpritePath, clamp01, CONSTANTS } from '../engine/renderer.js';
import { screenDistance, withinSplash } from '../engine/collision.js';
import * as Turret from '../engine/turret.js';
import * as Sprites from '../engine/sprites.js';

let weaponDefs = [];

/**
 * Initialize the weapon system with loaded weapon definitions.
 * @param {Object} game - Game state object to initialize
 * @param {Object} data - Loaded game data containing weapons definitions
 * @returns {void}
 */
export function init(game, data) {
  weaponDefs = data.weapons.weapons;
  game.turret = Turret.createTurret(weaponDefs);
  game.projectiles = [];
  game.effects = []; // { kind:'muzzle'|'explosion'|'tracer', ...}
}

function domainForEnemy(entity) {
  return entity.type.domain;
}

const HIT_PAD = 6;

// pointHitsSprite: same draw geometry as renderer.drawEntityGlyph /
// renderer.drawCrate — bottom-anchored rect for land/sea, center-anchored
// for air, height = hitbox*2.4*scale*spriteScale, width from the loaded
// image's aspect ratio. `domain` null/undefined is treated as non-air
// (bottom-anchored), matching drawEntityGlyph's `domain === 'air'` check.
// FIX 3: entityD allows sea hitbox to mirror renderer.js's depth-varying
// seaAnchor formula exactly: lerp(-0.2, 0.55, 1 - d01sea).
// Without this, hitboxes near the horizon were far above the visible hull.
function pointHitsSprite(px, py, sx, sy, scale, hitbox, spriteScale, domain, img, entityD) {
  const drawH = hitbox * 2.4 * scale * (spriteScale || 1);
  const drawW = drawH * (img.naturalWidth / img.naturalHeight);
  let top, bottom;
  if (domain === 'air') {
    top = sy - drawH / 2;
    bottom = sy + drawH / 2;
  } else if (domain === 'sea') {
    // Match renderer.js sea anchor: lerp(-0.2, 0.55, 1 - d01sea)
    // At d=0 (shore): seaAnchor=0.55  → sprite straddles waterline correctly
    // At d=1 (horizon): seaAnchor=-0.2 → sprite drawn below sy, hull in water
    const d01sea = clamp01(entityD || 0);
    const seaAnchor = -0.2 + 0.75 * (1 - d01sea);
    top    = sy - drawH * seaAnchor;
    bottom = top + drawH;
  } else {
    top = sy - drawH;
    bottom = sy;
  }
  const left = sx - drawW / 2;
  const right = sx + drawW / 2;
  return px >= left - HIT_PAD && px <= right + HIT_PAD &&
    py >= top - HIT_PAD && py <= bottom + HIT_PAD;
}

// pointHitsCrateSprite: crate draw height is 90*scale*spriteScale (renderer.drawCrate),
// always bottom-anchored.
function pointHitsCrateSprite(px, py, sx, sy, scale, spriteScale, img) {
  const drawH = 90 * scale * (spriteScale || 1);
  const drawW = drawH * (img.naturalWidth / img.naturalHeight);
  const top = sy - drawH;
  const bottom = sy;
  const left = sx - drawW / 2;
  const right = sx + drawW / 2;
  return px >= left - HIT_PAD && px <= right + HIT_PAD &&
    py >= top - HIT_PAD && py <= bottom + HIT_PAD;
}

function projectedHitTest(game, weapon, screenX, screenY) {
  // Return nearest-d target among live enemies whose domain is targetable and
  // whose projected hit area (sprite rect if loaded, else fallback circle)
  // contains the screen point.
  let best = null;
  let bestD = Infinity;
  for (const e of game.entities) {
    if (e.dead || e.dying || e.kind !== 'enemy') continue;
    const domain = domainForEnemy(e);
    if (!weapon.targetDomains.includes(domain)) continue;
    const { sx, sy, scale } = project(e.x, e.d, e.alt, domain);
    const spritePath = resolveSpritePath(e.type.sprite, e.type.spriteFps, e.age);
    const img = spritePath ? Sprites.get(spritePath) : null;
    let hit;
    if (img) {
      hit = pointHitsSprite(screenX, screenY, sx, sy, scale, e.type.hitbox, e.type.spriteScale, domain, img, e.d);
    } else {
      // fallback circle: centered at (sy - hitbox*scale) for land/sea, current
      // (center-anchored) behavior for air.
      const r = e.type.hitbox * scale;
      const cy = domain === 'air' ? sy : sy - e.type.hitbox * scale;
      hit = screenDistance(screenX, screenY, sx, cy) <= r;
    }
    if (hit && e.d < bestD) { bestD = e.d; best = e; }
  }
  // also test crates if targetable
  if (weapon.targetDomains.includes('crate')) {
    for (const c of game.crates) {
      if (c.dead) continue;
      const { sx, sy, scale } = project(c.x, 0, c.alt, 'air');
      const spritePath = resolveSpritePath(c.type && c.type.sprite, c.type && c.type.spriteFps, c.age);
      const img = spritePath ? Sprites.get(spritePath) : null;
      let hit;
      if (img) {
        hit = pointHitsCrateSprite(screenX, screenY, sx, sy, scale, c.type && c.type.spriteScale, img);
      } else {
        const r = 20 * scale;
        hit = screenDistance(screenX, screenY, sx, sy) <= r;
      }
      if (hit && 0 < bestD) { bestD = 0; best = c; }
    }
  }
  // Boss hit test (registered by Bosses.init via game.bossHitCallback)
  if (!best && game.bossHitCallback) {
    const bossHit = game.bossHitCallback(weapon, screenX, screenY);
    if (bossHit) best = bossHit;
  }
  return best;
}

function applyDamage(game, target, damage) {
  if (!target || target.dead || target.dying) return;
  target.hp -= damage;
  if (target.hp <= 0) {
    target.killedByPlayer = true;
    // Entities (enemies only — crates have no deathSprite) with a deathSprite
    // def enter a `dying` state instead of immediate removal: they linger,
    // play a one-shot death animation, then get removed by spawnSystem. Score/
    // streak/effects still fire at this exact moment via the killMoment flag,
    // processed once by spawnSystem regardless of how long the corpse lingers.
    if (target.type && target.type.deathSprite) {
      target.dying = true;
      target.deathAge = 0;
      target.killMoment = true;
    } else {
      target.dead = true;
      target.killMoment = true;
    }
  }
}

function splashDamage(game, weapon, worldX, worldD) {
  for (const e of game.entities) {
    if (e.dead || e.dying || e.kind !== 'enemy') continue;
    if (!weapon.targetDomains.includes(domainForEnemy(e))) continue;
    if (withinSplash(worldX, worldD, e.x, e.d, weapon.splashRadius)) {
      applyDamage(game, e, weapon.damage);
    } else if (domainForEnemy(e) === 'sea' &&
               Math.abs(worldX - e.x) * 640 <= weapon.splashRadius) {
      // X-only fallback: clicking the upper silhouette of a sea entity unprojects
      // to a depth shallower than the hull, so Manhattan dd >> splashRadius.
      // If horizontal position matches, count as a hit regardless of depth.
      applyDamage(game, e, weapon.damage);
    }
  }
  if (weapon.targetDomains.includes('crate')) {
    for (const c of game.crates) {
      if (c.dead) continue;
      if (withinSplash(worldX, worldD, c.x, 1 - c.alt, weapon.splashRadius)) {
        applyDamage(game, c, weapon.damage);
      }
    }
  }
  // Boss splash callback (registered by Bosses.init via game.bossSplashCallback)
  if (game.bossSplashCallback) {
    game.bossSplashCallback(weapon, worldX, worldD);
  }
}

// FIX 5: spawn screen-space splash particles at an impact screen position.
// Detects water vs sand by comparing screenY to the background band boundaries.
function spawnImpactSplash(game, screenX, screenY) {
  if (!game.splashes) return;
  const { HORIZON_Y, SEA_Y } = CONSTANTS;
  const inWater = screenY >= HORIZON_Y && screenY < SEA_Y;
  const inSand  = screenY >= SEA_Y;
  if (!inWater && !inSand) return;
  const color = inWater ? '#88ccee' : '#c8b880';
  const count = inWater ? 9 : 7;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI + Math.random() * Math.PI; // downward-to-upward arc
    const speed = 35 + Math.random() * 55;
    const maxLife = 0.28 + Math.random() * 0.28;
    game.splashes.push({
      x: screenX + (Math.random() - 0.5) * 6,
      y: screenY,
      vx: Math.cos(angle) * speed * 0.55,
      vy: Math.sin(angle) * speed - 15,
      life: maxLife, maxLife,
      r: 1.5 + Math.random() * 2.5,
      color,
    });
  }
  // Base splash circle (briefly visible)
  game.splashes.push({
    x: screenX, y: screenY,
    vx: 0, vy: 0,
    life: 0.12, maxLife: 0.12,
    r: inWater ? 9 : 7,
    color,
  });
}

// --- Impact feedback (hit vs miss) -----------------------------------------
// Cue ids come from the weapon's schema fields, never from a weapon id
// literal: `impactSound` for a confirmed hit, `missSound` for a whiff. Both
// are optional; the fallbacks are generic role names.
const DEFAULT_IMPACT_SOUND = 'impactMetal';
const DEFAULT_MISS_SOUND = 'impactMiss';

// Per-shot screen-shake contribution, scaled from weapon damage and hard
// capped so a 10/s automatic weapon cannot saturate the accumulator.
const SHAKE_PER_DAMAGE = 0.0040;
const SHAKE_BASE = 0.050;
const SHAKE_PER_SHOT_CAP = 0.28;

/**
 * Add a damped shake impulse scaled from the weapon's damage.
 * @param {Object} game - Game state object with screenShake accumulator
 * @param {Object} weapon - Weapon definition with damage property
 * @returns {void}
 */
function impactShake(game, weapon) {
  const n = Math.min(SHAKE_PER_SHOT_CAP, SHAKE_BASE + (weapon.damage || 0) * SHAKE_PER_DAMAGE);
  game.screenShake = (game.screenShake || 0) + n;
}

/**
 * Screen-space spark burst at the point of a confirmed hit. Uses the same
 * particle schema spawnSystem/renderer already share.
 * @param {Object} game - Game state object with particles array
 * @param {number} screenX - Screen-space X coordinate of impact
 * @param {number} screenY - Screen-space Y coordinate of impact
 * @param {Object} weapon - Weapon definition with damage and color properties
 * @returns {void}
 */
function spawnHitSparks(game, screenX, screenY, weapon) {
  if (!game.particles) return;
  const color = weapon.color || '#ffe08a';
  const count = 5 + Math.min(7, Math.round((weapon.damage || 0) * 0.12));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    const life = 0.16 + Math.random() * 0.18;
    game.particles.push({
      x: screenX + (Math.random() - 0.5) * 4,
      y: screenY + (Math.random() - 0.5) * 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 25,
      life, maxLife: life,
      r: 1 + Math.random() * 1.8,
      color,
      smoke: false,
    });
  }
  // Bright flash core so the hit reads instantly even in a busy frame.
  game.particles.push({
    x: screenX, y: screenY,
    vx: 0, vy: 0,
    life: 0.08, maxLife: 0.08,
    r: 5 + Math.min(8, (weapon.damage || 0) * 0.08),
    color: '#ffffff',
    smoke: false,
  });
}

/**
 * Play either a hit-confirm or miss-splash audio cue.
 * @param {Object} game - Game state object with audio system
 * @param {Object} weapon - Weapon definition with impactSound and missSound properties
 * @param {boolean} hit - True for hit-confirm cue, false for miss/splash cue
 * @returns {void}
 */
function playImpactCue(game, weapon, hit) {
  if (!game.audio) return;
  const id = hit
    ? (weapon.impactSound || DEFAULT_IMPACT_SOUND)
    : (weapon.missSound || DEFAULT_MISS_SOUND);
  game.audio.play(id);
}

export const fireModeHandlers = {
  auto(game, weapon, turret) {
    fireHitscan(game, weapon, turret);
  },
  single(game, weapon, turret) {
    if (weapon.projectileSpeed) {
      fireBallistic(game, weapon, turret);
    } else {
      fireHitscan(game, weapon, turret);
    }
  },
  guided(game, weapon, turret) {
    fireGuided(game, weapon, turret);
  },
};

function fireHitscan(game, weapon, turret) {
  const target = projectedHitTest(game, weapon, turret.aimX, turret.aimY);
  const originX = 640, originY = 700;
  game.effects.push({ kind: 'tracer', x1: originX, y1: originY, x2: turret.aimX, y2: turret.aimY, color: weapon.color, life: 0.06, age: 0 });
  game.effects.push({ kind: 'muzzle', life: 0.08, age: 0 });
  if (target) {
    if (weapon.splashRadius > 0) {
      const domain = target.type ? domainForEnemy(target) : 'air';
      splashDamage(game, weapon, target.x, target.kind === 'crate' ? (1 - target.alt) : target.d);
      game.effects.push({ kind: 'explosion', x: target.x, d: target.kind === 'crate' ? (1 - target.alt) : target.d, alt: target.alt || 0, domain, radiusWorld: weapon.splashRadius, life: 0.4, age: 0 });
    } else {
      applyDamage(game, target, weapon.damage);
    }
    // Hit confirm: sparks at the impact point, metallic cue, a nudge of shake.
    spawnHitSparks(game, turret.aimX, turret.aimY, weapon);
    impactShake(game, weapon);
    playImpactCue(game, weapon, true);
  } else {
    // FIX 5: missed shot — splash at cursor impact point (water or sand)
    spawnImpactSplash(game, turret.aimX, turret.aimY);
    playImpactCue(game, weapon, false);
  }
  game.audio && game.audio.play(weapon.sound);
}

function fireBallistic(game, weapon, turret) {
  // Determine target domain under cursor by y position, to invert projection.
  const domain = turret.aimY < 260 ? 'air' : turret.aimY < 420 ? 'sea' : 'land';
  const d = unprojectD(turret.aimY, domain);
  const x = unprojectX(turret.aimX, d);
  const originX = 640, originD = 1.0; // conceptually far muzzle origin in world d? we treat travel purely as timer.
  const dist = Math.hypot((x - 0) * 640, (d - 1) * 900) || 1;
  const flightTime = Math.max(0.15, dist / (weapon.projectileSpeed * 900));
  game.projectiles.push({
    kind: 'shell', weapon, targetX: x, targetD: d, domain,
    t: 0, flightTime, startScreenX: 640, startScreenY: 700,
  });
  game.effects.push({ kind: 'muzzle', life: 0.1, age: 0 });
  game.audio && game.audio.play(weapon.sound);
}

function fireGuided(game, weapon, turret) {
  // find nearest air enemy to reticle within cone
  let best = null;
  let bestDist = 140;
  for (const e of game.entities) {
    if (e.dead || e.dying || e.kind !== 'enemy' || e.type.domain !== 'air') continue;
    const { sx, sy } = project(e.x, e.d, e.alt, 'air');
    const dist = screenDistance(turret.aimX, turret.aimY, sx, sy);
    if (dist <= bestDist) { bestDist = dist; best = e; }
  }
  // Also offer boss air targets (bomber + escorts) via registered callback
  if ((!best || bestDist > 50) && game.bossAirTargetCallback) {
    const r = game.bossAirTargetCallback(turret.aimX, turret.aimY, bestDist);
    if (r) { best = r.target; bestDist = r.dist; }
  }
  const domain = 'air';
  const fallbackD = unprojectD(turret.aimY, domain);
  const fallbackX = unprojectX(turret.aimX, fallbackD);
  game.projectiles.push({
    kind: 'missile', weapon, target: best,
    x: 0, d: 1, alt: 0.05,
    fallbackX, fallbackD, hasFallback: !best,
  });
  game.effects.push({ kind: 'muzzle', life: 0.1, age: 0 });
  game.audio && game.audio.play(weapon.sound);
}

/**
 * Attempt to fire the active weapon. Checks ammo and cooldown, decrements ammo if successful,
 * and dispatches the appropriate fireMode handler.
 * @param {Object} game - Game state object
 * @returns {void}
 */
export function tryFire(game) {
  const turret = game.turret;
  const weapon = Turret.activeWeapon(turret);
  if (!Turret.hasAmmo(turret, weapon.id)) {
    if (Turret.canFire(turret, weapon)) {
      Turret.startCooldown(turret, weapon);
      Turret.flashEmpty(turret);
      game.audio && game.audio.play('click');
    }
    return;
  }
  if (!Turret.canFire(turret, weapon)) return;
  Turret.startCooldown(turret, weapon);
  Turret.decrementAmmo(turret, weapon.id);
  Turret.triggerRecoil(turret);
  const handler = fireModeHandlers[weapon.fireMode];
  if (handler) {
    handler(game, weapon, turret);
  } else {
    console.error(`weaponSystem: unknown fireMode "${weapon.fireMode}" for weapon "${weapon.id}"`);
  }
}

/**
 * Update weapon cooldowns and handle auto-fire logic each frame.
 * @param {Object} game - Game state object with turret, input, and projectiles
 * @param {number} dt - Elapsed time in seconds since last frame
 * @returns {void}
 */
export function update(game, dt) {
  Turret.tickCooldowns(game.turret, dt);

  // auto-fire while held
  if (game.input.mouseDown) {
    const weapon = Turret.activeWeapon(game.turret);
    if (weapon.fireMode === 'auto') {
      tryFire(game);
    }
  }

  // update projectiles
  for (const p of game.projectiles) {
    if (p.kind === 'shell') {
      p.t += dt;
      if (p.t >= p.flightTime) {
        p.done = true;
        splashDamage(game, p.weapon, p.targetX, p.targetD);
        game.effects.push({ kind: 'explosion', x: p.targetX, d: p.targetD, alt: p.domain === 'air' ? 0.5 : 0, domain: p.domain, radiusWorld: p.weapon.splashRadius, life: 0.4, age: 0 });
        // FIX 5: spawn water/sand splash at screen-projected impact point
        const { sx: isx, sy: isy } = project(p.targetX, p.targetD, 0, p.domain);
        spawnImpactSplash(game, isx, isy);
      }
    } else if (p.kind === 'missile') {
      const speed = p.weapon.projectileSpeed * dt;
      if (p.target && !p.target.dead && !p.target.dying) {
        const dx = p.target.x - p.x;
        const dd = p.target.d - p.d;
        const dalt = (p.target.alt || 0) - p.alt;
        const len = Math.hypot(dx, dd, dalt) || 1;
        p.x += (dx / len) * speed;
        p.d += (dd / len) * speed;
        p.alt += (dalt / len) * speed;
        if (len < 0.05) {
          applyDamage(game, p.target, p.weapon.damage);
          p.done = true;
          game.effects.push({ kind: 'explosion', x: p.target.x, d: p.target.d, alt: p.target.alt || 0, domain: 'air', radiusWorld: 40, life: 0.3, age: 0 });
        }
      } else {
        const dx = p.fallbackX - p.x;
        const dd = p.fallbackD - p.d;
        const len = Math.hypot(dx, dd) || 1;
        p.x += (dx / len) * speed;
        p.d += (dd / len) * speed;
        if (len < 0.05 || p.d <= p.fallbackD + 0.01) {
          p.done = true;
          game.effects.push({ kind: 'explosion', x: p.x, d: p.d, alt: p.alt, domain: 'air', radiusWorld: 20, life: 0.3, age: 0 });
        }
      }
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.done);

  // age effects
  for (const fx of game.effects) fx.age += dt;
  game.effects = game.effects.filter(fx => fx.age < fx.life);

  // FIX 4: update explosion particles (screen-space physics)
  if (game.particles) {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt; // gravity pulls sparks down
      p.life -= dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
  }

  // FIX 5: update splash particles (screen-space physics)
  if (game.splashes) {
    for (let i = game.splashes.length - 1; i >= 0; i--) {
      const sp = game.splashes[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 60 * dt; // gravity
      sp.life -= dt;
      if (sp.life <= 0) game.splashes.splice(i, 1);
    }
  }
}

/**
 * Handle input events for weapon selection and firing.
 * @param {Object} game - Game state object
 * @param {Object} evt - Input event with type and optional key/dir properties
 * @returns {void}
 */
export function handleInputEvent(game, evt) {
  const turret = game.turret;
  if (evt.type === 'selectWeapon') {
    const idx = weaponDefs.findIndex(w => w.key === evt.key);
    if (idx >= 0) Turret.setActiveIndex(turret, idx);
  } else if (evt.type === 'cycleWeapon') {
    Turret.cycleWeapon(turret, evt.dir);
  } else if (evt.type === 'fireStart') {
    const weapon = Turret.activeWeapon(turret);
    if (weapon.fireMode !== 'auto') {
      tryFire(game);
    }
  }
}
