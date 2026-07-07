# Beachhead — Development Roadmap (post-v1.0 content & features)

FINISH_PLAN.md gets the game to a shippable, monetizable single-file v1.0 (polish +
packaging). THIS roadmap is what makes it *deep and sticky* afterward — the content and
systems that turn a one-session arcade toy into something with retention and upsell potential.
Everything here respects the data-driven contract: new enemies/weapons/waves are JSON; only
genuinely new *behaviors* are one new registry function.

Ordered by value-to-effort. Each item notes whether it's DATA-only (a lesser model can do it
from JSON) or needs an ENGINE change (one registry entry) or ART (Meshy→Blender pipeline,
already built — see meshy_test/render_frames.py).

---

## Tier 1 — Retention hooks (do these first after v1.0; they create reasons to replay)

### R1. Meta-progression (between-run upgrades) — ENGINE + DATA
The biggest retention lever. After a run, spend earned score/"salvage" on permanent upgrades:
- Weapon tiers (MG fire rate, howitzer splash radius, SAM lock cone, larger ammo caps).
- Turret survivability (defense max, defense regen between waves).
- Economy (crates drop more often, crates give more ammo, auto-collect radius).
- Store as `data/upgrades.json` (id, cost, effect-path, max-level); a generic upgrade system
  applies effects by patching the loaded weapon/enemy/turret data at run start. localStorage
  persists owned upgrades. New "garage/armory" screen between runs.
- **Why:** converts pure score-attack into a progression loop → run 2, 3, 10.

### R2. In-run power-ups — DATA + small ENGINE
Special crates (rarer, distinct color) grant temporary buffs: rapid-fire, double-damage,
shield, screen-clear "airstrike," slow-mo. Model as a `crates.json` variant with a `powerup`
field + a small timed-buff system. Reuses the existing crate + parachute pipeline.

