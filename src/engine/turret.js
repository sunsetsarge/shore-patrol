// Turret state: aim angle derived from reticle position, active weapon index,
// per-weapon ammo counters, and per-weapon fire cooldowns. No weapon-id
// branching — everything is indexed by array position / generic fields.

export function createTurret(weapons) {
  const ammo = {};
  weapons.forEach(w => { ammo[w.id] = w.ammo; }); // null = infinite

  return {
    weapons,             // array of weapon defs, in JSON order
    activeIndex: 0,
    ammo,                // { weaponId: count|null }
    cooldowns: {},        // { weaponId: secondsRemaining }
    aimX: 640,
    aimY: 360,
    barrelAngle: 0,       // radians, for barrel glyph rotation
    firing: false,        // held state for auto weapons
    lastFireAttempt: 0,   // for empty-click flash timing
    emptyFlashTimer: 0,
  };
}

export function activeWeapon(turret) {
  return turret.weapons[turret.activeIndex];
}

export function setActiveIndex(turret, idx) {
  const n = turret.weapons.length;
  turret.activeIndex = ((idx % n) + n) % n;
}

export function cycleWeapon(turret, dir) {
  setActiveIndex(turret, turret.activeIndex + (dir >= 0 ? 1 : -1));
}

export function getAmmo(turret, weaponId) {
  return turret.ammo[weaponId];
}

export function hasAmmo(turret, weaponId) {
  const a = turret.ammo[weaponId];
  return a === null || a === undefined ? true : a > 0;
}

export function decrementAmmo(turret, weaponId) {
  if (turret.ammo[weaponId] === null || turret.ammo[weaponId] === undefined) return;
  turret.ammo[weaponId] = Math.max(0, turret.ammo[weaponId] - 1);
}

export function refillAmmo(turret, weaponId, amount, capacity) {
  if (turret.ammo[weaponId] === null || turret.ammo[weaponId] === undefined) return;
  const cap = capacity === null || capacity === undefined ? Infinity : capacity;
  turret.ammo[weaponId] = Math.min(cap, turret.ammo[weaponId] + amount);
}

export function updateAim(turret, mouseX, mouseY) {
  turret.aimX = mouseX;
  turret.aimY = mouseY;
  // barrel origin: bottom-center of canvas (bunker parapet)
  const originX = 640;
  const originY = 700;
  turret.barrelAngle = Math.atan2(mouseY - originY, mouseX - originX);
}

export function tickCooldowns(turret, dt) {
  for (const w of turret.weapons) {
    if (turret.cooldowns[w.id] > 0) {
      turret.cooldowns[w.id] = Math.max(0, turret.cooldowns[w.id] - dt);
    }
  }
  if (turret.emptyFlashTimer > 0) {
    turret.emptyFlashTimer = Math.max(0, turret.emptyFlashTimer - dt);
  }
}

export function canFire(turret, weapon) {
  return !(turret.cooldowns[weapon.id] > 0);
}

export function startCooldown(turret, weapon) {
  turret.cooldowns[weapon.id] = 1 / weapon.fireRate;
}

export function flashEmpty(turret) {
  turret.emptyFlashTimer = 0.15;
}
