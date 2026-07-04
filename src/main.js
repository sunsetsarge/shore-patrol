import { createInputState, attachInput, drainQueue } from './engine/input.js';
import * as Turret from './engine/turret.js';
import * as Renderer from './engine/renderer.js';
import * as Sprites from './engine/sprites.js';
import { createAudio } from './audio.js';

import * as SpawnSystem from './systems/spawnSystem.js';
import * as WeaponSystem from './systems/weaponSystem.js';
import * as CrateSystem from './systems/crateSystem.js';
import * as WaveDirector from './systems/waveDirector.js';
import * as ScoreSystem from './systems/scoreSystem.js';
import * as HUD from './systems/hud.js';
import { movementBehaviors } from './systems/movementBehaviors.js';
import { fireModeHandlers } from './systems/weaponSystem.js';

const DATA_FILES = {
  weapons: 'data/weapons.json',
  enemies: 'data/enemies.json',
  waves: 'data/waves.json',
  crates: 'data/crates.json',
};

const FIXED_DT = 1 / 60;
const MAX_ACCUMULATED = 0.25;

async function loadData() {
  const entries = Object.entries(DATA_FILES);
  const results = await Promise.all(
    // no-store: data files are the modding surface — a stale cache would make
    // JSON edits silently not appear on refresh.
    entries.map(([key, path]) => fetch(path, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
      return r.json();
    }))
  );
  const data = {};
  entries.forEach(([key], i) => { data[key] = results[i]; });
  return data;
}

function validateData(data) {
  // Loader tolerates unknown fields (behaviorScript) automatically since we
  // just pass objects through. Skip entries with unknown movement/fireMode
  // ids rather than crash — filter here so downstream systems see only valid data.
  const validEnemies = [];
  for (const e of data.enemies.enemies) {
    if (!movementBehaviors[e.movement]) {
      console.error(`main: unknown movement id "${e.movement}" on enemy "${e.id}" — skipping entry`);
      continue;
    }
    validEnemies.push(e);
  }
  data.enemies.enemies = validEnemies;

  const validWeapons = [];
  for (const w of data.weapons.weapons) {
    if (!fireModeHandlers[w.fireMode]) {
      console.error(`main: unknown fireMode id "${w.fireMode}" on weapon "${w.id}" — skipping entry`);
      continue;
    }
    validWeapons.push(w);
  }
  data.weapons.weapons = validWeapons;

  return data;
}

// Collect every distinct `sprite` path referenced anywhere in the loaded
// data (enemies, crates), plus the optional background convention path.
// Tolerates absence of the field entirely (that's today's baseline state).
function collectSpritePaths(data) {
  const paths = new Set();
  paths.add('assets/background.png');
  for (const e of data.enemies.enemies) {
    if (e.sprite) paths.add(e.sprite);
  }
  for (const c of data.crates.crates) {
    if (c.sprite) paths.add(c.sprite);
  }
  return [...paths];
}

function createGame(canvas, ctx, data, audio) {
  const game = {
    canvas,
    ctx,
    data,
    audio,
    input: createInputState(),
    defense: 100,
    state: 'menu', // menu | playing | gameover
    time: 0,
  };
  return game;
}

function initSystems(game, data) {
  ScoreSystem.init(game);
  SpawnSystem.init(game, data);
  WeaponSystem.init(game, data);
  CrateSystem.init(game, data);
  WaveDirector.init(game, data);
  game.defense = 100;
  game.state = 'playing';
}

function resetGame(game, data) {
  initSystems(game, data);
}

function update(game, dt) {
  if (game.state !== 'playing') return;
  game.time += dt;

  const turret = game.turret;
  Turret.updateAim(turret, game.input.mouseX, game.input.mouseY);

  const events = drainQueue(game.input);
  for (const evt of events) {
    WeaponSystem.handleInputEvent(game, evt);
  }

  WeaponSystem.update(game, dt);
  SpawnSystem.update(game, dt);
  CrateSystem.update(game, dt);
  WaveDirector.update(game, dt);
  ScoreSystem.update(game, dt);

  if (game.defense <= 0) {
    game.defense = 0;
    game.state = 'gameover';
    game.bestScore = ScoreSystem.saveBestIfHigher(game.score);
    game.audio.play('gameover');
  }
}

