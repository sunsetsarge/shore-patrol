# Beachhead — SPEC v1.0 (2026-07-03, Fable architect)

Browser clone of *Beach Head 2000*'s core loop: stationary turret, mouse aim, 4 weapons,
ammo economy via shoot-the-crate resupply, land/sea/air enemies, wave escalation, defense
meter, score attack. **HTML5 Canvas + vanilla JS ES modules, no build step, no deps.**
Arcade tone: fast, loud, campy.

## 0. The modularity contract (non-negotiable)

All content lives in `/data/*.json`. Engine and systems code operate ONLY on the generic
schemas below — no code path may branch on a specific enemy/weapon/wave/crate id or name.
Dispatch happens on schema fields (`fireMode`, `movement`, `domain`), each implemented as
an entry in a registry object (`movementBehaviors.js` exports `{straight_approach: fn, ...}`;
`weaponSystem.js` has `fireModeHandlers = {auto: fn, single: fn, guided: fn}`). Adding
content = pasting a JSON block; adding a genuinely new *behavior* = adding one registry
entry. **Acceptance test: a 5th enemy type added to enemies.json alone must spawn, move,
take damage, and score with zero code edits.**

## 1. Presentation & world model (pseudo-3D "gunner view")

Fixed camera in the bunker looking out over the beach. Canvas 1280×720 letterboxed
(scale-to-fit window, preserve aspect; internal coordinates are always 1280×720).

- **Horizon** at y=260. Sky above (air domain), sea band y=260..420, beach/land y=420..640,
  bunker/HUD foreground y=640..720.
- Every entity has world coords `{x: -1..1 (lateral), d: 0..1 (distance, 1=horizon/far,
  0=at the bunker), alt: 0..1 (air only, 0=ground)}`.
- **Projection** (single shared function in renderer.js, `project(x, d, alt) -> {sx, sy, scale}`):
  - `scale = lerp(1.0, 0.18, d)` (near→far).
  - Ground entities: `sy = lerp(640, horizonYForDomain, d)` where horizonYForDomain =
    420 for land (they appear on the beach), 260 for sea (they appear on the water, sea
    craft use d 1→0.45 then convert/disgorge — see land_then_disgorge).
  - Air: `sy = lerp(320, 80, alt) - d*120` clamped ≥ 40.
  - `sx = 640 + x * 640 * lerp(1.0, 0.55, d)` (perspective pinch toward center at distance).
- **Aiming:** mouse position IS the reticle (crosshair sprite at cursor). Turret barrel
  drawn at bottom-center rotating to track reticle; clamp visible elevation so the barrel
  never aims below the parapet (reticle itself is unrestricted within canvas — this
  *represents* the original's 360°/±45° without a pan mechanic in v1).
- Placeholder art: flat polygons color-coded by domain — land = olive/brown, sea = navy/gray,
  air = dark gray on sky; crates = yellow box + white parachute triangle. Distinct silhouette
  per enemy type (infantry = small biped glyph, tank = box+barrel, craft = hull trapezoid,
  helicopter = body+spinning line rotor). Rotor spin + muzzle flash + shell tracer + splash
  explosion circles are code-drawn (see skill animation notes).

## 2. Combat model

- **Hitscan weapons** (`fireMode: auto|single` with `projectileSpeed: null`): on shot,
  test reticle point against each enemy's projected screen-space hitbox
  (`hitbox * scale`), nearest-d hit wins. MG and pistol are hitscan; draw a 1-frame tracer.
- **Ballistic** (`fireMode: single` with `projectileSpeed` set, e.g. howitzer): shell
  entity travels from muzzle to the reticle's world point (invert projection: from sy
  derive target d for the domain band under the cursor) over
  `flightTime = dist/projectileSpeed`; on arrival, explode: damage all enemies whose
  world-space distance (weighted: `|Δx|*640 + |Δd|*900`) ≤ `splashRadius` (data value,
  world units ~ pixels at near plane). Splash also hits crates.
- **Guided** (`fireMode: guided`): on fire, missile locks the air enemy nearest the
  reticle (within a generous cone, screen-space distance ≤ 140px); if none, flies to
  reticle point and detonates harmlessly. Homing: steer toward target each frame at
  `projectileSpeed`, hit when close.
