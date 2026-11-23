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
import * as Bosses from './systems/bosses.js';
import * as UpgradeSystem from './systems/upgradeSystem.js';
import * as CameraShake from './systems/cameraShake.js';
import { movementBehaviors } from './systems/movementBehaviors.js';
import { fireModeHandlers } from './systems/weaponSystem.js';

const DATA_FILES = {
  weapons: 'data/weapons.json',
  enemies: 'data/enemies.json',
  waves: 'data/waves.json',
  crates: 'data/crates.json',
  scenery: 'data/scenery.json',
  upgrades: 'data/upgrades.json',
};

// Display name. "Beach Head" is a live trademark (Access Software 1983 /
// Digital Fusion's "Beach Head 2000") — the mechanics are free to clone, the
// name is not. Change this ONE constant to rename the game everywhere it shows.
const GAME_TITLE = 'SHORE PATROL';

// Debug-panel spawn depth per enemy `domain` (data field, not an enemy id).
const DEBUG_SPAWN_Y = { land: 0.7, air: 0.5, sea: 1.0 };

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
  for (const enemy of data.enemies.enemies) {
    if (!movementBehaviors[enemy.movement]) {
      console.error(`main: unknown movement id "${enemy.movement}" on enemy "${enemy.id}" — skipping entry`);
      continue;
    }
    validEnemies.push(enemy);
  }
  data.enemies.enemies = validEnemies;

  const validWeapons = [];
  for (const weapon of data.weapons.weapons) {
    if (!fireModeHandlers[weapon.fireMode]) {
      console.error(`main: unknown fireMode id "${weapon.fireMode}" on weapon "${weapon.id}" — skipping entry`);
      continue;
    }
    validWeapons.push(weapon);
  }
  data.weapons.weapons = validWeapons;

  // Upgrades are a hard dependency: a missing/malformed data/upgrades.json must
  // fail loudly here rather than leaving the panel silently empty.
  const categories = data.upgrades && data.upgrades.categories;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('main: data/upgrades.json must define a non-empty "categories" array');
  }
  for (const category of categories) {
    if (!category.key || !Array.isArray(category.tiers) || category.tiers.length === 0) {
      throw new Error(`main: upgrade category "${category.key}" must have a key and a non-empty tiers array`);
    }
  }

  return data;
}

// Collect every distinct `sprite` path referenced anywhere in the loaded
// data (enemies, crates), plus the optional background convention path.
// Tolerates absence of the field entirely (that's today's baseline state).
// `sprite` may be a single path string (static) OR an array of path strings
// (animation frames) — collect every member in the array case.
function addSpritePaths(paths, sprite) {
  if (!sprite) return;
  if (Array.isArray(sprite)) {
    for (const spritePath of sprite) {
      if (spritePath) paths.add(spritePath);
    }
  } else {
    paths.add(sprite);
  }
}

function collectSpritePaths(data) {
  const paths = new Set();
  paths.add('assets/background.png');
  paths.add('assets/frames/battleship.png');          // battleship boss hull (bosses.js)
  paths.add('assets/frames/battleship_damaged.png');  // battle-damaged swap (bosses.js)
  paths.add('assets/frames/bomber.png');               // air-raid bomber (bosses.js)
  paths.add('assets/frames/bomber_escort.png');        // fighter escort (bosses.js)
  for (const enemy of data.enemies.enemies) {
    addSpritePaths(paths, enemy.sprite);
    addSpritePaths(paths, enemy.deathSprite);
    addSpritePaths(paths, enemy.partSprite);
    addSpritePaths(paths, enemy.fireSprite);
    addSpritePaths(paths, enemy.beachedSprite);
  }
  for (const crate of data.crates.crates) {
    addSpritePaths(paths, crate.sprite);
  }
  for (const weapon of data.weapons.weapons) {
    addSpritePaths(paths, weapon.turretSprite);
  }
  // Static beach scenery (obstacles/defences) — pure data, no id literals.
  if (data.scenery && data.scenery.props) {
    for (const prop of data.scenery.props) addSpritePaths(paths, prop.sprite);
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
    state: 'menu', // menu | playing | paused | gameover | victory
    time: 0,
    // End-screen decompress/animation ages, ticked while in that state
    gameoverAge: 0,
    victoryAge: 0,
    victoryPending: false,
    isNewBest: false,
    // Ambient visual state — always active, survive game resets
    whitecaps: [],
    whitecapTimer: 0,
    clouds: [],
    tidalPhase: 0,
    // Debug
    godMode: false,
    // Boss state (reset each game)
    bosses: [],
    nukeDetonated: false,
    // Shared screen-shake accumulator. Producers add to it; systems/cameraShake.js
    // is the only consumer (decays it in update, applies it in render).
    screenShake: 0,
  };
  return game;
}

