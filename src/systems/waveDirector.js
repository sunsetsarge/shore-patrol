// Takes an arbitrary wave array (from waves.json). Sequences spawns, manages
// wave banner state, and loops the final wave at increasing difficulty once
// exhausted. No wave/enemy id branching — purely index/data driven.
// Boss orchestration: stage 5 → battleship after infantry clears,
//                     stage 7 → bomber spawns 15s into wave,
//                     stage 9 → upgraded battleship after infantry clears,
//                     stage 10 → bomber at wave start + battleship after infantry.
import * as SpawnSystem from './spawnSystem.js';
import * as CrateSystem from './crateSystem.js';
import * as Bosses from './bosses.js';

export function init(game, data) {
  const waves = data.waves.waves;
  game.waveState = {
    waves,
    index: 0,
    timeInWave: 0,
    loopMultiplier: 1.0,
    loopCount: 0,
    spawnProgress: [], // per spawn entry: {spawned, timer}
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

function computeDifficulty(waveDef, loopMultiplier) {
  return {
    hp: waveDef.difficulty.hp * loopMultiplier,
    speed: waveDef.difficulty.speed * loopMultiplier,
  };
}

function startWave(game, index) {
  const ws = game.waveState;
  ws.index = index;
  ws.timeInWave = 0;
  ws.crateTimer = 0;
  ws.active = true;

  // Reset boss phase for new wave
  ws.bossSpawned    = false;
  ws.bomberSpawned  = false;
  ws.bomberSpawnTimer = 0;

  // Clear any leftover bosses from previous wave
  if (game.bosses) game.bosses = [];

  const isLoopingFinal = index >= ws.waves.length;
  if (isLoopingFinal) {
    ws.loopCount += 1;
    ws.loopMultiplier = Math.pow(1.15, ws.loopCount);
  }

  const waveDef = currentWaveDef(ws);
  ws.difficulty = computeDifficulty(waveDef, ws.loopMultiplier);
  ws.spawnProgress = waveDef.spawns.map(() => ({ spawned: 0, timer: -1 }));

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

export function update(game, dt) {
  const ws = game.waveState;
  if (!ws.active) return;

  ws.timeInWave += dt;
  if (ws.banner) {
    ws.banner.timer -= dt;
    if (ws.banner.timer <= 0) ws.banner = null;
  }

  const waveDef = currentWaveDef(ws);

  // ── Infantry spawning ─────────────────────────────────────────────────────
  waveDef.spawns.forEach((spawnDef, i) => {
    const progress = ws.spawnProgress[i];
    if (progress.spawned >= spawnDef.count) return;
    if (progress.timer < 0) {
      if (ws.timeInWave >= spawnDef.startDelay) {
        doSpawn(game, spawnDef, ws.difficulty);
        progress.spawned += 1;
        progress.timer = 0;
      }
      return;
    }
    progress.timer += dt;
    if (progress.timer >= spawnDef.interval && progress.spawned < spawnDef.count) {
      doSpawn(game, spawnDef, ws.difficulty);
      progress.spawned += 1;
      progress.timer = 0;
    }
  });

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
  const allSpawned = waveDef.spawns.every((s, i) => ws.spawnProgress[i].spawned >= s.count);
  const cleared = allSpawned && game.entities.filter(
    e => !e.dead && !e.dying && !e.flags.beached
  ).length === 0;
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
    startWave(game, ws.index + 1);
  }
}

function doSpawn(game, spawnDef, difficulty) {
  const x = (Math.random() * 2 - 1) * 0.85;
  const d = 1.0;
  SpawnSystem.spawnEnemy(game, spawnDef.enemyId, x, d, difficulty);
}

// Debug helper: skip immediately to the next wave.
export function debugForceNextWave(game) {
  const ws = game.waveState;
  if (!ws) return;
  startWave(game, ws.index + 1);
}

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