- `targetDomains` on the weapon filters what a weapon can damage (missiles: ["air"];
  others: ["land","sea","air","crate"] as data says). Crates are hit-testable by any
  weapon whose targetDomains includes "crate".
- Enemy death: score += scoreValue × current streak multiplier; if `spawnsOnDeath`,
  spawnSystem spawns those entities at the dead entity's position.
- Enemies that reach d ≤ 0 (or a craft that lands) deal `damageToBase` to the defense
  meter and despawn (infantry "enter the bunker", aircraft strafe: helicopters instead
  hover at d≈0.3 and periodically deal damage until killed — that's what `hover_and_dive`
  encodes).
- Defense meter starts 100; 0 = game over.

## 3. Data schemas (exact)

### /data/weapons.json — `{ "weapons": [ ... ] }`
```json
{
  "id": "mg", "name": "Twin .50 Cal", "key": "1",
  "fireMode": "auto",              // auto | single | guided  (registry-dispatched)
  "fireRate": 10,                  // shots/sec (auto) or max trigger rate (single/guided)
  "damage": 4,
  "splashRadius": 0,               // world units; 0 = point hit
  "ammo": 400,                     // null = infinite
  "projectileSpeed": null,         // null = hitscan; number = world units/sec
  "targetDomains": ["land","sea","air","crate"],
  "sound": "mg",                   // cue id into audio synth registry
  "color": "#ffd24a",              // tracer/projectile color
  "reticle": "cross"               // cross | circle | diamond (drawn per weapon)
}
```
v1 weapons: `mg` (auto, 400 ammo, dmg 4, rate 10), `howitzer` (single, ballistic speed 1.6,
splash 120, dmg 60, ammo 12, rate 0.8), `sam` (guided, dmg 80, ammo 8, rate 1, air-only),
`pistol` (single hitscan, dmg 2, rate 4, ammo null). Keys 1-4; Q/E or wheel cycles.

### /data/enemies.json — `{ "enemies": [ ... ] }`
```json
{
  "id": "infantry", "name": "Rifleman", "domain": "land",
  "hp": 8, "speed": 0.045,          // d-units/sec toward bunker
  "movement": "straight_approach",  // registry id in movementBehaviors.js
  "hitbox": 26,                     // base radius px at near plane (scaled by projection)
  "scoreValue": 100,
  "damageToBase": 4,
  "fireDamage": 0,                  // for hover_and_dive shooters: dmg per volley
  "fireInterval": 0,                // seconds between volleys (0 = never shoots)
  "spawnsOnDeath": null,            // or {"enemyId":"infantry","count":4,"spread":0.12}
  "color": "#7a8b3a", "shape": "biped",   // biped|tank|boat|heli (renderer glyph registry — visual only)
  "behaviorScript": null            // v1 unused; boss hook
}
```
v1 enemies: `infantry` (land, straight_approach), `tank` (land, straight_approach, slow,
hp 120, dmg 15), `landing_craft` (sea, land_then_disgorge → spawns 4 infantry at d=0.45,
hp 90), `helicopter` (air, hover_and_dive, hp 60, fireDamage 6 / fireInterval 3),
plus `commando` (land, strafe_weave, fast, hp 10) to prove the 4th movement behavior.

Movement behaviors (v1 registry, each `(entity, dt, api) -> void`): `straight_approach`
(d decreases at speed, x fixed w/ slight jitter), `strafe_weave` (approach + sinusoidal x),
`hover_and_dive` (air: approach to d=0.3, hover with x-drift, volley on fireInterval),
`land_then_disgorge` (sea: approach to d=0.45, pause 1s, die → spawnsOnDeath fires, no score... **correction: award score only on player kill; on self-disgorge, despawn without score**).