// ---- Ambient visual helpers (clouds, whitecaps, tidal) ----

function makeCloud(x) {
  return {
    x,
    y: 20 + Math.random() * (HORIZON_Y * 0.6),
    w: 80 + Math.random() * 120,
    h: 25 + Math.random() * 35,
    speed: 8 + Math.random() * 12,
    alpha: 0.6 + Math.random() * 0.35,
    puffs: Array.from({ length: 3 + Math.floor(Math.random() * 3) }, (_, puffIndex) => ({
      dx: (puffIndex - 1.5) * 28,
      dy: Math.random() * 12 - 6,
      r: 18 + Math.random() * 18,
    })),
  };
}

const HORIZON_Y = 260;
const SEA_Y_MAIN = 420;
const CANVAS_W_MAIN = 1280;

function initClouds(game) {
  game.clouds = [];
  for (let cloudIndex = 0; cloudIndex < 6; cloudIndex++) {
    game.clouds.push(makeCloud(Math.random() * CANVAS_W_MAIN));
  }
}

function updateAmbience(game, dt) {
  // Whitecaps
  game.whitecapTimer -= dt;
  if (game.whitecapTimer <= 0) {
    game.whitecapTimer = 0.3 + Math.random() * 0.7;
    const whitecapX = Math.random() * CANVAS_W_MAIN;
    // The painted waterline is a sloped trapezoid (high-left y≈345 → low-right
    // y≈440), so cap each whitecap's near edge at the local water depth instead
    // of a flat SEA_Y — otherwise left-side foam spawns on the sand.
    const waterY = 345 + 95 * (whitecapX / CANVAS_W_MAIN);
    const whitecapY = HORIZON_Y + Math.random() * (waterY - HORIZON_Y);
    const depthRatio = (whitecapY - HORIZON_Y) / (waterY - HORIZON_Y);
    const maxLife = 0.8 + Math.random() * 1.2;
    game.whitecaps.push({
      x: whitecapX, y: whitecapY,
      w: (15 + Math.random() * 25) * (0.3 + depthRatio * 0.7),
      h: (3 + Math.random() * 4) * (0.3 + depthRatio * 0.7),
      life: maxLife, maxLife,
      vx: -20 - Math.random() * 15,
    });
  }
  for (let whitecapIndex = game.whitecaps.length - 1; whitecapIndex >= 0; whitecapIndex--) {
    const whitecap = game.whitecaps[whitecapIndex];
    whitecap.x += whitecap.vx * dt;
    whitecap.life -= dt;
    if (whitecap.life <= 0) game.whitecaps.splice(whitecapIndex, 1);
  }

  // Clouds
  for (const cloud of game.clouds) {
    cloud.x -= cloud.speed * dt;
    if (cloud.x + cloud.w < 0) {
      Object.assign(cloud, makeCloud(CANVAS_W_MAIN + 100));
    }
  }

  // Tidal phase — slow oscillation
  game.tidalPhase += dt * 0.8;
}

function initSystems(game, data) {
  ScoreSystem.init(game);
  SpawnSystem.init(game, data);
  WeaponSystem.init(game, data);
  CrateSystem.init(game, data);
  WaveDirector.init(game, data);
  Bosses.init(game, data);   // registers bossHitCallback / bossSplashCallback / bossAirTargetCallback
  UpgradeSystem.init(game, data);  // weapon tiers + upgrade panel state (data-driven)
  game.defense = 100;
  game.nukeDetonated = false;
  game.gameoverAge = 0;
  game.victoryAge = 0;
  game.victoryPending = false;
  game.isNewBest = false;
  game.state = 'playing';
}

function resetGame(game, data) {
  game.bosses = [];
  game.nukeDetonated = false;
  initSystems(game, data);
}

