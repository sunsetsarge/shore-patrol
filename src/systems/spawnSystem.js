// Spawns entities from wave spawn lists and spawnsOnDeath chains. Applies
// wave difficulty multipliers to hp/speed. No enemy-id branching — looks up
// definitions by id from the loaded enemies.json map.
import { createEntity } from '../engine/entity.js';
import { movementBehaviors } from './movementBehaviors.js';

let enemyDefsById = {};

export function init(game, data) {
  enemyDefsById = {};
  for (const e of data.enemies.enemies) {
    enemyDefsById[e.id] = e;
  }
  game.entities = [];
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
      game.defense = Math.max(0, game.defense - amount);
      game.scoreApi && game.scoreApi.onBaseDamage();
      game.audio && game.audio.play('hit');
    },
    notifyVolley(entity) {
      game.effects.push({ kind: 'explosion', x: entity.x, d: entity.d, alt: entity.alt, domain: 'land', radiusWorld: 30, life: 0.3, age: 0 });
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
    const behavior = movementBehaviors[e.type.movement];
    if (behavior) {
      behavior(e, dt, api);
    }
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
        game.audio && game.audio.play('explode');
        game.effects.push({ kind: 'explosion', x: e.x, d: e.d, alt: e.alt, domain: e.type.domain, radiusWorld: 60, life: 0.4, age: 0 });
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
      if (e.flags.landed && e.type.spawnsOnDeath) {
        spawnChildren(game, e, e.type.spawnsOnDeath, api.difficulty);
      }
    }
  }

  game.entities = game.entities.filter(e => !e.dead);
}

export function getEnemyDefsById() {
  return enemyDefsById;
}
