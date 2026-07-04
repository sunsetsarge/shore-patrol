// Takes an arbitrary wave array (from waves.json). Sequences spawns, manages
// wave banner state, and loops the final wave at increasing difficulty once
// exhausted. No wave/enemy id branching — purely index/data driven.
import * as SpawnSystem from './spawnSystem.js';
import * as CrateSystem from './crateSystem.js';

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

  const isLoopingFinal = index >= ws.waves.length;
  if (isLoopingFinal) {
    ws.loopCount += 1;
    ws.loopMultiplier = Math.pow(1.15, ws.loopCount);
  }

  const waveDef = currentWaveDef(ws);
  ws.difficulty = computeDifficulty(waveDef, ws.loopMultiplier);
  ws.spawnProgress = waveDef.spawns.map(() => ({ spawned: 0, timer: -1 }));
  ws.banner = { text: `Wave ${waveDef.id}: ${waveDef.name}`, timer: 3.0 };
  game.audio && game.audio.play('wave');
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

  // process spawns
  waveDef.spawns.forEach((spawnDef, i) => {
    const progress = ws.spawnProgress[i];
    if (progress.spawned >= spawnDef.count) return;
    if (progress.timer < 0) {
      // waiting for startDelay
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

  // crates
  if (waveDef.crates) {
    ws.crateTimer += dt;
    if (ws.crateTimer >= waveDef.crates.interval) {
      ws.crateTimer = 0;
      CrateSystem.spawnCrate(game, waveDef.crates.types);
    }
  }

  const allSpawned = waveDef.spawns.every((s, i) => ws.spawnProgress[i].spawned >= s.count);
  const cleared = allSpawned && game.entities.filter(e => !e.dead).length === 0;
  const timeUp = ws.timeInWave >= waveDef.duration;

  if (cleared || timeUp) {
    startWave(game, ws.index + 1);
  }
}

function doSpawn(game, spawnDef, difficulty) {
  const x = (Math.random() * 2 - 1) * 0.85;
  const d = 1.0;
  SpawnSystem.spawnEnemy(game, spawnDef.enemyId, x, d, difficulty);
}

export function currentWaveInfo(game) {
  const ws = game.waveState;
  const waveDef = currentWaveDef(ws);
  return {
    id: waveDef.id,
    name: waveDef.name,
    isLooping: ws.index >= ws.waves.length,
    loopCount: ws.loopCount,
    banner: ws.banner,
  };
}