function update(game, dt) {
  // Runs in every state so leftover shake keeps settling while paused/game over.
  CameraShake.update(game, dt);
  if (game.state !== 'playing') return;
  game.time += dt;
  if (game.godMode) game.defense = 100; // debug: full defense always

  const turret = game.turret;
  Turret.updateAim(turret, game.input.mouseX, game.input.mouseY);

  const events = drainQueue(game.input);
  for (const evt of events) {
    if (evt.type === 'pause') {
      game.state = 'paused';
      continue;
    }
    if (evt.type === 'menu') continue;
    // Upgrade system intercepts fireStart clicks when a panel is open
    // or when the player clicks a landed crate — returns true to suppress fire.
    if (evt.type === 'fireStart') {
      const consumed = UpgradeSystem.handleClick(
        game, game.turret.aimX, game.turret.aimY,
      );
      if (consumed) continue;
    }
    WeaponSystem.handleInputEvent(game, evt);
  }

  if (game.state !== 'playing') return;

  WeaponSystem.update(game, dt);
  SpawnSystem.update(game, dt);
  CrateSystem.update(game, dt);
  WaveDirector.update(game, dt);
  Bosses.update(game, dt);   // boss logic runs after wave director
  ScoreSystem.update(game, dt);

  // Victory: waveDirector cleared the final stage and declined to loop.
  if (game.victoryPending && game.state === 'playing') {
    game.victoryPending = false;
    game.state = 'victory';
    game.victoryAge = 0;
    const prevBest = ScoreSystem.loadBest();
    game.bestScore = ScoreSystem.saveBestIfHigher(game.score);
    game.isNewBest = game.score > prevBest;
    game.audio.play('victory');
    return;
  }

  // Nuke detonation: immediate game over with special flag already set
  if (game.nukeDetonated && game.state === 'playing') {
    game.defense = 0;
    game.state = 'gameover';
    game.gameoverAge = 0;
    const prevBest = ScoreSystem.loadBest();
    game.bestScore = ScoreSystem.saveBestIfHigher(game.score);
    game.isNewBest = game.score > prevBest;
    game.audio.play('gameover');
    return;
  }

  if (game.defense <= 0) {
    game.defense = 0;
    game.state = 'gameover';
    game.gameoverAge = 0;
    const prevBest = ScoreSystem.loadBest();
    game.bestScore = ScoreSystem.saveBestIfHigher(game.score);
    game.isNewBest = game.score > prevBest;
    game.audio.play('gameover');
  }
}

