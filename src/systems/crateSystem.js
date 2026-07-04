// crates.json driven: weighted spawn, descend, shot=collect+refill(capped)+points,
// landed=lost. No crate-id branching — dispatch purely by data fields.
import { createEntity } from '../engine/entity.js';
import * as Turret from '../engine/turret.js';

let crateDefsById = {};
let crateDefsList = [];

export function init(game, data) {
  crateDefsList = data.crates.crates;
  crateDefsById = {};
  for (const c of crateDefsList) crateDefsById[c.id] = c;
  game.crates = [];
}

function weightedPick(typeIds) {
  const candidates = typeIds
    .map(id => crateDefsById[id])
    .filter(Boolean);
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((s, c) => s + (c.spawnWeight || 1), 0);
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    r -= (c.spawnWeight || 1);
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

export function spawnCrate(game, typeIds) {
  const def = weightedPick(typeIds);
  if (!def) {
    console.error(`crateSystem: no valid crate types among [${typeIds.join(',')}]`);
    return;
  }
  const entity = createEntity({
    kind: 'crate',
    type: def,
    x: (Math.random() * 2 - 1) * 0.8,
    d: 0, // unused for crates; they use alt instead
    alt: 1,
    hp: 1,
    maxHp: 1,
  });
  game.crates.push(entity);
}

export function update(game, dt) {
  for (const c of game.crates) {
    // Classify hp<=0 as collected FIRST: weapon damage marks crates dead
    // before this system runs, so a plain `if (c.dead) continue` would skip
    // shot crates and drop the refill.
    if (c.hp <= 0) {
      c.dead = true;
      c.collected = true;
      continue;
    }
    if (c.dead) continue;
    c.alt -= c.type.dropSpeed * dt;
    if (c.alt <= 0) {
      c.alt = 0;
      c.dead = true;
      c.collected = false;
    }
  }

  for (const c of game.crates) {
    if (c.dead && !c.processed) {
      c.processed = true;
      if (c.collected) {
        const weaponDef = game.turret.weapons.find(w => w.id === c.type.weaponId);
        const capacity = weaponDef ? weaponDef.ammo : null;
        Turret.refillAmmo(game.turret, c.type.weaponId, c.type.amount, capacity);
        game.scoreApi && game.scoreApi.onCrateCollected(250);
        game.audio && game.audio.play('crate');
      }
    }
  }

  game.crates = game.crates.filter(c => !c.dead);
}
