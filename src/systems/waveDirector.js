// Takes an arbitrary wave array (from waves.json). Sequences spawns, manages
// wave banner state, and loops the final wave at increasing difficulty once
// exhausted. No wave/enemy id branching — purely index/data driven.
// Boss orchestration: stage 5 → battleship after infantry clears,
//                     stage 7 → bomber spawns 15s into wave,
//                     stage 9 → upgraded battleship after infantry clears,
//                     stage 10 → bomber at wave start + battleship after infantry.
import { clamp01 } from '../engine/renderer.js';
import * as SpawnSystem from './spawnSystem.js';
import * as CrateSystem from './crateSystem.js';
import * as Bosses from './bosses.js';

/**
 * Initialize the wave director with loaded wave definitions.
 * @param {Object} game - Game state object to initialize
 * @param {Object} data - Loaded game data containing wave definitions
 * @returns {void}
 */
export function init(game, data) {
  const waves = data.waves.waves;
  const loopCfg = data.waves.loop || {};
  game.waveState = {
    waves,
    // Loop scaling config, with safe defaults if waves.json omits it.
    loopConfig: {
      growth: typeof loopCfg.growth === 'number' ? loopCfg.growth : 1.15,
      maxMultiplier: typeof loopCfg.maxMultiplier === 'number' ? loopCfg.maxMultiplier : 2.5,
    },
    index: 0,
    timeInWave: 0,
    loopMultiplier: 1.0,
    loopCount: 0,
    spawnProgress: [], // per spawn entry: {spawned, timer}
    // Wave phases: spawnGroups[0] is always the wave's base `spawns` list;
    // each activated phase appends another group with its own local clock.
    spawnGroups: [],   // [{ spawns, progress, startTime }]
    phaseIndex: 0,     // how many of waveDef.phases have been activated
    crateTimer: 0,
    banner: null,       // { text, timer }
    difficulty: { hp: 1, speed: 1 },
    active: false,
    // Boss phase tracking
    bossSpawned: false,       // battleship has been spawned for this wave
    bomberSpawned: false,     // bomber has been spawned for this wave
    bomberSpawnTimer: 0,      // countdown to bomber mid-wave spawn (seconds)
  };
  startWave(game, 0);
}

function currentWaveDef(waveState) {
  const idx = Math.min(waveState.index, waveState.waves.length - 1);
  return waveState.waves[idx];
}

// ── Difficulty intensity profiles ────────────────────────────────────────────
// Registry of pure functions, same shape as movementBehaviors.js:39 — a plain
// object keyed by string, each value a side-effect-free function. A wave may
// name one via its optional `difficultyProfile` field; waves without the field
// keep the historical flat behaviour exactly.
//   fn(base, p) -> { hp, speed }   with p = clamped 0..1 progress through wave.
// All curves are authored and deterministic (ADR-006) — no randomness.
/**
 * Registry of difficulty profile functions. Each profile takes a base difficulty
 * and wave progress (0-1) and returns a difficulty with scaled hp and speed.
 * @type {Object<string, Function>}
 */
export const difficultyProfiles = {
  /**
   * Constant difficulty for the whole wave (legacy behaviour).
   * @param {{hp: number, speed: number}} base - Base difficulty
   * @returns {{hp: number, speed: number}} Scaled difficulty
   */
  flat(base) {
    return { hp: base.hp, speed: base.speed };
  },

  /**
   * Steady build: opens slightly soft, ends harder than the authored value.
   * @param {{hp: number, speed: number}} base - Base difficulty
   * @param {number} waveProgress - Wave progress 0-1
   * @returns {{hp: number, speed: number}} Scaled difficulty
   */
  ramp(base, waveProgress) {
    const scaleFactor = 0.90 + 0.30 * waveProgress;
    return { hp: base.hp * scaleFactor, speed: base.speed * (0.95 + 0.15 * waveProgress) };
  },

  /**
   * Mid-wave surge that relaxes again before the wave ends.
   * @param {{hp: number, speed: number}} base - Base difficulty
   * @param {number} waveProgress - Wave progress 0-1
   * @returns {{hp: number, speed: number}} Scaled difficulty
   */
  swell(base, waveProgress) {
    const scaleFactor = 1 + 0.20 * Math.sin(Math.PI * waveProgress);
    return { hp: base.hp * scaleFactor, speed: base.speed * (1 + 0.10 * Math.sin(Math.PI * waveProgress)) };
  },

  /**
   * Calm first two thirds, then a hard late-wave push.
   * @param {{hp: number, speed: number}} base - Base difficulty
   * @param {number} waveProgress - Wave progress 0-1
   * @returns {{hp: number, speed: number}} Scaled difficulty
   */
  spike(base, waveProgress) {
    const spikeProgress = waveProgress <= 0.6 ? 0 : (waveProgress - 0.6) / 0.4;
    return { hp: base.hp * (0.95 + 0.45 * spikeProgress), speed: base.speed * (0.98 + 0.22 * spikeProgress) };
  },
};