function renderPlaying(ctx, game) {
  Renderer.drawBackground(ctx, game.time);

  // Ambient visuals — after background, before entities
  if (game.clouds && game.clouds.length > 0) Renderer.drawClouds(ctx, game.clouds);
  if (game.whitecaps && game.whitecaps.length > 0) Renderer.drawWhitecaps(ctx, game.whitecaps);
  Renderer.drawTidal(ctx, game.tidalPhase || 0);

  // Boss SHIP (world) — far out in the water, so it draws BEFORE the foreground
  // entities/crates that land on the beach in front of it. Its HP panel is a
  // screen-fixed HUD, drawn later via Bosses.drawHud so it stays on top.
  Bosses.draw(ctx, game);

  // draw entities sorted far-to-near (by d desc) so nearer overlaps farther
  const sceneryProps = (game.data.scenery && game.data.scenery.props) || [];
  const drawList = [...game.entities, ...game.crates, ...sceneryProps];
  drawList.sort((a, b) => {
    const da = a.kind === 'crate' ? (1 - a.alt) : a.d;
    const db = b.kind === 'crate' ? (1 - b.alt) : b.d;
    return db - da;
  });

  // BUG FIX (Round 4 §5, tank hitbox-disappears report): the weapon rack
  // HUD (Renderer.drawTurret, below) is a screen-fixed prop that used to be
  // painted after every entity regardless of depth, so a land/sea entity
  // close enough to the bunker that its sprite bottom reaches into the
  // rack's screen band got visually erased by the rack even though its
  // hit-rect (weaponSystem.js) was always intact and clickable. Entities
  // whose projected bottom edge is at/below Renderer.CONSTANTS.RACK_NEAR_Y
  // are held back here and redrawn AFTER the rack (near occludes far),
  // matching the depth rule the rest of the scene already follows.
  const nearRedraws = [];
  for (const e of drawList) {
    if (e.kind === 'crate') {
      const { sx, sy, scale } = Renderer.project(e.x, 0, e.alt, 'air');
      Renderer.drawCrate(ctx, sx, sy, scale, e.type.color, e.type, e.age);
    } else if (!e.type) {
      // static scenery prop (data/scenery.json) — no `type`, just sprite/x/d/scale
      const { sx, sy, scale } = Renderer.project(e.x, e.d, 0, 'land');
      Renderer.drawSceneryProp(ctx, e, sx, sy, scale);
    } else {
      const domain = e.type.domain;
      const { sx, sy, scale } = Renderer.project(e.x, e.d, e.alt, domain);
      Renderer.drawEntityGlyph(ctx, e, sx, sy, scale);
      if (domain !== 'air' && sy >= Renderer.CONSTANTS.RACK_NEAR_Y) {
        nearRedraws.push({ e, sx, sy, scale });
      }
    }
  }

  // (Boss SHIP is now drawn earlier, before the entity/crate loop, so foreground
  // crates/entities render in front of it. Its HP panel is drawn later, with the
  // HUD, via Bosses.drawHud.)

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
    } else if (fx.kind === 'enemy_muzzle') {
      // W4: flash at the sprite's muzzle point (screen coords stored at fire time)
      Renderer.drawEnemyMuzzleFlash(ctx, fx.screenX, fx.screenY, fx.scale || 1, 1 - t01);
    }
  }

  // FIX 4: explosion particle debris
  if (game.particles && game.particles.length > 0) {
    Renderer.drawParticles(ctx, game.particles);
  }

  // FIX 5: water/sand impact splashes
  if (game.splashes && game.splashes.length > 0) {
    Renderer.drawSplashes(ctx, game.splashes);
  }

  Renderer.drawTurret(ctx, game.turret);

  // Redraw close-range entities held back above so they occlude the rack
  // instead of the rack occluding them (see nearRedraws comment above).
  for (const { e, sx, sy, scale } of nearRedraws) {
    Renderer.drawEntityGlyph(ctx, e, sx, sy, scale);
  }

  const weapon = Turret.activeWeapon(game.turret);
  Renderer.drawReticle(ctx, game.turret.aimX, game.turret.aimY, weapon.reticle, weapon.color);

  Bosses.drawHud(ctx, game); // boss section-HP panel — screen-fixed, on top
  HUD.render(ctx, game);
  UpgradeSystem.draw(ctx, game); // upgrade panel on top of everything
}

// Draw text with a soft dark shadow underneath for legibility over the bright
// sky/sand. Reused by menu/pause/gameover overlays.
function shadowText(ctx, text, x, y) {
  ctx.save();
  const fill = ctx.fillStyle;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function renderMenu(ctx, game) {
  Renderer.drawBackground(ctx, game.time);
  if (game.clouds && game.clouds.length > 0) Renderer.drawClouds(ctx, game.clouds);
  if (game.whitecaps && game.whitecaps.length > 0) Renderer.drawWhitecaps(ctx, game.whitecaps);
  Renderer.drawTidal(ctx, game.tidalPhase || 0);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffd24a';
  ctx.font = 'bold 84px monospace';
  shadowText(ctx, GAME_TITLE, 640, 250);

  ctx.fillStyle = '#cfe';
  ctx.font = '20px monospace';
  shadowText(ctx, 'Man the beach guns. Hold the line.', 640, 300);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px monospace';
  shadowText(ctx, 'Click or press ENTER to start', 640, 380);

  ctx.fillStyle = '#aac';
  ctx.font = '16px monospace';
  shadowText(ctx, `Best score: ${game.bestScore || ScoreSystem.loadBest()}`, 640, 420);

  // Controls legend
  ctx.fillStyle = '#9aa4b2';
  ctx.font = '15px monospace';
  shadowText(ctx, 'Mouse aim  ·  Hold LMB fire  ·  1-4 select weapon  ·  Q/E or wheel cycle', 640, 500);
  shadowText(ctx, 'P pause  ·  F fullscreen', 640, 524);
  ctx.restore();
}

function renderPaused(ctx, game) {
  renderPlaying(ctx, game);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24a';
  ctx.font = 'bold 72px monospace';
  shadowText(ctx, 'PAUSED', 640, 320);
  ctx.fillStyle = '#fff';
  ctx.font = '22px monospace';
  shadowText(ctx, 'ESC / P — resume', 640, 384);
  ctx.fillStyle = '#ccc';
  ctx.font = '18px monospace';
  shadowText(ctx, 'M — return to menu', 640, 420);
  ctx.restore();
}

// Shared canvas-drawn YES/NO retry buttons — coordinates used both for
// hover/hit-testing in input handling and for rendering.
function getEndScreenButtons() {
  return {
    yes: { x: 640 - 170, y: 590, w: 140, h: 56, label: 'YES' },
    no: { x: 640 + 30, y: 590, w: 140, h: 56, label: 'NO' },
  };
}

function pointInButton(x, y, btn) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

function drawButton(ctx, btn, hovered) {
  ctx.save();
  const { x, y, w, h } = btn;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = hovered ? 'rgba(255,210,74,0.92)' : 'rgba(255,255,255,0.15)';
  ctx.strokeStyle = hovered ? '#ffd24a' : '#fff';
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hovered ? '#1a1a1a' : '#fff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, x + w / 2, y + h / 2 + 2);
  ctx.restore();
}

// "Play again?" + YES/NO buttons, shared by both end screens.
function drawRetryPrompt(ctx, game) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  shadowText(ctx, 'Play again?', 640, 560);
  ctx.restore();

  const btns = getEndScreenButtons();
  const mx = game.input.mouseX, my = game.input.mouseY;
  drawButton(ctx, btns.yes, pointInButton(mx, my, btns.yes));
  drawButton(ctx, btns.no, pointInButton(mx, my, btns.no));
}

