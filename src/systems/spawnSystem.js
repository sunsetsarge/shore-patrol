// Spawns entities from wave spawn lists and spawnsOnDeath chains. Applies
// wave difficulty multipliers to hp/speed. No enemy-id branching — looks up
// definitions by id from the loaded enemies.json map.
import { createEntity } from '../engine/entity.js';
import { movementBehaviors } from './movementBehaviors.js';
import { project, entityMuzzlePoint } from '../engine/renderer.js';

let enemyDefsById = {};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function init(game, data) {
  enemyDefsById = {};
  for (const e of data.enemies.enemies) {
    enemyDefsById[e.id] = e;
  }
  game.entities = [];
  game.particles = [];  // FIX 4: screen-space explosion particles
  game.splashes  = [];  // FIX 5: screen-space impact splash particles
}

// FIX 1: infantry/commando collapse — small red splat + sandy dust, no fire.
function spawnCollapseEffect(particles, sx, sy) {
  // Blood splat droplets
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 25;
    particles.push({
      x: sx, y: sy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      r: 1.5 + Math.random() * 2,
      color: '#8b1a1a',
      smoke: false,
    });
  }
  // Sandy dust puffs
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: sx + (Math.random() - 0.5) * 10, y: sy,
      vx: (Math.random() - 0.5) * 15,
      vy: -10 - Math.random() * 15,
      life: 0.5, maxLife: 0.5,
      r: 4 + Math.random() * 4,
      color: 'rgba(180,160,120,0.8)',
      smoke: false,
    });
  }
}

// FIX 2: landing craft/boat sinking in water — water column + foam ring + black smoke.
// Water droplets go into splashes (color-correct), burning wreck smoke into particles.
function spawnBoatSinkSplash(particles, splashes, sx, sy) {
  // Large upward water column
  for (let i = 0; i < 20; i++) {
    const angle = -Math.PI + Math.random() * Math.PI; // upward arc
    const speed = 80 + Math.random() * 120;
    splashes.push({
      x: sx + (Math.random() - 0.5) * 30,
      y: sy,
      vx: Math.cos(angle) * speed * 0.5,
      vy: Math.sin(angle) * speed - 60,
      life: 0.8 + Math.random() * 0.5,
      maxLife: 1.3,
      r: 4 + Math.random() * 8,
      color: Math.random() < 0.6 ? '#aaddff' : '#ffffff',
    });
  }
  // Foam ring at base
  splashes.push({
    x: sx, y: sy, vx: 0, vy: 0,
    life: 0.6, maxLife: 0.6,
    r: 35, color: 'rgba(200,230,255,0.7)',
  });
  // Black smoke from burning wreck
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: sx + (Math.random() - 0.5) * 20, y: sy - 10,
      vx: (Math.random() - 0.5) * 10,
      vy: -30 - Math.random() * 20,
      life: 1.2, maxLife: 1.2,
      r: 10 + Math.random() * 8,
      color: '#1e1e1e',
      smoke: true,
    });
  }
}

// FIX 4: spawn screen-space explosion particles at (sx, sy).
// sizeMultiplier > 1 for large vehicles (tanks, landing craft).
function spawnExplosionParticles(particles, sx, sy, sizeMultiplier) {
  const sm = sizeMultiplier || 1.0;
  const count = Math.floor(12 * sm);
  const fireColors = ['#ff6600', '#ffcc00', '#cc2200', '#ff8800'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (30 + Math.random() * 60) * sm;
    const maxLife = 0.5 + Math.random() * 0.5;
    particles.push({
      x: sx, y: sy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: maxLife, maxLife,
      r: (2 + Math.random() * 4) * sm,
      color: fireColors[Math.floor(Math.random() * fireColors.length)],
      smoke: false,
    });
  }
  // Black smoke puffs
  for (let i = 0; i < 5; i++) {
    const maxLife = 1.0 + Math.random() * 0.5;
    particles.push({
      x: sx + (Math.random() - 0.5) * 20 * sm,
      y: sy - Math.random() * 10 * sm,
      vx: (Math.random() - 0.5) * 20,
      vy: -20 - Math.random() * 30,
      life: maxLife, maxLife,
      r: (7 + Math.random() * 10) * sm,
      color: '#1e1e1e',
      smoke: true,
    });
  }
}