/**
 * Compute difficulty multipliers for the current wave and time within it.
 * @param {Object} waveDef - Wave definition from data
 * @param {number} loopMultiplier - Difficulty multiplier from loop count
 * @param {number} [timeInWave=0] - Elapsed time in current wave
 * @returns {{hp: number, speed: number}} Computed difficulty for current conditions
 */
export function computeDifficulty(waveDef, loopMultiplier, timeInWave = 0) {
  const base = {
    hp: waveDef.difficulty.hp * loopMultiplier,
    speed: waveDef.difficulty.speed * loopMultiplier,
  };
  const profileId = waveDef.difficultyProfile;
  if (!profileId) return base;
  const profile = difficultyProfiles[profileId];
  if (!profile) {
    console.error(`waveDirector: unknown difficultyProfile "${profileId}"`);
    return base;
  }
  const duration = waveDef.duration > 0 ? waveDef.duration : 1;
  const waveProgress = clamp01(timeInWave / duration);
  return profile(base, waveProgress);
}

function startWave(game, index) {
  const ws = game.waveState;
  ws.index = index;
  ws.timeInWave = 0;
  ws.crateTimer = 0;
  ws.active = true;
  // Integrator: snapshot for the end-of-wave "perfect wave" bonus (scoreSystem
  // onWaveComplete). Nothing else reads it.
  ws.defenseAtWaveStart = (game.defense !== undefined) ? game.defense : 0;

  // Reset boss phase for new wave
  ws.bossSpawned    = false;
  ws.bomberSpawned  = false;
  ws.bomberSpawnTimer = 0;

  // Clear any leftover bosses from previous wave
  if (game.bosses) game.bosses = [];

  const isLoopingFinal = index >= ws.waves.length;
  if (isLoopingFinal) {
    ws.loopCount += 1;
    // Bounded growth: exponential, but clamped so an endless run cannot reach
    // unplayable multipliers (ADR-006).
    const { growth, maxMultiplier } = ws.loopConfig;
    ws.loopMultiplier = Math.min(maxMultiplier, Math.pow(growth, ws.loopCount));
  }

  const waveDef = currentWaveDef(ws);
  ws.difficulty = computeDifficulty(waveDef, ws.loopMultiplier, 0);
  ws.spawnProgress = waveDef.spawns.map(() => ({ spawned: 0, timer: -1 }));
  ws.spawnGroups = [{ spawns: waveDef.spawns, progress: ws.spawnProgress, startTime: 0 }];
  ws.phaseIndex = 0;

  // Banner: show STAGE X/10 for non-looping waves
  const stageLabel = isLoopingFinal
    ? `WAVE ${ws.loopCount}`
    : `STAGE ${waveDef.id}/10`;
  ws.banner = { text: `${stageLabel}: ${waveDef.name}`, timer: 3.0 };
  game.audio && game.audio.play('wave');

  // Bomber stages: set timer for mid-wave spawn
  if (waveDef.boss === 'bomber' || waveDef.boss === 'final') {
    // 'final' stage 10: bomber spawns right at start (15s delay)
    ws.bomberSpawnTimer = waveDef.boss === 'final' ? 5 : 15;
  }
}

/**
 * Update wave progression, spawn enemies, and advance time each frame.
 * @param {Object} game - Game state object
 * @param {number} dt - Elapsed time in seconds since last frame
 * @returns {void}
 */
