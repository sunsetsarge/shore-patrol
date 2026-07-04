// Reads weapons.json-derived defs. fireModeHandlers registry dispatches on
// the `fireMode` schema field — no weapon id branching anywhere in this file.
import { project, unprojectD, unprojectX } from '../engine/renderer.js';
import { screenDistance, withinSplash } from '../engine/collision.js';
import * as Turret from '../engine/turret.js';

let weaponDefs = [];

export function init(game, data) {
  weaponDefs = data.weapons.weapons;
  game.turret = Turret.createTurret(weaponDefs);
  game.projectiles = [];
  game.effects = []; // { kind:'muzzle'|'explosion'|'tracer', ...}
}

function domainForEnemy(entity) {
  return entity.type.domain;
}

function projectedHitTest(game, weapon, screenX, screenY) {
  // Return nearest-d target among live enemies whose domain is targetable and
  // whose projected hitbox contains the screen point.
  let best = null;
  let bestD = Infinity;
  for (const e of game.entities) {
    if (e.dead || e.kind !== 'enemy') continue;
    if (!weapon.targetDomains.includes(domainForEnemy(e))) continue;
    const { sx, sy, scale } = project(e.x, e.d, e.alt, domainForEnemy(e));
    const r = e.type.hitbox * scale;
    if (screenDistance(screenX, screenY, sx, sy) <= r) {
      if (e.d < bestD) { bestD = e.d; best = e; }
    }
  }
  // also test crates if targetable
  if (weapon.targetDomains.includes('crate')) {
    for (const c of game.crates) {
      if (c.dead) continue;
      const { sx, sy, scale } = project(c.x, 0, c.alt, 'air');
      const r = 20 * scale;
      if (screenDistance(screenX, screenY, sx, sy) <= r) {
        if (0 < bestD) { bestD = 0; best = c; }
      }
    }
  }
  return best;
}

function applyDamage(game, target, damage) {
  if (!target || target.dead) return;
  target.hp -= damage;
  if (target.hp <= 0) {
    target.dead = true;
    target.killedByPlayer = true;
  }
}

function splashDamage(game, weapon, worldX, worldD) {
  for (const e of game.entities) {
    if (e.dead || e.kind !== 'enemy') continue;
    if (!weapon.targetDomains.includes(domainForEnemy(e))) continue;
    if (withinSplash(worldX, worldD, e.x, e.d, weapon.splashRadius)) {
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
    if (e.dead || e.kind !== 'enemy' || e.type.domain !== 'air') continue;
    const { sx, sy } = project(e.x, e.d, e.alt, 'air');
    const dist = screenDistance(turret.aimX, turret.aimY, sx, sy);
    if (dist <= bestDist) { bestDist = dist; best = e; }
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
  const handler = fireModeHandlers[weapon.fireMode];
  if (handler) {
    handler(game, weapon, turret);
  } else {
    console.error(`weaponSystem: unknown fireMode "${weapon.fireMode}" for weapon "${weapon.id}"`);
  }
}

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
      }
    } else if (p.kind === 'missile') {
      const speed = p.weapon.projectileSpeed * dt;
      if (p.target && !p.target.dead) {
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
}

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