### R3. Daily challenge / seeded run — ENGINE
A fixed daily seed (date-based) → identical wave RNG for everyone that day → a leaderboard
hook. Even a *local* "today's best" adds a return reason. Later: a real leaderboard (needs a
backend or a portal's leaderboard API).

---

## Tier 2 — Content breadth (cheap with the pipeline; keeps runs varied)

### R4. New enemies (DATA + reuse existing movement behaviors)
Each is a JSON block reusing an existing `movement` id; art via the Blender pipeline. Ideas:
- **Heavy tank** (straight_approach, high hp, high base damage) — already proven as the
  modularity test.
- **Fast attack boat / PT boat** (sea, strafe_weave on the water, fires at the bunker).
- **Jet / bomber** (air, straight_approach fast, drops a bomb that damages defense — needs a
  small "ranged attack" behavior, see R5).
- **Paratroopers** (air→land: descend under chutes, become infantry on landing — reuses the
  crate descent + disgorge patterns).
- **Mortar team** (land, stops at range and lobs shells — ranged attacker).
- **Armored transport** (land, disgorges infantry like the craft but on the beach).

### R5. New movement/attack behaviors (ENGINE — one registry fn each)
- `ranged_attacker`: approach to a standoff distance, then periodically fire at the bunker
  (enables jets, mortars, PT boats). Generic: reads `fireDamage`/`fireInterval`/`standoffD`
  from the def.
- `zigzag_evade`: air units that juke to dodge SAMs (skill check for the player).
- `shielded`: takes reduced damage from the front until flanked/hit by splash (armor mechanic).

### R6. Boss waves — ENGINE (`behaviorScript` seam already exists)
Every 5th wave = a boss with multi-phase HP thresholds and a scripted attack pattern:
- **Battleship** (sea): sits offshore, rotating turrets, weak points; phases as HP drops.
- **Gunship/Zeppelin** (air): tanky, spawns adds, strafing runs.
- Use the reserved `behaviorScript` field on the enemy def to name a boss script function.
  This is the intended expansion seam — one function per boss, dispatched by name.

### R7. New weapons — DATA + maybe one fireMode
- **Flak cannon** (air-burst, splash vs air — new `airburst` fireMode or reuse guided+splash).
- **Flamethrower** (short-range cone vs infantry — new `cone` fireMode).
- **Mortar** (player-side high-arc for over-cover targets).
- **Minigun** (unlockable MG upgrade — data tier of the existing auto fireMode).

---

## Tier 3 — Graphics & presentation upgrades

### R8. Animation depth (ART, pipeline exists)
- **Helicopter rotor spin** — split the rotor into its own overlay sprite spun in code, OR
  render more sub-frames (the static-frame gap noted in STATUS).
- **Muzzle-flash frames** per weapon; shell-casing ejection particles.
- **Water/wave motion** on the background (scrolling foam line) — cheap parallax.
- **Impact decals** on the sand (craters that linger).
- **More death variations** (Meshy animation library has many; action 183 is one — add
  forward-fall, blown-back for explosion kills).

### R9. Weather / time-of-day variants (DATA + ART)
Alternate backgrounds (dawn/dusk/storm/night) selectable per level or as cosmetic unlocks;
night adds muzzle-flash drama. Pure background swaps + a tint overlay.

### R10. UI/UX pass (ENGINE)
- Animated wave-intro cards; damage vignette when defense is low; combo/streak flourish;
  end-of-run stats screen (kills by type, accuracy, best streak, salvage earned).
- Controller support (gamepad API) for portal/couch play.

---

## Tier 4 — Modes & depth

### R11. Game modes (ENGINE — waveDirector already takes an arbitrary wave list)
- **Campaign**: finite, hand-authored, with a win screen (currently endless-only).
- **Endless**: current loop, tuned, with a local leaderboard.
- **Survival/Horde**: escalating single map, upgrade between waves (pairs with R1).
- **Boss rush**: unlocked after campaign.
Mode select is just choosing which `waves.json` list + rules the director runs.

### R12. Mobile / touch (ENGINE)
Touch-drag to aim, tap zones for fire + weapon switch, responsive layout (Phase B sets this
up). Opens the biggest web-game audience (portals are mobile-heavy).

---

## Tier 5 — Monetization deepening (after traffic exists)

### M1. Portal builds via the ad/save shim (FINISH_PLAN Phase H2 seam)
Swap `platform.js` no-ops for real SDKs, one build per portal:
- **GameDistribution** (lowest bar, SDK mandatory, 33% net rev-share) — good first portal spray.
- **CrazyGames** (SDK for full launch, <50MB, rewarded-ad "revive" fits perfectly).
- **Poki** (curated, <8MB init — the asset diet in Phase F targets this bar; highest traffic).
- Interstitial between waves; rewarded-ad "continue/revive" on game over (R2 shield tie-in).

### M2. Premium/cosmetic upsell (itch.io / paid version)
- "Supporter" build: extra weapons, campaign, cosmetic turret skins.
- Cosmetic turret/crate skins as the meta-progression sink (R1).

### M3. Cross-promotion
Link to Blaine's other games (Bounty Hunter X, Dungeon Crawler) from the menu — free traffic
between titles.

---

## Explicit non-goals (say no to these)

- **Real 3D / Three.js / physics engine** — evaluated in RESEARCH_3D.md (Confluence 80773129).
  Physics buys nothing in a stationary-turret game; the pre-rendered-sprite look is the right
  call. Don't rewrite the renderer. (If ever revisited, it's a deliberate v2 fork, not an
  upgrade.)
- **Multiplayer** — netcode cost dwarfs the payoff for an arcade score-attack.
- **Procedural infinite content** — hand-authored waves + a tuned endless loop is enough;
  don't over-engineer a wave generator before the game has players.

---

## Recommended sequence

v1.0 (FINISH_PLAN) → **R1 meta-progression + R2 power-ups** (retention) → **R4/R5 enemy
breadth** (variety) → **R6 boss waves** (spectacle) → **R11 campaign mode + win screen**
(completeness) → **M1 portal builds** (money) → R12 mobile (audience) → cosmetics/depth as
long-tail. Ship v1.0 first and get real player feedback before building Tier 2+; let actual
playtest data, not this list, prioritize what's next.