export function update(game, dt) {
  const ws = game.waveState;
  if (!ws.active) return;

  ws.timeInWave += dt;
  if (ws.banner) {
    ws.banner.timer -= dt;
    if (ws.banner.timer <= 0) ws.banner = null;
  }

  const waveDef = currentWaveDef(ws);
  // Re-evaluate the authored intensity profile as the wave progresses.
  ws.difficulty = computeDifficulty(waveDef, ws.loopMultiplier, ws.timeInWave);

  // ── Phase activation ──────────────────────────────────────────────────────
  // A phase becomes active once every already-active group has finished
  // spawning AND its trigger is satisfied. Triggers are pure data:
  //   { elapsed: <seconds since wave start>, remaining: <max enemies alive> }
  // Either may be omitted; both present means AND.
  const phases = waveDef.phases || [];
  if (ws.phaseIndex < phases.length && allGroupsSpawned(ws)) {
    const phase = phases[ws.phaseIndex];
    const trigger = phase.trigger || {};
    const elapsedOk   = trigger.elapsed   === undefined || ws.timeInWave >= trigger.elapsed;
    const remainingOk = trigger.remaining === undefined || aliveCount(game) <= trigger.remaining;
    if (elapsedOk && remainingOk) {
      ws.phaseIndex += 1;
      ws.spawnGroups.push({
        spawns: phase.spawns,
        progress: phase.spawns.map(() => ({ spawned: 0, timer: -1 })),
        startTime: ws.timeInWave,
      });
      if (phase.name) {
        ws.banner = { text: phase.name, timer: 2.5 };
        game.audio && game.audio.play('wave');
      }
    }
  }

  // ── Spawning ──────────────────────────────────────────────────────────────
  // Group 0 starts at t=0 so a wave with no phases behaves exactly as before.
  for (const group of ws.spawnGroups) {
    const localTime = ws.timeInWave - group.startTime;
    group.spawns.forEach((spawnDef, spawnIndex) => {
      const progress = group.progress[spawnIndex];
      if (progress.spawned >= spawnDef.count) return;
      if (progress.timer < 0) {
        if (localTime >= spawnDef.startDelay) {
          doSpawn(game, spawnDef, ws.difficulty, progress.spawned);
          progress.spawned += 1;
          progress.timer = 0;
        }
        return;
      }
      progress.timer += dt;
      if (progress.timer >= spawnDef.interval && progress.spawned < spawnDef.count) {
        doSpawn(game, spawnDef, ws.difficulty, progress.spawned);
        progress.spawned += 1;
        progress.timer = 0;
      }
    });
  }

  // ── Crate drops ───────────────────────────────────────────────────────────
  if (waveDef.crates) {
    ws.crateTimer += dt;
    if (ws.crateTimer >= waveDef.crates.interval) {
      ws.crateTimer = 0;
      CrateSystem.spawnCrate(game, waveDef.crates.types);
    }
  }

  // ── Bomber mid-wave spawn timer ────────────────────────────────────────────
  if (!ws.bomberSpawned && ws.bomberSpawnTimer > 0) {
    ws.bomberSpawnTimer -= dt;
    if (ws.bomberSpawnTimer <= 0) {
      ws.bomberSpawnTimer = 0;
      const isStage10 = waveDef.boss === 'final';
      Bosses.spawnBoss(game, isStage10 ? 'final' : 'bomber', waveDef.id);
      ws.bomberSpawned = true;
      ws.banner = { text: '✈ AIR RAID INCOMING!', timer: 3.5 };
      game.audio && game.audio.play('alarm');
    }
  }

  // ── Wave completion ────────────────────────────────────────────────────────
  const allSpawned = allGroupsSpawned(ws) && ws.phaseIndex >= phases.length;
  const cleared = allSpawned && aliveCount(game) === 0;
  const timeUp = ws.timeInWave >= waveDef.duration;

  const hasBossWave = !!waveDef.boss; // this stage has any boss
  const needsBattleship = waveDef.boss === 'battleship' ||
                          waveDef.boss === 'battleship_final' ||
                          waveDef.boss === 'final';
  const hasBossAlive = Bosses.hasBossAlive(game);

  // Phase 1: Infantry cleared → spawn battleship (for battleship waves)
  if ((cleared || timeUp) && needsBattleship && !ws.bossSpawned) {
    ws.bossSpawned = true;
    const isFinalShip = waveDef.boss !== 'battleship';
    Bosses.spawnBoss(game, isFinalShip ? 'battleship_final' : 'battleship', waveDef.id);
    ws.banner = { text: '⚓ BATTLESHIP INCOMING!', timer: 4.0 };
    game.audio && game.audio.play('alarm');
    return; // wait for battleship to be destroyed (Phase 2)
  }

  // Phase 2: Everything dead → advance wave
  const allBossesSpawned = !hasBossWave ||
    (needsBattleship ? ws.bossSpawned : true) &&
    (waveDef.boss === 'bomber' || waveDef.boss === 'final' ? ws.bomberSpawned : true);

  if ((cleared || timeUp) && allBossesSpawned && !hasBossAlive) {
    awardWaveBonus(game, ws);
    const nextIndex = ws.index + 1;
    if (nextIndex >= ws.waves.length) {
      // Final stage cleared — end the run in victory instead of looping
      // endlessly. main.js notices victoryPending and transitions state.
      ws.active = false;
      game.victoryPending = true;
      return;
    }
    startWave(game, nextIndex);
  }
}