function renderGameover(ctx, game) {
  renderPlaying(ctx, game);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';

  // 1s non-interactive decompress: title fades/grows in before the score
  // panel and retry prompt appear — kills the abruptness of a sudden loss.
  const age = game.gameoverAge || 0;
  const introT = Math.min(1, age / 1.0);
  const decompressed = introT >= 1;

  ctx.save();
  ctx.globalAlpha = introT;
  const titleCx = 640, titleCy = game.nukeDetonated ? 230 : 260;
  ctx.translate(titleCx, titleCy);
  const s = 0.6 + 0.4 * introT;
  ctx.scale(s, s);
  ctx.translate(-titleCx, -titleCy);
  if (game.nukeDetonated) {
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 58px monospace';
    shadowText(ctx, '☢ NUCLEAR STRIKE ☢', titleCx, titleCy);
  } else {
    ctx.fillStyle = '#ff5050';
    ctx.font = 'bold 64px monospace';
    shadowText(ctx, 'BASE OVERRUN', titleCx, titleCy);
  }
  ctx.restore();

  if (game.nukeDetonated) {
    ctx.save();
    ctx.globalAlpha = introT;
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 24px monospace';
    shadowText(ctx, 'THE BOMBER REACHED THE COASTLINE', 640, 286);
    ctx.fillStyle = '#ff9966';
    ctx.font = '20px monospace';
    shadowText(ctx, 'The nuclear payload was released.', 640, 316);
    shadowText(ctx, 'The beach, and everything beyond it, is gone.', 640, 340);
    ctx.restore();
  }

  if (decompressed) {
    const info = WaveDirector.currentWaveInfo(game);
    const stageLabel = info.isLooping
      ? `Endless Wave ${info.loopCount}`
      : `Stage ${info.id}/${info.total}`;
    const baseY = game.nukeDetonated ? 380 : 400;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px monospace';
    shadowText(ctx, `Score: ${game.score}`, 640, baseY);
    ctx.fillStyle = '#ffd24a';
    ctx.font = '22px monospace';
    shadowText(ctx, `Best: ${game.bestScore}`, 640, baseY + 36);
    let nextY = baseY + 64;
    if (game.isNewBest) {
      ctx.fillStyle = '#7dffb0';
      ctx.font = 'bold 20px monospace';
      shadowText(ctx, 'NEW BEST!', 640, nextY);
      nextY += 28;
    }
    ctx.fillStyle = '#ccc';
    ctx.font = '16px monospace';
    shadowText(ctx, stageLabel, 640, nextY);

    drawRetryPrompt(ctx, game);
  }

  ctx.restore();
}

