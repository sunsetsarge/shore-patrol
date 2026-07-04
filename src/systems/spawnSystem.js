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
export function spawnChildren(game, parentEntity, spawnsOnDeath, difficulty) {
  const { enemyId, count, spread } = spawnsOnDeath;
  for (let i = 0; i < count; i++) {
    const offset = (Math.random() * 2 - 1) * spread;
    const x = Math.max(-1, Math.min(1, parentEntity.x + offset));
    const d = parentEntity.d;
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
    e.age += dt;
    const behavior = movementBehaviors[e.type.movement];
    if (behavior) {
      behavior(e, dt, api);
    }
  }

  // handle deaths: score + spawnsOnDeath (for kills, not self-disgorge which
  // already handled its own chain+suppressed score in the behavior)
  for (const e of game.entities) {
    if (e.dead && !e.processedDeath) {
      e.processedDeath = true;
      if (e.killedByPlayer && !e.suppressScore) {
        game.scoreApi && game.scoreApi.onKill(e.type.scoreValue);
        game.audio && game.audio.play('explode');
        game.effects.push({ kind: 'explosion', x: e.x, d: e.d, alt: e.alt, domain: e.type.domain, radiusWorld: 60, life: 0.4, age: 0 });
        if (e.type.spawnsOnDeath) {
          spawnChildren(game, e, e.type.spawnsOnDeath, api.difficulty);
        }
      }
    }
  }

  game.entities = game.entities.filter(e => !e.dead);
}

export function getEnemyDefsById() {
  return enemyDefsById;
}