function renderPlaying(ctx, game) {
  Renderer.drawBackground(ctx, game.time);

  // draw entities sorted far-to-near (by d desc) so nearer overlaps farther
  const drawList = [...game.entities, ...game.crates];
  drawList.sort((a, b) => {
    const da = a.kind === 'crate' ? (1 - a.alt) : a.d;
    const db = b.kind === 'crate' ? (1 - b.alt) : b.d;
    return db - da;
  });

  for (const e of drawList) {
    if (e.kind === 'crate') {
      const { sx, sy, scale } = Renderer.project(e.x, 0, e.alt, 'air');
      Renderer.drawCrate(ctx, sx, sy, scale, e.type.color, e.type);
    } else {
      const domain = e.type.domain;
      const { sx, sy, scale } = Renderer.project(e.x, e.d, e.alt, domain);
      Renderer.drawEntityGlyph(ctx, e, sx, sy, scale);
    }
  }

  // projectiles
  for (const p of game.projectiles) {
    if (p.kind === 'shell') {
      const t01 = Math.min(1, p.t / p.flightTime);
      const curX = t01 * p.targetX;
      const curD = 1 - t01 * (1 - p.targetD);
      const { sx, sy } = Renderer.project(curX, curD, p.domain === 'air' ? 0.5 : 0, p.domain);
      Renderer.drawProjectile(ctx, sx, sy, p.weapon.color, 6);
    } else if (p.kind === 'missile') {
      const { sx, sy } = Renderer.project(p.x, p.d, p.alt, 'air');
      Renderer.drawProjectile(ctx, sx, sy, p.weapon.color, 5);
    }
  }

  // effects
  for (const fx of game.effects) {
    const t01 = Math.min(1, fx.age / fx.life);
    if (fx.kind === 'explosion') {
      const { sx, sy, scale } = Renderer.project(fx.x, fx.d, fx.alt, fx.domain);
      Renderer.drawExplosion(ctx, sx, sy, Math.max(20, fx.radiusWorld * 0.35) * scale, t01);
    } else if (fx.kind === 'tracer') {
      Renderer.drawTracer(ctx, fx.x1, fx.y1, fx.x2, fx.y2, fx.color, 1 - t01);
    } else if (fx.kind === 'muzzle') {
      Renderer.drawMuzzleFlash(ctx, game.turret, 1 - t01);
    }
  }

  Renderer.drawTurret(ctx, game.turret);

  const weapon = Turret.activeWeapon(game.turret);
  Renderer.drawReticle(ctx, game.turret.aimX, game.turret.aimY, weapon.reticle, weapon.color);

  HUD.render(ctx, game);
}

function renderMenu(ctx, game) {
  Renderer.drawBackground(ctx, game.time);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24a';
  ctx.font = 'bold 64px monospace';
  ctx.fillText('BEACHHEAD', 640, 260);
  ctx.fillStyle = '#fff';
  ctx.font = '20px monospace';
  ctx.fillText('Click or press ENTER to start', 640, 340);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#aac';
  ctx.fillText(`Best score: ${game.bestScore || ScoreSystem.loadBest()}`, 640, 380);
  ctx.restore();
}

function renderGameover(ctx, game) {
  renderPlaying(ctx, game);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5050';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('BASE OVERRUN', 640, 260);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`Score: ${game.score}`, 640, 320);
  ctx.fillStyle = '#ffd24a';
  ctx.font = '20px monospace';
  ctx.fillText(`Best: ${game.bestScore}`, 640, 355);
  ctx.fillStyle = '#ccc';
  ctx.font = '16px monospace';
  ctx.fillText('Click or press ENTER to restart', 640, 410);
  ctx.restore();
}

function render(game) {
  const ctx = game.ctx;
  ctx.clearRect(0, 0, 1280, 720);
  if (game.state === 'menu') {
    renderMenu(ctx, game);
  } else if (game.state === 'playing') {
    renderPlaying(ctx, game);
  } else if (game.state === 'gameover') {
    renderGameover(ctx, game);
  }
}

async function main() {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  let data;
  try {
    data = await loadData();
    data = validateData(data);
  } catch (err) {
    console.error('main: failed to load game data', err);
    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    ctx.fillText('Failed to load game data — see console.', 40, 40);
    return;
  }

  // Kick off sprite preloading (fire-and-forget — the game starts immediately
  // and sprites pop in via the renderer's loaded-image fallback logic).
  Sprites.preload(collectSpritePaths(data));

  const audio = createAudio();
  const game = createGame(canvas, ctx, data, audio);
  game.bestScore = ScoreSystem.loadBest();
  game.state = 'menu';
  window.game = game; // debug/inspection handle

  attachInput(canvas, game.input, () => audio.ensureStarted());

  function handleMenuOrGameoverInput() {
    const events = drainQueue(game.input);
    for (const evt of events) {
      if (evt.type === 'click' || evt.type === 'confirm' || evt.type === 'fireStart') {
        if (game.state === 'menu' || game.state === 'gameover') {
          resetGame(game, data);
        }
      }
    }
  }

  // Deterministic single-step driver for headless/hidden-tab testing:
  // steps N fixed updates (or menu input handling) then renders once.
  game.debugStep = (steps = 1) => {
    for (let i = 0; i < steps; i++) {
      if (game.state === 'playing') update(game, FIXED_DT);
      else handleMenuOrGameoverInput();
    }
    render(game);
    return game.state;
  };

  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.25) dt = 0.25; // clamp huge tab-switch gaps
    accumulator += dt;
    if (accumulator > MAX_ACCUMULATED) accumulator = MAX_ACCUMULATED;

    if (game.state === 'playing') {
      while (accumulator >= FIXED_DT) {
        update(game, FIXED_DT);
        accumulator -= FIXED_DT;
      }
    } else {
      handleMenuOrGameoverInput();
      // still tick turret aim for reticle visuals on menu/gameover
      Turret.updateAim(game.turret || Turret.createTurret(data.weapons.weapons), game.input.mouseX, game.input.mouseY);
      if (!game.turret) {
        // lazily create a turret just for menu reticle rendering
      }
    }

    render(game);
    requestAnimationFrame(frame);
  }

  // create an initial (throwaway) turret so menu can render a reticle/HUD-free screen safely
  game.turret = Turret.createTurret(data.weapons.weapons);

  requestAnimationFrame(frame);
}

main();