function renderVictory(ctx, game) {
  renderPlaying(ctx, game);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';

  const age = game.victoryAge || 0;
  const introT = Math.min(1, age / 0.6);

  ctx.save();
  ctx.globalAlpha = introT;
  const cx = 640, cy = 220;
  ctx.translate(cx, cy);
  const s = 0.6 + 0.4 * introT;
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = '#ffd24a';
  ctx.font = 'bold 72px monospace';
  shadowText(ctx, 'BEACH SECURED', cx, cy);
  ctx.restore();

  const info = WaveDirector.currentWaveInfo(game);
  const stageLabel = `Stages cleared: ${info.id}/${info.total}`;

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px monospace';
  shadowText(ctx, `Score: ${game.score}`, 640, 320);
  ctx.fillStyle = '#ffd24a';
  ctx.font = '24px monospace';
  shadowText(ctx, `Best: ${game.bestScore}`, 640, 358);
  let nextY = 392;
  if (game.isNewBest) {
    ctx.fillStyle = '#7dffb0';
    ctx.font = 'bold 22px monospace';
    shadowText(ctx, 'NEW BEST!', 640, nextY);
    nextY += 28;
  }
  ctx.fillStyle = '#cfe';
  ctx.font = '18px monospace';
  shadowText(ctx, stageLabel, 640, nextY);

  drawRetryPrompt(ctx, game);

  ctx.restore();
}

function render(game) {
  const ctx = game.ctx;
  // The backing store is 1280*dpr x 720*dpr (see index.html initBackingStore).
  // This transform makes every draw call below use logical 1280x720 pixels,
  // so no drawing coordinate anywhere else changes. Camera shake nests inside.
  const dpr = window.__DPR__ || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 1280, 720);
  if (game.state === 'menu') {
    renderMenu(ctx, game);
  } else {
    // Everything but the menu shakes as one frame. apply()/restore() is a
    // balanced pair, so an outer transform can nest safely around it.
    CameraShake.apply(ctx, game);
    if (game.state === 'playing') {
      renderPlaying(ctx, game);
    } else if (game.state === 'paused') {
      renderPaused(ctx, game);
    } else if (game.state === 'gameover') {
      renderGameover(ctx, game);
    } else if (game.state === 'victory') {
      renderVictory(ctx, game);
    }
    CameraShake.restore(ctx);
  }
}

