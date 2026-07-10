# STATE — Beachhead (browser game)

Updated: 2026-07-10 (Round 8 committed @823a8f7, NOT yet deployed — BATTLESHIP HITBOXES + DAMAGE
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
- LIVE: https://shore-patrol.web.app — DEPLOYED 2026-07-09 @da98ac9 (R4-R6). **R7 @17e60fa AND
  R8 @823a8f7 are committed but NOT yet deployed** — one `firebase deploy --only hosting` pushes
  both (battleship behavior/tide/MG + hitbox/damage-FX fixes) live (no-cache headers make it instant).
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
| 2026-07-10 | Opus 4.8 | R8 @823a8f7: fixed battleship section hitboxes (were on the sand, bridge on hull side) via SHIP_FEATURES single-source-of-truth; damage FX = scorch+fire+smoke+embers + damaged-hull swap; verified, NOT yet deployed | (pending) |
| 2026-07-10 | Opus 4.8 | R7 @17e60fa: battleship glides in from right & holds offshore, cannon muzzle-flashes+shells, tide/whitecaps match painted waterline, new tripod MG icon; verified, NOT yet deployed | (pending) |
| 2026-07-07 | Opus 4.8 | Full eval + FINISH_PLAN + ROADMAP + research; eval page 82935817; about to execute A/B | eval p.82935817 |
| 2026-07-04 | Fable 5 | Round-3 playtest fixes + craft-only landings + pause (@4af11d7) | main p.80511033 v1.5 |
| 2026-07-04 | Fable 5 | Phase 1 pre-rendered 3D sprites (Meshy+Blender) + Phase 2 polish | v1.3, v1.4 |
| 2026-07-03 | Fable 5 | v1 build + judge fixes + ComfyUI sprite pass | v1.0–v1.2 |
