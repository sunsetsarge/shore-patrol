# Beachhead — FINISH PLAN (executable by a lesser model)

**Goal:** take the game from "verified vertical slice" to "one distributable, monetizable
HTML file." This plan is written as ordered phases of concrete, checkable steps. Do phases in
order. Do not skip acceptance criteria. Do NOT break the data-driven contract (no
enemy/weapon id string literals in `src/` — run the grep check in every phase).

## How to work this plan (read first)

- **Repo:** `C:\Claude\Projects\Active\Beachhead`. Run the game with `play.bat` (serves on
  http://localhost:8123). Never open via `file://` during dev — ES modules + fetch need http.
- **Verification harness (already built):** the game exposes `window.game` and
  `window.game.debugStep(n)` (advances N fixed-timestep ticks then renders once). Hidden
  browser tabs suspend `requestAnimationFrame`, so ALL headless verification must drive
  `debugStep`, never wall-clock. Example probe:
  `game.input.queue.push({type:'confirm'}); game.debugStep(1)` starts a run.
- **Cache trap:** the python dev server caches aggressively. After editing any module, in the
  browser console run `await fetch('/src/<file>.js',{cache:'reload'})` for each changed file
  BEFORE `location.reload()`, or you will verify stale code.
- **Grep contract (run after every phase):**
  `grep -rniE "howitzer|infantry|helicopter|landing_craft|pistol|commando" src/` must return
  nothing (exit 1). Content ids live only in `/data/*.json`.
- **Syntax check:** `node --check <file>` on every edited `.js`.
- **Commit** at the end of each phase with a clear message. Do not `git add -A` blindly — the
  `.gitignore` excludes `meshy_test/*.glb`; keep it that way.
- **Definition of done for a step** = its acceptance criteria pass in the RUNNING game, not
  "the code looks right." Verify, don't assume.

---

## PHASE A — Rename & IP-clean (unblocks monetization; ~30 min)

**Why:** "Beach Head" is a live trademark. Mechanics are free to clone; the name is not.
Everything downstream (publishing, store pages) needs the final name, so do this first.

**A1.** Pick the shipping name. Default: **"SHORE PATROL"** (evocative, unclaimed-sounding,
same beat). If unsure, leave a `NAME_CANDIDATES.md` with 5 options and use SHORE PATROL as
placeholder. (Human/Blaine confirms before public publish — flag it, don't block.)

**A2.** Replace the display title everywhere it's user-visible (NOT internal ids):
- `index.html` `<title>` and any heading.
- `src/main.js` menu render (`ctx.fillText('BEACHHEAD', ...)`) and the browser tab title.
- `README.md` H1.
- Do a case-insensitive search for the literal `BEACHHEAD`/`Beachhead` in `src/` and
  `index.html` and swap the *display* strings. Leave the repo folder name alone (internal).

**Acceptance A:** menu shows the new title; browser tab shows the new title; `grep -rin
beachhead src/ index.html` returns only comments/non-display references (or none). Game still
runs with zero console errors.

---

## PHASE B — Presentation (make it look like a product; ~1–2 hr)

**Why:** every screenshot shows the canvas fixed-size, letterboxed with big black margins,
tiny HUD text. This is the difference between "tech demo" and "game" at first glance.

**B1. Responsive scaling.** In `index.html` + a small block in `src/main.js`:
- Keep the internal canvas resolution at 1280×720 (the whole projection math assumes it — do
  NOT change internal coordinates).
- Add CSS so the canvas element scales to fill the viewport while preserving 16:9 aspect
  (letterbox with a dark, non-jarring color, not raw black): `canvas { width: 100%; height:
  100%; object-fit: contain; image-rendering: auto; }` inside a full-viewport fl/grid wrapper;
  `html,body { margin:0; height:100%; background:#0a0e12; overflow:hidden; }`.
- Ensure mouse input still maps correctly: `input.js` already converts client→canvas coords
  via `getBoundingClientRect()` scale — verify it still works after the CSS change (it
  should; that's why it was written that way).

**B2. Fullscreen toggle.** Add an `F` key (input.js emits `{type:'fullscreen'}`) that calls
`canvas.requestFullscreen()` / `document.exitFullscreen()`. Add a small "⛶" hint to the menu.

**B3. HUD legibility.** In `src/systems/hud.js`, increase font sizes ~40% and add a subtle
text shadow/outline (draw text twice: dark offset then light) so the score/wave/defense read
against the bright sky. Keep the weapon pips but make the active-weapon highlight stronger.

**B4. Menu polish.** Center the title block; add a one-line subtitle, the best score, and a
compact controls legend (Mouse aim · Hold LMB fire · 1-4 weapons · P pause · F fullscreen).

**Acceptance B:** at 1920×1080 and at 1280×720 browser sizes the game fills the window with
clean letterbox bars; mouse aim still lands on target (spawn an entity, aim at its center via
a `debugStep` probe, confirm a hit); F toggles fullscreen; HUD text is legible in a
screenshot; zero console errors. Take before/after screenshots.

---

## PHASE C — Juice pass (highest ROI for "feel"; ~2–3 hr)

**Why:** this is what makes an arcade shooter feel good. Reference talks (watch/skim):
Vlambeer "Art of Screenshake" (https://www.youtube.com/watch?v=AJdEqssNZ-U), "Juice it or
Lose it" live demo (http://grapefrukt.com/f/games/juicy-breakout/). Implement these as
generic engine effects — NO per-enemy/weapon id branching.

**C1. Screenshake.** Add a `game.shake` scalar (0..1). In the render, translate the whole
world draw by `(rand(-1,1)*shake*MAX, rand(-1,1)*shake*MAX)` with `MAX≈14px`; decay `shake`
toward 0 each tick (`shake *= 0.88`). Trigger: `game.shake = max(game.shake, k)` on — howitzer
impact (k=1.0), any explosion (0.7), MG fire (0.06 tiny), base damage (0.9). Read the trigger
magnitudes from a small `data/juice.json` so they're tunable without code.

**C2. Hit-flash.** When an enemy takes damage, set `entity.hitFlash = 0.12`; in the renderer,
if `hitFlash>0`, draw the sprite tinted white (drawImage then a white `globalCompositeOperation
= 'lighten'` overlay of the same sprite at `alpha=hitFlash*factor`), decay each tick. Generic,
sprite-agnostic.

**C3. Impact particles.** Add a tiny particle system (array of `{x,y,vx,vy,life,color,size}`
in world space, integrated + drawn generically). Spawn: small dust puff on land-unit hits,
spark burst on vehicle hits, water splash on sea hits, debris ring on explosions. Cap at ~300
particles. Drive counts/colors from `data/juice.json`.

**C4. Muzzle & recoil upgrade.** Bigger, brighter muzzle flash; the turret rack's active
weapon already recoils — increase the kick and add a 1-frame bright barrel flash sprite. Add a
short tracer streak for the MG.

**C5. Hit-stop (optional, powerful).** On howitzer impact / big kills, freeze the sim for
~40 ms (skip 2–3 update ticks but keep rendering) for a punchy feel. Gate behind a
`data/juice.json` flag.

**C6. Score popups.** On kill, spawn a floating `+N` text at the enemy position that rises and
fades (generic, reads `scoreValue` from the def).

**Acceptance C:** firing the howitzer visibly shakes the screen and throws particles; hit
enemies flash white; kills spawn floating score text; MG has tracers; all magnitudes are in
`data/juice.json` and changing a value changes the effect on reload; performance stays smooth
with ~40 entities + particles (check no frame stalls via a `debugStep(600)` timing probe);
grep contract intact; zero console errors. Screenshot mid-explosion.

---

## PHASE D — Audio expansion (~1 hr)

**Why:** current synth is thin/repetitive. Reference: ZzFX (sub-1KB one-function synth, MIT,
https://github.com/KilledByAPixel/ZzFX) — ideal for a one-file game.

**D1.** Either (a) expand the existing `src/audio.js` synth registry with more distinct
timbres + slight pitch randomization per shot (cheap, keeps current structure), OR (b) vendor
ZzFX (one function, paste inline) and re-author each cue with the zzfx.3d2k.com tool. Prefer
(a) for continuity unless the timbres still feel weak, then (b).

**D2.** Add missing cues: distinct per-weapon fire, enemy-specific hit vs death, low-defense
alarm loop, wave-start sting, crate-collect chime, UI click, game-over. Pitch-vary repeated
sounds (±5%) so rapid fire doesn't machine-gun the exact same sample.

**D3.** Add a **mute toggle** (`M` is taken by menu; use `` ` `` or a HUD speaker icon) +
master volume, persisted to localStorage.

**Acceptance D:** each event has an audible, distinct sound; rapid MG fire doesn't sound
robotically identical; mute toggle works and persists across reload; no audio errors in console.

---

## PHASE E — Balance, settings, onboarding (~1–2 hr)

**E1. How-to-play screen.** Add a `menu → help` sub-screen (H from menu) with a diagram of
the controls + weapon roles (MG=infantry, howitzer=armor/clusters, SAM=air, pistol=backup) +
the crate mechanic. Canvas-drawn, back with H/Esc.

**E2. Difficulty tuning.** Play (or `debugStep`-simulate) all 5 waves + 3 endless loops.
Verify: wave 1 is survivable by a new player; difficulty ramps smoothly; the endless loop
neither trivially stalls nor instantly overwhelms. Adjust `data/waves.json` counts/intervals
and `data/enemies.json` hp/speed only — no code. Document the intended curve in a comment
block at the top of `waves.json`.

**E3. Settings persistence.** Volume, mute, and best score persist via localStorage under a
single `beachhead.settings` key (namespaced; don't scatter keys).

**Acceptance E:** a first-time player can understand controls from the help screen; a full
5-wave run is winnable-ish and the endless loop is a real challenge curve (document your
tuning); settings survive reload.

---

## PHASE F — Asset diet (prep for single-file; ~1–2 hr)

**Why:** 7.5 MB raw assets → ~10 MB base64. Target **< 2 MB total** so the single file is
< ~3 MB (Poki wants < 8 MB *initial*; this leaves headroom). This is mechanical image work.

**F1. Downscale.** Sprites render at most ~150 px on screen but the PNGs are 512 px tall.
Downscale every frame in `assets/frames/` and `assets/turret/` to **max 256 px** on the long
edge (LANCZOS). Backgrounds: keep at 1280×720 (full-screen) but re-compress.

**F2. Re-encode to WebP.** Convert all PNGs to WebP (lossless or high-quality lossy q=90).
Modern canvas `drawImage` handles WebP fine. This is the big win — typically 60–80% smaller
than PNG. Keep the same base filenames but `.webp` (update the `sprite`/`turretSprite`/
`background` paths in `data/*.json` and the background constant).
- Use `C:\AI-Shared\python.exe` + PIL: `Image.open(p).convert('RGBA').resize(...).save(out,
  'WEBP', quality=90, method=6)`.

**F3. Measure.** After conversion, `du -sh assets` must be **< 2 MB**. If not, drop
background quality and reduce animation frame counts (8→6 walk frames is invisible in motion).

**F4. Verify in-game.** Reload; every sprite still loads (the loader checks `naturalWidth>0`);
vector fallback still triggers for any missing asset. No visual regression at play scale.

**Acceptance F:** `du -sh assets` < 2 MB; game looks the same at play scale (screenshot
compare); all sprites load (probe `Sprites.get(path)` for every data path returns non-null);
grep + console clean.

---

## PHASE G — Single-file build pipeline (THE CRUX; ~2–3 hr)

**Why:** the whole goal. Produce **one `beachhead.html`** that runs by double-click (file://),
no server, no external files. Keep the multi-file source for dev; the single file is a *build
output*.

**Strategy (chosen): a scripted inliner. Keep source multi-file; generate the single file.**
Write `build_singlefile.py` (Python, uses only stdlib + `esbuild` if available; if esbuild
isn't installed, fall back to a manual module concatenator — see G3). Steps the script does:

**G1. Bundle JS.** Resolve the ES-module import graph starting at `src/main.js` into ONE
IIFE. Preferred: `esbuild src/main.js --bundle --format=iife --outfile=_bundle.js` (esbuild is
a single binary, no config; install note in the script header). If esbuild is unavailable,
G3's manual concatenator.

**G2. Embed data + assets (kill all fetch/network).**
- Read each `data/*.json`, emit `window.__GAME_DATA__ = { weapons:{...}, enemies:{...},
  waves:{...}, crates:{...}, juice:{...} }` as a JS literal.
- Read each asset in `assets/**`, base64-encode, build `window.__ASSETS__ = { "assets/frames/
  x.webp": "data:image/webp;base64,...", ... }`.
- **Loader shims (add these to source now, so dev and build both work):**
  - In `src/main.js` `loadData()`: if `window.__GAME_DATA__` exists, use it; else `fetch` (dev).
  - In `src/engine/sprites.js` `preload()/get()`: if `window.__ASSETS__[path]` exists, set
    `img.src` to the data-URI; else `img.src = path` (dev). This is a ~6-line change and MUST
    be done before the build works.
- Data-URIs are same-origin, so they do NOT taint the canvas under `file://` (this is exactly
  why we inline rather than ship a folder). Ref: https://css-tricks.com/data-uris/

**G3. Assemble.** Emit `dist/beachhead.html`: `<!doctype html><html><head><meta charset><title>
…</title><style>…(the responsive CSS from Phase B)…</style></head><body><canvas
id="game-canvas" width=1280 height=720></canvas><script>window.__GAME_DATA__=…;
window.__ASSETS__=…; …bundled IIFE…</script></body></html>`. Order matters: DATA + ASSETS
globals BEFORE the bundle.
- Manual-concat fallback (no esbuild): topologically order the modules by their imports,
  strip `import`/`export` lines, wrap each in a closure that assigns to a shared namespace, and
  concatenate. Slower to write but zero-dependency. Document which path was used.

**G4. Test the artifact.** Open `dist/beachhead.html` by DOUBLE-CLICK (real `file://`, not the
server). Full playthrough: menu→play→pause→gameover→restart, all weapons fire, sprites render,
audio plays after first click, best score persists. Zero console errors. **This is the
acceptance gate for the whole project.**

**G5. Size check.** `dist/beachhead.html` should be **< 3 MB** after Phase F. Record the size.

**Acceptance G:** `dist/beachhead.html` opened from `file://` (double-click) is fully
playable with zero console errors and no network requests (check DevTools Network tab shows
only the html itself); file < 3 MB; the multi-file dev build still works unchanged (the shims
fall back to fetch). Commit the build script + the shims (not the dist output — gitignore
`dist/`).

---

## PHASE H — Monetization prep & publish (~1–2 hr + human gate)

**H1. itch.io build (the single-file path).** itch.io accepts a lone `.html` uploaded
directly (https://itch.io/docs/creators/html5). This is the primary distributable. Prepare:
a 630×500 cover image (use a nice in-game screenshot), a short description, tags (arcade,
shooter, html5), and set "This file will be played in the browser." Pay-what-you-want.
**Human gate:** Blaine creates the account & clicks publish (per safety rules, the agent does
not create accounts or publish).

**H2. Ad/save shim (for portals later, don't fully build yet).** Add a thin
`src/services/platform.js` adapter with no-op default implementations of: `adPreroll()`,
`adInterstitial()` (call between waves), `adRewarded(cb)` (for a future "continue" revive),
`saveProgress(obj)`/`loadProgress()`. Wire the game to call these at the right moments now
(no-ops in the itch build). Later, per-portal builds swap the shim for CrazyGames/Poki/
GameDistribution SDKs. This means zero game-code changes to add a portal later.

**H3. PWA (optional).** Add a `manifest.webmanifest` + tiny service worker so the single file
is installable/offline. Doesn't monetize, but makes "distribute" nicer.

**Acceptance H:** itch.io upload package (html + cover + copy) assembled in `dist/itch/` ready
for Blaine to publish; `platform.js` shim exists and is called at ad/save points (verify the
no-ops fire via console logs at wave transitions); documented per-portal size bars (itch
<500MB · CrazyGames <50MB init · **Poki <8MB init** · GameDistribution SDK + 33% rev-share).

---

## Global acceptance (project "done")

1. `dist/beachhead.html` runs fully from a double-click (`file://`), zero console errors, no
   network calls, < 3 MB. ← the single most important gate.
2. Game looks like a product: fills the window, legible HUD, juicy feedback, distinct audio.
3. Renamed off "Beach Head"; IP-clean for monetization.
4. Data-driven contract intact (grep clean); dev multi-file build still works.
5. itch.io package assembled; portal ad/save shim in place for later.
6. STATUS/plan/roadmap + Confluence updated.

## Suggested execution order for a lesser model

A → B → C → D → E → F → G → H. A/B/F/G are mechanical and safe to delegate to a cheap model.
C (juice) and E (balance) benefit from a mid-tier model + screenshot verification. Each phase
is independently committable and independently verifiable — do not batch phases; verify each
before moving on.
