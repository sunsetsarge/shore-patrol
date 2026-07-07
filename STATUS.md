# Beachhead — Status Evaluation (2026-07-07)

Verified by live screenshot test (menu / combat / death / pause) + codebase measurement.
This is the honest "where is it" snapshot. The finish plan is FINISH_PLAN.md; the content
roadmap is ROADMAP.md.

## One-line verdict

A **complete, verified vertical slice** — the whole arcade loop works and looks good — but
it is **not yet a shippable product** and, critically, **not the single HTML file the goal
requires.** It is a multi-file dev build. Getting to "one distributable, monetizable .html"
is roughly a **2–3 focused-session job**, most of which is packaging + polish + a rename, not
new mechanics.

## Where it is in development

| Dimension | State |
|---|---|
| Core loop | ✅ Done & verified (menu→play→pause→gameover→restart) |
| Content breadth | 🟡 Thin: 6 enemy types, 4 weapons, 5 hand-authored waves + endless loop |
| Art | ✅ Good: pre-rendered 3D sprites (Meshy→Blender), animated walks/deaths, painted BG |
| Game feel / juice | 🔴 Minimal: basic muzzle flash + explosion; no screenshake, hit-flash, particles |
| Balance | 🔴 Unturned against real play; difficulty curve untested |
| Progression / depth | 🔴 None: pure score-attack, no upgrades/meta |
| Presentation | 🟡 Canvas is fixed-size, letterboxed, doesn't fill window; HUD text small |
| Audio | 🟡 Functional Web-Audio synth, but thin/repetitive |
| Distribution | 🔴 **Multi-file** (15 JS modules + 4 JSON + 54 PNGs, 7.5 MB); won't run from file:// |
| Monetization readiness | 🔴 Blocked on: single-file build, asset-size diet, **name (trademark)**, ad/save shim |

## What works (verified live)

- **State machine**: menu, playing, paused (ESC/P + M-to-menu), gameover, restart — no reload needed.
- **4 weapons**, data-driven via a `fireMode` registry: MG (auto hitscan), howitzer (ballistic + splash), SAM (homing, air-only lock), pistol (infinite hitscan). Number keys + Q/E/wheel cycle. Per-weapon ammo + empty-flash.
- **Ammo economy**: crates parachute in, color-tinted per weapon (yellow/orange/blue), shoot-to-collect, refill-capped, lost-on-landing.
- **6 enemy types** across land/sea/air via a `movement` registry (straight_approach, strafe_weave, hover_and_dive, land_then_disgorge): infantry, tank, landing_craft, helicopter, commando, commando_craft.
- **Craft-only troop delivery**: foot troops arrive only by landing craft, disgorge at the waterline at the craft's x; killing a craft at sea spawns nothing.
- **Death animations**: soldiers play a one-shot shot-and-fall; dying entities can't be re-hit or damage the base.
- **Turret weapon rack**: all 4 weapons modeled and visible bottom-right; active one rises with a color glow + recoil.
- **Wave director**: 5 escalating waves then endless final-wave loop at +15%/cycle.
- **Scoring**: kill points + streak multiplier (resets on base damage), localStorage best score.
- **Audio**: Web Audio synth SFX per event; AudioContext on first gesture.
- **Architecture contract HELD**: all content in /data/*.json; zero enemy/weapon id literals in src/ (grep-verified every commit). Adding content = editing JSON.

## What's missing / broken (the honest gap list)

1. **NOT single-file** — the headline blocker. ES modules + `fetch()` JSON + 54 external PNGs. Fails from `file://` (module + fetch CORS). 7.5 MB of assets.
2. **Asset size** — 7.5 MB raw → ~10 MB if naively base64-inlined. Poki wants <8 MB *initial download*; CrazyGames <50 MB; itch.io is lenient (<500 MB). Needs a downscale + WebP diet (target ~2 MB).
3. **Name risk** — "Beach Head" is a real trademark (Access Software 1983; "Beach Head 2000" is Digital Fusion). Mechanics are free to clone; **the name is not.** Must rename before any monetized publish.
4. **No juice** — the single highest ROI polish. No screenshake, hit-flash, impact particles, tracer variety, camera kick, or hit-stop.
5. **No progression** — no between-run upgrades, no in-run power-ups; nothing pulls a player back for run 2.
6. **No boss** — the `behaviorScript` seam exists but is unused.
7. **Presentation** — canvas letterboxed with big black margins; not responsive; HUD text tiny; no fullscreen; no mobile/touch.
8. **No settings** (mute/volume), no how-to-play/controls screen beyond the one-line footer.
9. **Balance untuned** — 5 waves defined; difficulty ramp never tuned against real play; endless loop may spike or stall.
10. **Helicopter rotor is static** (single sub-frame; doesn't spin).
11. **No ad/save SDK shim** — portals (CrazyGames/Poki/GameDistribution) mandate their own SDK for ads + require a save/progress system.

## Reusable references found (research, verified URLs)

- **straker Missile Command gist** (CC0, public domain) — loop/entity/input scaffold, closest template: https://gist.github.com/straker/afc4e2a30b6df772a5f9f6ef01751d41
- **tank-u** (MIT, Phaser) — turret-vs-tank targeting reference: https://github.com/ldmcdaniel/tank-u
- **Juice**: Vlambeer "Art of Screenshake" https://www.youtube.com/watch?v=AJdEqssNZ-U · "Juice it or Lose it" live demo http://grapefrukt.com/f/games/juicy-breakout/ (src https://github.com/grapefrukt/juicy-breakout) · Eiserloh "Juicing Your Cameras" https://www.youtube.com/watch?v=tu-Qe66AvtY
- **Single-file**: vite-plugin-singlefile https://github.com/richardtallent/vite-plugin-singlefile · data-URI inlining (avoids file:// canvas tainting) https://css-tricks.com/data-uris/
- **Audio**: ZzFX (sub-1KB one-function synth, MIT) https://github.com/KilledByAPixel/ZzFX · jsfxr https://github.com/chr15m/jsfxr
- **Monetization**: itch.io HTML5 (takes single .html) https://itch.io/docs/creators/html5 · CrazyGames reqs https://docs.crazygames.com/requirements/intro/ · Poki reqs https://sdk.poki.com/requirements · GameDistribution (33% rev-share) https://gamedistribution.com/developers/partnership/
- Mechanics-not-copyrightable confirmation + original game: https://en.wikipedia.org/wiki/Beach_Head_2000