### /data/waves.json — `{ "waves": [ ... ] }`
```json
{
  "id": 1, "name": "First Landing",
  "duration": 45,                   // seconds; wave ends at duration OR all-spawned-and-cleared
  "difficulty": {"hp": 1.0, "speed": 1.0},
  "spawns": [ {"enemyId":"infantry","count":8,"interval":3.5,"startDelay":2} ],
  "crates": {"interval": 18, "types": ["mg_crate","howitzer_crate"]}   // weighted by crates.json spawnWeight
}
```
5 waves escalating: (1) infantry only → (2) +craft → (3) +tank+commando → (4) +helicopter →
(5) everything, tighter intervals, difficulty {hp:1.4, speed:1.2}. After the last wave,
waveDirector loops the final wave with difficulty × 1.15 per loop (endless plateau — matches
the original's "no traditional win").

### /data/crates.json — `{ "crates": [ ... ] }`
```json
{ "id":"mg_crate","weaponId":"mg","amount":200,"dropSpeed":0.055,"spawnWeight":3,"color":"#e8c832" }
```
One crate per limited weapon (mg 200, howitzer 6, sam 4). Crates spawn at random x at
alt=1 and descend; shooting one (any point/splash hit) collects it (refill capped at the
weapon's ammo capacity, +250 pts × streak); reaching alt=0 = lost.

## 4. File structure & module contracts

Exactly the layout from the build prompt (`index.html`, `src/main.js`, `src/engine/{renderer,
input,collision,entity,turret}.js`, `src/systems/{weaponSystem,spawnSystem,movementBehaviors,
crateSystem,waveDirector,scoreSystem,hud}.js`, `/data/*.json`, `README.md`). Plus
`play.bat` + `play.ps1` (start `python -m http.server 8123` from repo root — fall back to
`npx serve` if no python — then open browser). README explains why (ES modules can't fetch
JSON over file://).

- `main.js`: loads all four JSON files via `Promise.all(fetch)`, validates minimally
  (unknown movement/fireMode id → console.error naming the bad id + skip entry, don't
  crash), owns the state machine `menu → playing → gameover → (restart)`, fixed-timestep
  update (60 Hz accumulator) + rAF render, and a shared `game` context object passed to
  systems (entities array, turret, score, defense, wave state, rng).
- Systems are stateless-ish modules exporting `init(game, data)` + `update(game, dt)`;
  renderer exports `render(game)` and `project()`; input emits into a small event queue
  (`game.input`) — no system reads the DOM directly except input.js.
- `scoreSystem`: kill/crate points, streak multiplier (+0.1 per kill w/o base damage, max
  ×3, reset when defense takes damage), tracks `bestScore` via localStorage
  (`beachhead.best`) — read/written but only displayed on menu + gameover.
- `hud.js`: canvas-drawn — per-weapon ammo pips w/ active highlight, score, wave name/number,
  defense bar, streak multiplier, "AMMO" flash when firing empty weapon (auto-suggest
  switch? no — just flash + click sound).
- Audio: **Web Audio synth only, no files** — registry `sounds = {mg, howitzer, sam,
  pistol, explode, crate, hit, alarm, click, wave, gameover}` built from oscillators +
  noise buffers (see browser-game-builder skill audio recipes). Instantiate AudioContext
  on first user gesture.

## 5. Acceptance criteria (judge checks these against the running game)

1. `python -m http.server` serve → open → **zero console errors** through menu → play →
   game over → restart.
2. Mouse moves reticle; turret barrel tracks; LMB fires; keys 1-4 + wheel switch weapons;
   HUD ammo counts drop; empty weapon won't fire (flash + click).
3. Howitzer shell has visible flight + splash killing clustered infantry; SAM only locks
   air; pistol always available.
4. Crates parachute in, are shootable, refill the tagged weapon, are lost if they land.
5. 5 waves visibly escalate; wave banner shows; after wave 5 it loops harder.
6. Enemies reaching the bunker damage the defense bar; 0 → game-over screen with final
   score + best score + click/key to restart (fresh run, no reload needed).
7. Landing craft disgorges infantry when destroyed OR when it self-lands.
8. **Modularity proof:** append a new enemy JSON block (e.g. `heavy_tank`, existing
   movement id) + reference it in a wave — it works with no JS edits. README's "Adding
   new content" section shows this exact worked example plus a weapon and a wave example.
9. Engine code contains no enemy/weapon id string literals (grep test: `grep -rn
   "howitzer\|infantry\|helicopter\|landing_craft" src/` returns nothing).
10. Expansion seams present: `behaviorScript` field tolerated (ignored) by loader;
    fireMode registry object; waveDirector takes a wave array parameter; scoreSystem
    separates run score from persisted best.
