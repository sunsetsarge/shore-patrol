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
    const speed = entity.type.speed * api.difficulty.speed;
    const hoverD = 0.3;
    if (entity.d > hoverD) {
      entity.d -= speed * dt;
      if (entity.d <= hoverD) entity.d = hoverD;
    } else {
      // hover with x-drift
      if (entity.flags.driftPhase === undefined) entity.flags.driftPhase = Math.random() * Math.PI * 2;
      entity.flags.driftPhase += dt * 0.8;
      if (entity.flags.baseX === undefined) entity.flags.baseX = entity.x;
      entity.x = entity.flags.baseX + Math.sin(entity.flags.driftPhase) * 0.3;
      entity.x = Math.max(-1, Math.min(1, entity.x));

      if (entity.type.fireInterval > 0) {
        entity.flags.fireTimer = (entity.flags.fireTimer || 0) + dt;
        if (entity.flags.fireTimer >= entity.type.fireInterval) {
          entity.flags.fireTimer = 0;
          if (entity.type.fireDamage > 0) {
            api.damageBase(entity.type.fireDamage);
            api.notifyVolley(entity);
            // FIX 6: muzzle flash at the helicopter when it fires
            api.notifyEnemyFire && api.notifyEnemyFire(entity);
          }
        }
      }
    }
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
};
