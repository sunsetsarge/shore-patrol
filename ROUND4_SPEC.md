# Round 4 SPEC — end screens, facings, part animation, fire states (2026-07-07)

Blaine's playtest feedback. NOTE: the codebase gained bosses/stages/upgrades/debug since the
last docs — READ the current code first; this spec is contract-level, not line-level.
Contract rules unchanged: content ids only in /data/*.json; grep
`howitzer|infantry|helicopter|landing_craft|pistol|commando` over src/ stays empty; all new
visual behavior dispatches on generic def fields.

## 1. Win/Loss end screens (engine)

**Problem:** game ends abruptly. No victory exists (stage 10 loops forever); loss jumps
straight to text.

- **Victory state**: completing stage 10 (the last non-loop wave cleared) → `game.state =
  'victory'` instead of silently looping. Victory screen: "BEACH SECURED" (gold), final score,
  best score, stages cleared, then the Retry prompt (below). Keep the endless loop REMOVED from
  the default flow (victory is the end); post-victory YES restarts a fresh run.
- **Defeat decompress**: on defeat (defense=0 or nuke), 1.0s of non-interactive fade-in
  ("BASE OVERRUN" / existing nuke screen grows in, input ignored) before the prompt appears —
  kills the abruptness. Keep the special nuke variant.
- **Retry prompt (both screens)**: "Play again?" with two canvas-drawn buttons **YES / NO**.
  Mouse hover highlight + click via canvas hit-zones (input already maps client→canvas
  coords); keyboard Y / Enter = yes, N / Esc = no. YES → fresh run (existing resetGame path).
  NO → menu. Show the prompt only after the 1s decompress.
- Both screens show: final score (large), best score (and "NEW BEST!" flash if beaten),
  stage reached.

## 2. Facing system (engine + art)

**Problem:** soldiers always face viewer-left regardless of movement.

- Def field `facingSprites: { "front": [paths], "side": [paths] }` (+ optional
  `fireFront`/`fireSide`, `deathSprite` stays single-facing). Falls back to existing `sprite`.
- Entity tracks smoothed heading each tick: `hx = smoothed(dx)`, `hd = smoothed(d-delta)`.
  Renderer picks **front** when |hx| is small relative to approach speed, else **side**, and
  **mirrors horizontally** (ctx.translate+scale(-1,1)) when hx > 0 (moving screen-right).
  One rendered side set serves both directions — free mirroring, halves the frame budget.
- Applies generically to any def with facingSprites (soldiers now; boats/tanks later).

## 3. Part-composited animation (art + engine)

- **Helicopter rotor spin**: separate the rotor from the GLB in Blender (z-band vertex
  separation), render body frames (existing bob) + a rotor sprite; renderer draws rotor
  overlay rotating continuously (def fields `rotorSprite`, `rotorOffset` [dx,dy as fraction
  of draw size], `rotorSpinHz`). Generic: any def with rotorSprite gets a spinning overlay.
- **Helicopter body wobble on direction change**: code-driven — roll the body sprite by
  `k * smoothed(vx)` radians (canvas rotate around sprite center), clamp ±10°. Def field
  `bankFactor` (default 0 = off).
- **Tank turret rotation**: separate hull and turret in Blender (z-band), render hull frames
  (existing wobble) + turret sprite; renderer overlays turret rotated to track the BUNKER
  direction (the tank aims at the player as it maneuvers) — def fields `turretPartSprite`,
  `turretOffset`, rotation = angle from entity to screen bottom-center, clamped ±25° (2D
  rotation of a perspective sprite reads fine within small angles; beyond that it distorts).
- **Tank treads**: honest limitation — treads are baked into one mesh; true tread-roll
  animation isn't available from these models. Keep the pitch-rock wobble + ADD code-driven
  dust particles at the tread line while moving (particles system already exists per recent
  commits). Revisit with re-modeled multi-part tanks only if this still reads poorly.
- **Boat bobbing**: keep 4-frame roll wobble + ADD code-driven slow sine y-bob for sea-domain
  entities in the renderer (def field `bobAmp` px, `bobHz`), plus occasional splash particles
  at the waterline.

## 4. Firing animations (art + engine)

- **Soldiers**: Meshy anim 104 (Side_Shot) on both rigs → 4-6 one-shot frames per facing
  (front + side). Engine: when a unit with `fireSprite*` fields fires (its fireInterval
  volley), enter a brief `firing` state (like dying but ~0.4s, one-shot frames, then resume
  walk). Soldiers currently don't shoot — give infantry/commando defs `fireDamage` ~1-2 and
  `fireInterval` ~4-6s with a standoff: they stop at d≈0.15 and fire (reuse/extend the
  hover_and_dive standoff pattern into a generic `advance_and_fire` movement behavior).
  Muzzle flash particle at the sprite's weapon point (def `muzzleOffset`).
- **Tanks**: def gets fireDamage/fireInterval + `advance_and_fire` (standoff d≈0.3); firing =
  turret-part recoil (code: turret overlay kicks back 3px) + big muzzle flash + shell tracer
  toward bunker + screen shake tick. No new renders needed.
- **Helicopter**: already volleys; add muzzle flash at nose `muzzleOffset` + brief body pitch.

## 5. Acceptance (verify against RUNNING game via debugStep + screenshots)

1. Clearing stage 10 → victory screen (title, final/best score, stages) with working YES/NO
   (mouse + keys); defeat → 1s decompress then same prompt; nuke variant preserved.
2. A soldier walking left-to-right (spawn x -0.5 with drift right... verify by forcing vx)
   renders mirrored; near-vertical approach uses front frames. No pop-flicker between facings
   (hysteresis on the threshold).
3. Heli: rotor visibly spins as separate overlay; body banks when x-drift changes sign.
4. Tank: turret overlay tracks toward bunker center (visible rotation vs hull), recoils on
   fire; dust puffs while moving.
5. Boats: gentle continuous bob + roll (no anchor-line float regression — bottom trim rule!).
6. Soldiers/tanks stop at standoff and play visible fire animation; player takes the
   fireDamage on their volleys; muzzle flashes at the right offsets.
7. Zero console errors; grep contract; frame budget: keep each new anim ≤6 frames @≤512px
   (asset diet later shrinks to 256px WebP).
