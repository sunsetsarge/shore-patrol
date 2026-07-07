# STATE — Beachhead (browser game)

Updated: 2026-07-07 (session-handoff wrap)
Status: ACTIVE
Phase: Executing FINISH_PLAN.md — Phase A (rename) + Phase B (presentation), of 8 (A–H)

## NEXT ACTION
Execute FINISH_PLAN.md Phase A then Phase B: (A) replace the user-visible title "BEACHHEAD" with
the shipping name in index.html + src/main.js menu + browser tab + README (leave repo folder +
internal ids alone; acceptance = new title in menu & tab, `grep -rin beachhead src/ index.html`
finds only non-display refs, zero console errors); (B) make the 1280×720 canvas scale to fill the
viewport preserving 16:9 (object-fit contain, dark letterbox, full-viewport wrapper), add F
fullscreen, enlarge HUD ~40% with text-shadow, polish menu (acceptance = fills window at 1920×1080
& 1280×720, mouse aim still lands on target via debugStep probe, F toggles fullscreen, before/after
screenshots, zero console errors).

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
- Live screenshot test (menu/combat/death/pause) — game verified as a working vertical slice.
- STATUS.md, FINISH_PLAN.md (8 phases, lesser-model-executable), ROADMAP.md written + committed
  (@70ae684) + mirrored to OneDrive.
- Research complete (verified URLs): no finishable clone; itch takes lone .html; ZzFX audio;
  juice refs; portal size bars (Poki <8MB init tightest).
- Confluence eval page 82935817 created (renders correctly via html contentFormat).

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
| 2026-07-07 | Opus 4.8 | Full eval + FINISH_PLAN + ROADMAP + research; eval page 82935817; about to execute A/B | eval p.82935817 |
| 2026-07-04 | Fable 5 | Round-3 playtest fixes + craft-only landings + pause (@4af11d7) | main p.80511033 v1.5 |
| 2026-07-04 | Fable 5 | Phase 1 pre-rendered 3D sprites (Meshy+Blender) + Phase 2 polish | v1.3, v1.4 |
| 2026-07-03 | Fable 5 | v1 build + judge fixes + ComfyUI sprite pass | v1.0–v1.2 |
