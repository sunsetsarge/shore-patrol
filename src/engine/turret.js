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
    riseT: 0,             // 0..1, "powering up" rise animation for the active
                           // turret-rack sprite, reset to 0 on weapon switch,
                           // animates to 1 over RISE_DURATION seconds.
    recoilTimer: 0,        // seconds remaining of recoil kick, set on fire,
                           // ticks down to 0 (drives the active rack sprite's
                           // recoil offset).
  };
}

export function activeWeapon(turret) {
  return turret.weapons[turret.activeIndex];
}

export function setActiveIndex(turret, idx) {
  const n = turret.weapons.length;
  const next = ((idx % n) + n) % n;
  if (next !== turret.activeIndex) {
    turret.activeIndex = next;
    turret.riseT = 0; // reset the "powering up" rise animation on switch
  }
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

const RISE_DURATION = 0.25; // seconds — matches SPEC_PHASE2_POLISH.md section F
const RECOIL_DURATION = 0.12;

export function tickCooldowns(turret, dt) {
  for (const w of turret.weapons) {
    if (turret.cooldowns[w.id] > 0) {
      turret.cooldowns[w.id] = Math.max(0, turret.cooldowns[w.id] - dt);
    }
  }
  if (turret.emptyFlashTimer > 0) {
    turret.emptyFlashTimer = Math.max(0, turret.emptyFlashTimer - dt);
  }
  if (turret.riseT < 1) {
    turret.riseT = Math.min(1, turret.riseT + dt / RISE_DURATION);
  }
  if (turret.recoilTimer > 0) {
    turret.recoilTimer = Math.max(0, turret.recoilTimer - dt);
  }
}

// Called by weaponSystem on every successful fire to kick off the turret
// rack's recoil visual (translate down/back a few px, decaying over
// RECOIL_DURATION). Generic — no weapon-id branching.
export function triggerRecoil(turret) {
  turret.recoilTimer = RECOIL_DURATION;
}

export function recoilT01(turret) {
  return RECOIL_DURATION > 0 ? clamp01(turret.recoilTimer / RECOIL_DURATION) : 0;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
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