function makeEnemyEntity(enemyId, x, d, difficulty) {
  const def = enemyDefsById[enemyId];
  if (!def) {
    console.error(`spawnSystem: unknown enemy id "${enemyId}"`);
    return null;
  }
  if (!movementBehaviors[def.movement]) {
    console.error(`spawnSystem: unknown movement id "${def.movement}" for enemy "${enemyId}"`);
    return null;
  }
  const hp = def.hp * difficulty.hp;
  const entity = createEntity({
    kind: 'enemy',
    type: def,
    x,
    d,
    alt: def.domain === 'air' ? 1 : 0,
    hp,
    maxHp: hp,
  });
  return entity;
}

export function spawnEnemy(game, enemyId, x, d, difficulty) {
  const entity = makeEnemyEntity(enemyId, x, d, difficulty || { hp: 1, speed: 1 });
  if (entity) game.entities.push(entity);
  return entity;
}

// Used by movementBehaviors' land_then_disgorge / general spawnsOnDeath chains.
// Disgorged spawns land at the craft's x (+/- spread) on the beach, just past
// the waterline: d = 0.92-0.98, regardless of the parent craft's own d.
export function spawnChildren(game, parentEntity, spawnsOnDeath, difficulty) {
  const { enemyId, count, spread } = spawnsOnDeath;
  for (let i = 0; i < count; i++) {
    const offset = (Math.random() - 0.5) * 2 * spread;
    const x = Math.max(-1, Math.min(1, parentEntity.x + offset));
    const d = 0.92 + Math.random() * 0.06;
    spawnEnemy(game, enemyId, x, d, difficulty || { hp: 1, speed: 1 });
  }
}

