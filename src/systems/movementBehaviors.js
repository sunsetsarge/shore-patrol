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
          }
        }
      }
    }
    entity.alt = 1 - entity.d; // rough altitude coupling for visual descent into hover band
  },

  land_then_disgorge(entity, dt, api) {
    const speed = entity.type.speed * api.difficulty.speed;
    const landD = 0.10;
    if (!entity.flags.landed) {
      entity.d -= speed * dt;
      if (entity.d <= landD) {
        entity.d = landD;
        entity.flags.landed = true;
        entity.flags.pauseTimer = 0;
      }
    } else {
      entity.flags.pauseTimer += dt;
      if (entity.flags.pauseTimer >= 1.0) {
        // self-disgorge: despawn without score. spawnSystem fires
        // spawnsOnDeath generically off flags.landed (set above), never for
        // player kills.
        entity.dead = true;
        entity.suppressScore = true;
      }
    }
  },
};
