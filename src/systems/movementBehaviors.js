// Registry of movement behaviors keyed by the `movement` field in enemies.json.
// Each fn: (entity, dt, api) -> void. No enemy id branching — dispatch is
// purely by the registry key looked up from data.
//
// api: { spawnFn(enemyId, x, d, opts), difficulty: {hp, speed}, rng }

function applyBaseDamage(entity, api) {
  if (entity.type.damageToBase > 0) {
    api.damageBase(entity.type.damageToBase);
  }
}

// Shared firing-state helpers (Round 4 §4): any entity whose def carries a
// `fireSprite` array enters a brief one-shot `firing` state when it fires —
// dispatched purely on field presence, reused by hover_and_dive (existing
// heli volley) and advance_and_fire (new soldier/tank standoff-and-shoot).
function startFiring(entity, api) {
  if (entity.type.fireDamage > 0) {
    api.damageBase(entity.type.fireDamage);
  }
  api.notifyVolley(entity);
  api.notifyEnemyFire && api.notifyEnemyFire(entity);
  api.spawnTracer && api.spawnTracer(entity);
  if (entity.type.fireSprite) {
    entity.firing = true;
    entity.fireAge = 0;
  }
}

function tickFiring(entity, dt) {
  if (!entity.firing) return;
  entity.fireAge = (entity.fireAge || 0) + dt;
  const frames = entity.type.fireSprite;
  const fps = entity.type.fireFps || 8;
  const duration = frames ? (frames.length / fps) + 0.2 : 0.4;
  if (entity.fireAge > duration) entity.firing = false;
}