// Integrator: the wave bonus in scoreSystem had no caller, so it never fired.
// Pays out once per cleared wave; perfect = no defense lost during the wave.
function awardWaveBonus(game, ws) {
  const api = game.scoreApi;
  if (!api || typeof api.onWaveComplete !== 'function') return;
  const start = ws.defenseAtWaveStart;
  const taken = (typeof start === 'number' && game.defense !== undefined)
    ? Math.max(0, start - game.defense)
    : undefined;
  api.onWaveComplete(ws.index, { baseDamageTaken: taken });
}

function aliveCount(game) {
  return game.entities.filter(e => !e.dead && !e.dying && !e.flags.beached).length;
}

function allGroupsSpawned(ws) {
  return ws.spawnGroups.every(
    g => g.spawns.every((s, i) => g.progress[i].spawned >= s.count)
  );
}

function doSpawn(game, spawnDef, difficulty, index) {
  const d = 1.0;
  const patternId = spawnDef.spawnPattern;
  if (patternId) {
    const pattern = SpawnSystem.spawnPatterns[patternId];
    if (!pattern) {
      console.error(`waveDirector: unknown spawnPattern "${patternId}"`);
    } else {
      const xs = pattern({ index: index || 0, count: spawnDef.count, rng: Math.random });
      for (const px of xs) {
        const x = Math.max(-1, Math.min(1, px));
        SpawnSystem.spawnEnemy(game, spawnDef.enemyId, x, d, difficulty);
      }
      return;
    }
  }
  const x = (Math.random() * 2 - 1) * 0.85;
  SpawnSystem.spawnEnemy(game, spawnDef.enemyId, x, d, difficulty);
}

/**
 * Debug helper: skip immediately to the next wave.
 * @param {Object} game - Game state object
 * @returns {void}
 */
export function debugForceNextWave(game) {
  const ws = game.waveState;
  if (!ws) return;
  const nextIndex = ws.index + 1;
  if (nextIndex >= ws.waves.length) {
    ws.active = false;
    game.victoryPending = true;
    return;
  }
  startWave(game, nextIndex);
}

/**
 * Get information about the current wave for HUD display.
 * @param {Object} game - Game state object
 * @returns {{id: string, name: string, total: number, isLooping: boolean, loopCount: number, banner: ?Object, hasBoss: boolean}} Wave info
 */
export function currentWaveInfo(game) {
  const ws = game.waveState;
  const waveDef = currentWaveDef(ws);
  const isLooping = ws.index >= ws.waves.length;
  return {
    id: waveDef.id,
    name: waveDef.name,
    total: ws.waves.length,   // 10
    isLooping,
    loopCount: ws.loopCount,
    banner: ws.banner,
    hasBoss: !!waveDef.boss,
  };
}
