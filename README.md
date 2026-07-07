# Shore Patrol

*(working title — repo folder stays `Beachhead`; the display name lives in the
`GAME_TITLE` constant in `src/main.js`, changeable in one line. "Beach Head" is
a trademark; this is an original re-implementation of the mechanics.)*

A browser arcade shooter in the mold of the classic beach-defense games:
stationary turret, mouse aim,
4 weapons, ammo economy via shoot-the-crate resupply, land/sea/air enemies,
escalating waves, a defense meter, and score attack. Pure HTML5 Canvas +
vanilla JS ES modules. No build step, no dependencies, no audio files
(all sound is synthesized with the Web Audio API).

## How to play

Run one of:

```
play.bat     (double-click, or from cmd.exe)
play.ps1     (from PowerShell)
```

Either script starts a local static file server (`python -m http.server 8123`,
falling back to `npx serve` if Python isn't installed) and opens
`http://localhost:8123` in your default browser.

**You cannot just double-click `index.html` and open it as a `file://` URL.**
`main.js` is loaded as an ES module and uses `fetch()` to load the JSON data
files in `/data`. Browsers block both module `import` resolution and `fetch`
of local files under the `file://` scheme for security reasons — you'll get a
CORS or "Failed to fetch" error in the console. Serving over `http://`
(even just localhost) fixes this because it's treated as a normal, same-origin
web request.

## Controls

| Input | Action |
|---|---|
| Mouse move | Aim the reticle / turret barrel |
| Left mouse button (hold) | Fire the active weapon (auto weapons keep firing while held) |
| `1` `2` `3` `4` | Select weapon directly (MG / Howitzer / SAM / Pistol) |
| `Q` / `E` | Cycle to previous / next weapon |
| Mouse wheel | Cycle weapons |
| Click / `Enter` | Start game from the menu, or restart after game over |
| `Escape` / `P` | Pause / resume the game |
| `M` (while paused) | Return to the menu |

## Gameplay notes

- Shoot down infantry, tanks, landing craft, and helicopters before they reach
  your bunker (they damage your **defense meter**; 0% = game over).
- Landing craft disgorge infantry either when destroyed early or when they
  reach the beach and land on their own.
- Ammo crates parachute in periodically — shoot one to collect it (refills the
  tagged weapon's ammo, capped at its max) or let it hit the ground and lose it.
- Kill streaks build a score multiplier (+0.1 per kill, capped at x3); taking
  base damage resets the streak.
- 5 waves escalate in variety and difficulty. After wave 5, the game loops
  wave 5 forever at +15% difficulty per loop — there's no traditional "win,"
  just a high score chase.
- Your best score persists in the browser's `localStorage` and is shown on the
  menu and game-over screens.

## Project layout

```
index.html                  canvas + letterbox scaling + control hints
src/main.js                 data loading/validation, state machine, game loop
src/audio.js                 Web Audio synth sound registry
src/engine/renderer.js      projection math + all canvas drawing
src/engine/input.js         DOM input -> generic event queue
src/engine/collision.js     screen/world hit-testing helpers
src/engine/entity.js        generic entity factory
src/engine/turret.js        turret aim/ammo/cooldown state
src/systems/weaponSystem.js      fireMode registry (auto/single/guided)
src/systems/movementBehaviors.js movement registry
src/systems/spawnSystem.js       wave spawns + spawnsOnDeath chains
src/systems/crateSystem.js       crate spawn/descend/collect
src/systems/waveDirector.js      wave sequencing + endless loop
src/systems/scoreSystem.js       scoring, streak, best-score persistence
src/systems/hud.js               canvas HUD
data/weapons.json, enemies.json, waves.json, crates.json    all game content
play.bat / play.ps1          local server launchers
```

## Adding new content

**The engine and systems code never reference a specific enemy, weapon, wave,
or crate by id.** Everything is dispatched through small registry objects
keyed by generic schema fields (`movement`, `fireMode`, `shape`). This means
new content is *pure JSON* — you do not need to touch any `.js` file to add a
new enemy, weapon, or wave, as long as it reuses an existing `movement` /
`fireMode` id. Below are three complete worked examples.

### Example 1 — new enemy `heavy_tank` (reuses an existing movement id)

Add this block to the `"enemies"` array in `data/enemies.json`:

```json
{
  "id": "heavy_tank",
  "name": "Heavy Tank",
  "domain": "land",
  "hp": 220,
  "speed": 0.015,
  "movement": "straight_approach",
  "hitbox": 46,
  "scoreValue": 500,
  "damageToBase": 25,
  "fireDamage": 0,
  "fireInterval": 0,
  "spawnsOnDeath": null,
  "color": "#3a4a1a",
  "shape": "tank",
  "behaviorScript": null
}
```

Then reference it from any wave's `"spawns"` array, e.g. in `data/waves.json`
wave 5:

```json
{"enemyId": "heavy_tank", "count": 2, "interval": 20, "startDelay": 10}
```

That's it — **no other file changes**. It spawns, approaches, takes damage,
scores, and damages the base using the exact same `straight_approach`
movement handler that `tank` already uses; the renderer draws it with the
existing `tank` glyph in a new color.

### Example 2 — new weapon `rocket_pod`

Add this block to the `"weapons"` array in `data/weapons.json`:

```json
{
  "id": "rocket_pod",
  "name": "Rocket Pod",
  "key": "4",
  "fireMode": "single",
  "fireRate": 1.5,
  "damage": 35,
  "splashRadius": 70,
  "ammo": 10,
  "projectileSpeed": 2.0,
  "targetDomains": ["land", "sea", "air", "crate"],
  "sound": "heavyBoom",
  "color": "#ff9a3a",
  "reticle": "circle"
}
```

(If you want it on a free key, use a key not already bound, e.g. `"5"`, and
the HUD pip layout will simply add a 5th column automatically — the HUD
loops over however many weapons exist.) It's a ballistic weapon (has a
`projectileSpeed`), so it automatically uses the existing `single` +
ballistic-with-speed dispatch path in `weaponSystem.js`'s `fireModeHandlers`
registry — **no other file changes**. It reuses the `heavyBoom` synth cue
(`sound: "heavyBoom"`, the same one the Howitzer uses) rather than needing a
new one, though you could add a new entry to the `sounds` registry in
`src/audio.js` if you wanted a distinct sound (that's the one legitimate
case where new *sound art*, not new gameplay code, is added).

### Example 3 — new wave 6

Add this block to the `"waves"` array in `data/waves.json`:

```json
{
  "id": 6,
  "name": "Final Push",
  "duration": 75,
  "difficulty": {"hp": 1.6, "speed": 1.3},
  "spawns": [
    {"enemyId": "infantry", "count": 12, "interval": 2, "startDelay": 1},
    {"enemyId": "heavy_tank", "count": 3, "interval": 15, "startDelay": 5},
    {"enemyId": "helicopter", "count": 6, "interval": 6, "startDelay": 4}
  ],
  "crates": {"interval": 11, "types": ["mg_crate", "howitzer_crate", "sam_crate"]}
}
```

`waveDirector.js` takes the entire `waves` array as data — it doesn't know
wave 6 exists as a concept, it just iterates whatever array `waves.json`
contains. Once you have 6 waves, wave 6 becomes the new "final wave" that
loops (at x1.15 difficulty per loop) once the array is exhausted. **No other
file changes.**

### Optional sprite art — `sprite` / `spriteScale` / `spriteFps` fields + `assets/background.png`

Any enemy def (`data/enemies.json`) or crate def (`data/crates.json`) may carry
these optional fields:

```json
"sprite": "assets/infantry.png",
"spriteScale": 1.0
```

- `sprite` is a path **relative to the repo root** pointing at a PNG. Drop the
  image file into `assets/` (or anywhere else under the repo) and reference it
  here.
- `spriteScale` is an optional multiplier on the sprite's rendered size
  (defaults to `1.0` if omitted).

When a `sprite` path is present **and the image has finished loading**, the
renderer draws that image instead of the vector glyph — bottom-anchored for
land/sea enemies and crates, center-anchored for air enemies. If the field is
absent, the image fails to load, or it simply hasn't finished loading yet,
the game falls back to the existing vector glyph automatically — nothing
breaks, and you never need a placeholder image to keep the game running.

**Dropping a PNG into `assets/` + adding one `sprite` field to a JSON entry
reskins that enemy or crate.** Delete the field (or rename/remove the file)
to go back to vector art — no other change needed.

#### Animated sprites — `sprite` as a frame array

`sprite` may instead be an **array** of path strings — one per animation
frame — with an optional sibling field:

```json
"sprite": [
  "assets/frames/infantry_0.png",
  "assets/frames/infantry_1.png",
  "assets/frames/infantry_2.png",
  "assets/frames/infantry_3.png",
  "assets/frames/infantry_4.png",
  "assets/frames/infantry_5.png",
  "assets/frames/infantry_6.png",
  "assets/frames/infantry_7.png"
],
"spriteFps": 8
```

- `spriteFps` is optional and defaults to `8` if omitted.
- The frame shown at any moment is `floor(entity.age * spriteFps) % frames.length`
  — `age` is how long that entity has existed (seconds), so the animation
  loops continuously for as long as the entity is alive.
- Every path in the array is preloaded the same way static sprite paths are.
  The fallback rule is unchanged and applies per-frame: if the *current*
  frame's image hasn't finished loading (or fails to load), that draw call
  falls back to the vector glyph for that instant — there's no
  hold-the-last-good-frame logic, just the same simple present/loaded check
  used for static sprites.
- A plain string still works exactly as before (static, non-animated) — you
  do not need to convert every existing `sprite` field to a single-element
  array.

**Turning a static reskin into a walk-cycle animation is still pure JSON:**
drop the frame PNGs into `assets/frames/`, replace the single `sprite` string
with the array of frame paths, optionally set `spriteFps`. No `.js` file
changes required.

There's also a background-image convention: if `assets/background.png`
exists, it's drawn stretched to fill the full 1280x720 canvas in place of the
procedural sky/sea/beach art (the animated waterline shimmer still plays on
top). This path is fixed by convention, not a data field — just add or
remove the file.

None of this requires touching engine code: it's handled generically by
`src/engine/sprites.js` (a tiny loader/registry) and a few lines in
`renderer.js` that check `type.sprite` — the same modularity contract as
everything else in this project.

### The rule this all follows

Adding *content* (a new id in a JSON array, using behaviors/fire-modes that
already exist) never requires a code change. Adding a genuinely new
*behavior* — a movement pattern or fire mode that doesn't exist yet — requires
exactly one new registry entry:

- New movement pattern → add one function to the `movementBehaviors` object
  in `src/systems/movementBehaviors.js`.
- New fire mode → add one function to the `fireModeHandlers` object in
  `src/systems/weaponSystem.js`.

Everything else (spawning, damage, scoring, rendering, HUD) reads those
registries by the id string from the JSON and never needs to know the new
id exists.