export const movementBehaviors = {
  straight_approach(entity, dt, api) {
    const speed = entity.type.speed * api.difficulty.speed;
    entity.d -= speed * dt;
    // slight lateral jitter
    if (entity.flags.jitterPhase === undefined) entity.flags.jitterPhase = Math.random() * Math.PI * 2;
    entity.flags.jitterPhase += dt * 2;
    entity.x += Math.sin(entity.flags.jitterPhase) * 0.0015;
    if (entity.d <= 0) {
      entity.d = 0;
      applyBaseDamage(entity, api);
      entity.dead = true;
      entity.reachedBase = true;
    }
  },

  strafe_weave(entity, dt, api) {
    const speed = entity.type.speed * api.difficulty.speed;
    entity.d -= speed * dt;
    if (entity.flags.weavePhase === undefined) entity.flags.weavePhase = Math.random() * Math.PI * 2;
    entity.flags.weavePhase += dt * 3;
    if (entity.flags.baseX === undefined) entity.flags.baseX = entity.x;
    entity.x = entity.flags.baseX + Math.sin(entity.flags.weavePhase) * 0.25;
    entity.x = Math.max(-1, Math.min(1, entity.x));
    if (entity.d <= 0) {
      entity.d = 0;
      applyBaseDamage(entity, api);
      entity.dead = true;
      entity.reachedBase = true;
    }
  },

  hover_and_dive(entity, dt, api) {
    // Head-on approach from the horizon (growing with the projection), then a
    // brief forward "arrival bob" overshoot, then lateral strafing + volleys.
    const speed = entity.type.speed * api.difficulty.speed;
    const hoverD = 0.3;
    const BOB_TIME = 1.2; // seconds of arrival overshoot-and-settle

    if (entity.flags.arrived === undefined) entity.flags.arrived = false;

    if (!entity.flags.arrived) {
      // Phase 1: straight head-on approach — hold x fixed so it comes right
      // out of the horizon at the player, growing as it nears.
      entity.d -= speed * dt;
      if (entity.d <= hoverD) {
        entity.d = hoverD;
        entity.flags.arrived = true;
        entity.flags.bobT = 0;
      }
    } else if (entity.flags.bobT !== undefined && entity.flags.bobT < BOB_TIME) {
      // Phase 2: arrival bob — nose dips forward past the hover line and
      // settles back (damped half-sine on d).
      entity.flags.bobT += dt;
      const t = entity.flags.bobT / BOB_TIME;
      entity.d = hoverD - Math.sin(Math.PI * t) * 0.05 * (1 - t * 0.4);
    } else {
      // Phase 3: strafe left/right while firing.
      entity.d = hoverD;
      if (entity.flags.driftPhase === undefined) entity.flags.driftPhase = Math.random() * Math.PI * 2;
      entity.flags.driftPhase += dt * 0.8;
      if (entity.flags.baseX === undefined) entity.flags.baseX = entity.x;
      entity.x = entity.flags.baseX + Math.sin(entity.flags.driftPhase) * 0.3;
      entity.x = Math.max(-1, Math.min(1, entity.x));

      if (entity.type.fireInterval > 0) {
        entity.flags.fireTimer = (entity.flags.fireTimer || 0) + dt;
        if (entity.flags.fireTimer >= entity.type.fireInterval) {
          entity.flags.fireTimer = 0;
          startFiring(entity, api);
        }
      }
    }
    tickFiring(entity, dt);
    entity.alt = 1 - entity.d; // rough altitude coupling for visual descent into hover band
  },

  land_then_disgorge(entity, dt, api) {
    // FIX 3: craft beaches permanently; troops trickle out one by one.
    const speed = entity.type.speed * api.difficulty.speed;
    const landD = 0.10;

    if (!entity.flags.beached) {
      // Approaching — move toward shore
      entity.d -= speed * dt;
      if (entity.d <= landD) {
        entity.d = landD;
        entity.flags.beached = true;
        entity.flags.rampDown  = true;  // visual: ramp drops
        entity.flags.rampTimer = 0.5;   // delay before first troop emerges
        const sd = entity.type.spawnsOnDeath;
        entity.flags.troopsToSpawn  = sd ? sd.count : 0;
        entity.flags.troopInterval  = 0.35; // seconds between each soldier
      }
    } else {
      // Beached — trickle troops out one at a time
      if (entity.flags.troopsToSpawn > 0) {
        entity.flags.rampTimer -= dt;
        if (entity.flags.rampTimer <= 0) {
          const sd = entity.type.spawnsOnDeath;
          if (sd) {
            // Spawn exactly one troop per tick (override count to 1)
            api.spawnChildren(entity, Object.assign({}, sd, { count: 1 }));
          }
          entity.flags.troopsToSpawn--;
          entity.flags.rampTimer = entity.flags.troopInterval;
        }
      }
      // Craft stays beached permanently — no entity.dead = true here.
    }
  },

  // Generic "approach then hold and shoot" behavior (Round 4 §4). Any def
  // using this movement approaches until `standoffD` (default 0.25), then
  // holds position (with a gentle lateral drift so it doesn't look frozen)
  // and fires fireDamage at game.defense every fireInterval seconds. Entities
  // never self-despawn here — they die only to player fire or the wave-clear
  // rules, per spec.
  advance_and_fire(entity, dt, api) {
    const speed = entity.type.speed * api.difficulty.speed;
    const standoffD = entity.type.standoffD != null ? entity.type.standoffD : 0.25;

    if (entity.d > standoffD) {
      entity.d -= speed * dt;
      if (entity.d <= standoffD) entity.d = standoffD;
    } else {
      if (entity.flags.driftPhase === undefined) entity.flags.driftPhase = Math.random() * Math.PI * 2;
      entity.flags.driftPhase += dt * 0.6;
      if (entity.flags.baseX === undefined) entity.flags.baseX = entity.x;
      entity.x = entity.flags.baseX + Math.sin(entity.flags.driftPhase) * 0.05;
      entity.x = Math.max(-1, Math.min(1, entity.x));

      // At standoff, face the bunker (screen center) rather than keeping the
      // last walking direction — firing away from the player reads wrong.
      if (entity.headX !== undefined) {
        const toward = entity.x > 0.05 ? -0.02 : entity.x < -0.05 ? 0.02 : 0;
        entity.headX += (toward - entity.headX) * 0.15;
      }

      if (entity.type.fireInterval > 0) {
        entity.flags.fireTimer = (entity.flags.fireTimer || 0) + dt;
        if (entity.flags.fireTimer >= entity.type.fireInterval) {
          entity.flags.fireTimer = 0;
          startFiring(entity, api);
        }
      }
    }
    tickFiring(entity, dt);
  },
};
