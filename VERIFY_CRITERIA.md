# SHORE PATROL — Screenshot Verification Rubric

Single source of truth for judging this sprint's changes. Supersedes the scattered
criteria in `ROUND4_SPEC.md`, `SHIP_PLAN.md` and `STATE.md` going forward (those
files remain as history). Written for a judge model that can ONLY look at a PNG
plus the named console output — assume no source access.

---

## 0. Harness invocation (run this before judging anything)

1. **Start the dev server.** Run `play.bat` from the repo root (it launches
   `serve_nocache.py 8123`). It dies between sessions — restart it every time.
   Page URL: `http://localhost:8123/`.
2. **Start the screenshot sink.** `python screenshot_sink.py` (defaults to port
   8200, writes `shots/<name>.png`). Must be running before any capture.
3. **Drive frames manually.** A hidden or background browser tab suspends
   `requestAnimationFrame`, so the game will appear frozen. Do NOT rely on real
   time passing — advance the sim deterministically with
   `window.game.debugStep(n)` (n fixed updates at 1/60 s, then one render).
4. **Capture.** `await window.saveShot('name')` → writes `shots/name.png`.
   It resolves `true` on success, `false` (with one console warning) on failure.
5. **Judge.** Read `shots/*.png` with a model DIFFERENT from the one that wrote
   the code, scoring against the numbered sections below.

**Console noise to ignore:** the exception
`A listener indicated an asynchronous response by returning true, but the message
channel closed before a response was received` is a browser-extension artifact,
NOT a game error. Ignore it. Any OTHER console error or warning originating from
`/src/**` or `/data/**` is a FAIL.

**Required judge output:** a single verdict line `PASS` or `FAIL`, followed by a
list of named defects — one line per defect, each naming the rubric section
number and what was seen instead.

---

## 1. Screen shake

Capture: `debugStep` until a boss section is destroyed, `saveShot('shake_boss')`;
also a baseline `saveShot('shake_idle')` with nothing exploding.

- PASS: `shake_boss` shows the whole scene offset/rotated relative to
  `shake_idle` — the horizon line, background, and HUD-anchored art do not sit at
  identical pixel rows in both shots.
- FAIL: the two frames are pixel-aligned in every element (shake is still a dead
  value that is set but never applied).
- FAIL: shake is so violent the HUD text is unreadable or the scene tears off the
  canvas edges leaving blank/black bands.

## 2. Hit feedback / shooting punch

Capture the frame immediately after a shot connects: `saveShot('hit_impact')`.

- PASS: at the point of impact there is a visible impact artifact — flash, spark
  burst, debris, or hit-spray — clearly distinct from the enemy sprite itself.
- PASS: a muzzle flash is visible at the weapon origin in the firing frame.
- PASS: damaged enemies read as damaged (tint/flash/wobble), not identical to
  their undamaged frame.
- FAIL: an enemy simply disappears or its health bar changes with no visual
  event at the impact point.

## 3. Boss section-HP panel vs SCORE HUD

Capture during a boss encounter: `saveShot('boss_hud')`.

- PASS: the boss section-HP panel and the SCORE readout occupy disjoint screen
  regions — no glyph of the score is drawn over any part of the panel, and no
  panel border/bar crosses the score text.
- PASS: every character of the score value is fully legible.
- FAIL: any overlap, even partial, between the panel rectangle and the score
  text bounding box.

## 4. Sea-craft projection scale

Capture a wave containing sea craft at their closest approach:
`saveShot('sea_scale')`.

- PASS: the nearest boat's on-screen height is a clearly substantial share of the
  canvas — visually comparable to a near-approach land enemy, not a small blob.
  As a rule of thumb it should read as at least roughly a quarter of the frame
  height at closest approach.
- PASS: hull detail (deck, cabin, waterline) is distinguishable, not mush.
- FAIL: the boat is a small indistinct shape whose height is a similar fraction
  of the frame as a distant, far-spawn enemy.
- FAIL: the boat is scaled up so far it clips off the top of the canvas or
  covers the HUD.

## 5. Wave variety

Capture one frame per wave across several waves: `saveShot('wave_1')`,
`saveShot('wave_2')`, `saveShot('wave_3')`, `saveShot('wave_4')`.

- PASS: the four frames differ in composition — different enemy types present,
  different counts, or different approach lanes/spawn sides.
- PASS: at least one wave shows an enemy mix not present in wave 1.
- FAIL: all four frames show the same enemy type in the same arrangement with
  only the wave number changed.

## 6. Difficulty curve / defense meter tension

Capture the defense/base-integrity meter early and late:
`saveShot('defense_early')` (wave 1) and `saveShot('defense_late')` (a later
wave, played without god mode).

- PASS: the defense meter is drawn and its filled fraction is readable at a
  glance in both shots.
- PASS: `defense_late` shows meaningfully more pressure than `defense_early` —
  more simultaneous enemies on screen, and/or a visibly depleted meter.
- PASS: the meter changes state visually as it drops (colour shift or warning
  treatment at low values) in at least one captured low-meter frame.
- FAIL: the meter sits at full in every frame across every wave (no tension).
- FAIL: the meter is not visible at all on the HUD.

## 7. Scoring depth

Capture mid-run: `saveShot('score_mid')` and, right after several rapid kills,
`saveShot('score_combo')`.

- PASS: the score readout is present and shows a nonzero value in `score_mid`.
- PASS: `score_combo` shows an additional scoring indicator beyond the raw
  number — a combo/multiplier/streak element or a floating points popup near the
  kill location.
- FAIL: the only score feedback anywhere on screen is a bare integer that never
  gains any accompanying indicator.

## 8. HUD legibility as a whole

Capture a busy frame: `saveShot('hud_busy')`.

- PASS: every HUD element (score, ammo, wave/round, defense meter) is fully
  on-canvas with no element cropped by a canvas edge.
- PASS: no two HUD elements overlap each other.
- PASS: HUD text remains readable over the brightest part of the background
  (contrast, backing plate, or outline present).
- FAIL: any HUD element clipped, overlapping, or illegible against the scene.

## 9. Crates / pickups

Capture a frame containing a crate: `saveShot('crate')`.

- PASS: the crate is visibly distinct from enemies — different silhouette and
  colour treatment — and reads as a pickup, not a target to avoid.
- PASS: the crate carries some attention cue (glow, outline, marker, or icon).
- FAIL: the crate is the same size/colour family as an enemy and is not
  distinguishable at a glance.

## 10. Background resolution

Capture the title or an early gameplay frame at a large window size:
`saveShot('res_full')`. Then zoom into the PNG at 1:1.

- PASS: background edges (horizon, structures, terrain boundaries) are crisp at
  the captured pixel dimensions — no soft, upscaled blur across the whole image.
- PASS: the captured PNG's pixel dimensions match the canvas backing store, and
  the background does not look like a smaller image stretched to fill it.
- FAIL: the background is uniformly blurry while canvas-drawn elements (HUD text,
  sprites) remain sharp — that mismatch is the upscaling artifact.

---

## Global gate

A build only passes when **all ten sections pass** AND the console shows zero
game-origin errors (the message-channel-closed extension exception excepted).
Deploy (`firebase deploy --only hosting`, project `claude-5273b`) only after a
PASS verdict.
