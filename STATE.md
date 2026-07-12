# STATE — Beachhead (browser game)

Updated: 2026-07-10 (SHIP-LOOP RUNNING — Fable judges, Opus/Sonnet execute per SHIP_PLAN.md.
Built the Fable-judge harness (screenshot_sink.py :8200 writes shots/<name>.png; inject
window.saveShot(name)=canvas.toBlob→POST; a `model:"fable"` Agent Reads the PNG + criteria and
returns PASS/FAIL). DONE + DEPLOYED: W3 enemies fire WHILE advancing (advance_and_fire fires once
d<=firstFireD, data field; infantry 0.6, tank 0.75) — Fable PASS. W4 shots leave the gun/pylon:
entityMuzzlePoint() maps per-enemy muzzle{u,v} (sprite-rect fraction, mirror+bank aware) to
screen; notifyEnemyFire/notifyVolley/spawnTracer emit there (killed the stray feet-blast from
notifyVolley); muzzle tank{0.5,0.3}=barrel, heli{0.68,0.62}=pylon, infantry{0.58,0.4}=rifle;
bigger flash — Fable PASS all 3. NEXT (SHIP_PLAN §4): W1 bomber 3D model (BIG, Blender/Meshy —
bomber+escorts still vector), W2 bomber fly-over-and-exit-top behavior, W5 hitbox audit, W6/W7
facing+regression+ship. Servers: play.bat (:8123) + `python screenshot_sink.py 8200 shots`.)
Prior: 2026-07-10 (R8.4 DEPLOYED — FLOAT FIX + VECTOR GUNS REMOVED; player-facing-guns
re-render ABANDONED. (1) d 0.40→0.55: the painted waterline SLOPES (high-left y345→low-right
y440) and the flat keel spans most of the width, so at 0.40 the bow beached while the stern
floated; 0.55 clears the keel above the waterline across the WHOLE hull (bow +26/mid +45/stern
+63 px, verified). The whole 0.52→0.20→0.40→0.55 saga = I misread the original "in the sky"
report (which was a STALE R6 DEPLOY, not the depth) and drove d the wrong way. 0.55 is the keeper;
DON'T lower it. (2) Removed the vector gun barrels/domes (_drawMainGuns) — flat 2D shapes on the
photoreal rendered hull looked ridiculous; kept only a soft additive muzzle-flash GLOW at the
turrets on fire. (3) DEAD END, do not retry: tried re-rendering the ship with player-facing main
guns by adding 3D barrel geometry to battleship.glb in Blender (build_battleship_guns.py, renders
in meshy_test/renders_guns/). The GLB is ONE fused 152k-vert mesh (turrets NOT separable), and a
BROADSIDE camera fundamentally can't show guns aimed at the player without foreshortening into
awkward poles — every aim tried (toward-camera, down, down-forward) looked worse than the clean
ship. CONCLUSION: keep the clean broadside ship (authentic Beach Head look). Only remaining
untried idea = re-render the whole ship from a BOW-QUARTER angle (¾ view "bearing down"), which
changes the look + needs slide-in/section-map re-tune — Blaine-gated, not started.
Prior: 2026-07-10 (R8.3 DEPLOYED — OFFSHORE PLACEMENT + MAIN GUNS TRAINED ON PLAYER. (1) d
0.20→0.40: 0.20 beached the hull on the sand (over-corrected from the earlier "in the sky" which
was actually stale-deploy); 0.40 floats it offshore with a clear water gap (hull bottom ~377 vs
surf ~404). (2) The broadside sprite's cast turrets point along the hull, so the guns never
"faced the player" — added _drawMainGuns: a dark barbette dome over each main turret (hides the
sprite's side barrels) + twin heavy barrels angled DOWN toward a below-centre player aim point,
muzzle flash at the barrel tips on fire (fwdFlash/rearFlash pulse in _fireShell); shells now leave
from the trained muzzles (shared MAIN_GUN_AIM_DY=3.2 / MAIN_GUN_LEN=0.78). Retired the old
base-of-turret cone flash. Screenshot-verified offshore + guns-on-player, no errors. Depth history
for future me: d=0.52 sy337 (fine, the "sky" report was STALE R6), d=0.20 sy388 BEACHED, d=0.40
sy356 = the keeper.
Prior: 2026-07-10 (R8.2 DEPLOYED — Z-ORDER FIX. Ammo crates (and beach enemies) fell BEHIND
the battleship because Bosses.draw ran AFTER the entity/crate loop. Split it: Bosses.draw
(ship/fire/smoke/shells/flashes) now runs right after the ambient water, BEFORE entities+crates,
so foreground objects render in front; the screen-fixed section-HP panel moved to a new
Bosses.drawHud() called with the HUD so it stays on top. GOTCHA I hit: first commit added the new
pre-entity draw but left the OLD post-entity call → boss drew TWICE (2nd on top of crates); caught
it on the LIVE curl (two Bosses.draw lines), removed the stale one, redeployed. Live now has 1
draw + 1 drawHud. Screenshot-verified crates render in front of hull+superstructure+fire, HP panel
intact. LIVE @ (this deploy).
Prior: 2026-07-10 (Round 8 committed @823a8f7 — BATTLESHIP HITBOXES + DAMAGE
FX. Section hit-zones were mapped with POSITIVE ry (below the waterline origin) so every hitbox
sat on the SAND below the hull, and the bridge sat on the hull side. Root-caused + fixed:
replaced the two drifting offset tables (sectionScreenPos + draw scars) with ONE module-level
SHIP_FEATURES table in normalized sprite (u,v) coords + featureLocal() that mirrors the
drawImage() placement exactly — single source of truth so hit-test/scars/fire/smoke can't drift
again. Measured features off the sprite silhouette profile: fwdTurret(0.22,0.60),
bridge(0.44,0.34=superstructure), engine(0.55,0.50=funnels), rearTurret(0.79,0.60),
hullPort(0.50,0.78). Verified headless: all 5 sections hit-test correctly, sand+sky clicks miss.
DAMAGE FX overhaul: concentric circles → scorched craters + additive flickering fire (_drawWreck)
+ billowing gradient smoke (expands & greys rising) + rising ember sparks; NEW battleship_damaged.png
(post-processed: darkened/desat + soot streaks + blast craters w/ ember cores) swaps in when
critical (hull dead or ≥3 sections gone). Screenshot-verified: fires sit ON the turret/bridge/
funnels with smoke columns, no console errors. FOLLOW-UPS: baked craters in the damaged sprite are
at fixed spots (don't track which sections actually died — live _drawWreck fires do); R7 STILL not
deployed either; ~9s slide-in still long; grep-contract pre-existing violations owed.)
Prior: 2026-07-10 (Round 7 committed @17e60fa, NOT yet deployed — BATTLESHIP BEHAVIOR +
TIDE + MG ICON. Boss now: spawns off-screen right (x=1.7) in the water (d=0.52), glides in to
targetX=0.28 and holds on-station in front of the player — never beaches, never "starts in the
sky"; fire gated on arrival. Shells emit from the turret section positions (nudged toward player)
and muzzle flashes draw as downward flame cones at each gun, so cannons read as firing AT the
player (the sprite is a fixed broadside render — barrels can't physically rotate, the flash+shell
origin sells it). Section offsets + hull scars flipped bow-LEFT to match the az0 battleship.png.
TIDE FIX: measured the painted background waterline (high-left y≈345 → low-right y≈440); drawTidal
had the MIRROR-INVERTED slope (leftY=435/rightY=405) so foam cut diagonally across the surf —
now matches; whitecaps spawn against the same sloped line so left-side foam no longer lands on
sand. NEW MG ICON: Meshy twin .50-cal (wpn_mg2, az225 render) replaces the dark cone-pedestal
turret that "looked strange" — barrel+visible bore now reads clearly as a gun. All headless- and
screenshot-verified; zero console errors. FOLLOW-UPS: ~9s slide-in is a long dramatic entrance
(shorten slideSpeed if playtesters find it slow); LST/LCVP still untextured-gray; grep-contract
pre-existing violations in upgradeSystem.js/debug API still owed.)
Prior: 2026-07-09 (Round 6 shipped @02d3712 — 3D BATTLESHIP BOSS: Meshy dreadnought broadside
az180 replaces vector hull in bosses.js draw(), destructible sections/smoke/fire preserved as
overlays, section offsets remapped to sprite features + hit-guard widened (hull weak-point at
+0.6h was rejected by old sy+0.5h cap → boss unhittable there, FIXED, all 5 sections verified
hittable); tank_lst re-built as real LST via primitives (build_lst.py) — Meshy gave generic
warship last round. FOLLOW-UPS: LST/LCVP untextured-gray (fine at scale), boss scars
approximate not pixel-perfect, balance still hot, grep-contract cleanup owed.)
Prior: Round 5 @94c1f73 — head-on facings az290/270 w/ aim_vec fix,
LCVP primitive-built in Blender after 2 Meshy refusals (build_lcvp.py, +beached ramp-down
frame/beachedSprite hook), tank_lst delivery def (pure JSON disgorge), heli
approach→bob→strafe behavior, sea foam wakes. FOLLOW-UPS: LST is a generic warship not true
bow-doors LST (regen or primitive-build later); far LCVPs read plain (texture pass);
balance still hot; grep-contract cleanup owed on parallel session's files.)
Previous: Round 4 @8f42eea
Status: ACTIVE
Phase: FINISH_PLAN A+B DONE + Round 4 DONE (end screens, part-composited vehicles, facings,
fire states, rack-occlusion fix). NOTE: a parallel session added bosses/10 stages/upgrades/
debug panel (unreviewed by this lane; grep contract has pre-existing violations in bosses.js/
upgradeSystem.js/debug API — cleanup owed). Next: Phase C (juice) — partially covered by the
parallel session's particles; RE-ASSESS against FINISH_PLAN C checklist before redoing.

## NEXT ACTION
Execute FINISH_PLAN.md Phase C (juice pass): add screenshake (game.shake scalar, world-draw
translate, decay), hit-flash (entity.hitFlash white tint on damage), impact particles (generic
world-space system, cap ~300, dust/spark/splash/debris by domain), bigger muzzle+recoil+MG
tracers, score popups (+N floats on kill), optional hit-stop — ALL magnitudes in a new
data/juice.json (no per-enemy/weapon id branching, grep contract holds). Acceptance = howitzer
impact shakes screen + throws particles, hits flash white, kills spawn floating score, changing a
data/juice.json value changes the effect on reload, smooth with ~40 entities+particles, zero
console errors, screenshot mid-explosion. Then D (audio), E (balance/onboarding), F (asset diet
256px+WebP <2MB), G (single-file build — add loader shims first), H (itch package).

## DEPLOY
- LIVE: https://shore-patrol.web.app — **DEPLOYED 2026-07-10 @b6cac27 (R7 + R8 + R8.1 now live)**.
  Verified on the live site: boss d===0.20 constant, sy constant 388 (zero vertical movement),
  slides in horizontally, sits low with its waterline at the surf. Prior live was da98ac9 (R4-R6),
  whose OLD depth-animating boss ("comes from the horizon, drops down") was the "ship in the sky /
  moves vertically" the user reported — it was a STALE-DEPLOY artifact, not a code bug (R7 had
  already fixed the motion; it just wasn't pushed). Lesson: after committing a gameplay/visual fix,
  DEPLOY (or tell Blaine it's localhost-only) — don't leave the live site stale.
- Deploy cmd: `"C:/Users/blain/AppData/Roaming/npm/firebase" deploy --only hosting` (project claude-5273b).
- firebase.json now sends no-cache on html/js/json → future `firebase deploy` is instantly live.
- Deploy cmd: `firebase deploy --only hosting` (CLI at %APPDATA%\npm\firebase, project claude-5273b).
- Local: play.bat/play.ps1 now use serve_nocache.py (no stale-cache in local dev either).

## BLAINE GATES
- [ ] Confirm the shipping NAME before any public/monetized publish (agent default placeholder:
      "SHORE PATROL"; "Beach Head" is a live trademark — Access Software 1983 / Digital Fusion).
- [ ] Create the itch.io account + click publish when v1.0 is packaged (agent won't create
      accounts or publish).
- [ ] Playtest each finished phase (esp. Phase C juice + Phase E balance).

## KEY PATHS & FACTS
- Plan: FINISH_PLAN.md (8 phases A–H). Also STATUS.md (eval), ROADMAP.md (post-v1.0 content).
- Working dir: C:\Claude\Projects\Active\Beachhead (git; HEAD 70ae684). Mirror in OneDrive
  Projects\Beachhead. GLBs gitignored (meshy_test/*.glb), kept on disk only.
- Run: play.bat → http://localhost:8123. NEVER file:// during dev (ES modules + fetch need http).
- Verify harness: window.game + game.debugStep(n) (hidden tabs suspend rAF — drive debugStep, not
  wall-clock). Dev server caches HARD — fetch(url,{cache:'reload'}) each edited module before reload.
- Grep contract (run every phase): grep -rniE "howitzer|infantry|helicopter|landing_craft|pistol|commando" src/ must be empty.
- Meshy key: C:\Claude\.credentials\meshy.key + MESHY_API_KEY env (balance ~700cr). Blender 5.1
  headless renderer: meshy_test/render_frames.py (config-driven).
- Single-file plan (Phase G): add loader shims (window.__GAME_DATA__/__ASSETS__ else fetch) to
  main.js + sprites.js, then build_singlefile.py (esbuild bundle + base64 data-URIs). Asset diet
  (Phase F) first: downscale 256px + WebP → <2MB.

## DONE (verified this session, 2026-07-07)
- Live screenshot test → game verified as a working vertical slice; STATUS/FINISH_PLAN/ROADMAP
  written + committed + OneDrive-mirrored; research done; Confluence eval page 82935817.
- **Phase A (rename) DONE @70ceee9**: GAME_TITLE='SHORE PATROL' constant in main.js drives menu +
  tab + README; internal ids/folder/localStorage unchanged; grep clean. Verified tab+menu title.
- **Phase B (presentation) DONE @70ceee9**: full-bleed canvas (removed DOM chrome, image-rendering
  auto), F fullscreen, menu subtitle+legend, HUD +40% w/ shadows, stronger active-weapon pip.
  Verified: canvas fills viewport height, mouse-aim-at-center still hits (tank 120→116), 0 errors.
- NAME is still a Blaine gate: "SHORE PATROL" is a placeholder; confirm before public publish.

## UNVERIFIED
- (none)

## DECISIONS
- 2026-07-07 Single-file = build OUTPUT, keep source multi-file (loader shims + build script). Why:
  preserves the data-driven dev architecture; data-URIs avoid file:// canvas taint.
- 2026-07-07 Asset diet via 256px downscale + WebP targets ~2MB → single file <3MB (Poki <8MB bar).
- 2026-07-07 Rename required before monetize; mechanics are free to clone, the name is not.
- 2026-07-04 No real-3D/Three.js/physics (RESEARCH_3D 80773129) — buys nothing in a fixed-turret game.

## Session log
| Date | Model | What happened (1 line) | Confluence ver |
|---|---|---|---|
| 2026-07-10 | Opus 4.8 | R8.4: d=0.55 floats whole hull (0.40 beached the bow on the sloped waterline); removed ridiculous vector guns; player-facing-gun re-render attempted + abandoned (fused mesh + broadside foreshortening); DEPLOYED clean ship | (pending) |
| 2026-07-10 | Opus 4.8 | R8.3: battleship floats offshore (d 0.20→0.40, was beached) + main guns trained on player (barbette domes + player-facing barrels + tip muzzle flash); DEPLOYED | (pending) |
| 2026-07-10 | Opus 4.8 | R8.2: z-order — boss ship draws before foreground so crates/enemies render in front (split Bosses.draw/drawHud); fixed a double-draw I introduced; DEPLOYED | (pending) |
| 2026-07-10 | Opus 4.8 | R8.1 @b6cac27: lowered battleship into the water (d 0.52→0.20); diagnosed "ship in sky" as STALE DEPLOY (live was R6); **DEPLOYED R7+R8+R8.1 to shore-patrol.web.app**, live-verified horizontal+low | (pending) |
| 2026-07-10 | Opus 4.8 | R8 @823a8f7: fixed battleship section hitboxes (were on the sand, bridge on hull side) via SHIP_FEATURES single-source-of-truth; damage FX = scorch+fire+smoke+embers + damaged-hull swap; verified | (pending) |
| 2026-07-10 | Opus 4.8 | R7 @17e60fa: battleship glides in from right & holds offshore, cannon muzzle-flashes+shells, tide/whitecaps match painted waterline, new tripod MG icon; verified, NOT yet deployed | (pending) |
| 2026-07-07 | Opus 4.8 | Full eval + FINISH_PLAN + ROADMAP + research; eval page 82935817; about to execute A/B | eval p.82935817 |
| 2026-07-04 | Fable 5 | Round-3 playtest fixes + craft-only landings + pause (@4af11d7) | main p.80511033 v1.5 |
| 2026-07-04 | Fable 5 | Phase 1 pre-rendered 3D sprites (Meshy+Blender) + Phase 2 polish | v1.3, v1.4 |
| 2026-07-03 | Fable 5 | v1 build + judge fixes + ComfyUI sprite pass | v1.0–v1.2 |
