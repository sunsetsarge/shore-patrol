# Beachhead — Phase 2 Polish (SPEC, 2026-07-04)

Source: Blaine's playtest feedback. Eight items. Contract rules unchanged (data-driven,
no content ids in src/, vector fallback, grep test).

## A. Gameplay/engine fixes

### A1. Hit detection — aim at the body, not the feet
Today projectedHitTest circles are centered on the anchor point (sy = feet for
land/sea). Fix: when a def has a sprite, hit-test the projected DRAW RECT (same
geometry the renderer computes: bottom-anchored height `hitbox*2.4*scale*spriteScale`,
aspect from the loaded image; air = center-anchored) — point-in-rect with ~6px pad.
No sprite/not loaded → fall back to current circle but centered at (sy - hitbox*scale)
for land/sea. Splash math unchanged.

### A2. Landing craft rules
- Player kills craft BEFORE it lands → NO troops spawn (score as today). Landing
  (`land_then_disgorge` self-despawn) remains the ONLY spawnsOnDeath trigger.
  Implementation must stay generic: behavior sets `entity.flags.landed = true`;
  spawnSystem fires spawnsOnDeath only when that flag is set. (killedByPlayer flag
  already exists.)
- Disgorged troops spawn at the CRAFT's x (± spread from spawnsOnDeath.spread), on the
  land domain at d = 0.92–0.98 (just past the waterline) — never a fixed point.

### A3. Sea band / background alignment
- renderer project(): sea domain becomes y = lerp(WATERLINE_Y, HORIZON_Y, d) with
  WATERLINE_Y = 420, HORIZON_Y = 260 (land stays lerp(640, 420, d)); sea scale
  becomes lerp(0.55, 0.18, d) so craft size hands off plausibly to land units.
- `land_then_disgorge` runs craft to d = 0.10 (was 0.45) then lands.
- New background image (assets/background.png) regenerated so the water band visually
  fills y≈260–420 with NO foreground structures. If regeneration fails, PIL-stretch
  the existing image's water band as fallback.

## B. Data tuning (JSON only)
- howitzer_crate: spawnWeight 1 → 3, amount 6 → 8. sam_crate weight 1 → 2.
- Wave crate intervals: 18/16/15/14/12 → 14/13/12/11/10.

## C. Crate visual distinction
Three tinted variants of the crate sprite (parachute recolored toward the weapon's
UI color: mg #ffd24a, howitzer #ff6a3a, sam #5ad1ff) → assets/crate_mg.png etc.;
each crate def gets its own `sprite`. Pure data + PIL, no engine change.

## D. Vehicle animation (pre-rendered)
4 frames per vehicle from the same GLBs, whole-model micro-transforms per frame:
- tank: pitch rock ±1.2° + z bob ±0.5% of height (tread illusion at distance)
- landing_craft: roll ±1.5° + z bob (riding swell)
- helicopter: z bob ±1.5% + slight roll ±2°
Wire as sprite arrays, spriteFps 6. Union-bbox trim MUST include all frames.

## E. Death animations (soldiers)
- Meshy animation API action_id 183 (Shot_and_Fall_Backward) on both rigged soldiers
  (rig ids in meshy_test/metadata.json + batch_results.json). 3 credits each.
- Render 6 frames each → assets/frames/<unit>_death_0..5.png.
- Engine: optional `deathSprite` (array) + `deathFps` (default 10) on enemy defs.
  On kill: entity enters `dying` state — no collisions, no movement, no base damage,
  plays death frames ONCE (not looped), removed when finished. Defs without
  deathSprite despawn exactly as today (explosion effect). Score/streak awarded at
  moment of kill as today. Generic: dispatch only on field presence.

## F. Turret weapon rack
- 4 Meshy models (~30 credits each): twin .50cal MG on pintle mount; short WWII
  howitzer on field mount; 2-tube SAM launcher rack; M1911 pistol (small).
- Blender render each from REAR 3/4 view (player sees them from behind), ~2 frames
  not needed — single frame each → assets/turret/<weaponId? NO — data-driven:
  path stored in weapon def>.png.
- Weapon schema gains optional `turretSprite` (path) + `turretScale`.
- Renderer drawTurret: draw ALL weapons' turretSprites in a rack along the parapet
  bottom-center (evenly spaced slots, order = weapons array order). ACTIVE weapon:
  raised (rises ~18px over 0.25s when selected — "powering up"), full opacity,
  slight glow/outline in weapon color; inactive: lowered, 55% opacity. Barrel/recoil
  visuals keep working (recoil offset applies to active sprite). Fallback: weapons
  without turretSprite keep the current vector barrel (only for the active one).
- Aim feel unchanged (reticle is the aim; rack is cosmetic).

## Acceptance criteria
1. Clicking center-mass of any sprite registers a hit (verified via debugStep +
   projected-rect probes at sprite center AND head; feet-only aiming no longer required).
2. Craft killed at sea → zero disgorge. Craft that lands → 4 troops at the craft's x
   (probe two different x values), land d≈0.95.
3. Boats never render below y≈425 or over the left foreground; new background has
   clean water band 260–420.
4. Howitzer crates observably more frequent (weights verified in a 20-crate
   simulation draw); crate types visually distinct (3 different sprites).
5. Vehicles and soldiers all animate; soldiers play a one-shot death fall on kill;
   dying entities can't damage the base or be re-hit.
6. Turret rack: all 4 weapon models visible; switching weapons raises the selected
   one (animated), lowers the rest; no console errors; grep contract intact.
7. Committed; Confluence v1.4; memory updated.