async function main() {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  document.title = GAME_TITLE;

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
  initClouds(game);
  window.game = game; // debug/inspection handle

  // Debug API — accessed by index.html debug panel via window.game.debug
  game.debug = {
    // Generic, data-derived spawner: game.debug.spawn('<enemy id>', count?).
    // Aliases (spawn<Id> / spawn<Shape>) are generated below from the loaded
    // enemy definitions, so no enemy id is written as a literal here.
    spawn: (id, count) => {
      if (game.state !== 'playing') return;
      const def = data.enemies.enemies.find(e => e.id === id);
      if (!def) { console.warn(`debug.spawn: unknown enemy id "${id}"`); return; }
      const diff = game.waveState ? game.waveState.difficulty : { hp: 1, speed: 1 };
      const y      = DEBUG_SPAWN_Y[def.domain] !== undefined ? DEBUG_SPAWN_Y[def.domain] : 0.7;
      const spread = def.shape === 'biped' ? 1.6 : 1.2;
      const n      = count || (def.shape === 'biped' ? 4 : 1);
      for (let i = 0; i < n; i++) {
        SpawnSystem.spawnEnemy(game, def.id, (Math.random() - 0.5) * spread, y, diff);
      }
    },
    spawnAmmo: () => {
      if (game.state !== 'playing') return;
      const crateIds = data.crates.crates.map(c => c.id);
      if (crateIds.length > 0) CrateSystem.spawnCrate(game, crateIds);
    },
    nextRound: () => {
      if (game.state !== 'playing') return;
      WaveDirector.debugForceNextWave(game);
    },
    killAll: () => {
      if (game.state !== 'playing') return;
      for (const e of game.entities) {
        if (!e.dead && !e.dying) e.hp = 0;
      }
    },
    toggleGodMode: () => {
      game.godMode = !game.godMode;
      if (game.godMode) game.defense = 100;
      return game.godMode;
    },
    spawnBattleship: () => {
      if (game.state !== 'playing') return;
      Bosses.spawnBoss(game, 'battleship', 5);
    },
    spawnBomber: () => {
      if (game.state !== 'playing') return;
      Bosses.spawnBoss(game, 'bomber', 7);
    },
  };

  // Generate spawn<Name> aliases from the loaded enemy definitions so the
  // existing debug panel buttons in index.html keep working without any enemy
  // id being spelled out in source. Both the enemy `id` and its `shape` field
  // yield an alias; the first definition to claim a name wins.
  {
    const cap = str => str.replace(/(?:^|_)([a-z])/g, (_, ch) => ch.toUpperCase());
    for (const def of data.enemies.enemies) {
      for (const token of [def.id, def.shape]) {
        if (!token) continue;
        const name = 'spawn' + cap(token);
        if (game.debug[name]) continue;
        game.debug[name] = () => game.debug.spawn(def.id);
      }
    }
  }

  attachInput(canvas, game.input, () => audio.ensureStarted());

  // Handles input for menu, gameover, and victory states. Menu keeps its
  // original "any click/confirm starts a run" behavior. Gameover/victory
  // show a YES/NO retry prompt: keyboard (Y/Enter=yes, N/Esc=no) or a
  // canvas-coordinate click hit-test against the prompt's button zones.
  // Gameover additionally ignores all of this during its 1s decompress.
  function handleEndScreenInput() {
    const events = drainQueue(game.input);
    const state = game.state;
    for (const evt of events) {
      if (state === 'menu') {
        if (evt.type === 'click' || evt.type === 'confirm' || evt.type === 'fireStart') {
          resetGame(game, data);
        }
        continue;
      }
      if (state !== 'gameover' && state !== 'victory') continue;

      const decompressing = state === 'gameover' && (game.gameoverAge || 0) < 1.0;
      if (decompressing) continue; // ignore all inputs during the intro

      if (evt.type === 'confirm' || evt.type === 'confirmYes') {
        resetGame(game, data);
      } else if (evt.type === 'confirmNo') {
        game.state = 'menu';
      } else if (evt.type === 'click') {
        const btns = getEndScreenButtons();
        const x = evt.x != null ? evt.x : game.input.mouseX;
        const y = evt.y != null ? evt.y : game.input.mouseY;
        if (pointInButton(x, y, btns.yes)) resetGame(game, data);
        else if (pointInButton(x, y, btns.no)) game.state = 'menu';
      }
    }
  }

  // Processes input while paused: ESC/P resumes, M returns to the menu.
  // No update ticks happen here — the scene stays frozen.
  function handlePausedInput() {
    const events = drainQueue(game.input);
    for (const evt of events) {
      if (evt.type === 'pause') {
        game.state = 'playing';
      } else if (evt.type === 'menu') {
        // Abandoning a run still counts: record its score before leaving
        // (game over / victory already do this).
        game.bestScore = ScoreSystem.saveBestIfHigher(game.score);
        game.state = 'menu';
      }
    }
  }

  // Deterministic single-step driver for headless/hidden-tab testing:
  // steps N fixed updates (or menu/paused input handling) then renders once.
  game.debugStep = (steps = 1) => {
    for (let i = 0; i < steps; i++) {
      if (game.state === 'playing') update(game, FIXED_DT);
      else if (game.state === 'paused') handlePausedInput();
      else {
        // Covers menu, gameover, AND victory generically — victory needs no
        // special case, it just falls through like any other non-playing,
        // non-paused state.
        if (game.state === 'gameover') game.gameoverAge = (game.gameoverAge || 0) + FIXED_DT;
        if (game.state === 'victory') game.victoryAge = (game.victoryAge || 0) + FIXED_DT;
        handleEndScreenInput();
      }
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

    // Always update ambient visuals (clouds, whitecaps, tidal) regardless of game state
    updateAmbience(game, dt);

    if (game.state === 'playing') {
      while (accumulator >= FIXED_DT) {
        update(game, FIXED_DT);
        accumulator -= FIXED_DT;
      }
    } else if (game.state === 'paused') {
      handlePausedInput();
      // scene stays frozen; discard accumulated time so resume doesn't
      // burst-run catch-up ticks
      accumulator = 0;
    } else {
      if (game.state === 'gameover') game.gameoverAge = (game.gameoverAge || 0) + dt;
      if (game.state === 'victory') game.victoryAge = (game.victoryAge || 0) + dt;
      handleEndScreenInput();
      // still tick turret aim for reticle visuals on menu/gameover/victory
      Turret.updateAim(game.turret || Turret.createTurret(data.weapons.weapons), game.input.mouseX, game.input.mouseY);
    }

    render(game);
    requestAnimationFrame(frame);
  }

  // create an initial (throwaway) turret so menu can render a reticle/HUD-free screen safely
  game.turret = Turret.createTurret(data.weapons.weapons);

  requestAnimationFrame(frame);
}

main();