export function update(game, dt) {
  const api = {
    difficulty: game.waveState ? game.waveState.difficulty : { hp: 1, speed: 1 },
    damageBase(amount) {
      if (game.godMode) return; // debug god mode
      game.defense = Math.max(0, game.defense - amount);
      game.scoreApi && game.scoreApi.onBaseDamage();
      game.audio && game.audio.play('hit');
    },
    notifyVolley(entity) {
      // Muzzle blast at the gun/pylon (W4) — NOT the sprite centre/feet, which
      // put a stray blast under the tank's tracks.
      const p = project(entity.x, entity.d, entity.alt, entity.type.domain);
      const mp = entityMuzzlePoint(entity, p.sx, p.sy, p.scale);
      game.effects.push({ kind: 'enemy_muzzle', screenX: mp.x, screenY: mp.y, scale: p.scale * 1.4, life: 0.16, age: 0 });
    },
    // Enemy fires — muzzle flash at the sprite's GUN/MUZZLE point (W4), not its
    // centre. Screen coords stored on the effect; drawn directly (no reproject).
    notifyEnemyFire(entity) {
      const p = project(entity.x, entity.d, entity.alt, entity.type.domain);
      const mp = entityMuzzlePoint(entity, p.sx, p.sy, p.scale);
      game.effects.push({ kind: 'enemy_muzzle', screenX: mp.x, screenY: mp.y, scale: p.scale, life: 0.12, age: 0 });
    },
    // Tracer/round from the firing entity's MUZZLE toward the bunker (screen
    // bottom-center), so shots leave the gun barrel / missile pylon.
    spawnTracer(entity) {
      const p = project(entity.x, entity.d, entity.alt, entity.type.domain);
      const mp = entityMuzzlePoint(entity, p.sx, p.sy, p.scale);
      game.effects.push({ kind: 'tracer', x1: mp.x, y1: mp.y, x2: 640, y2: 700, color: entity.type.color || '#ffcc66', life: 0.15, age: 0 });
    },
    spawnChildren(entity, spawnsOnDeath) {
      spawnChildren(game, entity, spawnsOnDeath, api.difficulty);
    },
    rng: Math.random,
  };

  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.dying) {
      // Dying entities play their one-shot death animation and are otherwise
      // inert: no movement behavior, no base damage, no re-triggered kill
      // processing. Removed once the animation (+ brief corpse linger) ends.
      e.age += dt;
      e.deathAge += dt;
      const frames = e.type.deathSprite;
      const fps = e.type.deathFps || 10;
      const duration = (frames.length / fps) + 0.4;
      if (e.deathAge > duration) {
        e.dead = true;
      }
      continue;
    }
    e.age += dt;
    const prevX = e.x;
    const behavior = movementBehaviors[e.type.movement];
    if (behavior) {
      behavior(e, dt, api);
    }
    // Round 4 §2/§3: smoothed horizontal heading (world x-units/sec), tracked
    // generically for every entity so mirrorByHeading/bankFactor renderer
    // fields work on any def without movement-behavior-specific plumbing.
    const vx = dt > 0 ? (e.x - prevX) / dt : 0;
    e.headX = lerp(e.headX === undefined ? 0 : e.headX, vx, 0.1);
  }

  // handle kill scoring/effects (player kills only), fired exactly once at
  // the moment of kill via killMoment — decoupled from `dead` so dying
  // entities (playing a death animation) still score immediately rather than
  // waiting for the corpse to finish lingering.
  for (const e of game.entities) {
    if (e.killMoment && !e.processedKill) {
      e.processedKill = true;
      if (e.killedByPlayer && !e.suppressScore) {
        game.scoreApi && game.scoreApi.onKill(e.type.scoreValue);
        const { sx, sy } = project(e.x, e.d, e.alt, e.type.domain);

        const isInfantry  = e.type.shape === 'biped';
        const isBoatAtSea = e.type.domain === 'sea' && !e.flags.beached;

        if (isInfantry) {
          // FIX 1: infantry/commando — collapse effect, no explosion, no 'explode' sfx
          spawnCollapseEffect(game.particles, sx, sy);
        } else if (isBoatAtSea) {
          // FIX 2: boat destroyed in water — water splash instead of fire explosion
          game.audio && game.audio.play('explode');
          spawnBoatSinkSplash(game.particles, game.splashes, sx, sy);
        } else {
          // tanks, helicopters, beached boats — fire explosion as before
          game.audio && game.audio.play('explode');
          game.effects.push({ kind: 'explosion', x: e.x, d: e.d, alt: e.alt, domain: e.type.domain, radiusWorld: 60, life: 0.4, age: 0 });
          // FIX 4: screen-space explosion particles
          const sm = e.type.hitbox > 30 ? 1.5 : 1.0;
          spawnExplosionParticles(game.particles, sx, sy, sm);
        }
      }
    }
  }

  // handle removal-time chaining: spawnsOnDeath (landed only — never for
  // player kills, so shooting a craft down before it lands never disgorges
  // troops; only a self-landed craft does, generically dispatched off
  // flags.landed rather than any kill-cause check). Dying entities are
  // excluded — they haven't self-landed, they were shot, and disgorge must
  // never fire for a player kill regardless of dying state.
  for (const e of game.entities) {
    if (e.dead && !e.processedDeath) {
      e.processedDeath = true;
      // FIX 3: beached ships already trickle-spawned their troops via the
      // movement behavior; skip the death-chain spawn so troops don't
      // double-appear when a beached craft is shot.
      if (e.flags.landed && !e.flags.beached && e.type.spawnsOnDeath) {
        spawnChildren(game, e, e.type.spawnsOnDeath, api.difficulty);
      }
    }
  }

  game.entities = game.entities.filter(e => !e.dead);
}

export function getEnemyDefsById() {
  return enemyDefsById;
}
